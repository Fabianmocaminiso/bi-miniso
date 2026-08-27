"use client";
import { useEffect, useState } from "react";

// ─── tipos ────────────────────────────────────────────────────────────────────

type PaisData = {
  num_tiendas: number;
  facturacion_total: number;
  costo_ventas: number | null;
  utilidad_bruta: number | null;
  margen_ub: number | null;
  piezas: number;
  ticket_promedio: number;
  error?: string;
};

type CabinaData = Record<string, PaisData>;

type MarketingData = {
  registros:     { nuevos_mes: number; total_base: number };
  transacciones: { clientes_activos: number; venta_loyalty: number; transacciones: number; piezas: number };
  puntos: {
    ganados_pos: number; monto_pos: number; clientes_pos: number;
    ganados_ecom: number; monto_ecom: number;
    ganados_app: number; monto_app: number;
    ganados_total: number;
    redimidos_pos: number; monto_red_pos: number; clientes_redim: number;
    redimidos_app: number; monto_red_app: number;
    redimidos_gift: number; monto_red_gift: number;
    redimidos_total: number; monto_redimidos_total: number;
    por_canal: { canal: string; ganados: number; monto_g: number; redimidos: number; monto_r: number }[];
  };
};

type OperacionesRow = {
  num_tiendas: number;
  num_tickets: number;
  piezas: number;
  venta: number;
  ticket_promedio: number;
  pzas_ticket: number;
  vta_prom_tienda: number;
  conversion_pct: number | null;
  trafico_total: number | null;
  error?: string;
};

type OperacionesData = {
  data: Record<string, OperacionesRow>;
  latam: { ticket_promedio: number; pzas_ticket: number; vta_prom_tienda: number };
};

type ComercialData = {
  MX: {
    sell_thru: number | null;
    skus_tiendas: number | null;
    skus_almacen: number | null;
    stock_tienda_pzas: number | null;
    stock_tienda_valor: number | null;
    precio_promedio: number | null;
    piezas_mes: number;
    stock_total_pzas: number;
    cedis_stock_pzas: number | null;
    num_tiendas: number;
  };
};

type LogisticaData = {
  MX: {
    fill_rate_pct: number | null;
    skus_surtidos: number | null;
    skus_ideal: number | null;
    tiendas_ok_fill: number | null;
    total_tiendas: number | null;
    cedis_lf_pzas: number | null;
    cedis_tr_pzas: number | null;
    cedis_ou_pzas: number | null;
    cedis_total_pzas: number | null;
    cedis_meses: number | null;
    piezas_mes: number;
    venta_diaria: number;
  };
};

// ─── constantes ───────────────────────────────────────────────────────────────

const PAISES = ["MX", "CO", "PE", "CL", "AR"] as const;

const FLAG: Record<string, string> = {
  MX: "🇲🇽", CO: "🇨🇴", PE: "🇵🇪", CL: "🇨🇱", AR: "🇦🇷",
};

const NOMBRE: Record<string, string> = {
  MX: "México", CO: "Colombia", PE: "Perú", CL: "Chile", AR: "Argentina",
};

const MONEDA: Record<string, string> = {
  MX: "MXN", CO: "COP", PE: "PEN", CL: "CLP", AR: "ARS",
};

const MESES = ["Ene","Feb","Mar","Abr","May","Jun","Jul","Ago","Sep","Oct","Nov","Dic"];

const AREAS = [
  { id: "finanzas",    label: "Finanzas"    },
  { id: "operaciones", label: "Operaciones" },
  { id: "comercial",   label: "Comercial"   },
  { id: "logistica",   label: "Logística"   },
  { id: "rrhh",        label: "RRHH"        },
  { id: "marketing",   label: "Marketing"   },
  { id: "auditoria",   label: "Auditoría"   },
];

const NOW = new Date();

// Tramos de Cadena — fuente: Diccionario_Datos_Tecnico_v5.2 · pestaña 🎯 Tramos de Cadena
const TRAMOS: Record<string, { prod: number; onStock: number; porCargar: number; transito: number; cedis: number; transTienda: number; tiendas: number; total: number }> = {
  MX: { prod: 12, onStock: 3, porCargar: 1, transito: 6,  cedis: 7,  transTienda: 2, tiendas: 10, total: 41 },
  CO: { prod: 12, onStock: 3, porCargar: 1, transito: 5,  cedis: 9,  transTienda: 1, tiendas: 12, total: 43 },
  CL: { prod: 12, onStock: 3, porCargar: 1, transito: 8,  cedis: 9,  transTienda: 1, tiendas: 9,  total: 43 },
  PE: { prod: 12, onStock: 3, porCargar: 1, transito: 7,  cedis: 12, transTienda: 1, tiendas: 12, total: 48 },
  AR: { prod: 12, onStock: 5, porCargar: 1, transito: 8,  cedis: 10, transTienda: 1, tiendas: 10, total: 47 },
};

// ─── Catálogo KPIs — Diccionario Empresarial v5.2 (170 KPIs) ─────────────────
// Fuente de verdad: Diccionario_Empresarial_v5.2.md
// Estatus:
//   live     = dato en vivo en el BI (Redshift conectado)
//   redshift = tabla confirmada en Redshift, pendiente conectar al BI
//   plan     = solo tabla plan_kpi_* disponible (targets, sin transaccional)
//   missing  = sin tabla identificada en Redshift — pendiente TI/MDM

type KpiStatus = "live" | "redshift" | "plan" | "missing";
interface KpiEntry { id: string; label: string; status: KpiStatus; source?: string; }

