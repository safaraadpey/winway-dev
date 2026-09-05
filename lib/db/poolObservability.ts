import type { PoolConfig } from "pg";

/** Conservative Railway/worker defaults — no transaction semantics impact. */
export const SERVICE_POOL_IDLE_TIMEOUT_MS = 30_000;
export const SERVICE_POOL_CONNECT_TIMEOUT_MS = 5_000;

export type PoolConnectionMode = "transaction-pooler" | "session-pooler" | "direct" | "unknown";

export function describePgConnectionString(connectionString: string): {
  host: string;
  port: string;
  mode: PoolConnectionMode;
  usesPgbouncerParam: boolean;
} {
  try {
    const url = new URL(connectionString);
    const port = url.port || "5432";
    const usesPgbouncerParam = url.searchParams.get("pgbouncer") === "true";

    let mode: PoolConnectionMode = "unknown";
    if (port === "6543" || usesPgbouncerParam) {
      mode = "transaction-pooler";
    } else if (port === "5432") {
      mode = "session-pooler";
    } else if (port === "5432" || !url.hostname.includes("supabase.co")) {
      mode = url.hostname.includes("pooler") ? "session-pooler" : "direct";
    }

    return { host: url.hostname, port, mode, usesPgbouncerParam };
  } catch {
    return { host: "unknown", port: "unknown", mode: "unknown", usesPgbouncerParam: false };
  }
}

export function logServicePoolConfig(
  service: string,
  config: Pick<PoolConfig, "max" | "application_name"> & { connectionString: string }
): void {
  const { host, port, mode } = describePgConnectionString(config.connectionString);
  console.info("[Pool] service pool configured", {
    service,
    max: config.max,
    application_name: config.application_name,
    host,
    port,
    mode,
  });
}
