/**
 * manifest_ram live stop → GameFinalizationResult → atomic settlement.
 */
import { parseGameManifestPayload } from "../replay/parseManifest.js";
import { settleManifestRamFromState } from "../../finance/settleManifestRam.js";
import { isManifestRamMode } from "../../repositories/types.js";
import type { RoomGameActor } from "../../workers/room-loop/roomGameActor.js";

export async function tryFinalizeManifestRamRoom(
  actor: RoomGameActor
): Promise<boolean> {
  const { repo, supabase, log, roomId, stateManager } = actor;

  const room = await repo.getRoom(roomId);
  if (!room || !isManifestRamMode(room.gameplay_persist_mode)) {
    return false;
  }

  if (room.status === "finished" && room.finalization_sha256) {
    return true;
  }

  const manifestRow = await repo.getGameManifestRow(roomId);
  if (!manifestRow) {
    log.error("[RamGame] manifest missing at finalize", { roomId });
    return false;
  }

  const manifest = parseGameManifestPayload(manifestRow.payload, {
    rngAlgorithm: manifestRow.rng_algorithm,
    rngVersion: manifestRow.rng_version,
    manifestVersion: manifestRow.manifest_version,
  });

  const state = await stateManager.ensureLoaded(roomId);

  try {
    const settled = await settleManifestRamFromState(
      supabase,
      repo,
      log,
      roomId,
      state,
      manifest.commissionPool,
      manifest.manifestVersion
    );
    if (settled) {
      stateManager.evict(roomId);
      actor.exitAfterPersist("manifest_ram-settled");
    }
    return settled;
  } catch (err) {
    log.error("[RamGame] manifest_ram finalize failed", {
      roomId,
      error: err instanceof Error ? err.message : String(err),
    });
    return false;
  }
}
