export type GameRuntime = "legacy_db" | "hybrid" | "engine";

export type EngineRole =
  | "scheduler"
  | "draw-processor"
  | "room-loop"
  | "tournament-orchestrator"
  | "dev-player-scheduler"
  | "dev-player-processor"
  | "ding-processor";

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
  /** Per-room actor pipeline: pick decoupled from serial room processing. */
  drawProcessorPerRoomActor: boolean;
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
  /**
   * Seconds to wait between creating tournament rooms (0 = seat all in one tick).
   * Per-tournament meta.room_create_stagger_seconds overrides this.
   */
  tournamentRoomCreateStaggerSec: number;
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
  devPlayerSchedulerMaxInsertsPerTick: number;
  devPlayerSchedulerLockTtlSec: number;
  devPlayerProcessorLockTtlSec: number;
  // ---- room-actor game loop ----
  /** Observe-only shadow parity (rollout debug). Off in production. */
  enableShadowParity: boolean;
  /** How often the room-loop manager discovers + claims claimable rooms (ms). */
  roomLoopDiscoveryMs: number;
  /** Lease duration the actor holds (and renews) per room (seconds). */
  roomLoopLeaseSec: number;
  /** Max rooms a single replica drives concurrently (0 = unlimited). */
  roomLoopMaxActiveRooms: number;
  /** Max unprocessed draws (DB + persist queue) before clock backpressure. */
  roomLoopMaxUnprocessedDraws: number;
  /** When false, no scheduled/tick workers start (manageWaitingRooms, draw loop, etc.). */
  schedulerEnabled: boolean;
  /** Pick-path DB snapshots (fetchPickDebugQueueState, pick_debug_snapshot logs). Off in production. */
  drawPickDiagnostics: boolean;
  /** Back off rpc_pick_draw_jobs poll when queue is empty; Realtime wake resets to fast. */
  drawPickIdleBackoff: boolean;
  /** When true, global workers skip ticks without Redis (multi-replica safe). */
  coordinationStrict: boolean;
  /** Expected Railway replica count (startup warnings only). */
  engineReplicaCount: number;
  /** Redis TTL for engine heartbeat key (seconds). */
  engineHeartbeatTtlSec: number;
  /** How often to refresh engine heartbeat (milliseconds). */
  engineHeartbeatIntervalMs: number;
  /** TTL (seconds) for room-scheduler Redis leader lock. */
  schedulerLockTtlSec: number;
  /** TTL (seconds) for tournament orchestrator Redis leader lock. */
  tournamentLockTtlSec: number;
  /** Max wait for room actors to finish on SIGTERM (milliseconds). */
  engineDrainTimeoutMs: number;
  /** How often renewable locks extend TTL (fraction of TTL, via renew helper). */
  lockRenewIntervalMs: number;
  /** Phase 2B: defer Ding from finalize to ding_apply_jobs worker (default false). */
  dingAsyncEnabled: boolean;
  /** Stamp new rooms with room_level Ding (room-boundary cutover). */
  dingRoomSettleEnabled: boolean;
  /** Stamp new rooms with manifest_ram gameplay (CANARY OFF by default). */
  gameplayManifestRamEnabled: boolean;
  dingProcessorIntervalMs: number;
  dingProcessorBatchSize: number;
  /** Max parallel rpc_apply_ding_credits_for_draw calls per pick batch (cap 12). */
  dingProcessorConcurrency: number;
  dingProcessorMaxAttempts: number;
  dingProcessorLockTtlSec: number;
  /** Requeue ding_apply_jobs in `processing` older than this (seconds). */
  dingJobStaleSec: number;
  /** How often to run stale ding job reaper (milliseconds). */
  dingJobReapIntervalMs: number;
}

