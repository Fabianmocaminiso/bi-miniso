// /api/schema-probe/route.ts
// Diagnostico ampliado de schema Redshift
import { NextResponse } from "next/server";
import { query } from "@/lib/redshift";

export async function GET() {
  const results: Record<string, any> = { ok: true };

  const run = async (key: string, sql: string) => {
    try {
      results[key] = await query(sql);
    } catch (e: any) {
      results[key + "_error"] = e.message;
    }
  };

  // Contexto de conexion
  await run("ctx", `
    SELECT current_database() AS db, current_schema() AS schema
  `);

  // Todos los schemas disponibles
  await run("schemas", `
    SELECT nspname AS schema_name
    FROM pg_namespace
    WHERE nspname NOT LIKE 'pg_%' AND nspname != 'information_schema'
    ORDER BY nspname
    LIMIT 50
  `);

  // Tablas en analytics_mx_prod via information_schema
  await run("tables_info_schema", `
    SELECT table_name, table_type
    FROM information_schema.tables
    WHERE table_schema = 'analytics_mx_prod'
    ORDER BY table_name
  `);

  // Tablas via pg_tables (todas los schemas)
  await run("tables_pg", `
    SELECT schemaname, tablename
    FROM pg_tables
    WHERE schemaname NOT IN ('pg_catalog','information_schema')
    ORDER BY schemaname, tablename
    LIMIT 200
  `);

  // SVV_ALL_TABLES (Redshift — incluye tablas de data sharing)
  await run("tables_svv", `
    SELECT database_name, schema_name, table_name, table_type
    FROM SVV_ALL_TABLES
    WHERE schema_name NOT IN ('pg_catalog','information_schema')
    ORDER BY schema_name, table_name
    LIMIT 300
  `);

  // Columnas de loy_ganados_pos (schema analytics_mx_prod)
  await run("loy_ganados_cols", `
    SELECT column_name, data_type
    FROM information_schema.columns
    WHERE table_schema = 'analytics_mx_prod'
      AND table_name = 'loy_ganados_pos'
    ORDER BY ordinal_position
  `);

  // Columnas via SVV_ALL_COLUMNS (Redshift)
  await run("loy_ganados_svv", `
    SELECT schema_name, table_name, column_name, data_type
    FROM SVV_ALL_COLUMNS
    WHERE table_name = 'loy_ganados_pos'
    LIMIT 50
  `);

  // Buscar tablas con nombres relacionados a inventario/comercial
  await run("inv_search", `
    SELECT schemaname, tablename
    FROM pg_tables
    WHERE tablename ILIKE '%inventar%'
       OR tablename ILIKE '%stock%'
       OR tablename ILIKE '%mv_%'
       OR tablename ILIKE '%comercial%'
       OR tablename ILIKE '%loy%'
    ORDER BY schemaname, tablename
    LIMIT 50
  `);

  return NextResponse.json(results, { status: 200 });
}
