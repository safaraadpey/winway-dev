import type { EnforceHardLimitsInput, EnforceHardLimitsResult } from "./types";

/**
 * Session Budget and Hard Stop-Loss always override profile behavior.
 */
export function enforceHardLimits(input: EnforceHardLimitsInput): EnforceHardLimitsResult {
  const { sessionBudget, hardStopLoss, runtime, proposedSpend } = input;

  if (hardStopLoss > 0 && runtime.sessionPnl <= -hardStopLoss) {
    return { allowed: false, forceExit: true, reason: "stop_loss_hit" };
  }

  const projectedSpend = runtime.sessionSpend + proposedSpend;
  if (sessionBudget > 0 && projectedSpend > sessionBudget) {
    return { allowed: false, forceExit: true, reason: "budget_exhausted" };
  }

  if (sessionBudget > 0 && runtime.sessionSpend >= sessionBudget) {
    return { allowed: false, forceExit: true, reason: "budget_exhausted" };
  }

  return { allowed: true, forceExit: false, reason: "ok" };
}
