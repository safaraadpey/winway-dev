/**
 * manifest_ram settlement — one atomic txn from GameFinalizationResult.
 */
import type { SupabaseAdmin } from "../db/supabase-admin.js";
import type { GameFinalizationResult } from "../domain/replay/types.js";
import { finishRoomFromFinalization } from "../finance/index.js";
import type { GameRepo } from "../repositories/index.js";
import { isManifestRamMode } from "../repositories/types.js";
import type { RoomRuntimeState } from "../state/room-state.js";
import type { Logger } from "../metrics/logger.js";
import {
  toFinalizationResultFromReplay,
  toFinalizationResultFromState,
} from "../domain/replay/toFinalizationResult.js";
import type { GameManifest } from "../domain/replay/types.js";
import { replayGame } from "../domain/replay/replayGame.js";
import type { RawCardNumber } from "../core/card-registry/build.js";

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export interface SettleManifestRamOptions {
  persistHistory?: boolean;
  adminUser?: string | null;
}

/** Build finalization from live RAM and submit atomic settlement. */
export async function settleManifestRamFromState(
  supabase: SupabaseAdmin,
  repo: GameRepo,
  log: Logger,
  roomId: string,
  state: RoomRuntimeState,
  commissionPool: number,
  manifestVersion: number,
  opts: SettleManifestRamOptions = {}
): Promise<boolean> {
  const room = await repo.getRoom(roomId);
  if (!room || !isManifestRamMode(room.gameplay_persist_mode)) {
    return false;
  }
  if (room.status === "finished" && room.finalization_sha256) {
    return true;
  }

  const finalization = toFinalizationResultFromState(
    state,
    commissionPool,
    manifestVersion
  );
  return submitManifestRamFinalization(supabase, repo, log, roomId, finalization, opts);
}

/** replayGame → atomic settlement (crash recovery). */
export async function settleManifestRamFromReplay(
  supabase: SupabaseAdmin,
  repo: GameRepo,
  log: Logger,
  manifest: GameManifest,
  cardNumbers: readonly RawCardNumber[],
  opts: SettleManifestRamOptions = {}
): Promise<boolean> {
  const replay = replayGame({ manifest, cardNumbers });
  const finalization = toFinalizationResultFromReplay(
    manifest.roomId,
    manifest.manifestVersion,
    replay
  );
  return submitManifestRamFinalization(
    supabase,
    repo,
    log,
    manifest.roomId,
    finalization,
    opts
  );
}

export async function submitManifestRamFinalization(
  supabase: SupabaseAdmin,
  repo: GameRepo,
  log: Logger,
  roomId: string,
  finalization: GameFinalizationResult,
  opts: SettleManifestRamOptions = {}
): Promise<boolean> {
  const room = await repo.getRoom(roomId);
  if (!room) return false;

  if (
    room.status === "finished" &&
    room.finalization_sha256 === finalization.resultSha256
  ) {
    log.info("[GameSettlement] manifest_ram duplicate hash no-op", {
      roomId,
      resultSha256: finalization.resultSha256,
    });
    return true;
  }

  if (
    room.finalization_sha256 &&
    room.finalization_sha256 !== finalization.resultSha256
  ) {
    log.error("[GameSettlement] manifest_ram checksum_mismatch", {
      roomId,
      stored: room.finalization_sha256,
      submitted: finalization.resultSha256,
    });
    throw new Error(`checksum_mismatch for room ${roomId}`);
  }

  const rpcPayload = finalizationToRpcJson(finalization);
  const t0 = Date.now();

  let lastErr: unknown;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      await finishRoomFromFinalization(supabase, roomId, rpcPayload, {
        adminUser: opts.adminUser ?? null,
        persistHistory: opts.persistHistory ?? true,
      });
      log.info("[GameSettlement] manifest_ram settled", {
        roomId,
        resultSha256: finalization.resultSha256,
        latencyMs: Date.now() - t0,
        stoppedReason: finalization.payload.stoppedReason,
        drawCount: finalization.payload.drawSequence.length,
      });
      return true;
    } catch (err) {
      lastErr = err;
      if (attempt < 2) await sleep(300 * (attempt + 1));
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error(String(lastErr));
}

/** RPC-facing JSON — camelCase keys match Engine contract. */
export function finalizationToRpcJson(
  finalization: GameFinalizationResult
): Record<string, unknown> {
  return {
    contractVersion: finalization.contractVersion,
    roomId: finalization.roomId,
    manifestVersion: finalization.manifestVersion,
    rngAlgorithm: finalization.rngAlgorithm,
    rngVersion: finalization.rngVersion,
    resultSha256: finalization.resultSha256,
    marksSha256: finalization.marksSha256,
    dingSettlementKey: finalization.dingSettlementKey,
    dingSettlementVersion: finalization.dingSettlementVersion,
    payload: {
      drawSequence: finalization.payload.drawSequence,
      firstLineDrawNumber: finalization.payload.firstLineDrawNumber,
      lineWinners: finalization.payload.lineWinners,
      fullWinners: finalization.payload.fullWinners,
      dingByUser: finalization.payload.dingByUser,
      marks: finalization.payload.marks,
      prizePreview: finalization.payload.prizePreview,
      stoppedReason: finalization.payload.stoppedReason,
      manifestVersion: finalization.payload.manifestVersion,
      rngAlgorithm: finalization.payload.rngAlgorithm,
      rngVersion: finalization.payload.rngVersion,
    },
  };
}
