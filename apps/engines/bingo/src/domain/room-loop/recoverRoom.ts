/**
 * Crash recovery for the room-actor loop (runtime requeue path).
 *
 * Bootstrap drain runs in bootstrapRoomForActor before the clock starts.
 * This helper remains for explicit recovery scans when needsRecovery is set.
 */
import type { RoomGameActor } from "../../workers/room-loop/roomGameActor.js";
import { recoverUnprocessedDrawFromDb } from "./persistDrawPayload.js";

export type RecoverOutcome = "none" | "processed" | "requeue";

export async function recoverRoom(
  actor: RoomGameActor
): Promise<RecoverOutcome> {
  if (!actor.needsRecovery) {
    return "none";
  }

  const oldest = await actor.repo.getOldestUnprocessedDraw(actor.roomId);
  if (!oldest) {
    actor.clearNeedsRecovery();
    return "none";
  }

  actor.metrics.noteRecovery();
  const outcome = await recoverUnprocessedDrawFromDb(
    actor,
    oldest.number,
    oldest.created_at
  );

  if (outcome === "fenced") {
    return "requeue";
  }
  if (outcome === "done") {
    actor.clearNeedsRecovery();
    return "processed";
  }
  return "requeue";
}
