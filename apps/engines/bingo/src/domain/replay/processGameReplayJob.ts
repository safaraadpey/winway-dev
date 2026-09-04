import type { Logger } from "../../metrics/logger.js";
import type { GameRepo } from "../../repositories/index.js";
import type { RawCardNumber } from "../../core/card-registry/build.js";
import { diffReplayAgainstPersisted } from "./compareReplay.js";
import { parseGameManifestPayload } from "./parseManifest.js";
import { replayGame } from "./replayGame.js";
import type { GameReplayJobRow, PersistedGameplaySnapshot, ReplayAuditOutcome } from "./types.js";

export async function processGameReplayJob(
  repo: GameRepo,
  log: Logger,
  job: GameReplayJobRow
): Promise<ReplayAuditOutcome> {
  const t0 = Date.now();
  const roomId = job.room_id;

  try {
    const row = await repo.getGameManifestRow(roomId);
    if (!row) {
      await writeAudit(repo, log, {
        roomId,
        jobId: job.id,
        outcome: "ERROR",
        errorCode: "manifest_missing",
        durationMs: Date.now() - t0,
      });
      await repo.completeGameReplayJob(job.id, "ERROR", "manifest_missing");
      return "ERROR";
    }

    const manifest = parseGameManifestPayload(row.payload, {
      rngAlgorithm: row.rng_algorithm,
      rngVersion: row.rng_version,
      manifestVersion: row.manifest_version,
    });

    const cardNumbers = (await repo.getCardNumbersForPoolCardIds(
      manifest.tickets.map((t) => t.poolCardId)
    )) as RawCardNumber[];

    const replay = replayGame({ manifest, cardNumbers });
    const results = await repo.getResults(roomId);
    const marksByTicket = await repo.getMarksForTickets(manifest.tickets.map((t) => t.ticketId));
    const persistedMarks = [];
    for (const [ticketId, values] of marksByTicket) {
      for (const value of values) persistedMarks.push({ ticketId, value });
    }

    const persisted: PersistedGameplaySnapshot = {
      drawSequence: await repo.getProcessedDrawSequence(roomId),
      marks: persistedMarks,
      lineWinners: results
        .filter((r) => r.win_type === "line")
        .map((r) => ({
          ticketId: r.ticket_id,
          userId: r.user_id,
          drawNumber: r.draw_number,
        })),
      fullWinners: results
        .filter((r) => r.win_type === "full")
        .map((r) => ({
          ticketId: r.ticket_id,
          userId: r.user_id,
          drawNumber: r.draw_number,
        })),
      dingByUser: await repo.getDingTotalsByUser(roomId),
      lineRewardAmounts: results
        .filter((r) => r.win_type === "line")
        .map((r) => Number(r.reward_amount ?? 0)),
      fullRewardAmounts: results
        .filter((r) => r.win_type === "full")
        .map((r) => Number(r.reward_amount ?? 0)),
    };

    const diff = diffReplayAgainstPersisted(replay, persisted);
    const durationMs = Date.now() - t0;

    await writeAudit(repo, log, {
      roomId,
      jobId: job.id,
      outcome: diff.outcome,
      manifestVersion: replay.manifestVersion,
      rngVersion: replay.rngVersion,
      drawDiffCount: diff.drawDiffCount,
      markDiffCount: diff.markDiffCount,
      resultDiffCount: diff.resultDiffCount,
      dingDiff: diff.dingDiff,
      winnerMismatch: diff.winnerMismatch,
      prizeMismatch: diff.prizeMismatch,
      stoppedReason: replay.stoppedReason,
      durationMs,
    });
    await repo.completeGameReplayJob(job.id, diff.outcome, null);
    return diff.outcome;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const durationMs = Date.now() - t0;
    const deterministic =
      message.includes("grid_fingerprint") ||
      message.includes("room_seed") ||
      message.includes("unsupported rng") ||
      message.includes("empty ticket");

    log.error("[GameReplayAudit]", {
      roomId,
      jobId: job.id,
      outcome: "ERROR",
      error: message,
      replayDurationMs: durationMs,
    });

    try {
      await repo.insertGameReplayAudit({
        room_id: roomId,
        job_id: job.id,
        manifest_version: null,
        rng_version: null,
        outcome: "ERROR",
        draw_diff_count: 0,
        mark_diff_count: 0,
        result_diff_count: 0,
        ding_diff: 0,
        winner_mismatch: false,
        prize_mismatch: false,
        stopped_reason: null,
        error_code: deterministic ? "replay_error" : "transient_error",
        replay_duration_ms: durationMs,
        details: { error: message },
      });
    } catch {
      // audit insert must not mask job completion
    }

    if (deterministic) {
      await repo.completeGameReplayJob(job.id, "ERROR", message);
      return "ERROR";
    }
    await repo.failGameReplayJob(job.id, message);
    return "ERROR";
  }
}

