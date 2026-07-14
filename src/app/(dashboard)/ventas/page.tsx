"use client";
import React, { useEffect, useState, useCallback } from "react";
import {
  ComposedChart, LineChart, Bar, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ResponsiveContainer, ReferenceLine,
} from "recharts";

interface MonthPoint { label: string; ventas: number; py_ventas: number; }
interface TiendaRow  { tienda: string; ventas: number; piezas: number; py_ventas: number; yoy: number | null; }

interface CountryData {
  code: string; currency: string;
  ventas: number; piezas: number; tiendas: number;
  py_ventas: number; yoy_pct: number | null;
  monthlyChart: MonthPoint[];
  topTiendas: TiendaRow[];
}

interface VentasResp {
  ok: boolean;
  params: { year: number; month: number; mode: string; label: string };
  latam: { tiendas: number; count: number };
  countries: Record<string, CountryData>;
  growthChart: Record<string, unknown>[];
}

const COLORS: Record<string, string> = {
  MX: "#C8102E", CO: "#f59e0b", PE: "#10b981", CL: "#3b82f6", AR: "#8b5cf6",
};
const MONTHS   = ["Ene","Feb","Mar","Abr","May","Jun","Jul","Ago","Sep","Oct","Nov","Dic"];
const NOW_YEAR = new Date().getFullYear();
const YEARS    = [NOW_YEAR, NOW_YEAR - 1, NOW_YEAR - 2];
const COUNTRIES = ["MX","CO","PE","CL","AR"];

const fmtM = (n: number | null) => {
  if (n == null) return "--";
  const a = Math.abs(n);
  if (a >= 1e9) return "$" + (n / 1e9).toFixed(2) + "B";
  if (a >= 1e6) return "$" + (n / 1e6).toFixed(1) + "M";
  if (a >= 1e3) return "$" + (n / 1e3).toFixed(0) + "K";
  return "$" + n.toFixed(0);
};
const fmtPct = (n: number | null) =>
  n == null ? "--" : (n >= 0 ? "+" : "") + n.toFixed(1) + "%";
const yoyC = (n: number | null) =>
  n == null ? "#555" : n >= 0 ? "#4ade80" : "#f87171";

const S = {
  page:  { background: "#0f0f1a", minHeight: "100vh", padding: "24px 28px",
           fontFamily: "Segoe UI,sans-serif", color: "#e0e0e0" } as React.CSSProperties,
  card:  { background: "#13131f", borderRadius: 10, padding: "18px 20px",
           border: "1px solid #1e1e2e" } as React.CSSProperties,
  secT:  { fontSize: 12, fontWeight: 600, color: "#666", textTransform: "uppercase" as const,
           letterSpacing: "0.5px", marginBottom: 12 },
  tbl:   { width: "100%", borderCollapse: "collapse" as const, fontSize: 12 },
  th:    { padding: "8px 12px", textAlign: "left" as const, color: "#555",
           fontWeight: 600, borderBottom: "1px solid #1e1e2e",
           fontSize: 11, textTransform: "uppercase" as const },
  td:    { padding: "9px 12px", borderBottom: "1px solid #0f0f18", color: "#ccc" },
  modeBtn: (active: boolean): React.CSSProperties => ({
    padding: "5px 14px", borderRadius: 6, border: "none", cursor: "pointer",
    fontSize: 12, fontWeight: 700,
    background: active ? "#C8102E" : "#1e1e30", color: active ? "#fff" : "#666",
  }),
  monBtn: (active: boolean): React.CSSProperties => ({
    width: 26, height: 26, borderRadius: 5, border: "none", cursor: "pointer",
    fontSize: 11, fontWeight: active ? 700 : 400,
    background: active ? "#C8102E" : "#1e1e30", color: active ? "#fff" : "#666",
  }),
  yBtn: (active: boolean): React.CSSProperties => ({
    padding: "5px 12px", borderRadius: 20, border: "none", cursor: "pointer",
    fontSize: 12, fontWeight: 600,
    background: active ? "#C8102E" : "#1e1e30", color: active ? "#fff" : "#888",
  }),
  cBtn: (active: boolean, color: string): React.CSSProperties => ({
    padding: "4px 10px", borderRadius: 20,
    border: "1px solid " + (active ? color : "#222"),
    cursor: "pointer", fontSize: 11, fontWeight: 600,
    background: active ? color + "22" : "transparent", color: active ? color : "#555",
  }),
  curBtn: (active: boolean): React.CSSProperties => ({
    padding: "5px 16px", borderRadius: 6, border: "none", cursor: "pointer",
    fontSize: 12, fontWeight: 700,
    background: active ? "#fff" : "#1e1e30", color: active ? "#0f0f1a" : "#666",
  }),
};

