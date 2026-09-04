/**
 * Repair finished rooms that missed engine full-win detection + settlement.
 * room_level rooms: Engine rebuilds Ding payload and calls extended finish RPC.
 */

import type { SupabaseAdmin } from "../../db/supabase-admin.js";
import { settleRoomIfNeeded } from "../../finance/settleRoom.js";
import type { Logger } from "../../metrics/logger.js";
import { GameRepo } from "../../repositories/index.js";
import type { RoomStateManager } from "../../state/room-state.manager.js";

export interface JanitorRepairResult {
  repaired: number;
  roomIds: string[];
}

export async function repairUnsettledFinishedRooms(
  supabase: SupabaseAdmin,
  repo: GameRepo,
  log: Logger,
  limit = 20,
  stateManager?: RoomStateManager
): Promise<JanitorRepairResult> {
  const roomIds: string[] = [];

  if (stateManager) {
    const roomLevelIds = await repo.listUnsettledRoomLevelRooms(limit);
    for (const roomId of roomLevelIds) {
      try {
        const state = await stateManager.ensureLoaded(roomId);
        const settled = await settleRoomIfNeeded(
          supabase,
          repo,
          roomId,
          { fullWinnerThisDraw: true },
          { state }
        );
        if (settled) {
          stateManager.evict(roomId);
          roomIds.push(roomId);
          log.warn("[Janitor] repaired room_level settling room with Engine payload", {
            roomId,
          });
        }
      } catch (err) {
        log.error("[Janitor] room_level repair failed", {
          roomId,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }
  }

  const { data, error } = await supabase.rpc("fn_janitor_repair_unsettled_finished", {
    p_limit: limit,
  });
  if (error) {
    throw new Error(`fn_janitor_repair_unsettled_finished: ${error.message}`);
  }

  const rows = (data ?? []) as { room_id: string }[];
  for (const row of rows) {
    if (row.room_id) roomIds.push(row.room_id);
  }

  const unique = [...new Set(roomIds)];

  if (unique.length > 0) {
    log.warn("janitor repaired unsettled finished rooms", {
      repaired: unique.length,
      roomIds: unique,
    });
  }

  return { repaired: unique.length, roomIds: unique };
}
