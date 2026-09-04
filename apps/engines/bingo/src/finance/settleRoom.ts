import type { SupabaseAdmin } from "../db/supabase-admin.js";
import {
  finishDingPayloadFromEngine,
  finishRoomAndSettle,
} from "./index.js";
import type { RoomFinalizationDingPayload } from "../domain/ding/roomDingState.js";
import {
  isRoomLevelDing,
  rebuildRoomDingPendingFromProcessedMarks,
} from "../domain/ding/roomDingState.js";
import type { GameRepo } from "../repositories/index.js";
import type { RoomRuntimeState } from "../state/room-state.js";

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export interface SettleRoomOptions {
  /** In-memory room state — required for room_level Ding payload. */
  state?: RoomRuntimeState | null;
  /** Pre-built payload (janitor / recovery). */
  dingPayload?: RoomFinalizationDingPayload | null;
}

async function resolveDingPayload(
  repo: GameRepo,
  roomId: string,
  opts: SettleRoomOptions
): Promise<RoomFinalizationDingPayload | null> {
  const state = opts.state;
  if (state?.usesRoomLevelDing()) {
    rebuildRoomDingPendingFromProcessedMarks(state);
    return state.buildRoomDingFinalizationPayload();
  }
  if (opts.dingPayload) return opts.dingPayload;
  const room = await repo.getRoom(roomId);
  if (!room || !isRoomLevelDing(room.ding_settle_mode)) return null;
  throw new Error(
    `[Settlement] room ${roomId} is room_level but no Engine Ding state was provided`
  );
}

/**
 * Settle a room when a full winner was found or settlement was left incomplete
 * (e.g. draw job retried after finalize succeeded but fn_finish_room_and_settle failed).
 */
export async function settleRoomIfNeeded(
  supabase: SupabaseAdmin,
  repo: GameRepo,
  roomId: string,
  trigger: { fullWinnerThisDraw?: boolean } = {},
  opts: SettleRoomOptions = {}
): Promise<boolean> {
  const needs =
    trigger.fullWinnerThisDraw === true ||
    (await repo.roomNeedsSettlement(roomId));
  if (!needs) return false;

  const room = await repo.getRoom(roomId);
  const roomLevel = isRoomLevelDing(room?.ding_settle_mode);
  const dingPayload = roomLevel ? await resolveDingPayload(repo, roomId, opts) : null;

  const now = new Date().toISOString();
  await repo.setRoomSettling(roomId, now);

  const rpcDing =
    dingPayload != null ? finishDingPayloadFromEngine(dingPayload) : undefined;

  let lastErr: unknown;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      await finishRoomAndSettle(supabase, roomId, null, rpcDing);
      return true;
    } catch (err) {
      lastErr = err;
      if (attempt < 2) await sleep(300 * (attempt + 1));
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error(String(lastErr));
}

/**
 * Finish an exhausted room with room_level Ding even when there is no full winner.
 * Prize pool may be empty; Ding + consume + finished still commit atomically.
 */
export async function finishRoomLevelExhausted(
  supabase: SupabaseAdmin,
  repo: GameRepo,
  roomId: string,
  state: RoomRuntimeState
): Promise<boolean> {
  if (!state.usesRoomLevelDing()) {
    throw new Error(`finishRoomLevelExhausted called for non-room_level room ${roomId}`);
  }
  return settleRoomIfNeeded(
    supabase,
    repo,
    roomId,
    { fullWinnerThisDraw: true },
    { state }
  );
}
