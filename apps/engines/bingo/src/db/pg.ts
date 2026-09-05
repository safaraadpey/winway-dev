import { Pool } from "pg";

const POOL_MAX = 4;
const IDLE_TIMEOUT_MS = 30_000;
const CONNECT_TIMEOUT_MS = 5_000;
const APPLICATION_NAME = "bingo-engine";

function describeConnection(connectionString: string): {
  host: string;
  port: string;
  mode: string;
} {
  try {
    const url = new URL(connectionString);
    const port = url.port || "5432";
    const mode =
      port === "6543" || url.searchParams.get("pgbouncer") === "true"
        ? "transaction-pooler"
        : port === "5432"
          ? "session-pooler"
          : "direct";
    return { host: url.hostname, port, mode };
  } catch {
    return { host: "unknown", port: "unknown", mode: "unknown" };
  }
}

function createPgPool(): Pool | null {
  const url = process.env.DATABASE_URL?.trim();
  if (!url) return null;

  const pool = new Pool({
    connectionString: url,
    ssl: { rejectUnauthorized: false },
    max: POOL_MAX,
    idleTimeoutMillis: IDLE_TIMEOUT_MS,
    connectionTimeoutMillis: CONNECT_TIMEOUT_MS,
    application_name: APPLICATION_NAME,
  });

  const { host, port, mode } = describeConnection(url);
  console.info("[Pool] service pool configured", {
    service: APPLICATION_NAME,
    max: POOL_MAX,
    application_name: APPLICATION_NAME,
    host,
    port,
    mode,
  });

  return pool;
}

export const pgPool: Pool | null = createPgPool();

export function getPgPool(): Pool | null {
  return pgPool;
}
