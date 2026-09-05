/**
 * Preload gate — registry + room snapshot must be ready before the RAM clock starts.
 * manifest_ram: skip per-draw drain; recovery uses replayGame settleNow when lease epoch > 1.
 */
import { bootstrapManifestRamRoom } from "./recoverFromManifest.js";
import { isManifestRamMode } from "../../repositories/types.js";
import type { RoomGameActor } from "../../workers/room-loop/roomGameActor.js";
import type { RoomPersistQueue } from "../../workers/room-loop/roomPersistQueue.js";

export async function bootstrapRoomForActor(
  actor: RoomGameActor,
  persistQueue: RoomPersistQueue
): Promise<boolean> {
  const { log, roomId } = actor;

  if (!actor.cardRegistry) {
    log.error("[RoomLoop] bootstrap failed: card registry not loaded", {
      roomId,
    });
    return false;
  }

  if (isManifestRamMode(actor.room.gameplay_persist_mode)) {
    return bootstrapManifestRamRoom(actor);
  }

  try {
    const state = await actor.stateManager.ensureLoaded(roomId);
    const [drawn, unprocessed] = await Promise.all([
      actor.repo.getDrawnNumbers(roomId),
      actor.repo.getUnprocessedDrawNumbers(roomId),
    ]);
    state.syncDrawSchedulerState(drawn, unprocessed);
  } catch (err) {
    log.error("[RoomLoop] bootstrap failed: ensureLoaded", {
      roomId,
      error: err instanceof Error ? err.message : String(err),
    });
    return false;
  }

  const drained = await persistQueue.drainUnprocessedFromDb();
  if (!drained) {
    log.error("[RoomLoop] bootstrap failed: unprocessed drain", { roomId });
    return false;
  }

  actor.clearNeedsRecovery();
  actor.syncRamNextDrawAtFromRoom();
  log.info("[RoomLoop] bootstrap complete", { roomId });
  return true;
}
