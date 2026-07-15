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
    fetch(`/api/cabina?year=${year}&month=${month}`)
      .then((r) => r.json())
      .then((d) => { if (d.ok) setData(d.data); else setError(d.error); })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [year, month]);

  useEffect(() => { load(); }, [load]);

  const loadMarketing = useCallback(() => {
    setMktLoading(true);
    setMktError(null);
    fetch(`/api/marketing?year=${year}&month=${month}`)
      .then((r) => r.json())
      .then((d) => { if (d.ok) setMktData(d.data); else setMktError(d.error); })
      .catch((e) => setMktError(e.message))
      .finally(() => setMktLoading(false));
  }, [year, month]);

  useEffect(() => {
    if (area === "marketing") loadMarketing();
  }, [area, loadMarketing]);

  const loadOperaciones = useCallback(() => {
    setOpsLoading(true);
    setOpsError(null);
    fetch(`/api/operaciones?year=${year}&month=${month}`)
      .then((r) => r.json())
      .then((d) => { if (d.ok) setOpsData(d); else setOpsError(d.error); })
      .catch((e) => setOpsError(e.message))
      .finally(() => setOpsLoading(false));
  }, [year, month]);

  useEffect(() => {
    if (area === "operaciones") loadOperaciones();
  }, [area, loadOperaciones]);

  const loadComercial = useCallback(() => {
    setComLoading(true);
    setComError(null);
    fetch(`/api/comercial?year=${year}&month=${month}`)
      .then((r) => r.json())
      .then((d) => { if (d.ok) setComData(d); else setComError(d.error); })
      .catch((e) => setComError(e.message))
      .finally(() => setComLoading(false));
  }, [year, month]);

  useEffect(() => {
    if (area === "comercial") loadComercial();
  }, [area, loadComercial]);

  const loadLogistica = useCallback(() => {
    setLogLoading(true);
    setLogError(null);
    fetch(`/api/logistica?year=${year}&month=${month}`)
      .then((r) => r.json())
      .then((d) => { if (d.ok) setLogData(d); else setLogError(d.error); })
      .catch((e) => setLogError(e.message))
      .finally(() => setLogLoading(false));
  }, [year, month]);

  useEffect(() => {
    if (area === "logistica") loadLogistica();
  }, [area, loadLogistica]);

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
    tiendas:     PAISES.reduce((s, p) => s + (data[p]?.num_tiendas || 0), 0),
    facturacion: PAISES.reduce((s, p) => s + (data[p]?.facturacion_total || 0), 0),
    ub:          PAISES.reduce((s, p) => s + (data[p]?.utilidad_bruta || 0), 0),
    piezas:      PAISES.reduce((s, p) => s + (data[p]?.piezas || 0), 0),
  } : null;

  const periodo = `${MESES[month - 1]} ${year}`;

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
          <SideItem icon="◉" label="LATAM" active />
          <SideItem icon="⚑" label="México" />
          <SideItem icon="⚑" label="Colombia" />
          <SideItem icon="⚑" label="Perú" />
          <SideItem icon="⚑" label="Chile" />
          <SideItem icon="⚑" label="Argentina" />
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
              <AreaHeader title={periodo} sub="Vista comparativa — todos los países" loading={loading} />
              <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 8, marginBottom: 16 }}>
                <KpiCard label="Facturación LATAM"  value={totales ? fmtMoney(totales.facturacion) : "—"} loading={loading} kpiId="KPI-FIN-001" />
                <KpiCard label="Utilidad Bruta"     value={totales ? fmtMoney(totales.ub) : "—"}          loading={loading} kpiId="KPI-FIN-014" />
                <KpiCard label="Piezas vendidas"    value={totales ? fmtNum(totales.piezas) : "—"}         loading={loading} kpiId="KPI-FIN-003" />
                <KpiCard label="Tiendas activas"    value={totales ? String(totales.tiendas) : "—"} sub="5 países" loading={loading} />
              </div>
              <div style={{ border: "0.5px solid var(--border)", borderRadius: 8, overflow: "hidden" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12, tableLayout: "fixed" }}>
                  <thead>
                    <tr style={{ background: "var(--bg-2)" }}>
                      <Th left width={72}>País</Th>
                      <Th>Tiendas</Th>
                      <Th>Facturación</Th>
                      <Th>Costo VTA</Th>
                      <Th>UB $</Th>
                      <Th>Margen UB</Th>
                      <Th>Piezas</Th>
                      <Th>Ticket Prom.</Th>
                    </tr>
                  </thead>
                  <tbody>
                    {PAISES.map((pais, i) => {
                      const row = data?.[pais] as PaisData | undefined;
                      const odd = i % 2 === 0;
                      const rTiendas = data ? getRanks(data, "num_tiendas",      true)  : {};
                      const rFact    = data ? getRanks(data, "facturacion_total", true)  : {};
                      const rCosto   = data ? getRanks(data, "costo_ventas",      false) : {};
                      const rUB      = data ? getRanks(data, "utilidad_bruta",    true)  : {};
                      const rMargen  = data ? getRanks(data, "margen_ub",         true)  : {};
                      const rPiezas  = data ? getRanks(data, "piezas",            true)  : {};
                      const rTicket  = data ? getRanks(data, "ticket_promedio",   true)  : {};
                      return (
                        <tr key={pais} style={{ background: odd ? "var(--bg-1)" : "var(--bg-0)", borderBottom: "0.5px solid var(--border)" }}>
                          <td style={{ padding: "10px 12px" }}>
                            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                              <span style={{ background: "var(--bg-4)", color: "var(--text-3)", fontSize: 9, padding: "2px 5px", borderRadius: 3, fontWeight: 700, letterSpacing: "0.04em" }}>{pais}</span>
                              <span style={{ color: "var(--text-1)", fontWeight: 500 }}>{NOMBRE[pais]}</span><span style={{ color: "var(--text-4)", fontSize: 9, marginLeft: 4 }}>{MONEDA[pais]}</span>
                            </div>
                          </td>
                          {loading ? (
                            Array.from({ length: 7 }).map((_, j) => (
                              <td key={j} style={{ padding: "10px 12px", textAlign: "right", color: "var(--text-4)" }}>—</td>
                            ))
                          ) : row?.error ? (
                            Array.from({ length: 7 }).map((_, j) => (
                              <td key={j} style={{ padding: "10px 12px", textAlign: "right", color: "var(--rose)", fontSize: 10 }}>err</td>
                            ))
                          ) : (
                            <>
                              <Td><Cell value={fmtNum(row?.num_tiendas ?? null)}        rank={rTiendas[pais] || "none"} /></Td>
                              <Td><Cell value={fmtMoney(row?.facturacion_total ?? null)} rank={rFact[pais]   || "none"} /></Td>
                              <Td><Cell value={fmtMoney(row?.costo_ventas ?? null)}      rank={rCosto[pais]  || "none"} /></Td>
                              <Td><Cell value={fmtMoney(row?.utilidad_bruta ?? null)}    rank={rUB[pais]     || "none"} /></Td>
                              <Td><Cell value={fmtPct(row?.margen_ub ?? null)}           rank={rMargen[pais] || "none"} /></Td>
                              <Td><Cell value={fmtNum(row?.piezas ?? null)}              rank={rPiezas[pais] || "none"} /></Td>
                              <Td><Cell value={fmtMoney(row?.ticket_promedio ?? null)}   rank={rTicket[pais] || "none"} /></Td>
                            </>
                          )}
                        </tr>
                      );
                    })}
                  </tbody>
                  {totales && !loading && (
                    <tfoot>
                      <tr style={{ background: "var(--bg-3)", borderTop: "0.5px solid var(--border-2)" }}>
                        <td style={{ padding: "8px 12px", color: "var(--text-4)", fontSize: 10, letterSpacing: "0.08em" }}>LATAM</td>
                        <td style={{ padding: "8px 12px", textAlign: "right", color: "var(--text-1)", fontWeight: 500 }}>{fmtNum(totales.tiendas)}</td>
                        <td style={{ padding: "8px 12px", textAlign: "right", color: "var(--text-1)", fontWeight: 500 }}>{fmtMoney(totales.facturacion)}</td>
                        <td style={{ padding: "8px 12px", textAlign: "right", color: "var(--text-4)" }}>—</td>
                        <td style={{ padding: "8px 12px", textAlign: "right", color: "var(--text-1)", fontWeight: 500 }}>{fmtMoney(totales.ub)}</td>
                        <td style={{ padding: "8px 12px", textAlign: "right", color: "var(--text-4)" }}>—</td>
                        <td style={{ padding: "8px 12px", textAlign: "right", color: "var(--text-1)", fontWeight: 500 }}>{fmtNum(totales.piezas)}</td>
                        <td style={{ padding: "8px 12px", textAlign: "right", color: "var(--text-4)" }}>—</td>
                      </tr>
                    </tfoot>
                  )}
                </table>
              </div>
              <TableLegend />
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
                    {PAISES.map((pais, i) => {
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
              <div style={{ marginTop: 12, padding: "10px 14px", background: "var(--bg-3)", border: "0.5px solid var(--border)", borderRadius: 8, fontSize: 11, color: "var(--text-4)" }}>
                Pendiente Redshift: KPI-OPS-006 Clientes (CO/PE/CL/AR) · KPI-OPS-017 OTD Almacén (Manhattan) · KPI-OPS-007 SKUs sin exhibir · KPI-OPS-012 % Tiendas con bono
              </div>
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
                    {PAISES.map((pais, i) => {
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
              <div style={{ marginTop: 12, padding: "10px 14px", background: "var(--bg-3)", border: "0.5px solid var(--border)", borderRadius: 8, fontSize: 11, color: "var(--text-4)" }}>
                Pendiente Redshift: CO/PE/CL/AR h_ventas_inventario por país · KPI-COM-006 Sell Thru AA · KPI-COM-010/011 SKUs &lt;3 pzas · KPI-COM-002/003/004 Descuentos
              </div>
            </>
          )}

          {/* ══════════════════════════════════════════════
              RRHH  — KPI-RH-001 a KPI-RH-035
          ══════════════════════════════════════════════ */}
          {area === "rrhh" && (
            <>
              <AreaHeader title={periodo} sub="Headcount, rotación y cobertura por país" badge={<BadgePending />} />
              <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 8, marginBottom: 16 }}>
                <KpiCard label="Prom. empleados/tienda"    value="—" sub="KPI-RH-017" pending />
                <KpiCard label="Rotación gral. tiendas"    value="—" sub="KPI-RH-013" pending />
                <KpiCard label="% Cob. plantilla tienda"   value="—" sub="KPI-RH-025" pending />
                <KpiCard label="Vacantes gerentes"         value="—" sub="KPI-RH-023" pending />
              </div>
              <div style={{ border: "0.5px solid var(--border)", borderRadius: 8, overflow: "hidden" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12, tableLayout: "fixed" }}>
                  <thead>
                    <tr style={{ background: "var(--bg-2)" }}>
                      <Th left width={72}>País</Th>
                      <ThKpi id="KPI-RH-017">Emp/Tienda</ThKpi>
                      <ThKpi id="KPI-RH-013">Rotación Gral</ThKpi>
                      <ThKpi id="KPI-RH-016">Rotación Gtes</ThKpi>
                      <ThKpi id="KPI-RH-025">% Cob. Plantilla</ThKpi>
                      <ThKpi id="KPI-RH-022">Vac. Subgte</ThKpi>
                      <ThKpi id="KPI-RH-023">Vac. Gerente</ThKpi>
                      <ThKpi id="KPI-RH-029">% Alc. Comp. Var.</ThKpi>
                    </tr>
                  </thead>
                  <tbody>
                    {PAISES.map((pais, i) => (
                      <tr key={pais} style={{ background: i % 2 === 0 ? "var(--bg-1)" : "var(--bg-0)", borderBottom: "0.5px solid var(--border)" }}>
                        <td style={{ padding: "10px 12px" }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                            <span style={{ background: "var(--bg-4)", color: "var(--text-3)", fontSize: 9, padding: "2px 5px", borderRadius: 3, fontWeight: 700, letterSpacing: "0.04em" }}>{pais}</span>
                            <span style={{ color: "var(--text-1)", fontWeight: 500 }}>{NOMBRE[pais]}</span><span style={{ color: "var(--text-4)", fontSize: 9, marginLeft: 4 }}>{MONEDA[pais]}</span>
                          </div>
                        </td>
                        {Array.from({ length: 7 }).map((_, j) => (
                          <td key={j} style={{ padding: "10px 12px", textAlign: "right", color: "var(--text-4)" }}>—</td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr style={{ background: "var(--bg-3)", borderTop: "0.5px solid var(--border-2)" }}>
                      <td style={{ padding: "8px 12px", color: "var(--text-4)", fontSize: 10, letterSpacing: "0.08em" }}>LATAM</td>
                      {Array.from({ length: 7 }).map((_, j) => (
                        <td key={j} style={{ padding: "8px 12px", textAlign: "right", color: "var(--text-4)" }}>—</td>
                      ))}
                    </tr>
                  </tfoot>
                </table>
              </div>
              <TableLegend />
              <div style={{ marginTop: 12, padding: "10px 14px", background: "var(--bg-3)", border: "0.5px solid var(--border)", borderRadius: 8, fontSize: 11, color: "var(--text-4)" }}>
                KPIs adicionales pendientes: KPI-RH-001 Satisfacción · KPI-RH-004 Rotación Corporativo · KPI-RH-007 Rotación Almacén · KPI-RH-019 Retención &lt;90 días · KPI-RH-024 % Cobertura interna gerenciales · KPI-RH-032/035 % Alcance comp. subgte/gte
              </div>
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
                    {PAISES.map((pais, i) => {
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
                      {PAISES.map((pais, i) => {
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

              <div style={{ marginTop: 4, padding: "10px 14px", background: "var(--bg-3)", border: "0.5px solid var(--border)", borderRadius: 8, fontSize: 11, color: "var(--text-4)" }}>
                KPIs pendientes Redshift: KPI-LOG-006 Prom almacenaje/sem · KPI-LOG-007/008/009/010 Costos por pieza · KPI-LOG-011 % Carga CEDIS · KPI-LOG-012 Inv China · KPI-LOG-013 Total inv (pzas) · KPI-LOG-014/015 Inv tiendas/tránsito
              </div>
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
                      <Th left width={130}>Canal</Th>
                      <ThKpi id="KPI-MKT-006">Pts Ganados</ThKpi>
                      <ThKpi id="KPI-MKT-006">Monto Ganado</ThKpi>
                      <ThKpi id="KPI-MKT-007">Pts Redimidos</ThKpi>
                      <ThKpi id="KPI-MKT-009">Monto Redimido</ThKpi>
                    </tr>
                  </thead>
                  <tbody>
                    {[
                      {
                        canal: "🏪 POS (Tiendas)",
                        ganados: mktData?.puntos.ganados_pos ?? null,
                        monto_g: mktData?.puntos.monto_pos ?? null,
                        redimidos: mktData?.puntos.redimidos_pos ?? null,
                        monto_r: mktData?.puntos.monto_red_pos ?? null,
                      },
                      {
                        canal: "🛒 E-commerce",
                        ganados: mktData?.puntos.ganados_ecom ?? null,
                        monto_g: mktData?.puntos.monto_ecom ?? null,
                        redimidos: mktData?.puntos.redimidos_gift ?? null,
                        monto_r: mktData?.puntos.monto_red_gift ?? null,
                      },
                      {
                        canal: "📱 App Miniso",
                        ganados: mktData?.puntos.ganados_app ?? null,
                        monto_g: mktData?.puntos.monto_app ?? null,
                        redimidos: mktData?.puntos.redimidos_app ?? null,
                        monto_r: mktData?.puntos.monto_red_app ?? null,
                      },
                    ].map((row, i) => (
                      <tr key={row.canal} style={{ background: i % 2 === 0 ? "var(--bg-1)" : "var(--bg-0)", borderBottom: "0.5px solid var(--border)" }}>
                        <td style={{ padding: "10px 12px", color: "var(--text-1)", fontWeight: 500 }}>{row.canal}</td>
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

              <div style={{ marginTop: 4, padding: "10px 14px", background: "var(--bg-3)", border: "0.5px solid var(--border)", borderRadius: 8, fontSize: 11, color: "var(--text-4)" }}>
                Datos solo MX · KPI-MKT-001/002/003 Tráfico/Sensores pendiente integración Getin · CO/PE/CL/AR sin loyalty Redshift
              </div>
            </>
          )}

          {/* ══════════════════════════════════════════════
              AUDITORÍA  — KPI-AUD-001 a KPI-AUD-006
          ══════════════════════════════════════════════ */}
          {area === "auditoria" && (
            <>
              <AreaHeader title={periodo} sub="Robo, merma y eventos de seguridad por país" badge={<BadgePending />} />
              <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 8, marginBottom: 16 }}>
                <KpiCard label="Robo tiendas"      value="—" sub="KPI-AUD-001" pending />
                <KpiCard label="Merma tiendas"     value="—" sub="KPI-AUD-002" pending />
                <KpiCard label="Eventos farderos"  value="—" sub="KPI-AUD-004" pending />
                <KpiCard label="Robo interno"      value="—" sub="KPI-AUD-005" pending />
              </div>
              <div style={{ border: "0.5px solid var(--border)", borderRadius: 8, overflow: "hidden" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12, tableLayout: "fixed" }}>
                  <thead>
                    <tr style={{ background: "var(--bg-2)" }}>
                      <Th left width={72}>País</Th>
                      <ThKpi id="KPI-AUD-001">Robo Tiendas</ThKpi>
                      <ThKpi id="KPI-AUD-002">Merma Tiendas</ThKpi>
                      <ThKpi id="KPI-AUD-003">Caducados</ThKpi>
                      <ThKpi id="KPI-AUD-004">Eventos Farderos</ThKpi>
                      <ThKpi id="KPI-AUD-005">Robo Interno</ThKpi>
                      <ThKpi id="KPI-AUD-006">Robo Camión</ThKpi>
                    </tr>
                  </thead>
                  <tbody>
                    {PAISES.map((pais, i) => (
                      <tr key={pais} style={{ background: i % 2 === 0 ? "var(--bg-1)" : "var(--bg-0)", borderBottom: "0.5px solid var(--border)" }}>
                        <td style={{ padding: "10px 12px" }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                            <span style={{ background: "var(--bg-4)", color: "var(--text-3)", fontSize: 9, padding: "2px 5px", borderRadius: 3, fontWeight: 700, letterSpacing: "0.04em" }}>{pais}</span>
                            <span style={{ color: "var(--text-1)", fontWeight: 500 }}>{NOMBRE[pais]}</span><span style={{ color: "var(--text-4)", fontSize: 9, marginLeft: 4 }}>{MONEDA[pais]}</span>
                          </div>
                        </td>
                        {Array.from({ length: 6 }).map((_, j) => (
                          <td key={j} style={{ padding: "10px 12px", textAlign: "right", color: "var(--text-4)" }}>—</td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr style={{ background: "var(--bg-3)", borderTop: "0.5px solid var(--border-2)" }}>
                      <td style={{ padding: "8px 12px", color: "var(--text-4)", fontSize: 10, letterSpacing: "0.08em" }}>LATAM</td>
                      {Array.from({ length: 6 }).map((_, j) => (
                        <td key={j} style={{ padding: "8px 12px", textAlign: "right", color: "var(--text-4)" }}>—</td>
                      ))}
                    </tr>
                  </tfoot>
                </table>
              </div>
              <TableLegend />
              <div style={{ marginTop: 12, padding: "10px 14px", background: "var(--bg-3)", border: "0.5px solid var(--border)", borderRadius: 8, fontSize: 11, color: "var(--text-4)", lineHeight: 1.6 }}>
                <span style={{ color: "var(--rose)", fontWeight: 500 }}>Datos sensibles — </span>
                acceso restringido. Fuente: sistema de auditoría interno. Pendiente integración con Redshift o API directa.
              </div>
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
            flex: 1, background: "var(--bg-3)", border: "0.5px solid var(--border-2)",
            borderRadius: 6, color: "var(--text-1)", fontSize: 12,
            padding: "7px 12px", outline: "none",
          }}
        />
        <button
          onClick={preguntarIA}
          disabled={iaLoading || !data}
          style={{
            background: iaLoading || !data ? "var(--bg-4)" : "var(--red)",
            border: "none", color: "#fff", fontSize: 12, fontWeight: 500,
            padding: "7px 16px", borderRadius: 6,
            cursor: iaLoading || !data ? "not-allowed" : "pointer",
            transition: "background 0.15s", flexShrink: 0,
          }}
        >
          {iaLoading ? "…" : "Preguntar"}
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
      <LegendItem color="var(--rose)"  label="Peor del grupo" />
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

function SideItem({ icon, label, active }: { icon: string; label: string; active?: boolean }) {
  return (
    <div style={{
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
      fontVariantNumeric: "tabular-nums",
    }}>{children}</td>
  );
}

function LegendItem({ color, label }: { color: string; label: string }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 10, color: "var(--text-4)" }}>
      <div style={{ width: 6, height: 6, borderRadius: "50%", background: color }} />
      {label}
    </div>
  );
}
