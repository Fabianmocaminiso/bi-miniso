import { NextResponse } from "next/server";
import { query } from "@/lib/redshift";

// ─── Sprint 12 — API genérica para las 7 vistas materializadas de la Cabina ────
// GET /api/mv?area=<area>&year=YYYY&month=M
// area ∈ finanzas | operaciones | comercial | logistica | marketing | rh | auditoria
//
// Fallback POR PAÍS: si el país no tiene el mes pedido, se usa su último mes
// disponible (≤ el pedido si existe, si no el más reciente). Así Colombia no
// desaparece cuando México ya cargó un mes más nuevo.

const MESES = ["Ene","Feb","Mar","Abr","May","Jun","Jul","Ago","Sep","Oct","Nov","Dic"];

const MV: Record<string, string> = {
  finanzas:    "miniso_dlh.public.mv_cc_finanzas",
  operaciones: "miniso_dlh.public.mv_cc_operaciones",
  comercial:   "miniso_dlh.public.mv_cc_comercial",
  logistica:   "miniso_dlh.public.mv_cc_logistica",
  marketing:   "miniso_dlh.public.mv_cc_marketing",
  rh:          "miniso_dlh.public.mv_cc_rh",
  auditoria:   "miniso_dlh.public.mv_cc_auditoria",
};

const PAIS_COD: Record<string, string> = {
  "MÉXICO": "MX", "MEXICO": "MX", "COLOMBIA": "CO",
  "PERÚ": "PE", "PERU": "PE", "CHILE": "CL", "ARGENTINA": "AR",
};

export async function GET(request: Request) {
  const { searchParams: sp0 } = new URL(request.url);
  const area = String(sp0.get("area") || "").toLowerCase();
  const tabla = MV[area];
  if (!tabla) {
    return NextResponse.json({ ok: false, error: `área desconocida: ${area}` });
  }

  const { searchParams } = new URL(request.url);
  const year = parseInt(searchParams.get("year") || String(new Date().getFullYear()));
  const month = parseInt(searchParams.get("month") || String(new Date().getMonth() + 1));
  const perRef = year * 100 + month;

  try {
    // Último período disponible POR PAÍS: el más reciente que no exceda el
    // pedido; si el país no tiene nada anterior, su más antiguo disponible.
    const per = await query(
      `WITH p AS (
         SELECT pais, anio, mes, (anio * 100 + mes) AS periodo
         FROM ${tabla}
       )
       SELECT pais,
              COALESCE(MAX(CASE WHEN periodo <= $1 THEN periodo END), MIN(periodo)) AS periodo
       FROM p GROUP BY pais`,
      [perRef]
    );

    const data: Record<string, Record<string, number | string | null>> = {};
    const periodoPorPais: Record<string, string> = {};

    for (const row of per) {
      const paisRaw = String(row.pais);
      const cod = PAIS_COD[paisRaw.toUpperCase()] || paisRaw;
      const periodo = Number(row.periodo);
      if (!periodo) continue;
      const y = Math.floor(periodo / 100);
      const m = periodo % 100;

      const rows = await query(
        `SELECT * FROM ${tabla} WHERE pais = $1 AND anio = $2 AND mes = $3`,
        [paisRaw, y, m]
      );
      const r = rows[0];
      if (!r) continue;

      const clean: Record<string, number | string | null> = {};
      for (const k of Object.keys(r)) {
        if (k === "pais" || k === "area" || k === "anio" || k === "mes") continue;
        const v = r[k];
        if (v == null || v === "") { clean[k] = null; continue; }
        const n = Number(v);
        clean[k] = Number.isNaN(n) ? String(v) : n;
      }
      data[cod] = clean;
      periodoPorPais[cod] = `${MESES[m - 1]} ${y}`;
    }

    // Etiqueta agregada: el período más frecuente / más reciente entre países
    const etiquetas = Object.values(periodoPorPais);
    const periodoUsado = etiquetas.length
      ? Array.from(new Set(etiquetas)).join(" · ")
      : "";

    return NextResponse.json({
      ok: true, area, year, month,
      periodoPorPais, periodoUsado,
      paises: Object.keys(data),
      data,
    });
  } catch (err) {
    return NextResponse.json({ ok: false, error: err instanceof Error ? err.message : "Error" });
  }
}
