/**
 * Winner reconciliation and exhausted-room finish (safety net layer).
 *
 * DB marks are authoritative; fn_evaluate_room_after_draw mirrors production SQL.
 */

import type { SupabaseAdmin } from "../../db/supabase-admin.js";
import { settleRoomIfNeeded } from "../../finance/settleRoom.js";
import type { Logger } from "../../metrics/logger.js";
import { GameRepo } from "../../repositories/index.js";
import type { RoomStateManager } from "../../state/room-state.manager.js";

export type ExhaustedRoomOutcome = "settled" | "finished" | "deferred";

/** Run SQL win evaluation for one draw (idempotent). */
export async function evaluateRoomWinnersInDb(
  supabase: SupabaseAdmin,
  roomId: string,
  drawNumber: number
): Promise<void> {
  const { error } = await supabase.rpc("fn_evaluate_room_after_draw", {
    p_room_id: roomId,
    p_draw_number: drawNumber,
  });
  if (error) {
    throw new Error(`fn_evaluate_room_after_draw: ${error.message}`);
  }
}

/**
 * All 90 balls drawn: reconcile missing winners, settle if full, else finish.
 * Defers if draw jobs or unprocessed draws remain (scheduler retries next tick).
 */
export async function finishExhaustedRoom(
  supabase: SupabaseAdmin,
  repo: GameRepo,
  log: Logger,
  roomId: string,
  stateManager?: RoomStateManager
): Promise<ExhaustedRoomOutcome> {
  const room = await repo.getRoom(roomId);
  if (!room || room.status !== "playing") {
    return "deferred";
  }

  if (await repo.hasPendingDrawJobs(roomId)) {
    log.info("exhausted room deferred (draw jobs pending)", { roomId });
    return "deferred";
  }

  if (await repo.hasUnprocessedDraw(roomId)) {
    log.info("exhausted room deferred (unprocessed draws)", { roomId });
    return "deferred";
  }

  const lastDraw = await repo.getLastDrawNumber(roomId);
  if (lastDraw == null) {
    log.warn("exhausted room has no draws", { roomId });
    return "deferred";
  }

  await evaluateRoomWinnersInDb(supabase, roomId, lastDraw);

  const hasFull = await repo.hasUnpaidFullWinner(roomId);
  if (hasFull) {
    const settled = await settleRoomIfNeeded(supabase, repo, roomId, {
      fullWinnerThisDraw: true,
    });
    if (settled) {
      stateManager?.evict(roomId);
      log.info("exhausted room settled after reconcile", { roomId, lastDraw });
      return "settled";
    }
  }

  const nowIso = new Date().toISOString();
  await repo.setRoomFinished(roomId, nowIso);
  stateManager?.evict(roomId);
  log.info("exhausted room finished (no full winner after reconcile)", {
    roomId,
    lastDraw,
  });
  return "finished";
}
