import { NextResponse } from "next/server";
import { query } from "@/lib/redshift";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const pais   = searchParams.get("pais")   || "MX";
  const periodo = searchParams.get("periodo") || "mes_actual";

  try {
    // Ajusta los nombres de tablas/columnas a tu esquema real en Redshift
    const sql = `
      SELECT
        SUM(venta_neta)                                        AS facturacion_total,
        SUM(CASE WHEN es_misma_tienda = 1 THEN venta_neta END) AS facturacion_mt,
        SUM(venta_neta) - SUM(costo_venta)                     AS utilidad_bruta,
        (SUM(venta_neta) - SUM(costo_venta))
          / NULLIF(SUM(venta_neta), 0) * 100                   AS margen_ub,
        COUNT(DISTINCT tienda_id)                              AS num_tiendas
      FROM ventas_diarias
      WHERE pais_codigo = $1
        AND DATE_TRUNC('month', fecha) = DATE_TRUNC('month', CURRENT_DATE)
    `;
    const rows = await query(sql, [pais]);
    return NextResponse.json({ ok: true, data: rows[0], pais, periodo });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Error desconocido";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

