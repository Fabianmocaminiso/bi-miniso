import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";

// Ago 21, 2026 — timeout y reintentos explícitos. Antes, si la API no respondía,
// la petición se quedaba colgada más de 20 s sin devolver nada al usuario.
const client = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
  timeout: 30_000,
  maxRetries: 1,
});

function buildContexto(kpis: unknown, pais: string): string {
  if (!kpis) return "No hay datos disponibles.";

  // Si es un objeto multi-pais (Cabina de Control)
  if (typeof kpis === "object" && kpis !== null && !("facturacion_total" in kpis)) {
    const data = kpis as Record<string, Record<string, number | null>>;
    const paises = ["MX", "CO", "PE", "CL", "AR"];
    let ctx = `Datos de la Cabina de Control MINISO — ${pais}:\n\n`;
    for (const p of paises) {
      const row = data[p];
      if (!row) continue;
      if ("error" in row) {
        ctx += `${p}: ERROR al obtener datos\n`;
        continue;
      }
      ctx += `${p}:\n`;
      if (row.num_tiendas != null)       ctx += `  - Tiendas activas: ${row.num_tiendas}\n`;
      if (row.facturacion_total != null)  ctx += `  - Facturación total: $${Number(row.facturacion_total).toLocaleString("es-MX")}\n`;
      if (row.costo_ventas != null)       ctx += `  - Costo de ventas: $${Number(row.costo_ventas).toLocaleString("es-MX")}\n`;
      if (row.utilidad_bruta != null)     ctx += `  - Utilidad bruta: $${Number(row.utilidad_bruta).toLocaleString("es-MX")}\n`;
      if (row.margen_ub != null)          ctx += `  - Margen UB: ${Number(row.margen_ub).toFixed(1)}%\n`;
      if (row.piezas != null)             ctx += `  - Piezas vendidas: ${Number(row.piezas).toLocaleString("es-MX")}\n`;
      if (row.ticket_promedio != null)    ctx += `  - Ticket promedio: $${Number(row.ticket_promedio).toFixed(2)}\n`;
      ctx += "\n";
    }
    return ctx;
  }

  // Un solo país (dashboard viejo)
  const k = kpis as Record<string, number | null>;
  return `Datos actuales de ${pais}:
- Facturación total: $${k.facturacion_total?.toLocaleString("es-MX") ?? "—"}
- Facturación mismas tiendas: $${k.facturacion_mt?.toLocaleString("es-MX") ?? "—"}
- Utilidad bruta: $${k.utilidad_bruta?.toLocaleString("es-MX") ?? "—"}
- Margen UB: ${k.margen_ub != null ? `${Number(k.margen_ub).toFixed(1)}%` : "—"}
- Tiendas activas: ${k.num_tiendas ?? "—"}`;
}

export async function POST(request: Request) {
  const { pregunta, kpis, pais } = await request.json();

  const contexto = buildContexto(kpis, pais ?? "MINISO LATAM");

  try {
    const message = await client.messages.create({
      model: "claude-sonnet-5",
      max_tokens: 768,
      system: `Eres el asistente de Business Intelligence de MINISO Mexico y LATAM.
Analizas KPIs financieros y de ventas para la Cabina de Control del CFO.
Eres conciso, directo y usas terminologia financiera apropiada.
Cuando compares paises, senala claramente el lider y el rezagado.
Siempre respondes en espanol. Maximo 200 palabras.`,
      messages: [
        {
          role: "user",
          content: `${contexto}\n\nPregunta: ${pregunta}`,
        },
      ],
    });

    const respuesta =
      message.content[0].type === "text" ? message.content[0].text : "";
    return NextResponse.json({ respuesta });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Error al llamar a Claude";
    console.error("[api/claude]", msg);   // queda en el log del servidor
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
