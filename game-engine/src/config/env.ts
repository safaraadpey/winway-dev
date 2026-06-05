export type GameRuntime = "legacy_db" | "hybrid" | "engine";
export type EngineRole =
  | "scheduler"
  | "draw-processor"
  | "tournament-orchestrator";

export interface EngineConfig {
  supabaseUrl: string;
  supabaseServiceRoleKey: string;
  /** Upstash Redis protocol URL (rediss://...) — preferred for long-running workers */
  redisUrl: string | null;
  /** Upstash REST — alternative to REDIS_URL */
  upstashRestUrl: string | null;
  upstashRestToken: string | null;
  roles: Set<EngineRole>;
  runtime: GameRuntime;
  httpPort: number;
  /** When true, serve the command API (and /health) instead of /health only. */
  apiEnabled: boolean;
  logLevel: string;
  drawProcessorIntervalMs: number;
  drawProcessorBatchSize: number;
  /** Max pick→process loops per tick (drain depth). */
  drawProcessorMaxBatchesPerTick: number;
  /** Requeue a failing job until attempts hits this, then park as 'failed'. */
  drawProcessorMaxAttempts: number;
  /** TTL (seconds) for the draw-processor Redis leader lock. */
  drawProcessorLockTtlSec: number;
  /** Max rooms whose draw_jobs drain in parallel per batch (serial within a room). */
  drawProcessorRoomConcurrency: number;
  roomSchedulerIntervalMs: number;
  tournamentTickIntervalMs: number;
  tournamentTickBatchLimit: number;
}

function parseRoles(raw: string | undefined): Set<EngineRole> {
  const allowed: EngineRole[] = [
    "scheduler",
    "draw-processor",
    "tournament-orchestrator",
  ];
  const set = new Set<EngineRole>();
  for (const part of (raw ?? "").split(",")) {
    const role = part.trim() as EngineRole;
    if (allowed.includes(role)) set.add(role);
  }
  return set;
}

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required env: ${name}`);
  return value;
}

function parseRuntime(raw: string | undefined): GameRuntime {
  if (raw === "hybrid" || raw === "engine" || raw === "legacy_db") return raw;
  return "legacy_db";
}

function optionalEnv(name: string): string | null {
  const value = process.env[name]?.trim();
  return value ? value : null;
}

export function loadConfig(): EngineConfig {
  return {
    supabaseUrl: requireEnv("SUPABASE_URL"),
    supabaseServiceRoleKey: requireEnv("SUPABASE_SERVICE_ROLE_KEY"),
    redisUrl: optionalEnv("REDIS_URL"),
    upstashRestUrl: optionalEnv("UPSTASH_REDIS_REST_URL"),
    upstashRestToken: optionalEnv("UPSTASH_REDIS_REST_TOKEN"),
    roles: parseRoles(process.env.GAME_ENGINE_ROLES),
    runtime: parseRuntime(process.env.GAME_RUNTIME),
    httpPort: Number(process.env.GAME_ENGINE_HTTP_PORT ?? "8080"),
    apiEnabled: process.env.GAME_ENGINE_API === "true",
    logLevel: process.env.LOG_LEVEL ?? "info",
    drawProcessorIntervalMs: Number(
      process.env.DRAW_PROCESSOR_INTERVAL_MS ?? "500"
    ),
    drawProcessorBatchSize: Number(
      process.env.DRAW_PROCESSOR_BATCH_SIZE ?? "100"
    ),
    drawProcessorMaxBatchesPerTick: Number(
      process.env.DRAW_PROCESSOR_MAX_BATCHES_PER_TICK ?? "5"
    ),
    drawProcessorMaxAttempts: Number(
      process.env.DRAW_PROCESSOR_MAX_ATTEMPTS ?? "10"
    ),
    drawProcessorLockTtlSec: Number(
      process.env.DRAW_PROCESSOR_LOCK_TTL_SEC ?? "30"
    ),
    drawProcessorRoomConcurrency: Number(
      process.env.DRAW_PROCESSOR_ROOM_CONCURRENCY ?? "4"
    ),
    roomSchedulerIntervalMs: Number(
      process.env.ROOM_SCHEDULER_INTERVAL_MS ?? "1000"
    ),
    tournamentTickIntervalMs: Number(
      process.env.TOURNAMENT_TICK_INTERVAL_MS ?? "2000"
    ),
    tournamentTickBatchLimit: Number(
      process.env.TOURNAMENT_TICK_BATCH_LIMIT ?? "50"
    ),
  };
}
