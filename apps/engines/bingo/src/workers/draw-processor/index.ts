import { randomUUID } from "node:crypto";
import {
  processDrawBatch,
  processDrawBatchEngine,
} from "../../domain/draw/index.js";
import type { DrawBatchResult } from "../../domain/draw/index.js";
import {
  fetchDrawQueueMetrics,
  snapshotDrawAggregateMetrics,
} from "../../metrics/drawPerformance.js";
import { createDrainMonitorContext } from "../../domain/draw/drainMonitor.js";
import type { PickDebugContext } from "../../domain/draw/pickDebugSnapshot.js";
import { reapStaleDrawJobs } from "../../domain/draw/reapStaleJobs.js";
import { GameRepo } from "../../repositories/index.js";
import { redisKeysV2 } from "../../redis/keysV2.js";
import { acquireLeaderLock, releaseLeaderLock } from "../../redis/leaderLock.js";
import { getGlobalCardRegistry } from "../../core/card-registry/index.js";
import type { GlobalCardRegistry } from "../../core/card-registry/types.js";
import {
  registerDrawProcessorWake,
  type DrawProcessorWakeReason,
} from "../../runtime/draw-processor-wake.js";
import { executesBusinessLogic } from "../../runtime.js";
import type { WorkerContext } from "../context.js";
import { enrichLegacyDrawGateSnapshot } from "../../coordination/legacyWorkerGateSnapshot.js";
import { parseLegacyDrawProcessorEnabled } from "../../coordination/legacyWorkerGate.js";
import {
  createDrawProcessorGateOptions,
  startLegacyWorkerWithGate,
} from "../legacyWorkerGateController.js";
import { startPerRoomActorProcessor } from "./startPerRoomActorProcessor.js";
import { startDrawJobWakeListener } from "./wakeListener.js";
import { createAdaptivePollScheduler } from "./adaptivePollScheduler.js";

const MICRO_WAKE_REASONS = new Set<DrawProcessorWakeReason>(["enqueue", "realtime"]);
const RESET_BACKOFF_REASONS = new Set<DrawProcessorWakeReason>([
  "realtime",
  "enqueue",
  "backlog",
]);

export function startDrawProcessor(ctx: WorkerContext): () => void {
  const repo = new GameRepo(ctx.supabase);

  const startInner = (): (() => void) => {
    if (
      ctx.config.drawProcessorPerRoomActor &&
      executesBusinessLogic(ctx.config.runtime)
    ) {
      return startPerRoomActorProcessor(ctx);
    }
    return startLegacyDrainProcessor(ctx);
  };

  return startLegacyWorkerWithGate(
    createDrawProcessorGateOptions({
      resolveConfigEnabled: () =>
        parseLegacyDrawProcessorEnabled(process.env.LEGACY_DRAW_PROCESSOR_ENABLED),
      heartbeatMs: ctx.config.legacyWorkerGateHeartbeatMs,
      log: ctx.log,
      fetchSnapshot: () => enrichLegacyDrawGateSnapshot(repo),
      startWorker: startInner,
    })
  );
}

/**
 * Legacy batch drain (phase 1). Used when DRAW_PROCESSOR_PER_ROOM_ACTOR=false.
 */
