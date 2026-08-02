import { randomIntInclusive } from "./random.js";

/** Roll ticket count for drip modes (1..min(playerMax, templateMax)). */
export function rollTicketCount(
  maxTicketCount: number,
  templateMaxCardsPerPlayer?: number | null
): number {
  const playerMax = Math.max(1, Math.floor(maxTicketCount));
  const templateMax =
    templateMaxCardsPerPlayer != null &&
    Number.isFinite(templateMaxCardsPerPlayer) &&
    templateMaxCardsPerPlayer > 0
      ? Math.floor(templateMaxCardsPerPlayer)
      : playerMax;
  const upperBound = Math.max(1, Math.min(playerMax, templateMax));
  return randomIntInclusive(1, upperBound);
}

