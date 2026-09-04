import type { Logger } from "../../metrics/logger.js";
import {
  elapsedDingApplyMs,
  logDingApply,
  nowDingApplyMs,
} from "../../metrics/dingApplyObservability.js";
import type { GameRepo } from "../../repositories/index.js";

export interface DingApplyJob {
  id: number;
  draw_id: string;
  room_id: string;
  draw_number: number;
  ding_per_card: number;
  credits: { user_id: string; amount: number; matched_cards?: number }[];
  status: string;
  attempts: number;
  created_at: string;
  updated_at: string;
}

export type DingApplyJobOutcome = "done" | "requeue" | "failed";

export async function processDingApplyJob(
  repo: GameRepo,
  log: Logger,
  job: DingApplyJob,
  opts: { maxAttempts: number }
): Promise<DingApplyJobOutcome> {
  const queueLagMs = Math.max(0, Date.now() - Date.parse(job.created_at));
  const creditCount = Array.isArray(job.credits) ? job.credits.length : 0;

  logDingApply(log, {
    jobId: job.id,
    roomId: job.room_id,
    drawNumber: job.draw_number,
    outcome: "attempt",
    queueLagMs,
    attempt: job.attempts + 1,
    creditCount,
  });

  const applyStarted = nowDingApplyMs();
  try {
    const usersCredited = await repo.applyDingCreditsForDraw({
      roomId: job.room_id,
      drawNumber: job.draw_number,
      dingPerCard: job.ding_per_card,
      credits: job.credits.map((c) => ({
        user_id: c.user_id,
        amount: c.amount,
        matched_cards: c.matched_cards ?? 0,
      })),
    });
    const applyRpcMs = elapsedDingApplyMs(applyStarted);

    await repo.completeDingApplyJob({
      jobId: job.id,
      success: true,
      maxAttempts: opts.maxAttempts,
    });

    logDingApply(log, {
      jobId: job.id,
      roomId: job.room_id,
      drawNumber: job.draw_number,
      outcome: "done",
      queueLagMs,
      applyRpcMs,
      attempt: job.attempts + 1,
      creditCount,
      usersCredited,
    });

    return "done";
  } catch (err) {
    const applyRpcMs = elapsedDingApplyMs(applyStarted);
    const message = err instanceof Error ? err.message : String(err);

    await repo.completeDingApplyJob({
      jobId: job.id,
      success: false,
      error: message,
      maxAttempts: opts.maxAttempts,
    });

    const nextAttempt = job.attempts + 1;
    const failed = nextAttempt >= opts.maxAttempts;

    logDingApply(log, {
      jobId: job.id,
      roomId: job.room_id,
      drawNumber: job.draw_number,
      outcome: "error",
      queueLagMs,
      applyRpcMs,
      attempt: nextAttempt,
      creditCount,
      error: message,
    });

    return failed ? "failed" : "requeue";
  }
}
