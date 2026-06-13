/**
 * Shadow-mode cycle (Phase 3).
 *
 * The actor observes a room it has claimed but does NOT insert draws — the
 * legacy scheduler still drives the game. Each tick it:
 *   1. reads the room's drawn numbers,
 *   2. computes the number IT would pick next (provably-fair RNG),
 *   3. when the scheduler inserts a new draw, checks that the previously
 *      predicted number matches what was actually drawn (parity),
 *   4. records the new prediction.
 *
 * This validates the actor's RNG + ordering against live production draws with
 * zero risk before we let it write anything (Phase 4).
 */
import { pickNextNumber } from "../../core/index.js";
import { parseBytea } from "../../repositories/index.js";
import type { RoomGameActor } from "../../workers/room-loop/roomGameActor.js";
import type { RoomCycleResult } from "../../workers/room-loop/roomGameActor.js";
import { drawIntervalSec } from "./scheduleNextDraw.js";

const SHADOW_OBSERVE_MS = 1000;

export async function runShadowCycle(
  actor: RoomGameActor
): Promise<RoomCycleResult> {
  const room = await actor.repo.getRoom(actor.roomId);
  if (!room || room.status !== "playing") {
    return { kind: "idle", retryMs: SHADOW_OBSERVE_MS };
  }
  actor.room = room;

  const seed = parseBytea(room.room_seed);
  if (!seed) {
    actor.log.warn("room-loop shadow: room has no seed", {
      roomId: actor.roomId,
    });
    return { kind: "idle", retryMs: SHADOW_OBSERVE_MS };
  }

  const drawn = await actor.repo.getDrawnNumbers(actor.roomId);
  const candidate = pickNextNumber(seed, drawn);

  // A new draw landed since we last looked → check parity against prediction.
  if (drawn.length > actor.lastSeenDrawCount && actor.predictedNext != null) {
    const predicted = actor.predictedNext;
    const matched = drawn.includes(predicted);
    actor.metrics.noteShadowDecision();
    if (!matched) {
      actor.metrics.noteShadowMismatch();
      actor.log.warn("room-loop shadow parity MISMATCH", {
        roomId: actor.roomId,
        predicted,
        drawnCount: drawn.length,
      });
    } else {
      actor.log.info("room-loop shadow parity ok", {
        roomId: actor.roomId,
        predicted,
        drawnCount: drawn.length,
      });
    }
  }

  actor.lastSeenDrawCount = drawn.length;
  actor.predictedNext = candidate;

  if (candidate === null) {
    return { kind: "exhausted" };
  }

  const intervalMs = Math.max(SHADOW_OBSERVE_MS, drawIntervalSec(room.meta) * 1000);
  return { kind: "shadow", nextDueMs: intervalMs };
}
