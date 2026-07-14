"use client";
import React, { Fragment, useEffect, useState, useCallback } from "react";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ResponsiveContainer, ReferenceLine, ComposedChart, Bar,
} from "recharts";

interface PeriodSlice {
  ventas:   number;
  costo:    number | null;
  tiendas:  number;
  nomina:   number | null;
  renta:    number | null;
  gts_op:   number | null;
  gts_corp: number | null;
  otros:    number | null;
}
interface TS { cur: PeriodSlice; pri: PeriodSlice; }
interface CData {
  code: string; currency: string; has_costo: boolean;
  mes: TS; period: TS;
  monthlyChart: {
    label: string; ventas: number; ub: number | null;
    ub_pct: number | null; py_ventas: number; pct: number | null;
  }[];
}
interface FinResp {
  ok: boolean;
  params: {
    year: number; month: number; mode: string;
    label: string; monthLabel: string;
  };
  countries: Record<string, CData>;
  growthChart: Record<string, unknown>[];
  ubPctChart:  Record<string, unknown>[];
}

const CLR: Record<string, string> = {
  MX: "#C8102E", CO: "#f59e0b", CL: "#3b82f6", PE: "#10b981", AR: "#8b5cf6",
};
const ML    = ["Ene","Feb","Mar","Abr","May","Jun","Jul","Ago","Sep","Oct","Nov","Dic"];
const CTRY  = ["MX","CO","CL","PE","AR"];
const CNAME: Record<string, string> = {
  MX: "Mexico", CO: "Colombia", CL: "Chile", PE: "Peru", AR: "Argentina",
};
const YN   = new Date().getFullYear();
const YEARS = [YN, YN - 1, YN - 2];

type SK = "tiendas"|"ventas"|"ub"|"nomina"|"renta"|"gts_op"|"gts_corp"|"otros"|"ebitda";
interface Sec { key: SK; lbl: string; cnt?: boolean; noSv?: boolean; pend?: boolean; }
const SECS: Sec[] = [
  { key: "tiendas",  lbl: "# TIENDAS",        cnt: true, noSv: true  },
  { key: "ventas",   lbl: "VENTA",             noSv: true             },
  { key: "ub",       lbl: "UT. BRUTA"                                 },
  { key: "nomina",   lbl: "NOMINA OP.",        pend: true             },
  { key: "renta",    lbl: "RENTA",             pend: true             },
  { key: "gts_op",   lbl: "GTS. OPERATIVOS",   pend: true             },
  { key: "gts_corp", lbl: "GTS. CORPORATIVOS", pend: true             },
  { key: "otros",    lbl: "OTROS GASTOS/ING.", pend: true             },
  { key: "ebitda",   lbl: "EBITDA",            pend: true             },
];

function gv(s: PeriodSlice | undefined, k: SK): number | null {
  if (!s) return null;
  if (k === "tiendas") return s.tiendas;
  if (k === "ventas")  return s.ventas;
  if (k === "ub")      return s.costo != null ? s.ventas - s.costo : null;
  if (k === "ebitda") {
    const ub = s.costo != null ? s.ventas - s.costo : null;
    if (ub == null || s.nomina == null || s.renta == null ||
        s.gts_op == null || s.gts_corp == null || s.otros == null) return null;
    return ub - s.nomina - s.renta - s.gts_op - s.gts_corp + s.otros;
  }
  return (s as unknown as Record<string, number | null>)[k] ?? null;
}

function fmt(n: number | null, cnt = false): string {
  if (n == null) return "--";
  const neg = n < 0, a = Math.abs(n);
  let s: string;
  if (cnt)          s = Math.round(a).toString();
  else if (a >= 1e9) s = (a / 1e9).toFixed(1) + "B";
  else if (a >= 1e6) s = (a / 1e6).toFixed(1) + "M";
  else               s = Math.round(a).toLocaleString("en-US");
  return neg ? "(" + s + ")" : s;
}
function fmtDiff(a: number | null, b: number | null, cnt = false): string {
  if (a == null || b == null) return "--";
  const d = a - b, s = fmt(d, cnt);
  return d > 0 && s[0] !== "(" ? "+" + s : s;
}
function fmtPct(a: number | null, b: number | null): string {
  if (a == null || b == null || b === 0) return "--";
  const p = ((a - b) / Math.abs(b)) * 100;
  return (p > 0 ? "+" : "") + p.toFixed(1) + "%";
}
function fmtSV(v: number | null, vta: number | null | undefined): string {
  if (v == null || !vta || vta === 0) return "--";
  return ((v / vta) * 100).toFixed(1) + "%";
}
function vc(a: number | null, b: number | null): string {
  if (a == null || b == null) return "#555";
  return a > b ? "#4ade80" : a < b ? "#f87171" : "#555";
}
const fmtM = (n: number | null): string => {
  if (n == null) return "--";
  const a = Math.abs(n);
  if (a >= 1e9) return "$" + (n / 1e9).toFixed(2) + "B";
  if (a >= 1e6) return "$" + (n / 1e6).toFixed(1) + "M";
  if (a >= 1e3) return "$" + (n / 1e3).toFixed(0) + "K";
  return "$" + n.toFixed(0);
};

