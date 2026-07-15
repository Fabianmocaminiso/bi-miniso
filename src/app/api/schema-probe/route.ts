// /api/schema-probe/route.ts
// Diagnóstico de schema Redshift — solo lectura, uso interno
// Visitar: GET /api/schema-probe
import { NextResponse } from "next/server";
import { query } from "@/lib/redshift";

export async function GET() {
  try {
    // 1. Tablas en analytics_mx_prod que puedan tener inventario/ventas
    const tables = await query(`
      SELECT table_name, table_type
      FROM information_schema.tables
      WHERE table_schema = 'analytics_mx_prod'
      ORDER BY table_name
    `);

    // 2. Columnas de loy_ganados_pos (para fix Marketing)
    const loyColumns = await query(`
      SELECT column_name, data_type
      FROM information_schema.columns
      WHERE table_schema = 'analytics_mx_prod'
        AND table_name = 'loy_ganados_pos'
      ORDER BY ordinal_position
    `);

    // 3. Columnas de loy_redimidos_descuento_pos
    const loyRedColumns = await query(`
      SELECT column_name, data_type
      FROM information_schema.columns
      WHERE table_schema = 'analytics_mx_prod'
        AND table_name = 'loy_redimidos_descuento_pos'
      ORDER BY ordinal_position
    `);

    // 4. Buscar tablas con "inventar" o "stock" en el nombre
    const invTables = tables.filter((t: any) =>
      t.table_name.toLowerCase().includes("inventar") ||
      t.table_name.toLowerCase().includes("stock") ||
      t.table_name.toLowerCase().includes("mv_") ||
      t.table_name.toLowerCase().includes("comercial")
    );

    return NextResponse.json({
      ok: true,
      all_tables_count: tables.length,
      all_tables: tables.map((t: any) => t.table_name),
      inventory_and_mv_tables: invTables,
      loy_ganados_pos_columns: loyColumns,
      loy_redimidos_pos_columns: loyRedColumns,
    }, { status: 200 });

  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message }, { status: 500 });
  }
}
