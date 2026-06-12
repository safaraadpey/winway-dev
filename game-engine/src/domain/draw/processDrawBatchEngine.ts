/**
 * Engine-mode draw batch — full TS business logic (GAME_RUNTIME=engine).
 *
 * Same orchestration shell as processDrawBatch (pick → apply → complete →
 * stamp), but marks + win evaluation run in TypeScript (applyMarksAndEvaluate)
 * instead of via DB RPCs.
 *
 * Ding credits are computed in TypeScript and persisted inside
 * rpc_finalize_engine_draw_job (single RTT). The DB trigger
 * trg_aggregate_ding_on_processed_at is disabled.
 */

import type { GlobalCardRegistry } from "../../core/card-registry/types.js";
import type { SupabaseAdmin } from "../../db/supabase-admin.js";
import { prepareDingCreditsFromState } from "../ding/index.js";
import { settleRoomIfNeeded } from "../../finance/settleRoom.js";
import type { Logger } from "../../metrics/logger.js";
import {
  buildDrawPerformanceReport,
  recordDrawSample,
  timedStep,
} from "../../metrics/drawPerformance.js";
import { redisKeys } from "../../redis/keys.js";
import type { GameRedis } from "../../redis/types.js";
import { GameRepo } from "../../repositories/index.js";
import type { RoomStateManager } from "../../state/room-state.manager.js";
import { deferDrawJobToQueue, shouldDeferDrawJob } from "./drawJobOrdering.js";
import { applyMarksAndEvaluateWithState } from "./evaluateDraw.js";
import {
  emitPickDebugSnapshot,
  type PickDebugContext,
} from "./pickDebugSnapshot.js";
import { pickDrawJobs } from "./pickDrawJobs.js";
import { processJobsByRoom } from "./processJobsByRoom.js";
import type { DrainMonitorContext } from "./drainMonitor.js";
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
    async (job) => {
      const handlerStartedMs = Date.now();
      const handlerStartedAt = new Date(handlerStartedMs).toISOString();
      const queueWaitMs = Math.max(
        0,
        handlerStartedMs - Date.parse(job.created_at)
      );

      try {
        const processingStartMs = Date.now();
        const roomState = await stateManager.ensureLoaded(job.room_id);

        if (
          await shouldDeferDrawJob(
            repo,
            job.room_id,
            job.draw_number,
            roomState
          )
        ) {
          stateManager.requestReconcile(job.room_id);
          return deferDrawJobToQueue(supabase, log, job);
        }

        const evalResult = await applyMarksAndEvaluateWithState(
          supabase,
          repo,
          log,
          roomState,
          stateManager,
          job.draw_number,
          {
            persist: false,
            deferSettlement: true,
            cardRegistry: opts.cardRegistry,
          }
        );
        const breakdown = { ...evalResult.breakdown };
        breakdown.rpc_pick_draw_jobs = {
          startTime: pickStep.timing.startTime,
          endTime: pickStep.timing.endTime,
          durationMs: Math.round(pickPerJobMs * 100) / 100,
        };

        const persistence = evalResult.persistence;
        if (!persistence) {
          throw new Error("engine draw missing persistence payload");
        }

        const state = roomState;
        const dingPayload = state
          ? prepareDingCreditsFromState(state, job.draw_number, persistence.marks)
          : { dingPerCard: 0, credits: [] as { user_id: string; amount: number; matched_cards: number }[] };

        const processingMs = Date.now() - processingStartMs;

        const finalizeStep = await timedStep(async () => {
          const credited = await repo.finalizeEngineDrawJob({
            jobId: job.id,
            roomId: job.room_id,
            drawNumber: job.draw_number,
            marks: persistence.marks,
            results: persistence.results,
            setFirstLineDrawNumber: persistence.setFirstLineDrawNumber,
            dingPerCard: dingPayload.dingPerCard,
            dingCredits: dingPayload.credits,
            queueWaitMs,
            processingMs,
            drainStartedAt,
            firstPickedAt,
            handlerStartedAt,
          });
          if (credited > 0) {
            log.info("ding aggregated (engine)", {
              roomId: job.room_id,
              drawNumber: job.draw_number,
              users: credited,
            });
          }
        });
        breakdown.rpc_finalize_engine_draw_job = finalizeStep.timing;

        let settled = evalResult.settled;
        // Hot-path settle only when this draw produced a full winner, or a full
        // result already exists for an unfinished room (in-memory recovery from
        // the authority refresh — covers a crash between finalize and settle
        // without an extra DB round-trip). The per-draw roomNeedsSettlement()
        // probe (getRoom + hasUnpaidFullWinner) is removed from the hot path.
        const hasUnsettledFull =
          state != null &&
          state.room.status !== "finished" &&
          state.existingFullTickets.size > 0;
        const needsSettle = evalResult.fullWinnerThisDraw || hasUnsettledFull;
        if (needsSettle) {
          try {
            const settleStep = await timedStep(() =>
              settleRoomIfNeeded(supabase, repo, job.room_id, {
                fullWinnerThisDraw: true,
              })
            );
            if (settleStep.result) {
              breakdown.fn_finish_room_and_settle = settleStep.timing;
              settled = true;
              stateManager.evict(job.room_id);
              log.info("room settled (full winner)", {
                roomId: job.room_id,
                drawNumber: job.draw_number,
              });
            }
          } catch (settleErr) {
            log.error("room settlement failed (draw already finalized)", {
              roomId: job.room_id,
              drawNumber: job.draw_number,
              error:
                settleErr instanceof Error ? settleErr.message : String(settleErr),
            });
          }
        }

        const report = buildDrawPerformanceReport({
          roomId: job.room_id,
          drawId: job.id,
          drawNumber: job.draw_number,
          ticketCount: evalResult.ticketCount,
          cardCount: evalResult.cardCount,
          cardNumberRows: evalResult.cardNumberRows,
          marksInserted: evalResult.marksInserted,
          marksReadCount: evalResult.marksReadCount,
          queueWaitMs,
          processingMs,
          finalizeMs: finalizeStep.timing.durationMs,
          drainStartedAt,
          firstPickedAt,
          handlerStartedAt,
          settled,
          breakdown,
        });

        recordDrawSample(report.totalDurationMs, queueWaitMs);
        log.info("draw-performance", { DrawPerformance: report });

        return "done" as const;
      } catch (err) {
        return handleFailure(supabase, log, job, opts, err);
      }
    },
    roomLock
  );

  return { picked: jobs.length, ...partial };
}

async function handleFailure(
  supabase: SupabaseAdmin,
  log: Logger,
  job: DrawJob,
  opts: ProcessDrawBatchEngineOptions,
  err: unknown
): Promise<"requeue" | "dead-letter"> {
  const nextAttempts = (job.attempts ?? 0) + 1;
  const deadLetter = nextAttempts >= opts.maxAttempts;
  await supabase
    .from("draw_jobs")
    .update({
      status: deadLetter ? "failed" : "queued",
      attempts: nextAttempts,
      updated_at: new Date().toISOString(),
    })
    .eq("id", job.id);

  log[deadLetter ? "error" : "warn"]("engine draw job failure", {
    jobId: job.id,
    roomId: job.room_id,
    drawNumber: job.draw_number,
    attempts: nextAttempts,
    error: err instanceof Error ? err.message : String(err),
  });
  return deadLetter ? "dead-letter" : "requeue";
}
