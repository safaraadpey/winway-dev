import "dotenv/config";
import http from "node:http";
import { Pool } from "pg";
import { nextProcessorDelayMs, parsePositiveInt } from "./processorSchedule.js";
import { runLeoProcessorTick, runLeoSchedulerTick } from "./tick.js";

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required env: ${name}`);
  return value;
}

/** Railway injects PORT; fall back to worker-specific env, then default. */
function resolveHttpPort(workerPortEnv: string | undefined, defaultPort: number): number {
  if (process.env.PORT) {
    const port = parseInt(process.env.PORT, 10);
    if (Number.isFinite(port) && port > 0) return port;
  }
  return parsePositiveInt(workerPortEnv, defaultPort);
}

async function main(): Promise<void> {
  requireEnv("DATABASE_URL");
  const connectionString = process.env.DATABASE_URL!;
  const pool = new Pool({
    connectionString,
    ssl: { rejectUnauthorized: false },
    max: 2,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 5_000,
    application_name: "leo-engine",
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
      service: "leo-engine",
      max: 2,
      application_name: "leo-engine",
      host: dbUrl.hostname,
      port,
      mode,
    });
  } catch {
    console.log("[Pool] service pool configured", {
      service: "leo-engine",
      max: 2,
      application_name: "leo-engine",
    });
  }

  const httpPort = resolveHttpPort(process.env.LEO_ENGINE_HTTP_PORT, 8081);
  const schedulerMs = parsePositiveInt(process.env.LEO_SCHEDULER_INTERVAL_MS, 60_000);

  http
    .createServer((_req, res) => {
      res.writeHead(200, { "Content-Type": "text/plain" });
      res.end("leo-engine ok");
    })
    .listen(httpPort, "0.0.0.0", () => {
      console.log("[Leo] health listening on", { port: httpPort, host: "0.0.0.0" });
    });

  const runScheduler = async () => {
    try {
      const count = await runLeoSchedulerTick(pool);
      if (count > 0) console.log("[Leo] scheduler inserted", count);
    } catch (error) {
      console.error("[Leo] scheduler tick error", error);
    }
  };

  const runProcessorLoop = async () => {
    try {
      const count = await runLeoProcessorTick(pool);
      if (count > 0) console.log("[Leo] processor processed", count);
    } catch (error) {
      console.error("[Leo] processor tick error", error);
    }
    const delayMs = nextProcessorDelayMs();
    setTimeout(() => void runProcessorLoop(), delayMs);
  };

  console.log("[Leo] processor interval random 15-40s (LEO_PROCESSOR_INTERVAL_MIN_MS / MAX_MS)");

  void runScheduler();
  void runProcessorLoop();

  setInterval(() => void runScheduler(), schedulerMs);

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