export default function VentasPage() {
  const [year,    setYear]    = useState(NOW_YEAR);
  const [month,   setMonth]   = useState(new Date().getMonth() + 1);
  const [mode,    setMode]    = useState<"ytd"|"udm">("ytd");
  const [cur,     setCur]     = useState<"local"|"mxn">("local");
  const [country, setCountry] = useState("MX");
  const [data,    setData]    = useState<VentasResp | null>(null);
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState<string | null>(null);

  const load = useCallback(async (y: number, m: number, md: string, currency: string) => {
    setLoading(true); setError(null);
    try {
      const res = await fetch("/api/ventas?year=" + y + "&month=" + m + "&mode=" + md + "&currency=" + currency);
      if (!res.ok) throw new Error("HTTP " + res.status);
      setData(await res.json());
    } catch (e) { setError(String(e)); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(year, month, mode, cur); }, [year, month, mode, cur, load]);

  const cData = data?.countries[country];

  return (
    <div style={S.page}>
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between",
                    marginBottom: 18 }}>
        <div>
          <div style={{ fontSize: 22, fontWeight: 700, color: "#fff" }}>Ventas LATAM</div>
          <div style={{ fontSize: 12, color: "#555", marginTop: 2 }}>
            {cur === "local"
              ? "Facturacion por pais en moneda local -- no se suman entre paises"
              : "Facturacion en MXN -- conversion pendiente analisis Redshift"}
          </div>
        </div>
        <div style={{ display: "flex", gap: 4 }}>
          {YEARS.map(y => <button key={y} style={S.yBtn(y === year)} onClick={() => setYear(y)}>{y}</button>)}
        </div>
      </div>

      <div style={{ ...S.card, display: "flex", alignItems: "center", gap: 12,
                    padding: "12px 16px", marginBottom: 18, flexWrap: "wrap" as const }}>
        <div style={{ display: "flex", gap: 2, background: "#0a0a14",
                      borderRadius: 8, padding: 3 }}>
          <button style={S.curBtn(cur === "local")} onClick={() => setCur("local")}>
            Moneda Local
          </button>
          <button style={S.curBtn(cur === "mxn")} onClick={() => setCur("mxn")}>
            MXN
          </button>
        </div>
        <div style={{ width: 1, height: 20, background: "#2a2a3a", flexShrink: 0 }} />
        <div style={{ display: "flex", gap: 4 }}>
          {(["ytd","udm"] as const).map(m => (
            <button key={m} style={S.modeBtn(m === mode)} onClick={() => setMode(m)}>
              {m === "ytd" ? "YTD" : "UDM"}
            </button>
          ))}
        </div>
        <div style={{ width: 1, height: 20, background: "#2a2a3a", flexShrink: 0 }} />
        <div style={{ display: "flex", gap: 3 }}>
          {MONTHS.map((lbl, i) => (
            <button key={i} style={S.monBtn(i + 1 === month)} onClick={() => setMonth(i + 1)}>
              {lbl[0]}
            </button>
          ))}
        </div>
        <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 10 }}>
          {cur === "mxn" && (
            <span style={{ fontSize: 10, color: "#7c5800", background: "#1a1300",
                           padding: "2px 8px", borderRadius: 4 }}>
              Conversion a MXN -- pendiente analisis Redshift
            </span>
          )}
          {data && (
            <span style={{ fontSize: 11, color: "#2a6040", fontWeight: 600 }}>
              {data.params.label} &nbsp;|&nbsp; {data.latam.tiendas} tiendas
            </span>
          )}
        </div>
      </div>

      {loading && <div style={{ textAlign: "center", padding: 60, color: "#555" }}>Cargando datos...</div>}
      {error   && <div style={{ textAlign: "center", padding: 40, color: "#f87171" }}>Error: {error}</div>}

      {data && !loading && (
        <>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(5,1fr)", gap: 12,
                        marginBottom: 18 }}>
            {COUNTRIES.map(c => {
              const d = data.countries[c];
              const isSelected = c === country;
              return (
                <div key={c}
                  style={{ ...S.card, cursor: "pointer",
                    borderTop: "3px solid " + COLORS[c],
                    outline: isSelected ? "1px solid " + COLORS[c] + "44" : "none" }}
                  onClick={() => setCountry(c)}>
                  <div style={{ display: "flex", justifyContent: "space-between",
                                alignItems: "center", marginBottom: 10 }}>
                    <span style={{ fontWeight: 700, color: "#fff", fontSize: 14 }}>{c}</span>
                    <span style={{ fontSize: 10, color: "#444", background: "#1e1e2e",
                                   padding: "2px 7px", borderRadius: 10 }}>
                      {d?.currency ?? "---"}
                    </span>
                  </div>
                  <div style={{ fontSize: 19, fontWeight: 700, color: "#fff", marginBottom: 4 }}>
                    {fmtM(d?.ventas ?? null)}
                  </div>
                  <div style={{ fontSize: 12, fontWeight: 700,
                                color: yoyC(d?.yoy_pct ?? null), marginBottom: 4 }}>
                    {fmtPct(d?.yoy_pct ?? null)}
                    <span style={{ color: "#333", fontWeight: 400, fontSize: 10 }}> vs PA</span>
                  </div>
                  <div style={{ fontSize: 10, color: "#555" }}>
                    {d?.tiendas ?? "--"} tiendas
                  </div>
                </div>
              );
            })}
          </div>

          <div style={{ ...S.card, marginBottom: 18 }}>
            <div style={S.secT}>% Crecimiento mensual vs mismo periodo anterior</div>
            <div style={{ fontSize: 10, color: "#2a5a3a", marginBottom: 14 }}>
              Esta grafica muestra porcentaje -- es comparable entre paises aunque tengan divisas diferentes
            </div>
            <ResponsiveContainer width="100%" height={220}>
              <LineChart data={data.growthChart}
                margin={{ top: 5, right: 20, bottom: 0, left: 10 }}>
                <CartesianGrid stroke="#1e1e2e" strokeDasharray="3 3" />
                <XAxis dataKey="label" tick={{ fill: "#555", fontSize: 10 }} />
                <YAxis tickFormatter={(v: number) => v.toFixed(0) + "%"}
                  tick={{ fill: "#555", fontSize: 10 }} />
                <ReferenceLine y={0} stroke="#333" strokeDasharray="4 2" />
                <Tooltip
                  formatter={(v: unknown) =>
                    v != null ? [(v as number).toFixed(1) + "%"] : ["--"]}
                  contentStyle={{ background: "#1a1a2e", border: "1px solid #333",
                                  borderRadius: 8, fontSize: 12 }}
                  labelStyle={{ color: "#888" }}
                />
                <Legend wrapperStyle={{ fontSize: 11, color: "#888" }} />
                {COUNTRIES.map(c => (
                  <Line key={c} dataKey={c} name={c} stroke={COLORS[c]}
                    strokeWidth={2} dot={false} connectNulls type="monotone" />
                ))}
              </LineChart>
            </ResponsiveContainer>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
            <div style={S.card}>
              <div style={{ ...S.secT, display: "flex", alignItems: "center",
                            justifyContent: "space-between" }}>
                <span>
                  Ventas mensuales -- {country}
                  <span style={{ color: "#444", fontWeight: 400, marginLeft: 6 }}>
                    ({cData?.currency ?? ""})
                  </span>
                </span>
                <div style={{ display: "flex", gap: 3 }}>
                  {COUNTRIES.map(c => (
                    <button key={c} style={S.cBtn(c === country, COLORS[c])}
                      onClick={() => setCountry(c)}>{c}</button>
                  ))}
                </div>
              </div>
              <ResponsiveContainer width="100%" height={210}>
                <ComposedChart data={cData?.monthlyChart ?? []}
                  margin={{ top: 5, right: 15, bottom: 0, left: 5 }}>
                  <CartesianGrid stroke="#1e1e2e" strokeDasharray="3 3" />
                  <XAxis dataKey="label" tick={{ fill: "#555", fontSize: 10 }} />
                  <YAxis tickFormatter={(v: number) => fmtM(v)}
                    tick={{ fill: "#555", fontSize: 10 }} />
                  <Tooltip
                    formatter={(v: number, name: string) => [fmtM(v), name]}
                    contentStyle={{ background: "#1a1a2e", border: "1px solid #333",
                                    borderRadius: 8, fontSize: 12 }}
                  />
                  <Bar dataKey="ventas" name={country + " " + year}
                    fill={COLORS[country]} opacity={0.85} />
                  <Line dataKey="py_ventas" name={"" + (year - 1)}
                    type="monotone" stroke="#444" strokeDasharray="5 3"
                    strokeWidth={1.5} dot={false} />
                </ComposedChart>
              </ResponsiveContainer>
            </div>

            <div style={S.card}>
              <div style={S.secT}>
                Top tiendas -- {country} ({data.params.label})
              </div>
              {!cData?.topTiendas?.length ? (
                <div style={{ textAlign: "center", padding: 30, color: "#444" }}>Sin datos</div>
              ) : (
                <table style={S.tbl}>
                  <thead>
                    <tr>
                      {["#","Tienda","Ventas","vs PA"].map(h => (
                        <th key={h} style={S.th}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {cData.topTiendas.slice(0, 12).map((t, i) => (
                      <tr key={i}>
                        <td style={{ ...S.td, color: "#444", width: 24 }}>{i + 1}</td>
                        <td style={{ ...S.td,
                          fontWeight: i < 3 ? 600 : 400,
                          color: i === 0 ? "#fbbf24" : "#ccc",
                          maxWidth: 160, overflow: "hidden",
                          textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {t.tienda}
                        </td>
                        <td style={S.td}>{fmtM(t.ventas)}</td>
                        <td style={{ ...S.td, fontWeight: 600, color: yoyC(t.yoy) }}>
                          {fmtPct(t.yoy)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}