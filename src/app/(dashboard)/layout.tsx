"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ReactNode } from "react";

const NAV = [
  { href: "/cabina",      label: "Cabina de Control",  badge: "live" },
  { href: "/ventas",      label: "Ventas",              badge: "dev"  },
  { href: "/finanzas",    label: "Finanzas / P&L",      badge: "dev"  },
  { href: "/inventario",  label: "Inventario",           badge: ""     },
  { href: "/operaciones", label: "Operaciones",          badge: ""     },
  { href: "/marketing",   label: "Marketing",            badge: ""     },
];

const BADGE: Record<string, React.CSSProperties> = {
  live: { fontSize: 9, padding: "1px 5px", borderRadius: 8,
          background: "#0f2e1a", color: "#4ade80", border: "1px solid #1B6B35" },
  dev:  { fontSize: 9, padding: "1px 5px", borderRadius: 8,
          background: "#2e1f0a", color: "#fbbf24", border: "1px solid #92400e" },
};

export default function DashboardLayout({ children }: { children: ReactNode }) {
  const path = usePathname();
  return (
    <div style={{ display: "flex", height: "100vh", background: "#0f0f1a",
                  color: "#e0e0e0", fontFamily: "'Segoe UI', sans-serif", overflow: "hidden" }}>
      <aside style={{ width: 220, flexShrink: 0, background: "#13131f",
        borderRight: "1px solid #1e1e2e", padding: "16px 10px",
        display: "flex", flexDirection: "column" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10,
                      paddingBottom: 18, marginBottom: 18, borderBottom: "1px solid #1e1e2e" }}>
          <div style={{ width: 32, height: 32, background: "#C8102E", borderRadius: 8,
                        display: "flex", alignItems: "center", justifyContent: "center",
                        color: "#fff", fontWeight: 800, fontSize: 15, flexShrink: 0 }}>M</div>
          <div>
            <div style={{ color: "#fff", fontWeight: 700, fontSize: 13 }}>BI MINISO</div>
            <div style={{ color: "#444", fontSize: 10 }}>LATAM Analytics</div>
          </div>
        </div>
        <nav style={{ flex: 1, display: "flex", flexDirection: "column", gap: 2 }}>
          {NAV.map(({ href, label, badge }) => {
            const active   = path === href || path.startsWith(href + "/");
            const disabled = badge === "";
            return (
              <Link key={href} href={disabled ? "#" : href}
                onClick={disabled ? (e) => e.preventDefault() : undefined}
                style={{ display: "flex", alignItems: "center", gap: 8,
                  padding: "9px 12px", borderRadius: 8, textDecoration: "none",
                  background:  active ? "#1a1a2e" : "transparent",
                  borderLeft:  active ? "3px solid #C8102E" : "3px solid transparent",
                  color:       disabled ? "#444" : active ? "#fff" : "#888",
                  fontSize: 12, fontWeight: active ? 600 : 400,
                  cursor: disabled ? "not-allowed" : "pointer" }}>
                <span style={{ flex: 1 }}>{label}</span>
                {badge && <span style={BADGE[badge]}>{badge === "live" ? "Live" : "Dev"}</span>}
              </Link>
            );
          })}
        </nav>
        <div style={{ fontSize: 10, color: "#2a2a3a", textAlign: "center",
                      paddingTop: 12, borderTop: "1px solid #1e1e2e" }}>
          MINISO LATAM &copy; 2026
        </div>
      </aside>
      <main style={{ flex: 1, overflow: "auto", background: "#0f0f1a" }}>{children}</main>
    </div>
  );
}