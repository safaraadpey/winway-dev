import { Pool, type PoolClient } from "pg";

const ssl = { rejectUnauthorized: false };

/** Advisory lock key for performance snapshot worker. */
export const SNAPSHOT_ADVISORY_LOCK_KEY = 880031002;

export function createPool(connectionString: string): Pool {
  const pool = new Pool({
    connectionString,
    ssl,
    max: 2,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 5_000,
    application_name: "performance-snapshot",
  });

  try {
    const dbUrl = new URL(connectionString);
    const port = dbUrl.port || "5432";
    const mode =
      port === "6543" || dbUrl.searchParams.get("pgbouncer") === "true"
        ? "transaction-pooler"
        : port === "5432"
          ? "session-pooler"
          : "direct";
    console.info("[Pool] service pool configured", {
      service: "performance-snapshot",
      max: 2,
      application_name: "performance-snapshot",
      host: dbUrl.hostname,
      port,
      mode,
    });
  } catch {
    console.info("[Pool] service pool configured", {
      service: "performance-snapshot",
      max: 2,
      application_name: "performance-snapshot",
    });
  }

  return pool;
}

export async function tryAdvisoryLock(client: PoolClient): Promise<boolean> {
  const { rows } = await client.query<{ locked: boolean }>(
    "SELECT pg_try_advisory_lock($1) AS locked",
    [SNAPSHOT_ADVISORY_LOCK_KEY]
  );
  return rows[0]?.locked === true;
}

export async function releaseAdvisoryLock(client: PoolClient): Promise<void> {
  await client.query("SELECT pg_advisory_unlock($1)", [SNAPSHOT_ADVISORY_LOCK_KEY]);
}
