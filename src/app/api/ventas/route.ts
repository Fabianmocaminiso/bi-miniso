import { NextResponse } from "next/server";
import { query } from "@/lib/redshift";

interface CountryCfg {
  schema: string; table: string;
  ventaCol: string; piezasCol: string;
  tiendaCol: string;   // ID — COUNT DISTINCT + filter + GROUP BY
  nombreCol: string;   // display name en top tiendas
  yearCol: string; monthCol: string; filter: string;
}

const CONFIGS: Record<string, CountryCfg> = {
  MX: {
    schema: "miniso_dlh.analytics_mx_prod", table: "h_ventas_sap_mes",
    ventaCol: "total_vta_siva", piezasCol: "unidades",
    tiendaCol: "sucursal", nombreCol: "sucursal",
    yearCol: "year", monthCol: "month",
    filter: "sucursal NOT LIKE 'ARIO %' AND sucursal NOT LIKE 'PREMIOS%'",
  },
  AR: {
    schema: "miniso_dlh.analytics_ar_prod", table: "h_ventas_sap_mes",
    ventaCol: "total_vta_siva", piezasCol: "unidades",
    tiendaCol: "id_sucursal", nombreCol: "sucursal",
    yearCol: "year", monthCol: "month",
    filter: "id_sucursal LIKE 'AR%'",
  },
  CO: {
    schema: "miniso_dlh.analytics_co_prod", table: "h_punto_de_ventas",
    ventaCol: "ventasinimpuesto", piezasCol: "piezas",
    tiendaCol: "idsucursal", nombreCol: "nombre_sucursal",
    yearCol: "year", monthCol: "month",
    filter: "idsucursal NOT LIKE 'CEN-%' AND idsucursal NOT LIKE 'TESTER%' AND idsucursal NOT LIKE 'DEVOLUCIONES%' AND idsucursal NOT LIKE 'MERMA%'",
  },
  PE: {
    schema: "miniso_dlh.analytics_pe_prod", table: "h_punto_de_ventas",
    ventaCol: "ventasinimpuesto", piezasCol: "piezas",
    tiendaCol: "idsucursal", nombreCol: "nombre_sucursal",
    yearCol: "year", monthCol: "month",
    filter: "idsucursal LIKE 'PR02%' AND idsucursal LIKE '%-DI'",
  },
  CL: {
    schema: "miniso_dlh.analytics_cl_prod", table: "h_punto_de_ventas",
    ventaCol: "ventasinimpuesto", piezasCol: "piezas",
    tiendaCol: "idsucursal", nombreCol: "nombre_sucursal",
    yearCol: "year", monthCol: "month",
    filter: "idsucursal LIKE 'CL0%' AND idsucursal LIKE '%-DI'",
  },
};

const CURRENCY: Record<string, string> = { MX: "MXN", CO: "COP", PE: "PEN", CL: "CLP", AR: "ARS" };
const ML = ["Ene","Feb","Mar","Abr","May","Jun","Jul","Ago","Sep","Oct","Nov","Dic"];

type Row = Record<string, unknown>;
type MonthMap = Record<number, { ventas: number; piezas: number; tiendas: number }>;

async function fetchYear(cfg: CountryCfg, year: number): Promise<MonthMap> {
  try {
    const sql = `
      SELECT CAST(${cfg.monthCol} AS INTEGER) AS mes,
             SUM(${cfg.ventaCol})              AS ventas,
             SUM(${cfg.piezasCol})             AS piezas,
             COUNT(DISTINCT ${cfg.tiendaCol})  AS tiendas
      FROM ${cfg.schema}.${cfg.table}
      WHERE CAST(${cfg.yearCol} AS INTEGER) = $1
        AND ${cfg.filter}
      GROUP BY CAST(${cfg.monthCol} AS INTEGER)`;
    const rows = await query(sql, [year]) as Row[];
    const m: MonthMap = {};
    rows.forEach(r => {
      m[Number(r.mes)] = {
        ventas:  Number(r.ventas  ?? 0),
        piezas:  Number(r.piezas  ?? 0),
        tiendas: Number(r.tiendas ?? 0),
      };
    });
    return m;
  } catch { return {}; }
}

function periodSegs(year: number, month: number, mode: string, which: "cur" | "pri") {
  const s: { yr: number; mes: number }[] = [];
  if (mode === "ytd") {
    const y = which === "cur" ? year : year - 1;
    for (let m = 1; m <= month; m++) s.push({ yr: y, mes: m });
  } else {
    const base = which === "cur" ? year : year - 1;
    for (let m = month + 1; m <= 12; m++) s.push({ yr: base - 1, mes: m });
    for (let m = 1; m <= month; m++) s.push({ yr: base, mes: m });
  }
  return s;
}

function sumPeriod(data: Record<number, MonthMap>, segs: { yr: number; mes: number }[]) {
  let ventas = 0, piezas = 0, tiendas = 0;
  segs.forEach(({ yr, mes }) => {
    const r = data[yr]?.[mes];
    if (!r) return;
    ventas += r.ventas; piezas += r.piezas;
    tiendas = Math.max(tiendas, r.tiendas);
  });
  return { ventas, piezas, tiendas };
}

