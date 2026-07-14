import { NextResponse } from "next/server";
import { query } from "@/lib/redshift";

// ─── Tablas por país ──────────────────────────────────────────────────────────
// MX: miniso_dlh.analytics_mx_prod.h_ventas_sap_mes  (col: sucursal, total_vta_siva, costo_venta, unidades, ticket)
// AR: miniso_dlh.analytics_ar_prod.h_ventas_sap_mes  (misma estructura que MX)
// CO: miniso_dlh.analytics_co_prod.h_punto_de_ventas (col: idsucursal, ventasinimpuesto, piezas, numticket)
// PE: miniso_dlh.analytics_pe_prod.h_punto_de_ventas
// CL: miniso_dlh.analytics_cl_prod.h_punto_de_ventas

// ─── MX query ────────────────────────────────────────────────────────────────
// NOTA: en h_ventas_sap_mes el campo `sucursal` contiene NOMBRES de tienda,
// no códigos (T0xxx). Cada tienda aparece hasta 3 veces con prefijos:
//   - nombre base: "PARQUE DELTA"            ← transacción real de POS
//   - "ARIO PARQUE DELTA"                    ← registro de app ARIO (duplicado)
//   - "PREMIOS LOYALTY PARQUE DELTA"         ← registro de loyalty (duplicado)
// Filtramos SOLO el nombre base para evitar doble/triple conteo.

function buildMXQuery(year: number, month: number) {
  return {
    sql: `
      SELECT
        COUNT(DISTINCT sucursal)                                        AS num_tiendas,
        SUM(total_vta_siva)                                             AS facturacion_total,
        SUM(costo_venta)                                                AS costo_ventas,
        SUM(total_vta_siva) - SUM(costo_venta)                          AS utilidad_bruta,
        CASE WHEN SUM(total_vta_siva) > 0
          THEN (SUM(total_vta_siva) - SUM(costo_venta))
               / SUM(total_vta_siva) * 100
          ELSE 0 END                                                    AS margen_ub,
        SUM(unidades)                                                   AS piezas,
        CASE WHEN COUNT(DISTINCT ticket) > 0
          THEN SUM(total_vta_siva) / COUNT(DISTINCT ticket)
          ELSE 0 END                                                    AS ticket_promedio
      FROM miniso_dlh.analytics_mx_prod.h_ventas_sap_mes
      WHERE year  = $1
        AND month = $2
        AND sucursal NOT LIKE 'ARIO %'
        AND sucursal NOT LIKE 'PREMIOS%'
    `,
    params: [year, month],
  };
}

// ─── AR query ────────────────────────────────────────────────────────────────

function buildARQuery(year: number, month: number) {
  return {
    sql: `
      SELECT
        COUNT(DISTINCT id_sucursal)                                     AS num_tiendas,
        SUM(total_vta_siva)                                             AS facturacion_total,
        SUM(costo_venta)                                                AS costo_ventas,
        SUM(total_vta_siva) - SUM(costo_venta)                          AS utilidad_bruta,
        CASE WHEN SUM(total_vta_siva) > 0
          THEN (SUM(total_vta_siva) - SUM(costo_venta))
               / SUM(total_vta_siva) * 100
          ELSE 0 END                                                    AS margen_ub,
        SUM(unidades)                                                   AS piezas,
        CASE WHEN COUNT(DISTINCT ticket) > 0
          THEN SUM(total_vta_siva) / COUNT(DISTINCT ticket)
          ELSE 0 END                                                    AS ticket_promedio
      FROM miniso_dlh.analytics_ar_prod.h_ventas_sap_mes
      WHERE id_sucursal LIKE 'AR%'
        AND year  = $1
        AND month = $2
    `,
    params: [year, month],
  };
}

// ─── CO query ────────────────────────────────────────────────────────────────