function parseRoles(raw: string | undefined): Set<EngineRole> {
  const allowed: EngineRole[] = [
    "scheduler",
    "draw-processor",
    "room-loop",
    "tournament-orchestrator",
    "dev-player-scheduler",
    "dev-player-processor",
    "ding-processor",
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
    drawProcessorPerRoomActor:
      process.env.DRAW_PROCESSOR_PER_ROOM_ACTOR !== "false",
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
    tournamentRoomCreateStaggerSec: Number(
      process.env.TOURNAMENT_ROOM_CREATE_STAGGER_SEC ?? "3"
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
    devPlayerSchedulerMaxInsertsPerTick: Number(
      process.env.DEV_PLAYER_SCHEDULER_MAX_INSERTS_PER_TICK ?? "10"
    ),
    devPlayerSchedulerLockTtlSec: Number(
      process.env.DEV_PLAYER_SCHEDULER_LOCK_TTL_SEC ?? "55"
    ),
    devPlayerProcessorLockTtlSec: Number(
      process.env.DEV_PLAYER_PROCESSOR_LOCK_TTL_SEC ?? "55"
    ),
    enableShadowParity: process.env.ENABLE_SHADOW_PARITY === "true",
    roomLoopDiscoveryMs: Number(process.env.ROOM_LOOP_DISCOVERY_MS ?? "1000"),
    roomLoopLeaseSec: Number(process.env.ROOM_LOOP_LEASE_SEC ?? "30"),
    roomLoopMaxActiveRooms: Number(
      process.env.ROOM_LOOP_MAX_ACTIVE_ROOMS ?? "50"
    ),
    /** Max unprocessed draws (DB + persist queue) before clock backpressure. */
    roomLoopMaxUnprocessedDraws: Number(
      process.env.ROOM_LOOP_MAX_UNPROCESSED ?? "2"
    ),
    schedulerEnabled: process.env.SCHEDULER_ENABLED === "true",
    drawPickDiagnostics: process.env.DRAW_PICK_DIAGNOSTICS === "true",
    drawPickIdleBackoff: process.env.DRAW_PICK_IDLE_BACKOFF !== "false",
    coordinationStrict: process.env.COORDINATION_STRICT === "true",
    engineReplicaCount: Number(process.env.ENGINE_REPLICA_COUNT ?? "1"),
    engineHeartbeatTtlSec: Number(process.env.ENGINE_HEARTBEAT_TTL_SEC ?? "15"),
    engineHeartbeatIntervalMs: Number(
      process.env.ENGINE_HEARTBEAT_INTERVAL_MS ?? "5000"
    ),
    schedulerLockTtlSec: Number(process.env.SCHEDULER_LOCK_TTL_SEC ?? "30"),
    tournamentLockTtlSec: Number(process.env.TOURNAMENT_LOCK_TTL_SEC ?? "30"),
    engineDrainTimeoutMs: Number(process.env.ENGINE_DRAIN_TIMEOUT_MS ?? "25000"),
    lockRenewIntervalMs: Number(process.env.LOCK_RENEW_INTERVAL_MS ?? "10000"),
    dingAsyncEnabled: process.env.DING_ASYNC_ENABLED === "true",
    dingRoomSettleEnabled: process.env.DING_ROOM_SETTLE_ENABLED === "true",
    gameplayManifestRamEnabled:
      process.env.GAMEPLAY_MANIFEST_RAM_ENABLED === "true",
    dingProcessorIntervalMs: Number(
      process.env.DING_PROCESSOR_INTERVAL_MS ?? "500"
    ),
    dingProcessorBatchSize: Number(
      process.env.DING_PROCESSOR_BATCH_SIZE ?? "50"
    ),
    dingProcessorConcurrency: Math.min(
      12,
      Math.max(1, Number(process.env.DING_PROCESSOR_CONCURRENCY ?? "1"))
    ),
    dingProcessorMaxAttempts: Number(
      process.env.DING_PROCESSOR_MAX_ATTEMPTS ?? "10"
    ),
    dingProcessorLockTtlSec: Number(
      process.env.DING_PROCESSOR_LOCK_TTL_SEC ?? "30"
    ),
    dingJobStaleSec: Number(process.env.DING_JOB_STALE_SEC ?? "120"),
    dingJobReapIntervalMs: Number(
      process.env.DING_JOB_REAP_INTERVAL_MS ?? "30000"
    ),
  };
}
