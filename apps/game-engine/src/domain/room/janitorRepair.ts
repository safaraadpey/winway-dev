/**
 * Repair finished rooms that missed engine full-win detection + settlement.
 * Calls DB janitor RPC (also usable from pg_cron).
 */

import type { SupabaseAdmin } from "../../db/supabase-admin.js";
import type { Logger } from "../../metrics/logger.js";

export interface JanitorRepairResult {
  repaired: number;
  roomIds: string[];
}

export async function repairUnsettledFinishedRooms(
  supabase: SupabaseAdmin,
  log: Logger,
  limit = 20
): Promise<JanitorRepairResult> {
  const { data, error } = await supabase.rpc("fn_janitor_repair_unsettled_finished", {
    p_limit: limit,
  });
  if (error) {
    throw new Error(`fn_janitor_repair_unsettled_finished: ${error.message}`);
  }

  const rows = (data ?? []) as { room_id: string }[];
  const roomIds = rows.map((r) => r.room_id).filter(Boolean);

  if (roomIds.length > 0) {
    log.warn("janitor repaired unsettled finished rooms", {
      repaired: roomIds.length,
      roomIds,
    });
  }

  return { repaired: roomIds.length, roomIds };
}
