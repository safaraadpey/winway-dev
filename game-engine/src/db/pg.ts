import { Pool } from "pg";

function createPgPool(): Pool | null {
  const url = process.env.DATABASE_URL?.trim();
  if (!url) return null;

  return new Pool({
    connectionString: url,
    ssl: { rejectUnauthorized: false },
  });
}

export const pgPool: Pool | null = createPgPool();

export function getPgPool(): Pool | null {
  return pgPool;
}
