/**
 * Crypto deposit scanner worker (Railway Nixpacks / Node).
 *
 * Runs lib/deposit/cryptoMonitor on intervals — no duplicated scan logic.
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

/** Match bingo-engine: Node 20 has no global WebSocket; supabase-js Realtime needs one. */
async function ensureNodeWebSocket(): Promise<void> {
  if (typeof (globalThis as { WebSocket?: unknown }).WebSocket !== "undefined") {
    return;
  }
  const { default: WS } = await import("ws");
  (globalThis as { WebSocket: unknown }).WebSocket = WS;
}

async function main(): Promise<void> {
  await ensureNodeWebSocket();

  // supabaseServer (notify path) expects these names — set before importing lib/deposit.
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_URL) {
    process.env.NEXT_PUBLIC_SUPABASE_URL = process.env.SUPABASE_URL;
  }
  requireEnv("NEXT_PUBLIC_SUPABASE_URL");
  requireEnv("SUPABASE_SERVICE_ROLE_KEY");
  requireEnv("DATABASE_URL");

  const { startCryptoScanners } = await import("./scheduler.js");

  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
  });

  const httpPort = parsePositiveInt(process.env.CRYPTO_DEPOSIT_HTTP_PORT, 8080);
  const activeIntervalMs = parsePositiveInt(
    process.env.CRYPTO_ACTIVE_SCAN_INTERVAL_MS,
    120_000
  );
  const fullIntervalMs = parsePositiveInt(
    process.env.CRYPTO_FULL_SCAN_INTERVAL_MS,
    6 * 60 * 60 * 1000
  );
  const fullPageSize = Math.min(
    500,
    parsePositiveInt(process.env.CRYPTO_FULL_SCAN_PAGE_SIZE, 200)
  );
  const activeLockTtlSec = parsePositiveInt(
    process.env.CRYPTO_ACTIVE_SCAN_LOCK_TTL_SEC,
    Math.max(60, Math.ceil(activeIntervalMs / 1000) - 5)
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
          activeIntervalMs,
          fullIntervalMs,
        })
      );
      return;
    }
    res.writeHead(404);
    res.end();
  });

  await new Promise<void>((resolve) => {
    server.listen(httpPort, () => {
      console.log("[Payment] crypto-deposit-worker listening", { httpPort });
      resolve();
    });
  });

  const stopScanners = startCryptoScanners(pool, {
    activeIntervalMs,
    fullIntervalMs,
    fullPageSize,
    activeLockTtlSec,
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
