/**
 * Performance snapshot worker — closes prior 08:00–08:00 Asia/Tehran accounting day.
 */
import "dotenv/config";
import http from "node:http";
import { executeSnapshotRun } from "./run.js";
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
  const cronHour = parsePositiveInt(process.env.SNAPSHOT_CRON_HOUR, 8);
  const cronMinute = parsePositiveInt(process.env.SNAPSHOT_CRON_MINUTE, 5);
  const runOnStart = parseBool(process.env.SNAPSHOT_RUN_ON_START, false);
  const snapshotDateOverride = process.env.SNAPSHOT_DATE?.trim() || null;

  const httpPort = resolveHttpPort(process.env.SNAPSHOT_HTTP_PORT, 8081);
  http
    .createServer((_req, res) => {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ ok: true, service: "performance-snapshot" }));
    })
    .listen(httpPort, "0.0.0.0", () => {
      console.log("[PerformanceSnapshot] health listening", { port: httpPort, host: "0.0.0.0" });
    });

  const databaseUrl = requireEnv("DATABASE_URL");

  await startDailyScheduler({ hour: cronHour, minute: cronMinute, runOnStart }, () =>
    executeSnapshotRun({
      databaseUrl,
      snapshotDate: snapshotDateOverride,
    }).then((result) => {
      if (!result) return;
      if (result.status !== "succeeded") {
        throw new Error(`Snapshot run status: ${result.status}`);
      }
    })
  );
}

main().catch((err) => {
  console.error("[PerformanceSnapshot] fatal", err);
  process.exit(1);
});
