"use client";
import { useEffect, useState, useCallback } from "react";

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

function fmtMoney(n: number | null): string {
  if (n == null) return "—";
  if (n === 0) return "$0";
  const abs = Math.abs(n);
  const sign = n < 0 ? "-" : "";
  if (abs >= 1_000_000_000) return `${sign}$${(abs / 1_000_000_000).toFixed(2)}B`;
  if (abs >= 1_000_000)     return `${sign}$${(abs / 1_000_000).toFixed(2)}M`;
  if (abs >= 1_000)         return `${sign}$${(abs / 1_000).toFixed(0)}K`;
  return `${sign}$${abs.toFixed(0)}`;
}

function fmtNum(n: number | null): string {
  if (n == null) return "—";
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000)     return `${(n / 1_000).toFixed(0)}K`;
  return n.toString();
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
    rank === "best"  ? <span style={{ color: "var(--green)", fontSize: 9, marginLeft: 2 }}>▲</span> :
    rank === "worst" ? <span style={{ color: "var(--rose)",  fontSize: 9, marginLeft: 2 }}>▼</span> :
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
  const [year,  setYear]  = useState(NOW.getFullYear());
  const [month, setMonth] = useState(NOW.getMonth() + 1);
  const [ptype, setPtype] = useState("mes"); // mes | ytd | ltm
  type MvRow = Record<string, number | string | null>;
  const [mvData, setMvData] = useState<Record<string, Record<string, MvRow>>>({});
  const [mvMes,  setMvMes]  = useState<Record<string, string>>({});
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
  const [loading, setLoading] = useState(true);
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

  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    fetch(`/api/cabina?year=${year}&month=${month}&period=${ptype}`)
      .then((r) => r.json())
      .then((d) => { if (d.ok) setData(d.data); else setError(d.error); })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [year, month, ptype]);

  useEffect(() => { load(); }, [load]);

  const loadMarketing = useCallback(() => {
    setMktLoading(true);
    setMktError(null);
    fetch(`/api/marketing?year=${year}&month=${month}&period=${ptype}`)
      .then((r) => r.json())
      .then((d) => { if (d.ok) setMktData(d.data); else setMktError(d.error); })
      .catch((e) => setMktError(e.message))
      .finally(() => setMktLoading(false));
  }, [year, month, ptype]);

  useEffect(() => {
    if (area === "marketing") loadMarketing();
  }, [area, loadMarketing]);

  const loadOperaciones = useCallback(() => {
    setOpsLoading(true);
    setOpsError(null);
    fetch(`/api/operaciones?year=${year}&month=${month}&period=${ptype}`)
      .then((r) => r.json())
      .then((d) => { if (d.ok) setOpsData(d); else setOpsError(d.error); })
      .catch((e) => setOpsError(e.message))
      .finally(() => setOpsLoading(false));
  }, [year, month, ptype]);

  useEffect(() => {
    if (area === "operaciones") loadOperaciones();
  }, [area, loadOperaciones]);

  const loadComercial = useCallback(() => {
    setComLoading(true);
    setComError(null);
    fetch(`/api/comercial?year=${year}&month=${month}&period=${ptype}`)
      .then((r) => r.json())
      .then((d) => { if (d.ok) setComData(d); else setComError(d.error); })
      .catch((e) => setComError(e.message))
      .finally(() => setComLoading(false));
  }, [year, month, ptype]);

  useEffect(() => {
    if (area === "comercial") loadComercial();
  }, [area, loadComercial]);

  const loadLogistica = useCallback(() => {
    setLogLoading(true);
    setLogError(null);
    fetch(`/api/logistica?year=${year}&month=${month}&period=${ptype}`)
      .then((r) => r.json())
      .then((d) => { if (d.ok) setLogData(d); else setLogError(d.error); })
      .catch((e) => setLogError(e.message))
      .finally(() => setLogLoading(false));
  }, [year, month, ptype]);

  useEffect(() => {
    if (area === "logistica") loadLogistica();
  }, [area, loadLogistica]);

  // Sprint 12 — carga genérica de la vista materializada del área activa
  useEffect(() => {
    const MVAREA: Record<string, string> = {
      finanzas: "finanzas", operaciones: "operaciones", comercial: "comercial",
      logistica: "logistica", marketing: "marketing", rrhh: "rh", auditoria: "auditoria",
    };
    const mv = MVAREA[area];
    if (!mv) return;
    fetch(`/api/mv?area=${mv}&year=${year}&month=${month}`)
      .then((r) => r.json())
      .then((d) => {
        if (!d.ok) return;
        setMvData((prev) => ({ ...prev, [mv]: d.data || {} }));
        setMvMes((prev) => ({ ...prev, [mv]: d.periodoUsado || "" }));
      })
      .catch(() => {});
  }, [area, year, month]);

  async function preguntarIA() {
    if (!pregunta.trim()) return;
    setIaLoading(true);
    setRespuesta("");
    try {
      const res = await fetch("/api/claude", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pregunta, kpis: data, pais: `LATAM (${MESES[month - 1]} ${year})` }),
      });
      const d = await res.json();
      setRespuesta(d.respuesta || d.error || "Sin respuesta");
    } catch (e) {
      setRespuesta(e instanceof Error ? e.message : "Error");
    } finally {
      setIaLoading(false);
    }
  }

  // totales LATAM
  const totales = data ? {
    tiendas:     paisesVis.reduce((s, p) => s + (data[p]?.num_tiendas || 0), 0),
    facturacion: paisesVis.reduce((s, p) => s + (data[p]?.facturacion_total || 0), 0),
    ub:          paisesVis.reduce((s, p) => s + (data[p]?.utilidad_bruta || 0), 0),
    piezas:      paisesVis.reduce((s, p) => s + (data[p]?.piezas || 0), 0),
  } : null;

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
    if (mode === "dec2")  return v.toFixed(2);
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

  const periodo =
    ptype === "ytd" ? `YTD ${MESES[month - 1]} ${year}` :
    ptype === "ltm" ? `LTM a ${MESES[month - 1]} ${year}` :
    `${MESES[month - 1]} ${year}`;

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100vh", background: "var(--bg-0)", overflow: "hidden" }}>

      {/* ── TOPBAR ── */}
      <header style={{
        background: "var(--bg-2)", borderBottom: "0.5px solid var(--border)",
        padding: "0 20px", height: 52, display: "flex", alignItems: "center",
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

        <nav style={{ display: "flex", gap: 2 }}>
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
          width: 148, background: "var(--bg-1)",
          borderRight: "0.5px solid var(--border)",
          padding: "16px 0", flexShrink: 0,
          display: "flex", flexDirection: "column", gap: 0,
        }}>
          <SideSection label="Vistas" />
          <SideItem icon="▦" label="Cabina" active />
          <SideItem icon="↗" label="Tendencias" />
          <SideItem icon="⊞" label="Tiendas" />
          <SideSep />
          <SideSection label="Período" />
          <SidePicker value={ptype === "mes" ? "Mes" : ptype === "ytd" ? "YTD" : "LTM"} options={["Mes", "YTD", "LTM"]} onChange={(v) => setPtype(v === "Mes" ? "mes" : v === "YTD" ? "ytd" : "ltm")} />
          <SidePicker value={MESES[month - 1]} options={MESES} onChange={(v) => setMonth(MESES.indexOf(v) + 1)} />
          <SidePicker value={String(year)} options={["2024", "2025", "2026"]} onChange={(v) => setYear(Number(v))} />
          <button
            onClick={load}
            disabled={loading}
            style={{
              display: "block", margin: "4px 10px 0", width: "calc(100% - 20px)",
              background: loading ? "var(--bg-4)" : "var(--red)",
              border: "none", color: "#fff", fontSize: 11, fontWeight: 500,
              padding: "5px 0", borderRadius: 5, cursor: loading ? "not-allowed" : "pointer",
              transition: "background 0.15s",
            }}
          >
            {loading ? "…" : "↻ Aplicar"}
          </button>
          <SideSep />
          <SideSection label="Países" />
          <SideItem icon="◉" label="LATAM" active={selPaises.length === PAISES.length} onClick={() => setSelPaises([...PAISES])} />
          {PAISES.map((p) => (
            <SideItem key={p} icon="⚑" label={NOMBRE[p]} active={selPaises.length !== PAISES.length && selPaises.includes(p)} onClick={() => togglePais(p)} />
          ))}
        </aside>

        {/* ── MAIN ── */}
        <main style={{ flex: 1, overflow: "auto", padding: 20 }}>

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
                if (pnlPaises.length === 0) {
                  return <div style={{ color: "var(--text-4)", fontSize: 12, padding: "24px 0" }}>Sin datos de P&amp;L para los países seleccionados.</div>;
                }
                const V = (p: string) => {
                  const g = (f: string) => finNum(p, f);
                  const a = (f: string) => { const v = g(f); return v == null ? null : Math.abs(v); };
                  const venta = g("fact_total");
                  const cv = a("costo_venta");
                  const ca = a("costo_almacen");
                  const ct = a("costo_total") ?? ((cv ?? 0) + (ca ?? 0));
                  const ub = venta == null ? null : venta - ct;
                  const nomOp = a("gasto_nomina_operativa");
                  const ocup = a("gasto_ocupacion");
                  const dist = a("gasto_operativo_distribucion");
                  const gOp = a("gasto_operativo");
                  const tgo = a("total_gasto_operacion") ?? gOp;
                  const eTda = ub == null ? null : ub - (tgo ?? 0);
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
                const rows: PnLRow[] = [
                  { kind: "sub",  label: "Facturación Total",           id: "KPI-FIN-001", get: p => money(V(p).venta) },
                  { kind: "item", label: "Costo de ventas",             id: "KPI-FIN-006", get: p => { const v = V(p); return pctOf(v.cv, v.venta); },   sub: p => neg(V(p).cv) },
                  { kind: "item", label: "Costo de almacén",            id: "KPI-FIN-008", get: p => { const v = V(p); return pctOf(v.ca, v.venta); },   sub: p => neg(V(p).ca) },
                  { kind: "item", label: "Nómina de almacén",           id: "KPI-FIN-010", get: p => { const v = V(p); return pctOf(v.nomAlm, v.venta); }, sub: p => neg(V(p).nomAlm) },
                  { kind: "item", label: "Costo total",                 id: "KPI-FIN-012", get: p => { const v = V(p); return pctOf(v.ct, v.venta); },   sub: p => neg(V(p).ct) },
                  { kind: "sub",  label: "Utilidad Bruta",              id: "KPI-FIN-014", get: p => { const v = V(p); return pctOf(v.ub, v.venta); },   sub: p => money(V(p).ub) },
                  { kind: "item", label: "Nómina operativa",            id: "KPI-FIN-018", get: p => { const v = V(p); return pctOf(v.nomOp, v.venta); }, sub: p => neg(V(p).nomOp) },
                  { kind: "item", label: "Gastos de ocupación",         id: "KPI-FIN-020", get: p => { const v = V(p); return pctOf(v.ocup, v.venta); }, sub: p => neg(V(p).ocup) },
                  { kind: "item", label: "Gasto de distribución",       id: "KPI-FIN-022", get: p => { const v = V(p); return pctOf(v.dist, v.venta); }, sub: p => neg(V(p).dist) },
                  { kind: "item", label: "Otros gastos operativos",     id: "KPI-FIN-016", get: p => { const v = V(p); return pctOf(v.gOp, v.venta); },  sub: p => neg(V(p).gOp) },
                  { kind: "item", label: "Total gastos de operación",   id: "KPI-FIN-023", get: p => { const v = V(p); return pctOf(v.tgo, v.venta); },  sub: p => neg(V(p).tgo) },
                  { kind: "sub",  label: "EBITDA Tienda",               id: "KPI-FIN-024", get: p => { const v = V(p); return pctOf(v.eTda, v.venta); }, sub: p => money(V(p).eTda) },
                  { kind: "item", label: "Gasto corporativo",           id: "KPI-FIN-026", get: p => { const v = V(p); return pctOf(v.gc, v.venta); },   sub: p => neg(V(p).gc) },
                  { kind: "item", label: "Otros gastos / ingresos",     id: "KPI-FIN-029", get: p => { const v = V(p); return pctOf(v.oc, v.venta); },   sub: p => money(V(p).oc) },
                  { kind: "sub",  label: "EBITDA División",             id: "KPI-FIN-028", get: p => { const v = V(p); return pctOf(v.eDiv, v.venta); }, sub: p => money(V(p).eDiv) },
                  { kind: "item", label: "Depreciación y amortización", id: "KPI-FIN-032", get: p => { const v = V(p); return pctOf(v.da, v.venta); },   sub: p => neg(V(p).da) },
                  { kind: "item", label: "Gasto financiero",            id: "KPI-FIN-031", get: p => { const v = V(p); return pctOf(v.gf, v.venta); },   sub: p => neg(V(p).gf) },
                  { kind: "item", label: "Impuestos",                   id: "KPI-FIN-033", get: p => { const v = V(p); return pctOf(v.imp, v.venta); },  sub: p => neg(V(p).imp) },
                  { kind: "sub",  label: "Utilidad Neta",               id: "KPI-FIN-034", get: p => { const v = V(p); return pctOf(v.un, v.venta); },   sub: p => money(V(p).un) },
                ];
                return (
                  <>
                    <PnLTable paises={pnlPaises} rows={rows} />
                    <div style={{ fontSize: 10, color: "var(--text-4)", marginTop: 6, lineHeight: 1.5 }}>
                      Todos los conceptos se expresan como % sobre facturación para permitir comparación entre monedas; el importe en moneda local va debajo en gris. Los subtotales se recalculan localmente
                      sobre el valor absoluto de costos y gastos. El origen los almacena en negativo y los subtotales de la
                      vista quedan sobrestimados. Pendiente de corrección en datos maestros.
                    </div>
                    <KpiGroupTable paises={pnlPaises} title="Volumen y mismas tiendas" cols={[
                      { id: "KPI-FIN-003", label: "Piezas totales",   getVal: p => finVal(p, "fact_pzas") },
                      { id: "KPI-FIN-002", label: "Facturación MT",   getVal: p => finVal(p, "facturacion_mt_venta", "money") },
                      { id: "KPI-FIN-004", label: "Piezas MT",        getVal: p => finVal(p, "facturacion_mt_piezas") },
                      { id: "KPI-FIN-005", label: "% Crec. MT vs AA", getVal: p => finVal(p, "pct_crecimiento_mts_vs_anio_anterior", "pct") },
                    ]} />
                    <KpiGroupTable paises={pnlPaises} title="Venta por canal" cols={[
                      { id: "KPI-FIN-041", label: "Blind Lab",    getVal: p => finVal(p, "venta_blind_lab", "money") },
                      { id: "KPI-FIN-042", label: "E-commerce",   getVal: p => finVal(p, "venta_on_line", "money") },
                      { id: "KPI-FIN-043", label: "Marketplaces", getVal: p => finVal(p, "venta_marketplaces", "money") },
                      { id: "KPI-FIN-044", label: "Coppel",       getVal: p => finVal(p, "venta_coppel", "money") },
                    ]} />
                    <KpiGroupTable paises={pnlPaises} title="Estructura financiera" cols={[
                      { id: "KPI-FIN-036", label: "Free Cash Flow",   getVal: p => finVal(p, "free_cash_flow", "money") },
                      { id: "KPI-FIN-037", label: "Tasa (spread)",    getVal: p => finVal(p, "tasa", "pct") },
                      { id: "KPI-FIN-038", label: "Deuda",            getVal: p => finVal(p, "deuda", "money") },
                      { id: "KPI-FIN-039", label: "Apalancamiento",   getVal: p => finVal(p, "apalancamiento_vs_deuda", "dec2") },
                      { id: "KPI-FIN-040", label: "Seguros x recup.", getVal: p => finVal(p, "montos_seguros_por_recuperar", "money") },
                    ]} />
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
              <AreaHeader title={periodo} sub="Desempeño operativo por país — datos reales Redshift" loading={opsLoading} />
              <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 8, marginBottom: 16 }}>
                <KpiCard label="Vta Prom/Tienda" value={opsData ? fmtMoney(opsData.latam.vta_prom_tienda) : "—"} sub="LATAM · KPI-OPS-005" loading={opsLoading} kpiId="KPI-OPS-005" />
                <KpiCard
                  label="Ticket promedio"
                  value={opsData ? fmtMoney(opsData.latam.ticket_promedio) : "—"}
                  sub="LATAM ponderado · KPI-OPS-002"
                  loading={opsLoading}
                  kpiId="KPI-OPS-002"
                />
                <KpiCard
                  label="Pzas por ticket"
                  value={opsData ? opsData.latam.pzas_ticket.toFixed(1) : "—"}
                  sub="LATAM ponderado · KPI-OPS-003"
                  loading={opsLoading}
                  kpiId="KPI-OPS-003"
                />
                <KpiCard
                  label="Conversión MX"
                  value={opsData?.data?.MX?.conversion_pct != null
                    ? fmtPct(opsData.data.MX.conversion_pct)
                    : "—"}
                  sub={opsData?.data?.MX?.trafico_total != null
                    ? `Tráfico: ${fmtNum(opsData.data.MX.trafico_total)} personas`
                    : "Solo MX · KPI-OPS-004"}
                  loading={opsLoading}
                  kpiId="KPI-OPS-004"
                />
              </div>
              {opsError && (
                <div style={{ padding: "8px 12px", background: "var(--bg-3)", borderRadius: 6, color: "var(--rose)", fontSize: 11, marginBottom: 12 }}>
                  Error cargando operaciones: {opsError}
                </div>
              )}
              <div style={{ border: "0.5px solid var(--border)", borderRadius: 8, overflow: "hidden" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12, tableLayout: "fixed" }}>
                  <thead>
                    <tr style={{ background: "var(--bg-2)" }}>
                      <Th left width={72}>País</Th>
                      <ThKpi id="KPI-OPS-002">Ticket Prom.</ThKpi>
                      <ThKpi id="KPI-OPS-003">Pzas/Ticket</ThKpi>
                      <ThKpi id="KPI-OPS-004">Conversión</ThKpi>
                      <ThKpi id="KPI-OPS-005">Vta Prom/Tienda</ThKpi>
                      <ThKpi id="KPI-OPS-006">Clientes</ThKpi>
                      <ThKpi id="KPI-OPS-017">OTD Almacén</ThKpi>
                    </tr>
                  </thead>
                  <tbody>
                    {paisesVis.map((pais, i) => {
                      const r = opsData?.data?.[pais];
                      return (
                        <tr key={pais} style={{ background: i % 2 === 0 ? "var(--bg-1)" : "var(--bg-0)", borderBottom: "0.5px solid var(--border)" }}>
                          <td style={{ padding: "10px 12px" }}>
                            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                              <span style={{ background: "var(--bg-4)", color: "var(--text-3)", fontSize: 9, padding: "2px 5px", borderRadius: 3, fontWeight: 700, letterSpacing: "0.04em" }}>{pais}</span>
                              <span style={{ color: "var(--text-1)", fontWeight: 500 }}>{NOMBRE[pais]}</span><span style={{ color: "var(--text-4)", fontSize: 9, marginLeft: 4 }}>{MONEDA[pais]}</span>
                            </div>
                          </td>
                          <Td>{r?.ticket_promedio ? fmtMoney(r.ticket_promedio) : "—"}</Td>
                          <Td>{r?.pzas_ticket ? r.pzas_ticket.toFixed(1) : "—"}</Td>
                          <Td>
                            {pais === "MX" && r?.conversion_pct != null
                              ? fmtPct(r.conversion_pct)
                              : "—"
                            }
                          </Td>
                          <Td>{r?.vta_prom_tienda ? fmtMoney(r.vta_prom_tienda) : "—"}</Td>
                          <Td>{pais === "MX" && mktData
                            ? fmtNum(mktData.transacciones.clientes_activos)
                            : <span style={{ color: "var(--text-4)", fontSize: 10 }}>—</span>
                          }</Td>
                          <td style={{ padding: "10px 12px", textAlign: "right", color: "var(--text-4)" }}>—</td>
                        </tr>
                      );
                    })}
                  </tbody>
                  <tfoot>
                    <tr style={{ background: "var(--bg-3)", borderTop: "0.5px solid var(--border-2)" }}>
                      <td style={{ padding: "8px 12px", color: "var(--text-4)", fontSize: 10, letterSpacing: "0.08em" }}>LATAM</td>
                      <td style={{ padding: "8px 12px", textAlign: "right", color: "var(--text-2)", fontWeight: 500 }}>
                        {opsData ? fmtMoney(opsData.latam.ticket_promedio) : "—"}
                      </td>
                      <td style={{ padding: "8px 12px", textAlign: "right", color: "var(--text-2)", fontWeight: 500 }}>
                        {opsData ? opsData.latam.pzas_ticket.toFixed(1) : "—"}
                      </td>
                      <td style={{ padding: "8px 12px", textAlign: "right", color: "var(--text-4)" }}>—</td>
                      <td style={{ padding: "8px 12px", textAlign: "right", color: "var(--text-2)", fontWeight: 500 }}>
                        {opsData ? fmtMoney(opsData.latam.vta_prom_tienda) : "—"}
                      </td>
                      <td style={{ padding: "8px 12px", textAlign: "right", color: "var(--text-4)" }}>—</td>
                      <td style={{ padding: "8px 12px", textAlign: "right", color: "var(--text-4)" }}>—</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
              <TableLegend />
              {/* KPI Tables — Operaciones */}
              <KpiGroupTable paises={paisesVis} title="Eficiencia de Venta" cols={[
                { id: "KPI-OPS-002", label: "Ticket Promedio",    getVal: p => fmtMoney(opsData?.data?.[p]?.ticket_promedio ?? null) },
                { id: "KPI-OPS-003", label: "Pzas / Ticket",      getVal: p => { const v = opsData?.data?.[p]?.pzas_ticket; return v != null ? v.toFixed(1) : "—"; } },
                { id: "KPI-OPS-005", label: "Vta Prom/Tienda",    getVal: p => fmtMoney(opsData?.data?.[p]?.vta_prom_tienda ?? null) },
                { id: "KPI-OPS-006", label: "Clientes (Tickets)", getVal: p => fmtNum(opsData?.data?.[p]?.num_tickets ?? null) },
              ]} />
              <KpiGroupTable paises={paisesVis} title="Calidad de Operación" cols={[
                { id: "KPI-OPS-004", label: "Conversión",        getVal: p => p === "MX" && opsData?.data?.MX?.conversion_pct != null ? fmtPct(opsData.data.MX.conversion_pct) : "—" },
                { id: "KPI-OPS-001", label: "Cumpl. Presupuesto", getVal: p => opsVal(p, "cumplimiento_presupuesto", "pct") },
                { id: "KPI-OPS-007", label: "SKUs sin exhibir",  getVal: p => opsVal(p, "skus_sin_exhibir", "pct") },
                { id: "KPI-OPS-008", label: "36hrs entregas",    getVal: p => opsVal(p, "36_hrs", "pct") },
                { id: "KPI-OPS-010", label: "Calif. Trade",      getVal: p => opsVal(p, "calificacion_trade_tiendas", "dec2") },
                { id: "KPI-OPS-019", label: "Calif. Checklist",  getVal: p => opsVal(p, "calificacion_de_checklist", "dec2") },
              ]} />
              <KpiGroupTable paises={paisesVis} title="Cumplimiento Presupuestal" cols={[
                { id: "KPI-OPS-011", label: "% Comisiones",     getVal: p => opsVal(p, "pct_de_comisiones", "pct") },
                { id: "KPI-OPS-012", label: "% Tiendas c/Bono", getVal: p => opsVal(p, "pct_de_tiendas_cobraron_bono_mas_del_50pct", "pct") },
                { id: "KPI-OPS-015", label: "% Faltante Inv.",  getVal: p => opsVal(p, "pct_faltante_inventarios", "pct") },
                { id: "KPI-OPS-016", label: "% Ajustes",        getVal: p => opsVal(p, "porc_ajustes", "pct") },
              ]} />
              <KpiGroupTable paises={paisesVis} title="Servicio, Regiones y Mesa de Control" cols={[
                { id: "KPI-OPS-009", label: "Venta Adicional",   getVal: p => opsVal(p, "venta_adicional", "dec2") },
                { id: "KPI-OPS-013", label: "Mejor Región",      getVal: p => opsVal(p, "mejor_region_vs_presupuesto") },
                { id: "KPI-OPS-014", label: "Peor Región",       getVal: p => opsVal(p, "peor_region_vs_presupuesto") },
                { id: "KPI-OPS-017", label: "On Time Entregas",  getVal: p => opsVal(p, "on_time_de_entregas_almacen_a_tiendas", "pct") },
                { id: "KPI-OPS-018", label: "Tickets Mesa Ctrl", getVal: p => opsVal(p, "tickets_mesa_de_control") },
              ]} />
            </>
          )}

          {/* ══════════════════════════════════════════════
              COMERCIAL  — KPI-COM-001 a KPI-COM-013
          ══════════════════════════════════════════════ */}
          {area === "comercial" && (
            <>
              <AreaHeader title={periodo} sub="Stock, sell-through y SKUs activos — MX datos reales" loading={comLoading} />
              <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 8, marginBottom: 16 }}>
                <KpiCard
                  label="Sell Thru MX"
                  value={comData?.MX?.sell_thru != null ? fmtPct(comData.MX.sell_thru) : "—"}
                  sub={comData?.MX?.piezas_mes
                    ? `${fmtNum(comData.MX.piezas_mes)} pzas vendidas`
                    : "KPI-COM-005"}
                  loading={comLoading}
                  kpiId="KPI-COM-005"
                />
                <KpiCard
                  label="SKUs Prom/Tienda"
                  value={comData?.MX?.skus_tiendas != null ? fmtNum(comData.MX.skus_tiendas) : "—"}
                  sub="MX — tiendas activas · KPI-COM-008"
                  loading={comLoading}
                  kpiId="KPI-COM-008"
                />
                <KpiCard
                  label="SKUs en CEDIS"
                  value={comData?.MX?.skus_almacen != null ? fmtNum(comData.MX.skus_almacen) : "—"}
                  sub="MX — almacén activo · KPI-COM-009"
                  loading={comLoading}
                  kpiId="KPI-COM-009"
                />
                <KpiCard
                  label="Stock Prom/Tienda $"
                  value={comData?.MX?.stock_tienda_valor != null ? fmtMoney(comData.MX.stock_tienda_valor) : "—"}
                  sub={comData?.MX?.stock_tienda_pzas != null
                    ? `${fmtNum(comData.MX.stock_tienda_pzas)} pzas/tienda`
                    : "MX · KPI-COM-013"}
                  loading={comLoading}
                  kpiId="KPI-COM-013"
                />
              </div>
              {comError && (
                <div style={{ padding: "8px 12px", background: "var(--bg-3)", borderRadius: 6, color: "var(--rose)", fontSize: 11, marginBottom: 12 }}>
                  Error cargando comercial: {comError}
                </div>
              )}
              <div style={{ border: "0.5px solid var(--border)", borderRadius: 8, overflow: "hidden" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12, tableLayout: "fixed" }}>
                  <thead>
                    <tr style={{ background: "var(--bg-2)" }}>
                      <Th left width={72}>País</Th>
                      <ThKpi id="KPI-COM-005">Sell Thru</ThKpi>
                      <ThKpi id="KPI-COM-006">Sell Thru AA</ThKpi>
                      <ThKpi id="KPI-COM-008">SKUs Tiendas</ThKpi>
                      <ThKpi id="KPI-COM-009">SKUs Almacén</ThKpi>
                      <ThKpi id="KPI-COM-012">Stock/Tienda (pzas)</ThKpi>
                      <ThKpi id="KPI-COM-013">Stock/Tienda ($)</ThKpi>
                      <ThKpi id="KPI-COM-001">Precio Prom.</ThKpi>
                    </tr>
                  </thead>
                  <tbody>
                    {paisesVis.map((pais, i) => {
                      const isMX = pais === "MX";
                      const mx   = comData?.MX;
                      return (
                        <tr key={pais} style={{ background: i % 2 === 0 ? "var(--bg-1)" : "var(--bg-0)", borderBottom: "0.5px solid var(--border)" }}>
                          <td style={{ padding: "10px 12px" }}>
                            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                              <span style={{ background: "var(--bg-4)", color: "var(--text-3)", fontSize: 9, padding: "2px 5px", borderRadius: 3, fontWeight: 700, letterSpacing: "0.04em" }}>{pais}</span>
                              <span style={{ color: "var(--text-1)", fontWeight: 500 }}>{NOMBRE[pais]}</span><span style={{ color: "var(--text-4)", fontSize: 9, marginLeft: 4 }}>{MONEDA[pais]}</span>
                            </div>
                          </td>
                          <Td>{isMX && mx?.sell_thru != null ? fmtPct(mx.sell_thru) : "—"}</Td>
                          <td style={{ padding: "10px 12px", textAlign: "right", color: "var(--text-4)" }}>—</td>
                          <Td>{isMX && mx?.skus_tiendas != null ? fmtNum(mx.skus_tiendas) : "—"}</Td>
                          <Td>{isMX && mx?.skus_almacen != null ? fmtNum(mx.skus_almacen) : "—"}</Td>
                          <Td>{isMX && mx?.stock_tienda_pzas != null ? fmtNum(mx.stock_tienda_pzas) : "—"}</Td>
                          <Td>{isMX && mx?.stock_tienda_valor != null ? fmtMoney(mx.stock_tienda_valor) : "—"}</Td>
                          <Td>{isMX && mx?.precio_promedio != null ? fmtMoney(mx.precio_promedio) : "—"}</Td>
                        </tr>
                      );
                    })}
                  </tbody>
                  <tfoot>
                    <tr style={{ background: "var(--bg-3)", borderTop: "0.5px solid var(--border-2)" }}>
                      <td style={{ padding: "8px 12px", color: "var(--text-4)", fontSize: 10, letterSpacing: "0.08em" }}>LATAM</td>
                      <td colSpan={7} style={{ padding: "8px 12px", color: "var(--text-4)", fontSize: 10 }}>
                        Inventario LATAM (CO/PE/CL/AR): pendiente tablas h_ventas_inventario por país
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
              <TableLegend />
              {/* KPI Tables — Comercial */}
              <KpiGroupTable paises={paisesVis} title="Sell-Through e Inventario" cols={[
                { id: "KPI-COM-005", label: "Sell Thru",           getVal: p => p === "MX" ? fmtPct(comData?.MX?.sell_thru ?? null) : "—" },
                { id: "KPI-COM-006", label: "Sell Thru AA",        getVal: p => comVal(p, "sell_thru_general_ano_anterior", "pct") },
                { id: "KPI-COM-012", label: "Stock/Tienda (pzas)", getVal: p => p === "MX" ? fmtNum(comData?.MX?.stock_tienda_pzas ?? null) : "—" },
                { id: "KPI-COM-013", label: "Stock/Tienda ($)",    getVal: p => p === "MX" ? fmtMoney(comData?.MX?.stock_tienda_valor ?? null) : "—" },
                { id: "KPI-COM-001", label: "Precio Promedio",     getVal: p => p === "MX" ? fmtMoney(comData?.MX?.precio_promedio ?? null) : "—" },
              ]} />
              <KpiGroupTable paises={paisesVis} title="SKUs Activos" cols={[
                { id: "KPI-COM-008", label: "SKUs Prom/Tienda",     getVal: p => p === "MX" ? fmtNum(comData?.MX?.skus_tiendas ?? null) : "—" },
                { id: "KPI-COM-009", label: "SKUs en CEDIS",        getVal: p => p === "MX" ? fmtNum(comData?.MX?.skus_almacen ?? null) : "—" },
                { id: "KPI-COM-010", label: "SKUs <3 pzas CEDIS",   getVal: p => comVal(p, "sku_menos_de_3_piezas_en_cedis") },
                { id: "KPI-COM-011", label: "SKUs <3 pzas Tiendas", getVal: p => comVal(p, "skus_menos_de_3_piezas_en_tiendas") },
              ]} />
              <KpiGroupTable paises={paisesVis} title="Rebajas y Canal" cols={[
                { id: "KPI-COM-002", label: "Stock Rebajas %",  getVal: p => comVal(p, "stock_rebajas_pct_descuentos", "pct") },
                { id: "KPI-COM-003", label: "Piezas Rebajas %", getVal: p => comVal(p, "piezas_rebajas_pct_descuentos", "pct") },
                { id: "KPI-COM-004", label: "Venta Rebajas %",  getVal: p => comVal(p, "venta_rebajas_pct_descuentos", "pct") },
                { id: "KPI-COM-007", label: "% Vta Prod. Nac.", getVal: p => comVal(p, "pct_de_venta_produccion_nacional", "pct") },
              ]} />
            </>
          )}

          {/* ══════════════════════════════════════════════
              RRHH  — KPI-RH-001 a KPI-RH-035
          ══════════════════════════════════════════════ */}
          {area === "rrhh" && (
            <>
              <AreaHeader title={periodo} sub={mvHas("rh") ? `MX y CO · datos a ${mvMes["rh"] || ""}` : "Headcount, rotación y cobertura por país"} badge={mvHas("rh") ? undefined : <BadgePending />} />
              
              {/* KPI Tables — RRHH */}
              <KpiGroupTable paises={paisesVis} title="Headcount y Rotación — Tiendas" cols={[
                { id: "KPI-RH-011", label: "Bajas Mes",          getVal: p => rhVal(p, "numero_de_bajas_del_mes_en_general_tiendas") },
                { id: "KPI-RH-012", label: "Activos Prom.",      getVal: p => rhVal(p, "numero_promedio_de_activos_en_general_tiendas_del_mes") },
                { id: "KPI-RH-013", label: "Rotación Gral.",     getVal: p => rhVal(p, "rotacion_general_tiendas", "pct") },
                { id: "KPI-RH-017", label: "Prom. Emp/Tienda",   getVal: p => rhVal(p, "promedio_empleados_x_tienda", "dec") },
                { id: "KPI-RH-025", label: "% Cob. Plantilla",   getVal: p => rhVal(p, "pct_cobertura_plantilla_en_tienda", "pct") },
              ]} />
              <KpiGroupTable paises={paisesVis} title="Compensación Variable — Tiendas" cols={[
                { id: "KPI-RH-027", label: "Alcance Promotor",    getVal: p => rhVal(p, "alcance_de_comision_real_mensual_promotor", "money") },
                { id: "KPI-RH-029", label: "% Comp. Var. Prom.",  getVal: p => rhVal(p, "pct_alcance_de_compensacion_variable_promotores", "pct") },
                { id: "KPI-RH-030", label: "Alcance Subgerente",  getVal: p => rhVal(p, "alcance_de_comision_real_mensual_subgerente", "money") },
                { id: "KPI-RH-032", label: "% Comp. Var. Subg.",  getVal: p => rhVal(p, "pct_alcance_de_compensacion_variable_subgerentes", "pct") },
                { id: "KPI-RH-033", label: "Alcance Gerente",     getVal: p => rhVal(p, "alcance_de_comision_real_mensual_gerente", "money") },
                { id: "KPI-RH-035", label: "% Comp. Var. Gte.",   getVal: p => rhVal(p, "pct_alcance_de_compensacion_variable_gerentes", "pct") },
              ]} />
              <KpiGroupTable paises={paisesVis} title="Headcount — Corporativo y Almacén" cols={[
                { id: "KPI-RH-002", label: "Bajas Corp.",       getVal: p => rhVal(p, "numero_de_bajas_del_mes_en_el_corporativo") },
                { id: "KPI-RH-003", label: "Activos Corp.",     getVal: p => rhVal(p, "numero_promedio_de_activos_en_el_corporativo_al_mes") },
                { id: "KPI-RH-004", label: "Rotación Corp.",    getVal: p => rhVal(p, "rotacion_corporativo", "pct") },
                { id: "KPI-RH-019", label: "Retención <90d",   getVal: p => rhVal(p, "retencion_de_personal_tienda_antes_de_90_dias", "pct") },
                { id: "KPI-RH-022", label: "Vac. Subgerente",  getVal: p => rhVal(p, "numero_de_vacantes_subgerente") },
                { id: "KPI-RH-023", label: "Vac. Gerente",     getVal: p => rhVal(p, "numero_de_vacantes_gerente") },
              ]} />
              <KpiGroupTable paises={paisesVis} title="Almacén — Operativo y Maquila" cols={[
                { id: "KPI-RH-005", label: "Bajas Operativo",   getVal: p => rhVal(p, "numero_de_bajas_del_mes_en_la_parte_operativa_del_almacen") },
                { id: "KPI-RH-007", label: "Rotación Operativo", getVal: p => rhVal(p, "rotacion_operativa_almacen", "pct") },
                { id: "KPI-RH-008", label: "Bajas Maquila",     getVal: p => rhVal(p, "numero_de_bajas_del_mes_en_la_parte_maquila_del_almacen") },
                { id: "KPI-RH-010", label: "Rotación Maquila",  getVal: p => rhVal(p, "rotacion_maquila_almacen", "pct") },
                { id: "KPI-RH-026", label: "% Cob. Almacén",    getVal: p => rhVal(p, "pct_cobertura_plantilla_en_almacen", "pct") },
              ]} />
              <KpiGroupTable paises={paisesVis} title="Gerentes, Contratación y Satisfacción" cols={[
                { id: "KPI-RH-014", label: "Bajas Gerentes",    getVal: p => rhVal(p, "numero_de_bajas_del_mes_en_gerente_tiendas") },
                { id: "KPI-RH-016", label: "Rotación Gerentes", getVal: p => rhVal(p, "rotacion_gerentes_tiendas", "pct") },
                { id: "KPI-RH-024", label: "% Cob. Interna Gtes", getVal: p => rhVal(p, "pct_cobertura_interna_gerenciales", "pct") },
                { id: "KPI-RH-020", label: "Días Contrat. Gcial", getVal: p => rhVal(p, "tiempo_promedio_contratacion_tiendas_gerenciales", "dec") },
                { id: "KPI-RH-021", label: "Días Contrat. Prom.", getVal: p => rhVal(p, "tiempo_promedio_contratacion_tiendas_promotores", "dec") },
                { id: "KPI-RH-001", label: "Satisfacción Cía.",  getVal: p => rhVal(p, "calificacion_satisfaccion_compania", "dec2") },
              ]} />
            </>
          )}

          {/* ══════════════════════════════════════════════
              LOGÍSTICA  — KPI-LOG-001 a KPI-LOG-027
          ══════════════════════════════════════════════ */}
          {area === "logistica" && (
            <>
              <AreaHeader title={periodo} sub="Inventario, surtimiento y distribución — MX datos reales" loading={logLoading} />
              <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 8, marginBottom: 16 }}>
                <KpiCard
                  label="Inv CEDIS MX (pzas)"
                  value={logData?.MX?.cedis_total_pzas != null ? fmtNum(logData.MX.cedis_total_pzas) : "—"}
                  sub={logData?.MX?.cedis_meses != null
                    ? `${logData.MX.cedis_meses} meses cobertura`
                    : "KPI-LOG-001"}
                  loading={logLoading}
                  kpiId="KPI-LOG-001"
                />
                <KpiCard
                  label="Fill Rate MX"
                  value={logData?.MX?.fill_rate_pct != null ? fmtPct(logData.MX.fill_rate_pct) : "—"}
                  sub={logData?.MX?.skus_surtidos != null
                    ? `${fmtNum(logData.MX.skus_surtidos)} / ${fmtNum(logData.MX.skus_ideal ?? 0)} SKUs`
                    : "KPI-LOG-003"}
                  loading={logLoading}
                  kpiId="KPI-LOG-003"
                />
                <KpiCard label="OTP15"              value="—" sub="KPI-LOG-004" pending />
                <KpiCard label="% Gto dist / venta" value="—" sub="KPI-LOG-002" pending />
              </div>
              {logError && (
                <div style={{ padding: "8px 12px", background: "var(--bg-3)", borderRadius: 6, color: "var(--rose)", fontSize: 11, marginBottom: 12 }}>
                  Error cargando logística: {logError}
                </div>
              )}

              {/* Tabla inventario y fill rate por país */}
              <div style={{ border: "0.5px solid var(--border)", borderRadius: 8, overflow: "hidden", marginBottom: 16 }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12, tableLayout: "fixed" }}>
                  <thead>
                    <tr style={{ background: "var(--bg-2)" }}>
                      <Th left width={72}>País</Th>
                      <ThKpi id="KPI-LOG-001">Inv CEDIS Disp (pzas)</ThKpi>
                      <ThKpi id="KPI-LOG-003">Fill Rate</ThKpi>
                      <ThKpi id="KPI-LOG-004">OTP15</ThKpi>
                      <ThKpi id="KPI-LOG-005">Pzas Surtidas</ThKpi>
                      <ThKpi id="KPI-LOG-019">Total Inv (meses)</ThKpi>
                      <ThKpi id="KPI-LOG-022">CEDIS Disp (meses)</ThKpi>
                      <ThKpi id="KPI-LOG-002">% Gto Dist/Vta</ThKpi>
                    </tr>
                  </thead>
                  <tbody>
                    {paisesVis.map((pais, i) => {
                      const isMX = pais === "MX";
                      const mx   = logData?.MX;
                      return (
                        <tr key={pais} style={{ background: i % 2 === 0 ? "var(--bg-1)" : "var(--bg-0)", borderBottom: "0.5px solid var(--border)" }}>
                          <td style={{ padding: "10px 12px" }}>
                            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                              <span style={{ background: "var(--bg-4)", color: "var(--text-3)", fontSize: 9, padding: "2px 5px", borderRadius: 3, fontWeight: 700, letterSpacing: "0.04em" }}>{pais}</span>
                              <span style={{ color: "var(--text-1)", fontWeight: 500 }}>{NOMBRE[pais]}</span><span style={{ color: "var(--text-4)", fontSize: 9, marginLeft: 4 }}>{MONEDA[pais]}</span>
                            </div>
                          </td>
                          <Td>{isMX && mx?.cedis_total_pzas != null ? fmtNum(mx.cedis_total_pzas) : "—"}</Td>
                          <Td>{isMX && mx?.fill_rate_pct != null
                            ? <span style={{ color: Number(mx.fill_rate_pct) >= 85 ? "var(--green)" : Number(mx.fill_rate_pct) >= 70 ? "var(--amber)" : "var(--rose)" }}>
                                {fmtPct(mx.fill_rate_pct)}
                              </span>
                            : "—"}
                          </Td>
                          <td style={{ padding: "10px 12px", textAlign: "right", color: "var(--text-4)" }}>—</td>
                          <td style={{ padding: "10px 12px", textAlign: "right", color: "var(--text-4)" }}>—</td>
                          <td style={{ padding: "10px 12px", textAlign: "right", color: "var(--text-4)" }}>—</td>
                          <Td>{isMX && mx?.cedis_meses != null ? `${mx.cedis_meses} sem` : "—"}</Td>
                          <td style={{ padding: "10px 12px", textAlign: "right", color: "var(--text-4)" }}>—</td>
                        </tr>
                      );
                    })}
                  </tbody>
                  <tfoot>
                    <tr style={{ background: "var(--bg-3)", borderTop: "0.5px solid var(--border-2)" }}>
                      <td style={{ padding: "8px 12px", color: "var(--text-4)", fontSize: 10, letterSpacing: "0.08em" }}>LATAM</td>
                      <td colSpan={7} style={{ padding: "8px 12px", color: "var(--text-4)", fontSize: 10 }}>
                        Inventario CO/PE/CL/AR: pendiente tablas h_ventas_inventario por país en Redshift
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>

              {/* Tramos de Cadena — datos reales del diccionario */}
              <div style={{ marginBottom: 8 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
                  <span style={{ fontSize: 12, fontWeight: 500, color: "var(--text-1)" }}>Objetivo de Tramos en la Cadena (semanas)</span>
                  <span style={{ color: "var(--text-4)" }}>·</span>
                  <span style={{ fontSize: 11, color: "var(--text-3)" }}>Miniso · Fuente: Diccionario Técnico v5.2</span>
                  <span style={{
                    background: "#0a1a0a", border: "0.5px solid #1B4332",
                    color: "#4ade80", fontSize: 9, padding: "2px 7px", borderRadius: 8,
                  }}>datos confirmados</span>
                </div>
                <div style={{ border: "0.5px solid var(--border)", borderRadius: 8, overflow: "hidden" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12, tableLayout: "fixed" }}>
                    <thead>
                      <tr style={{ background: "var(--bg-2)" }}>
                        <Th left width={72}>País</Th>
                        <Th>Producción</Th>
                        <Th>On Stock</Th>
                        <Th>Por Cargar</Th>
                        <Th>Tránsito/Aduana</Th>
                        <Th>CEDIS</Th>
                        <Th>Trám. Tienda</Th>
                        <Th>Tiendas</Th>
                        <Th>Total sem.</Th>
                      </tr>
                    </thead>
                    <tbody>
                      {paisesVis.map((pais, i) => {
                        const t = TRAMOS[pais];
                        const odd = i % 2 === 0;
                        // Highlight worst/best on total weeks (higher = worse for logistics)
                        const totals = Object.values(TRAMOS).map(x => x.total);
                        const maxT = Math.max(...totals);
                        const minT = Math.min(...totals);
                        const totalColor = t.total === maxT ? "var(--rose)" : t.total === minT ? "var(--green)" : "var(--text-2)";
                        return (
                          <tr key={pais} style={{ background: odd ? "var(--bg-1)" : "var(--bg-0)", borderBottom: "0.5px solid var(--border)" }}>
                            <td style={{ padding: "10px 12px" }}>
                              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                                <span style={{ background: "var(--bg-4)", color: "var(--text-3)", fontSize: 9, padding: "2px 5px", borderRadius: 3, fontWeight: 700, letterSpacing: "0.04em" }}>{pais}</span>
                                <span style={{ color: "var(--text-1)", fontWeight: 500 }}>{pais}</span>
                              </div>
                            </td>
                            <Td><span style={{ color: "var(--text-2)" }}>{t.prod}</span></Td>
                            <Td><span style={{ color: "var(--text-2)" }}>{t.onStock}</span></Td>
                            <Td><span style={{ color: "var(--text-2)" }}>{t.porCargar}</span></Td>
                            <Td><span style={{ color: "var(--text-2)" }}>{t.transito}</span></Td>
                            <Td><span style={{ color: "var(--text-2)" }}>{t.cedis}</span></Td>
                            <Td><span style={{ color: "var(--text-2)" }}>{t.transTienda}</span></Td>
                            <Td><span style={{ color: "var(--text-2)" }}>{t.tiendas}</span></Td>
                            <Td><span style={{ color: totalColor, fontWeight: 500 }}>{t.total}</span></Td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                <div style={{ display: "flex", gap: 16, marginTop: 8, paddingLeft: 2 }}>
                  <LegendItem color="var(--green)" label="Menor cadena (mejor)" />
                  <LegendItem color="var(--rose)"  label="Mayor cadena (revisar)" />
                  <span style={{ fontSize: 10, color: "var(--text-4)" }}>Unidad: Miniso · Solo cadena estándar, excluye NE y Blind Lab</span>
                </div>
              </div>

              {/* KPI Tables — Logística */}
              <KpiGroupTable paises={paisesVis} title="Surtimiento y Fill Rate" cols={[
                { id: "KPI-LOG-003", label: "Fill Rate %",         getVal: p => p === "MX" ? fmtPct(logData?.MX?.fill_rate_pct ?? null) : "—" },
                { id: "KPI-LOG-001", label: "CEDIS Disp. (pzas)",  getVal: p => p === "MX" ? fmtNum(logData?.MX?.cedis_lf_pzas ?? null) : "—" },
                { id: "KPI-LOG-022", label: "CEDIS Disp. (sem.)",  getVal: p => p === "MX" && logData?.MX?.cedis_meses != null ? `${logData.MX.cedis_meses} sem` : "—" },
                { id: "KPI-LOG-005", label: "Total pzas surtidas", getVal: p => logVal(p, "total_piezas_surtidas_a_tiendas") },
                { id: "KPI-LOG-004", label: "OTP15",               getVal: p => logVal(p, "otp15", "pct") },
                { id: "KPI-LOG-034", label: "Nivel serv. CEDIS",   getVal: _ => "—" },
              ]} />
              <KpiGroupTable paises={paisesVis} title="Inventario Total" cols={[
                { id: "KPI-LOG-013", label: "Total inv. (pzas)",      getVal: p => logVal(p, "inv_disponible_sap") },
                { id: "KPI-LOG-014", label: "Inv. tiendas (pzas)",    getVal: p => logVal(p, "inv_tdas") },
                { id: "KPI-LOG-015", label: "Inv. tránsito tiendas",  getVal: p => logVal(p, "inv_transito_tdas") },
                { id: "KPI-LOG-019", label: "Total inv. (meses)",     getVal: p => logVal(p, "total_inventario_meses", "dec2") },
                { id: "KPI-LOG-020", label: "Inv. tiendas (meses)",   getVal: p => logVal(p, "inventario_tiendas_meses", "dec2") },
                { id: "KPI-LOG-028", label: "OTB (Open To Buy)",      getVal: _ => "—" },
              ]} />
              <KpiGroupTable paises={paisesVis} title="Costos de Distribución" cols={[
                { id: "KPI-LOG-002", label: "Gasto dist./venta %",  getVal: p => logVal(p, "pct_de_gasto_distribucion_vs_la_venta_distribucion", "pct") },
                { id: "KPI-LOG-007", label: "Costo/pza etiquetado", getVal: p => logVal(p, "costo_por_pieza_etiquetado", "dec2") },
                { id: "KPI-LOG-008", label: "Costo/pza almacenada", getVal: p => logVal(p, "costo_por_pieza_almacenada", "dec2") },
                { id: "KPI-LOG-009", label: "Costo/pza surtida",    getVal: p => logVal(p, "costo_por_pieza_surtida", "dec2") },
                { id: "KPI-LOG-010", label: "Costo/pza distribución",getVal: p => logVal(p, "costo_por_pieza_distribucion", "dec2") },
              ]} />
              <KpiGroupTable paises={paisesVis} title="Inventario en Piezas — Cadena Completa" cols={[
                { id: "KPI-LOG-012", label: "En China",          getVal: p => logVal(p, "inventario_en_china_piezas") },
                { id: "KPI-LOG-016", label: "No Disp. Aduana",   getVal: p => logVal(p, "inventario_no_disponible_en_aduana_piezas") },
                { id: "KPI-LOG-017", label: "En Tránsito",       getVal: p => logVal(p, "inventario_en_transito_piezas") },
                { id: "KPI-LOG-018", label: "No Disp. País",     getVal: p => logVal(p, "inventario_no_disponible_pais_piezas") },
                { id: "KPI-LOG-011", label: "% Carga CEDIS",     getVal: p => logVal(p, "porc_carga_cedis", "pctd") },
              ]} />
              <KpiGroupTable paises={paisesVis} title="Cobertura en Meses" cols={[
                { id: "KPI-LOG-021", label: "Tránsito Tdas",     getVal: p => logVal(p, "inventario_transito_tiendas_meses", "dec2") },
                { id: "KPI-LOG-023", label: "Aduana",            getVal: p => logVal(p, "inventario_no_disponible_en_aduana_meses", "dec2") },
                { id: "KPI-LOG-024", label: "Tránsito China",    getVal: p => logVal(p, "inventario_en_transito_meses", "dec2") },
                { id: "KPI-LOG-025", label: "Pend. Zarpar",      getVal: p => logVal(p, "inventario_liberado_pendiente_de_zarpar_meses", "dec2") },
                { id: "KPI-LOG-026", label: "No Disp. País",     getVal: p => logVal(p, "inventario_no_disponible_pais_meses", "dec2") },
                { id: "KPI-LOG-027", label: "En China",          getVal: p => logVal(p, "inventario_en_china_meses", "dec2") },
              ]} />
              <KpiGroupTable paises={paisesVis} title="Productividad y Almacenaje" cols={[
                { id: "KPI-LOG-006", label: "Prom. Almacenaje/sem", getVal: p => logVal(p, "promedio_almacenaje_por_semana") },
              ]} />
            </>
          )}

          {/* ══════════════════════════════════════════════
              MARKETING  — KPI-MKT-001 a KPI-MKT-019
          ══════════════════════════════════════════════ */}
          {area === "marketing" && (
            <>
              <AreaHeader title={periodo} sub="MinisoLove · Loyalty MX — datos en tiempo real desde Redshift" loading={mktLoading} />

              {/* KPI Cards — datos reales MX */}
              <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 8, marginBottom: 16 }}>
                <KpiCard
                  label="Registros nuevos"
                  value={mktData ? fmtNum(mktData.registros.nuevos_mes) : "—"}
                  sub={mktData ? `Base total: ${fmtNum(mktData.registros.total_base)}` : "KPI-MKT-005"}
                  loading={mktLoading}
                  kpiId="KPI-MKT-005"
                />
                <KpiCard
                  label="Venta MinisoLove"
                  value={mktData ? fmtMoney(mktData.transacciones.venta_loyalty) : "—"}
                  sub={mktData ? `${fmtNum(mktData.transacciones.transacciones)} tickets loyalty` : "KPI-MKT-015"}
                  loading={mktLoading}
                  kpiId="KPI-MKT-015"
                />
                <KpiCard
                  label="% Part. venta MX"
                  value={
                    mktData && data?.MX?.facturacion_total
                      ? fmtPct(mktData.transacciones.venta_loyalty / (data.MX.facturacion_total || 1) * 100)
                      : "—"
                  }
                  sub="Loyalty / Facturación MX"
                  loading={mktLoading}
                  kpiId="KPI-MKT-016"
                />
                <KpiCard
                  label="Monto pts redimidos"
                  value={mktData ? fmtMoney(mktData.puntos.monto_redimidos_total) : "—"}
                  sub={mktData ? `${fmtNum(mktData.puntos.redimidos_total)} corazones` : "KPI-MKT-009"}
                  loading={mktLoading}
                  kpiId="KPI-MKT-009"
                />
              </div>

              {/* Tabla canales — puntos ganados y redimidos */}
              {mktError && (
                <div style={{ padding: "10px 14px", background: "var(--bg-3)", border: "0.5px solid var(--rose)", borderRadius: 8, fontSize: 11, color: "var(--rose)", marginBottom: 12 }}>
                  Error cargando loyalty: {mktError}
                </div>
              )}

              <div style={{ border: "0.5px solid var(--border)", borderRadius: 8, overflow: "hidden", marginBottom: 12 }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12, tableLayout: "fixed" }}>
                  <thead>
                    <tr style={{ background: "var(--bg-2)" }}>
                      <Th left>Canal</Th>
                      <ThKpi id="KPI-MKT-006/007/008">Pts Ganados</ThKpi>
                      <ThKpi id="">Monto Ganados</ThKpi>
                      <ThKpi id="KPI-MKT-006/007/008">Pts Redimidos</ThKpi>
                      <ThKpi id="KPI-MKT-009">Monto Redimidos</ThKpi>
                    </tr>
                  </thead>
                  <tbody>
                    {mktData?.puntos.por_canal.map((row, i) => (
                      <tr key={row.canal} style={{ background: i % 2 === 0 ? "var(--bg-1)" : "var(--bg-0)", borderBottom: "0.5px solid var(--border)" }}>
                        <td style={{ padding: "10px 12px", color: "var(--text-2)", fontWeight: 500 }}>{row.canal}</td>
                        <td style={{ padding: "10px 12px", textAlign: "right", color: "var(--text-2)" }}>{fmtNum(row.ganados)}</td>
                        <td style={{ padding: "10px 12px", textAlign: "right", color: "var(--text-2)" }}>{fmtMoney(row.monto_g)}</td>
                        <td style={{ padding: "10px 12px", textAlign: "right", color: "var(--text-2)" }}>{fmtNum(row.redimidos)}</td>
                        <td style={{ padding: "10px 12px", textAlign: "right", color: "var(--rose)" }}>{fmtMoney(row.monto_r)}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr style={{ background: "var(--bg-3)", borderTop: "0.5px solid var(--border-2)" }}>
                      <td style={{ padding: "8px 12px", color: "var(--text-4)", fontSize: 10, letterSpacing: "0.08em", fontWeight: 600 }}>TOTAL MX</td>
                      <td style={{ padding: "8px 12px", textAlign: "right", color: "var(--text-1)", fontWeight: 600 }}>{fmtNum(mktData?.puntos.ganados_total ?? null)}</td>
                      <td style={{ padding: "8px 12px", textAlign: "right", color: "var(--text-4)" }}>—</td>
                      <td style={{ padding: "8px 12px", textAlign: "right", color: "var(--text-1)", fontWeight: 600 }}>{fmtNum(mktData?.puntos.redimidos_total ?? null)}</td>
                      <td style={{ padding: "8px 12px", textAlign: "right", color: "var(--rose)", fontWeight: 600 }}>{fmtMoney(mktData?.puntos.monto_redimidos_total ?? null)}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>

              {/* Clientes activos loyalty */}
              {mktData && (
                <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8, marginBottom: 12 }}>
                  <KpiCard label="Clientes activos loyalty" value={fmtNum(mktData.transacciones.clientes_activos)} sub="Con compra en el período" kpiId="KPI-MKT-013" />
                  <KpiCard label="Piezas en tickets loyalty" value={fmtNum(mktData.transacciones.piezas)} sub="Solo transacciones loyalty" kpiId="KPI-MKT-015" />
                  <KpiCard label="Clientes que redimieron" value={fmtNum(mktData.puntos.clientes_redim)} sub="POS — descuento" kpiId="KPI-MKT-011" />
                </div>
              )}

              {/* KPI Tables — Marketing */}
              <KpiGroupTable paises={paisesVis} title="Membresía MinisoLove" cols={[
                { id: "KPI-MKT-005", label: "Registros Nuevos",   getVal: p => p === "MX" ? fmtNum(mktData?.registros?.nuevos_mes ?? null) : "—" },
                { id: "KPI-MKT-013", label: "Tickets MinisoLove", getVal: p => p === "MX" ? fmtNum(mktData?.transacciones?.transacciones ?? null) : "—" },
                { id: "KPI-MKT-015", label: "Venta MinisoLove",   getVal: p => p === "MX" ? fmtMoney(mktData?.transacciones?.venta_loyalty ?? null) : "—" },
                { id: "KPI-MKT-016", label: "% Part. Venta",      getVal: p => { if (p !== "MX" || !mktData || !data?.MX?.facturacion_total) return "—"; return fmtPct(mktData.transacciones.venta_loyalty / data.MX.facturacion_total * 100); } },
              ]} />
              <KpiGroupTable paises={paisesVis} title="Puntos de Fidelidad" cols={[
                { id: "KPI-MKT-006", label: "Puntos Redim. POS",    getVal: p => p === "MX" ? fmtNum(mktData?.puntos?.redimidos_pos ?? null) : "—" },
                { id: "KPI-MKT-007", label: "Puntos Redim. E-Comm", getVal: p => p === "MX" ? fmtNum(mktData?.puntos?.redimidos_app ?? null) : "—" },
                { id: "KPI-MKT-008", label: "Puntos Redim. App",    getVal: p => p === "MX" ? fmtNum(mktData?.puntos?.redimidos_app ?? null) : "—" },
                { id: "KPI-MKT-009", label: "Monto Redimidos",      getVal: p => p === "MX" ? fmtMoney(mktData?.puntos?.monto_redimidos_total ?? null) : "—" },
                { id: "KPI-MKT-011", label: "% Redención/Venta",    getVal: p => { if (p !== "MX" || !mktData || !data?.MX?.facturacion_total) return "—"; return fmtPct(mktData.puntos.monto_redimidos_total / data.MX.facturacion_total * 100); } },
              ]} />
              <KpiGroupTable paises={paisesVis} title="Tráfico y Retención" cols={[
                { id: "KPI-MKT-001", label: "Visitas Tiendas",      getVal: p => mktVal(p, "visitas_tdas") },
                { id: "KPI-MKT-012", label: "Frec. Compra Loyalty", getVal: p => mktVal(p, "frecuencia_de_compra_de_los_clientes_top_loyalty", "dec2") },
                { id: "KPI-MKT-014", label: "% Part. Tickets",      getVal: p => mktVal(p, "pct_participacion_tickets_minisolove", "pct") },
                { id: "KPI-MKT-018", label: "Clientes +1 compra",   getVal: p => mktVal(p, "clientes_con_mas_de_1_compra_en_180_dias") },
                { id: "KPI-MKT-019", label: "Clientes +2 compras",  getVal: p => mktVal(p, "clientes_con_mas_de_2_compras_en_180_dias") },
              ]} />
              <KpiGroupTable paises={paisesVis} title="Tráfico y Sensores" cols={[
                { id: "KPI-MKT-002", label: "Sensores Actual",   getVal: p => mktVal(p, "sensores_tdas_actual") },
                { id: "KPI-MKT-003", label: "Sensores Pasado",   getVal: p => mktVal(p, "sensores_tdas_pasado") },
                { id: "KPI-MKT-004", label: "% Aumento Tráfico", getVal: p => mktVal(p, "porc_aumento_trafico", "pct") },
                { id: "KPI-MKT-010", label: "Ventas Tot. Mkt",   getVal: p => mktVal(p, "ventas_total_marketing", "money") },
                { id: "KPI-MKT-017", label: "Top POS del Mes",   getVal: p => mktVal(p, "top_de_pos_mes_correspondiente") },
              ]} />
            </>
          )}

          {/* ══════════════════════════════════════════════
              AUDITORÍA  — KPI-AUD-001 a KPI-AUD-006
          ══════════════════════════════════════════════ */}
          {area === "auditoria" && (
            <>
              <AreaHeader title={periodo} sub={mvHas("auditoria") ? `CO · datos a ${mvMes["auditoria"] || ""}` : "Robo, merma y eventos de seguridad por país"} badge={mvHas("auditoria") ? undefined : <BadgePending />} />
              {/* KPI Tables — Auditoría */}
              <KpiGroupTable paises={paisesVis} title="Merma y Pérdida" cols={[
                { id: "KPI-AUD-001", label: "Robo Tiendas",  getVal: p => audVal(p, "robo_tdas", "pct") },
                { id: "KPI-AUD-002", label: "Merma Tiendas", getVal: p => audVal(p, "merma_tdas", "pct") },
                { id: "KPI-AUD-003", label: "Caducados",     getVal: p => audVal(p, "caducados_tdas", "pct") },
              ]} />
              <KpiGroupTable paises={paisesVis} title="Incidencias de Seguridad" cols={[
                { id: "KPI-AUD-004", label: "Eventos Farderos", getVal: p => audVal(p, "eventos_farderos") },
                { id: "KPI-AUD-005", label: "Robo Interno",     getVal: p => audVal(p, "eventos_robo_interno") },
                { id: "KPI-AUD-006", label: "Robo de Camión",   getVal: p => audVal(p, "robo_de_camion") },
              ]} />
            </>
          )}

        </main>
      </div>

      {/* ── BARRA CLAUDE ── */}
      <div style={{
        background: "var(--bg-2)", borderTop: "0.5px solid var(--border)",
        padding: "10px 20px", display: "flex", alignItems: "center", gap: 10, flexShrink: 0,
      }}>
        <div style={{ width: 6, height: 6, borderRadius: "50%", background: "var(--red)", flexShrink: 0 }} />
        <input
          type="text"
          value={pregunta}
          onChange={(e) => setPregunta(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && preguntarIA()}
          placeholder="Pregunta sobre los datos — ej. ¿Por qué AR tiene el margen más bajo?"
          style={{
            flex: 1, background: "transparent", border: "none", outline: "none",
            fontSize: 12, color: "var(--text-2)",
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


type PnLRow = { kind: "sub" | "item"; label: string; id?: string; get: (pais: string) => string; sub?: (pais: string) => string };

function PnLTable({ paises, rows }: { paises: readonly string[]; rows: PnLRow[] }) {
  return (
    <div style={{ border: "0.5px solid var(--border)", borderRadius: 8, overflow: "hidden", maxWidth: 270 + paises.length * 175 }}>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12, tableLayout: "fixed" }}>
        <thead>
          <tr style={{ background: "var(--bg-2)" }}>
            <Th left width={270}>Concepto</Th>
            {paises.map((p) => (
              <th key={p} style={{ padding: "6px 12px", textAlign: "right", fontWeight: 500, color: "var(--text-3)", fontSize: 11 }}>
                <span style={{ background: "var(--bg-4)", color: "var(--text-3)", fontSize: 9, padding: "2px 5px", borderRadius: 3, fontWeight: 700, letterSpacing: "0.04em", marginRight: 5 }}>{p}</span>
                {NOMBRE[p]}
                <span style={{ color: "var(--text-4)", fontSize: 9, marginLeft: 4 }}>{MONEDA[p]}</span>
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
                  {r.id && <span style={{ color: "var(--text-4)", fontSize: 9, marginLeft: 6, fontWeight: 400 }}>{r.id}</span>}
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
                      }}>{v}</div>
                      {sv && sv !== "—" && (
                        <div style={{ fontSize: 9.5, color: "var(--text-4)", marginTop: -1 }}>{sv}</div>
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
                    <span style={{ background: "var(--bg-4)", color: "var(--text-3)", fontSize: 9, padding: "2px 5px", borderRadius: 3, fontWeight: 700, letterSpacing: "0.04em" }}>{pais}</span>
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
        <span style={{ fontSize: 8, color: "var(--text-4)" }}>▾</span>
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
      <div style={{ fontSize: 8, color: "var(--text-4)", opacity: 0.5, letterSpacing: "0.04em", marginTop: 1 }}>{id}</div>
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
