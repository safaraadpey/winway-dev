/**
 * Ding aggregation — faithful port of public.fn_aggregate_ding_for_processed_draw
 * (the trigger that runs when a draw's processed_at flips NULL → NOT NULL).
 *
 * Rules preserved:
 *   - ding_per_card = COALESCE(room.ding_per_number, template.ding_per_number, 1).
 *   - For the drawn number, count each user's cards whose card_numbers contains
 *     that value, considering ONLY tickets that are not cancelled and have
 *     reservation_status = 'reserved'.
 *   - delta(user) = matchedCards * ding_per_card, emitted only when > 0.
 *   - Each user's ding_balance is incremented by their delta; a ding_transaction
 *     is written per user. Aggregation is idempotent (guarded by
 *     draws.ding_aggregated_at, enforced in the orchestrator).
 */

export const DEFAULT_DING_PER_NUMBER = 1;

export interface DingAggregateInput {
  drawnNumber: number;
  /** COALESCE(room.ding_per_number, template.ding_per_number, 1). */
  dingPerCard: number;
  /**
   * For each user, how many of their eligible cards (reserved, not cancelled)
   * contain the drawn number on this room's draw.
   */
  matchedCardsByUser: ReadonlyMap<string, number>;
}

export interface DingCredit {
  userId: string;
  matchedCards: number;
  /** matchedCards * dingPerCard. */
  delta: number;
}

export function resolveDingPerCard(
  roomDingPerNumber: number | null | undefined,
  templateDingPerNumber: number | null | undefined
): number {
  return Math.trunc(
    roomDingPerNumber ?? templateDingPerNumber ?? DEFAULT_DING_PER_NUMBER
  );
}

export function computeDingCredits(input: DingAggregateInput): DingCredit[] {
  const perCard = Math.trunc(input.dingPerCard);
  const credits: DingCredit[] = [];

  for (const [userId, matchedCards] of input.matchedCardsByUser) {
    if (matchedCards <= 0) continue;
    const delta = matchedCards * perCard;
    if (delta <= 0) continue;
    credits.push({ userId, matchedCards, delta });
  }

  return credits;
}