function buildCOQuery(year: number, month: number) {
  return {
    sql: `
      SELECT
        COUNT(DISTINCT idsucursal)                                      AS num_tiendas,
        SUM(ventasinimpuesto)                                           AS facturacion_total,
        NULL::NUMERIC                                                   AS costo_ventas,
        NULL::NUMERIC                                                   AS utilidad_bruta,
        NULL::NUMERIC                                                   AS margen_ub,
        SUM(piezas)                                                     AS piezas,
        CASE WHEN COUNT(DISTINCT numticket) > 0
          THEN SUM(ventasinimpuesto) / COUNT(DISTINCT numticket)
          ELSE 0 END                                                    AS ticket_promedio
      FROM miniso_dlh.analytics_co_prod.h_punto_de_ventas
      WHERE year  = $1
        AND month = $2
        AND idsucursal NOT IN (
          'BG-ZT','CO-T0037','BG-CL 93','T0027','T0028',
          'CO-T0039','CO-T0050','CO-T0069',
          'MKP0020','MKP0021','MKP0022',
          '01','BG-DS','BG-IC','BG-MOB',
          'CEN-ALAV','CEN-ALCU','CEN-INMQ','CEN-MOB','IN0041','IN0041-1'
        )
        AND idsucursal NOT LIKE 'CEN-%'
        AND idsucursal NOT LIKE 'TESTER%'
        AND idsucursal NOT LIKE 'DEVOLUCIONES%'
        AND idsucursal NOT LIKE 'MERMA%'
    `,
    params: [year, month],
  };
}

// ─── PE query ────────────────────────────────────────────────────────────────

function buildPEQuery(year: number, month: number) {
  return {
    sql: `
      SELECT
        COUNT(DISTINCT idsucursal)                                      AS num_tiendas,
        SUM(ventasinimpuesto)                                           AS facturacion_total,
        NULL::NUMERIC                                                   AS costo_ventas,
        NULL::NUMERIC                                                   AS utilidad_bruta,
        NULL::NUMERIC                                                   AS margen_ub,
        SUM(piezas)                                                     AS piezas,
        CASE WHEN COUNT(DISTINCT numticket) > 0
          THEN SUM(ventasinimpuesto) / COUNT(DISTINCT numticket)
          ELSE 0 END                                                    AS ticket_promedio
      FROM miniso_dlh.analytics_pe_prod.h_punto_de_ventas
      WHERE year  = $1
        AND month = $2
        AND idsucursal LIKE 'PR02%'
        AND idsucursal LIKE '%-DI'
    `,
    params: [year, month],
  };
}

// ─── CL query ────────────────────────────────────────────────────────────────

function buildCLQuery(year: number, month: number) {
  return {
    sql: `
      SELECT
        COUNT(DISTINCT idsucursal)                                      AS num_tiendas,
        SUM(ventasinimpuesto)                                           AS facturacion_total,
        NULL::NUMERIC                                                   AS costo_ventas,
        NULL::NUMERIC                                                   AS utilidad_bruta,
        NULL::NUMERIC                                                   AS margen_ub,
        SUM(piezas)                                                     AS piezas,
        CASE WHEN COUNT(DISTINCT numticket) > 0
          THEN SUM(ventasinimpuesto) / COUNT(DISTINCT numticket)
          ELSE 0 END                                                    AS ticket_promedio
      FROM miniso_dlh.analytics_cl_prod.h_punto_de_ventas
      WHERE year  = $1
        AND month = $2
        AND idsucursal LIKE 'CL0%'
        AND idsucursal LIKE '%-DI'
    `,
    params: [year, month],
  };
}

// ─── handler ─────────────────────────────────────────────────────────────────

type QueryBuilder = (year: number, month: number) => { sql: string; params: (string | number)[] };

const QUERY_BUILDERS: Record<string, QueryBuilder> = {
  MX: buildMXQuery,
  AR: buildARQuery,
  CO: buildCOQuery,
  PE: buildPEQuery,
  CL: buildCLQuery,
};

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const year  = parseInt(searchParams.get("year")  || String(new Date().getFullYear()));
  const month = parseInt(searchParams.get("month") || String(new Date().getMonth() + 1));

  const results: Record<string, Record<string, number | null | string>> = {};

  await Promise.all(
    Object.entries(QUERY_BUILDERS).map(async ([pais, buildQuery]) => {
      try {
        const { sql, params } = buildQuery(year, month);
        const rows = await query(sql, params);
        const row = rows[0] ?? {};
        results[pais] = {
          num_tiendas:       Number(row.num_tiendas)       || 0,
          facturacion_total: Number(row.facturacion_total) || 0,
          costo_ventas:      row.costo_ventas  != null ? Number(row.costo_ventas)  : null,
          utilidad_bruta:    row.utilidad_bruta != null ? Number(row.utilidad_bruta) : null,
          margen_ub:         row.margen_ub      != null ? Number(row.margen_ub)      : null,
          piezas:            Number(row.piezas)            || 0,
          ticket_promedio:   Number(row.ticket_promedio)   || 0,
        };
      } catch (err) {
        results[pais] = { error: err instanceof Error ? err.message : "Error" };
      }
    })
  );

  return NextResponse.json({ ok: true, year, month, data: results });
}

