import { NextResponse } from "next/server";
import { query } from "@/lib/redshift";

interface FinCfg {
  schema: string; table: string;
  ventaCol: string; costoCol: string | null; tiendaCol: string;
  yearCol: string; monthCol: string; filter: string;
}

const CONFIGS: Record<string, FinCfg> = {
  MX: {
    schema: "miniso_dlh.analytics_mx_prod", table: "h_ventas_sap_mes",
    ventaCol: "total_vta_siva", costoCol: "costo_venta", tiendaCol: "sucursal",
    yearCol: "year", monthCol: "month",
    filter: "sucursal NOT LIKE 'ARIO %' AND sucursal NOT LIKE 'PREMIOS%'",
  },
  AR: {
    schema: "miniso_dlh.analytics_ar_prod", table: "h_ventas_sap_mes",
    ventaCol: "total_vta_siva", costoCol: "costo_venta", tiendaCol: "id_sucursal",
    yearCol: "year", monthCol: "month",
    filter: "id_sucursal LIKE 'AR%'",
  },
  CO: {
    schema: "miniso_dlh.analytics_co_prod", table: "h_punto_de_ventas",
    ventaCol: "ventasinimpuesto", costoCol: null, tiendaCol: "idsucursal",
    yearCol: "year", monthCol: "month",
    filter: "idsucursal NOT LIKE 'CEN-%' AND idsucursal NOT LIKE 'TESTER%' AND idsucursal NOT LIKE 'DEVOLUCIONES%' AND idsucursal NOT LIKE 'MERMA%'",
  },
  PE: {
    schema: "miniso_dlh.analytics_pe_prod", table: "h_punto_de_ventas",
    ventaCol: "ventasinimpuesto", costoCol: null, tiendaCol: "idsucursal",
    yearCol: "year", monthCol: "month",
    filter: "idsucursal LIKE 'PR02%' AND idsucursal LIKE '%-DI'",
  },
  CL: {
    schema: "miniso_dlh.analytics_cl_prod", table: "h_punto_de_ventas",
    ventaCol: "ventasinimpuesto", costoCol: null, tiendaCol: "idsucursal",
    yearCol: "year", monthCol: "month",
    filter: "idsucursal LIKE 'CL0%' AND idsucursal LIKE '%-DI'",
  },
};

const CURRENCY: Record<string, string> = { MX: "MXN", CO: "COP", PE: "PEN", CL: "CLP", AR: "ARS" };
const ML = ["Ene","Feb","Mar","Abr","May","Jun","Jul","Ago","Sep","Oct","Nov","Dic"];

type Row = Record<string, unknown>;
type MonthData = { ventas: number; costo: number | null; tiendas: number };
type MonthMap  = Record<number, MonthData>;

async function fetchYear(cfg: FinCfg, year: number): Promise<MonthMap> {
  try {
    const costoExpr = cfg.costoCol
      ? `SUM(${cfg.costoCol}) AS costo`
      : `NULL::NUMERIC AS costo`;
    const sql = `
      SELECT CAST(${cfg.monthCol} AS INTEGER) AS mes,
             SUM(${cfg.ventaCol})              AS ventas,
             ${costoExpr},
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
        costo:   r.costo != null ? Number(r.costo) : null,
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

function sumFinPeriod(data: Record<number, MonthMap>, segs: { yr: number; mes: number }[]) {
  let ventas = 0, costoAcc = 0, tiendas = 0, hasCosto = false;
  segs.forEach(({ yr, mes }) => {
    const r = data[yr]?.[mes];
    if (!r) return;
    ventas += r.ventas;
    if (r.costo != null) { costoAcc += r.costo; hasCosto = true; }
    tiendas = Math.max(tiendas, r.tiendas);
  });
  const costo  = hasCosto ? costoAcc : null;
  const ub     = hasCosto ? ventas - costoAcc : null;
  const ub_pct = ub != null && ventas > 0 ? (ub / ventas) * 100 : null;
  return { ventas, costo, tiendas, ub, ub_pct };
}

function buildPeriodLabel(year: number, month: number, mode: string): string {
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

  const countryResults: Record<string, unknown> = {};
  for (const c of countries) {
    const d    = allData[c];
    const cur  = sumFinPeriod(d, periodSegs(year, month, mode, "cur"));
    const priV = sumFinPeriod(d, periodSegs(year, month, mode, "pri")).ventas;
    const yoy  = priV > 0 ? ((cur.ventas - priV) / priV) * 100 : null;
    const segs = periodSegs(year, month, mode, "cur");

    const monthlyChart = segs.map(({ yr, mes }) => {
      const r     = d[yr]?.[mes];
      const rPri  = d[yr - 1]?.[mes];
      const curV  = r?.ventas ?? 0;
      const priV2 = rPri?.ventas ?? 0;
      const curUB = r?.costo != null ? curV - r.costo : null;
      const sfx   = mode === "udm" && yr !== year ? "'" + String(yr).slice(2) : "";
      return {
        label: ML[mes - 1] + sfx,
        ventas: curV, costo: r?.costo ?? null, ub: curUB,
        ub_pct: curUB != null && curV > 0 ? (curUB / curV) * 100 : null,
        py_ventas: priV2,
        pct: priV2 > 0 ? ((curV - priV2) / priV2) * 100 : null,
      };
    });

    countryResults[c] = {
      code: c, currency: CURRENCY[c], has_costo: CONFIGS[c].costoCol !== null,
      ventas: cur.ventas, costo: cur.costo, ub: cur.ub, ub_pct: cur.ub_pct,
      tiendas: cur.tiendas, py_ventas: priV, yoy_pct: yoy,
      monthlyChart,
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

  const ubPctChart = growthSegs.map(({ yr, mes }) => {
    const sfx = mode === "udm" && yr !== year ? "'" + String(yr).slice(2) : "";
    const row: Record<string, unknown> = { label: ML[mes - 1] + sfx };
    for (const c of ["MX","AR"]) {
      const r  = allData[c][yr]?.[mes];
      const ub = r?.costo != null ? r.ventas - r.costo : null;
      row[c]   = ub != null && r!.ventas > 0 ? (ub / r!.ventas) * 100 : null;
    }
    return row;
  });

  return NextResponse.json({
    ok: true,
    params: { year, month, mode, label: buildPeriodLabel(year, month, mode) },
    countries: countryResults,
    growthChart,
    ubPctChart,
  });
}