const KPI_CATALOG: Record<string, KpiEntry[]> = {

  finanzas: [
    { id: "KPI-FIN-001", label: "Facturación Total ($)",              status: "live" },
    { id: "KPI-FIN-002", label: "Facturación MT ($)",                 status: "live" },
    { id: "KPI-FIN-003", label: "Facturación Total Piezas",           status: "live" },
    { id: "KPI-FIN-004", label: "Facturación MT Piezas",              status: "redshift", source: "h_ventas_sap_mes" },
    { id: "KPI-FIN-005", label: "% Crec. MTs vs año anterior",        status: "live" },
    { id: "KPI-FIN-006", label: "Costo de Ventas $",                  status: "live" },
    { id: "KPI-FIN-007", label: "Costo de Ventas %",                  status: "live" },
    { id: "KPI-FIN-008", label: "Costo de Almacén $",                 status: "missing" },
    { id: "KPI-FIN-009", label: "Costo de Almacén %",                 status: "missing" },
    { id: "KPI-FIN-010", label: "Gasto Nómina Almacén $",             status: "missing" },
    { id: "KPI-FIN-011", label: "Gasto Nómina Almacén %",             status: "missing" },
    { id: "KPI-FIN-012", label: "Costo Total $",                      status: "missing" },
    { id: "KPI-FIN-013", label: "Costo Total %",                      status: "missing" },
    { id: "KPI-FIN-014", label: "Utilidad Marginal $ (UB)",           status: "live" },
    { id: "KPI-FIN-015", label: "Utilidad Marginal %",                status: "live" },
    { id: "KPI-FIN-016", label: "Gastos Operativos $",                status: "missing" },
    { id: "KPI-FIN-017", label: "Gastos Operativos %",                status: "missing" },
    { id: "KPI-FIN-018", label: "Gasto Nómina Operativa $",           status: "missing" },
    { id: "KPI-FIN-019", label: "Gastos Nómina Operativa %",          status: "missing" },
    { id: "KPI-FIN-020", label: "Gastos Ocupación $",                 status: "missing" },
    { id: "KPI-FIN-021", label: "Gastos Ocupación %",                 status: "missing" },
    { id: "KPI-FIN-022", label: "Gasto Operativo Distribución",       status: "missing" },
    { id: "KPI-FIN-023", label: "Total Gastos de Operación",          status: "missing" },
    { id: "KPI-FIN-024", label: "EBITDA Tienda $",                    status: "missing" },
    { id: "KPI-FIN-025", label: "EBITDA Tienda %",                    status: "missing" },
    { id: "KPI-FIN-026", label: "Gastos Corporativos Gestión $",      status: "missing" },
    { id: "KPI-FIN-027", label: "Gastos Corporativos Gestión %",      status: "missing" },
    { id: "KPI-FIN-028", label: "EBITDA División $",                  status: "missing" },
    { id: "KPI-FIN-029", label: "EBITDA División (var.)",             status: "missing" },
    { id: "KPI-FIN-030", label: "EBITDA División %",                  status: "missing" },
    { id: "KPI-FIN-031", label: "Gastos Financieros (intereses)",     status: "missing" },
    { id: "KPI-FIN-032", label: "D&A",                                status: "missing" },
    { id: "KPI-FIN-033", label: "Impuestos",                          status: "missing" },
    { id: "KPI-FIN-034", label: "Utilidad Neta $",                    status: "missing" },
    { id: "KPI-FIN-035", label: "Utilidad Neta %",                    status: "missing" },
    { id: "KPI-FIN-036", label: "Free Cash Flow",                     status: "missing" },
    { id: "KPI-FIN-037", label: "Tasa (Spread bancario)",             status: "missing" },
    { id: "KPI-FIN-038", label: "Deuda",                              status: "missing" },
    { id: "KPI-FIN-039", label: "Apalancamiento vs Deuda",            status: "missing" },
    { id: "KPI-FIN-040", label: "Montos Seguros por Recuperar",       status: "missing" },
    { id: "KPI-FIN-041", label: "Venta Blind Lab",                    status: "missing" },
    { id: "KPI-FIN-042", label: "Venta Online (e-commerce)",          status: "missing" },
    { id: "KPI-FIN-043", label: "Venta Marketplaces",                 status: "missing" },
    { id: "KPI-FIN-044", label: "Venta Coppel",                       status: "missing" },
  ],

  operaciones: [
    { id: "KPI-OPS-001", label: "Cumplimiento presupuesto",           status: "plan",     source: "plan_kpi_operaciones" },
    { id: "KPI-OPS-002", label: "Ticket promedio",                    status: "live" },
    { id: "KPI-OPS-003", label: "Pzas por ticket",                    status: "live" },
    { id: "KPI-OPS-004", label: "Conversión",                         status: "redshift", source: "h_trafico_diario" },
    { id: "KPI-OPS-005", label: "Venta promedio por tienda",          status: "live" },
    { id: "KPI-OPS-006", label: "Clientes (tickets)",                 status: "live" },
    { id: "KPI-OPS-007", label: "SKUs sin exhibir",                   status: "missing" },
    { id: "KPI-OPS-008", label: "36 hrs (entregas en tiempo)",        status: "missing" },
    { id: "KPI-OPS-009", label: "Venta adicional",                    status: "missing" },
    { id: "KPI-OPS-010", label: "Calificación trade tiendas",         status: "missing" },
    { id: "KPI-OPS-011", label: "% De comisiones",                    status: "missing" },
    { id: "KPI-OPS-012", label: "% Tiendas cobraron bono",            status: "plan",     source: "plan_kpi_operaciones" },
    { id: "KPI-OPS-013", label: "Mejor región vs presupuesto",        status: "plan",     source: "plan_kpi_operaciones" },
    { id: "KPI-OPS-014", label: "Peor región vs presupuesto",         status: "plan",     source: "plan_kpi_operaciones" },
    { id: "KPI-OPS-015", label: "% Faltante inventarios",             status: "missing" },
    { id: "KPI-OPS-016", label: "% Ajustes (devoluciones)",           status: "redshift", source: "h_ventas_sap_mes" },
    { id: "KPI-OPS-017", label: "On Time entregas almacén-tiendas",   status: "missing" },
    { id: "KPI-OPS-018", label: "Tickets mesa de control",            status: "missing" },
    { id: "KPI-OPS-019", label: "Calificación Checklist",             status: "missing" },
  ],

  marketing: [
    { id: "KPI-MKT-001", label: "Visitas tiendas",                    status: "redshift", source: "h_trafico_diario" },
    { id: "KPI-MKT-002", label: "Sensores tiendas (actual)",          status: "missing" },
    { id: "KPI-MKT-003", label: "Sensores tiendas (pasado)",          status: "missing" },
    { id: "KPI-MKT-004", label: "Visitas tiendas año anterior",       status: "missing" },
    { id: "KPI-MKT-005", label: "Registros nuevos Loyalty",           status: "live" },
    { id: "KPI-MKT-006", label: "Puntos Redimidos POS",               status: "live" },
    { id: "KPI-MKT-007", label: "Puntos Redimidos E-COMM",            status: "live" },
    { id: "KPI-MKT-008", label: "Puntos Redimidos APP",               status: "live" },
    { id: "KPI-MKT-009", label: "Monto puntos Redimidos",             status: "live" },
    { id: "KPI-MKT-010", label: "Ventas Total Marketing",             status: "missing" },
    { id: "KPI-MKT-011", label: "% Redención pts vs venta total",     status: "live" },
    { id: "KPI-MKT-012", label: "Frecuencia compra top loyalty",      status: "redshift", source: "loy_customers_transactions" },
    { id: "KPI-MKT-013", label: "Tickets registrados MinisoLove",     status: "live" },
    { id: "KPI-MKT-014", label: "% Participación tickets MinisoLove", status: "redshift", source: "loy_customers_transactions" },
    { id: "KPI-MKT-015", label: "Total venta MinisoLove",             status: "live" },
    { id: "KPI-MKT-016", label: "% Part. venta MinisoLove",           status: "live" },
    { id: "KPI-MKT-017", label: "Top POS del mes",                    status: "missing" },
    { id: "KPI-MKT-018", label: "Clientes +1 compra en 180 días",     status: "redshift", source: "loy_customers_transactions" },
    { id: "KPI-MKT-019", label: "Clientes +2 compras en 180 días",    status: "redshift", source: "loy_customers_transactions" },
  ],

  comercial: [
    { id: "KPI-COM-001", label: "Precio promedio",                    status: "live" },
    { id: "KPI-COM-002", label: "Stock Rebajas %",                    status: "missing" },
    { id: "KPI-COM-003", label: "Piezas Rebajas %",                   status: "missing" },
    { id: "KPI-COM-004", label: "Venta Rebajas %",                    status: "missing" },
    { id: "KPI-COM-005", label: "Sell Thru General",                  status: "live" },
    { id: "KPI-COM-006", label: "Sell Thru año anterior",             status: "redshift", source: "tb_h_ventas_inventario_dimsuc_dimprod" },
    { id: "KPI-COM-007", label: "% Venta producción nacional",        status: "missing" },
    { id: "KPI-COM-008", label: "Promedio SKUs en tiendas",           status: "live" },
    { id: "KPI-COM-009", label: "Promedio SKUs en Almacén",           status: "live" },
    { id: "KPI-COM-010", label: "SKU <3 pzas en CEDIS",              status: "redshift", source: "tb_h_ventas_inventario_dimsuc_dimprod" },
    { id: "KPI-COM-011", label: "SKUs <3 pzas en Tiendas",           status: "redshift", source: "tb_h_ventas_inventario_dimsuc_dimprod" },
    { id: "KPI-COM-012", label: "Stock prom/tienda (pzas)",           status: "live" },
    { id: "KPI-COM-013", label: "Stock prom/tienda ($)",              status: "live" },
  ],

  logistica: [
    { id: "KPI-LOG-001", label: "Inv CEDIS disponible (pzas)",        status: "live" },
    { id: "KPI-LOG-002", label: "% Gasto distribución vs venta",      status: "missing" },
    { id: "KPI-LOG-003", label: "Fill Rate surtimiento",              status: "live" },
    { id: "KPI-LOG-004", label: "OTP15",                              status: "missing" },
    { id: "KPI-LOG-005", label: "Total piezas surtidas a tiendas",    status: "redshift", source: "tb_h_ventas_inventario_dimsuc_dimprod" },
    { id: "KPI-LOG-006", label: "Promedio almacenaje/semana",         status: "missing" },
    { id: "KPI-LOG-007", label: "Costo/pieza etiquetado",             status: "missing" },
    { id: "KPI-LOG-008", label: "Costo/pieza almacenada",             status: "missing" },
    { id: "KPI-LOG-009", label: "Costo/pieza surtida",                status: "missing" },
    { id: "KPI-LOG-010", label: "Costo/pieza distribución",           status: "missing" },
    { id: "KPI-LOG-011", label: "% Carga en CEDIS (pzas)",            status: "redshift", source: "tb_h_ventas_inventario_dimsuc_dimprod" },
    { id: "KPI-LOG-012", label: "Inventario en China (pzas)",         status: "missing" },
    { id: "KPI-LOG-013", label: "Total inventario (pzas)",            status: "redshift", source: "tb_h_ventas_inventario_dimsuc_dimprod" },
    { id: "KPI-LOG-014", label: "Inventario tiendas (pzas)",          status: "redshift", source: "tb_h_ventas_inventario_dimsuc_dimprod" },
    { id: "KPI-LOG-015", label: "Inv tránsito tiendas (pzas)",        status: "redshift", source: "tb_h_ventas_inventario_dimsuc_dimprod" },
    { id: "KPI-LOG-016", label: "Inv no disponible aduana (pzas)",    status: "missing" },
    { id: "KPI-LOG-017", label: "Inv en tránsito China (pzas)",       status: "missing" },
    { id: "KPI-LOG-018", label: "Inv no disponible país (pzas)",      status: "redshift", source: "tb_h_ventas_inventario_dimsuc_dimprod" },
    { id: "KPI-LOG-019", label: "Total inventario (meses)",           status: "redshift", source: "tb_h_ventas_inventario_dimsuc_dimprod" },
    { id: "KPI-LOG-020", label: "Inventario tiendas (meses)",         status: "redshift", source: "tb_h_ventas_inventario_dimsuc_dimprod" },
    { id: "KPI-LOG-021", label: "Inv tránsito tiendas (meses)",       status: "redshift", source: "tb_h_ventas_inventario_dimsuc_dimprod" },
    { id: "KPI-LOG-022", label: "Inv CEDIS disponible (meses)",       status: "live" },
    { id: "KPI-LOG-023", label: "Inv no disp. aduana (meses)",        status: "missing" },
    { id: "KPI-LOG-024", label: "Inv en tránsito China (meses)",      status: "missing" },
    { id: "KPI-LOG-025", label: "Inv lib. pendiente zarpar (meses)",  status: "missing" },
    { id: "KPI-LOG-026", label: "Inv no disponible país (meses)",     status: "redshift", source: "tb_h_ventas_inventario_dimsuc_dimprod" },
    { id: "KPI-LOG-027", label: "Inventario en China (meses)",        status: "missing" },
    { id: "KPI-LOG-028", label: "OTB (Open To Buy)",                  status: "missing" },
    { id: "KPI-LOG-029", label: "Stock CEDIS disponible (MAX OnHand)", status: "redshift", source: "OITW (SAP)" },
    { id: "KPI-LOG-030", label: "Cobertura stock envío tiendas",      status: "redshift", source: "tb_h_ventas_inventario_dimsuc_dimprod" },
    { id: "KPI-LOG-031", label: "Sell-through stock envío",           status: "redshift", source: "tb_h_ventas_inventario_dimsuc_dimprod" },
    { id: "KPI-LOG-032", label: "Piezas pendientes despacho",         status: "redshift", source: "tb_h_ventas_inventario_dimsuc_dimprod" },
    { id: "KPI-LOG-033", label: "Semanas cobertura tiendas",          status: "redshift", source: "tb_h_ventas_inventario_dimsuc_dimprod" },
    { id: "KPI-LOG-034", label: "Nivel servicio CEDIS",               status: "missing" },
  ],

  rrhh: [
    { id: "KPI-RH-001", label: "Calificación satisfacción compañía",  status: "plan", source: "plan_kpi_recursos_humanos" },
    { id: "KPI-RH-002", label: "Bajas mes — Corporativo",             status: "plan", source: "plan_kpi_recursos_humanos" },
    { id: "KPI-RH-003", label: "Activos promedio — Corporativo",      status: "plan", source: "plan_kpi_recursos_humanos" },
    { id: "KPI-RH-004", label: "Rotación Corporativo",                status: "plan", source: "plan_kpi_recursos_humanos" },
    { id: "KPI-RH-005", label: "Bajas mes — Almacén Operativo",       status: "plan", source: "plan_kpi_recursos_humanos" },
    { id: "KPI-RH-006", label: "Activos prom. — Almacén Operativo",   status: "plan", source: "plan_kpi_recursos_humanos" },
    { id: "KPI-RH-007", label: "Rotación operativa almacén",          status: "plan", source: "plan_kpi_recursos_humanos" },
    { id: "KPI-RH-008", label: "Bajas mes — Maquila Almacén",         status: "plan", source: "plan_kpi_recursos_humanos" },
    { id: "KPI-RH-009", label: "Activos promedio — Maquila",          status: "plan", source: "plan_kpi_recursos_humanos" },
    { id: "KPI-RH-010", label: "Rotación maquila almacén",            status: "plan", source: "plan_kpi_recursos_humanos" },
    { id: "KPI-RH-011", label: "Bajas mes — General Tiendas",         status: "plan", source: "plan_kpi_recursos_humanos" },
    { id: "KPI-RH-012", label: "Activos prom. — Gral. Tiendas",       status: "plan", source: "plan_kpi_recursos_humanos" },
    { id: "KPI-RH-013", label: "Rotación general tiendas",            status: "plan", source: "plan_kpi_recursos_humanos" },
    { id: "KPI-RH-014", label: "Bajas mes — Gerente Tiendas",         status: "plan", source: "plan_kpi_recursos_humanos" },
    { id: "KPI-RH-015", label: "Activos promedio — Gerentes",         status: "plan", source: "plan_kpi_recursos_humanos" },
    { id: "KPI-RH-016", label: "Rotación gerentes tiendas",           status: "plan", source: "plan_kpi_recursos_humanos" },
    { id: "KPI-RH-017", label: "Promedio empleados x tienda",         status: "plan", source: "plan_kpi_recursos_humanos" },
    { id: "KPI-RH-018", label: "Promedio empleados x venta",          status: "plan", source: "plan_kpi_recursos_humanos" },
    { id: "KPI-RH-019", label: "Retención personal <90 días",         status: "plan", source: "plan_kpi_recursos_humanos" },
    { id: "KPI-RH-020", label: "T. prom. contratación Gerenciales",   status: "plan", source: "plan_kpi_recursos_humanos" },
    { id: "KPI-RH-021", label: "T. prom. contratación Promotores",    status: "plan", source: "plan_kpi_recursos_humanos" },
    { id: "KPI-RH-022", label: "Vacantes Subgerente",                 status: "plan", source: "plan_kpi_recursos_humanos" },
    { id: "KPI-RH-023", label: "Vacantes Gerente",                    status: "plan", source: "plan_kpi_recursos_humanos" },
    { id: "KPI-RH-024", label: "% Cobertura interna gerenciales",     status: "plan", source: "plan_kpi_recursos_humanos" },
    { id: "KPI-RH-025", label: "% Cobertura plantilla tienda",        status: "plan", source: "plan_kpi_recursos_humanos" },
    { id: "KPI-RH-026", label: "% Cobertura plantilla almacén",       status: "plan", source: "plan_kpi_recursos_humanos" },
    { id: "KPI-RH-027", label: "Alcance comisión Promotor",           status: "plan", source: "plan_kpi_recursos_humanos" },
    { id: "KPI-RH-028", label: "Target proyectado Promotor",          status: "plan", source: "plan_kpi_recursos_humanos" },
    { id: "KPI-RH-029", label: "% Alcance comp. variable Promotores", status: "plan", source: "plan_kpi_recursos_humanos" },
    { id: "KPI-RH-030", label: "Alcance comisión Subgerente",         status: "plan", source: "plan_kpi_recursos_humanos" },
    { id: "KPI-RH-031", label: "Target proyectado Subgerente",        status: "plan", source: "plan_kpi_recursos_humanos" },
    { id: "KPI-RH-032", label: "% Alcance comp. var. Subgerentes",    status: "plan", source: "plan_kpi_recursos_humanos" },
    { id: "KPI-RH-033", label: "Alcance comisión Gerente",            status: "plan", source: "plan_kpi_recursos_humanos" },
    { id: "KPI-RH-034", label: "Target proyectado Gerente",           status: "plan", source: "plan_kpi_recursos_humanos" },
    { id: "KPI-RH-035", label: "% Alcance comp. variable Gerentes",   status: "plan", source: "plan_kpi_recursos_humanos" },
  ],

  auditoria: [
    { id: "KPI-AUD-001", label: "Robo tiendas",                       status: "plan", source: "plan_kpi_auditoria" },
    { id: "KPI-AUD-002", label: "Merma tiendas",                      status: "plan", source: "plan_kpi_auditoria" },
    { id: "KPI-AUD-003", label: "Caducados tienda",                   status: "plan", source: "plan_kpi_auditoria" },
    { id: "KPI-AUD-004", label: "Eventos farderos",                   status: "plan", source: "plan_kpi_auditoria" },
    { id: "KPI-AUD-005", label: "Eventos robo interno",               status: "plan", source: "plan_kpi_auditoria" },
    { id: "KPI-AUD-006", label: "Robo de camión",                     status: "plan", source: "plan_kpi_auditoria" },
  ],
};

// ─── formatters ───────────────────────────────────────────────────────────────

// Regla de formato: un decimal en toda la Cabina.
// Única excepción: fmtPctS usa dos decimales cuando el valor es menor a 1%,
// porque con uno solo un 0.02% se leería como 0.0% y parecería que no hay dato.
function fmtMoney(n: number | null): string {
  if (n == null) return "—";
  if (n === 0) return "$0";
  const abs = Math.abs(n);
  const sign = n < 0 ? "-" : "";
  if (abs >= 1_000_000_000) return `${sign}$${(abs / 1_000_000_000).toFixed(1)}B`;
  if (abs >= 1_000_000)     return `${sign}$${(abs / 1_000_000).toFixed(1)}M`;
  if (abs >= 1_000)         return `${sign}$${(abs / 1_000).toFixed(0)}K`;
  return `${sign}$${abs.toFixed(0)}`;
}

function fmtNum(n: number | null): string {
  if (n == null) return "—";
  const abs = Math.abs(n);
  const sign = n < 0 ? "-" : "";
  if (abs >= 1_000_000) return `${sign}${(abs / 1_000_000).toFixed(1)}M`;
  if (abs >= 1_000)     return `${sign}${(abs / 1_000).toFixed(0)}K`;
  // antes: n.toString(), que sacaba cosas como 7.60602333347272
  return Number.isInteger(n) ? String(n) : `${sign}${abs.toFixed(1)}`;
}

function fmtPct(n: number | null): string {
  if (n == null) return "—";
  return `${Number(n).toFixed(1)}%`;
}

// ─── ranking semáforo ─────────────────────────────────────────────────────────

type Rank = "best" | "worst" | "mid" | "none";

function getRanks(
  data: CabinaData,
  key: keyof PaisData,
  higherIsBetter: boolean
): Record<string, Rank> {
  const vals = PAISES.map((p) => {
    const row = data[p];
    if (!row || row.error) return null;
    const v = row[key];
    return v != null ? { pais: p, val: Number(v) } : null;
  }).filter(Boolean) as { pais: string; val: number }[];

  if (vals.length < 2) return {};
  const sorted = [...vals].sort((a, b) => b.val - a.val);
  const result: Record<string, Rank> = {};
  PAISES.forEach((p) => { result[p] = "mid"; });
  result[higherIsBetter ? sorted[0].pais : sorted[sorted.length - 1].pais] = "best";
  result[higherIsBetter ? sorted[sorted.length - 1].pais : sorted[0].pais] = "worst";
  return result;
}

// ─── celda de valor con semáforo ──────────────────────────────────────────────

function Cell({ value, rank }: { value: string; rank: Rank }) {
  if (value === "—") return <span style={{ color: "var(--text-4)" }}>—</span>;
  const color =
    rank === "best"  ? "var(--green)" :
    rank === "worst" ? "var(--rose)"  : "var(--text-2)";
  const arrow =
    rank === "best"  ? <span style={{ color: "var(--green)", fontSize: 11, marginLeft: 2 }}>▲</span> :
    rank === "worst" ? <span style={{ color: "var(--rose)",  fontSize: 11, marginLeft: 2 }}>▼</span> :
    null;
  return (
    <span style={{ color, fontWeight: rank !== "mid" ? 500 : 400 }}>
      {value}{arrow}
    </span>
  );
}

// ─── badge pendiente ──────────────────────────────────────────────────────────

function BadgePending() {
  return (
    <span style={{
      background: "#1a1300", border: "0.5px solid #92400e",
      color: "#fbbf24", fontSize: 10, padding: "2px 8px", borderRadius: 10, marginLeft: 4,
    }}>pendiente Redshift</span>
  );
}

// ─── componente principal ─────────────────────────────────────────────────────

