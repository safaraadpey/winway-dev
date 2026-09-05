/**
 * manifest_ram recovery — replayGame → settleNow when lease re-claimed (epoch > 1).
 */
import { parseGameManifestPayload } from "../replay/parseManifest.js";
import { settleManifestRamFromReplay } from "../../finance/settleManifestRam.js";
import { isManifestRamMode } from "../../repositories/types.js";
import type { RoomGameActor } from "../../workers/room-loop/roomGameActor.js";
import type { RawCardNumber } from "../../core/card-registry/build.js";

export type ManifestRecoveryOutcome = "finished" | "ready" | "failed";

function isManifestRamRecovery(actor: RoomGameActor): boolean {
  const epoch = actor.leaseFence.leaseEpoch;
  return epoch != null && Number.isFinite(epoch) && epoch > 1;
}

/** Fresh manifest_ram bootstrap — load snapshot, skip per-draw drain. */
export async function bootstrapManifestRamFresh(
  actor: RoomGameActor
): Promise<boolean> {
  const { log, roomId, stateManager } = actor;

  try {
    await stateManager.ensureLoaded(roomId);
  } catch (err) {
    log.error("[ManifestRecovery] ensureLoaded failed", {
      roomId,
      error: err instanceof Error ? err.message : String(err),
    });
    return false;
  }

  actor.clearNeedsRecovery();
  actor.syncRamNextDrawAtFromRoom();
  log.info("[RamGame] manifest_ram bootstrap ready", { roomId });
  return true;
}

/** Crash recovery: replay manifest → atomic settle (offline finish). */
export async function recoverManifestRamSettleNow(
  actor: RoomGameActor
): Promise<ManifestRecoveryOutcome> {
  const { repo, supabase, log, roomId, stateManager } = actor;
  const t0 = Date.now();

  const room = await actor.repo.getRoom(roomId);
  if (!room) return "failed";

  if (room.status === "finished" || room.finalization_sha256) {
    return "finished";
  }

  if (!isManifestRamMode(room.gameplay_persist_mode)) {
    return "failed";
  }

  log.info("[ManifestRecovery] settleNow replay starting", {
    roomId,
    leaseEpoch: actor.leaseFence.leaseEpoch,
  });

  const row = await repo.getGameManifestRow(roomId);
  if (!row) {
    log.error("[ManifestRecovery] manifest missing", { roomId });
    return "failed";
  }

  const manifest = parseGameManifestPayload(row.payload, {
    rngAlgorithm: row.rng_algorithm,
    rngVersion: row.rng_version,
    manifestVersion: row.manifest_version,
  });

  const cardNumbers = (await repo.getCardNumbersForPoolCardIds(
    manifest.tickets.map((t) => t.poolCardId)
  )) as RawCardNumber[];

  try {
    await settleManifestRamFromReplay(
      supabase,
      repo,
      log,
      manifest,
      cardNumbers
    );
    stateManager.evict(roomId);
    log.info("[ManifestRecovery] settleNow complete", {
      roomId,
      latencyMs: Date.now() - t0,
    });
    return "finished";
  } catch (err) {
    log.error("[ManifestRecovery] settleNow failed", {
      roomId,
      error: err instanceof Error ? err.message : String(err),
    });
    return "failed";
  }
}

export async function bootstrapManifestRamRoom(
  actor: RoomGameActor
): Promise<boolean> {
  if (isManifestRamRecovery(actor)) {
    const outcome = await recoverManifestRamSettleNow(actor);
    return outcome === "ready";
  }
  return bootstrapManifestRamFresh(actor);
}
