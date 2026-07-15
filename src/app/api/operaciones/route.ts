import { NextResponse } from "next/server";
import { query } from "@/lib/redshift";

// ─── /api/operaciones ──────────────────────────────────────────────────────────
// KPI-OPS-002 Ticket promedio     → h_ventas_sap_mes (MX/AR) · h_punto_de_ventas (CO/PE/CL)
// KPI-OPS-003 Pzas por ticket     → mismas tablas
// KPI-OPS-005 Vta prom/tienda     → mismas tablas
// KPI-OPS-004 Conversión %        → mv_operaciones_radiografia_dimsucursal (MX only)
//
// Fuente: Diccionario_Datos_Tecnico_v5.2 — tablas verificadas
// ─────────────────────────────────────────────────────────────────────────────

// ── MX ──────────────────────────────────────────────────────────────────────
function buildMXQuery(year: number, month: number) {
  return {
    sql: `
      SELECT
        COUNT(DISTINCT sucursal)                                               AS num_tiendas,
        COUNT(DISTINCT ticket)                                                 AS num_tickets,
        SUM(unidades)                                                          AS piezas,
        SUM(total_vta_siva)                                                    AS venta,
        CASE WHEN COUNT(DISTINCT ticket) > 0
          THEN ROUND(SUM(total_vta_siva)::DECIMAL / COUNT(DISTINCT ticket), 2)
          ELSE 0 END                                                            AS ticket_promedio,
        CASE WHEN COUNT(DISTINCT ticket) > 0
          THEN ROUND(SUM(unidades)::DECIMAL / COUNT(DISTINCT ticket), 2)
          ELSE 0 END                                                            AS pzas_ticket,
        CASE WHEN COUNT(DISTINCT sucursal) > 0
          THEN ROUND(SUM(total_vta_siva)::DECIMAL / COUNT(DISTINCT sucursal), 2)
          ELSE 0 END                                                            AS vta_prom_tienda
      FROM miniso_dlh.analytics_mx_prod.h_ventas_sap_mes
      WHERE year  = $1
        AND month = $2
        AND sucursal NOT LIKE 'ARIO %'
        AND sucursal NOT LIKE 'PREMIOS%'
    `,
    params: [year, month],
  };
}

// ── MX Conversión (mv_operaciones_radiografia_dimsucursal) ──────────────────
// counttickets = tickets APTOS · trafico = sensores CC/Getin (solo MX)
function buildMXConversionQuery(year: number, month: number) {
  return {
    sql: `
      SELECT
        SUM(trafico)                                                           AS trafico_total,
        SUM(counttickets)                                                      AS tickets_total,
        CASE WHEN SUM(trafico) > 0
          THEN ROUND(100.0 * SUM(counttickets)::DECIMAL / SUM(trafico), 1)
          ELSE NULL END                                                         AS conversion_pct
      FROM miniso_dlh.analytics_mx_prod.mv_operaciones_radiografia_dimsucursal
      WHERE EXTRACT(YEAR  FROM fecha)::INTEGER = $1
        AND EXTRACT(MONTH FROM fecha)::INTEGER = $2
    `,
    params: [year, month],
  };
}

// ── AR ──────────────────────────────────────────────────────────────────────
function buildARQuery(year: number, month: number) {
  return {
    sql: `
      SELECT
        COUNT(DISTINCT id_sucursal)                                            AS num_tiendas,
        COUNT(DISTINCT ticket)                                                 AS num_tickets,
        SUM(unidades)                                                          AS piezas,
        SUM(total_vta_siva)                                                    AS venta,
        CASE WHEN COUNT(DISTINCT ticket) > 0
          THEN ROUND(SUM(total_vta_siva)::DECIMAL / COUNT(DISTINCT ticket), 2)
          ELSE 0 END                                                            AS ticket_promedio,
        CASE WHEN COUNT(DISTINCT ticket) > 0
          THEN ROUND(SUM(unidades)::DECIMAL / COUNT(DISTINCT ticket), 2)
          ELSE 0 END                                                            AS pzas_ticket,
        CASE WHEN COUNT(DISTINCT id_sucursal) > 0
          THEN ROUND(SUM(total_vta_siva)::DECIMAL / COUNT(DISTINCT id_sucursal), 2)
          ELSE 0 END                                                            AS vta_prom_tienda
      FROM miniso_dlh.analytics_ar_prod.h_ventas_sap_mes
      WHERE id_sucursal LIKE 'AR%'
        AND year  = $1
        AND month = $2
    `,
    params: [year, month],
  };
}

