import { Pool } from "pg";
import { logServicePoolConfig } from "@/lib/db/poolObservability";

declare global {
  // eslint-disable-next-line no-var
  var __pgPool: Pool | undefined;
  // eslint-disable-next-line no-var
  var __pgPoolConnectionString: string | undefined;
}

/**
 * Supabase session pooler (5432) caps concurrent clients (~15).
 * Next.js dev opens many parallel API routes — prefer transaction pooler (6543).
 */
export function normalizePgConnectionString(connectionString: string): string {
  try {
    const url = new URL(connectionString);

    if (!url.hostname.includes("supabase.co")) {
      return connectionString;
    }

    if (url.port === "6543") {
      if (!url.searchParams.has("pgbouncer")) {
        url.searchParams.set("pgbouncer", "true");
      }
      return url.toString();
    }

    if (!url.port || url.port === "5432") {
      url.port = "6543";
    }

    if (!url.searchParams.has("pgbouncer")) {
      url.searchParams.set("pgbouncer", "true");
    }

    return url.toString();
  } catch {
    return connectionString;
  }
}

function createPgPool(): Pool | null {
  const raw = process.env.DATABASE_URL;
  if (!raw) {
    return null;
  }

  const connectionString = normalizePgConnectionString(raw);
  const usesTransactionPooler = connectionString.includes(":6543");

  return new Pool({
    connectionString,
    ssl: { rejectUnauthorized: false },
    max: usesTransactionPooler ? 10 : 3,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 10_000,
    application_name: "vercel-api",
  });
}

const normalizedConnectionString = process.env.DATABASE_URL
  ? normalizePgConnectionString(process.env.DATABASE_URL)
  : null;

if (normalizedConnectionString) {
  logServicePoolConfig("vercel-api", {
    connectionString: normalizedConnectionString,
    max: normalizedConnectionString.includes(":6543") ? 10 : 3,
    application_name: "vercel-api",
  });
}

if (
  process.env.NODE_ENV !== "production" &&
  global.__pgPool &&
  global.__pgPoolConnectionString &&
  normalizedConnectionString &&
  global.__pgPoolConnectionString !== normalizedConnectionString
) {
  void global.__pgPool.end().catch(() => {});
  global.__pgPool = undefined;
}

export const pgPool =
  global.__pgPool ??
  (normalizedConnectionString ? createPgPool() : null);

if (process.env.NODE_ENV !== "production" && pgPool && normalizedConnectionString) {
  global.__pgPool = pgPool;
  global.__pgPoolConnectionString = normalizedConnectionString;
}
