import pg from "pg";
import { config } from "./config.mjs";

const { Pool } = pg;

/** @type {import('pg').Pool | null} */
let pool = null;

export function getPool() {
  if (!config.databaseUrl) {
    throw new Error(
      "DATABASE_URL is required for shadow regression (platform.* is not exposed via PostgREST)."
    );
  }
  if (!pool) {
    pool = new Pool({
      connectionString: config.databaseUrl,
      ssl: { rejectUnauthorized: false },
      max: 4,
    });
  }
  return pool;
}

/**
 * @param {string} text
 * @param {unknown[]} [params]
 */
export async function query(text, params = []) {
  return getPool().query(text, params);
}

/**
 * @param {(client: import('pg').PoolClient) => Promise<T>} fn
 * @template T
 */
export async function withClient(fn) {
  const client = await getPool().connect();
  try {
    return await fn(client);
  } finally {
    client.release();
  }
}

export async function closePool() {
  if (pool) {
    await pool.end();
    pool = null;
  }
}
