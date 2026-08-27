import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";

// Ago 21, 2026 — timeout y reintentos explícitos. Antes, si la API no respondía,
// la petición se quedaba colgada más de 20 s sin devolver nada al usuario.
const client = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
  timeout: 30_000,
  maxRetries: 1,
});


const NOMBRE_PAIS: Record<string, string> = {
  MX: "México", CO: "Colombia", PE: "Perú", CL: "Chile", AR: "Argentina",
};

// Contexto a partir del área que el usuario está viendo en la Cabina.
// Se envían solo los campos con dato y se declara el mes real de cada país,
// porque las vistas no están todas al mismo corte.
function contextoArea(
  area: string,
  datos: Record<string, Record<string, number | string | null>>,
  periodoPorPais: Record<string, string>,
  paisesVisibles: string[],
): string {
  const paises = (paisesVisibles?.length ? paisesVisibles : Object.keys(datos || {}))
    .filter((p) => datos?.[p]);
  if (!paises.length) return "";

  let ctx = `Datos de la Cabina de Control de MINISO — área de ${area}.\n`;
  ctx += `Aviso: cada país puede estar cargado a un mes distinto; se indica abajo.\n`;
  ctx += `Los importes están en la moneda local de cada país, así que no se suman entre sí.\n\n`;

  for (const p of paises) {
    const fila = datos[p];
    const conDato = Object.keys(fila).filter((k) => fila[k] !== null && fila[k] !== "");
    if (!conDato.length) continue;
    const vacios = Object.keys(fila).length - conDato.length;
    ctx += `${NOMBRE_PAIS[p] || p} — período ${periodoPorPais?.[p] || "no declarado"}:\n`;
    for (const k of conDato) ctx += `  ${k}: ${fila[k]}\n`;
    if (vacios > 0) ctx += `  (${vacios} indicadores sin dato en el origen para este período)\n`;
    ctx += "\n";
  }
  return ctx;
}

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
  const body = await request.json();
  const { pregunta, kpis, pais, area, datos, periodoPorPais, paisesVisibles } = body;

  // Formato nuevo: el front manda el área visible. Se conserva el anterior por compatibilidad.
  const contexto = area && datos
    ? contextoArea(area, datos, periodoPorPais, paisesVisibles)
    : buildContexto(kpis, pais ?? "MINISO LATAM");

  if (!contexto.trim()) {
    return NextResponse.json({
      respuesta: "No hay datos cargados para el área y el período que estás viendo, así que no puedo responder sobre ellos. Revisa el aviso de período arriba de la tabla.",
    });
  }

  try {
    const message = await client.messages.create({
      model: "claude-sonnet-5",
      max_tokens: 768,
      system: `Eres el asistente de Business Intelligence de MINISO Mexico y LATAM.
Analizas KPIs financieros y de ventas para la Cabina de Control del CFO.
Eres conciso, directo y usas terminologia financiera apropiada.
Cuando compares paises, senala claramente el lider y el rezagado.
Si un pais tiene indicadores sin dato, dilo en lugar de asumir que valen cero.
Nunca sumes importes de paises distintos: cada uno esta en su moneda local.
Si los paises estan a meses distintos, advierte que la comparacion no es directa.
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
