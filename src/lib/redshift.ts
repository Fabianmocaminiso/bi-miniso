import { Pool } from "pg";

const pool = new Pool({
  host:     process.env.REDSHIFT_HOST,
  port:     Number(process.env.REDSHIFT_PORT) || 5439,
  database: process.env.REDSHIFT_DATABASE,
  user:     process.env.REDSHIFT_USER,
  password: process.env.REDSHIFT_PASSWORD,
  ssl:      { rejectUnauthorized: false },
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

