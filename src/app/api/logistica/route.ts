import { NextResponse } from "next/server";
import { query } from "@/lib/redshift";

// ─── /api/logistica ────────────────────────────────────────────────────────────
// Datos disponibles SOLO para MX (tablas inventario confirmadas Diccionario v5.2)
//
// KPI-LOG-003 Fill Rate Surtimiento
//   Fuente: miniso_dlh.analytics_mx_prod.tb_operaciones_radiografia_dimsucursal
//   Fórmula: SUM(sku3) / SUM(idealsku) × 100
//   sku3     = binario: 1 si inventario_tienda > 3 unidades (SKU bien surtido)
//   idealsku = SKUs ideales que debe tener la tienda (modelo de surtido HQ)
//
// KPI-LOG-001 Inventario CEDIS disponible (pzas)
//   Fuente: miniso_dlh.analytics_mx_prod.tb_h_ventas_inventario_dimsuc_dimprod
//   Campos: centrolf (CEDIS LF disponible) · centrotr (CEDIS TR) · centroou (CEDIS OU)
//   Snapshot al último día del período
//
// KPI-LOG-022 CEDIS disponible (meses)
//   Fórmula: cedis_pzas / (piezas_mes / días_mes)
//
// Fuente: Diccionario_Datos_Tecnico_v5.2 — tablas y columnas verificadas
// ─────────────────────────────────────────────────────────────────────────────

// ── Query 1: Fill Rate (tb_operaciones_radiografia_dimsucursal) ───────────────
// Campos verificados: sku3 (INTEGER 0/1), idealsku (INTEGER), fecha (DATE)
// IMPORTANTE: usar snapshot del último día del período.
// idealsku es una CONSTANTE por tienda (≈22k SKUs de catálogo).
// Si se suma sobre N días, el denominador se multiplica ×N y el ratio se distorsiona.
// La misma lógica se aplica al inventario CEDIS (buildCedisStockQuery).
function buildFillRateQuery(year: number, month: number) {
  return {
    sql: `
      WITH ultima_fecha AS (
        SELECT MAX(fecha) AS fmax
        FROM miniso_dlh.analytics_mx_prod.tb_operaciones_radiografia_dimsucursal
        WHERE EXTRACT(YEAR  FROM fecha)::INTEGER = $1
          AND EXTRACT(MONTH FROM fecha)::INTEGER = $2
      ),
      fill_snap AS (
        SELECT r.*
        FROM miniso_dlh.analytics_mx_prod.tb_operaciones_radiografia_dimsucursal r
        JOIN ultima_fecha u ON r.fecha = u.fmax
      )
      SELECT
        SUM(sku3)                                                             AS skus_surtidos,
        SUM(idealsku)                                                         AS skus_ideal,
        CASE WHEN SUM(idealsku) > 0
          THEN ROUND(100.0 * SUM(sku3)::DECIMAL / SUM(idealsku), 1)
          ELSE NULL END                                                         AS fill_rate_pct,
        AVG(CASE WHEN idealsku > 0
          THEN 100.0 * sku3::DECIMAL / idealsku END)                           AS fill_rate_avg_tienda,
        COUNT(DISTINCT CASE WHEN sku3 = 1 THEN idsucursal END)                AS tiendas_ok_fill,
        COUNT(DISTINCT idsucursal)                                            AS total_tiendas,
        (SELECT fmax FROM ultima_fecha)                                        AS fecha_snapshot,
        (SELECT COUNT(DISTINCT fecha) FROM miniso_dlh.analytics_mx_prod.tb_operaciones_radiografia_dimsucursal
           WHERE EXTRACT(YEAR FROM fecha)::INTEGER = $1
             AND EXTRACT(MONTH FROM fecha)::INTEGER = $2)                     AS dias_con_datos
      FROM fill_snap
    `,
    params: [year, month],
  };
}

