import type { GlobalCardRegistry } from "../../core/card-registry/types.js";
import type { SupabaseAdmin } from "../../db/supabase-admin.js";
import { settleRoomIfNeeded } from "../../finance/settleRoom.js";
import type { Logger } from "../../metrics/logger.js";
import {
  buildDrawPerformanceReport,
  recordDrawSample,
  timedStep,
} from "../../metrics/drawPerformance.js";
import { GameRepo } from "../../repositories/index.js";
import type { RoomStateManager } from "../../state/room-state.manager.js";
import { prepareDingCreditsFromState } from "../ding/index.js";
import type { DrawJobPickContext } from "./drawJobPickContext.js";
import { deferDrawJobToQueue, shouldDeferDrawJob } from "./drawJobOrdering.js";
import { applyMarksAndEvaluateWithState } from "./evaluateDraw.js";
import type { DrawJob } from "./types.js";

export type EngineJobOutcome = "done" | "requeue" | "dead-letter" | "fenced";

export interface ProcessEngineDrawJobOptions {
  maxAttempts: number;
  cardRegistry?: GlobalCardRegistry | null;
  pickContext: DrawJobPickContext;
  /** Skip getDraw when the caller just inserted this draw (actor hot path). */
  skipExistingCheck?: boolean;
  /** Stamp actor_evaluate/finalize columns on finalize RPC. */
  actorTiming?: boolean;
  /** Room-loop ownership fence for actor finalization. */
  leaseFence?: { ownerId: string; leaseEpoch: number } | null;
}

export async function processEngineDrawJob(
  supabase: SupabaseAdmin,
  log: Logger,
  repo: GameRepo,
  stateManager: RoomStateManager,
  job: DrawJob,
  opts: ProcessEngineDrawJobOptions
): Promise<EngineJobOutcome> {
  const handlerStartedMs = Date.now();
  const handlerStartedAt = new Date(handlerStartedMs).toISOString();
  const queueWaitMs = Math.max(0, handlerStartedMs - Date.parse(job.created_at));
  const { pickContext } = opts;

  try {
    if (!opts.skipExistingCheck) {
      const existingDraw = await repo.getDraw(job.room_id, job.draw_number);
      if (existingDraw?.processed_at) {
        await repo.completeDrawJobs([job.id]);
        return "done";
      }
    }

    const processingStartMs = Date.now();
    const actorEvaluateStartedAt = opts.actorTiming
      ? new Date(processingStartMs).toISOString()
      : null;
    const roomState = await stateManager.ensureLoaded(job.room_id);

    if (
      await shouldDeferDrawJob(repo, job.room_id, job.draw_number, roomState)
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
      startTime: pickContext.pickStartTime,
      endTime: pickContext.pickEndTime,
      durationMs: pickContext.pickMsPerJob,
    };

    const persistence = evalResult.persistence;
    if (!persistence) {
      throw new Error("engine draw missing persistence payload");
    }

    const state = roomState;
    const dingPayload = state
      ? prepareDingCreditsFromState(state, job.draw_number, persistence.marks)
      : {
          dingPerCard: 0,
          credits: [] as {
            user_id: string;
            amount: number;
            matched_cards: number;
          }[],
        };

    const processingMs = Date.now() - processingStartMs;
    const actorFinalizeStartedAt = opts.actorTiming
      ? new Date().toISOString()
      : null;

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
        drainStartedAt: pickContext.drainStartedAt,
        firstPickedAt: pickContext.firstPickedAt,
        handlerStartedAt,
        actorEvaluateStartedAt,
        actorFinalizeStartedAt,
        ownerId: opts.leaseFence?.ownerId ?? null,
        leaseEpoch: opts.leaseFence?.leaseEpoch ?? null,
      });
      if (credited === -1) {
        log.warn("[Room] finalize fenced — stale lease epoch or owner", {
          roomId: job.room_id,
          drawNumber: job.draw_number,
          ownerId: opts.leaseFence?.ownerId,
          leaseEpoch: opts.leaseFence?.leaseEpoch,
        });
        stateManager.evict(job.room_id);
        return -1;
      }
      if (credited > 0) {
        log.info("ding aggregated (engine)", {
          roomId: job.room_id,
          drawNumber: job.draw_number,
          users: credited,
        });
      }
    });
    breakdown.rpc_finalize_engine_draw_job = finalizeStep.timing;

    if (finalizeStep.result === -1) {
      return "fenced";
    }

    let settled = evalResult.settled;
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
      drainStartedAt: pickContext.drainStartedAt,
      firstPickedAt: pickContext.firstPickedAt,
      handlerStartedAt,
      settled,
      breakdown,
    });

    recordDrawSample(report.totalDurationMs, queueWaitMs);
    log.info("draw-performance", { DrawPerformance: report });

    return "done";
  } catch (err) {
    return handleFailure(supabase, log, job, opts, err);
  }
}

async function handleFailure(
  supabase: SupabaseAdmin,
  log: Logger,
  job: DrawJob,
  opts: ProcessEngineDrawJobOptions,
  err: unknown
): Promise<EngineJobOutcome> {
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
