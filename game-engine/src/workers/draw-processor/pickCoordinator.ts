import { randomUUID } from "node:crypto";
import type { SupabaseAdmin } from "../../db/supabase-admin.js";
import { createDrainMonitorContext } from "../../domain/draw/drainMonitor.js";
import { filterActorOwnedDrawJobs } from "../../domain/draw/filterActorOwnedDrawJobs.js";
import type { DrawJobPickContext } from "../../domain/draw/drawJobPickContext.js";
import {
  emitPickDebugSnapshot,
  type PickDebugContext,
} from "../../domain/draw/pickDebugSnapshot.js";
import { pickDrawJobs } from "../../domain/draw/pickDrawJobs.js";
import type { DrawJob } from "../../domain/draw/types.js";
import {
  fetchDrawQueueMetrics,
  snapshotDrawAggregateMetrics,
  timedStep,
  type StepTiming,
} from "../../metrics/drawPerformance.js";
import type { Logger } from "../../metrics/logger.js";
import { GameRepo } from "../../repositories/index.js";
import { redisKeys } from "../../redis/keys.js";
import {
  acquireLeaderLockWithTimeout,
  releaseLeaderLock,
} from "../../redis/leaderLock.js";
import type { GameRedis } from "../../redis/types.js";
import type { DrawProcessorWakeReason } from "../../runtime/draw-processor-wake.js";
import { createPickQueueStateCache } from "./pickQueueStateCache.js";
import type { RoomDrawActorPool } from "./roomDrawActorPool.js";

const FAST_WAKE = new Set<DrawProcessorWakeReason>(["enqueue", "realtime"]);
const PICK_LOOP_HEARTBEAT_MS = 1000;
const QUEUE_CACHE_REFRESH_MS = 500;
/** Upstash REST often exceeds 150ms; too low causes zero picks under contention. */
const LOCK_TIMEOUT_MS = 2000;
const IDLE_RETRY_MS = 150;
const LOCK_SKIP_LOG_EVERY = 20;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function deferAsync(
  work: () => Promise<void>,
  log: Logger,
  label: string
): void {
  void work().catch((err) => {
    log.warn(`${label} failed`, {
      error: err instanceof Error ? err.message : String(err),
    });
  });
}

export interface PickCoordinatorOptions {
  supabase: SupabaseAdmin;
  log: Logger;
  redis: GameRedis | null;
  pool: RoomDrawActorPool;
  repo: GameRepo;
  lockTtlSec: number;
  batchSize: number;
  maxRoundsPerPoll: number;
  maxRoundsPerWake: number;
  pickDiagnostics: boolean;
}

export interface PickCoordinator {
  schedulePick(reason: DrawProcessorWakeReason): void;
  stop(): void;
}

