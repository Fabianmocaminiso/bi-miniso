// /api/schema-probe/route.ts — v4: columnas de tablas problemáticas
import { NextResponse } from "next/server";
import { query } from "@/lib/redshift";

export async function GET() {
  const results: Record<string, any> = { ok: true };

  const cols = async (key: string, table: string) => {
    try {
      results[key] = await query(`
        SELECT column_name, data_type
        FROM SVV_ALL_COLUMNS
        WHERE table_name = $1
          AND schema_name = 'analytics_mx_prod'
        ORDER BY ordinal_position
      `, [table]);
    } catch (e: any) {
      results[key + "_err"] = e.message.slice(0, 120);
    }
  };

  // Buscar tabla fill rate / radiografia
  try {
    results["search_radiografia"] = await query(`
      SELECT table_name, schema_name, table_type
      FROM SVV_ALL_TABLES
      WHERE schema_name = 'analytics_mx_prod'
        AND (table_name ILIKE '%radiografia%' OR table_name ILIKE '%operaciones%' OR table_name ILIKE '%fillrate%' OR table_name ILIKE '%fill_rate%' OR table_name ILIKE '%surtimiento%')
      ORDER BY table_name
    `, []);
  } catch(e: any) { results["search_radiografia_err"] = e.message.slice(0,120); }

  return NextResponse.json(results, { status: 200 });
}
