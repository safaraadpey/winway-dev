/**
 * Engine-mode draw batch — full TS business logic (GAME_RUNTIME=engine).
 *
 * Legacy batch path (used when DRAW_PROCESSOR_PER_ROOM_ACTOR=false).
 * Per-room actor mode uses pickCoordinator + processEngineDrawJob instead.
 */

import type { GlobalCardRegistry } from "../../core/card-registry/types.js";
import type { SupabaseAdmin } from "../../db/supabase-admin.js";
import type { Logger } from "../../metrics/logger.js";
import { timedStep } from "../../metrics/drawPerformance.js";
import { redisKeys } from "../../redis/keys.js";
import type { GameRedis } from "../../redis/types.js";
import { GameRepo } from "../../repositories/index.js";
import type { RoomStateManager } from "../../state/room-state.manager.js";
import type { DrainMonitorContext } from "./drainMonitor.js";
import {
  emitPickDebugSnapshot,
  type PickDebugContext,
} from "./pickDebugSnapshot.js";
import { pickDrawJobs } from "./pickDrawJobs.js";
import { processEngineDrawJob } from "./processEngineDrawJob.js";
import { processJobsByRoom } from "./processJobsByRoom.js";
import { type DrawBatchResult, type DrawJob, EMPTY_BATCH } from "./types.js";

export interface ProcessDrawBatchEngineOptions {
  maxAttempts: number;
  batchSize: number;
  roomConcurrency: number;
  redis?: GameRedis | null;
  drawRoomLockTtlSec?: number;
  cardRegistry?: GlobalCardRegistry | null;
  drainMonitor?: DrainMonitorContext;
  pickDebug?: PickDebugContext;
}

export async function processDrawBatchEngine(
  supabase: SupabaseAdmin,
  log: Logger,
  opts: ProcessDrawBatchEngineOptions,
  stateManager: RoomStateManager
): Promise<DrawBatchResult> {
  const repo = new GameRepo(supabase);

  if (opts.pickDebug) {
    await emitPickDebugSnapshot(log, repo, opts.pickDebug, opts.batchSize);
  }
  const pickStep = await timedStep(() => pickDrawJobs(supabase, opts.batchSize));
  const jobs = pickStep.result;
  if (jobs.length === 0) return { ...EMPTY_BATCH };

  const firstPickedAt = pickStep.timing.endTime;
  const drainStartedAt = opts.drainMonitor?.drainStartedAt ?? null;
  const pickPerJobMs =
    jobs.length > 0 ? pickStep.timing.durationMs / jobs.length : 0;

  log.info("draw-performance-batch", {
    rpc_pick_draw_jobs: pickStep.timing,
    jobsPicked: jobs.length,
    pickMsPerJob: Math.round(pickPerJobMs * 100) / 100,
  });

  const roomLock =
    opts.redis && (opts.drawRoomLockTtlSec ?? 0) > 0
      ? {
          redis: opts.redis,
          ttlSec: opts.drawRoomLockTtlSec!,
          keyFn: (roomId: string) => redisKeys.drawRoomProcessor(roomId),
          onLockMiss: async (roomId: string, missed: readonly DrawJob[]) => {
            const now = new Date().toISOString();
            for (const job of missed) {
              await supabase
                .from("draw_jobs")
                .update({ status: "queued", updated_at: now })
                .eq("id", job.id)
                .eq("status", "processing");
            }
            log.info("draw room lock miss; jobs requeued", {
              roomId,
              jobs: missed.length,
            });
          },
        }
      : undefined;

  const partial = await processJobsByRoom(
    jobs,
    opts.roomConcurrency,
    async (job) =>
      processEngineDrawJob(supabase, log, repo, stateManager, job, {
        maxAttempts: opts.maxAttempts,
        cardRegistry: opts.cardRegistry,
        pickContext: {
          firstPickedAt,
          pickStartTime: pickStep.timing.startTime,
          pickEndTime: pickStep.timing.endTime,
          pickMsPerJob: Math.round(pickPerJobMs * 100) / 100,
          drainStartedAt,
        },
      }),
    roomLock
  );

  return { picked: jobs.length, ...partial };
}
