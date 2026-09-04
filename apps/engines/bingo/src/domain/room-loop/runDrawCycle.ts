/**
 * runOneDrawCycle — RAM clock path (Phase 5).
 *
 * Clock owns cadence: due → pick → RAM eval → stamp payload → enqueue persist.
 * Persist recorder writes insert + finalize asynchronously with Clock timestamps.
 * Schedule next from RAM nextDueAtIso — never await persist.
 */
import { pickNextNumber } from "../../core/index.js";
import { prepareDingCreditsFromState } from "../ding/index.js";
import { parseBytea } from "../../repositories/index.js";
import { finishExhaustedRoom } from "../room/reconcileWinners.js";
import type {
  RoomCycleResult,
  RoomGameActor,
} from "../../workers/room-loop/roomGameActor.js";
import type { ClockDrawPayload } from "./clockDrawPayload.js";
import { evaluateDrawInRam } from "./evaluateDrawInRam.js";
import {
  cadenceDelayMs,
  msUntilDue,
  nextDrawAtIso,
} from "./scheduleNextDraw.js";

/** Tolerance: fire the draw if it is due within this many ms. */
const DUE_TOLERANCE_MS = 30;

/**
 * Poll interval while the clock waits for the winning persist recorder.
 * Must not exit the actor — persist + settle own lease release.
 */
export const FULL_HOUSE_FROZEN_POLL_MS = 500;

/** Keep actor + lease alive; no picks until persist finishes. */
export function fullHouseFrozenWait(): RoomCycleResult {
  return { kind: "idle", retryMs: FULL_HOUSE_FROZEN_POLL_MS };
}

async function totalUnprocessed(actor: RoomGameActor): Promise<number> {
  const [dbCount, queueDepth] = await Promise.all([
    actor.repo.countUnprocessedDraws(actor.roomId),
    Promise.resolve(actor.persistQueue.depth()),
  ]);
  return dbCount + queueDepth;
}

export async function runOneDrawCycle(
  actor: RoomGameActor
): Promise<RoomCycleResult> {
  const { repo, supabase, log, stateManager } = actor;
  const roomId = actor.roomId;

  const room = actor.room;
  if (room.status !== "playing") {
    return { kind: "exhausted" };
  }

  const state = await stateManager.ensureLoaded(roomId);
  if (state.isFullHouseFrozen()) {
    return fullHouseFrozenWait();
  }

  const due = msUntilDue(actor.ramNextDrawAtIso);
  if (due > DUE_TOLERANCE_MS) {
    return { kind: "idle", retryMs: due };
  }

  const unprocessed = await totalUnprocessed(actor);
  if (unprocessed >= actor.config.roomLoopMaxUnprocessedDraws) {
    actor.metrics.noteBackpressure();
    return { kind: "backpressure", retryMs: 50 };
  }

  const registry = actor.cardRegistry;
  if (!registry) {
    log.error("room-loop actor: card registry missing", { roomId });
    return { kind: "idle", retryMs: 500 };
  }

  const seed = parseBytea(room.room_seed);
  if (!seed) {
    log.error("room-loop actor: room has no seed", { roomId });
    return { kind: "idle", retryMs: 1000 };
  }

  const drawn = [...state.getDrawnNumbers()];
  const next = pickNextNumber(seed, drawn);
  if (next === null) {
    await finishExhaustedRoom(supabase, repo, log, roomId, stateManager);
    return { kind: "exhausted" };
  }

  const drawnAtMs = Date.now();
  const drawnAtIso = new Date(drawnAtMs).toISOString();
  const actorDueAtIso = actor.ramNextDrawAtIso ?? drawnAtIso;
  const nextDueAtIso = nextDrawAtIso(room, new Date(drawnAtMs));

  const evalResult = evaluateDrawInRam(state, next, registry);
  const ding = prepareDingCreditsFromState(
    state,
    next,
    evalResult.persistence.marks
  );
  state.accumulateRoomDing(ding.credits);

  state.recordDrawInserted(next);

  const payload: ClockDrawPayload = {
    seq: state.getDrawnNumbers().length,
    number: next,
    drawnAtIso,
    actorDueAtIso,
    nextDueAtIso,
    persistence: evalResult.persistence,
    ding,
    fullWinnerThisDraw: evalResult.fullWinnerThisDraw,
  };

  actor.ramNextDrawAtIso = nextDueAtIso;
  actor.room = { ...actor.room, next_draw_at: nextDueAtIso };
  actor.persistQueue.enqueue(payload);

  if (evalResult.fullWinnerThisDraw) {
    state.freezeAfterFullHouse();
    log.info("[Room] full-house clock freeze", { roomId, drawNumber: next });
    return fullHouseFrozenWait();
  }

  return {
    kind: "drew",
    nextDueMs: cadenceDelayMs(nextDueAtIso, drawnAtMs),
  };
}