// ── CO ──────────────────────────────────────────────────────────────────────
function buildCOQuery(year: number, month: number) {
  return {
    sql: `
      SELECT
        COUNT(DISTINCT idsucursal)                                             AS num_tiendas,
        COUNT(DISTINCT numticket)                                              AS num_tickets,
        SUM(piezas)                                                            AS piezas,
        SUM(ventasinimpuesto)                                                  AS venta,
        CASE WHEN COUNT(DISTINCT numticket) > 0
          THEN ROUND(SUM(ventasinimpuesto)::DECIMAL / COUNT(DISTINCT numticket), 2)
          ELSE 0 END                                                            AS ticket_promedio,
        CASE WHEN COUNT(DISTINCT numticket) > 0
          THEN ROUND(SUM(piezas)::DECIMAL / COUNT(DISTINCT numticket), 2)
          ELSE 0 END                                                            AS pzas_ticket,
        CASE WHEN COUNT(DISTINCT idsucursal) > 0
          THEN ROUND(SUM(ventasinimpuesto)::DECIMAL / COUNT(DISTINCT idsucursal), 2)
          ELSE 0 END                                                            AS vta_prom_tienda
      FROM miniso_dlh.analytics_co_prod.h_punto_de_ventas
      WHERE year  = $1
        AND month = $2
        AND idsucursal NOT LIKE 'CEN-%'
        AND idsucursal NOT LIKE 'TESTER%'
        AND idsucursal NOT LIKE 'DEVOLUCIONES%'
        AND idsucursal NOT LIKE 'MERMA%'
    `,
    params: [year, month],
  };
}

// ── PE ──────────────────────────────────────────────────────────────────────
function buildPEQuery(year: number, month: number) {
  return {
    sql: `
      SELECT
        COUNT(DISTINCT idsucursal)                                             AS num_tiendas,
        COUNT(DISTINCT numticket)                                              AS num_tickets,
        SUM(piezas)                                                            AS piezas,
        SUM(ventasinimpuesto)                                                  AS venta,
        CASE WHEN COUNT(DISTINCT numticket) > 0
          THEN ROUND(SUM(ventasinimpuesto)::DECIMAL / COUNT(DISTINCT numticket), 2)
          ELSE 0 END                                                            AS ticket_promedio,
        CASE WHEN COUNT(DISTINCT numticket) > 0
          THEN ROUND(SUM(piezas)::DECIMAL / COUNT(DISTINCT numticket), 2)
          ELSE 0 END                                                            AS pzas_ticket,
        CASE WHEN COUNT(DISTINCT idsucursal) > 0
          THEN ROUND(SUM(ventasinimpuesto)::DECIMAL / COUNT(DISTINCT idsucursal), 2)
          ELSE 0 END                                                            AS vta_prom_tienda
      FROM miniso_dlh.analytics_pe_prod.h_punto_de_ventas
      WHERE year  = $1
        AND month = $2
        AND idsucursal LIKE 'PR02%'
        AND idsucursal LIKE '%-DI'
    `,
    params: [year, month],
  };
}

