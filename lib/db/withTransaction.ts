import type { PoolClient } from "pg";
import { pgPool } from "@/lib/pg";
import { connectPgWithRetry } from "@/lib/db/pgConnect";

export class TransactionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TransactionError";
  }
}

export async function withTransaction<T>(
  fn: (client: PoolClient) => Promise<T>
): Promise<T> {
  if (!pgPool) {
    throw new TransactionError("DATABASE_URL is not configured");
  }

  const client = await connectPgWithRetry(pgPool);
  try {
    await client.query("BEGIN");
    const result = await fn(client);
    await client.query("COMMIT");
    return result;
  } catch (err) {
    try {
      await client.query("ROLLBACK");
    } catch {
      // ignore rollback failures on broken connections
    }
    throw err;
  } finally {
    client.release();
  }
}
