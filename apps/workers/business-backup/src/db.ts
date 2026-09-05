import { Pool, type PoolClient } from "pg";

const ssl = { rejectUnauthorized: false };
const IDLE_TIMEOUT_MS = 30_000;
const CONNECT_TIMEOUT_MS = 5_000;

function logPoolConfig(label: string, connectionString: string, max: number): void {
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
      service: label,
      max,
      application_name: "business-backup",
      host: dbUrl.hostname,
      port,
      mode,
    });
  } catch {
    console.info("[Pool] service pool configured", {
      service: label,
      max,
      application_name: "business-backup",
    });
  }
}

export function createProdPool(connectionString: string): Pool {
  const pool = new Pool({
    connectionString,
    ssl,
    max: 2,
    idleTimeoutMillis: IDLE_TIMEOUT_MS,
    connectionTimeoutMillis: CONNECT_TIMEOUT_MS,
    application_name: "business-backup",
  });
  logPoolConfig("business-backup-prod-read", connectionString, 2);
  pool.on("connect", (client) => {
    void client.query(`
      SET default_transaction_read_only = on;
      SET search_path = public, deposit, platform, tic_tac_toe, storage;
    `);
  });
  return pool;
}

export function createBackupPool(connectionString: string): Pool {
  logPoolConfig("business-backup-archive", connectionString, 4);
  return new Pool({
    connectionString,
    ssl,
    max: 4,
    idleTimeoutMillis: IDLE_TIMEOUT_MS,
    connectionTimeoutMillis: CONNECT_TIMEOUT_MS,
    application_name: "business-backup",
  });
}

export async function withProdReadOnly<T>(
  pool: Pool,
  fn: (client: PoolClient) => Promise<T>
): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN READ ONLY");
    const result = await fn(client);
    await client.query("COMMIT");
    return result;
  } catch (err) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw err;
  } finally {
    client.release();
  }
}

/** Advisory lock on backup DB only — key derived from 'winway_backup'. */
export const BACKUP_ADVISORY_LOCK_KEY = 880031001;

export async function tryBackupAdvisoryLock(client: PoolClient): Promise<boolean> {
  const { rows } = await client.query<{ locked: boolean }>(
    "SELECT pg_try_advisory_lock($1) AS locked",
    [BACKUP_ADVISORY_LOCK_KEY]
  );
  return rows[0]?.locked === true;
}

export async function releaseBackupAdvisoryLock(client: PoolClient): Promise<void> {
  await client.query("SELECT pg_advisory_unlock($1)", [BACKUP_ADVISORY_LOCK_KEY]);
}
