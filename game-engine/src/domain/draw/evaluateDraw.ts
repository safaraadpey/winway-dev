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
import {
  type DrawStepBreakdown,
  emptyBreakdown,
  timedStep,
  timedStepSync,
} from "../../metrics/drawPerformance.js";
import { GameRepo } from "../../repositories/index.js";

const EVAL_STATUSES = new Set(["reserved", "confirmed", "consumed"]);

export interface EvaluateDrawResult {
  marksInserted: number;
  newResults: number;
  settled: boolean;
  ticketCount: number;
  cardCount: number;
  cardNumberRows: number;
  marksReadCount: number;
  breakdown: DrawStepBreakdown;
}

export async function applyMarksAndEvaluate(
  supabase: SupabaseAdmin,
  repo: GameRepo,
  log: Logger,
  roomId: string,
  drawNumber: number
): Promise<EvaluateDrawResult> {
  const now = new Date().toISOString();
  const breakdown = emptyBreakdown();

  const roomStep = await timedStep(() => repo.getRoom(roomId));
  breakdown.getRoom = roomStep.timing;
  const room = roomStep.result;
  if (!room) throw new Error(`room ${roomId} not found`);

  const ticketsStep = await timedStep(async () => {
    const all = await repo.getRoomTickets(roomId);
    return all.filter((t) => EVAL_STATUSES.has(t.reservation_status));
  });
  breakdown.getRoomTickets = ticketsStep.timing;
  const tickets = ticketsStep.result;

  const poolCardIds = [...new Set(tickets.map((t) => t.pool_card_id))];
  const cardNumbersStep = await timedStep(() => repo.getCardNumbers(poolCardIds));
  breakdown.getCardNumbers = cardNumbersStep.timing;
  const cardNumbers = cardNumbersStep.result;

  const cellsByCard = new Map<string, { value: number; rowNo: number }[]>();
  for (const cn of cardNumbers) {
    if (!cellsByCard.has(cn.pool_card_id)) cellsByCard.set(cn.pool_card_id, []);
    cellsByCard.get(cn.pool_card_id)!.push({ value: cn.value, rowNo: cn.row_no });
  }

  const markRows = tickets
    .filter((t) =>
      (cellsByCard.get(t.pool_card_id) ?? []).some((c) => c.value === drawNumber)
    )
    .map((t) => ({ ticket_id: t.id, value: drawNumber }));

  const insertMarksStep = await timedStep(() => repo.insertMarksForDraw(markRows, now));
  breakdown.insertMarksForDraw = insertMarksStep.timing;

  const ticketIds = tickets.map((t) => t.id);
  const marksStep = await timedStep(() => repo.getMarksForTickets(ticketIds));
  breakdown.getMarksForTickets = marksStep.timing;
  const markedByTicket = marksStep.result;
  let marksReadCount = 0;
  for (const marked of markedByTicket.values()) marksReadCount += marked.size;

  const cards: TicketCard[] = tickets.map((t) => ({
    ticketId: t.id,
    userId: t.player_user_id,
    cells: (cellsByCard.get(t.pool_card_id) ?? []).map((c) => ({
      value: c.value,
      rowNo: c.rowNo,
    })),
  }));

  const resultsStep = await timedStep(() => repo.getResults(roomId));
  breakdown.getResults = resultsStep.timing;
  const existing = resultsStep.result;
  const existingLine = new Set(
    existing.filter((r) => r.win_type === "line").map((r) => r.ticket_id)
  );
  const existingFull = new Set(
    existing.filter((r) => r.win_type === "full").map((r) => r.ticket_id)
  );

  const evalStep = timedStepSync(() =>
    evaluateRoomAfterDraw({
      drawNumber,
      firstLineDrawNumber: room.first_line_draw_number,
      markedByTicket,
      tickets: cards,
      existingLineTickets: existingLine,
      existingFullTickets: existingFull,
    })
  );
  breakdown.evaluateRoomAfterDraw = evalStep.timing;
  const evalOut = evalStep.result;

  const insertResultsStep = await timedStep(async () => {
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
  });
  breakdown.insertResults = insertResultsStep.timing;

  let settled = false;
  if (evalOut.fullWinnerThisDraw) {
    const settleStep = await timedStep(async () => {
      await repo.setRoomSettling(roomId, now);
      await finishRoomAndSettle(supabase, roomId);
    });
    breakdown.fn_finish_room_and_settle = settleStep.timing;
    settled = true;
    log.info("room settled (full winner)", { roomId, drawNumber });
  }

  return {
    marksInserted: markRows.length,
    newResults: evalOut.newResults.length,
    settled,
    ticketCount: tickets.length,
    cardCount: poolCardIds.length,
    cardNumberRows: cardNumbers.length,
    marksReadCount,
    breakdown,
  };
}
