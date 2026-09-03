/**
 * Business backup worker — daily archive to winway_backup (Production read-only).
 */
import "dotenv/config";
import http from "node:http";
import { executeBackupRun } from "./run.js";
import { startDailyScheduler } from "./scheduler.js";

function requireEnv(name: string): string {
  const value = process.env[name]?.trim();
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

function parseBool(raw: string | undefined, fallback: boolean): boolean {
  if (raw === undefined) return fallback;
  return raw === "1" || raw.toLowerCase() === "true" || raw.toLowerCase() === "yes";
}

async function main(): Promise<void> {
  const config = {
    prodDatabaseUrl: requireEnv("PROD_DATABASE_URL"),
    backupDatabaseUrl: requireEnv("BACKUP_DATABASE_URL"),
    storage: {
      prodUrl: requireEnv("PROD_SUPABASE_URL"),
      prodServiceKey: requireEnv("PROD_SUPABASE_SERVICE_ROLE_KEY"),
      backupUrl: requireEnv("BACKUP_SUPABASE_URL"),
      backupServiceKey: requireEnv("BACKUP_SUPABASE_SERVICE_ROLE_KEY"),
    },
    batchSize: parsePositiveInt(process.env.BACKUP_BATCH_SIZE, 5000),
    staleRunMinutes: parsePositiveInt(process.env.BACKUP_STALE_RUN_MINUTES, 60),
    heartbeatIntervalMs: parsePositiveInt(
      process.env.BACKUP_HEARTBEAT_INTERVAL_MS,
      30_000
    ),
  };

  const cronHour = parsePositiveInt(process.env.BACKUP_CRON_HOUR, 5);
  const cronMinute = parsePositiveInt(process.env.BACKUP_CRON_MINUTE, 0);
  const runOnStart = parseBool(process.env.BACKUP_RUN_ON_START, false);

  const httpPort = resolveHttpPort(process.env.BACKUP_HTTP_PORT, 8080);
  http
    .createServer((_req, res) => {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ ok: true, service: "business-backup" }));
    })
    .listen(httpPort, "0.0.0.0", () => {
      console.log("[Backup] health listening", { port: httpPort, host: "0.0.0.0" });
    });

  await startDailyScheduler(
    { hour: cronHour, minute: cronMinute, runOnStart },
    () => executeBackupRun(config)
  );
}

main().catch((err) => {
  console.error("[Backup] fatal", err);
  process.exit(1);
});
