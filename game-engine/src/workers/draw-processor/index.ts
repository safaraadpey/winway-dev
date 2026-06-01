import { randomUUID } from "node:crypto";
import {
  processDrawBatch,
  processDrawBatchEngine,
} from "../../domain/draw/index.js";
import type { DrawBatchResult } from "../../domain/draw/index.js";
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
 */
export function startDrawProcessor(ctx: WorkerContext): () => void {
  const { supabase, config, log, redis } = ctx;
  const lockToken = randomUUID();
  const lockKey = redisKeys.drawProcessorLeader();

  let stopped = false;
  let inFlight = false;
  let idleLogged = false;

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
    try {
      if (redis) {
        haveLock = await tryAcquireLock(
          redis,
          lockKey,
          config.drawProcessorLockTtlSec,
          lockToken
        );
        if (!haveLock) return;
      }
      await drain();
    } catch (err) {
      log.error("draw-processor tick error", { error: errMessage(err) });
    } finally {
      if (redis && haveLock) {
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
    const runBatch = executesBusinessLogic(config.runtime)
      ? () =>
          processDrawBatchEngine(supabase, log, {
            maxAttempts: config.drawProcessorMaxAttempts,
          })
      : () =>
          processDrawBatch(supabase, log, {
            maxAttempts: config.drawProcessorMaxAttempts,
          });

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
