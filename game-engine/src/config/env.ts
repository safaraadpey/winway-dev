export type GameRuntime = "legacy_db" | "hybrid" | "engine";

export type EngineRole =
  | "scheduler"
  | "draw-processor"
  | "tournament-orchestrator"
  | "dev-player-scheduler"
  | "dev-player-processor";

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
  /** Max pick→process loops per poll tick (drain depth). */
  drawProcessorMaxBatchesPerTick: number;
  /** Max batches per enqueue/realtime wake. */
  drawProcessorMaxBatchesPerWake: number;
  /** Parallel pick+process while main drain is inFlight (enqueue/realtime only). */
  drawProcessorMicroPickOnEnqueue: boolean;
  /** Jobs claimed per micro-pick (keep at 1 for lowest queue wait). */
  drawProcessorMicroPickBatchSize: number;
  /** Cap concurrent micro-picks (room locks serialize same-room work). */
  drawProcessorMaxMicroPicksInFlight: number;
  /** Wake draw-processor immediately when a draw_jobs row is enqueued. */
  drawProcessorWakeOnEnqueue: boolean;
  /** Requeue a failing job until attempts hits this, then park as 'failed'. */
  drawProcessorMaxAttempts: number;
  /** TTL (seconds) for the draw-processor Redis leader lock. */
  drawProcessorLockTtlSec: number;
  /** Max rooms whose draw_jobs drain in parallel per batch (serial within a room). */
  drawProcessorRoomConcurrency: number;
  roomSchedulerIntervalMs: number;
  tournamentTickIntervalMs: number;
  tournamentTickBatchLimit: number;
  /** Sync full marks snapshot every N processed draws (0 = disabled). */
  roomStateCheckpointEvery: number;
  /** Requeue draw_jobs in `processing` older than this (seconds). */
  drawJobStaleSec: number;
  /** How often to run stale-job reaper (milliseconds). */
  drawJobReapIntervalMs: number;
  /** TTL (seconds) for per-room draw processing lock (0 = disabled). */
  drawRoomLockTtlSec: number;
  /** How often to repair unsettled finished rooms (0 = disabled). */
  roomJanitorIntervalMs: number;
  /** Max rooms repaired per janitor tick. */
  roomJanitorBatchLimit: number;
  devPlayerSchedulerIntervalMs: number;
  devPlayerProcessorIntervalMs: number;
  devPlayerProcessorBatchLimit: number;
  devPlayerSchedulerLockTtlSec: number;
  devPlayerProcessorLockTtlSec: number;
}

function parseRoles(raw: string | undefined): Set<EngineRole> {
  const allowed: EngineRole[] = [
    "scheduler",
    "draw-processor",
    "tournament-orchestrator",
    "dev-player-scheduler",
    "dev-player-processor",
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
      process.env.DRAW_PROCESSOR_MAX_BATCHES_PER_TICK ?? "2"
    ),
    drawProcessorMaxBatchesPerWake: Number(
      process.env.DRAW_PROCESSOR_MAX_BATCHES_PER_WAKE ?? "4"
    ),
    drawProcessorMicroPickOnEnqueue:
      process.env.DRAW_PROCESSOR_MICRO_PICK_ON_ENQUEUE !== "false",
    drawProcessorMicroPickBatchSize: Number(
      process.env.DRAW_PROCESSOR_MICRO_PICK_BATCH_SIZE ?? "1"
    ),
    drawProcessorMaxMicroPicksInFlight: Number(
      process.env.DRAW_PROCESSOR_MAX_MICRO_PICKS_IN_FLIGHT ?? "3"
    ),
    drawProcessorWakeOnEnqueue:
      process.env.DRAW_PROCESSOR_WAKE_ON_ENQUEUE !== "false",
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
    roomStateCheckpointEvery: Number(
      process.env.ROOM_STATE_CHECKPOINT_EVERY ?? "10"
    ),
    drawJobStaleSec: Number(process.env.DRAW_JOB_STALE_SEC ?? "120"),
    drawJobReapIntervalMs: Number(
      process.env.DRAW_JOB_REAP_INTERVAL_MS ?? "30000"
    ),
    drawRoomLockTtlSec: Number(process.env.DRAW_ROOM_LOCK_TTL_SEC ?? "120"),
    roomJanitorIntervalMs: Number(
      process.env.ROOM_JANITOR_INTERVAL_MS ?? "60000"
    ),
    roomJanitorBatchLimit: Number(process.env.ROOM_JANITOR_BATCH_LIMIT ?? "20"),
    devPlayerSchedulerIntervalMs: Number(
      process.env.DEV_PLAYER_SCHEDULER_INTERVAL_MS ?? "60000"
    ),
    devPlayerProcessorIntervalMs: Number(
      process.env.DEV_PLAYER_PROCESSOR_INTERVAL_MS ?? "60000"
    ),
    devPlayerProcessorBatchLimit: Number(
      process.env.DEV_PLAYER_PROCESSOR_BATCH_LIMIT ?? "10"
    ),
    devPlayerSchedulerLockTtlSec: Number(
      process.env.DEV_PLAYER_SCHEDULER_LOCK_TTL_SEC ?? "55"
    ),
    devPlayerProcessorLockTtlSec: Number(
      process.env.DEV_PLAYER_PROCESSOR_LOCK_TTL_SEC ?? "55"
    ),
  };
}
