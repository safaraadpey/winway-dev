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
  const jobs = await pickDrawJobs(supabase, opts.batchSize);
  if (jobs.length === 0) return { ...EMPTY_BATCH };

  const partial = await processJobsByRoom(
    jobs,
    opts.roomConcurrency,
    async (job) => {
      try {
        await applyMarksAndEvaluate(supabase, repo, log, job.room_id, job.draw_number);
        await completeJob(supabase, job);
        await stampDrawProcessed(supabase, repo, log, job);
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
): Promise<void> {
  try {
    const { count, error } = await supabase
      .from("draw_jobs")
      .select("id", { count: "exact", head: true })
      .eq("room_id", job.room_id)
      .eq("draw_number", job.draw_number)
      .neq("status", "done");
    if (error) throw error;
    if ((count ?? 0) > 0) return;
    await repo.stampDrawProcessed(job.room_id, job.draw_number, new Date().toISOString());
  } catch (err) {
    log.warn("stamp draws.processed_at skipped", {
      roomId: job.room_id,
      drawNumber: job.draw_number,
      error: err instanceof Error ? err.message : String(err),
    });
  }
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
