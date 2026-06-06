/**
 * Engine-mode draw batch — full TS business logic (GAME_RUNTIME=engine).
 *
 * Same orchestration shell as processDrawBatch (pick → apply → complete →
 * stamp), but marks + win evaluation run in TypeScript (applyMarksAndEvaluate)
 * instead of via DB RPCs.
 *
 * Ding is intentionally NOT aggregated here: stamping draws.processed_at fires
 * the existing DB trigger trg_aggregate_ding_on_processed_at (which we do not
 * delete), so ding stays exactly-once and trigger-driven during migration. The
 * TS port (domain/ding) is available for when that trigger is disabled.
 */

import type { SupabaseAdmin } from "../../db/supabase-admin.js";
import type { Logger } from "../../metrics/logger.js";
import {
  buildDrawPerformanceReport,
  recordDrawSample,
  timedStep,
  type DrawStepBreakdown,
} from "../../metrics/drawPerformance.js";
import { GameRepo } from "../../repositories/index.js";
import { applyMarksAndEvaluate } from "./evaluateDraw.js";
import { pickDrawJobs } from "./pickDrawJobs.js";
import { processJobsByRoom } from "./processJobsByRoom.js";
import { type DrawBatchResult, type DrawJob, EMPTY_BATCH } from "./types.js";

export interface ProcessDrawBatchEngineOptions {
  maxAttempts: number;
  batchSize: number;
  roomConcurrency: number;
}

export async function processDrawBatchEngine(
  supabase: SupabaseAdmin,
  log: Logger,
  opts: ProcessDrawBatchEngineOptions
): Promise<DrawBatchResult> {
  const repo = new GameRepo(supabase);

  const pickStep = await timedStep(() => pickDrawJobs(supabase, opts.batchSize));
  const jobs = pickStep.result;
  if (jobs.length === 0) return { ...EMPTY_BATCH };

  const pickPerJobMs =
    jobs.length > 0 ? pickStep.timing.durationMs / jobs.length : 0;

  log.info("draw-performance-batch", {
    rpc_pick_draw_jobs: pickStep.timing,
    jobsPicked: jobs.length,
    pickMsPerJob: Math.round(pickPerJobMs * 100) / 100,
  });

  const partial = await processJobsByRoom(
    jobs,
    opts.roomConcurrency,
    async (job) => {
      const processingStartedMs = Date.now();
      const queueWaitMs = Math.max(0, processingStartedMs - Date.parse(job.created_at));

      try {
        const evalResult = await applyMarksAndEvaluate(
          supabase,
          repo,
          log,
          job.room_id,
          job.draw_number
        );
        const breakdown = { ...evalResult.breakdown };
        breakdown.rpc_pick_draw_jobs = {
          startTime: pickStep.timing.startTime,
          endTime: pickStep.timing.endTime,
          durationMs: Math.round(pickPerJobMs * 100) / 100,
        };

        const completeStep = await timedStep(() => completeJob(supabase, job));
        breakdown.completeJob = completeStep.timing;

        const stampTiming = await stampDrawProcessed(supabase, repo, log, job);
        breakdown.stampDrawProcessed = stampTiming;

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
          settled: evalResult.settled,
          breakdown,
        });

        recordDrawSample(report.totalDurationMs, queueWaitMs);
        log.info("draw-performance", { DrawPerformance: report });

        return "done" as const;
      } catch (err) {
        return handleFailure(supabase, log, job, opts, err);
      }
    }
  );

  return { picked: jobs.length, ...partial };
}

async function completeJob(supabase: SupabaseAdmin, job: DrawJob): Promise<void> {
  const { error } = await supabase
    .from("draw_jobs")
    .update({ status: "done", updated_at: new Date().toISOString() })
    .eq("id", job.id);
  if (error) throw new Error(`draw_jobs done update: ${error.message}`);
}

async function stampDrawProcessed(
  supabase: SupabaseAdmin,
  repo: GameRepo,
  log: Logger,
  job: DrawJob
): Promise<DrawStepBreakdown["stampDrawProcessed"]> {
  const stampStart = new Date().toISOString();
  const t0 = performance.now();
  try {
    const { count, error } = await supabase
      .from("draw_jobs")
      .select("id", { count: "exact", head: true })
      .eq("room_id", job.room_id)
      .eq("draw_number", job.draw_number)
      .neq("status", "done");
    if (error) throw error;
    if ((count ?? 0) > 0) {
      return {
        startTime: stampStart,
        endTime: new Date().toISOString(),
        durationMs: Math.round((performance.now() - t0) * 100) / 100,
      };
    }
    await repo.stampDrawProcessed(job.room_id, job.draw_number, new Date().toISOString());
  } catch (err) {
    log.warn("stamp draws.processed_at skipped", {
      roomId: job.room_id,
      drawNumber: job.draw_number,
      error: err instanceof Error ? err.message : String(err),
    });
  }
  return {
    startTime: stampStart,
    endTime: new Date().toISOString(),
    durationMs: Math.round((performance.now() - t0) * 100) / 100,
  };
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
