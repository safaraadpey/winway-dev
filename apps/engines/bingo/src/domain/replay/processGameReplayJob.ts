import type { Logger } from "../../metrics/logger.js";
import type { GameRepo } from "../../repositories/index.js";
import { isManifestRamMode } from "../../repositories/types.js";
import type { RawCardNumber } from "../../core/card-registry/build.js";
import { diffManifestRamReplay } from "./compareManifestRamAudit.js";
import { diffReplayAgainstPersisted } from "./compareReplay.js";
import { parseGameManifestPayload } from "./parseManifest.js";
import { buildManifestRamAuditFinalization } from "./manifestRamAuditSim.js";
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

    const room = await repo.getRoom(roomId);
    const manifestRam = isManifestRamMode(room?.gameplay_persist_mode);

    const manifest = parseGameManifestPayload(row.payload, {
      rngAlgorithm: row.rng_algorithm,
      rngVersion: row.rng_version,
      manifestVersion: row.manifest_version,
    });

    const cardNumbers = (await repo.getCardNumbersForPoolCardIds(
      manifest.tickets.map((t) => t.poolCardId)
    )) as RawCardNumber[];

    const { replay, finalization } = manifestRam
      ? buildManifestRamAuditFinalization(manifest, cardNumbers, room)
      : { replay: replayGame({ manifest, cardNumbers }), finalization: null };
    const results = await repo.getResults(roomId);
    const marksByTicket = await repo.getMarksForTickets(manifest.tickets.map((t) => t.ticketId));
    const persistedMarks = [];
    for (const [ticketId, values] of marksByTicket) {
      for (const value of values) persistedMarks.push({ ticketId, value });
    }

    const ticketRoster = await repo.getTicketRosterAudit(roomId);
    const participatingTicketIds = ticketRoster
      .filter(
        (t) =>
          t.cancelled_at == null &&
          (t.reservation_status === "reserved" ||
            t.reservation_status === "confirmed" ||
            t.reservation_status === "consumed")
      )
      .map((t) => t.id);
    const postManifestTicketCount = ticketRoster.filter(
      (t) => Date.parse(t.created_at) > Date.parse(row.created_at)
    ).length;

    const drawSequence = manifestRam
      ? await repo.getDrawSequenceByInsertOrder(roomId)
      : await repo.getProcessedDrawSequence(roomId);

    const persisted: PersistedGameplaySnapshot = {
      drawSequence,
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
      manifestTicketIds: manifest.tickets.map((t) => t.ticketId),
      participatingTicketIds,
      postManifestTicketCount,
    };

    const diff = manifestRam
      ? diffManifestRamReplay(replay, persisted, {
          storedFinalizationSha256: room?.finalization_sha256 ?? null,
          auditFinalizationSha256: finalization!.resultSha256,
          unexpectedPerDrawWrites: await repo.countUnexpectedPreFinalizationWrites(roomId),
        })
      : diffReplayAgainstPersisted(replay, persisted);

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
      rosterMismatch: diff.rosterMismatch,
      drawCountMismatch: diff.drawCountMismatch,
      postManifestTicketCount: diff.postManifestTicketCount,
      unexpectedPerDrawWrites: diff.unexpectedPerDrawWrites,
      finalizationChecksumMismatch: diff.finalizationChecksumMismatch,
      gameplayPersistMode: manifestRam ? "manifest_ram" : "per_draw",
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

/** Manual re-audit for a finished room (does not mutate gameplay). */
export async function auditGameRoom(
  repo: GameRepo,
  log: Logger,
  roomId: string
): Promise<ReplayAuditOutcome> {
  return processGameReplayJob(repo, log, {
    id: 0,
    room_id: roomId,
    status: "manual",
    attempts: 0,
    created_at: new Date().toISOString(),
  });
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
    rosterMismatch?: boolean;
    drawCountMismatch?: boolean;
    postManifestTicketCount?: number;
    unexpectedPerDrawWrites?: number;
    finalizationChecksumMismatch?: boolean;
    gameplayPersistMode?: "per_draw" | "manifest_ram";
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
    gameplayPersistMode: args.gameplayPersistMode ?? null,
    drawDiffCount: args.drawDiffCount ?? 0,
    markDiffCount: args.markDiffCount ?? 0,
    resultDiffCount: args.resultDiffCount ?? 0,
    dingDiff: args.dingDiff ?? 0,
    winnerMismatch: args.winnerMismatch ?? false,
    prizeMismatch: args.prizeMismatch ?? false,
    rosterMismatch: args.rosterMismatch ?? false,
    drawCountMismatch: args.drawCountMismatch ?? false,
    postManifestTicketCount: args.postManifestTicketCount ?? 0,
    unexpectedPerDrawWrites: args.unexpectedPerDrawWrites ?? 0,
    finalizationChecksumMismatch: args.finalizationChecksumMismatch ?? false,
    outcome: args.outcome,
    replayDurationMs: args.durationMs,
    errorCode: args.errorCode ?? null,
    stoppedReason: args.stoppedReason ?? null,
  });

  try {
    await repo.insertGameReplayAudit({
      room_id: args.roomId,
      job_id: args.jobId > 0 ? args.jobId : null,
      manifest_version: args.manifestVersion ?? null,
      rng_version: args.rngVersion ?? null,
      outcome: args.outcome,
      draw_diff_count: args.drawDiffCount ?? 0,
      mark_diff_count: args.markDiffCount ?? 0,
      result_diff_count: args.resultDiffCount ?? 0,
      ding_diff: args.dingDiff ?? 0,
      winner_mismatch: args.winnerMismatch ?? false,
      prize_mismatch: args.prizeMismatch ?? false,
      roster_mismatch: args.rosterMismatch ?? false,
      draw_count_mismatch: args.drawCountMismatch ?? false,
      post_manifest_ticket_count: args.postManifestTicketCount ?? 0,
      unexpected_per_draw_writes: args.unexpectedPerDrawWrites ?? 0,
      finalization_checksum_mismatch: args.finalizationChecksumMismatch ?? false,
      stopped_reason: args.stoppedReason ?? null,
      error_code: args.errorCode ?? null,
      replay_duration_ms: args.durationMs,
      details:
        args.gameplayPersistMode != null
          ? { gameplay_persist_mode: args.gameplayPersistMode }
          : undefined,
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