async function writeAudit(
  repo: GameRepo,
  log: Logger,
  args: {
    roomId: string;
    jobId: number;
    outcome: ReplayAuditOutcome;
    manifestVersion?: number;
    rngVersion?: string;
    drawDiffCount?: number;
    markDiffCount?: number;
    resultDiffCount?: number;
    dingDiff?: number;
    winnerMismatch?: boolean;
    prizeMismatch?: boolean;
    stoppedReason?: string;
    errorCode?: string;
    durationMs: number;
  }
): Promise<void> {
  log.info("[GameReplayAudit]", {
    roomId: args.roomId,
    jobId: args.jobId,
    manifestVersion: args.manifestVersion ?? null,
    rngVersion: args.rngVersion ?? null,
    drawDiffCount: args.drawDiffCount ?? 0,
    markDiffCount: args.markDiffCount ?? 0,
    resultDiffCount: args.resultDiffCount ?? 0,
    dingDiff: args.dingDiff ?? 0,
    winnerMismatch: args.winnerMismatch ?? false,
    prizeMismatch: args.prizeMismatch ?? false,
    outcome: args.outcome,
    replayDurationMs: args.durationMs,
    errorCode: args.errorCode ?? null,
    stoppedReason: args.stoppedReason ?? null,
  });

  try {
    await repo.insertGameReplayAudit({
      room_id: args.roomId,
      job_id: args.jobId,
      manifest_version: args.manifestVersion ?? null,
      rng_version: args.rngVersion ?? null,
      outcome: args.outcome,
      draw_diff_count: args.drawDiffCount ?? 0,
      mark_diff_count: args.markDiffCount ?? 0,
      result_diff_count: args.resultDiffCount ?? 0,
      ding_diff: args.dingDiff ?? 0,
      winner_mismatch: args.winnerMismatch ?? false,
      prize_mismatch: args.prizeMismatch ?? false,
      stopped_reason: args.stoppedReason ?? null,
      error_code: args.errorCode ?? null,
      replay_duration_ms: args.durationMs,
    });
  } catch (err) {
    log.warn("[GameReplayAudit] audit insert failed (non-critical)", {
      roomId: args.roomId,
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

/** Reconcile missed jobs after restart, then process a small batch. Never throws. */
export async function runShadowReplayTick(
  repo: GameRepo,
  log: Logger,
  opts?: { pickLimit?: number; enqueueLimit?: number; staleSec?: number }
): Promise<void> {
  try {
    await repo.reapStaleGameReplayJobs(opts?.staleSec ?? 120);
    const enqueued = await repo.enqueueMissingGameReplayJobs(opts?.enqueueLimit ?? 50);
    if (enqueued > 0) {
      log.info("[GameReplayAudit] enqueued missing jobs", { enqueued });
    }
    const jobs = await repo.pickGameReplayJobs(opts?.pickLimit ?? 5);
    for (const job of jobs) {
      await processGameReplayJob(repo, log, {
        id: Number(job.id),
        room_id: job.room_id,
        status: job.status,
        attempts: Number(job.attempts),
        created_at: job.created_at,
      });
    }
  } catch (err) {
    log.warn("[GameReplayAudit] tick error", {
      error: err instanceof Error ? err.message : String(err),
    });
  }
}
