/**
 * Engine-mode draw evaluation — port of:
 *   game_core.rpc_apply_marks_for_draw  (insert marks for the drawn number)
 *   public.fn_evaluate_room_after_draw  (derive line/full winners, settle)
 *
 * Settlement itself (fn_finish_room_and_settle) stays a DB RPC: it is the atomic
 * money path (KEEP). The engine only decides WHEN to settle (full winner found)
 * exactly as the SQL does, then calls the RPC.
 */

import {
  type TicketCard,
  evaluateRoomAfterDraw,
} from "../../core/index.js";
import { finishRoomAndSettle } from "../../finance/index.js";
import type { SupabaseAdmin } from "../../db/supabase-admin.js";
import type { Logger } from "../../metrics/logger.js";
import { GameRepo } from "../../repositories/index.js";

const EVAL_STATUSES = new Set(["reserved", "confirmed", "consumed"]);

export interface EvaluateDrawResult {
  marksInserted: number;
  newResults: number;
  settled: boolean;
}

export async function applyMarksAndEvaluate(
  supabase: SupabaseAdmin,
  repo: GameRepo,
  log: Logger,
  roomId: string,
  drawNumber: number
): Promise<EvaluateDrawResult> {
  const now = new Date().toISOString();
  const room = await repo.getRoom(roomId);
  if (!room) throw new Error(`room ${roomId} not found`);

  const tickets = (await repo.getRoomTickets(roomId)).filter((t) =>
    EVAL_STATUSES.has(t.reservation_status)
  );
  const poolCardIds = [...new Set(tickets.map((t) => t.pool_card_id))];
  const cardNumbers = await repo.getCardNumbers(poolCardIds);

  const cellsByCard = new Map<string, { value: number; rowNo: number }[]>();
  for (const cn of cardNumbers) {
    if (!cellsByCard.has(cn.pool_card_id)) cellsByCard.set(cn.pool_card_id, []);
    cellsByCard.get(cn.pool_card_id)!.push({ value: cn.value, rowNo: cn.row_no });
  }

  // 1) Apply marks for the drawn number (rpc_apply_marks_for_draw).
  const markRows = tickets
    .filter((t) =>
      (cellsByCard.get(t.pool_card_id) ?? []).some((c) => c.value === drawNumber)
    )
    .map((t) => ({ ticket_id: t.id, value: drawNumber }));
  await repo.insertMarksForDraw(markRows, now);

  // 2) Recompute marks per ticket and evaluate (fn_evaluate_room_after_draw).
  const ticketIds = tickets.map((t) => t.id);
  const markedByTicket = await repo.getMarksForTickets(ticketIds);

  const cards: TicketCard[] = tickets.map((t) => ({
    ticketId: t.id,
    userId: t.player_user_id,
    cells: (cellsByCard.get(t.pool_card_id) ?? []).map((c) => ({
      value: c.value,
      rowNo: c.rowNo,
    })),
  }));

  const existing = await repo.getResults(roomId);
  const existingLine = new Set(
    existing.filter((r) => r.win_type === "line").map((r) => r.ticket_id)
  );
  const existingFull = new Set(
    existing.filter((r) => r.win_type === "full").map((r) => r.ticket_id)
  );

  const evalOut = evaluateRoomAfterDraw({
    drawNumber,
    firstLineDrawNumber: room.first_line_draw_number,
    markedByTicket,
    tickets: cards,
    existingLineTickets: existingLine,
    existingFullTickets: existingFull,
  });

  await repo.insertResults(
    evalOut.newResults.map((r) => ({
      room_id: roomId,
      user_id: r.userId,
      ticket_id: r.ticketId,
      win_type: r.winType,
      draw_number: drawNumber,
    }))
  );

  if (evalOut.setFirstLineDrawNumber) {
    await repo.setFirstLineDrawNumber(roomId, drawNumber);
  }

  let settled = false;
  if (evalOut.fullWinnerThisDraw) {
    await repo.setRoomSettling(roomId, now);
    await finishRoomAndSettle(supabase, roomId);
    settled = true;
    log.info("room settled (full winner)", { roomId, drawNumber });
  }

  return {
    marksInserted: markRows.length,
    newResults: evalOut.newResults.length,
    settled,
  };
}
