export type AutoBuyFundDisplayTone = "gain" | "loss";

export type AutoBuyFundDisplay = {
  value: string;
  tone: AutoBuyFundDisplayTone;
};

/**
 * Cost of auto-buy tickets still in an unfinished room.
 * Prefer the snapshot field from PostgreSQL; fall back to the current
 * room's reserved cards only when auto-buy has already joined (lastRoomId).
 */
export function resolveAutoBuyInPlayCost(options: {
  inPlayCost?: number;
  hasReservedCards?: boolean;
  lastRoomId?: string | null;
  price: number;
  cardCount: number;
}): number {
  if (options.inPlayCost != null && Number.isFinite(options.inPlayCost)) {
    return Math.max(0, options.inPlayCost);
  }
  if (
    options.hasReservedCards &&
    options.lastRoomId &&
    Number.isFinite(options.price) &&
    Number.isFinite(options.cardCount)
  ) {
    return Math.max(0, options.price * options.cardCount);
  }
  return 0;
}

/**
 * Realized auto-buy profit/loss vs initial fund (سقف خرید).
 * Card spend still in play is capital, not a loss — add it back.
 * Loss: realized deficit, red (e.g. -10,000).
 * Profit: realized net gain, green (e.g. +25,000).
 */
export function formatAutoBuyFundDisplay(
  fundInitial: number,
  fundRemaining: number,
  inPlayCost: number = 0
): AutoBuyFundDisplay | null {
  if (!Number.isFinite(fundInitial) || fundInitial <= 0) return null;
  if (!Number.isFinite(fundRemaining) || fundRemaining < 0) return null;
  const openCost =
    Number.isFinite(inPlayCost) && inPlayCost > 0 ? inPlayCost : 0;

  const pnl = fundRemaining + openCost - fundInitial;
  if (pnl < 0) {
    return {
      value: pnl.toLocaleString("en-US"),
      tone: "loss",
    };
  }

  return {
    value: `+${pnl.toLocaleString("en-US")}`,
    tone: "gain",
  };
}
