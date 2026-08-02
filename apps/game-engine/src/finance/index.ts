/**
 * Finance adapter.
 *
 * The ledger (wallets, transactions, commissions_log) is the system of record
 * and stays in Postgres `SECURITY DEFINER` RPCs for atomicity — this is the
 * KEEP decision in docs/roadmap/GAME_ENGINE_MIGRATION.md. The engine NEVER
 * mutates wallets/transactions directly; it orchestrates and calls these RPCs.
 *
 * The pure calculators in src/core (commission, prizeSplit, wallet invariants)
 * mirror the math these RPCs perform and are used for previews and parity
 * checks (see verifyXxx helpers) without touching the ledger.
 */

import type { SupabaseAdmin } from "../db/supabase-admin.js";
import {
  type CommissionRates,
  type CommissionSplit,
  computeTicketCommission,
} from "../core/index.js";

function rpcErr(name: string, message: string): Error {
  return new Error(`${name} failed: ${message}`);
}

export interface WalletDeltaArgs {
  userId: string;
  currency: string;
  amountDelta: number;
  transactionType: string;
  sourceKind: string;
  sourceRef?: string | null;
  description?: string | null;
  meta?: Record<string, unknown>;
  allowNegative?: boolean;
}

/** Wraps game_finance.fn_wallet_apply_delta — returns the transaction id. */
export async function walletApplyDelta(
  supabase: SupabaseAdmin,
  args: WalletDeltaArgs
): Promise<string> {
  const { data, error } = await supabase.rpc("fn_wallet_apply_delta", {
    p_user_id: args.userId,
    p_currency: args.currency,
    p_amount_delta: args.amountDelta,
    p_transaction_type: args.transactionType,
    p_source_kind: args.sourceKind,
    p_source_ref: args.sourceRef ?? null,
    p_description: args.description ?? null,
    p_meta: args.meta ?? {},
    p_allow_negative: args.allowNegative ?? false,
  });
  if (error) throw rpcErr("fn_wallet_apply_delta", error.message);
  return data as string;
}

/** Wraps game_finance.fn_record_ticket_commission. */
export async function recordTicketCommission(
  supabase: SupabaseAdmin,
  ticketId: string
): Promise<void> {
  const { error } = await supabase.rpc("fn_record_ticket_commission", {
    p_ticket: ticketId,
  });
  if (error) throw rpcErr("fn_record_ticket_commission", error.message);
}

/** Wraps game_finance.fn_distribute_ticket_commission — returns amount_to_pool. */
export async function distributeTicketCommission(
  supabase: SupabaseAdmin,
  ticketId: string,
  adminUser?: string | null
): Promise<number> {
  const { data, error } = await supabase.rpc("fn_distribute_ticket_commission", {
    p_ticket: ticketId,
    p_admin_user: adminUser ?? null,
  });
  if (error) throw rpcErr("fn_distribute_ticket_commission", error.message);
  return Number(data ?? 0);
}

/**
 * Wraps game_finance.fn_finish_room_and_settle. This is the atomic settlement
 * entry point: consume tickets, capture holds, distribute commission, split the
 * prize pool, pay winners, flip the room to finished. Idempotent in the DB.
 */
export async function finishRoomAndSettle(
  supabase: SupabaseAdmin,
  roomId: string,
  adminUser?: string | null
): Promise<void> {
  const { error } = await supabase.rpc("fn_finish_room_and_settle", {
    p_room: roomId,
    p_admin_user: adminUser ?? null,
  });
  if (error) throw rpcErr("fn_finish_room_and_settle", error.message);
}

/**
 * Parity helper: recompute a ticket's commission with the pure core and compare
 * to what the DB recorded. Used by compatibility checks / shadow mode — never
 * writes anything.
 */
export function previewTicketCommission(
  gross: number,
  rates: CommissionRates
): CommissionSplit {
  return computeTicketCommission(gross, rates);
}
