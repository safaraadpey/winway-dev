/**
 * Prize-pool split — faithful port of the settlement math inside
 * game_finance.fn_finish_room_and_settle.
 *
 * The "pool" is the sum of `amount_to_pool` across every ticket's commission row
 * (i.e. stake minus commission). It is divided between LINE and FULL winners by
 * configurable percentages, with these exact rules preserved:
 *   - line_pct / full_pct come from room → template → default 0.5.
 *   - both clamped to >= 0; if both are 0 they reset to 0.5 / 0.5.
 *   - if they sum to > 1 they are renormalized so line_pct + full_pct == 1.
 *   - pools: line_pool = ROUND(total * line_pct, 2); full_pool = ROUND(total - line_pool, 2).
 *   - if there are NO line winners, the line pool rolls into the full pool.
 *   - per-winner share = ROUND(pool / winners, 2) (0 when pool <= 0), split equally.
 */

import { atLeastZero, round2 } from "./money.js";

export const DEFAULT_LINE_PCT = 0.5;
export const DEFAULT_FULL_PCT = 0.5;

export interface RewardPercentages {
  linePct: number;
  fullPct: number;
}

/**
 * Resolve effective line/full percentages from the room/template raw values,
 * applying the clamp + reset + renormalize rules in order.
 */
export function resolveRewardPercentages(
  roomLinePct: number | null | undefined,
  roomFullPct: number | null | undefined,
  templateLinePct: number | null | undefined,
  templateFullPct: number | null | undefined
): RewardPercentages {
  let linePct = atLeastZero(roomLinePct ?? templateLinePct ?? DEFAULT_LINE_PCT);
  let fullPct = atLeastZero(roomFullPct ?? templateFullPct ?? DEFAULT_FULL_PCT);

  if (linePct === 0 && fullPct === 0) {
    linePct = DEFAULT_LINE_PCT;
    fullPct = DEFAULT_FULL_PCT;
  }

  if (linePct + fullPct > 1) {
    linePct = linePct / (linePct + fullPct);
    fullPct = 1 - linePct;
  }

  return { linePct, fullPct };
}

export interface PrizeSplitInput {
  totalPool: number;
  linePct: number;
  fullPct: number;
  lineWinners: number;
  fullWinners: number;
}

export interface PrizeSplitResult {
  linePool: number;
  fullPool: number;
  /** Amount paid to EACH line winner. */
  lineShare: number;
  /** Amount paid to EACH full winner. */
  fullShare: number;
}

export function splitPrizePool(input: PrizeSplitInput): PrizeSplitResult {
  let linePool = round2(input.totalPool * input.linePct);
  let fullPool = round2(input.totalPool - linePool);

  // No line winners → the entire line pool rolls into the full pool.
  if (input.lineWinners === 0) {
    fullPool = round2(fullPool + linePool);
    linePool = 0;
  }

  const lineShare =
    input.lineWinners > 0 && linePool > 0
      ? round2(linePool / input.lineWinners)
      : 0;
  const fullShare =
    input.fullWinners > 0 && fullPool > 0
      ? round2(fullPool / input.fullWinners)
      : 0;

  return { linePool, fullPool, lineShare, fullShare };
}
