/**
 * Wallet delta invariants — pure port of the validation/derivation logic in
 * game_finance.fn_wallet_apply_delta.
 *
 * The actual ledger mutation (UPDATE wallets / INSERT transactions) stays in the
 * database `SECURITY DEFINER` function for atomicity (see the migration roadmap:
 * wallet/ledger functions are KEEP). This module reproduces the *business rules*
 * the SQL enforces, so the engine can validate, preview, and — in full `engine`
 * mode behind a transactional adapter — produce identical ledger rows.
 *
 * Rules preserved:
 *   - zero delta is rejected ('zero amount not allowed').
 *   - balance_after = balance_before + delta.
 *   - if NOT allow_negative and balance_after < 0 → 'insufficient funds'.
 *   - the transaction stores ABS(delta) as a positive amount, status 'completed',
 *     with balance_before / balance_after snapshots and room_id/ticket_id pulled
 *     from meta.
 */

export type TransactionType = string;

export interface WalletApplyInput {
  balanceBefore: number;
  amountDelta: number;
  allowNegative?: boolean;
}

export interface WalletApplyResult {
  balanceBefore: number;
  balanceAfter: number;
  /** ABS(amountDelta) — the positive amount stored on the transaction row. */
  transactionAmount: number;
}

export class WalletInvariantError extends Error {}

export function applyWalletDelta(input: WalletApplyInput): WalletApplyResult {
  if (input.amountDelta === 0) {
    throw new WalletInvariantError("zero amount not allowed");
  }

  const balanceAfter = input.balanceBefore + input.amountDelta;

  if (!input.allowNegative && balanceAfter < 0) {
    throw new WalletInvariantError(
      `insufficient funds: balance would be ${balanceAfter}`
    );
  }

  return {
    balanceBefore: input.balanceBefore,
    balanceAfter,
    transactionAmount: Math.abs(input.amountDelta),
  };
}

/** Extract room_id / ticket_id from a transaction meta object, as the SQL does. */
export function extractMetaRefs(meta: Record<string, unknown> | null | undefined): {
  roomId: string | null;
  ticketId: string | null;
} {
  if (!meta) return { roomId: null, ticketId: null };
  const roomId = typeof meta.room_id === "string" ? meta.room_id : null;
  const ticketId = typeof meta.ticket_id === "string" ? meta.ticket_id : null;
  return { roomId, ticketId };
}
