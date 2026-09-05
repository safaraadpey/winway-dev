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
import type { RoomFinalizationDingPayload } from "../domain/ding/roomDingState.js";
import { toRpcDingCredits } from "../domain/ding/roomDingState.js";
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

/** Optional Engine Ding payload for room_level atomic settlement. */
export interface FinishRoomDingPayload {
  settlementKey: string;
  settlementVersion: number;
  dingCredits: { user_id: string; amount: number }[];
}

/**
 * Wraps game_finance.fn_finish_room_and_settle. This is the atomic settlement
 * entry point: consume tickets, capture holds, distribute commission, split the
 * prize pool, pay winners, flip the room to finished. Idempotent in the DB.
 *
 * For room_level Ding, pass dingPayload so prize + Ding + consume commit together.
 */
export async function finishRoomAndSettle(
  supabase: SupabaseAdmin,
  roomId: string,
  adminUser?: string | null,
  dingPayload?: FinishRoomDingPayload | null
): Promise<void> {
  const { error } = await supabase.rpc("fn_finish_room_and_settle", {
    p_room: roomId,
    p_admin_user: adminUser ?? null,
    p_ding_settlement_key: dingPayload?.settlementKey ?? null,
    p_ding_settlement_version: dingPayload?.settlementVersion ?? null,
    p_ding_credits: dingPayload?.dingCredits ?? null,
  });
  if (error) throw rpcErr("fn_finish_room_and_settle", error.message);
}

/** manifest_ram: one atomic settlement from Engine GameFinalizationResult. */
export async function finishRoomFromFinalization(
  supabase: SupabaseAdmin,
  roomId: string,
  finalization: Record<string, unknown>,
  opts?: { adminUser?: string | null; persistHistory?: boolean }
): Promise<void> {
  const { error } = await supabase.rpc("fn_finish_room_from_finalization", {
    p_room: roomId,
    p_finalization: finalization,
    p_admin_user: opts?.adminUser ?? null,
    p_persist_history: opts?.persistHistory ?? true,
  });
  if (error) throw rpcErr("fn_finish_room_from_finalization", error.message);
}

export function finishDingPayloadFromEngine(
  payload: RoomFinalizationDingPayload
): FinishRoomDingPayload {
  return {
    settlementKey: payload.settlementKey,
    settlementVersion: payload.settlementVersion,
    dingCredits: toRpcDingCredits(payload),
  };
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