// ── Query 2: Inventario CEDIS (tb_h_ventas_inventario_dimsuc_dimprod) ─────────
// centrolf = CEDIS LF disponible (neto comprometidos)
// centrotr = CEDIS TR stock
// centroou = CEDIS OU stock
// Snapshot al último día del período para evitar acumulación de filas diarias
function buildCedisStockQuery(year: number, month: number) {
  return {
    sql: `
      WITH ultima_fecha AS (
        SELECT MAX(fecha) AS fmax
        FROM miniso_dlh.analytics_mx_prod.tb_h_ventas_inventario_dimsuc_dimprod
        WHERE anio = $1
          AND EXTRACT(MONTH FROM fecha)::INTEGER = $2
      )
      SELECT
        SUM(f.centrolf)                                                       AS cedis_lf_pzas,
        SUM(f.centrotr)                                                       AS cedis_tr_pzas,
        SUM(f.centroou)                                                       AS cedis_ou_pzas,
        SUM(COALESCE(f.centrolf, 0) + COALESCE(f.centrotr, 0) + COALESCE(f.centroou, 0))
                                                                              AS cedis_total_pzas
      FROM miniso_dlh.analytics_mx_prod.tb_h_ventas_inventario_dimsuc_dimprod f
      JOIN ultima_fecha u ON f.fecha = u.fmax
      WHERE f.anio = $1
        AND EXTRACT(MONTH FROM f.fecha)::INTEGER = $2
        AND f.idsucursal NOT LIKE 'ARIO%'
        AND f.idsucursal NOT LIKE 'PREMIOS%'
    `,
    params: [year, month],
  };
}

// ── Query 3: Ventas del período (para calcular meses de cobertura CEDIS) ──────
// Obtiene el total de piezas vendidas en el mes → sirve para KPI-LOG-022
function buildVentasMesQuery(year: number, month: number) {
  return {
    sql: `
      SELECT
        SUM(piezas)                                                           AS piezas_mes,
        COUNT(DISTINCT fecha)                                                 AS dias_con_venta
      FROM miniso_dlh.analytics_mx_prod.tb_h_ventas_inventario_dimsuc_dimprod
      WHERE anio = $1
        AND EXTRACT(MONTH FROM fecha)::INTEGER = $2
        AND idsucursal NOT LIKE 'CEN%'
        AND idsucursal NOT LIKE 'ARIO%'
        AND idsucursal NOT LIKE 'PREMIOS%'
        AND piezas > 0
    `,
    params: [year, month],
  };
}

// ── Handler ──────────────────────────────────────────────────────────────────
type Row = { [key: string]: string | number | null };

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const year  = parseInt(searchParams.get("year")  || String(new Date().getFullYear()));
  const month = parseInt(searchParams.get("month") || String(new Date().getMonth() + 1));

  try {
    // Ejecutar las 3 queries en paralelo
    const [fillRows, cedisRows, ventasRows] = await Promise.all([
      query(buildFillRateQuery(year, month).sql,    buildFillRateQuery(year, month).params),
      query(buildCedisStockQuery(year, month).sql,  buildCedisStockQuery(year, month).params),
      query(buildVentasMesQuery(year, month).sql,   buildVentasMesQuery(year, month).params),
    ]);

    const fill: Row   = fillRows[0]   ?? {};
    const cedis: Row  = cedisRows[0]  ?? {};
    const ventas: Row = ventasRows[0] ?? {};

    // ── KPI-LOG-022: Meses de cobertura CEDIS ──────────────────────────────
    // cedis_meses = cedis_total_pzas / (piezas_mes / dias_mes_natural)
    const dias_mes = new Date(year, month, 0).getDate(); // días naturales del mes
    const piezas_mes      = Number(ventas.piezas_mes)     || 0;
    const cedis_total     = Number(cedis.cedis_total_pzas) || 0;
    const venta_diaria    = piezas_mes > 0 ? piezas_mes / dias_mes : 0;
    const cedis_meses     = venta_diaria > 0
      ? Math.round((cedis_total / venta_diaria / (365 / 12)) * 10) / 10
      : null;

    const mx = {
      // KPI-LOG-003
      fill_rate_pct:        fill.fill_rate_pct     != null ? Number(fill.fill_rate_pct)     : null,
      skus_surtidos:        Number(fill.skus_surtidos)   || null,
      skus_ideal:           Number(fill.skus_ideal)      || null,
      tiendas_ok_fill:      Number(fill.tiendas_ok_fill) || null,
      total_tiendas:        Number(fill.total_tiendas)   || null,
      fill_fecha_snapshot:  fill.fecha_snapshot           ?? null,
      fill_dias_con_datos:  Number(fill.dias_con_datos)  || null,
      // KPI-LOG-001
      cedis_lf_pzas:        Number(cedis.cedis_lf_pzas)  || null,
      cedis_tr_pzas:        Number(cedis.cedis_tr_pzas)  || null,
      cedis_ou_pzas:        Number(cedis.cedis_ou_pzas)  || null,
      cedis_total_pzas:     cedis_total || null,
      // KPI-LOG-022
      cedis_meses,
      // Aux
      piezas_mes,
      venta_diaria:         Math.round(venta_diaria),
    };

    return NextResponse.json({ ok: true, year, month, MX: mx });

  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "Error inesperado" },
      { status: 500 }
    );
  }
}
