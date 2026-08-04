import { NextResponse } from "next/server";
import { query } from "@/lib/redshift";

// ─── Sprint 11 — Auditoría desde vista materializada mv_cc_auditoria ───────────────────────
// Solo MX y CO tienen datos (hasta ~Abr/May 2026). Si el mes pedido no existe,
// se usa el último mes disponible (fallback) y se informa cuál.

const MESES = ["Ene","Feb","Mar","Abr","May","Jun","Jul","Ago","Sep","Oct","Nov","Dic"];
const PAIS_COD: Record<string, string> = { "MÉXICO": "MX", "MEXICO": "MX", "COLOMBIA": "CO", "PERÚ": "PE", "PERU": "PE", "CHILE": "CL", "ARGENTINA": "AR" };

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const year = parseInt(searchParams.get("year") || String(new Date().getFullYear()));
  const month = parseInt(searchParams.get("month") || String(new Date().getMonth() + 1));

  try {
    // ¿existe el periodo pedido?
    const chk = await query(
      "SELECT COUNT(*) AS n FROM miniso_dlh.public.mv_cc_auditoria WHERE anio = $1 AND mes = $2",
      [year, month]
    );
    let y = year, m = month, fallback = false;
    if (!chk[0] || Number(chk[0].n) === 0) {
      const mx = await query("SELECT anio, mes FROM miniso_dlh.public.mv_cc_auditoria ORDER BY anio DESC, mes DESC LIMIT 1", []);
      if (mx[0]) { y = Number(mx[0].anio); m = Number(mx[0].mes); fallback = true; }
    }

    const rows = await query("SELECT * FROM miniso_dlh.public.mv_cc_auditoria WHERE anio = $1 AND mes = $2", [y, m]);
    const data: Record<string, Record<string, number | null>> = {};
    for (const row of rows) {
      const cod = PAIS_COD[String(row.pais).toUpperCase()] || String(row.pais);
      const clean: Record<string, number | null> = {};
      for (const k of Object.keys(row)) {
        if (k === "pais" || k === "area" || k === "anio" || k === "mes") continue;
        const v = row[k];
        clean[k] = v == null || v === "" ? null : Number(v);
      }
      data[cod] = clean;
    }

    return NextResponse.json({
      ok: true,
      anioUsado: y, mesUsado: m, fallback,
      periodoUsado: `${MESES[m - 1]} ${y}`,
      data,
    });
  } catch (err) {
    return NextResponse.json({ ok: false, error: err instanceof Error ? err.message : "Error" });
  }
}
