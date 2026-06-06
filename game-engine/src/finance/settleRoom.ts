import type { SupabaseAdmin } from "../db/supabase-admin.js";
import type { GameRepo } from "../repositories/index.js";
import { finishRoomAndSettle } from "./index.js";

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Settle a room when a full winner was found or settlement was left incomplete
 * (e.g. draw job retried after finalize succeeded but fn_finish_room_and_settle failed).
 */
export async function settleRoomIfNeeded(
  supabase: SupabaseAdmin,
  repo: GameRepo,
  roomId: string,
  trigger: { fullWinnerThisDraw?: boolean } = {}
): Promise<boolean> {
  const needs =
    trigger.fullWinnerThisDraw === true ||
    (await repo.roomNeedsSettlement(roomId));
  if (!needs) return false;

  const now = new Date().toISOString();
  await repo.setRoomSettling(roomId, now);

  let lastErr: unknown;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      await finishRoomAndSettle(supabase, roomId);
      return true;
    } catch (err) {
      lastErr = err;
      if (attempt < 2) await sleep(300 * (attempt + 1));
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error(String(lastErr));
}
