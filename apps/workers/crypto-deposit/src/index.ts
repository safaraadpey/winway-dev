/**
 * Crypto deposit scanner worker (Railway Nixpacks / Node).
 *
 * Hot+Confirm ~15s · Warm ~30s · Cold ~6h — @dingmoney/deposit-core
 * Optional manual trigger remains on Vercel: /api/cron/crypto-scan-*.
 */
import "dotenv/config";
import http from "node:http";
import { Pool } from "pg";

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required env: ${name}`);
  return value;
}

function parsePositiveInt(raw: string | undefined, fallback: number): number {
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) return fallback;
  return Math.floor(n);
}

/** Railway injects PORT; fall back to worker-specific env, then default. */
function resolveHttpPort(workerPortEnv: string | undefined, defaultPort: number): number {
  if (process.env.PORT) {
    const port = parseInt(process.env.PORT, 10);
    if (Number.isFinite(port) && port > 0) return port;
  }
  return parsePositiveInt(workerPortEnv, defaultPort);
}

/** Crash-recovery lock TTL: slightly above interval, never blocks the next tick after finally-del. */
function crashLockTtlSec(intervalMs: number, envRaw: string | undefined): number {
  const fallback = Math.max(30, Math.ceil((intervalMs / 1000) * 3));
  return parsePositiveInt(envRaw, fallback);
}

async function ensureNodeWebSocket(): Promise<void> {
  if (typeof (globalThis as { WebSocket?: unknown }).WebSocket !== "undefined") {
    return;
  }
  const { default: WS } = await import("ws");
  (globalThis as { WebSocket: unknown }).WebSocket = WS;
}

async function main(): Promise<void> {
  await ensureNodeWebSocket();

  if (!process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_URL) {
    process.env.NEXT_PUBLIC_SUPABASE_URL = process.env.SUPABASE_URL;
  }
  requireEnv("NEXT_PUBLIC_SUPABASE_URL");
  requireEnv("SUPABASE_SERVICE_ROLE_KEY");
  requireEnv("DATABASE_URL");

  const { startCryptoScanners } = await import("./scheduler.js");

  const connectionString = requireEnv("DATABASE_URL");
  // deposit-core mapPool uses DEFAULT_CONCURRENCY=4 per scan tick.
  const pool = new Pool({
    connectionString,
    ssl: { rejectUnauthorized: false },
    max: 4,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 5_000,
    application_name: "crypto-deposit",
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
    console.log("[Pool] service pool configured", {
      service: "crypto-deposit",
      max: 4,
      application_name: "crypto-deposit",
      host: dbUrl.hostname,
      port,
      mode,
    });
  } catch {
    console.log("[Pool] service pool configured", {
      service: "crypto-deposit",
      max: 4,
      application_name: "crypto-deposit",
    });
  }

  const httpPort = resolveHttpPort(process.env.CRYPTO_DEPOSIT_HTTP_PORT, 8080);

  // Prefer new env names; fall back to legacy CRYPTO_ACTIVE_SCAN_INTERVAL_MS.
  const hotConfirmIntervalMs = parsePositiveInt(
    process.env.CRYPTO_HOT_CONFIRM_SCAN_INTERVAL_MS ??
      process.env.CRYPTO_ACTIVE_SCAN_INTERVAL_MS,
    15_000
  );
  const warmIntervalMs = parsePositiveInt(
    process.env.CRYPTO_WARM_SCAN_INTERVAL_MS,
    30_000
  );
  const fullIntervalMs = parsePositiveInt(
    process.env.CRYPTO_FULL_SCAN_INTERVAL_MS,
    6 * 60 * 60 * 1000
  );
  const fullPageSize = Math.min(
    500,
    parsePositiveInt(process.env.CRYPTO_FULL_SCAN_PAGE_SIZE, 200)
  );

  const hotConfirmLockTtlSec = crashLockTtlSec(
    hotConfirmIntervalMs,
    process.env.CRYPTO_HOT_CONFIRM_SCAN_LOCK_TTL_SEC ??
      process.env.CRYPTO_ACTIVE_SCAN_LOCK_TTL_SEC
  );
  const warmLockTtlSec = crashLockTtlSec(
    warmIntervalMs,
    process.env.CRYPTO_WARM_SCAN_LOCK_TTL_SEC
  );
  const fullLockTtlSec = parsePositiveInt(
    process.env.CRYPTO_FULL_SCAN_LOCK_TTL_SEC,
    3600
  );

  const server = http.createServer((req, res) => {
    if (req.url === "/health" || req.url === "/ready") {
      res.writeHead(200, { "content-type": "application/json" });
      res.end(
        JSON.stringify({
          ok: true,
          service: "crypto-deposit-worker",
          hotConfirmIntervalMs,
          warmIntervalMs,
          fullIntervalMs,
        })
      );
      return;
    }
    res.writeHead(404);
    res.end();
  });

  await new Promise<void>((resolve) => {
    server.listen(httpPort, "0.0.0.0", () => {
      console.log("[Payment] crypto-deposit-worker listening", { httpPort, host: "0.0.0.0" });
      resolve();
    });
  });

  const stopScanners = startCryptoScanners(pool, {
    hotConfirmIntervalMs,
    warmIntervalMs,
    fullIntervalMs,
    fullPageSize,
    hotConfirmLockTtlSec,
    warmLockTtlSec,
    fullLockTtlSec,
  });

  const shutdown = async (signal: string) => {
    console.log("[Payment] crypto-deposit-worker shutting down", { signal });
    stopScanners();
    server.close();
    await pool.end().catch(() => undefined);
    process.exit(0);
  };

  process.on("SIGTERM", () => void shutdown("SIGTERM"));
  process.on("SIGINT", () => void shutdown("SIGINT"));
}

main().catch((err) => {
  console.error("[Payment] crypto-deposit-worker failed to start", err);
  process.exit(1);
});
