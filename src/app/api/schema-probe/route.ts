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

  await cols("loy_clientes_registrados",         "loy_clientes_registrados");
  await cols("loy_customers_transactions",        "loy_customers_transactions");
  await cols("tb_h_ventas_inventario_dimsuc",     "tb_h_ventas_inventario_dimsuc_dimprod");
  await cols("loy_redimidos_descuento_pos",       "loy_redimidos_descuento_pos");
  await cols("loy_redimidos_appminiso",           "loy_redimidos_appminiso");
  await cols("loy_redimidos_xgiftcard_ecommerce", "loy_redimidos_xgiftcard_ecommerce");
  await cols("loy_ganados_ecommerce",             "loy_ganados_ecommerce");
  await cols("loy_ganados_appminiso",             "loy_ganados_appminiso");

  return NextResponse.json(results, { status: 200 });
}