function startLegacyDrainProcessor(ctx: WorkerContext): () => void {
  const { supabase, config, log, redis } = ctx;
  const lockToken = randomUUID();
  const lockKey = redisKeysV2.lockWorkerDrawPicker();

  let stopped = false;
  let inFlight = false;
  let pendingDrain = false;
  let microPicksInFlight = 0;
  let wakeReason: DrawProcessorWakeReason = "poll";
  let idleLogged = false;
  let redisLockDegraded = { value: false };
  let lastReapMs = 0;
  const repo = new GameRepo(supabase);
  const worker = "draw-processor";
  let cardRegistry: GlobalCardRegistry | null = null;
  let pollScheduler: ReturnType<typeof createAdaptivePollScheduler>;

  const ensureCardRegistry = async (): Promise<GlobalCardRegistry | null> => {
    if (!executesBusinessLogic(config.runtime)) return null;
    if (!cardRegistry) {
      cardRegistry = await getGlobalCardRegistry(repo, log);
    }
    return cardRegistry;
  };

  const maybeReapStaleJobs = async (): Promise<void> => {
    if (!executesBusinessLogic(config.runtime)) return;
    const now = Date.now();
    if (now - lastReapMs < config.drawJobReapIntervalMs) return;
    lastReapMs = now;
    await reapStaleDrawJobs({
      repo,
      log,
      staleSec: config.drawJobStaleSec,
      roomState: ctx.roomState,
    });
  };

  const isMicroWake = (reason: DrawProcessorWakeReason): boolean =>
    MICRO_WAKE_REASONS.has(reason);

  const runMicroPick = async (reason: DrawProcessorWakeReason): Promise<void> => {
    if (
      stopped ||
      !config.drawProcessorMicroPickOnEnqueue ||
      !isMicroWake(reason) ||
      !executesBusinessLogic(config.runtime)
    ) {
      return;
    }
    if (microPicksInFlight >= config.drawProcessorMaxMicroPicksInFlight) {
      return;
    }

    microPicksInFlight += 1;
    try {
      const pickDebug: PickDebugContext = {
        workerId: `${lockToken}:micro`,
        getWakeReason: () => reason,
        getFlags: () => ({
          inFlight,
          pendingDrain,
          lockState: "proceed",
        }),
      };

      const totals = await executeDrain({
        maxBatches: 1,
        batchSize: config.drawProcessorMicroPickBatchSize,
        pickDebug,
        microPick: true,
        activeWakeReason: reason,
      });

      if (totals.requeued > 0) {
        pendingDrain = true;
        wakeReason = "backlog";
      }
    } catch (err) {
      log.error("draw-processor micro-pick error", { error: errMessage(err) });
    } finally {
      microPicksInFlight -= 1;
    }
  };

  const requestDrain = (reason: DrawProcessorWakeReason): void => {
    if (stopped) return;
    if (RESET_BACKOFF_REASONS.has(reason)) {
      pollScheduler.resetToFast();
    }
    if (inFlight) {
      pendingDrain = true;
      if (isMicroWake(reason)) {
        wakeReason = reason;
        void runMicroPick(reason);
      }
      return;
    }
    wakeReason = reason;
    void runDrainCycle();
  };

  const runDrainCycle = async (): Promise<void> => {
    if (stopped || inFlight) {
      if (!stopped) pendingDrain = true;
      return;
    }

    if (config.runtime === "legacy_db") {
      if (!idleLogged) {
        log.info("draw-processor idle (GAME_RUNTIME=legacy_db); cron owns draws");
        idleLogged = true;
      }
      return;
    }
    idleLogged = false;

    inFlight = true;
    let lockHeld = false;
    const cycleWakeReason = wakeReason;
    let pollTotals: DrawBatchResult | null = null;
    let pollLockDeferred = false;
    try {
      await maybeReapStaleJobs();
      const lock = await acquireLeaderLock({
        redis,
        lockKey,
        ttlSec: config.drawProcessorLockTtlSec,
        token: lockToken,
        worker,
        log,
        degraded: redisLockDegraded,
        coordinationStrict: config.coordinationStrict,
        engineReplicaCount: config.engineReplicaCount,
      });
      if (!lock.proceed) {
        pendingDrain = true;
        if (isMicroWake(cycleWakeReason)) {
          wakeReason = cycleWakeReason;
        }
        if (cycleWakeReason === "poll") {
          pollLockDeferred = true;
        }
        return;
      }
      lockHeld = lock.lockHeld;

      const maxBatches = isMicroWake(cycleWakeReason)
        ? config.drawProcessorMaxBatchesPerWake
        : cycleWakeReason === "poll"
          ? config.drawProcessorMaxBatchesPerTick
          : config.drawProcessorMaxBatchesPerWake;

      const pickDebug: PickDebugContext = {
        workerId: lockToken,
        getWakeReason: () => cycleWakeReason,
        getFlags: () => ({
          inFlight,
          pendingDrain,
          lockState: "proceed",
        }),
      };

      const totals = await executeDrain({
        maxBatches,
        pickDebug,
        activeWakeReason: cycleWakeReason,
      });
      pollTotals = totals;

      if (totals.requeued > 0) {
        pendingDrain = true;
        wakeReason = "backlog";
      }
    } catch (err) {
      log.error("draw-processor drain error", { error: errMessage(err) });
    } finally {
      await releaseLeaderLock({
        redis,
        lockKey,
        token: lockToken,
        lockHeld,
        worker,
        log,
      });
      inFlight = false;

      if (cycleWakeReason === "poll") {
        if (pollLockDeferred) {
          pollScheduler.notifyPollCycle({
            totalPicked: 0,
            totalDispatched: 0,
            rpcAttemptedEmpty: false,
            lockDeferred: true,
          });
        } else if (pollTotals) {
          if (pollTotals.picked > 0) {
            pollScheduler.resetToFast();
          } else {
            pollScheduler.notifyPollCycle({
              totalPicked: 0,
              totalDispatched: 0,
              rpcAttemptedEmpty: true,
              lockDeferred: false,
            });
          }
        }
      }

      if (pendingDrain && !stopped) {
        pendingDrain = false;
        if (wakeReason === "poll") {
          wakeReason = "backlog";
        }
        void runDrainCycle();
      }
    }
  };

  const executeDrain = async (opts: {
    maxBatches: number;
    batchSize?: number;
    pickDebug?: PickDebugContext;
    microPick?: boolean;
    activeWakeReason: DrawProcessorWakeReason;
  }): Promise<DrawBatchResult> => {
    const drainMonitor = createDrainMonitorContext();
    const totals: DrawBatchResult = {
      picked: 0,
      done: 0,
      requeued: 0,
      deadLettered: 0,
    };

    const batchOpts = {
      maxAttempts: config.drawProcessorMaxAttempts,
      batchSize: opts.batchSize ?? config.drawProcessorBatchSize,
      roomConcurrency: config.drawProcessorRoomConcurrency,
      redis,
      drawRoomLockTtlSec: config.drawRoomLockTtlSec,
      cardRegistry: await ensureCardRegistry(),
      drainMonitor,
      pickDebug: opts.pickDebug,
      pickDiagnostics: config.drawPickDiagnostics,
      deferDing: config.dingAsyncEnabled,
    };

    const runBatch = executesBusinessLogic(config.runtime)
      ? () => processDrawBatchEngine(supabase, log, batchOpts, ctx.roomState)
      : () => processDrawBatch(supabase, log, batchOpts);

    const batchLimit = Math.max(1, opts.maxBatches);
    for (let batch = 0; !stopped && batch < batchLimit; batch++) {
      const res = await runBatch();
      totals.picked += res.picked;
      totals.done += res.done;
      totals.requeued += res.requeued;
      totals.deadLettered += res.deadLettered;
      if (res.picked === 0) break;
    }

    const drainEndedMs = Date.now();
    const drainDurationMs = drainEndedMs - drainMonitor.drainStartedMs;
    const drainEndedAt = new Date(drainEndedMs).toISOString();

    if (totals.done > 0) {
      try {
        await repo.patchDrainCycleTiming(
          drainMonitor.drainStartedAt,
          drainEndedAt,
          drainDurationMs
        );
      } catch (err) {
        log.warn("patchDrainCycleTiming failed", {
          drainStartedAt: drainMonitor.drainStartedAt,
          error: errMessage(err),
        });
      }
    }

    if (totals.picked > 0 || totals.done > 0) {
      log.info(opts.microPick ? "draw-micro-pick" : "draw-drain-cycle", {
        wakeReason: opts.activeWakeReason,
        microPick: opts.microPick ?? false,
        drainStartedAt: drainMonitor.drainStartedAt,
        drainEndedAt,
        drainDurationMs,
        maxBatches: batchLimit,
        batchSize: batchOpts.batchSize,
        ...totals,
      });
    }

    if (totals.picked > 0 && !opts.microPick) {
      log.info("draw-processor batch", {
        wakeReason: opts.activeWakeReason,
        ...totals,
      });
    }

    if (executesBusinessLogic(config.runtime)) {
      await logDrawPerformanceMetrics(supabase, log, totals.done > 0);
    }

    return totals;
  };

  const logDrawPerformanceMetrics = async (
    db: typeof supabase,
    logger: typeof log,
    hadCompletions: boolean
  ): Promise<void> => {
    try {
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
    } catch (err) {
      logger.warn("draw-performance-metrics skipped", {
        error: errMessage(err),
      });
    }
  };

  const unregisterWake = registerDrawProcessorWake((reason) => {
    if (!config.drawProcessorWakeOnEnqueue) return;
    requestDrain(reason);
  });

  const stopWakeListener =
    config.drawProcessorWakeOnEnqueue && executesBusinessLogic(config.runtime)
      ? startDrawJobWakeListener(supabase, log)
      : () => undefined;

  pollScheduler = createAdaptivePollScheduler({
    baseIntervalMs: config.drawProcessorIntervalMs,
    enabled: config.drawPickIdleBackoff,
    log,
    onPoll: () => requestDrain("poll"),
  });

  pollScheduler.start();

  return () => {
    stopped = true;
    pollScheduler.stop();
    unregisterWake();
    stopWakeListener();
  };
}

function errMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
