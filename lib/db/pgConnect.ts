import type { Pool, PoolClient } from "pg";
import { pgPool } from "@/lib/pg";
import { isPgPoolExhaustedError } from "@/lib/db/pgErrors";

export class PgConnectError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PgConnectError";
  }
}

const MAX_CONNECT_ATTEMPTS = 6;
const BASE_RETRY_DELAY_MS = 120;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function connectPgWithRetry(
  pool: Pool | null | undefined = pgPool
): Promise<PoolClient> {
  if (!pool) {
    throw new PgConnectError("DATABASE_URL is not configured");
  }

  let lastError: unknown;
  for (let attempt = 1; attempt <= MAX_CONNECT_ATTEMPTS; attempt += 1) {
    try {
      return await pool.connect();
    } catch (err) {
      lastError = err;
      if (!isPgPoolExhaustedError(err) || attempt === MAX_CONNECT_ATTEMPTS) {
        throw err;
      }
      await sleep(BASE_RETRY_DELAY_MS * attempt);
    }
  }

  throw lastError;
}
