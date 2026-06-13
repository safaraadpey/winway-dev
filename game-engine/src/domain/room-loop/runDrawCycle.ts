/**
 * runOneDrawCycle — the room-actor write path (Phase 4).
 *
 * One full draw step for a room the actor owns:
 *   recover (oldest unprocessed first, when needsRecovery)
 *     → due check (cached room row)
 *     → pick next provably-fair number (in-memory drawn set)
 *     → owner-guarded insert (atomic: draw + actor_* + next_draw_at + lease)
 *     → evaluate in-memory + finalize (reused processEngineDrawJob)
 *     → schedule next via msUntilDue(next_draw_at).
 *
 * Settlement is synchronous: processEngineDrawJob settles on a full winner and
 * evicts the room, so the next cycle sees status != 'playing' and exits.
 * Ding stays inside the finalize RPC (single path → no double Ding).
 */
import { pickNextNumber } from "../../core/index.js";
import { parseBytea } from "../../repositories/index.js";
import { finishExhaustedRoom } from "../room/reconcileWinners.js";
import { processEngineDrawJob } from "../draw/processEngineDrawJob.js";
import type { DrawJob } from "../draw/types.js";
import type {
  RoomCycleResult,
  RoomGameActor,
} from "../../workers/room-loop/roomGameActor.js";
import { recoverRoom } from "./recoverRoom.js";
import { cadenceDelayMs, drawIntervalSec, msUntilDue } from "./scheduleNextDraw.js";

/** Tolerance: fire the draw if it is due within this many ms. */
const DUE_TOLERANCE_MS = 30;

async function refreshCachedRoom(actor: RoomGameActor): Promise<void> {
  const refreshed = await actor.repo.getRoom(actor.roomId);
  if (refreshed) {
    actor.room = refreshed;
  }
}

export async function runOneDrawCycle(
  actor: RoomGameActor
): Promise<RoomCycleResult> {
  const { repo, supabase, log, stateManager } = actor;
  const roomId = actor.roomId;

  // 1. Recovery: process any unprocessed draw before inserting a new one.
  const recovered = await recoverRoom(actor);
  if (recovered === "processed") {
    return {
      kind: "drew",
      nextDueMs: cadenceDelayMs(actor.room.next_draw_at),
    };
  }
  if (recovered === "requeue") {
    actor.markNeedsRecovery();
    return { kind: "idle", retryMs: 200 };
  }

  // 2. Cached room authority — RPC owner-guard enforces status/lease on insert.
  const room = actor.room;
  if (room.status !== "playing") {
    return { kind: "exhausted" };
  }

  // 3. Not due yet → sleep precisely until it is.
  const due = msUntilDue(room.next_draw_at);
  if (due > DUE_TOLERANCE_MS) {
    return { kind: "idle", retryMs: due };
  }

  // 4. Pick the next provably-fair number from in-memory state.
  const seed = parseBytea(room.room_seed);
  if (!seed) {
    log.error("room-loop actor: room has no seed", { roomId });
    return { kind: "idle", retryMs: 1000 };
  }
  const state = await stateManager.ensureLoaded(roomId);
  const drawn = [...state.getDrawnNumbers()];
  const next = pickNextNumber(seed, drawn);
  if (next === null) {
    await finishExhaustedRoom(supabase, repo, log, roomId, stateManager);
    return { kind: "exhausted" };
  }

  // 5. Owner-guarded insert (atomic draw + clock advance + lease renew).
  const intervalSec = drawIntervalSec(room.meta);
  const cycleStartMs = Date.now();
  const nowIso = new Date(cycleStartMs).toISOString();
  const insertResult = await repo.insertDrawIfReadyForOwner({
    roomId,
    number: next,
    nowIso,
    ownerId: actor.ownerId,
    drawIntervalSec: intervalSec,
    actorDueAtIso: room.next_draw_at,
  });

  switch (insertResult.outcome) {
    case "not_owner":
      return { kind: "not_owner" };
    case "not_playing":
      await refreshCachedRoom(actor);
      return { kind: "exhausted" };
    case "exhausted":
      await refreshCachedRoom(actor);
      await finishExhaustedRoom(supabase, repo, log, roomId, stateManager);
      return { kind: "exhausted" };
    case "backpressure":
      actor.markNeedsRecovery();
      actor.metrics.noteBackpressure();
      return { kind: "backpressure", retryMs: 100 };
    case "duplicate": {
      actor.markNeedsRecovery();
      const [syncDrawn, syncUnprocessed] = await Promise.all([
        repo.getDrawnNumbers(roomId),
        repo.getUnprocessedDrawNumbers(roomId),
      ]);
      state.syncDrawSchedulerState(syncDrawn, syncUnprocessed);
      return { kind: "idle", retryMs: 50 };
    }
    case "inserted":
      break;
  }

  actor.metrics.noteDrawInserted();
  actor.clearNeedsRecovery();
  state.recordDrawInserted(next);

  if (insertResult.nextDrawAtIso) {
    actor.room = {
      ...actor.room,
      next_draw_at: insertResult.nextDrawAtIso,
    };
  }

  // 6. Evaluate + finalize synchronously (reuses the queue processing path).
  const job: DrawJob = {
    id: insertResult.jobId ?? -1,
    room_id: roomId,
    draw_number: next,
    status: "processing",
    attempts: 0,
    created_at: nowIso,
    updated_at: nowIso,
  };
  const result = await processEngineDrawJob(
    supabase,
    log,
    repo,
    stateManager,
    job,
    {
      maxAttempts: actor.config.drawProcessorMaxAttempts,
      cardRegistry: actor.cardRegistry,
      pickContext: {
        firstPickedAt: nowIso,
        pickStartTime: nowIso,
        pickEndTime: nowIso,
        pickMsPerJob: 0,
        drainStartedAt: nowIso,
      },
      skipExistingCheck: true,
      actorTiming: true,
    }
  );

  // 7. Schedule the next ball from cached next_draw_at (overlaps interval with work).
  if (result === "done") {
    return {
      kind: "drew",
      nextDueMs: cadenceDelayMs(actor.room.next_draw_at),
    };
  }
  actor.markNeedsRecovery();
  return { kind: "idle", retryMs: 200 };
}