export default function Cabina() {
  // La Cabina abre en el mes anterior al corriente: es el último mes cerrado.
  // El mes en curso siempre está incompleto y se prestaba a leerlo como cierre.
  // new Date maneja solo el cambio de año: en enero devuelve diciembre del previo.
  const MES_CERRADO = new Date(NOW.getFullYear(), NOW.getMonth() - 1, 1);
  const [year,  setYear]  = useState(MES_CERRADO.getFullYear());
  const [month, setMonth] = useState(MES_CERRADO.getMonth() + 1);
  const [ptype, setPtype] = useState("mes"); // mes | ytd | ltm
  type MvRow = Record<string, number | string | null>;
  const [mvData, setMvData] = useState<Record<string, Record<string, MvRow>>>({});
  const [mvMes,  setMvMes]  = useState<Record<string, string>>({});
  // período real por país y por área. La API ya lo devuelve; antes se descartaba.
  const [mvPais, setMvPais] = useState<Record<string, Record<string, string>>>({});
  const [mvDataAA, setMvDataAA] = useState<Record<string, Record<string, MvRow>>>({});
  const [secMode, setSecMode] = useState<string>("imp");
  const [mvErr, setMvErr] = useState<Record<string, string>>({});
  const [mvCargando, setMvCargando] = useState<Record<string, boolean>>({});
  const [recarga, setRecarga] = useState(0);
  const [movil, setMovil] = useState(false);
  const [paisMovil, setPaisMovil] = useState<string>(PAISES[0]);
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 768px)");
    const aplicar = () => { setMovil(mq.matches); if (mq.matches) setSecMode("var"); };
    aplicar();
    mq.addEventListener("change", aplicar);
    return () => mq.removeEventListener("change", aplicar);
  }, []);

  const MV_DE_AREA: Record<string, string> = { finanzas: "finanzas", operaciones: "operaciones", comercial: "comercial", logistica: "logistica", marketing: "marketing", rrhh: "rh", auditoria: "auditoria" };
  const [selPaises, setSelPaises] = useState<string[]>([...PAISES]);
  const paisesVis = PAISES.filter((p) => selPaises.includes(p));
  const togglePais = (p: string) => {
    setSelPaises((prev) =>
      prev.length === PAISES.length ? [p] :
      prev.includes(p)
        ? (prev.length > 1 ? prev.filter((x) => x !== p) : [...PAISES])
        : [...prev, p]
    );
  };
  const [data,  setData]  = useState<CabinaData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [area, setArea] = useState("finanzas");

  // Marketing — loyalty MinisoLove
  const [mktData,    setMktData]    = useState<MarketingData | null>(null);
  const [mktLoading, setMktLoading] = useState(false);
  const [mktError,   setMktError]   = useState<string | null>(null);

  // Operaciones
  const [opsData,    setOpsData]    = useState<OperacionesData | null>(null);
  const [opsLoading, setOpsLoading] = useState(false);
  const [opsError,   setOpsError]   = useState<string | null>(null);

  // Comercial
  const [comData,    setComData]    = useState<ComercialData | null>(null);
  const [comLoading, setComLoading] = useState(false);
  const [comError,   setComError]   = useState<string | null>(null);

  // Logística
  const [logData,    setLogData]    = useState<LogisticaData | null>(null);
  const [logLoading, setLogLoading] = useState(false);
  const [logError,   setLogError]   = useState<string | null>(null);

  // Claude
  const [pregunta, setPregunta]   = useState("");
  const [respuesta, setRespuesta] = useState("");
  const [iaLoading, setIaLoading] = useState(false);

  // Sprint 15 — se eliminaron las 5 cargas de /api/cabina, /api/marketing, /api/operaciones,
  // /api/comercial y /api/logistica: desde el Sprint 14 las 7 áreas leen de /api/mv y esos
  // resultados ya no se usaban en el render. Eran 5 consultas a Redshift por carga que
  // saturaban la conexión y dejaban en cola la consulta del área activa.

  // Sprint 12 — carga genérica de la vista materializada del área activa
  useEffect(() => {
    const MVAREA: Record<string, string> = {
      finanzas: "finanzas", operaciones: "operaciones", comercial: "comercial",
      logistica: "logistica", marketing: "marketing", rrhh: "rh", auditoria: "auditoria",
    };
    const mv = MVAREA[area];
    if (!mv) return;
    let vivo = true;
    setMvCargando((prev) => ({ ...prev, [mv]: true }));
    fetch(`/api/mv?area=${mv}&year=${year}&month=${month}`)
      .then((r) => r.json())
      .then((d) => {
        if (!vivo) return;
        if (!d.ok) { setMvErr((prev) => ({ ...prev, [mv]: String(d.error || "error") })); return; }
        setMvErr((prev) => ({ ...prev, [mv]: "" }));
        setMvData((prev) => ({ ...prev, [mv]: d.data || {} }));
        setMvMes((prev) => ({ ...prev, [mv]: d.periodoUsado || "" }));
        setMvPais((prev) => ({ ...prev, [mv]: d.periodoPorPais || {} }));
      })
      .catch((e) => { if (vivo) setMvErr((prev) => ({ ...prev, [mv]: "No se pudo conectar: " + (e?.message || "error de red") })); })
      .finally(() => { if (vivo) setMvCargando((prev) => ({ ...prev, [mv]: false })); });
    return () => { vivo = false; };
  }, [area, year, month, recarga]);

  async function preguntarIA() {
    if (!pregunta.trim()) return;
    setIaLoading(true);
    setRespuesta("");
    try {
      // Ago 21, 2026 — antes se enviaba `data`, un estado que quedó huérfano al
      // desconectar /api/cabina en el Sprint 15: nunca se llenaba, así que la
      // barra mandaba null y Claude contestaba "no hay datos cargados".
      // Ahora se envía el área que el usuario está viendo, con su período real.
      const MVAREA3: Record<string, string> = {
        finanzas: "finanzas", operaciones: "operaciones", comercial: "comercial",
        logistica: "logistica", marketing: "marketing", rrhh: "rh", auditoria: "auditoria",
      };
      const mvAct = MVAREA3[area] || "finanzas";
      const res = await fetch("/api/claude", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          pregunta,
          area: AREAS.find((a) => a.id === area)?.label || area,
          datos: mvData[mvAct] || {},
          periodoPorPais: mvPais[mvAct] || {},
          paisesVisibles: paisesVis,
          pais: `LATAM (${MESES[month - 1]} ${year})`,
        }),
      });
      const d = await res.json();
      setRespuesta(d.respuesta || d.error || "Sin respuesta");
    } catch (e) {
      setRespuesta(e instanceof Error ? e.message : "Error");
    } finally {
      setIaLoading(false);
    }
  }


  // Sprint 12 — accessor único para cualquier MV
  const mv = (mvName: string, pais: string, field: string, mode?: string): string => {
    const r = mvData[mvName]?.[pais];
    if (!r) return "—";
    const raw = r[field];
    if (raw == null) return "—";
    if (typeof raw === "string") return raw;
    const v = Number(raw);
    if (Number.isNaN(v)) return "—";
    if (mode === "pct")   return fmtPct(v * 100);
    if (mode === "pctd")  return fmtPct(v);
    if (mode === "money") return fmtMoney(v);
    if (mode === "abs")   return fmtNum(Math.abs(v));
    if (mode === "dec")   return v.toFixed(1);
    if (mode === "dec2")  return v.toFixed(1);
    return fmtNum(v);
  };
  const rhVal  = (p: string, f: string, m?: string) => mv("rh", p, f, m);
  const audVal = (p: string, f: string, m?: string) => mv("auditoria", p, f, m);
  const finVal = (p: string, f: string, m?: string) => mv("finanzas", p, f, m);
  const finNum = (p: string, f: string): number | null => { const r = mvData["finanzas"]?.[p]; const v = r?.[f]; if (v == null || typeof v === "string") return null; const n = Number(v); return Number.isNaN(n) ? null : n; };
  const opsVal = (p: string, f: string, m?: string) => mv("operaciones", p, f, m);
  const comVal = (p: string, f: string, m?: string) => mv("comercial", p, f, m);
  const logVal = (p: string, f: string, m?: string) => mv("logistica", p, f, m);
  const mktVal = (p: string, f: string, m?: string) => mv("marketing", p, f, m);
  const mvHas  = (n: string) => Object.keys(mvData[n] || {}).length > 0;
  const cargandoArea = !!mvCargando[MV_DE_AREA[area] || ""];

  // Sprint 14 — comparativo contra el mismo mes del año anterior
  const crudo = (src: Record<string, Record<string, MvRow>>, mvName: string, pais: string, campo: string): number | null => {
    const v = src[mvName]?.[pais]?.[campo];
    if (v == null || typeof v === "string") return null;
    const n = Number(v);
    return Number.isNaN(n) ? null : n;
  };
  const fmtPctS = (v: number | null): string =>
    v == null ? "—" : (Math.abs(v) > 0 && Math.abs(v) < 1 ? v.toFixed(2) + "%" : fmtPct(v));
  const fmtModo = (v: number | null, modo?: string): string => {
    if (v == null) return "—";
    if (modo === "pct")   return fmtPct(v * 100);
    if (modo === "pctd")  return fmtPct(v);
    if (modo === "money") return fmtMoney(v);
    if (modo === "abs")   return fmtNum(Math.abs(v));
    if (modo === "dec")   return v.toFixed(1);
    if (modo === "dec2")  return v.toFixed(1);
    return fmtNum(v);
  };
  const colorVar = (d: number, dir?: string): string => {
    if (!dir) return "var(--text-3)";
    const bueno = dir === "up" ? d >= 0 : d <= 0;
    return bueno ? "var(--green)" : "var(--rose)";
  };
  // el año anterior se consulta siempre: la flecha de dirección lo necesita en los tres modos
  useEffect(() => {
    const MVAREA2: Record<string, string> = {
      finanzas: "finanzas", operaciones: "operaciones", comercial: "comercial",
      logistica: "logistica", marketing: "marketing", rrhh: "rh", auditoria: "auditoria",
    };
    const mv = MVAREA2[area];
    if (!mv || mvDataAA[mv]) return;
    let vivo = true;
    fetch(`/api/mv?area=${mv}&year=${year - 1}&month=${month}`)
      .then((r) => r.json())
      .then((d) => { if (vivo && d.ok) setMvDataAA((prev) => ({ ...prev, [mv]: d.data || {} })); })
      .catch(() => {});
    return () => { vivo = false; };
  }, [area, year, month, recarga]);

  const avisoArea = (mvName: string, etiqueta: string) => {
    const err = mvErr[mvName];
    if (err) {
      const permiso = err.toLowerCase().includes("permission");
      return (
        <div style={{
          background: permiso ? "var(--red-bg)" : "rgba(226,85,85,0.08)",
          border: "0.5px solid var(--red-border)", borderRadius: 6,
          padding: "8px 12px", fontSize: 11, color: "var(--rose)", marginBottom: 10, lineHeight: 1.5,
        }}>
          {permiso
            ? <>Sin acceso a <b>mv_cc_{mvName}</b>. Los datos existen en el origen pero el usuario del BI no tiene permiso de lectura — falta el GRANT SELECT. Solicitado a TI.</>
            : <>No se pudo leer <b>mv_cc_{mvName}</b>: {err}</>}
        </div>
      );
    }
    if (mvCargando[mvName] && !mvHas(mvName)) {
      return <div style={{ fontSize: 11, color: "var(--text-4)", marginBottom: 10 }}>Cargando {etiqueta}…</div>;
    }
    if (!mvHas(mvName)) {
      return (
        <div style={{ fontSize: 11, color: "var(--text-4)", marginBottom: 10 }}>
          Sin datos en el origen para el período seleccionado. La estructura de KPIs se muestra completa.
        </div>
      );
    }
    return selloPeriodo(mvName);
  };

  // ─── sello de período: a qué mes está actualizada cada área y cada país ──────
  // La Cabina cae al último mes disponible de cada país. Antes lo hacía en
  // silencio: se podía ver México de agosto junto a Colombia de abril sin aviso.
  const perNum = (lbl: string): number => {
    const m = /^(\w{3})\s+(\d{4})$/.exec((lbl || "").trim());
    if (!m) return 0;
    const i = MESES.indexOf(m[1]);
    return i < 0 ? 0 : Number(m[2]) * 100 + (i + 1);
  };
  const perLbl = (n: number): string => n ? `${MESES[(n % 100) - 1]} ${Math.floor(n / 100)}` : "—";
  const EN_CURSO = NOW.getFullYear() * 100 + (NOW.getMonth() + 1);

  const selloPeriodo = (mvName: string) => {
    const porPais = mvPais[mvName] || {};
    // En móvil se ve un país a la vez: el sello debe hablar de ESE país, no de
    // todos. Si no, aparece un aviso de desfase citando países fuera de pantalla.
    const enPantalla = movil ? [paisMovil] : paisesVis;
    const cortes = enPantalla
      .map((p) => ({ pais: p, num: perNum(porPais[p] || "") }))
      .filter((c) => c.num > 0);
    if (!cortes.length) return null;

    const nums = cortes.map((c) => c.num);
    const comun = Math.min(...nums);
    const desfase = comun !== Math.max(...nums);
    const pedido = year * 100 + month;
    const parcial = cortes.filter((c) => c.num === EN_CURSO).map((c) => NOMBRE[c.pais]);
    const atrasado = !desfase && comun < pedido;

    const igualar = () => { setYear(Math.floor(comun / 100)); setMonth(comun % 100); };
    const detalle = cortes.map((c) => `${NOMBRE[c.pais]} ${perLbl(c.num)}`).join(" · ");

    if (desfase) {
      return (
        <div style={{
          background: "rgba(200,137,27,0.08)", border: "0.5px solid rgba(200,137,27,0.35)",
          borderRadius: 6, padding: "8px 12px", marginBottom: 10,
          fontSize: 11, color: "#C8891B", lineHeight: 1.55,
        }}>
          <b>Los países no están al mismo mes.</b> {detalle}. Las columnas de esta tabla
          corresponden a períodos distintos, así que la comparación entre países no es directa.
          {parcial.length > 0 && <> {parcial.join(" y ")} {parcial.length > 1 ? "incluyen" : "incluye"} el mes en curso, que aún no cierra.</>}
          <button onClick={igualar} style={{
            marginLeft: 8, background: "transparent", border: "0.5px solid rgba(200,137,27,0.5)",
            borderRadius: 4, padding: "2px 8px", fontSize: 10, color: "#C8891B", cursor: "pointer",
          }}>
            Igualar todo a {perLbl(comun)}
          </button>
        </div>
      );
    }

    return (
      <div style={{ fontSize: 11, color: "var(--text-4)", marginBottom: 10, lineHeight: 1.5 }}>
        Datos a <b style={{ color: "var(--text-3)" }}>{perLbl(comun)}</b> en {
          cortes.length <= 3
            ? cortes.map((c) => NOMBRE[c.pais]).join(cortes.length === 2 ? " y " : ", ")
            : `los ${cortes.length} países`}
        {atrasado && <> — es el último cierre cargado; se pidió {MESES[month - 1]} {year} y el origen todavía no lo tiene.</>}
        {comun === EN_CURSO && <> — mes en curso, cifras parciales.</>}
      </div>
    );
  };
  const celdaArea = (mvName: string) => (pais: string, f: AreaFila): Celda => {
    const main = mv(mvName, pais, f.campo, f.modo);
    const bruto = mvData[mvName]?.[pais]?.[f.campo];
    if (typeof bruto === "string") return { main, sec: "", col: "var(--text-4)" };
    const cur = crudo(mvData, mvName, pais, f.campo);
    const aa  = crudo(mvDataAA, mvName, pais, f.campo);
    // flecha de dirección: visible en los tres modos, no solo en "variación"
    let flecha = "", flechaCol = "";
    if (cur != null && aa != null && f.dir) {
      const d = cur - aa;
      if (d !== 0) { flecha = d > 0 ? "▲" : "▼"; flechaCol = colorVar(d, f.dir); }
    }
    if (secMode === "aa") return { main, sec: aa == null ? "" : "AA " + fmtModo(aa, f.modo), col: "var(--text-3)", dir: flecha, dirCol: flechaCol };
    if (secMode === "var") {
      if (cur == null || aa == null) return { main, sec: "", col: "var(--text-4)", dir: flecha, dirCol: flechaCol };
      const esPct = f.modo === "pct" || f.modo === "pctd";
      if (f.unidad === "Conteo") {
        const du = cur - aa;
        const t = (du >= 0 ? "+" : "") + fmtNum(Math.abs(du) < 1 ? du : Math.round(du));
        return { main, sec: t, col: colorVar(du, f.dir), dir: flecha, dirCol: flechaCol };
      }
      let d: number;
      if (esPct) d = f.modo === "pct" ? (cur - aa) * 100 : cur - aa;
      else { if (aa === 0) return { main, sec: "", col: "var(--text-4)" }; d = (cur - aa) / Math.abs(aa) * 100; }
      const txt = (d >= 0 ? "+" : "") + (Math.abs(d) > 0 && Math.abs(d) < 1 ? d.toFixed(2) : d.toFixed(1)) + (esPct ? " pts" : "%");
      return { main, sec: txt, col: colorVar(d, f.dir), dir: flecha, dirCol: flechaCol };
    }
    return { main, sec: "", col: "var(--text-3)", dir: flecha, dirCol: flechaCol };
  };

  const periodo =
    ptype === "ytd" ? `YTD ${MESES[month - 1]} ${year}` :
    ptype === "ltm" ? `LTM a ${MESES[month - 1]} ${year}` :
    `${MESES[month - 1]} ${year}`;

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100vh", background: "var(--bg-0)", overflow: "hidden" }}>

      {/* ── TOPBAR ── */}
      <header style={{
        background: "var(--bg-2)", borderBottom: "0.5px solid var(--border)",
        padding: "0 20px", height: 52, display: movil ? "none" : "flex", alignItems: "center",
        justifyContent: "space-between", flexShrink: 0, gap: 16,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{
            background: "var(--red)", color: "#fff",
            fontWeight: 600, fontSize: 12, letterSpacing: "0.12em",
            padding: "4px 10px", borderRadius: 4,
          }}>MINISO</div>
          <span style={{ color: "var(--text-4)", fontSize: 12, letterSpacing: "0.04em" }}>
            Cabina de Control
          </span>
        </div>

        <nav style={{ display: movil ? "none" : "flex", gap: 2 }}>
          {AREAS.map((a) => (
            <button
              key={a.id}
              onClick={() => setArea(a.id)}
              style={{
                padding: "5px 11px", borderRadius: 20, fontSize: 11, cursor: "pointer",
                border: "0.5px solid transparent", transition: "all 0.15s",
                background: area === a.id ? "var(--red)" : "transparent",
                color: area === a.id ? "#fff" : "var(--text-3)",
                fontWeight: area === a.id ? 500 : 400,
                whiteSpace: "nowrap",
              }}
            >
              {a.label}
            </button>
          ))}
        </nav>

        <div style={{ width: 80 }} />
      </header>

      {/* ── BODY ── */}
      <div style={{ display: "flex", flex: 1, overflow: "hidden" }}>

        {/* ── SIDEBAR ── */}
        <aside style={{
          display: movil ? "none" : "flex",
          width: 148, background: "var(--bg-1)",
          borderRight: "0.5px solid var(--border)",
          padding: "16px 0", flexShrink: 0,
          flexDirection: "column", gap: 0,
        }}>
          <SideSection label="Vistas" />
          <SideItem icon="▦" label="Cabina" active />
          <SideItem icon="↗" label="Tendencias" />
          <SideItem icon="⊞" label="Tiendas" />
          <SideSep />
          <SideSection label="Período" />
          <SidePicker value="Mes" options={["Mes"]} onChange={() => setPtype("mes")} />
          <div style={{ fontSize: 11, color: "var(--text-4)", margin: "3px 10px 0", lineHeight: 1.4 }}>
            YTD y LTM pendientes: falta definir por KPI si el acumulado se suma, se promedia o toma el último mes.
          </div>
          <SidePicker value={MESES[month - 1]} options={MESES} onChange={(v) => setMonth(MESES.indexOf(v) + 1)} />
          <SidePicker value={String(year)} options={["2024", "2025", "2026"]} onChange={(v) => setYear(Number(v))} />
          <button
            onClick={() => setRecarga((n) => n + 1)}
            disabled={cargandoArea}
            style={{
              display: "block", margin: "4px 10px 0", width: "calc(100% - 20px)",
              background: cargandoArea ? "var(--bg-4)" : "var(--red)",
              border: "none", color: "#fff", fontSize: 11, fontWeight: 500,
              padding: "5px 0", borderRadius: 5, cursor: cargandoArea ? "not-allowed" : "pointer",
              transition: "background 0.15s",
            }}
          >
            {cargandoArea ? "…" : "↻ Aplicar"}
          </button>
          <SideSep />
          <SideSection label="Países" />
          <SideItem icon="◉" label="LATAM" active={selPaises.length === PAISES.length} onClick={() => setSelPaises([...PAISES])} />
          {PAISES.map((p) => (
            <SideItem key={p} icon="⚑" label={NOMBRE[p]} active={selPaises.length !== PAISES.length && selPaises.includes(p)} onClick={() => togglePais(p)} />
          ))}
        </aside>

        {/* ── MAIN ── */}
        <main style={{ flex: 1, overflow: "auto", padding: movil ? "0 10px 124px" : 20 }}>
          {movil && (
            <MovilChips paises={PAISES} sel={paisMovil} onSel={setPaisMovil}
              titulo={AREAS.find((a) => a.id === area)?.label || "Cabina"}
              mes={month} anio={year} onMes={setMonth} onAnio={setYear} />
          )}

          {/* ══════════════════════════════════════════════
              FINANZAS
          ══════════════════════════════════════════════ */}
          {area === "finanzas" && (
            <>
              {error && (
                <div style={{
                  background: "rgba(226,85,85,0.1)", border: "0.5px solid rgba(226,85,85,0.3)",
                  borderRadius: 8, padding: "10px 14px", color: "var(--rose)", fontSize: 12, marginBottom: 16,
                }}>
                  Error al conectar con Redshift: {error}
                </div>
              )}
              <AreaHeader title={periodo} sub="Estado de resultados — comparativo por país" loading={loading} />
              {(() => {
                const pnlPaises = paisesVis;

                const V = (p: string, src?: Record<string, Record<string, MvRow>>) => {
                  const g = (f: string) => crudo(src || mvData, "finanzas", p, f);
                  const a = (f: string) => { const v = g(f); return v == null ? null : Math.abs(v); };
                  const venta = g("fact_total");
                  const cv = a("costo_venta");
                  const ca = a("costo_almacen");
                  const ct = a("costo_total") ?? ((cv == null && ca == null) ? null : (cv ?? 0) + (ca ?? 0));
                  const ub = (venta == null || ct == null) ? null : venta - ct;
                  const nomOp = a("gasto_nomina_operativa");
                  const ocup = a("gasto_ocupacion");
                  const dist = a("gasto_operativo_distribucion");
                  const gOp = a("gasto_operativo");
                  const tgo = a("total_gasto_operacion") ?? gOp;
                  const eTda = (ub == null || tgo == null) ? null : ub - tgo;
                  const gc = a("gasto_corporativo_gestion");
                  const oc = g("otro_gasto_ingreso_corporativo");
                  const eDiv = eTda == null ? null : eTda - (gc ?? 0) + (oc ?? 0);
                  const da = a("da");
                  const gf = a("gasto_financiero");
                  const imp = a("impuestos");
                  const un = eDiv == null ? null : eDiv - (da ?? 0) - (gf ?? 0) - (imp ?? 0);
                  return { venta, cv, ca, nomAlm: a("gasto_nomina_almacen"), ct, ub, nomOp, ocup, dist, gOp, tgo, eTda, gc, oc, eDiv, da, gf, imp, un };
                };
                const money = (n: number | null) => n == null ? "—" : fmtMoney(n);
                const neg = (n: number | null) => n == null ? "—" : "(" + fmtMoney(n) + ")";
                const pctOf = (n: number | null, base: number | null) =>
                  (n == null || !base) ? "—" : fmtPct(n / base * 100);
                const pnlDir = (p: string, k: string): string => {
                  const cur: any = V(p), aa: any = V(p, mvDataAA);
                  const pc = (cur[k] == null || !cur.venta) ? null : cur[k] / cur.venta * 100;
                  const pa = (aa[k] == null || !aa.venta)   ? null : aa[k] / aa.venta * 100;
                  if (pc == null || pa == null || pc === pa) return "";
                  return pc > pa ? "▲" : "▼";
                };
                const pnlDirCol = (p: string, k: string, dir: string): string => {
                  const cur: any = V(p), aa: any = V(p, mvDataAA);
                  const pc = (cur[k] == null || !cur.venta) ? null : cur[k] / cur.venta * 100;
                  const pa = (aa[k] == null || !aa.venta)   ? null : aa[k] / aa.venta * 100;
                  if (pc == null || pa == null) return "var(--text-3)";
                  return colorVar(pc - pa, dir);
                };
                const pnlSec = (p: string, k: string, esNeg: boolean): string => {
                  const cur: any = V(p); 
                  if (secMode === "imp") return esNeg ? neg(cur[k]) : money(cur[k]);
                  const aa: any = V(p, mvDataAA);
                  const pc = (cur[k] == null || !cur.venta) ? null : cur[k] / cur.venta * 100;
                  const pa = (aa[k] == null || !aa.venta)   ? null : aa[k] / aa.venta * 100;
                  if (secMode === "aa") return pa == null ? "" : "AA " + fmtPctS(pa);
                  if (pc == null || pa == null) return "";
                  const d = pc - pa;
                  return (d >= 0 ? "+" : "") + (Math.abs(d) > 0 && Math.abs(d) < 1 ? d.toFixed(2) : d.toFixed(1)) + " pts";
                };
                const pnlCol = (p: string, k: string, dir: string): string => {
                  if (secMode !== "var") return "var(--text-3)";
                  const cur: any = V(p), aa: any = V(p, mvDataAA);
                  const pc = (cur[k] == null || !cur.venta) ? null : cur[k] / cur.venta * 100;
                  const pa = (aa[k] == null || !aa.venta)   ? null : aa[k] / aa.venta * 100;
                  if (pc == null || pa == null) return "var(--text-3)";
                  return colorVar(pc - pa, dir);
                };
                const ventaDir = (p: string): string => {
                  const c = V(p).venta, a = V(p, mvDataAA).venta;
                  if (c == null || a == null || c === a) return "";
                  return c > a ? "▲" : "▼";
                };
                const ventaCol = (p: string): string => {
                  if (secMode !== "var") return "var(--text-3)";
                  const c = V(p).venta, a = V(p, mvDataAA).venta;
                  if (c == null || a == null || a === 0) return "var(--text-4)";
                  return colorVar((c - a) / Math.abs(a) * 100, "up");
                };
                const ventaSec = (p: string): string => {
                  if (secMode === "imp") return "";
                  const c = V(p).venta, a = V(p, mvDataAA).venta;
                  if (secMode === "aa") return a == null ? "" : "AA " + money(a);
                  if (c == null || a == null || a === 0) return "";
                  const d = (c - a) / Math.abs(a) * 100;
                  return (d >= 0 ? "+" : "") + d.toFixed(1) + "%";
                };
                const rows: PnLRow[] = [
                  { kind: "sub", label: "Facturación Total", id: "KPI-FIN-001", get: p => money(V(p).venta), sub: p => ventaSec(p), subCol: p => ventaCol(p), dir: p => ventaDir(p), dirCol: p => ventaCol(p) },
                  { kind: "item", label: "Costo de ventas", id: "KPI-FIN-006", get: p => { const v: any = V(p); return (v.cv == null || !v.venta) ? "—" : fmtPctS(v.cv / v.venta * 100); }, sub: p => pnlSec(p, "cv", true), subCol: p => pnlCol(p, "cv", "down"), dir: p => pnlDir(p, "cv"), dirCol: p => pnlDirCol(p, "cv", "down") },
                  { kind: "item", label: "Costo de almacén", id: "KPI-FIN-008", get: p => { const v: any = V(p); return (v.ca == null || !v.venta) ? "—" : fmtPctS(v.ca / v.venta * 100); }, sub: p => pnlSec(p, "ca", true), subCol: p => pnlCol(p, "ca", "down"), dir: p => pnlDir(p, "ca"), dirCol: p => pnlDirCol(p, "ca", "down") },
                  { kind: "item", label: "Nómina de almacén", id: "KPI-FIN-010", get: p => { const v: any = V(p); return (v.nomAlm == null || !v.venta) ? "—" : fmtPctS(v.nomAlm / v.venta * 100); }, sub: p => pnlSec(p, "nomAlm", true), subCol: p => pnlCol(p, "nomAlm", "down"), dir: p => pnlDir(p, "nomAlm"), dirCol: p => pnlDirCol(p, "nomAlm", "down") },
                  { kind: "item", label: "Costo total", id: "KPI-FIN-012", get: p => { const v: any = V(p); return (v.ct == null || !v.venta) ? "—" : fmtPctS(v.ct / v.venta * 100); }, sub: p => pnlSec(p, "ct", true), subCol: p => pnlCol(p, "ct", "down"), dir: p => pnlDir(p, "ct"), dirCol: p => pnlDirCol(p, "ct", "down") },
                  { kind: "sub", label: "Utilidad Bruta", id: "KPI-FIN-014", get: p => { const v: any = V(p); return (v.ub == null || !v.venta) ? "—" : fmtPctS(v.ub / v.venta * 100); }, sub: p => pnlSec(p, "ub", false), subCol: p => pnlCol(p, "ub", "up"), dir: p => pnlDir(p, "ub"), dirCol: p => pnlDirCol(p, "ub", "up") },
                  { kind: "item", label: "Nómina operativa", id: "KPI-FIN-018", get: p => { const v: any = V(p); return (v.nomOp == null || !v.venta) ? "—" : fmtPctS(v.nomOp / v.venta * 100); }, sub: p => pnlSec(p, "nomOp", true), subCol: p => pnlCol(p, "nomOp", "down"), dir: p => pnlDir(p, "nomOp"), dirCol: p => pnlDirCol(p, "nomOp", "down") },
                  { kind: "item", label: "Gastos de ocupación", id: "KPI-FIN-020", get: p => { const v: any = V(p); return (v.ocup == null || !v.venta) ? "—" : fmtPctS(v.ocup / v.venta * 100); }, sub: p => pnlSec(p, "ocup", true), subCol: p => pnlCol(p, "ocup", "down"), dir: p => pnlDir(p, "ocup"), dirCol: p => pnlDirCol(p, "ocup", "down") },
                  { kind: "item", label: "Gasto de distribución", id: "KPI-FIN-022", get: p => { const v: any = V(p); return (v.dist == null || !v.venta) ? "—" : fmtPctS(v.dist / v.venta * 100); }, sub: p => pnlSec(p, "dist", true), subCol: p => pnlCol(p, "dist", "down"), dir: p => pnlDir(p, "dist"), dirCol: p => pnlDirCol(p, "dist", "down") },
                  { kind: "item", label: "Otros gastos operativos", id: "KPI-FIN-016", get: p => { const v: any = V(p); return (v.gOp == null || !v.venta) ? "—" : fmtPctS(v.gOp / v.venta * 100); }, sub: p => pnlSec(p, "gOp", true), subCol: p => pnlCol(p, "gOp", "down"), dir: p => pnlDir(p, "gOp"), dirCol: p => pnlDirCol(p, "gOp", "down") },
                  { kind: "item", label: "Total gastos de operación", id: "KPI-FIN-023", get: p => { const v: any = V(p); return (v.tgo == null || !v.venta) ? "—" : fmtPctS(v.tgo / v.venta * 100); }, sub: p => pnlSec(p, "tgo", true), subCol: p => pnlCol(p, "tgo", "down"), dir: p => pnlDir(p, "tgo"), dirCol: p => pnlDirCol(p, "tgo", "down") },
                  { kind: "sub", label: "EBITDA Tienda", id: "KPI-FIN-024", get: p => { const v: any = V(p); return (v.eTda == null || !v.venta) ? "—" : fmtPctS(v.eTda / v.venta * 100); }, sub: p => pnlSec(p, "eTda", false), subCol: p => pnlCol(p, "eTda", "up"), dir: p => pnlDir(p, "eTda"), dirCol: p => pnlDirCol(p, "eTda", "up") },
                  { kind: "item", label: "Gasto corporativo", id: "KPI-FIN-026", get: p => { const v: any = V(p); return (v.gc == null || !v.venta) ? "—" : fmtPctS(v.gc / v.venta * 100); }, sub: p => pnlSec(p, "gc", true), subCol: p => pnlCol(p, "gc", "down"), dir: p => pnlDir(p, "gc"), dirCol: p => pnlDirCol(p, "gc", "down") },
                  { kind: "item", label: "Otros gastos / ingresos", id: "KPI-FIN-029", get: p => { const v: any = V(p); return (v.oc == null || !v.venta) ? "—" : fmtPctS(v.oc / v.venta * 100); }, sub: p => pnlSec(p, "oc", false), subCol: p => pnlCol(p, "oc", ""), dir: p => pnlDir(p, "oc"), dirCol: p => pnlDirCol(p, "oc", "") },
                  { kind: "sub", label: "EBITDA División", id: "KPI-FIN-028", get: p => { const v: any = V(p); return (v.eDiv == null || !v.venta) ? "—" : fmtPctS(v.eDiv / v.venta * 100); }, sub: p => pnlSec(p, "eDiv", false), subCol: p => pnlCol(p, "eDiv", "up"), dir: p => pnlDir(p, "eDiv"), dirCol: p => pnlDirCol(p, "eDiv", "up") },
                  { kind: "item", label: "Depreciación y amortización", id: "KPI-FIN-032", get: p => { const v: any = V(p); return (v.da == null || !v.venta) ? "—" : fmtPctS(v.da / v.venta * 100); }, sub: p => pnlSec(p, "da", true), subCol: p => pnlCol(p, "da", "down"), dir: p => pnlDir(p, "da"), dirCol: p => pnlDirCol(p, "da", "down") },
                  { kind: "item", label: "Gasto financiero", id: "KPI-FIN-031", get: p => { const v: any = V(p); return (v.gf == null || !v.venta) ? "—" : fmtPctS(v.gf / v.venta * 100); }, sub: p => pnlSec(p, "gf", true), subCol: p => pnlCol(p, "gf", "down"), dir: p => pnlDir(p, "gf"), dirCol: p => pnlDirCol(p, "gf", "down") },
                  { kind: "item", label: "Impuestos", id: "KPI-FIN-033", get: p => { const v: any = V(p); return (v.imp == null || !v.venta) ? "—" : fmtPctS(v.imp / v.venta * 100); }, sub: p => pnlSec(p, "imp", true), subCol: p => pnlCol(p, "imp", "down"), dir: p => pnlDir(p, "imp"), dirCol: p => pnlDirCol(p, "imp", "down") },
                  { kind: "sub", label: "Utilidad Neta", id: "KPI-FIN-034", get: p => { const v: any = V(p); return (v.un == null || !v.venta) ? "—" : fmtPctS(v.un / v.venta * 100); }, sub: p => pnlSec(p, "un", false), subCol: p => pnlCol(p, "un", "up"), dir: p => pnlDir(p, "un"), dirCol: p => pnlDirCol(p, "un", "up") },
                ];
                return (
                  <>
                    {avisoArea("finanzas", "Finanzas")}
                    <SecToggle value={secMode} onChange={setSecMode} />
                    {movil
                      ? <MovilPnL pais={paisMovil} rows={rows} />
                      : <PnLTable paises={pnlPaises} rows={rows} />}
                    <div style={{ fontSize: 10, color: "var(--text-4)", marginTop: 6, lineHeight: 1.5 }}>
                      Todos los conceptos se expresan como % sobre facturación para permitir comparación entre monedas; el importe en moneda local va debajo en gris. Los subtotales se recalculan localmente
                      sobre el valor absoluto de costos y gastos. El origen los almacena en negativo y los subtotales de la
                      vista quedan sobrestimados. Pendiente de corrección en datos maestros.
                    </div>
                    {movil
                      ? <MovilKpiList pais={paisMovil} title="Volumen y mismas tiendas" cols={[
                      { id: "KPI-FIN-003", label: "Piezas totales",   getVal: p => finVal(p, "fact_pzas") },
                      { id: "KPI-FIN-002", label: "Facturación MT",   getVal: p => finVal(p, "facturacion_mt_venta", "money") },
                      { id: "KPI-FIN-004", label: "Piezas MT",        getVal: p => finVal(p, "facturacion_mt_piezas") },
                      { id: "KPI-FIN-005", label: "% Crec. MT vs AA", getVal: p => finVal(p, "pct_crecimiento_mts_vs_anio_anterior", "pct") },
                    ]} />
                      : <KpiGroupTable paises={pnlPaises} title="Volumen y mismas tiendas" cols={[
                      { id: "KPI-FIN-003", label: "Piezas totales",   getVal: p => finVal(p, "fact_pzas") },
                      { id: "KPI-FIN-002", label: "Facturación MT",   getVal: p => finVal(p, "facturacion_mt_venta", "money") },
                      { id: "KPI-FIN-004", label: "Piezas MT",        getVal: p => finVal(p, "facturacion_mt_piezas") },
                      { id: "KPI-FIN-005", label: "% Crec. MT vs AA", getVal: p => finVal(p, "pct_crecimiento_mts_vs_anio_anterior", "pct") },
                    ]} />}
                    {movil
                      ? <MovilKpiList pais={paisMovil} title="Venta por canal" cols={[
                      { id: "KPI-FIN-041", label: "Blind Lab",    getVal: p => finVal(p, "venta_blind_lab", "money") },
                      { id: "KPI-FIN-042", label: "E-commerce",   getVal: p => finVal(p, "venta_on_line", "money") },
                      { id: "KPI-FIN-043", label: "Marketplaces", getVal: p => finVal(p, "venta_marketplaces", "money") },
                      { id: "KPI-FIN-044", label: "Coppel",       getVal: p => finVal(p, "venta_coppel", "money") },
                    ]} />
                      : <KpiGroupTable paises={pnlPaises} title="Venta por canal" cols={[
                      { id: "KPI-FIN-041", label: "Blind Lab",    getVal: p => finVal(p, "venta_blind_lab", "money") },
                      { id: "KPI-FIN-042", label: "E-commerce",   getVal: p => finVal(p, "venta_on_line", "money") },
                      { id: "KPI-FIN-043", label: "Marketplaces", getVal: p => finVal(p, "venta_marketplaces", "money") },
                      { id: "KPI-FIN-044", label: "Coppel",       getVal: p => finVal(p, "venta_coppel", "money") },
                    ]} />}
                    {movil
                      ? <MovilKpiList pais={paisMovil} title="Estructura financiera" cols={[
                      { id: "KPI-FIN-036", label: "Free Cash Flow",   getVal: p => finVal(p, "free_cash_flow", "money") },
                      { id: "KPI-FIN-037", label: "Tasa (spread)",    getVal: p => finVal(p, "tasa", "pct") },
                      { id: "KPI-FIN-038", label: "Deuda",            getVal: p => finVal(p, "deuda", "money") },
                      { id: "KPI-FIN-039", label: "Apalancamiento",   getVal: p => finVal(p, "apalancamiento_vs_deuda", "dec2") },
                      { id: "KPI-FIN-040", label: "Seguros x recup.", getVal: p => finVal(p, "montos_seguros_por_recuperar", "money") },
                    ]} />
                      : <KpiGroupTable paises={pnlPaises} title="Estructura financiera" cols={[
                      { id: "KPI-FIN-036", label: "Free Cash Flow",   getVal: p => finVal(p, "free_cash_flow", "money") },
                      { id: "KPI-FIN-037", label: "Tasa (spread)",    getVal: p => finVal(p, "tasa", "pct") },
                      { id: "KPI-FIN-038", label: "Deuda",            getVal: p => finVal(p, "deuda", "money") },
                      { id: "KPI-FIN-039", label: "Apalancamiento",   getVal: p => finVal(p, "apalancamiento_vs_deuda", "dec2") },
                      { id: "KPI-FIN-040", label: "Seguros x recup.", getVal: p => finVal(p, "montos_seguros_por_recuperar", "money") },
                    ]} />}
                  </>
                );
              })()}
            </>
          )}

          {/* ══════════════════════════════════════════════
              OPERACIONES  — KPI-OPS-001 a KPI-OPS-019
          ══════════════════════════════════════════════ */}
          {area === "operaciones" && (
            <>
              <AreaHeader title={periodo} sub="Operaciones — comparativo por país" loading={loading} />
              {avisoArea("operaciones", "Operaciones")}
              <SecToggle value={secMode} onChange={setSecMode} />
              {movil
                ? <MovilArea pais={paisMovil} bloques={BLK_OPERACIONES} cell={celdaArea("operaciones")} />
                : <AreaTable paises={paisesVis} bloques={BLK_OPERACIONES} cell={celdaArea("operaciones")} />}
            </>
          )}

          {/* ══════════════════════════════════════════════
              COMERCIAL  — KPI-COM-001 a KPI-COM-013
          ══════════════════════════════════════════════ */}
          {area === "comercial" && (
            <>
              <AreaHeader title={periodo} sub="Comercial — comparativo por país" loading={loading} />
              {avisoArea("comercial", "Comercial")}
              <SecToggle value={secMode} onChange={setSecMode} />
              {movil
                ? <MovilArea pais={paisMovil} bloques={BLK_COMERCIAL} cell={celdaArea("comercial")} />
                : <AreaTable paises={paisesVis} bloques={BLK_COMERCIAL} cell={celdaArea("comercial")} />}
            </>
          )}

          {/* ══════════════════════════════════════════════
              RRHH  — KPI-RH-001 a KPI-RH-035
          ══════════════════════════════════════════════ */}
          {area === "rrhh" && (
            <>
              <AreaHeader title={periodo} sub="RRHH — comparativo por país" loading={loading} />
              {avisoArea("rh", "RRHH")}
              <SecToggle value={secMode} onChange={setSecMode} />
              {movil
                ? <MovilArea pais={paisMovil} bloques={BLK_RRHH} cell={celdaArea("rh")} />
                : <AreaTable paises={paisesVis} bloques={BLK_RRHH} cell={celdaArea("rh")} />}
            </>
          )}

          {/* ══════════════════════════════════════════════
              LOGÍSTICA  — KPI-LOG-001 a KPI-LOG-027
          ══════════════════════════════════════════════ */}
          {area === "logistica" && (
            <>
              <AreaHeader title={periodo} sub="Logística — comparativo por país" loading={loading} />
              {avisoArea("logistica", "Logística")}
              <SecToggle value={secMode} onChange={setSecMode} />
              {movil
                ? <MovilArea pais={paisMovil} bloques={BLK_LOGISTICA} cell={celdaArea("logistica")} />
                : <AreaTable paises={paisesVis} bloques={BLK_LOGISTICA} cell={celdaArea("logistica")} />}
            </>
          )}

          {/* ══════════════════════════════════════════════
              MARKETING  — KPI-MKT-001 a KPI-MKT-019
          ══════════════════════════════════════════════ */}
          {area === "marketing" && (
            <>
              <AreaHeader title={periodo} sub="Marketing — comparativo por país" loading={loading} />
              {avisoArea("marketing", "Marketing")}
              <SecToggle value={secMode} onChange={setSecMode} />
              {movil
                ? <MovilArea pais={paisMovil} bloques={BLK_MARKETING} cell={celdaArea("marketing")} />
                : <AreaTable paises={paisesVis} bloques={BLK_MARKETING} cell={celdaArea("marketing")} />}
            </>
          )}

          {/* ══════════════════════════════════════════════
              AUDITORÍA  — KPI-AUD-001 a KPI-AUD-006
          ══════════════════════════════════════════════ */}
          {area === "auditoria" && (
            <>
              <AreaHeader title={periodo} sub="Auditoría — comparativo por país" loading={loading} />
              {avisoArea("auditoria", "Auditoría")}
              <SecToggle value={secMode} onChange={setSecMode} />
              {movil
                ? <MovilArea pais={paisMovil} bloques={BLK_AUDITORIA} cell={celdaArea("auditoria")} />
                : <AreaTable paises={paisesVis} bloques={BLK_AUDITORIA} cell={celdaArea("auditoria")} />}
            </>
          )}

        </main>
        {movil && <MovilNav area={area} setArea={setArea} />}
      </div>

      {/* ── BARRA CLAUDE ── */}
      <div style={{
        background: "var(--bg-2)", borderTop: "0.5px solid var(--border)",
        padding: movil ? "8px 12px" : "10px 20px",
        display: "flex", alignItems: "center", gap: 10, flexShrink: 0,
        // en iPhone el indicador de inicio se come la franja inferior: se suma el área segura
        ...(movil ? { position: "fixed" as const, left: 0, right: 0, bottom: "calc(48px + env(safe-area-inset-bottom))", zIndex: 29 } : {}),
      }}>
        <div style={{ width: 6, height: 6, borderRadius: "50%", background: "var(--red)", flexShrink: 0 }} />
        <input
          type="text"
          value={pregunta}
          onChange={(e) => setPregunta(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && preguntarIA()}
          placeholder={movil ? "Pregunta sobre los datos…" : "Pregunta sobre los datos — ej. ¿Por qué AR tiene el margen más bajo?"}
          style={{
            flex: 1, background: "transparent", border: "none", outline: "none",
            fontSize: 12, color: "var(--text-2)", minHeight: movil ? 40 : 24,
          }}
        />
        <button
          onClick={preguntarIA}
          disabled={iaLoading || !pregunta.trim()}
          style={{
            background: iaLoading ? "var(--bg-3)" : "var(--red)",
            border: "none", borderRadius: 6, padding: "5px 12px",
            fontSize: 11, color: iaLoading ? "var(--text-4)" : "#fff",
            cursor: iaLoading ? "default" : "pointer", transition: "all 0.15s",
          }}
        >
          {iaLoading ? "…" : "Enviar"}
        </button>
        {respuesta && (
          <div style={{
            position: "absolute", bottom: 56, left: 20, right: 20,
            background: "var(--bg-3)", border: "0.5px solid var(--border-2)",
            borderRadius: 8, padding: "12px 16px",
            fontSize: 12, color: "var(--text-2)", lineHeight: 1.6,
            whiteSpace: "pre-wrap", maxHeight: 160, overflowY: "auto",
          }}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
              <span style={{ color: "var(--red)", fontSize: 10, fontWeight: 500 }}>CLAUDE</span>
              <button
                onClick={() => setRespuesta("")}
                style={{ background: "none", border: "none", color: "var(--text-4)", cursor: "pointer", fontSize: 12 }}
              >✕</button>
            </div>
            {respuesta}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── KPI Group Table — Sprint 9 ──────────────────────────────────────────────
// Países como filas, KPIs como columnas. Valor real o "—".

interface KpiColDef { id: string; label: string; getVal: (pais: string) => string; }


const BLK_OPERACIONES: AreaBloque[] = [
  { titulo: "1. Comportamiento de compra", filas: [
    { id: "KPI-OPE-001", label: "Ticket promedio", campo: "ticket_promedio", modo: "money", dir: "up" },
    { id: "KPI-OPE-002", label: "Piezas por ticket", campo: "pzas_por_ticket", unidad: "Piezas", dir: "up" },
    { id: "KPI-OPE-003", label: "Conversión", campo: "conversion", modo: "pct", unidad: "%", dir: "up" },
    { id: "KPI-OPE-004", label: "Clientes (tickets)", campo: "clientes", unidad: "Conteo", dir: "up" },
    { id: "KPI-OPE-005", label: "Venta adicional", campo: "venta_adicional", modo: "dec2", dir: "up" },
  ]},
  { titulo: "2. Desempeño comercial", filas: [
    { id: "KPI-OPE-006", label: "Venta promedio por tienda", campo: "venta_promedio_tienda", modo: "money", dir: "up" },
    { id: "KPI-OPE-007", label: "Cumplimiento de presupuesto", campo: "cumplimiento_presupuesto", modo: "pct", unidad: "%", sub: true, dir: "up" },
    { id: "KPI-OPE-008", label: "Mejor región vs presupuesto", campo: "mejor_region_vs_presupuesto" },
    { id: "KPI-OPE-009", label: "Peor región vs presupuesto", campo: "peor_region_vs_presupuesto" },
  ]},
  { titulo: "3. Calidad de tienda", filas: [
    { id: "KPI-OPE-010", label: "Calificación de checklist", campo: "calificacion_de_checklist", modo: "dec2", unidad: "Puntos", dir: "up" },
    { id: "KPI-OPE-011", label: "Calificación trade tiendas", campo: "calificacion_trade_tiendas", modo: "dec2", unidad: "Puntos", dir: "up" },
    { id: "KPI-OPE-012", label: "SKUs sin exhibir", campo: "skus_sin_exhibir", modo: "pct", unidad: "%", dir: "down" },
    { id: "KPI-OPE-013", label: "Cumplimiento 36 hrs", campo: "36_hrs", modo: "pct", unidad: "%", dir: "up" },
  ]},
  { titulo: "4. Control y compensación", filas: [
    { id: "KPI-OPE-014", label: "% Ajustes (devoluciones)", campo: "porc_ajustes", modo: "pct", unidad: "%", dir: "down" },
    { id: "KPI-OPE-015", label: "% Faltante de inventarios", campo: "pct_faltante_inventarios", modo: "pct", unidad: "%", dir: "down" },
    { id: "KPI-OPE-016", label: "Tickets mesa de control", campo: "tickets_mesa_de_control", unidad: "Conteo", dir: "up" },
    { id: "KPI-OPE-017", label: "% De comisiones", campo: "pct_de_comisiones", modo: "pct", unidad: "%" },
    { id: "KPI-OPE-018", label: "% Tiendas que cobraron bono", campo: "pct_de_tiendas_cobraron_bono_mas_del_50pct", modo: "pct", unidad: "%", dir: "up" },
    { id: "KPI-OPE-019", label: "On time entregas almacén-tienda", campo: "on_time_de_entregas_almacen_a_tiendas", modo: "pct", unidad: "%", dir: "up" },
  ]},
];
const BLK_COMERCIAL: AreaBloque[] = [
  { titulo: "1. Precio y rotación", filas: [
    { id: "KPI-COM-001", label: "Precio promedio", campo: "precio_promedio", modo: "money" },
    { id: "KPI-COM-005", label: "Sell-thru general", campo: "sell_thru_general", modo: "pct", unidad: "%", sub: true, dir: "up" },
    { id: "KPI-COM-006", label: "Sell-thru general año anterior", campo: "sell_thru_general_ano_anterior", modo: "pct", unidad: "%", dir: "up" },
    { id: "KPI-COM-007", label: "% Venta producción nacional", campo: "pct_de_venta_produccion_nacional", modo: "pct", unidad: "%", dir: "up" },
  ]},
  { titulo: "2. Rebajas y descuentos", filas: [
    { id: "KPI-COM-002", label: "Stock en rebajas", campo: "stock_rebajas_pct_descuentos", modo: "pct", unidad: "%", dir: "down" },
    { id: "KPI-COM-003", label: "Piezas en rebajas", campo: "piezas_rebajas_pct_descuentos", modo: "pct", unidad: "%", dir: "down" },
    { id: "KPI-COM-004", label: "Venta en rebajas", campo: "venta_rebajas_pct_descuentos", modo: "pct", unidad: "%", dir: "down" },
  ]},
  { titulo: "3. Surtido y stock por tienda", filas: [
    { id: "KPI-COM-008", label: "Promedio SKUs en tiendas", campo: "promedio_skus_en_tiendas", unidad: "Conteo" },
    { id: "KPI-COM-009", label: "Promedio SKUs en almacén", campo: "promedio_skus_en_almacen", unidad: "Conteo" },
    { id: "KPI-COM-010", label: "SKUs con menos de 3 pzas en CEDIS", campo: "sku_menos_de_3_piezas_en_cedis", unidad: "Conteo" },
    { id: "KPI-COM-011", label: "SKUs con menos de 3 pzas en tiendas", campo: "skus_menos_de_3_piezas_en_tiendas", unidad: "Conteo" },
    { id: "KPI-COM-012", label: "Stock promedio por tienda", campo: "stock_promedio_x_tienda_piezas", unidad: "Piezas" },
    { id: "KPI-COM-013", label: "Stock promedio por tienda", campo: "stock_promedio_x_tienda_dinero", modo: "money" },
  ]},
];
const BLK_LOGISTICA: AreaBloque[] = [
  { titulo: "1. Inventario en piezas", filas: [
    { id: "KPI-LOG-001", label: "Inventario CEDIS disponible", campo: "inv_cedis_disponible", unidad: "Piezas" },
    { id: "KPI-LOG-013", label: "Inventario disponible SAP", campo: "inv_disponible_sap", unidad: "Piezas" },
    { id: "KPI-LOG-014", label: "Inventario tiendas", campo: "inv_tdas", unidad: "Piezas" },
    { id: "KPI-LOG-015", label: "Inventario tránsito a tiendas", campo: "inv_transito_tdas", unidad: "Piezas" },
    { id: "KPI-LOG-030", label: "Inventario CEDIS no disponible", campo: "inv_cedis_no_disponible", unidad: "Piezas", dir: "down" },
    { id: "KPI-LOG-012", label: "Inventario en China", campo: "inventario_en_china_piezas", unidad: "Piezas", dir: "up" },
    { id: "KPI-LOG-017", label: "Inventario en tránsito", campo: "inventario_en_transito_piezas", unidad: "Piezas", dir: "up" },
    { id: "KPI-LOG-016", label: "Inventario no disponible en aduana", campo: "inventario_no_disponible_en_aduana_piezas", unidad: "Piezas", dir: "down" },
    { id: "KPI-LOG-018", label: "Inventario no disponible país", campo: "inventario_no_disponible_pais_piezas", unidad: "Piezas", dir: "down" },
    { id: "KPI-LOG-035", label: "Inv. liberado pendiente de zarpar", campo: "inventario_liberado_pendiente_de_zarpar_piezas", unidad: "Piezas", dir: "up" },
  ]},
  { titulo: "2. Cobertura en meses", filas: [
    { id: "KPI-LOG-019", label: "Total inventario", campo: "total_inventario_meses", modo: "dec2", unidad: "Meses", sub: true, dir: "up" },
    { id: "KPI-LOG-020", label: "Inventario tiendas", campo: "inventario_tiendas_meses", modo: "dec2", unidad: "Meses", dir: "up" },
    { id: "KPI-LOG-021", label: "Inventario tránsito a tiendas", campo: "inventario_transito_tiendas_meses", modo: "dec2", unidad: "Meses", dir: "up" },
    { id: "KPI-LOG-022", label: "Inventario CEDIS disponible", campo: "inventario_cedis_disponible_meses", unidad: "Meses", dir: "up" },
    { id: "KPI-LOG-036", label: "Inventario CEDIS no disponible", campo: "inventario_cedis_no_disponible_meses", unidad: "Meses", dir: "down" },
    { id: "KPI-LOG-023", label: "Inventario no disponible en aduana", campo: "inventario_no_disponible_en_aduana_meses", modo: "dec2", unidad: "Meses", dir: "down" },
    { id: "KPI-LOG-024", label: "Inventario en tránsito", campo: "inventario_en_transito_meses", modo: "dec2", unidad: "Meses", dir: "up" },
    { id: "KPI-LOG-025", label: "Inv. liberado pendiente de zarpar", campo: "inventario_liberado_pendiente_de_zarpar_meses", modo: "dec2", unidad: "Meses", dir: "up" },
    { id: "KPI-LOG-026", label: "Inventario no disponible país", campo: "inventario_no_disponible_pais_meses", modo: "dec2", unidad: "Meses", dir: "down" },
    { id: "KPI-LOG-027", label: "Inventario en China", campo: "inventario_en_china_meses", modo: "dec2", unidad: "Meses", dir: "up" },
  ]},
  { titulo: "3. Nivel de servicio", filas: [
    { id: "KPI-LOG-003", label: "Fill rate de entrega a tienda", campo: "pct_de_surtimiento_fill_rate_de_entrega_a_tienda", modo: "pct", unidad: "%", sub: true, dir: "up" },
    { id: "KPI-LOG-004", label: "OTP15", campo: "otp15", modo: "pct", unidad: "%", dir: "up" },
    { id: "KPI-LOG-005", label: "Total piezas surtidas a tiendas", campo: "total_piezas_surtidas_a_tiendas", unidad: "Piezas", dir: "up" },
    { id: "KPI-LOG-006", label: "Promedio almacenaje por semana", campo: "promedio_almacenaje_por_semana", unidad: "Piezas" },
    { id: "KPI-LOG-037", label: "Productividad por persona (surtido)", campo: "productividad_x_persona_surtido", unidad: "Piezas", dir: "up" },
  ]},
  { titulo: "4. Costo por pieza", filas: [
    { id: "KPI-LOG-007", label: "Costo por pieza — etiquetado", campo: "costo_por_pieza_etiquetado", modo: "dec2", dir: "down" },
    { id: "KPI-LOG-008", label: "Costo por pieza — almacenada", campo: "costo_por_pieza_almacenada", modo: "dec2", dir: "down" },
    { id: "KPI-LOG-009", label: "Costo por pieza — surtida", campo: "costo_por_pieza_surtida", modo: "dec2", dir: "down" },
    { id: "KPI-LOG-010", label: "Costo por pieza — distribución", campo: "costo_por_pieza_distribucion", modo: "dec2", dir: "down" },
    { id: "KPI-LOG-002", label: "% Gasto distribución vs venta", campo: "pct_de_gasto_distribucion_vs_la_venta_distribucion", modo: "pct", unidad: "%", dir: "down" },
  ]},
  { titulo: "5. Capacidad y obsolescencia", filas: [
    { id: "KPI-LOG-011", label: "% De carga en CEDIS", campo: "porc_carga_cedis", modo: "pctd", unidad: "%" },
    { id: "KPI-LOG-038", label: "Inv. CEDIS lento movimiento +180 días", campo: "inventario_cedis_lento_movimiento_mas_de_180_dias", unidad: "Piezas", dir: "down" },
  ]},
];
const BLK_MARKETING: AreaBloque[] = [
  { titulo: "1. Tráfico", filas: [
    { id: "KPI-MKT-001", label: "Visitas a tiendas", campo: "visitas_tdas", unidad: "Conteo", sub: true, dir: "up" },
    { id: "KPI-MKT-002", label: "Sensores tiendas — mes actual", campo: "sensores_tdas_actual", unidad: "Conteo" },
    { id: "KPI-MKT-003", label: "Sensores tiendas — año anterior", campo: "sensores_tdas_pasado", unidad: "Conteo" },
    { id: "KPI-MKT-004", label: "% Aumento de tráfico vs AA", campo: "porc_aumento_trafico", modo: "pct", unidad: "%", dir: "up" },
  ]},
  { titulo: "2. Programa de lealtad", filas: [
    { id: "KPI-MKT-005", label: "Tickets MinisoLove", campo: "tickets_minisolove", unidad: "Conteo", dir: "up" },
    { id: "KPI-MKT-006", label: "Tickets totales", campo: "tickets_totales", unidad: "Conteo", dir: "up" },
    { id: "KPI-MKT-007", label: "% Participación tickets MinisoLove", campo: "pct_participacion_tickets_minisolove", modo: "pct", unidad: "%", sub: true, dir: "up" },
    { id: "KPI-MKT-008", label: "% Participación ventas MinisoLove", campo: "pct_participacion_ventas_minisolove", modo: "pct", unidad: "%", dir: "up" },
    { id: "KPI-MKT-009", label: "Registros nuevos loyalty", campo: "registros_nuevos_loyalty", unidad: "Conteo", dir: "up" },
  ]},
  { titulo: "3. Retención de clientes", filas: [
    { id: "KPI-MKT-010", label: "Frecuencia de compra top loyalty", campo: "frecuencia_de_compra_de_los_clientes_top_loyalty", modo: "dec2", unidad: "Veces", dir: "up" },
    { id: "KPI-MKT-011", label: "Clientes con +1 compra en 180 días", campo: "clientes_con_mas_de_1_compra_en_180_dias", unidad: "Conteo", dir: "up" },
    { id: "KPI-MKT-012", label: "Clientes con +2 compras en 180 días", campo: "clientes_con_mas_de_2_compras_en_180_dias", unidad: "Conteo", dir: "up" },
  ]},
  { titulo: "4. Redención de puntos", filas: [
    { id: "KPI-MKT-013", label: "Puntos redimidos POS", campo: "ptos_redimidos_pos", unidad: "Conteo" },
    { id: "KPI-MKT-014", label: "Puntos redimidos e-commerce", campo: "ptos_redimidos_ecomm", unidad: "Conteo" },
    { id: "KPI-MKT-015", label: "Puntos redimidos app", campo: "ptos_redimidos_app", unidad: "Conteo" },
    { id: "KPI-MKT-016", label: "Monto de puntos redimidos", campo: "monto_redimidos_loy_", modo: "money" },
    { id: "KPI-MKT-017", label: "% Redención vs venta total", campo: "porc_redencion_venta", modo: "pct", unidad: "%", dir: "up" },
  ]},
  { titulo: "5. Alcance", filas: [
    { id: "KPI-MKT-018", label: "Ventas totales marketing", campo: "ventas_total_marketing", modo: "money", dir: "up" },
    { id: "KPI-MKT-019", label: "Top de POS del mes", campo: "top_de_pos_mes_correspondiente" },
    { id: "KPI-MKT-020", label: "Personas alcanzadas en redes (top 5)", campo: "personas_alcanzadas_en_top_5_interacciones_redes_sociales", unidad: "Conteo" },
  ]},
];
const BLK_RRHH: AreaBloque[] = [
  { titulo: "1. Rotación", filas: [
    { id: "KPI-RH-001", label: "Rotación corporativo", campo: "rotacion_corporativo", modo: "pct", unidad: "%", dir: "down" },
    { id: "KPI-RH-002", label: "Rotación operativa almacén", campo: "rotacion_operativa_almacen", modo: "pct", unidad: "%", dir: "down" },
    { id: "KPI-RH-003", label: "Rotación maquila almacén", campo: "rotacion_maquila_almacen", modo: "pct", unidad: "%", dir: "down" },
    { id: "KPI-RH-004", label: "Rotación general tiendas", campo: "rotacion_general_tiendas", modo: "pct", unidad: "%", sub: true, dir: "down" },
    { id: "KPI-RH-005", label: "Rotación gerentes tiendas", campo: "rotacion_gerentes_tiendas", modo: "pct", unidad: "%", dir: "down" },
  ]},
  { titulo: "2. Bajas y plantilla activa", filas: [
    { id: "KPI-RH-006", label: "Bajas del mes — corporativo", campo: "numero_de_bajas_del_mes_en_el_corporativo", unidad: "Conteo", dir: "down" },
    { id: "KPI-RH-007", label: "Activos promedio — corporativo", campo: "numero_promedio_de_activos_en_el_corporativo_al_mes", unidad: "Conteo" },
    { id: "KPI-RH-008", label: "Bajas del mes — almacén operativo", campo: "numero_de_bajas_del_mes_en_la_parte_operativa_del_almacen", unidad: "Conteo", dir: "down" },
    { id: "KPI-RH-009", label: "Activos promedio — almacén operativo", campo: "numero_promedio_de_activos_en_la_parte_operativa_del_almacen_del_mes", unidad: "Conteo" },
    { id: "KPI-RH-010", label: "Bajas del mes — maquila almacén", campo: "numero_de_bajas_del_mes_en_la_parte_maquila_del_almacen", unidad: "Conteo", dir: "down" },
    { id: "KPI-RH-011", label: "Activos promedio — maquila almacén", campo: "numero_promedio_de_activos_en_la_parte_maquila_del_almacen_del_mes", unidad: "Conteo" },
    { id: "KPI-RH-012", label: "Bajas del mes — tiendas", campo: "numero_de_bajas_del_mes_en_general_tiendas", unidad: "Conteo", dir: "down" },
    { id: "KPI-RH-013", label: "Activos promedio — tiendas", campo: "numero_promedio_de_activos_en_general_tiendas_del_mes", unidad: "Conteo" },
    { id: "KPI-RH-014", label: "Bajas del mes — gerentes tienda", campo: "numero_de_bajas_del_mes_en_gerente_tiendas", unidad: "Conteo", dir: "down" },
    { id: "KPI-RH-015", label: "Activos promedio — gerentes tienda", campo: "numero_promedio_de_activos_en_gerente_tiendas_del_mes", unidad: "Conteo" },
  ]},
  { titulo: "3. Headcount y costo", filas: [
    { id: "KPI-RH-016", label: "Head count corporativo", campo: "head_count_corpo", unidad: "Conteo" },
    { id: "KPI-RH-017", label: "Head cost corporativo", campo: "head_cost_corpo", modo: "money" },
    { id: "KPI-RH-018", label: "Head count almacén", campo: "head_count_alancen", unidad: "Conteo" },
    { id: "KPI-RH-019", label: "Head cost almacén", campo: "head_cost_almacen", modo: "money" },
    { id: "KPI-RH-020", label: "Head count tiendas", campo: "head_count_tiendas", unidad: "Conteo" },
    { id: "KPI-RH-021", label: "Head cost tiendas", campo: "head_cost_tiendas", modo: "money" },
    { id: "KPI-RH-022", label: "Promedio empleados por tienda", campo: "promedio_empleados_x_tienda", modo: "dec", unidad: "Conteo" },
    { id: "KPI-RH-023", label: "Promedio empleados por venta", campo: "promedio_empleados_x_venta", unidad: "Conteo", dir: "up" },
  ]},
  { titulo: "4. Cobertura y contratación", filas: [
    { id: "KPI-RH-024", label: "% Cobertura plantilla en tienda", campo: "pct_cobertura_plantilla_en_tienda", modo: "pct", unidad: "%", sub: true, dir: "up" },
    { id: "KPI-RH-025", label: "% Cobertura plantilla en almacén", campo: "pct_cobertura_plantilla_en_almacen", modo: "pct", unidad: "%", dir: "up" },
    { id: "KPI-RH-026", label: "% Cobertura interna gerenciales", campo: "pct_cobertura_interna_gerenciales", modo: "pct", unidad: "%", dir: "up" },
    { id: "KPI-RH-027", label: "Vacantes gerente", campo: "numero_de_vacantes_gerente", unidad: "Conteo", dir: "down" },
    { id: "KPI-RH-028", label: "Vacantes subgerente", campo: "numero_de_vacantes_subgerente", unidad: "Conteo", dir: "down" },
    { id: "KPI-RH-029", label: "Promociones a gerente", campo: "numero_de_promocion_gerente", unidad: "Conteo", dir: "up" },
    { id: "KPI-RH-030", label: "Promociones a subgerente", campo: "numero_de_promocion_subgerente", unidad: "Conteo", dir: "up" },
    { id: "KPI-RH-031", label: "Tiempo contratación — gerenciales", campo: "tiempo_promedio_contratacion_tiendas_gerenciales", modo: "dec", unidad: "Días", dir: "down" },
    { id: "KPI-RH-032", label: "Tiempo contratación — promotores", campo: "tiempo_promedio_contratacion_tiendas_promotores", modo: "dec", unidad: "Días", dir: "down" },
    { id: "KPI-RH-033", label: "Retención de personal antes de 90 días", campo: "retencion_de_personal_tienda_antes_de_90_dias", modo: "pct", unidad: "%", dir: "up" },
  ]},
  { titulo: "5. Compensación variable", filas: [
    { id: "KPI-RH-034", label: "Alcance comisión real — promotor", campo: "alcance_de_comision_real_mensual_promotor", modo: "money" },
    { id: "KPI-RH-035", label: "Target proyectado — promotor", campo: "target_proyectado_para_promotor", modo: "money" },
    { id: "KPI-RH-036", label: "% Alcance comp. variable — promotores", campo: "pct_alcance_de_compensacion_variable_promotores", modo: "pct", unidad: "%", sub: true },
    { id: "KPI-RH-037", label: "Alcance comisión real — subgerente", campo: "alcance_de_comision_real_mensual_subgerente", modo: "money" },
    { id: "KPI-RH-038", label: "Target proyectado — subgerente", campo: "target_proyectado_para_subgerente", modo: "money" },
    { id: "KPI-RH-039", label: "% Alcance comp. variable — subgerentes", campo: "pct_alcance_de_compensacion_variable_subgerentes", modo: "pct", unidad: "%", sub: true },
    { id: "KPI-RH-040", label: "Alcance comisión real — gerente", campo: "alcance_de_comision_real_mensual_gerente", modo: "money" },
    { id: "KPI-RH-041", label: "Target proyectado — gerente", campo: "target_proyectado_para_gerente", modo: "money" },
    { id: "KPI-RH-042", label: "% Alcance comp. variable — gerentes", campo: "pct_alcance_de_compensacion_variable_gerentes", modo: "pct", unidad: "%", sub: true },
  ]},
  { titulo: "6. Clima", filas: [
    { id: "KPI-RH-043", label: "Calificación satisfacción compañía", campo: "calificacion_satisfaccion_compania", modo: "dec2", unidad: "Puntos", dir: "up" },
  ]},
];
const BLK_AUDITORIA: AreaBloque[] = [
  { titulo: "1. Merma y robo", filas: [
    { id: "KPI-AUD-001", label: "Robo tiendas", campo: "robo_tdas", modo: "pct", unidad: "% s/ venta", sub: true, dir: "down" },
    { id: "KPI-AUD-002", label: "Merma tiendas", campo: "merma_tdas", modo: "pct", unidad: "% s/ venta", dir: "down" },
    { id: "KPI-AUD-003", label: "Caducados tienda", campo: "caducados_tdas", modo: "pct", unidad: "% s/ venta", dir: "down" },
  ]},
  { titulo: "2. Eventos de seguridad", filas: [
    { id: "KPI-AUD-004", label: "Eventos farderos", campo: "eventos_farderos", unidad: "Conteo" },
    { id: "KPI-AUD-005", label: "Eventos robo interno", campo: "eventos_robo_interno", unidad: "Conteo", dir: "down" },
    { id: "KPI-AUD-006", label: "Robo de camión", campo: "robo_de_camion", unidad: "Conteo", dir: "down" },
  ]},
];

type AreaFila = { id: string; label: string; campo: string; modo?: string; unidad?: string; sub?: boolean; dir?: string };
type AreaBloque = { titulo: string; filas: AreaFila[] };
type Celda = { main: string; sec: string; col: string; dir?: string; dirCol?: string };

function AreaTable({ paises, bloques, cell }: {
  paises: readonly string[]; bloques: AreaBloque[]; cell: (p: string, f: AreaFila) => Celda;
}) {
  return (
    <div style={{ width: "100%", maxWidth: 1440 }}>
      {bloques.filter((b) => b.filas.some((f) => paises.some((p) => cell(p, f).main !== "—"))).map((b, bi) => (
        <div key={bi} style={{ marginTop: bi === 0 ? 4 : 12 }}>
          <div style={{ fontSize: 12, fontWeight: 500, color: "var(--text-1)", marginBottom: 5 }}>{b.titulo}</div>
          <div style={{ border: "0.5px solid var(--border)", borderRadius: 8, overflow: "hidden" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12, tableLayout: "fixed" }}>
              <thead>
                <tr style={{ background: "var(--bg-2)" }}>
                  <Th left width={340}>Concepto</Th>
                  {paises.map((p) => (
                    <th key={p} style={{ padding: "6px 12px", textAlign: "right", fontWeight: 500, color: "var(--text-3)", fontSize: 11 }}>
                      <span style={{ background: "var(--bg-4)", color: "var(--text-3)", fontSize: 11, padding: "2px 5px", borderRadius: 3, fontWeight: 700, letterSpacing: "0.04em", marginRight: 5 }}>{p}</span>
                      {NOMBRE[p]}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {b.filas.map((f) => (
                  <tr key={f.id} style={{ background: f.sub ? "var(--bg-2)" : "var(--bg-0)", borderTop: "0.5px solid var(--border)" }}>
                    <td style={{ padding: "4px 12px", lineHeight: 1.3, verticalAlign: "top", color: f.sub ? "var(--text-1)" : "var(--text-3)", fontWeight: f.sub ? 600 : 400 }}>
                      {f.label}
                      {f.unidad && <span style={{ color: "var(--text-4)", fontSize: 11, marginLeft: 5 }}>{f.unidad}</span>}
                      <span style={{ color: "var(--text-4)", fontSize: 11, marginLeft: 6 }}>{f.id}</span>
                    </td>
                    {paises.map((p) => {
                      const c = cell(p, f);
                      return (
                        <td key={p} style={{ padding: "4px 12px", textAlign: "right", verticalAlign: "top", lineHeight: 1.3, fontVariantNumeric: "tabular-nums" }}>
                          <div style={{ fontWeight: f.sub ? 600 : 400, color: c.main === "—" ? "var(--text-4)" : f.sub ? "var(--text-1)" : "var(--text-2)" }}>
                            {c.main}
                            {c.dir && <span style={{ fontSize: 10, marginLeft: 3, color: c.dirCol }}>{c.dir}</span>}
                          </div>
                          {c.sec && <div style={{ fontSize: 10, color: c.col, marginTop: -1 }}>{c.sec}</div>}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ))}
    </div>
  );
}

function SecToggle({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const ops = [["imp", "Importe"], ["var", "vs Año ant."], ["aa", "Año anterior"]];
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
      <span style={{ fontSize: 11, color: "var(--text-4)" }}>Línea secundaria</span>
      <div style={{ display: "inline-flex", border: "0.5px solid var(--border)", borderRadius: 6, overflow: "hidden" }}>
        {ops.map(([k, lbl], i) => (
          <button key={k} onClick={() => onChange(k)} style={{
            border: "none", borderLeft: i === 0 ? "none" : "0.5px solid var(--border)",
            background: value === k ? "var(--bg-4)" : "transparent",
            color: value === k ? "var(--text-1)" : "var(--text-3)",
            fontSize: 12, padding: "8px 12px", minHeight: 36, cursor: "pointer",
          }}>{lbl}</button>
        ))}
      </div>
    </div>
  );
}

// ─── versión móvil: un país a la vez, todo el contenido en vertical ───────────

function MovilChips({ paises, sel, onSel, titulo, mes, anio, onMes, onAnio }: {
  paises: readonly string[]; sel: string; onSel: (p: string) => void; titulo: string;
  mes: number; anio: number; onMes: (m: number) => void; onAnio: (a: number) => void;
}) {
  // El sidebar con el selector de período se oculta en móvil, así que el mes y el
  // año viven aquí. Se usan <select> nativos: en iOS y Android abren el selector
  // del sistema, que es más cómodo que cualquier control propio.
  const selEstilo = {
    background: "var(--bg-2)", border: "0.5px solid var(--border)", borderRadius: 6,
    color: "var(--text-2)", fontSize: 12, padding: "0 8px", minHeight: 44,
    fontFamily: "inherit", appearance: "none" as const, WebkitAppearance: "none" as const,
  };
  return (
    <div style={{
      position: "sticky", top: 0, zIndex: 20, background: "var(--bg-0)",
      borderBottom: "0.5px solid var(--border)", padding: "9px 12px 8px",
    }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8, gap: 8 }}>
        <span style={{ fontSize: 13, fontWeight: 500, flexShrink: 0 }}>{titulo}</span>
        <div style={{ display: "flex", gap: 5, flexShrink: 0 }}>
          <select value={mes} onChange={(e) => onMes(Number(e.target.value))} style={selEstilo} aria-label="Mes">
            {MESES.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
          </select>
          <select value={anio} onChange={(e) => onAnio(Number(e.target.value))} style={selEstilo} aria-label="Año">
            {[2024, 2025, 2026].map((a) => <option key={a} value={a}>{a}</option>)}
          </select>
        </div>
      </div>
      <div style={{ display: "flex", gap: 5, overflowX: "auto", paddingBottom: 2 }}>
        {paises.map((p) => (
          <button key={p} onClick={() => onSel(p)} style={{
            flexShrink: 0, border: "none", borderRadius: 22, cursor: "pointer",
            padding: "0 16px", minHeight: 44, fontSize: 12,
            background: sel === p ? "var(--red)" : "var(--bg-2)",
            color: sel === p ? "#fff" : "var(--text-3)",
          }}>{NOMBRE[p]}</button>
        ))}
      </div>
    </div>
  );
}

function MovilNav({ area, setArea }: { area: string; setArea: (a: string) => void }) {
  return (
    <div style={{
      position: "fixed", left: 0, right: 0, bottom: 0, zIndex: 30,
      background: "var(--bg-1)", borderTop: "0.5px solid var(--border)",
      display: "flex", overflowX: "auto",
      padding: "0 4px",
      paddingBottom: "env(safe-area-inset-bottom)",
    }}>
      {AREAS.map((a) => (
        <button key={a.id} onClick={() => setArea(a.id)} style={{
          flex: "1 0 auto", border: "none", background: "transparent", cursor: "pointer",
          fontSize: 11, padding: "0 10px", minHeight: 48, whiteSpace: "nowrap",
          color: area === a.id ? "var(--red)" : "var(--text-4)",
          fontWeight: area === a.id ? 600 : 400,
        }}>{a.label}</button>
      ))}
    </div>
  );
}

function MovilFila({ label, id, unidad, valor, sec, secCol, dir, dirCol, fuerte, sangria }: {
  label: string; id?: string; unidad?: string; valor: string; sec?: string; secCol?: string;
  dir?: string; dirCol?: string; fuerte?: boolean; sangria?: boolean;
}) {
  return (
    <div style={{
      display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 10,
      padding: fuerte ? "8px 12px" : "5px 12px",
      paddingLeft: sangria ? 24 : 12,
      background: fuerte ? "var(--bg-2)" : "transparent",
      borderTop: fuerte ? "0.5px solid var(--border)" : "none",
    }}>
      <div style={{ minWidth: 0 }}>
        <div style={{
          fontSize: fuerte ? 12.5 : 11.5, fontWeight: fuerte ? 600 : 400,
          color: fuerte ? "var(--text-1)" : "var(--text-3)", lineHeight: 1.3,
        }}>
          {label}
          {unidad && <span style={{ color: "var(--text-4)", fontSize: 11, marginLeft: 4 }}>{unidad}</span>}
        </div>
        {id && <div style={{ fontSize: 10, color: "var(--text-4)" }}>{id}</div>}
      </div>
      <div style={{ textAlign: "right", flexShrink: 0, fontVariantNumeric: "tabular-nums" }}>
        <div style={{
          fontSize: fuerte ? 17 : 14, fontWeight: fuerte ? 600 : 400,
          color: valor === "—" ? "var(--text-4)" : "var(--text-1)", lineHeight: 1.15,
        }}>
          {valor}
          {dir && <span style={{ fontSize: 10, marginLeft: 3, color: dirCol }}>{dir}</span>}
        </div>
        {sec && <div style={{ fontSize: 10, color: secCol || "var(--text-3)" }}>{sec}</div>}
      </div>
    </div>
  );
}

function MovilPnL({ pais, rows }: { pais: string; rows: PnLRow[] }) {
  return (
    <div style={{ border: "0.5px solid var(--border)", borderRadius: 10, overflow: "hidden", margin: "10px 0" }}>
      {rows.map((r, i) => (
        <MovilFila
          key={i}
          label={r.label}
          id={r.id}
          valor={r.get(pais)}
          sec={r.sub ? r.sub(pais) : undefined}
          secCol={r.subCol ? r.subCol(pais) : undefined}
          dir={r.dir ? r.dir(pais) : undefined}
          dirCol={r.dirCol ? r.dirCol(pais) : undefined}
          fuerte={r.kind === "sub"}
          sangria={r.kind !== "sub"}
        />
      ))}
    </div>
  );
}

function MovilArea({ pais, bloques, cell }: {
  pais: string; bloques: AreaBloque[]; cell: (p: string, f: AreaFila) => Celda;
}) {
  return (
    <div>
      {bloques
        .filter((b) => b.filas.some((f) => cell(pais, f).main !== "—"))
        .map((b, bi) => (
          <div key={bi} style={{ marginTop: bi === 0 ? 10 : 14 }}>
            <div style={{ fontSize: 12, fontWeight: 500, color: "var(--text-1)", marginBottom: 5, padding: "0 2px" }}>
              {b.titulo}
            </div>
            <div style={{ border: "0.5px solid var(--border)", borderRadius: 10, overflow: "hidden" }}>
              {b.filas.map((f) => {
                const c = cell(pais, f);
                return (
                  <MovilFila
                    key={f.id}
                    label={f.label}
                    id={f.id}
                    unidad={f.unidad}
                    valor={c.main}
                    sec={c.sec}
                    secCol={c.col}
                    dir={c.dir}
                    dirCol={c.dirCol}
                    fuerte={f.sub}
                  />
                );
              })}
            </div>
          </div>
        ))}
    </div>
  );
}

function MovilKpiList({ pais, title, cols }: { pais: string; title: string; cols: KpiColDef[] }) {
  return (
    <div style={{ marginTop: 14 }}>
      <div style={{ fontSize: 12, fontWeight: 500, color: "var(--text-1)", marginBottom: 5, padding: "0 2px" }}>{title}</div>
      <div style={{ border: "0.5px solid var(--border)", borderRadius: 10, overflow: "hidden" }}>
        {cols.map((c) => (
          <MovilFila key={c.id} label={c.label} id={c.id} valor={c.getVal(pais)} />
        ))}
      </div>
    </div>
  );
}

type PnLRow = { kind: "sub" | "item"; label: string; id?: string; get: (pais: string) => string; sub?: (pais: string) => string; subCol?: (pais: string) => string; dir?: (pais: string) => string; dirCol?: (pais: string) => string };

function PnLTable({ paises, rows }: { paises: readonly string[]; rows: PnLRow[] }) {
  return (
    <div style={{ border: "0.5px solid var(--border)", borderRadius: 8, overflow: "hidden", width: "100%", maxWidth: 1440, minWidth: 270 + paises.length * 175 }}>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12, tableLayout: "fixed" }}>
        <thead>
          <tr style={{ background: "var(--bg-2)" }}>
            <Th left width={270}>Concepto</Th>
            {paises.map((p) => (
              <th key={p} style={{ padding: "6px 12px", textAlign: "right", fontWeight: 500, color: "var(--text-3)", fontSize: 11 }}>
                <span style={{ background: "var(--bg-4)", color: "var(--text-3)", fontSize: 11, padding: "2px 5px", borderRadius: 3, fontWeight: 700, letterSpacing: "0.04em", marginRight: 5 }}>{p}</span>
                {NOMBRE[p]}
                <span style={{ color: "var(--text-4)", fontSize: 11, marginLeft: 4 }}>{MONEDA[p]}</span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => {
            const isSub = r.kind === "sub";
            return (
              <tr key={i} style={{
                background: isSub ? "var(--bg-2)" : "var(--bg-0)",
                borderTop: isSub ? "0.5px solid var(--border)" : "none",
              }}>
                <td style={{
                  padding: "4px 12px",
                  paddingLeft: isSub ? 12 : 26,
                  lineHeight: 1.25,
                  color: isSub ? "var(--text-1)" : "var(--text-3)",
                  fontWeight: isSub ? 600 : 400,
                  fontSize: 12,
                }}>
                  {r.label}
                  {r.id && <span style={{ color: "var(--text-4)", fontSize: 11, marginLeft: 6, fontWeight: 400 }}>{r.id}</span>}
                </td>
                {paises.map((p) => {
                  const v = r.get(p);
                  const sv = r.sub ? r.sub(p) : null;
                  return (
                    <td key={p} style={{
                      padding: "4px 12px",
                      textAlign: "right",
                      lineHeight: 1.25,
                      fontVariantNumeric: "tabular-nums",
                    }}>
                      <div style={{
                        fontWeight: isSub ? 600 : 400,
                        fontSize: 12,
                        color: v === "—" ? "var(--text-4)" : isSub ? "var(--text-1)" : "var(--text-2)",
                      }}>
                        {v}
                        {r.dir && r.dir(p) && <span style={{ fontSize: 10, marginLeft: 3, color: r.dirCol ? r.dirCol(p) : "var(--text-4)" }}>{r.dir(p)}</span>}
                      </div>
                      {sv && sv !== "—" && (
                        <div style={{ fontSize: 10, color: r.subCol ? r.subCol(p) : "var(--text-3)", marginTop: -1 }}>{sv}</div>
                      )}
                    </td>
                  );
                })}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function KpiGroupTable({ title, cols, paises }: { title: string; cols: KpiColDef[]; paises: readonly string[] }) {
  return (
    <div style={{ marginTop: 10 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 5 }}>
        <span style={{ fontSize: 12, fontWeight: 500, color: "var(--text-1)" }}>{title}</span>
        <span style={{ fontSize: 10, color: "var(--text-4)" }}>· {cols.length} KPIs</span>
      </div>
      <div style={{ border: "0.5px solid var(--border)", borderRadius: 8, overflow: "hidden" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12, tableLayout: "fixed" }}>
          <thead>
            <tr style={{ background: "var(--bg-2)" }}>
              <Th left width={96}>País</Th>
              {cols.map((c) => <ThKpi key={c.id} id={c.id}>{c.label}</ThKpi>)}
            </tr>
          </thead>
          <tbody>
            {paises.map((pais, i) => (
              <tr key={pais} style={{ background: i % 2 === 0 ? "var(--bg-1)" : "var(--bg-0)", borderBottom: "0.5px solid var(--border)" }}>
                <td style={{ padding: "6px 12px" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <span style={{ background: "var(--bg-4)", color: "var(--text-3)", fontSize: 11, padding: "2px 5px", borderRadius: 3, fontWeight: 700, letterSpacing: "0.04em" }}>{pais}</span>
                    <span style={{ color: "var(--text-1)", fontWeight: 500 }}>{NOMBRE[pais]}</span>
                  </div>
                </td>
                {cols.map((c) => {
                  const v = c.getVal(pais);
                  return (
                    <td key={c.id} style={{ padding: "6px 12px", textAlign: "right", color: v === "—" ? "var(--text-4)" : "var(--text-2)" }}>
                      {v}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── sub-componentes ──────────────────────────────────────────────────────────

function AreaHeader({ title, sub, loading, badge }: {
  title: string; sub: string; loading?: boolean; badge?: React.ReactNode;
}) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16 }}>
      <span style={{ fontSize: 16, fontWeight: 500 }}>{title}</span>
      <span style={{ color: "var(--text-4)" }}>·</span>
      <span style={{ color: "var(--text-3)", fontSize: 12 }}>{sub}</span>
      {loading && (
        <span style={{
          background: "var(--red-bg)", border: "0.5px solid var(--red-border)",
          color: "var(--red)", fontSize: 10, padding: "2px 8px", borderRadius: 10,
        }}>actualizando…</span>
      )}
      {badge}
    </div>
  );
}

function TableLegend() {
  return (
    <div style={{ display: "flex", gap: 16, marginTop: 8, paddingLeft: 2 }}>
      <LegendItem color="var(--green)" label="Mejor del grupo" />
      <LegendItem color="var(--rose)" label="Peor del grupo" />
      <span style={{ fontSize: 10, color: "var(--text-4)" }}>— Dato no disponible en esta tabla</span>
    </div>
  );
}

function SideSep() {
  return <div style={{ height: "0.5px", background: "var(--border)", margin: "6px 0" }} />;
}

function SidePicker({ value, options, onChange }: {
  value: string; options: string[]; onChange: (v: string) => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div style={{ position: "relative", margin: "2px 10px" }}>
      <div
        onClick={() => setOpen(!open)}
        style={{
          display: "flex", alignItems: "center", justifyContent: "space-between",
          padding: "5px 8px", background: "var(--bg-3)",
          border: "0.5px solid var(--border-2)", borderRadius: 5,
          fontSize: 11, color: "var(--text-2)", cursor: "pointer",
        }}
      >
        {value}
        <span style={{ fontSize: 10, color: "var(--text-4)" }}>▾</span>
      </div>
      {open && (
        <div style={{
          position: "absolute", top: "100%", left: 0, right: 0, zIndex: 50,
          background: "var(--bg-3)", border: "0.5px solid var(--border-2)",
          borderRadius: 5, marginTop: 2, overflow: "hidden",
        }}>
          {options.map((opt) => (
            <div
              key={opt}
              onClick={() => { onChange(opt); setOpen(false); }}
              style={{
                padding: "5px 8px", fontSize: 11, cursor: "pointer",
                color: opt === value ? "var(--text-1)" : "var(--text-2)",
                background: opt === value ? "var(--red-bg)" : "transparent",
              }}
            >
              {opt}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function SideSection({ label }: { label: string }) {
  return (
    <div style={{
      padding: "12px 14px 4px",
      fontSize: 10, color: "var(--text-4)",
      letterSpacing: "0.08em", textTransform: "uppercase",
    }}>{label}</div>
  );
}

function SideItem({ icon, label, active, onClick }: { icon: string; label: string; active?: boolean; onClick?: () => void }) {
  return (
    <div onClick={onClick} style={{
      display: "flex", alignItems: "center", gap: 8,
      padding: "7px 14px", fontSize: 12, cursor: "pointer",
      color: active ? "var(--text-1)" : "var(--text-3)",
      background: active ? "var(--red-bg)" : "transparent",
      borderLeft: `2px solid ${active ? "var(--red)" : "transparent"}`,
      transition: "all 0.1s",
    }}>
      <span style={{ fontSize: 13 }}>{icon}</span>
      {label}
    </div>
  );
}

function KpiCard({ label, value, sub, loading, pending, kpiId }: {
  label: string; value: string; sub?: string; loading?: boolean; pending?: boolean; kpiId?: string;
}) {
  return (
    <div style={{
      background: "var(--bg-3)", border: "0.5px solid var(--border)",
      borderRadius: 8, padding: "10px 14px",
    }}>
      <div style={{ fontSize: 10, color: "var(--text-4)", letterSpacing: "0.06em", marginBottom: 4 }}>
        {label.toUpperCase()}
      </div>
      <div style={{
        fontSize: 20, fontWeight: 500,
        color: loading || pending ? "var(--text-4)" : "var(--text-1)",
      }}>
        {value}
      </div>
      {(sub || kpiId) && (
        <div style={{ fontSize: 10, color: "var(--text-4)", marginTop: 2 }}>
          {kpiId ? <span style={{ color: "#fbbf24", opacity: 0.7 }}>{kpiId}</span> : sub}
        </div>
      )}
    </div>
  );
}

function Th({ children, left, width }: { children: React.ReactNode; left?: boolean; width?: number }) {
  return (
    <th style={{
      padding: "9px 12px", textAlign: left ? "left" : "right",
      color: "var(--text-4)", fontSize: 10, letterSpacing: "0.07em",
      fontWeight: 500, textTransform: "uppercase",
      borderBottom: "0.5px solid var(--border)",
      whiteSpace: "nowrap", width: width || "auto",
    }}>{children}</th>
  );
}

function ThKpi({ children, id }: { children: React.ReactNode; id: string }) {
  return (
    <th style={{
      padding: "9px 12px", textAlign: "right",
      color: "var(--text-4)", fontSize: 10, letterSpacing: "0.07em",
      fontWeight: 500, textTransform: "uppercase",
      borderBottom: "0.5px solid var(--border)",
      whiteSpace: "nowrap",
    }}>
      <div>{children}</div>
      <div style={{ fontSize: 10, color: "var(--text-4)", opacity: 0.5, letterSpacing: "0.04em", marginTop: 1 }}>{id}</div>
    </th>
  );
}

function Td({ children }: { children: React.ReactNode }) {
  return (
    <td style={{
      padding: "10px 12px", textAlign: "right",
      fontSize: 12, borderBottom: "0.5px solid var(--border)",
    }}>{children}</td>
  );
}

function LegendItem({ color, label }: { color: string; label: string }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
      <div style={{ width: 8, height: 8, borderRadius: "50%", background: color, flexShrink: 0 }} />
      <span style={{ fontSize: 10, color: "var(--text-4)" }}>{label}</span>
    </div>
  );
}
