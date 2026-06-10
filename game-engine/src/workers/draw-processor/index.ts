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
import { reapStaleDrawJobs } from "../../domain/draw/reapStaleJobs.js";
import { GameRepo } from "../../repositories/index.js";
import { redisKeys } from "../../redis/keys.js";
import { releaseLock, tryAcquireLock } from "../../redis/locks.js";
import { executesBusinessLogic } from "../../runtime.js";
import type { WorkerContext } from "../context.js";

/**
 * Consumes draw_jobs: marks -> evaluate -> settle (via DB RPCs).
 * Replaces the pg_cron / Edge draw-worker trigger; the heavy lifting stays in
 * Postgres for now (Phase 1 hybrid). See docs/roadmap/GAME_ENGINE_MIGRATION.md (P0).
 *
 * Safety:
 *  - GAME_RUNTIME=legacy_db -> idle (cron still owns draws; no double processing).
 *  - Redis leader lock -> only one engine replica drains at a time (until sharded, B11).
 *  - Reentrancy guard -> overlapping timers never run concurrent batches in-process.
 *  - Per-room parallelism -> different rooms drain concurrently; one room stays serial.
 */
export function startDrawProcessor(ctx: WorkerContext): () => void {
  const { supabase, config, log, redis } = ctx;
  const lockToken = randomUUID();
  const lockKey = redisKeys.drawProcessorLeader();

  let stopped = false;
  let inFlight = false;
  let idleLogged = false;
  let redisLockDegraded = false;
  let lastReapMs = 0;
  const repo = new GameRepo(supabase);

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

  const tick = async (): Promise<void> => {
    if (stopped || inFlight) return;

    if (config.runtime === "legacy_db") {
      if (!idleLogged) {
        log.info("draw-processor idle (GAME_RUNTIME=legacy_db); cron owns draws");
        idleLogged = true;
      }
      return;
    }
    idleLogged = false;

    inFlight = true;
    let haveLock = false;
    let lockHeld = false;
    try {
      await maybeReapStaleJobs();
      if (redis) {
        try {
          haveLock = await tryAcquireLock(
            redis,
            lockKey,
            config.drawProcessorLockTtlSec,
            lockToken
          );
          lockHeld = haveLock;
          if (!haveLock) return;
        } catch (lockErr) {
          if (!redisLockDegraded) {
            redisLockDegraded = true;
            log.warn("redis lock failed; continuing single-instance mode", {
              error: errMessage(lockErr),
            });
          }
        }
      }
      await drain();
    } catch (err) {
      log.error("draw-processor tick error", { error: errMessage(err) });
    } finally {
      if (redis && lockHeld) {
        await releaseLock(redis, lockKey, lockToken).catch((err: unknown) =>
          log.error("draw-processor lock release failed", {
            error: errMessage(err),
          })
        );
      }
      inFlight = false;
    }
  };

  const drain = async (): Promise<void> => {
    const totals: DrawBatchResult = {
      picked: 0,
      done: 0,
      requeued: 0,
      deadLettered: 0,
    };

    // engine mode → full TS business logic; hybrid → orchestrate DB RPCs.
    const batchOpts = {
      maxAttempts: config.drawProcessorMaxAttempts,
      batchSize: config.drawProcessorBatchSize,
      roomConcurrency: config.drawProcessorRoomConcurrency,
      redis,
      drawRoomLockTtlSec: config.drawRoomLockTtlSec,
    };

    const runBatch = executesBusinessLogic(config.runtime)
      ? () => processDrawBatchEngine(supabase, log, batchOpts, ctx.roomState)
      : () => processDrawBatch(supabase, log, batchOpts);

    for (let batch = 0; !stopped && batch < config.drawProcessorMaxBatchesPerTick; batch++) {
      const res = await runBatch();
      totals.picked += res.picked;
      totals.done += res.done;
      totals.requeued += res.requeued;
      totals.deadLettered += res.deadLettered;
      if (res.picked === 0) break;
    }

    if (totals.picked > 0) {
      log.info("draw-processor batch", { ...totals });
    }

    if (executesBusinessLogic(config.runtime)) {
      await logDrawPerformanceMetrics(supabase, log, totals.done > 0);
    }
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

  void tick();
  const timer = setInterval(() => void tick(), config.drawProcessorIntervalMs);

  return () => {
    stopped = true;
    clearInterval(timer);
  };
}

function errMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
