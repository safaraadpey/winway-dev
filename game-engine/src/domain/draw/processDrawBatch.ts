import type { SupabaseAdmin } from "../../db/supabase-admin.js";
import type { Logger } from "../../metrics/logger.js";
import { type DrawBatchResult, type DrawJob, EMPTY_BATCH } from "./types.js";

export interface ProcessDrawBatchOptions {
  /** Requeue a failing job until attempts reaches this, then park as 'failed'. */
  maxAttempts: number;
}

/**
 * Phase 1 (hybrid): orchestration only. Mirrors public.fn_process_draw_jobs_batch_worker
 * but driven from the engine instead of pg_cron. All game/finance logic stays in DB RPCs:
 *
 *   1. rpc_pick_draw_jobs()            atomic FOR UPDATE SKIP LOCKED claim (queued -> processing)
 *   2. rpc_apply_marks_for_draw(...)   inserts marks (idempotent) + evaluates line/full
 *   3. fn_evaluate_room_after_draw(..) re-evaluates; settles+pays via fn_finish_room_and_settle
 *                                      (idempotent) when a full house is found
 *   4. mark draw_jobs done; stamp draws.processed_at when the draw is fully consumed
 *
 * Payout is NOT called here directly — fn_evaluate_room_after_draw owns settlement,
 * exactly like the current DB batch worker, so behaviour is identical to prod.
 */
export async function processDrawBatch(
  supabase: SupabaseAdmin,
  log: Logger,
  opts: ProcessDrawBatchOptions
): Promise<DrawBatchResult> {
  const { data, error } = await supabase.rpc("rpc_pick_draw_jobs");
  if (error) {
    throw new Error(`rpc_pick_draw_jobs failed: ${error.message}`);
  }

  const jobs = (data ?? []) as DrawJob[];
  if (jobs.length === 0) return { ...EMPTY_BATCH };

  const result: DrawBatchResult = { ...EMPTY_BATCH, picked: jobs.length };

  for (const job of jobs) {
    try {
      await applyDraw(supabase, job);
      await completeJob(supabase, job);
      await stampDrawProcessed(supabase, log, job);
      result.done += 1;
    } catch (err) {
      const handled = await handleJobFailure(supabase, log, job, opts, err);
      if (handled === "dead-letter") result.deadLettered += 1;
      else result.requeued += 1;
    }
  }

  return result;
}

async function applyDraw(supabase: SupabaseAdmin, job: DrawJob): Promise<void> {
  const marks = await supabase.rpc("rpc_apply_marks_for_draw", {
    p_room_id: job.room_id,
    p_draw_number: job.draw_number,
  });
  if (marks.error) {
    throw new Error(`rpc_apply_marks_for_draw: ${marks.error.message}`);
  }

  const evaluate = await supabase.rpc("fn_evaluate_room_after_draw", {
    p_room_id: job.room_id,
    p_draw_number: job.draw_number,
  });
  if (evaluate.error) {
    throw new Error(`fn_evaluate_room_after_draw: ${evaluate.error.message}`);
  }
}

async function completeJob(
  supabase: SupabaseAdmin,
  job: DrawJob
): Promise<void> {
  const { error } = await supabase
    .from("draw_jobs")
    .update({ status: "done", updated_at: new Date().toISOString() })
    .eq("id", job.id);
  if (error) {
    throw new Error(`draw_jobs done update: ${error.message}`);
  }
}

/**
 * Best-effort: when no non-done jobs remain for this (room, draw_number),
 * the draw is fully applied, so stamp draws.processed_at. Tolerates a missing
 * column on drifted dev branches — never fails the job over bookkeeping.
 */
async function stampDrawProcessed(
  supabase: SupabaseAdmin,
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

    const update = await supabase
      .from("draws")
      .update({ processed_at: new Date().toISOString() })
      .eq("room_id", job.room_id)
      .eq("number", job.draw_number)
      .is("processed_at", null);
    if (update.error) throw update.error;
  } catch (err) {
    log.warn("stamp draws.processed_at skipped", {
      roomId: job.room_id,
      drawNumber: job.draw_number,
      error: errMessage(err),
    });
  }
}

async function handleJobFailure(
  supabase: SupabaseAdmin,
  log: Logger,
  job: DrawJob,
  opts: ProcessDrawBatchOptions,
  err: unknown
): Promise<"requeue" | "dead-letter"> {
  const nextAttempts = (job.attempts ?? 0) + 1;
  const deadLetter = nextAttempts >= opts.maxAttempts;
  const status = deadLetter ? "failed" : "queued";

  const { error: updateError } = await supabase
    .from("draw_jobs")
    .update({
      status,
      attempts: nextAttempts,
      updated_at: new Date().toISOString(),
    })
    .eq("id", job.id);

  const logMeta = {
    jobId: job.id,
    roomId: job.room_id,
    drawNumber: job.draw_number,
    attempts: nextAttempts,
    error: errMessage(err),
  };

  if (updateError) {
    log.error("draw job failure + status update failed", {
      ...logMeta,
      updateError: updateError.message,
    });
  } else if (deadLetter) {
    log.error("draw job dead-lettered (max attempts reached)", logMeta);
  } else {
    log.warn("draw job requeued", logMeta);
  }

  return deadLetter ? "dead-letter" : "requeue";
}

function errMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