const BG  = "#0f0f1a";
const BG2 = "#13131f";
const BG3 = "#0c0c16";
const BD  = "#1e1e2e";

const S = {
  page:   { background: BG, minHeight: "100vh", padding: "24px 28px",
            fontFamily: "Segoe UI,sans-serif", color: "#e0e0e0" } as React.CSSProperties,
  card:   { background: BG2, borderRadius: 10, padding: "18px 20px",
            border: "1px solid " + BD } as React.CSSProperties,
  secT:   { fontSize: 12, fontWeight: 600, color: "#666",
            textTransform: "uppercase" as const, letterSpacing: "0.5px", marginBottom: 12 },
  yBtn:   (a: boolean): React.CSSProperties => ({
    padding: "5px 12px", borderRadius: 20, border: "none", cursor: "pointer",
    fontSize: 12, fontWeight: 600,
    background: a ? "#C8102E" : "#1e1e30", color: a ? "#fff" : "#888",
  }),
  mBtn:   (a: boolean): React.CSSProperties => ({
    padding: "5px 14px", borderRadius: 6, border: "none", cursor: "pointer",
    fontSize: 12, fontWeight: 700,
    background: a ? "#C8102E" : "#1e1e30", color: a ? "#fff" : "#666",
  }),
  monBtn: (a: boolean): React.CSSProperties => ({
    width: 26, height: 26, borderRadius: 5, border: "none", cursor: "pointer",
    fontSize: 11, fontWeight: a ? 700 : 400,
    background: a ? "#C8102E" : "#1e1e30", color: a ? "#fff" : "#666",
  }),
  curBtn: (a: boolean): React.CSSProperties => ({
    padding: "5px 16px", borderRadius: 6, border: "none", cursor: "pointer",
    fontSize: 12, fontWeight: 700,
    background: a ? "#fff" : "#1e1e30", color: a ? "#0f0f1a" : "#666",
  }),
  cBtn:   (a: boolean, color: string): React.CSSProperties => ({
    padding: "4px 10px", borderRadius: 20,
    border: "1px solid " + (a ? color : "#222"), cursor: "pointer",
    fontSize: 11, fontWeight: 600,
    background: a ? color + "22" : "transparent", color: a ? color : "#555",
  }),
};

interface PLTableProps {
  title:    string;
  sub:      string;
  sliceKey: "mes" | "period";
  year:     number;
  currency: "local" | "mxn";
  countries: Record<string, CData>;
}

