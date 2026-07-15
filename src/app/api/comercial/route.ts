import { NextResponse } from "next/server";
import { query } from "@/lib/redshift";

// ─── /api/comercial ────────────────────────────────────────────────────────────
// Datos disponibles SOLO para MX (tablas inventario confirmadas Diccionario v5.2)
// Tabla: miniso_dlh.analytics_mx_prod.tb_h_ventas_inventario_dimsuc_dimprod
//
// Columnas clave (verificadas en Diccionario_Datos_Tecnico_v5.2):
//   idsucursal, idproducto, fecha, piezas, ventasiniva, ventatotal,
//   counttickets, stock, disponible, precio,
//   year (TEXT), month (INTEGER), day (INTEGER)
//
// KPI-COM-005 Sell Thru General     = SUM(piezas) / (SUM(piezas) + stock_fin) × 100
// KPI-COM-008 SKUs Prom en Tiendas  = COUNT(DISTINCT idproducto) / tiendas
// KPI-COM-009 SKUs Prom en Almacén  = COUNT(DISTINCT idproducto) donde CEN%
// KPI-COM-012 Stock/Tienda (pzas)   = SUM(stock) / tiendas  (snapshot fin período)
// KPI-COM-013 Stock/Tienda ($)      = SUM(stock × precio) / tiendas
// KPI-COM-001 Precio Prom           = SUM(ventasiniva) / SUM(piezas)
// ─────────────────────────────────────────────────────────────────────────────

const MV = `miniso_dlh.analytics_mx_prod.tb_h_ventas_inventario_dimsuc_dimprod`;

// Filtros estándar (excluir CEDIS, ARIO y PREMIOS)
const FILTER_TIENDAS = `
  AND idsucursal NOT LIKE 'CEN%'
  AND idsucursal NOT LIKE 'ARIO%'
  AND idsucursal NOT LIKE 'PREMIOS%'
`;

// Query 1 — Ventas del período (todas las fechas del mes, solo tiendas)
// Devuelve: piezas_mes, venta_mes, precio_promedio, num_tiendas
function buildSalesQuery(year: number, month: number) {
  return {
    sql: `
      SELECT
        COUNT(DISTINCT idsucursal)                                        AS num_tiendas,
        SUM(piezas)                                                       AS piezas_mes,
        SUM(ventasiniva)                                                  AS venta_mes,
        CASE WHEN SUM(piezas) > 0
          THEN ROUND(SUM(ventasiniva)::DECIMAL / SUM(piezas), 2)
          ELSE 0 END                                                       AS precio_promedio
      FROM ${MV}
      WHERE anio = $1
        AND EXTRACT(MONTH FROM fecha)::INTEGER = $2
        ${FILTER_TIENDAS}
        AND piezas > 0
    `,
    params: [year, month],
  };
}

// Query 2 — Snapshot de inventario en tiendas al último día del período
// Devuelve: stock_total_pzas, skus_tiendas, stock_tienda_pzas, stock_tienda_valor
// Usamos la última fecha disponible del mes como proxy de stock final (sell-thru correcto)
function buildStockSnapshotQuery(year: number, month: number) {
  return {
    sql: `
      WITH ultima_fecha AS (
        SELECT MAX(fecha) AS fmax
        FROM ${MV}
        WHERE anio = $1
          AND EXTRACT(MONTH FROM fecha)::INTEGER = $2
          ${FILTER_TIENDAS}
      )
      SELECT
        COUNT(DISTINCT f.idsucursal)                                      AS num_tiendas_stock,
        COUNT(DISTINCT f.idproducto)                                      AS skus_tiendas,
        SUM(f.stock)                                                      AS stock_total_pzas,
        CASE WHEN COUNT(DISTINCT f.idsucursal) > 0
          THEN ROUND(SUM(f.stock)::DECIMAL / COUNT(DISTINCT f.idsucursal), 0)
          ELSE 0 END                                                       AS stock_tienda_pzas,
        CASE WHEN COUNT(DISTINCT f.idsucursal) > 0
          THEN ROUND(SUM(f.stock * f.precio)::DECIMAL / COUNT(DISTINCT f.idsucursal), 0)
          ELSE 0 END                                                       AS stock_tienda_valor
      FROM ${MV} f
      JOIN ultima_fecha u ON f.fecha = u.fmax
      WHERE f.anio = $1
        AND EXTRACT(MONTH FROM f.fecha)::INTEGER = $2
        ${FILTER_TIENDAS}
    `,
    params: [year, month],
  };
}

// Query 3 — Inventario CEDIS (idsucursal LIKE 'CEN%') al último día del período
// Devuelve: skus_almacen, cedis_stock_pzas
function buildCedisQuery(year: number, month: number) {
  return {
    sql: `
      WITH ultima_fecha AS (
        SELECT MAX(fecha) AS fmax
        FROM ${MV}
        WHERE anio = $1
          AND EXTRACT(MONTH FROM fecha)::INTEGER = $2
          AND idsucursal LIKE 'CEN%'
      )
      SELECT
        COUNT(DISTINCT f.idproducto)                                      AS skus_almacen,
        SUM(f.stock)                                                      AS cedis_stock_pzas
      FROM ${MV} f
      JOIN ultima_fecha u ON f.fecha = u.fmax
      WHERE f.anio = $1
        AND EXTRACT(MONTH FROM f.fecha)::INTEGER = $2
        AND f.idsucursal LIKE 'CEN%'
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
    const [salesRows, stockRows, cedisRows] = await Promise.all([
      query(buildSalesQuery(year, month).sql,         buildSalesQuery(year, month).params),
      query(buildStockSnapshotQuery(year, month).sql, buildStockSnapshotQuery(year, month).params),
      query(buildCedisQuery(year, month).sql,         buildCedisQuery(year, month).params),
    ]);

    const sales: Row  = salesRows[0]  ?? {};
    const stock: Row  = stockRows[0]  ?? {};
    const cedis: Row  = cedisRows[0]  ?? {};

    const piezas_mes     = Number(sales.piezas_mes)     || 0;
    const stock_total    = Number(stock.stock_total_pzas) || 0;
    const sell_thru      = piezas_mes + stock_total > 0
      ? Math.round(100 * piezas_mes / (piezas_mes + stock_total) * 10) / 10
      : null;

    const mx = {
      // KPI-COM-005 Sell Thru
      sell_thru,
      // KPI-COM-008 SKUs en Tiendas (promedio por tienda)
      skus_tiendas: stock.skus_tiendas != null && Number(stock.num_tiendas_stock) > 0
        ? Math.round(Number(stock.skus_tiendas) / Number(stock.num_tiendas_stock))
        : Number(stock.skus_tiendas) || null,
      // KPI-COM-009 SKUs en Almacén CEDIS
      skus_almacen:       Number(cedis.skus_almacen)      || null,
      // KPI-COM-012 Stock/Tienda (pzas)
      stock_tienda_pzas:  Number(stock.stock_tienda_pzas)  || null,
      // KPI-COM-013 Stock/Tienda ($)
      stock_tienda_valor: Number(stock.stock_tienda_valor) || null,
      // KPI-COM-001 Precio Promedio
      precio_promedio:    Number(sales.precio_promedio)    || null,
      // Aux
      piezas_mes,
      stock_total_pzas:   stock_total,
      cedis_stock_pzas:   Number(cedis.cedis_stock_pzas)  || null,
      num_tiendas:        Number(sales.num_tiendas)        || 0,
    };

    return NextResponse.json({ ok: true, year, month, MX: mx });

  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "Error inesperado" },
      { status: 500 }
    );
  }
}
