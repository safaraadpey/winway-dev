export type AutoBuyFundDisplayTone = "gain" | "loss";

export type AutoBuyFundDisplay = {
  value: string;
  tone: AutoBuyFundDisplayTone;
};

/**
 * Lobby card profit/loss vs initial auto-buy fund (سقف خرید).
 * Loss: deficit from capital, red (e.g. -10,000).
 * Profit: net gain only, green (e.g. +25,000) — not remaining fund.
 */
export function formatAutoBuyFundDisplay(
  fundInitial: number,
  fundRemaining: number
): AutoBuyFundDisplay | null {
  if (!Number.isFinite(fundInitial) || fundInitial <= 0) return null;
  if (!Number.isFinite(fundRemaining) || fundRemaining < 0) return null;

  const pnl = fundRemaining - fundInitial;
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
