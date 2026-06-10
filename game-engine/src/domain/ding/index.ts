/**
 * Ding aggregation — engine-mode port of public.fn_aggregate_ding_for_processed_draw.
 *
 * Engine path uses in-memory marks (no tickets/card_numbers join). Credits are
 * persisted in one RPC (rpc_apply_ding_credits_for_draw).
 */

import { computeDingCredits, resolveDingPerCard } from "../../core/index.js";
import type { SupabaseAdmin } from "../../db/supabase-admin.js";
import type { Logger } from "../../metrics/logger.js";
import { GameRepo } from "../../repositories/index.js";
import type { RoomRuntimeState } from "../../state/room-state.js";

async function persistDingCredits(
  repo: GameRepo,
  roomId: string,
  drawNumber: number,
  dingPerCard: number,
  credits: ReturnType<typeof computeDingCredits>
): Promise<number> {
  if (credits.length === 0) {
    return repo.applyDingCreditsForDraw({
      roomId,
      drawNumber,
      dingPerCard,
      credits: [],
    });
  }
  return repo.applyDingCreditsForDraw({
    roomId,
    drawNumber,
    dingPerCard,
    credits: credits.map((c) => ({
      user_id: c.userId,
      amount: c.delta,
      matched_cards: c.matchedCards,
    })),
  });
}

/**
 * Engine hot path — uses room snapshot + marks from this draw (no card_numbers query).
 */
export async function aggregateDingForDrawFromState(
  _supabase: SupabaseAdmin,
  repo: GameRepo,
  log: Logger,
  state: RoomRuntimeState,
  drawNumber: number,
  marksInserted: readonly { ticket_id: string; value: number }[]
): Promise<number> {
  const dingPerCard = resolveDingPerCard(
    state.room.ding_per_number,
    state.templateDingPerNumber
  );
  const matchedByUser = state.countDingMatchedByUser(marksInserted, drawNumber);
  const credits = computeDingCredits({
    drawnNumber: drawNumber,
    dingPerCard,
    matchedCardsByUser: matchedByUser,
  });

  const credited = await persistDingCredits(
    repo,
    state.roomId,
    drawNumber,
    dingPerCard,
    credits
  );

  if (credited > 0) {
    log.info("ding aggregated (engine)", {
      roomId: state.roomId,
      drawNumber,
      users: credited,
    });
  }
  return credited;
}

/** DB fallback for hybrid/recovery when room state is not loaded. */
export async function aggregateDingForDraw(
  _supabase: SupabaseAdmin,
  repo: GameRepo,
  log: Logger,
  roomId: string,
  drawNumber: number
): Promise<number> {
  const room = await repo.getRoom(roomId);
  if (!room) return 0;

  let templateDing: number | null = null;
  if (room.room_template_id) {
    templateDing = await repo.getTemplateDingPerNumber(room.room_template_id);
  }
  const dingPerCard = resolveDingPerCard(room.ding_per_number, templateDing);

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

  const credited = await persistDingCredits(repo, roomId, drawNumber, dingPerCard, credits);

  if (credited > 0) {
    log.info("ding aggregated", { roomId, drawNumber, users: credited });
  }
  return credited;
}
