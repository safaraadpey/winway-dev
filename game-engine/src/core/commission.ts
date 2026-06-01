/**
 * Commission calculation — faithful port of the two DB pipelines.
 *
 * Room / ticket : game_finance.fn_record_ticket_commission(p_ticket)
 * Tournament    : tournament.fn_commission_snapshot_entry(tournament_id, entry_id)
 *
 * Shared model (see docs/system-map/Commission-System.md):
 *   total_comm  = CEIL(gross * eventRate)
 *   agentAmount = CEIL(total_comm * agentRate)
 *   superAmount = CEIL(total_comm * GREATEST(superRate - agentRate, 0))   // NET of agent
 *   adminAmount = total_comm - agentAmount - superAmount                  // remainder
 *   toPool      = gross - total_comm
 *
 * `superRate` is the COMBINED agent+super cut; the super only nets the part
 * above the agent's rate, and the admin sweeps the rounding remainder.
 *
 * Rate normalization (both event and tier rates): a value > 1 is treated as a
 * percentage and divided by 100 (`IF v_rate > 1 THEN v_rate := v_rate/100`).
 */

import { atLeastZero, ceilInt } from "./money.js";

export interface CommissionRates {
  /** Event rate: room/template commission_rate or tournament commission_rate. */
  eventRate: number;
  /** Agent tier rate from user_commissions.agent_commission (0 if no agent). */
  agentRate: number;
  /** Super tier rate from user_commissions.super_commission (0 if no super). */
  superRate: number;
}

export interface CommissionSplit {
  /** CEIL(gross * eventRate). */
  totalCommission: number;
  agentAmount: number;
  superAmount: number;
  adminAmount: number;
  /** Remainder of gross routed to the prize pool. */
  amountToPool: number;
  /** Normalized rates actually applied (post >1 ÷100). */
  appliedEventRate: number;
  appliedAgentRate: number;
  appliedSuperRate: number;
}

/** `IF rate > 1 THEN rate := rate / 100`. */
export function normalizeRate(rate: number | null | undefined): number {
  const r = rate ?? 0;
  return r > 1 ? r / 100 : r;
}

/**
 * Room/ticket split — fn_record_ticket_commission.
 * No LEAST() caps on agent/super (matches the SQL exactly).
 */
export function computeTicketCommission(
  gross: number,
  rates: CommissionRates
): CommissionSplit {
  const eventRate = normalizeRate(rates.eventRate);
  const agentRate = normalizeRate(rates.agentRate);
  const superRate = normalizeRate(rates.superRate);

  const totalCommission = ceilInt(gross * eventRate);
  const agentAmount = ceilInt(totalCommission * agentRate);
  const superAmount = ceilInt(totalCommission * atLeastZero(superRate - agentRate));
  const adminAmount = atLeastZero(totalCommission - agentAmount - superAmount);
  const amountToPool = atLeastZero(gross - totalCommission);

  return {
    totalCommission,
    agentAmount,
    superAmount,
    adminAmount,
    amountToPool,
    appliedEventRate: eventRate,
    appliedAgentRate: agentRate,
    appliedSuperRate: superRate,
  };
}

/**
 * Tournament entry split — fn_commission_snapshot_entry.
 * Adds LEAST() caps so agent/super can never exceed the remaining commission
 * (matches the SQL exactly). `gross = tickets_count * ticket_price`.
 */
export function computeTournamentCommission(
  gross: number,
  rates: CommissionRates
): CommissionSplit {
  const eventRate = normalizeRate(rates.eventRate);
  const agentRate = normalizeRate(rates.agentRate);
  const superRate = normalizeRate(rates.superRate);

  const totalCommission = ceilInt(gross * atLeastZero(eventRate));

  const agentAmount = Math.min(
    totalCommission,
    ceilInt(totalCommission * atLeastZero(agentRate))
  );
  const superAmount = Math.min(
    atLeastZero(totalCommission - agentAmount),
    ceilInt(totalCommission * atLeastZero(superRate - agentRate))
  );
  const adminAmount = atLeastZero(totalCommission - agentAmount - superAmount);
  const amountToPool = atLeastZero(gross - totalCommission);

  return {
    totalCommission,
    agentAmount,
    superAmount,
    adminAmount,
    amountToPool,
    appliedEventRate: eventRate,
    appliedAgentRate: agentRate,
    appliedSuperRate: superRate,
  };
}
