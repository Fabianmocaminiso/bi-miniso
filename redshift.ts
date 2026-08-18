// ─────────────────────────────────────────────────────────────────────────────
// src/lib/redshift.ts
//
// Conexión de solo lectura al data lake. Cambio de Ago 18, 2026 (riesgo R-07 del
// documento de arquitectura): antes iba `rejectUnauthorized: false`, que cifra el
// tráfico pero NO verifica la identidad del servidor. Ahora se valida contra el
// certificado raíz de AWS.
//
// Requiere el archivo del certificado en el servidor:
//   C:\bi-miniso\certs\redshift-ca-bundle.crt
//   (descarga oficial: https://docs.aws.amazon.com/redshift/latest/mgmt/connecting-ssl-support.html)
//
// Si la variable REDSHIFT_CA no está definida o el archivo no existe, la conexión
// cae al comportamiento anterior y deja un aviso en el log. Así el despliegue no
// tumba la Cabina si el certificado todavía no se copió al servidor.
// ─────────────────────────────────────────────────────────────────────────────
import { Pool } from "pg";
import { readFileSync, existsSync } from "fs";

function tls() {
  const ruta = process.env.REDSHIFT_CA;
  if (ruta && existsSync(ruta)) {
    return { ca: readFileSync(ruta).toString(), rejectUnauthorized: true };
  }
  console.warn(
    "[redshift] REDSHIFT_CA no configurada o archivo inexistente. " +
    "La conexión va cifrada pero sin validar el certificado del servidor (riesgo R-07)."
  );
  return { rejectUnauthorized: false };
}

const pool = new Pool({
  host:     process.env.REDSHIFT_HOST,
  port:     Number(process.env.REDSHIFT_PORT) || 5439,
  database: process.env.REDSHIFT_DATABASE,
  user:     process.env.REDSHIFT_USER,
  password: process.env.REDSHIFT_PASSWORD,
  ssl:      tls(),
  max: 5,
  idleTimeoutMillis: 30000,
});

export async function query(sql: string, params?: unknown[]) {
  const client = await pool.connect();
  try {
    const result = await client.query(sql, params);
    return result.rows;
  } finally {
    client.release();
  }
}