// ── CL ──────────────────────────────────────────────────────────────────────
function buildCLQuery(year: number, month: number) {
  return {
    sql: `
      SELECT
        COUNT(DISTINCT idsucursal)                                             AS num_tiendas,
        COUNT(DISTINCT numticket)                                              AS num_tickets,
        SUM(piezas)                                                            AS piezas,
        SUM(ventasinimpuesto)                                                  AS venta,
        CASE WHEN COUNT(DISTINCT numticket) > 0
          THEN ROUND(SUM(ventasinimpuesto)::DECIMAL / COUNT(DISTINCT numticket), 2)
          ELSE 0 END                                                            AS ticket_promedio,
        CASE WHEN COUNT(DISTINCT numticket) > 0
          THEN ROUND(SUM(piezas)::DECIMAL / COUNT(DISTINCT numticket), 2)
          ELSE 0 END                                                            AS pzas_ticket,
        CASE WHEN COUNT(DISTINCT idsucursal) > 0
          THEN ROUND(SUM(ventasinimpuesto)::DECIMAL / COUNT(DISTINCT idsucursal), 2)
          ELSE 0 END                                                            AS vta_prom_tienda
      FROM miniso_dlh.analytics_cl_prod.h_punto_de_ventas
      WHERE year  = $1
        AND month = $2
        AND idsucursal LIKE 'CL0%'
        AND idsucursal LIKE '%-DI'
    `,
    params: [year, month],
  };
}

// ── Handler ──────────────────────────────────────────────────────────────────
type Row = { [key: string]: string | number | null };

const BUILDERS: Record<string, (y: number, m: number) => { sql: string; params: (string | number)[] }> = {
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

  // ── Consultas base por país ───────────────────────────────────────────────
  await Promise.all(
    Object.entries(BUILDERS).map(async ([pais, builder]) => {
      try {
        const { sql, params } = builder(year, month);
        const rows = await query(sql, params);
        const r: Row = rows[0] ?? {};
        results[pais] = {
          num_tiendas:     Number(r.num_tiendas)     || 0,
          num_tickets:     Number(r.num_tickets)     || 0,
          piezas:          Number(r.piezas)          || 0,
          venta:           Number(r.venta)           || 0,
          ticket_promedio: Number(r.ticket_promedio) || 0,
          pzas_ticket:     Number(r.pzas_ticket)     || 0,
          vta_prom_tienda: Number(r.vta_prom_tienda) || 0,
          conversion_pct:  null,
          trafico_total:   null,
        };
      } catch (err) {
        results[pais] = { error: err instanceof Error ? err.message : "Error" };
      }
    })
  );

  // ── Conversión MX (mv_operaciones_radiografia) ───────────────────────────
  try {
    const { sql, params } = buildMXConversionQuery(year, month);
    const rows = await query(sql, params);
    const r: Row = rows[0] ?? {};
    if (results["MX"] && !results["MX"].error) {
      results["MX"].conversion_pct = r.conversion_pct != null ? Number(r.conversion_pct) : null;
      results["MX"].trafico_total  = r.trafico_total  != null ? Number(r.trafico_total)  : null;
    }
  } catch {
    // Conversión falla silenciosamente — no bloquea el resto de operaciones
  }

  // ── Totales LATAM ponderados ──────────────────────────────────────────────
  const paisesOK = Object.values(results).filter(r => !r.error);
  const totalTickets = paisesOK.reduce((s, r) => s + (Number(r.num_tickets)  || 0), 0);
  const totalTiendas = paisesOK.reduce((s, r) => s + (Number(r.num_tiendas)  || 0), 0);
  const totalVenta   = paisesOK.reduce((s, r) => s + (Number(r.venta)        || 0), 0);
  const totalPiezas  = paisesOK.reduce((s, r) => s + (Number(r.piezas)       || 0), 0);

  const latam = {
    ticket_promedio: totalTickets > 0 ? totalVenta  / totalTickets : 0,
    pzas_ticket:     totalTickets > 0 ? totalPiezas / totalTickets : 0,
    vta_prom_tienda: totalTiendas > 0 ? totalVenta  / totalTiendas : 0,
  };

  return NextResponse.json({ ok: true, year, month, data: results, latam });
}
