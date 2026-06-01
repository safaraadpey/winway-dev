/**
 * Ding aggregation orchestration — engine-mode port of the trigger
 * public.fn_aggregate_ding_for_processed_draw.
 *
 * In the DB this runs automatically when draws.processed_at flips NULL→NOT NULL.
 * In engine mode the draw-processor calls this after stamping processed_at. The
 * idempotency guard (draws.ding_aggregated_at) is preserved: only the first call
 * for a draw credits ding.
 *
 * The actual balance/transaction writes use the public.update_ding_balance RPC
 * and a ding_transactions insert — the same tables the trigger writes.
 */

import { computeDingCredits, resolveDingPerCard } from "../../core/index.js";
import type { SupabaseAdmin } from "../../db/supabase-admin.js";
import type { Logger } from "../../metrics/logger.js";
import { GameRepo } from "../../repositories/index.js";

export async function aggregateDingForDraw(
  supabase: SupabaseAdmin,
  repo: GameRepo,
  log: Logger,
  roomId: string,
  drawNumber: number
): Promise<number> {
  const draw = await repo.getDraw(roomId, drawNumber);
  if (!draw) return 0;
  // Idempotency: skip if already aggregated (matches ding_aggregated_at guard).
  if (draw.ding_aggregated_at) return 0;
  if (!draw.processed_at) return 0;

  const room = await repo.getRoom(roomId);
  if (!room) return 0;

  // ding_per_card = COALESCE(room, template, 1). Template lookup via the room's
  // template_id; the room row already carries its override.
  let templateDing: number | null = null;
  if (room.room_template_id) {
    const { data } = await supabase
      .from("room_templates")
      .select("ding_per_number")
      .eq("id", room.room_template_id)
      .maybeSingle();
    templateDing = (data as { ding_per_number: number | null } | null)?.ding_per_number ?? null;
  }
  const dingPerCard = resolveDingPerCard(room.ding_per_number, templateDing);

  // Count, per user, the eligible cards (reserved, not cancelled) whose card
  // contains the drawn number.
  const tickets = (await repo.getRoomTickets(roomId)).filter(
    (t) => t.cancelled_at === null && t.reservation_status === "reserved"
  );
  const poolCardIds = [...new Set(tickets.map((t) => t.pool_card_id))];
  const cardNumbers = await repo.getCardNumbers(poolCardIds);
  const cardsWithNumber = new Set(
    cardNumbers.filter((c) => c.value === drawNumber).map((c) => c.pool_card_id)
  );

  const matchedByUser = new Map<string, number>();
  for (const t of tickets) {
    if (!cardsWithNumber.has(t.pool_card_id)) continue;
    matchedByUser.set(t.player_user_id, (matchedByUser.get(t.player_user_id) ?? 0) + 1);
  }

  const credits = computeDingCredits({
    drawnNumber: drawNumber,
    dingPerCard,
    matchedCardsByUser: matchedByUser,
  });

  for (const credit of credits) {
    const { error: txErr } = await supabase.from("ding_transactions").insert({
      user_id: credit.userId,
      room_id: roomId,
      ticket_id: null,
      draw_id: draw.id,
      drawn_number: drawNumber,
      amount: credit.delta,
      description: `Agg ding for draw ${draw.id} number ${drawNumber} (${credit.matchedCards} cards x ${dingPerCard})`,
      created_at: new Date().toISOString(),
    });
    if (txErr) {
      log.warn("ding transaction insert failed", { userId: credit.userId, error: txErr.message });
      continue;
    }
    const { error: balErr } = await supabase.rpc("update_ding_balance", {
      p_user_id: credit.userId,
      p_amount: credit.delta,
    });
    if (balErr) log.warn("update_ding_balance failed", { userId: credit.userId, error: balErr.message });
  }

  // Lock the draw so it cannot be aggregated twice.
  await supabase
    .from("draws")
    .update({ ding_aggregated_at: new Date().toISOString() })
    .eq("id", draw.id)
    .is("ding_aggregated_at", null);

  if (credits.length > 0) {
    log.info("ding aggregated", { roomId, drawNumber, users: credits.length });
  }
  return credits.length;
}
