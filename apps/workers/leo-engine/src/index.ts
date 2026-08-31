import "dotenv/config";
import http from "node:http";
import { Pool } from "pg";
import { runLeoProcessorTick, runLeoSchedulerTick } from "./tick.js";

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

async function main(): Promise<void> {
  requireEnv("DATABASE_URL");
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
  });

  const httpPort = parsePositiveInt(process.env.LEO_ENGINE_HTTP_PORT, 8081);
  const schedulerMs = parsePositiveInt(process.env.LEO_SCHEDULER_INTERVAL_MS, 60_000);
  const processorMs = parsePositiveInt(process.env.LEO_PROCESSOR_INTERVAL_MS, 30_000);

  http
    .createServer((_req, res) => {
      res.writeHead(200, { "Content-Type": "text/plain" });
      res.end("leo-engine ok");
    })
    .listen(httpPort, () => {
      console.log("[Leo] health listening on", httpPort);
    });

  const runScheduler = async () => {
    try {
      const count = await runLeoSchedulerTick(pool);
      if (count > 0) console.log("[Leo] scheduler inserted", count);
    } catch (error) {
      console.error("[Leo] scheduler tick error", error);
    }
  };

  const runProcessor = async () => {
    try {
      const count = await runLeoProcessorTick(pool);
      if (count > 0) console.log("[Leo] processor processed", count);
    } catch (error) {
      console.error("[Leo] processor tick error", error);
    }
  };

  void runScheduler();
  void runProcessor();

  setInterval(() => void runScheduler(), schedulerMs);
  setInterval(() => void runProcessor(), processorMs);

  const shutdown = async () => {
    await pool.end();
    process.exit(0);
  };
  process.on("SIGINT", () => void shutdown());
  process.on("SIGTERM", () => void shutdown());
}

main().catch((error) => {
  console.error("[Leo] fatal", error);
  process.exit(1);
});
