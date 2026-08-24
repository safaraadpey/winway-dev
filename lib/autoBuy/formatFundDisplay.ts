export type AutoBuyFundDisplayTone = "gain" | "loss";

export type AutoBuyFundDisplay = {
  value: string;
  tone: AutoBuyFundDisplayTone;
};

/**
 * Lobby card delta vs initial auto-buy fund (سقف خرید).
 * Below initial: negative spent amount in red (e.g. -10,000).
 * At/above initial: positive remaining with + prefix in green (e.g. +124,000).
 */
export function formatAutoBuyFundDisplay(
  fundInitial: number,
  fundRemaining: number
): AutoBuyFundDisplay | null {
  if (!Number.isFinite(fundInitial) || fundInitial <= 0) return null;
  if (!Number.isFinite(fundRemaining) || fundRemaining < 0) return null;

  if (fundRemaining < fundInitial) {
    const delta = fundRemaining - fundInitial;
    return {
      value: delta.toLocaleString("en-US"),
      tone: "loss",
    };
  }

  return {
    value: `+${fundRemaining.toLocaleString("en-US")}`,
    tone: "gain",
  };
}