export function createPickCoordinator(opts: PickCoordinatorOptions): PickCoordinator {
  const lockToken = randomUUID();
  const lockKey = redisKeys.drawProcessorLeader();
  const worker = "draw-processor";

  let stopped = false;
  /** True only during rpc_pick_draw_jobs. */
  let pickInFlight = false;
  /** True while runPickLoop is active. */
  let pickLoopRunning = false;
  let pendingPick = false;
  let wakeReason: DrawProcessorWakeReason = "poll";
  let lastPickAt: string | null = null;
  let heartbeatInFlight = false;
  let redisLockDegraded = { value: false };
  let consecutiveLockSkips = 0;

  const queueCache = createPickQueueStateCache({
    repo: opts.repo,
    log: opts.log,
    refreshIntervalMs: QUEUE_CACHE_REFRESH_MS,
    dbRefreshEnabled: opts.pickDiagnostics,
  });

  const runPickLoopHeartbeat = (): void => {
    if (!opts.pickDiagnostics || stopped || heartbeatInFlight) return;
    const queueState = queueCache.snapshot();
    if (queueState.queuedJobsCount <= 0) return;
    heartbeatInFlight = true;
    try {
      opts.log.info("pick-loop-heartbeat", {
        queued_jobs: queueState.queuedJobsCount,
        processing_jobs: queueState.processingJobsCount,
        inFlight: pickInFlight,
        loopRunning: pickLoopRunning,
        pendingDrain: pendingPick,
        wakeReason,
        lastPickAt,
        oldestQueuedAgeMs: queueState.oldestQueuedAgeMs,
      });
    } finally {
      heartbeatInFlight = false;
    }
  };

  const heartbeatTimer = opts.pickDiagnostics
    ? setInterval(runPickLoopHeartbeat, PICK_LOOP_HEARTBEAT_MS)
    : null;

  const schedulePick = (reason: DrawProcessorWakeReason): void => {
    if (stopped) return;
    pendingPick = true;
    if (FAST_WAKE.has(reason)) {
      wakeReason = reason;
      queueCache.noteEnqueued(1);
    } else if (!pickLoopRunning && wakeReason === "poll") {
      wakeReason = reason;
    }
    if (opts.pickDiagnostics) {
      queueCache.requestRefresh();
    }
    void runPickLoop();
  };

  const runPickLoop = async (): Promise<void> => {
    if (stopped || pickLoopRunning) return;

    pickLoopRunning = true;
    const cycleReason = wakeReason;
    const burstBudget = FAST_WAKE.has(cycleReason)
      ? opts.maxRoundsPerWake
      : cycleReason === "poll"
        ? opts.maxRoundsPerPoll
        : opts.maxRoundsPerWake;

    let roundsLeft = burstBudget;
    let totalPicked = 0;

    try {
      while (!stopped) {
        pendingPick = false;
        const picked = await attemptPick(cycleReason);
        if (picked > 0) {
          totalPicked += picked;
          queueCache.notePicked(picked);
          roundsLeft -= 1;
        } else if (!opts.pickDiagnostics) {
          queueCache.reset();
        }

        const queued = queueCache.hasQueued() || pendingPick;
        if (queued) {
          if (picked === 0) {
            await sleep(IDLE_RETRY_MS);
          }
          continue;
        }

        if (picked === 0) {
          break;
        }

        if (roundsLeft <= 0) {
          break;
        }
      }
    } catch (err) {
      opts.log.error("draw-processor pick error", {
        error: err instanceof Error ? err.message : String(err),
      });
    } finally {
      pickLoopRunning = false;
      if ((pendingPick || queueCache.hasQueued()) && !stopped) {
        void runPickLoop();
      }
    }

    if (totalPicked > 0) {
      deferAsync(
        () => logDrawPerformanceMetrics(opts.supabase, opts.log, true),
        opts.log,
        "draw-performance-metrics"
      );
    }
  };

  const attemptPick = async (
    activeWakeReason: DrawProcessorWakeReason
  ): Promise<number> => {
    const drainMonitor = createDrainMonitorContext();
    const pickDebug: PickDebugContext = {
      workerId: lockToken,
      getWakeReason: () => activeWakeReason,
      getFlags: () => ({
        inFlight: pickInFlight,
        pendingDrain: pendingPick,
        lockState: "proceed",
      }),
    };

    const lock = await acquireLeaderLockWithTimeout({
      redis: opts.redis,
      lockKey,
      ttlSec: opts.lockTtlSec,
      token: lockToken,
      worker,
      log: opts.log,
      degraded: redisLockDegraded,
      timeoutMs: LOCK_TIMEOUT_MS,
    });

    if (!lock.proceed) {
      pendingPick = true;
      consecutiveLockSkips += 1;
      if (FAST_WAKE.has(activeWakeReason)) {
        wakeReason = activeWakeReason;
      }
      if (
        consecutiveLockSkips === 1 ||
        consecutiveLockSkips % LOCK_SKIP_LOG_EVERY === 0
      ) {
        opts.log.warn("pick-lock-deferred", {
          consecutiveLockSkips,
          timedOut: lock.timedOut === true,
          wakeReason: activeWakeReason,
          hint:
            "Another engine replica may hold the Redis draw-processor lock — run only one engine per DB.",
        });
      }
      return 0;
    }

    consecutiveLockSkips = 0;
    const lockHeld = lock.lockHeld;
    let pickStep: { result: DrawJob[]; timing: StepTiming } | null = null;

    pickInFlight = true;
    try {
      pickStep = await timedStep(() => pickDrawJobs(opts.supabase, opts.batchSize));
      lastPickAt = pickStep.timing.endTime;
    } finally {
      pickInFlight = false;
      if (lockHeld) {
        await releaseLeaderLock({
          redis: opts.redis,
          lockKey,
          token: lockToken,
          lockHeld: true,
          worker,
          log: opts.log,
        });
      }
    }

    deferAsync(
      () =>
        emitPickDebugSnapshot(
          opts.log,
          opts.repo,
          pickDebug,
          opts.batchSize,
          opts.pickDiagnostics
        ),
      opts.log,
      "pick_debug_snapshot"
    );

    if (!pickStep || pickStep.result.length === 0) {
      return 0;
    }

    const picked = pickStep.result;
    const filtered = await filterActorOwnedDrawJobs(
      opts.repo,
      opts.log,
      picked
    );
    const jobs = filtered.toProcess;
    if (jobs.length === 0) {
      return picked.length;
    }

    const pickPerJobMs = pickStep.timing.durationMs / picked.length;

    opts.log.info("draw-pick-dispatch", {
      wakeReason: activeWakeReason,
      jobsPicked: picked.length,
      jobsDispatched: jobs.length,
      actorSkippedDone: filtered.skippedDone,
      actorSkippedRequeued: filtered.skippedRequeued,
      rpc_pick_draw_jobs: pickStep.timing,
      pickMsPerJob: Math.round(pickPerJobMs * 100) / 100,
    });

    for (const job of jobs) {
      const pickContext: DrawJobPickContext = {
        firstPickedAt: pickStep.timing.endTime,
        pickStartTime: pickStep.timing.startTime,
        pickEndTime: pickStep.timing.endTime,
        pickMsPerJob: Math.round(pickPerJobMs * 100) / 100,
        drainStartedAt: drainMonitor.drainStartedAt,
      };
      opts.pool.dispatch(job, pickContext);
    }

    return picked.length;
  };

  return {
    schedulePick,
    stop: () => {
      stopped = true;
      if (heartbeatTimer) clearInterval(heartbeatTimer);
      queueCache.stop();
    },
  };
}

async function logDrawPerformanceMetrics(
  db: SupabaseAdmin,
  logger: Logger,
  hadCompletions: boolean
): Promise<void> {
  const [queue, aggregates] = await Promise.all([
    fetchDrawQueueMetrics(db),
    Promise.resolve(snapshotDrawAggregateMetrics()),
  ]);
  if (
    !hadCompletions &&
    aggregates.sampleCount === 0 &&
    queue.queueLength === 0 &&
    queue.activeRooms === 0
  ) {
    return;
  }
  logger.info("draw-performance-metrics", {
    drawsProcessedPerSecond: aggregates.drawsProcessedPerSecond,
    averageDrawProcessingMs: aggregates.averageDrawProcessingMs,
    p95DrawProcessingMs: aggregates.p95DrawProcessingMs,
    p99DrawProcessingMs: aggregates.p99DrawProcessingMs,
    averageQueueWaitMs: aggregates.averageQueueWaitMs,
    p95QueueWaitMs: aggregates.p95QueueWaitMs,
    sampleCount: aggregates.sampleCount,
    queueLength: queue.queueLength,
    processingLength: queue.processingLength,
    failedLength: queue.failedLength,
    activeRooms: queue.activeRooms,
    activeTickets: queue.activeTickets,
  });
}
