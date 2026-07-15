// /api/schema-probe/route.ts — v5: inventario completo de tablas por schema
import { NextResponse } from "next/server";
import { query } from "@/lib/redshift";

export async function GET() {
  const results: Record<string, any> = { ok: true, version: "v5" };

  // Lista todas las tablas de cada schema de país
  const schemas = [
    "analytics_mx_prod",
    "analytics_co_prod",
    "analytics_pe_prod",
    "analytics_cl_prod",
    "analytics_ar_prod",
  ];

  for (const schema of schemas) {
    const key = schema.replace("analytics_", "").replace("_prod", "");
    try {
      results[key] = await query(
        `SELECT table_name, table_type
         FROM SVV_ALL_TABLES
         WHERE schema_name = $1
         ORDER BY table_name`,
        [schema]
      );
    } catch (e: any) {
      results[key + "_err"] = e.message.slice(0, 200);
    }
  }

  // Buscar tablas clave por keyword en MX (para mapear áreas sin datos)
  const keywords: Record<string, string> = {
    nomina:      "nomi",
    renta:       "renta",
    fortia:      "fortia",
    rrhh:        "rrhh",
    empleados:   "emple",
    merma:       "merma",
    auditoria:   "audit",
    fardero:     "fard",
    ecommerce:   "ecomm",
    gasto:       "gasto",
    presupuesto: "presup",
    sensor:      "sensor",
    trafico:     "trafi",
    conversion:  "conver",
    deuda:       "deuda",
    cashflow:    "cash",
    ebitda:      "ebitda",
  };

  const kw_results: Record<string, any> = {};
  for (const [label, kw] of Object.entries(keywords)) {
    try {
      const rows = await query(
        `SELECT schema_name, table_name, table_type
         FROM SVV_ALL_TABLES
         WHERE table_name ILIKE $1
         ORDER BY schema_name, table_name`,
        [`%${kw}%`]
      );
      if ((rows as any[]).length > 0) {
        kw_results[label] = rows;
      }
    } catch (e: any) {
      kw_results[label + "_err"] = e.message.slice(0, 100);
    }
  }
  results["keyword_search"] = kw_results;

  return NextResponse.json(results, { status: 200 });
}