function PLTable({ title, sub, sliceKey, year, currency, countries }: PLTableProps) {
  const TH = (left = false, muted = false): React.CSSProperties => ({
    padding: "6px 8px",
    paddingLeft: left ? 14 : 8,
    fontSize: 10, fontWeight: 600,
    color: muted ? "#2a2a3a" : "#484860",
    textTransform: "uppercase" as const, whiteSpace: "nowrap" as const,
    textAlign: (left ? "left" : "right") as "left" | "right",
    borderBottom: "1px solid " + BD,
    background: BG3,
  });
  const TD = (neg = false, muted = false, bold = false): React.CSSProperties => ({
    padding: "5px 8px", textAlign: "right" as const, fontSize: 11,
    color: neg ? "#f87171" : muted ? "#2a2a3a" : bold ? "#fff" : "#b0b0c0",
    fontWeight: bold ? 700 : 400,
    borderBottom: "1px solid #0d0d18",
    fontVariantNumeric: "tabular-nums" as const,
  });

  return (
    <div style={{ ...S.card, flex: 1, minWidth: 0 }}>
      <div style={{ marginBottom: 14 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: "#fff",
                      borderLeft: "3px solid #C8102E", paddingLeft: 10 }}>
          {title}
        </div>
        <div style={{ fontSize: 10, color: "#3a3a4a", paddingLeft: 14, marginTop: 2 }}>{sub}</div>
      </div>
      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse" as const, fontSize: 11 }}>
          <thead>
            <tr>
              <th style={{ ...TH(true), width: 108 }}>PAIS</th>
              <th style={TH()}>ACTUAL {year}</th>
              <th style={TH()}>%S/V</th>
              <th style={TH(false, true)}>ANT. {year - 1}</th>
              <th style={TH(false, true)}>%S/V</th>
              <th style={TH()}>VAR$</th>
              <th style={TH()}>VAR%</th>
            </tr>
          </thead>
          <tbody>
            {SECS.map((sec) => {
              const cVals = CTRY.map((c) => gv(countries[c]?.[sliceKey]?.cur, sec.key));
              const pVals = CTRY.map((c) => gv(countries[c]?.[sliceKey]?.pri, sec.key));
              const totC: number | null = sec.cnt
                ? CTRY.reduce<number>((s, c) => s + (gv(countries[c]?.[sliceKey]?.cur, sec.key) ?? 0), 0)
                : cVals.some((v) => v == null)
                  ? null
                  : cVals.reduce<number>((s, v) => s + (v ?? 0), 0);
              const totP: number | null = sec.cnt
                ? CTRY.reduce<number>((s, c) => s + (gv(countries[c]?.[sliceKey]?.pri, sec.key) ?? 0), 0)
                : pVals.some((v) => v == null)
                  ? null
                  : pVals.reduce<number>((s, v) => s + (v ?? 0), 0);
              const showTotal = sec.cnt || currency === "mxn";

              return (
                <Fragment key={sec.key}>
                  <tr>
                    <td colSpan={7} style={{
                      padding: "10px 14px 4px",
                      fontSize: 10, fontWeight: 700, color: "#C8102E",
                      letterSpacing: "0.5px", textTransform: "uppercase" as const,
                      borderTop: "1px solid " + BD, background: BG3,
                    }}>
                      {sec.lbl}
                      {sec.pend && (
                        <span style={{
                          marginLeft: 8, fontSize: 9, fontWeight: 400, letterSpacing: 0,
                          color: "#7c5800", background: "#1a1300",
                          padding: "1px 6px", borderRadius: 4,
                        }}>
                          pendiente Redshift
                        </span>
                      )}
                    </td>
                  </tr>
                  {CTRY.map((c) => {
                    const sl   = countries[c]?.[sliceKey];
                    const cv   = gv(sl?.cur, sec.key);
                    const pv   = gv(sl?.pri, sec.key);
                    const cvta = gv(sl?.cur, "ventas");
                    const pvta = gv(sl?.pri, "ventas");
                    return (
                      <tr key={c}>
                        <td style={{
                          padding: "5px 8px 5px 18px", fontSize: 11, color: "#777",
                          borderBottom: "1px solid #0d0d18",
                        }}>
                          <span style={{
                            display: "inline-block", width: 6, height: 6,
                            borderRadius: "50%", background: CLR[c], marginRight: 6,
                          }} />
                          {CNAME[c]}
                        </td>
                        <td style={TD(cv != null && cv < 0)}>{fmt(cv, sec.cnt)}</td>
                        <td style={TD(false, true)}>{sec.noSv ? "--" : fmtSV(cv, cvta)}</td>
                        <td style={TD(pv != null && pv < 0, true)}>{fmt(pv, sec.cnt)}</td>
                        <td style={TD(false, true)}>{sec.noSv ? "--" : fmtSV(pv, pvta)}</td>
                        <td style={{ ...TD(), color: vc(cv, pv) }}>{fmtDiff(cv, pv, sec.cnt)}</td>
                        <td style={{ ...TD(), color: vc(cv, pv) }}>{fmtPct(cv, pv)}</td>
                      </tr>
                    );
                  })}
                  <tr style={{ background: "#0a0a14" }}>
                    <td style={{
                      padding: "5px 8px 5px 14px", fontSize: 10, fontWeight: 700,
                      color: "#444", textTransform: "uppercase" as const,
                      borderBottom: "1px solid " + BD,
                    }}>
                      TOTAL
                    </td>
                    {showTotal ? (
                      <>
                        <td style={TD(totC != null && totC < 0, false, true)}>{fmt(totC, sec.cnt)}</td>
                        <td style={TD(false, true)}>--</td>
                        <td style={TD(totP != null && totP < 0, true, false)}>{fmt(totP, sec.cnt)}</td>
                        <td style={TD(false, true)}>--</td>
                        <td style={{ ...TD(), color: vc(totC, totP) }}>{fmtDiff(totC, totP, sec.cnt)}</td>
                        <td style={{ ...TD(), color: vc(totC, totP) }}>{fmtPct(totC, totP)}</td>
                      </>
                    ) : (
                      <td colSpan={6} style={{
                        ...TD(false, true), textAlign: "center" as const,
                        fontSize: 10, fontStyle: "italic",
                      }}>
                        multiples divisas -- ver en MXN para total
                      </td>
                    )}
                  </tr>
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default function FinanzasPage() {
  const [year,    setYear]    = useState(YN);
  const [month,   setMonth]   = useState(new Date().getMonth() + 1);
  const [mode,    setMode]    = useState<"ytd" | "udm">("ytd");
  const [cur,     setCur]     = useState<"local" | "mxn">("local");
  const [ctry,    setCtry]    = useState("MX");
  const [data,    setData]    = useState<FinResp | null>(null);
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState<string | null>(null);

  const load = useCallback(async (y: number, m: number, md: string, currency: string) => {
    setLoading(true); setError(null);
    try {
      const r = await fetch("/api/finanzas?year=" + y + "&month=" + m + "&mode=" + md + "&currency=" + currency);
      if (!r.ok) throw new Error("HTTP " + r.status);
      setData(await r.json());
    } catch (e) { setError(String(e)); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(year, month, mode, cur); }, [year, month, mode, cur, load]);

  const cd = data?.countries[ctry];
  const mesTitle  = data ? (data.params.monthLabel?.toUpperCase() ?? "") + " " + year : "MES " + year;
  const perTitle  = data?.params.label?.toUpperCase() ?? "ACUMULADO";
  const mesSub    = data ? "vs " + data.params.monthLabel + " " + (year - 1) : "";
  const perSub    = data ? (data.params.mode === "ytd" ? "YTD" : "UDM") + " vs periodo anterior" : "";

  return (
    <div style={S.page}>
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between",
                    marginBottom: 18 }}>
        <div>
          <div style={{ fontSize: 22, fontWeight: 700, color: "#fff" }}>Finanzas / P&L</div>
          <div style={{ fontSize: 12, color: "#555", marginTop: 2 }}>
            Estado de resultados - VB, UB y lineas operativas por pais
          </div>
        </div>
        <div style={{ display: "flex", gap: 4 }}>
          {YEARS.map((y) => (
            <button key={y} style={S.yBtn(y === year)} onClick={() => setYear(y)}>{y}</button>
          ))}
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
        <div style={{ width: 1, height: 20, background: BD, flexShrink: 0 }} />
        <div style={{ display: "flex", gap: 4 }}>
          {(["ytd", "udm"] as const).map((m) => (
            <button key={m} style={S.mBtn(m === mode)} onClick={() => setMode(m)}>
              {m === "ytd" ? "YTD" : "UDM"}
            </button>
          ))}
        </div>
        <div style={{ width: 1, height: 20, background: BD, flexShrink: 0 }} />
        <div style={{ display: "flex", gap: 3 }}>
          {ML.map((l, i) => (
            <button key={i} style={S.monBtn(i + 1 === month)} onClick={() => setMonth(i + 1)}>
              {l[0]}
            </button>
          ))}
        </div>
        <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 10 }}>
          {cur === "mxn" && (
            <span style={{
              fontSize: 10, color: "#7c5800", background: "#1a1300",
              padding: "2px 8px", borderRadius: 4,
            }}>
              Conversion a MXN -- pendiente analisis Redshift
            </span>
          )}
          {data && (
            <span style={{ fontSize: 11, color: "#2a6040", fontWeight: 600 }}>
              {data.params.label}
            </span>
          )}
        </div>
      </div>

      {loading && (
        <div style={{ textAlign: "center", padding: 60, color: "#555" }}>Cargando datos...</div>
      )}
      {error && (
        <div style={{ textAlign: "center", padding: 40, color: "#f87171" }}>Error: {error}</div>
      )}

      {data && !loading && (
        <>
          <div style={{ display: "flex", gap: 16, marginBottom: 18, alignItems: "flex-start" }}>
            <PLTable
              title={mesTitle}
              sub={mesSub}
              sliceKey="mes"
              year={year}
              currency={cur}
              countries={data.countries}
            />
            <PLTable
              title={perTitle}
              sub={perSub}
              sliceKey="period"
              year={year}
              currency={cur}
              countries={data.countries}
            />
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16,
                        marginBottom: 18 }}>
            <div style={S.card}>
              <div style={S.secT}>% Crecimiento vs periodo anterior</div>
              <div style={{ fontSize: 10, color: "#2a5a3a", marginBottom: 12 }}>
                Comparable entre paises -- expresado como porcentaje
              </div>
              <ResponsiveContainer width="100%" height={200}>
                <LineChart data={data.growthChart} margin={{ top: 0, right: 15, bottom: 0, left: 5 }}>
                  <CartesianGrid stroke={BD} strokeDasharray="3 3" />
                  <XAxis dataKey="label" tick={{ fill: "#555", fontSize: 9 }} />
                  <YAxis tickFormatter={(v: number) => v.toFixed(0) + "%"}
                    tick={{ fill: "#555", fontSize: 9 }} />
                  <ReferenceLine y={0} stroke="#333" strokeDasharray="4 2" />
                  <Tooltip
                    formatter={(v: unknown) =>
                      v != null ? [(v as number).toFixed(1) + "%"] : ["--"]}
                    contentStyle={{ background: "#1a1a2e", border: "1px solid #333",
                                    borderRadius: 8, fontSize: 11 }}
                  />
                  <Legend wrapperStyle={{ fontSize: 10, color: "#888" }} />
                  {CTRY.map((c) => (
                    <Line key={c} dataKey={c} name={c} stroke={CLR[c]}
                      strokeWidth={2} dot={false} connectNulls type="monotone" />
                  ))}
                </LineChart>
              </ResponsiveContainer>
            </div>
            <div style={S.card}>
              <div style={S.secT}>Margen UB % mensual -- MX &amp; AR</div>
              <div style={{ fontSize: 10, color: "#2a5a3a", marginBottom: 12 }}>
                UB / Ventas -- solo MX y AR (costo_venta disponible en Redshift)
              </div>
              <ResponsiveContainer width="100%" height={200}>
                <LineChart data={data.ubPctChart} margin={{ top: 0, right: 15, bottom: 0, left: 5 }}>
                  <CartesianGrid stroke={BD} strokeDasharray="3 3" />
                  <XAxis dataKey="label" tick={{ fill: "#555", fontSize: 9 }} />
                  <YAxis tickFormatter={(v: number) => v.toFixed(0) + "%"}
                    tick={{ fill: "#555", fontSize: 9 }} />
                  <Tooltip
                    formatter={(v: unknown) =>
                      v != null ? [(v as number).toFixed(1) + "%"] : ["--"]}
                    contentStyle={{ background: "#1a1a2e", border: "1px solid #333",
                                    borderRadius: 8, fontSize: 11 }}
                  />
                  <Legend wrapperStyle={{ fontSize: 10, color: "#888" }} />
                  <Line dataKey="MX" name="MX" stroke={CLR.MX} strokeWidth={2}
                    dot={false} connectNulls type="monotone" />
                  <Line dataKey="AR" name="AR" stroke={CLR.AR} strokeWidth={2}
                    dot={false} connectNulls type="monotone" />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div style={S.card}>
            <div style={{ ...S.secT, display: "flex", alignItems: "center",
                          justifyContent: "space-between" }}>
              <span>
                {cd?.has_costo ? "Ventas & UB" : "Ventas"} mensual -- {ctry}
                <span style={{ color: "#444", fontWeight: 400, marginLeft: 6 }}>
                  ({cd?.currency ?? ""})
                </span>
              </span>
              <div style={{ display: "flex", gap: 3 }}>
                {CTRY.map((c) => (
                  <button key={c} style={S.cBtn(c === ctry, CLR[c])}
                    onClick={() => setCtry(c)}>
                    {c}
                  </button>
                ))}
              </div>
            </div>
            <ResponsiveContainer width="100%" height={210}>
              <ComposedChart data={cd?.monthlyChart ?? []}
                margin={{ top: 5, right: 15, bottom: 0, left: 5 }}>
                <CartesianGrid stroke={BD} strokeDasharray="3 3" />
                <XAxis dataKey="label" tick={{ fill: "#555", fontSize: 10 }} />
                <YAxis tickFormatter={(v: number) => fmtM(v)}
                  tick={{ fill: "#555", fontSize: 10 }} />
                <Tooltip
                  formatter={(v: number, name: string) => [fmtM(v), name]}
                  contentStyle={{ background: "#1a1a2e", border: "1px solid #333",
                                  borderRadius: 8, fontSize: 12 }}
                />
                <Bar dataKey="ventas" name={"Ventas " + ctry} fill={CLR[ctry]} opacity={0.5} />
                {cd?.has_costo && (
                  <Bar dataKey="ub" name="UB" fill="#22c55e" opacity={0.85} />
                )}
                <Line dataKey="py_ventas" name={"" + (year - 1)}
                  type="monotone" stroke="#444" strokeDasharray="5 3"
                  strokeWidth={1.5} dot={false} />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </>
      )}
    </div>
  );
}