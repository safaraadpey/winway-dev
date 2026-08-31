import { Pool, type PoolClient } from "pg";

const ssl = { rejectUnauthorized: false };

export function createProdPool(connectionString: string): Pool {
  const pool = new Pool({ connectionString, ssl, max: 2 });
  pool.on("connect", (client) => {
    void client.query(`
      SET default_transaction_read_only = on;
      SET application_name = 'winway-backup';
      SET search_path = public, deposit, platform, tic_tac_toe, storage;
    `);
  });
  return pool;
}

export function createBackupPool(connectionString: string): Pool {
  return new Pool({ connectionString, ssl, max: 4 });
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
