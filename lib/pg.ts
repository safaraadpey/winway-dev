import { Pool } from "pg";

declare global {
  // eslint-disable-next-line no-var
  var __pgPool: Pool | undefined;
}

function createPgPool(): Pool | null {
  if (!process.env.DATABASE_URL) {
    return null;
  }

  return new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
  });
}

export const pgPool = global.__pgPool ?? createPgPool();

if (process.env.NODE_ENV !== "production" && pgPool) {
  global.__pgPool = pgPool;
}