function buildTopSQL(cfg: CountryCfg, year: number, month: number, mode: string): string {
  const curW = mode === "ytd"
    ? `CAST(${cfg.yearCol} AS INTEGER) = ${year} AND CAST(${cfg.monthCol} AS INTEGER) <= ${month}`
    : `(CAST(${cfg.yearCol} AS INTEGER) = ${year} AND CAST(${cfg.monthCol} AS INTEGER) <= ${month})
       OR (CAST(${cfg.yearCol} AS INTEGER) = ${year - 1} AND CAST(${cfg.monthCol} AS INTEGER) > ${month})`;
  const priW = mode === "ytd"
    ? `CAST(${cfg.yearCol} AS INTEGER) = ${year - 1} AND CAST(${cfg.monthCol} AS INTEGER) <= ${month}`
    : `(CAST(${cfg.yearCol} AS INTEGER) = ${year - 1} AND CAST(${cfg.monthCol} AS INTEGER) <= ${month})
       OR (CAST(${cfg.yearCol} AS INTEGER) = ${year - 2} AND CAST(${cfg.monthCol} AS INTEGER) > ${month})`;
  return `
    WITH cy AS (
      SELECT ${cfg.tiendaCol}          AS id_tienda,
             MAX(${cfg.nombreCol})     AS nombre_tienda,
             SUM(${cfg.ventaCol})      AS ventas,
             SUM(${cfg.piezasCol})     AS piezas
      FROM ${cfg.schema}.${cfg.table}
      WHERE (${curW}) AND ${cfg.filter}
      GROUP BY ${cfg.tiendaCol}
    ),
    py AS (
      SELECT ${cfg.tiendaCol}          AS id_tienda,
             SUM(${cfg.ventaCol})      AS ventas
      FROM ${cfg.schema}.${cfg.table}
      WHERE (${priW}) AND ${cfg.filter}
      GROUP BY ${cfg.tiendaCol}
    )
    SELECT cy.nombre_tienda            AS tienda,
           cy.ventas, cy.piezas,
           COALESCE(py.ventas, 0)      AS py_ventas,
           CASE WHEN COALESCE(py.ventas,0) > 0
                THEN ((cy.ventas - py.ventas) / py.ventas) * 100.0
                ELSE NULL END          AS yoy
    FROM cy LEFT JOIN py ON cy.id_tienda = py.id_tienda
    ORDER BY cy.ventas DESC
    LIMIT 20`;
}

function periodLabel(year: number, month: number, mode: string): string {
  if (mode === "ytd") return `Ene-${ML[month - 1]} ${year}`;
  if (month === 12)   return `Ene-Dic ${year}`;
  return `${ML[month % 12]}` + "'" + `${String(year - 1).slice(2)}-${ML[month - 1]} ${year}`;
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const year  = parseInt(searchParams.get("year")  || String(new Date().getFullYear()));
  const month = parseInt(searchParams.get("month") || String(new Date().getMonth() + 1));
  const mode  = searchParams.get("mode") || "ytd";
  const countries = Object.keys(CONFIGS);

  const allData: Record<string, Record<number, MonthMap>> = {};
  await Promise.all(
    countries.flatMap(c =>
      [year, year - 1, year - 2].map(y =>
        fetchYear(CONFIGS[c], y).then(d => {
          if (!allData[c]) allData[c] = {};
          allData[c][y] = d;
        })
      )
    )
  );

  const allTop: Record<string, Row[]> = {};
  await Promise.all(
    countries.map(c =>
      query(buildTopSQL(CONFIGS[c], year, month, mode))
        .then(rows => { allTop[c] = rows as Row[]; })
        .catch(() => { allTop[c] = []; })
    )
  );

  const countryResults: Record<string, unknown> = {};
  for (const c of countries) {
    const d    = allData[c];
    const cur  = sumPeriod(d, periodSegs(year, month, mode, "cur"));
    const pri  = sumPeriod(d, periodSegs(year, month, mode, "pri"));
    const yoy  = pri.ventas > 0 ? ((cur.ventas - pri.ventas) / pri.ventas) * 100 : null;
    const segs = periodSegs(year, month, mode, "cur");

    const monthlyChart = segs.map(({ yr, mes }) => {
      const curV = d[yr]?.[mes]?.ventas ?? 0;
      const priV = d[yr - 1]?.[mes]?.ventas ?? 0;
      const sfx  = mode === "udm" && yr !== year ? "'" + String(yr).slice(2) : "";
      return { label: ML[mes - 1] + sfx, ventas: curV, py_ventas: priV };
    });

    countryResults[c] = {
      code: c, currency: CURRENCY[c],
      ventas: cur.ventas, piezas: cur.piezas, tiendas: cur.tiendas,
      py_ventas: pri.ventas, yoy_pct: yoy,
      monthlyChart,
      topTiendas: allTop[c].map(t => ({
        tienda:    String(t.tienda ?? ""),
        ventas:    Number(t.ventas    ?? 0),
        piezas:    Number(t.piezas    ?? 0),
        py_ventas: Number(t.py_ventas ?? 0),
        yoy:       t.yoy != null ? Number(t.yoy) : null,
      })),
    };
  }

  const growthSegs = periodSegs(year, month, mode, "cur");
  const growthChart = growthSegs.map(({ yr, mes }) => {
    const sfx = mode === "udm" && yr !== year ? "'" + String(yr).slice(2) : "";
    const row: Record<string, unknown> = { label: ML[mes - 1] + sfx };
    for (const c of countries) {
      const curV = allData[c][yr]?.[mes]?.ventas ?? 0;
      const priV = allData[c][yr - 1]?.[mes]?.ventas ?? 0;
      row[c] = priV > 0 ? ((curV - priV) / priV) * 100 : null;
    }
    return row;
  });

  return NextResponse.json({
    ok: true,
    params: { year, month, mode, label: periodLabel(year, month, mode) },
    latam: {
      tiendas: countries.reduce((s, c) => s + ((countryResults[c] as {tiendas:number}).tiendas || 0), 0),
      count: countries.length,
    },
    countries: countryResults,
    growthChart,
  });
}