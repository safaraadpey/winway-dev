import type { RunContext } from "./types.js";
import type { PoolClient } from "pg";
import {
  copyFullSnapshot,
  copyImmutableSource,
  copyVersionedSource,
  type ImmutableSourceDef,
  type VersionedSourceDef,
} from "./copyLedger.js";
import { sanitizeKycRow, sanitizeRoomForArchive } from "./sanitize.js";
import { sourceRowHash } from "./hash.js";
import { bumpInserted, bumpRead, bumpSkipped } from "./runControl.js";

function json(row: Record<string, unknown>): string {
  return JSON.stringify(row);
}

function ins(
  table: string,
  cols: string[],
  conflictTarget: string,
  values: unknown[]
): { sql: string; values: unknown[] } {
  const placeholders = cols.map((_, i) => `$${i + 1}`).join(", ");
  return {
    sql: `INSERT INTO ${table} (${cols.join(", ")}) VALUES (${placeholders}) ON CONFLICT ${conflictTarget} DO NOTHING`,
    values,
  };
}

const IMMUTABLE_SOURCES: ImmutableSourceDef[] = [
  {
    sourceKey: "public.transactions",
    tableKey: "public.transactions",
    idColumn: "id",
    createdAtColumn: "created_at",
    archiveTable: "archive.ledger_transactions",
    selectColumns: "*",
    buildInsert: (row, sanitized, runId) =>
      ins(
        "archive.ledger_transactions",
        [
          "source_id",
          "source_created_at",
          "user_id",
          "wallet_id",
          "type",
          "status",
          "amount",
          "currency",
          "balance_before",
          "balance_after",
          "source_kind",
          "source_ticket_id",
          "source_room_id",
          "source_ref",
          "idempotency_key",
          "related_room",
          "ticket_id",
          "room_id",
          "source_row",
          "first_run_id",
        ],
        "(source_id)",
        [
          row.id,
          row.created_at,
          row.user_id,
          row.wallet_id,
          row.type,
          row.status,
          row.amount,
          row.currency,
          row.balance_before,
          row.balance_after,
          row.source_kind,
          row.source_ticket_id,
          row.source_room_id,
          row.source_ref,
          row.idempotency_key,
          row.related_room,
          row.ticket_id,
          row.room_id,
          json(sanitized),
          runId,
        ]
      ),
  },
  {
    sourceKey: "public.ding_transactions",
    tableKey: "public.ding_transactions",
    idColumn: "id",
    createdAtColumn: "created_at",
    archiveTable: "archive.ledger_ding_transactions",
    selectColumns: "*",
    buildInsert: (row, sanitized, runId) =>
      ins(
        "archive.ledger_ding_transactions",
        [
          "source_id",
          "source_created_at",
          "user_id",
          "room_id",
          "ticket_id",
          "draw_id",
          "drawn_number",
          "amount",
          "source_row",
          "first_run_id",
        ],
        "(source_id)",
        [
          row.id,
          row.created_at,
          row.user_id,
          row.room_id,
          row.ticket_id,
          row.draw_id,
          row.drawn_number,
          row.amount,
          json(sanitized),
          runId,
        ]
      ),
  },
  {
    sourceKey: "public.commissions_log",
    tableKey: "public.commissions_log",
    idColumn: "id",
    createdAtColumn: "created_at",
    archiveTable: "archive.ledger_commissions",
    selectColumns: "*",
    buildInsert: (row, sanitized, runId) =>
      ins(
        "archive.ledger_commissions",
        [
          "source_id",
          "source_created_at",
          "ticket_id",
          "room_id",
          "player_id",
          "agent_id",
          "super_id",
          "gross_amount",
          "agent_amount",
          "super_amount",
          "admin_amount",
          "amount_to_pool",
          "status",
          "source_row",
          "first_run_id",
        ],
        "(source_id)",
        [
          row.id,
          row.created_at,
          row.ticket_id,
          row.room_id,
          row.player_id,
          row.agent_id,
          row.super_id,
          row.gross_amount,
          row.agent_amount,
          row.super_amount,
          row.admin_amount,
          row.amount_to_pool,
          row.status,
          json(sanitized),
          runId,
        ]
      ),
  },
  {
    sourceKey: "public.commission_stat_events",
    tableKey: "public.commission_stat_events",
    idColumn: "source_id",
    createdAtColumn: "created_at",
    archiveTable: "archive.ledger_commission_stat_events",
    selectColumns: "*",
    buildInsert: (row, sanitized, runId) =>
      ins(
        "archive.ledger_commission_stat_events",
        [
          "source_kind",
          "source_id",
          "settled_at",
          "source_created_at",
          "source_row",
          "first_run_id",
        ],
        "(source_kind, source_id)",
        [
          row.source_kind,
          row.source_id,
          row.settled_at,
          row.created_at,
          json(sanitized),
          runId,
        ]
      ),
  },
  {
    sourceKey: "public.wallet_transfer_idempotency",
    tableKey: "public.wallet_transfer_idempotency",
    idColumn: "id",
    createdAtColumn: "created_at",
    archiveTable: "archive.ledger_wallet_transfer_idempotency",
    selectColumns: "*",
    buildInsert: (row, sanitized, runId) =>
      ins(
        "archive.ledger_wallet_transfer_idempotency",
        [
          "source_id",
          "source_created_at",
          "actor_id",
          "from_user_id",
          "to_user_id",
          "amount",
          "action",
          "transfer_id",
          "payload_hash",
          "source_row",
          "first_run_id",
        ],
        "(source_id)",
        [
          row.id,
          row.created_at,
          row.actor_id,
          row.from_user_id,
          row.to_user_id,
          row.amount,
          row.action,
          row.transfer_id,
          row.payload_hash,
          json(sanitized),
          runId,
        ]
      ),
  },
  {
    sourceKey: "deposit.attempts",
    tableKey: "deposit.attempts",
    idColumn: "id",
    createdAtColumn: "created_at",
    archiveTable: "archive.ledger_deposit_attempts",
    selectColumns: "*",
    buildInsert: (row, sanitized, runId) =>
      ins(
        "archive.ledger_deposit_attempts",
        [
          "source_id",
          "source_created_at",
          "intent_id",
          "provider",
          "payload_hash",
          "source_row",
          "first_run_id",
        ],
        "(source_id)",
        [
          row.id,
          row.created_at,
          row.intent_id,
          row.provider,
          row.payload_hash,
          json(sanitized),
          runId,
        ]
      ),
  },
  {
    sourceKey: "deposit.verifications",
    tableKey: "deposit.verifications",
    idColumn: "id",
    createdAtColumn: "verified_at",
    archiveTable: "archive.ledger_deposit_verifications",
    selectColumns: "*",
    buildInsert: (row, sanitized, runId) =>
      ins(
        "archive.ledger_deposit_verifications",
        [
          "source_id",
          "source_created_at",
          "intent_id",
          "result",
          "amount_observed",
          "evidence",
          "source_row",
          "first_run_id",
        ],
        "(source_id)",
        [
          row.id,
          row.verified_at ?? row.created_at,
          row.intent_id,
          row.result,
          row.amount_observed,
          row.evidence,
          json(sanitized),
          runId,
        ]
      ),
  },
  {
    sourceKey: "deposit.events",
    tableKey: "deposit.events",
    idColumn: "id",
    createdAtColumn: "created_at",
    archiveTable: "archive.ledger_deposit_events",
    selectColumns: "*",
    buildInsert: (row, sanitized, runId) =>
      ins(
        "archive.ledger_deposit_events",
        [
          "source_id",
          "source_created_at",
          "intent_id",
          "event_type",
          "actor",
          "payload",
          "source_row",
          "first_run_id",
        ],
        "(source_id)",
        [
          row.id,
          row.created_at,
          row.intent_id,
          row.event_type,
          row.actor,
          row.payload,
          json(sanitized),
          runId,
        ]
      ),
  },
  {
    sourceKey: "deposit.user_crypto_addresses",
    tableKey: "deposit.user_crypto_addresses",
    idColumn: "id",
    createdAtColumn: "created_at",
    archiveTable: "archive.ledger_user_crypto_addresses",
    selectColumns: "*",
    buildInsert: (row, sanitized, runId) =>
      ins(
        "archive.ledger_user_crypto_addresses",
        [
          "source_id",
          "source_created_at",
          "user_id",
          "derivation_index",
          "bep20_address",
          "trc20_address",
          "source_row",
          "first_run_id",
        ],
        "(source_id)",
        [
          row.id,
          row.created_at,
          row.user_id,
          row.derivation_index,
          row.bep20_address,
          row.trc20_address,
          json(sanitized),
          runId,
        ]
      ),
  },
  {
    sourceKey: "deposit.recon_reports",
    tableKey: "deposit.recon_reports",
    idColumn: "id",
    createdAtColumn: "created_at",
    archiveTable: "archive.ledger_deposit_recon_reports",
    selectColumns: "*",
    buildInsert: (row, sanitized, runId) =>
      ins(
        "archive.ledger_deposit_recon_reports",
        [
          "source_id",
          "source_created_at",
          "status",
          "summary",
          "details",
          "source_row",
          "first_run_id",
        ],
        "(source_id)",
        [
          row.id,
          row.created_at,
          row.status,
          row.summary,
          row.details,
          json(sanitized),
          runId,
        ]
      ),
  },
  {
    sourceKey: "public.finance_recon_reports",
    tableKey: "public.finance_recon_reports",
    idColumn: "id",
    createdAtColumn: "created_at",
    archiveTable: "archive.ledger_finance_recon_reports",
    selectColumns: "*",
    buildInsert: (row, sanitized, runId) =>
      ins(
        "archive.ledger_finance_recon_reports",
        [
          "source_id",
          "source_created_at",
          "kind",
          "status",
          "summary",
          "details",
          "source_row",
          "first_run_id",
        ],
        "(source_id)",
        [
          row.id,
          row.created_at,
          row.kind,
          row.status,
          row.summary,
          row.details,
          json(sanitized),
          runId,
        ]
      ),
  },
  {
    sourceKey: "public.tournament_commission_snapshots",
    tableKey: "public.tournament_commission_snapshots",
    idColumn: "id",
    createdAtColumn: "created_at",
    archiveTable: "archive.ledger_tournament_commission_snapshots",
    selectColumns: "*",
    buildInsert: (row, sanitized, runId) =>
      ins(
        "archive.ledger_tournament_commission_snapshots",
        [
          "source_id",
          "source_created_at",
          "tournament_id",
          "entry_id",
          "user_id",
          "agent_amount",
          "super_amount",
          "admin_amount",
          "source_row",
          "first_run_id",
        ],
        "(source_id)",
        [
          row.id,
          row.created_at,
          row.tournament_id,
          row.entry_id,
          row.user_id,
          row.agent_amount,
          row.super_amount,
          row.admin_amount,
          json(sanitized),
          runId,
        ]
      ),
  },
  {
    sourceKey: "public.tournament_prize_rules",
    tableKey: "public.tournament_prize_rules",
    idColumn: "id",
    createdAtColumn: "created_at",
    archiveTable: "archive.ledger_tournament_prize_rules",
    selectColumns: "*",
    buildInsert: (row, sanitized, runId) =>
      ins(
        "archive.ledger_tournament_prize_rules",
        [
          "source_id",
          "source_created_at",
          "tournament_id",
          "rank",
          "payout_type",
          "payout_value",
          "source_row",
          "first_run_id",
        ],
        "(source_id)",
        [
          row.id,
          row.created_at,
          row.tournament_id,
          row.rank,
          row.payout_type,
          row.payout_value,
          json(sanitized),
          runId,
        ]
      ),
  },
  {
    sourceKey: "public.admin_audit_log",
    tableKey: "public.admin_audit_log",
    idColumn: "id",
    createdAtColumn: "created_at",
    archiveTable: "archive.audit_admin_log",
    selectColumns: "*",
    buildInsert: (row, sanitized, runId) =>
      ins(
        "archive.audit_admin_log",
        [
          "source_id",
          "source_created_at",
          "admin_id",
          "action",
          "target_table",
          "target_id",
          "payload",
          "ip_address",
          "user_agent",
          "source_row",
          "first_run_id",
        ],
        "(source_id)",
        [
          row.id,
          row.created_at,
          row.admin_id,
          row.action,
          row.target_table,
          row.target_id,
          row.payload,
          row.ip_address,
          row.user_agent,
          json(sanitized),
          runId,
        ]
      ),
  },
  {
    sourceKey: "public.invitation_links",
    tableKey: "public.invitation_links",
    idColumn: "id",
    createdAtColumn: "created_at",
    archiveTable: "archive.audit_invitation_links",
    selectColumns: "*",
    buildInsert: (row, sanitized, runId) =>
      ins(
        "archive.audit_invitation_links",
        [
          "source_id",
          "source_created_at",
          "code",
          "inviter_id",
          "inviter_role",
          "is_active",
          "source_row",
          "first_run_id",
        ],
        "(source_id)",
        [
          row.id,
          row.created_at,
          row.code,
          row.inviter_id,
          row.inviter_role,
          row.is_active,
          json(sanitized),
          runId,
        ]
      ),
  },
  {
    sourceKey: "public.player_signups",
    tableKey: "public.player_signups",
    idColumn: "id",
    createdAtColumn: "signed_up_at",
    archiveTable: "archive.audit_player_signups",
    selectColumns: "*",
    buildInsert: (row, sanitized, runId) =>
      ins(
        "archive.audit_player_signups",
        [
          "source_id",
          "source_created_at",
          "invitation_link_id",
          "player_id",
          "signed_up_at",
          "source_row",
          "first_run_id",
        ],
        "(source_id)",
        [
          row.id,
          row.signed_up_at,
          row.invitation_link_id,
          row.player_id,
          row.signed_up_at,
          json(sanitized),
          runId,
        ]
      ),
  },
];

const VERSIONED_SOURCES: VersionedSourceDef[] = [
  {
    sourceKey: "deposit.intents",
    tableKey: "deposit.intents",
    idColumn: "id",
    createdAtColumn: "created_at",
    updatedAtColumn: "updated_at",
    archiveTable: "archive.ledger_deposit_intents",
    latestHashQuery: `SELECT source_row_hash FROM archive.ledger_deposit_intents
      WHERE source_id = $1::uuid ORDER BY archived_at DESC LIMIT 1`,
    selectColumns: "*",
    buildInsert: (row, sanitized, hash, runId) =>
      ins(
        "archive.ledger_deposit_intents",
        [
          "source_id",
          "source_row_hash",
          "source_created_at",
          "source_updated_at",
          "user_id",
          "channel",
          "provider",
          "amount_expected",
          "currency",
          "status",
          "source_row",
          "first_run_id",
        ],
        "(source_id, source_row_hash)",
        [
          row.id,
          hash,
          row.created_at,
          row.updated_at,
          row.user_id,
          row.channel,
          row.provider,
          row.amount_expected,
          row.currency,
          row.status,
          json(sanitized),
          runId,
        ]
      ),
  },
  {
    sourceKey: "deposit.credits",
    tableKey: "deposit.credits",
    idColumn: "id",
    createdAtColumn: "created_at",
    updatedAtColumn: "updated_at",
    archiveTable: "archive.ledger_deposit_credits",
    latestHashQuery: `SELECT source_row_hash FROM archive.ledger_deposit_credits
      WHERE source_id = $1::uuid ORDER BY archived_at DESC LIMIT 1`,
    selectColumns: "*",
    buildInsert: (row, sanitized, hash, runId) =>
      ins(
        "archive.ledger_deposit_credits",
        [
          "source_id",
          "source_row_hash",
          "source_created_at",
          "source_updated_at",
          "intent_id",
          "user_id",
          "amount",
          "ledger_tx_id",
          "status",
          "source_row",
          "first_run_id",
        ],
        "(source_id, source_row_hash)",
        [
          row.id,
          hash,
          row.created_at,
          row.updated_at,
          row.intent_id,
          row.user_id,
          row.amount,
          row.ledger_tx_id,
          row.status,
          json(sanitized),
          runId,
        ]
      ),
  },
  {
    sourceKey: "deposit.crypto_transactions",
    tableKey: "deposit.crypto_transactions",
    idColumn: "id",
    createdAtColumn: "created_at",
    updatedAtColumn: "updated_at",
    archiveTable: "archive.ledger_crypto_transactions",
    latestHashQuery: `SELECT source_row_hash FROM archive.ledger_crypto_transactions
      WHERE source_id = $1::uuid ORDER BY archived_at DESC LIMIT 1`,
    selectColumns: "*",
    buildInsert: (row, sanitized, hash, runId) =>
      ins(
        "archive.ledger_crypto_transactions",
        [
          "source_id",
          "source_row_hash",
          "source_created_at",
          "source_updated_at",
          "user_id",
          "tx_hash",
          "toman_amount",
          "wallet_tx_id",
          "status",
          "source_row",
          "first_run_id",
        ],
        "(source_id, source_row_hash)",
        [
          row.id,
          hash,
          row.created_at,
          row.updated_at,
          row.user_id,
          row.tx_hash,
          row.toman_amount,
          row.wallet_tx_id,
          row.status,
          json(sanitized),
          runId,
        ]
      ),
  },
  {
    sourceKey: "public.withdrawal_requests",
    tableKey: "public.withdrawal_requests",
    idColumn: "id",
    createdAtColumn: "created_at",
    updatedAtColumn: "updated_at",
    archiveTable: "archive.ledger_withdrawal_requests",
    latestHashQuery: `SELECT source_row_hash FROM archive.ledger_withdrawal_requests
      WHERE source_id = $1::uuid ORDER BY archived_at DESC LIMIT 1`,
    selectColumns: "*",
    buildInsert: (row, sanitized, hash, runId) =>
      ins(
        "archive.ledger_withdrawal_requests",
        [
          "source_id",
          "source_row_hash",
          "source_created_at",
          "source_updated_at",
          "player_id",
          "agent_id",
          "amount",
          "kind",
          "status",
          "card_number",
          "sheba_number",
          "wallet_address",
          "source_row",
          "first_run_id",
        ],
        "(source_id, source_row_hash)",
        [
          row.id,
          hash,
          row.created_at,
          row.updated_at,
          row.player_id,
          row.agent_id,
          row.amount,
          row.kind,
          row.status,
          row.card_number,
          row.sheba_number,
          row.wallet_address,
          json(sanitized),
          runId,
        ]
      ),
  },
  {
    sourceKey: "public.player_auto_buy_sessions",
    tableKey: "public.player_auto_buy_sessions",
    idColumn: "id",
    createdAtColumn: "created_at",
    updatedAtColumn: "updated_at",
    archiveTable: "archive.ledger_auto_buy_sessions",
    latestHashQuery: `SELECT source_row_hash FROM archive.ledger_auto_buy_sessions
      WHERE source_id = $1::uuid ORDER BY archived_at DESC LIMIT 1`,
    selectColumns: "*",
    buildInsert: (row, sanitized, hash, runId) =>
      ins(
        "archive.ledger_auto_buy_sessions",
        [
          "source_id",
          "source_row_hash",
          "source_created_at",
          "source_updated_at",
          "user_id",
          "fund_initial",
          "fund_remaining",
          "status",
          "source_row",
          "first_run_id",
        ],
        "(source_id, source_row_hash)",
        [
          row.id,
          hash,
          row.created_at,
          row.updated_at,
          row.user_id,
          row.fund_initial,
          row.fund_remaining,
          row.status,
          json(sanitized),
          runId,
        ]
      ),
  },
  {
    sourceKey: "platform.session_settlement",
    tableKey: "platform.session_settlement",
    idColumn: "id",
    createdAtColumn: "created_at",
    updatedAtColumn: "updated_at",
    archiveTable: "archive.ledger_session_settlement",
    latestHashQuery: `SELECT source_row_hash FROM archive.ledger_session_settlement
      WHERE source_id = $1::uuid ORDER BY archived_at DESC LIMIT 1`,
    selectColumns: "*",
    buildInsert: (row, sanitized, hash, runId) =>
      ins(
        "archive.ledger_session_settlement",
        [
          "source_id",
          "source_row_hash",
          "source_created_at",
          "source_updated_at",
          "session_id",
          "settlement_key",
          "gross_in",
          "gross_out",
          "fee_total",
          "lines",
          "ledger_refs",
          "status",
          "source_row",
          "first_run_id",
        ],
        "(source_id, source_row_hash)",
        [
          row.id,
          hash,
          row.created_at,
          row.updated_at,
          row.session_id,
          row.settlement_key,
          row.gross_in,
          row.gross_out,
          row.fee_total,
          row.lines,
          row.ledger_refs,
          row.status,
          json(sanitized),
          runId,
        ]
      ),
  },
  {
    sourceKey: "public.tournament_entries",
    tableKey: "public.tournament_entries",
    idColumn: "id",
    createdAtColumn: "created_at",
    updatedAtColumn: "created_at",
    archiveTable: "archive.ledger_tournament_entries",
    latestHashQuery: `SELECT source_row_hash FROM archive.ledger_tournament_entries
      WHERE source_id = $1::uuid ORDER BY archived_at DESC LIMIT 1`,
    selectColumns: "*",
    buildInsert: (row, sanitized, hash, runId) =>
      ins(
        "archive.ledger_tournament_entries",
        [
          "source_id",
          "source_row_hash",
          "source_created_at",
          "source_updated_at",
          "tournament_id",
          "user_id",
          "amount",
          "status",
          "source_row",
          "first_run_id",
        ],
        "(source_id, source_row_hash)",
        [
          row.id,
          hash,
          row.created_at,
          row.created_at,
          row.tournament_id,
          row.user_id,
          row.amount,
          row.status,
          json(sanitized),
          runId,
        ]
      ),
  },
  {
    sourceKey: "public.tournament_locks",
    tableKey: "public.tournament_locks",
    idColumn: "id",
    createdAtColumn: "created_at",
    updatedAtColumn: "updated_at",
    archiveTable: "archive.ledger_tournament_locks",
    latestHashQuery: `SELECT source_row_hash FROM archive.ledger_tournament_locks
      WHERE source_id = $1::uuid ORDER BY archived_at DESC LIMIT 1`,
    selectColumns: "*",
    buildInsert: (row, sanitized, hash, runId) =>
      ins(
        "archive.ledger_tournament_locks",
        [
          "source_id",
          "source_row_hash",
          "source_created_at",
          "source_updated_at",
          "tournament_id",
          "entry_id",
          "amount",
          "status",
          "captured_at",
          "released_at",
          "source_row",
          "first_run_id",
        ],
        "(source_id, source_row_hash)",
        [
          row.id,
          hash,
          row.created_at,
          row.updated_at,
          row.tournament_id,
          row.entry_id,
          row.amount,
          row.status,
          row.captured_at,
          row.released_at,
          json(sanitized),
          runId,
        ]
      ),
  },
  {
    sourceKey: "public.tournament_payouts",
    tableKey: "public.tournament_payouts",
    idColumn: "id",
    createdAtColumn: "created_at",
    updatedAtColumn: "created_at",
    archiveTable: "archive.ledger_tournament_payouts",
    latestHashQuery: `SELECT source_row_hash FROM archive.ledger_tournament_payouts
      WHERE source_id = $1::uuid ORDER BY archived_at DESC LIMIT 1`,
    selectColumns: "*",
    buildInsert: (row, sanitized, hash, runId) =>
      ins(
        "archive.ledger_tournament_payouts",
        [
          "source_id",
          "source_row_hash",
          "source_created_at",
          "source_updated_at",
          "tournament_id",
          "user_id",
          "rank",
          "amount",
          "status",
          "paid_at",
          "source_row",
          "first_run_id",
        ],
        "(source_id, source_row_hash)",
        [
          row.id,
          hash,
          row.created_at,
          row.created_at,
          row.tournament_id,
          row.user_id,
          row.rank,
          row.amount,
          row.status,
          row.paid_at,
          json(sanitized),
          runId,
        ]
      ),
  },
  {
    sourceKey: "tic_tac_toe.matches",
    tableKey: "tic_tac_toe.matches",
    idColumn: "id",
    createdAtColumn: "created_at",
    updatedAtColumn: "created_at",
    archiveTable: "archive.ledger_tic_tac_toe_matches",
    latestHashQuery: `SELECT source_row_hash FROM archive.ledger_tic_tac_toe_matches
      WHERE source_id = $1::uuid ORDER BY archived_at DESC LIMIT 1`,
    selectColumns: "*",
    buildInsert: (row, sanitized, hash, runId) =>
      ins(
        "archive.ledger_tic_tac_toe_matches",
        [
          "source_id",
          "source_row_hash",
          "source_created_at",
          "source_updated_at",
          "user_id",
          "seed",
          "outcome",
          "paid_ding",
          "prize_snapshot",
          "player_moves",
          "source_row",
          "first_run_id",
        ],
        "(source_id, source_row_hash)",
        [
          row.id,
          hash,
          row.created_at,
          row.created_at,
          row.user_id,
          row.seed,
          row.outcome,
          row.paid_ding,
          row.prize_snapshot,
          row.player_moves,
          json(sanitized),
          runId,
        ]
      ),
  },
];

export async function copyAllLedgers(
  ctx: RunContext,
  prod: PoolClient,
  backup: PoolClient
): Promise<void> {
  for (const def of IMMUTABLE_SOURCES) {
    console.log("[Backup] ledger immutable", { source: def.sourceKey });
    await copyImmutableSource(ctx, prod, backup, def);
  }
  for (const def of VERSIONED_SOURCES) {
    console.log("[Backup] ledger versioned", { source: def.sourceKey });
    await copyVersionedSource(ctx, prod, backup, def);
  }
  await copyCommissionDailyStats(ctx, prod, backup);
  await copyTournamentPlayerDing(ctx, prod, backup);
  await copyKycSubmissions(ctx, prod, backup);
  await copyOperatorPlayDays(ctx, prod, backup);
}

async function copyOperatorPlayDays(
  ctx: RunContext,
  prod: PoolClient,
  backup: PoolClient
): Promise<void> {
  const sourceKey = "public.operator_player_play_days";
  const { rows } = await prod.query<Record<string, unknown>>(
    `SELECT * FROM public.operator_player_play_days WHERE first_seen_at <= $1`,
    [ctx.readAsOf]
  );
  bumpRead(ctx, sourceKey, rows.length);
  for (const row of rows) {
    const result = await backup.query(
      `INSERT INTO archive.audit_operator_play_days (
         stat_date, operator_id, player_id, operator_role, first_seen_at, source_row, first_run_id
       ) VALUES ($1,$2,$3,$4,$5,$6::jsonb,$7)
       ON CONFLICT (stat_date, operator_id, player_id) DO NOTHING`,
      [
        row.stat_date,
        row.operator_id,
        row.player_id,
        row.operator_role,
        row.first_seen_at,
        json(row),
        ctx.runId,
      ]
    );
    if ((result.rowCount ?? 0) > 0) bumpInserted(ctx, sourceKey, 1);
    else bumpSkipped(ctx, sourceKey, 1);
  }
}

async function copyCommissionDailyStats(
  ctx: RunContext,
  prod: PoolClient,
  backup: PoolClient
): Promise<void> {
  const sourceKey = "public.commission_daily_stats";
  const { rows } = await prod.query<Record<string, unknown>>(
    `SELECT * FROM public.commission_daily_stats WHERE updated_at <= $1`,
    [ctx.readAsOf]
  );
  bumpRead(ctx, sourceKey, rows.length);
  for (const row of rows) {
    const sanitized = row;
    const hash = sourceRowHash(sanitized as Record<string, unknown>);
    const result = await backup.query(
      `INSERT INTO archive.ledger_commission_daily_stats (
         user_id, stat_date, currency, source_kind, role, source_row_hash,
         earned_amount, commission_base, gross_amount, source_updated_at,
         source_row, first_run_id
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11::jsonb,$12)
       ON CONFLICT (user_id, stat_date, currency, source_kind, role, source_row_hash) DO NOTHING`,
      [
        row.user_id,
        row.stat_date,
        row.currency,
        row.source_kind,
        row.role,
        hash,
        row.earned_amount,
        row.commission_base,
        row.gross_amount,
        row.updated_at,
        json(sanitized as Record<string, unknown>),
        ctx.runId,
      ]
    );
    if ((result.rowCount ?? 0) > 0) bumpInserted(ctx, sourceKey, 1);
    else bumpSkipped(ctx, sourceKey, 1);
  }
}

async function copyTournamentPlayerDing(
  ctx: RunContext,
  prod: PoolClient,
  backup: PoolClient
): Promise<void> {
  const sourceKey = "public.tournament_player_ding_totals";
  const { rows } = await prod.query<Record<string, unknown>>(
    `SELECT * FROM public.tournament_player_ding_totals WHERE updated_at <= $1`,
    [ctx.readAsOf]
  );
  bumpRead(ctx, sourceKey, rows.length);
  for (const row of rows) {
    const sanitized = row;
    const hash = sourceRowHash(sanitized as Record<string, unknown>);
    const result = await backup.query(
      `INSERT INTO archive.ledger_tournament_player_ding (
         tournament_id, user_id, source_row_hash, ding_total, source_updated_at,
         source_row, first_run_id
       ) VALUES ($1,$2,$3,$4,$5,$6::jsonb,$7)
       ON CONFLICT (tournament_id, user_id, source_row_hash) DO NOTHING`,
      [
        row.tournament_id,
        row.user_id,
        hash,
        row.ding_total,
        row.updated_at,
        json(sanitized as Record<string, unknown>),
        ctx.runId,
      ]
    );
    if ((result.rowCount ?? 0) > 0) bumpInserted(ctx, sourceKey, 1);
    else bumpSkipped(ctx, sourceKey, 1);
  }
}

async function copyKycSubmissions(
  ctx: RunContext,
  prod: PoolClient,
  backup: PoolClient
): Promise<void> {
  const sourceKey = "public.kyc_submissions";
  const { rows } = await prod.query<Record<string, unknown>>(
    `SELECT id, user_id, kyc_code, declaration_text, image_mime_type, image_byte_size,
            quality_checks, status, client_request_id, rejection_reason, created_at, updated_at,
            reviewed_at, reviewed_by, rejection_reason_code, player_result_seen_at, image_purged_at
     FROM public.kyc_submissions WHERE updated_at <= $1`,
    [ctx.readAsOf]
  );
  bumpRead(ctx, sourceKey, rows.length);
  for (const row of rows) {
    const sanitized = sanitizeKycRow(row);
    const hash = sourceRowHash(sanitized);
    const { rows: latest } = await backup.query<{ source_row_hash: string }>(
      `SELECT source_row_hash FROM archive.audit_kyc_submissions
       WHERE source_id = $1 ORDER BY archived_at DESC LIMIT 1`,
      [row.id]
    );
    if (latest[0]?.source_row_hash === hash) {
      bumpSkipped(ctx, sourceKey, 1);
      continue;
    }
    const result = await backup.query(
      `INSERT INTO archive.audit_kyc_submissions (
         source_id, source_row_hash, source_created_at, source_updated_at, user_id, kyc_code,
         status, image_mime_type, image_byte_size, reviewed_by, rejection_reason,
         rejection_reason_code, source_row, first_run_id
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13::jsonb,$14)
       ON CONFLICT (source_id, source_row_hash) DO NOTHING`,
      [
        row.id,
        hash,
        row.created_at,
        row.updated_at,
        row.user_id,
        row.kyc_code,
        row.status,
        row.image_mime_type,
        row.image_byte_size,
        row.reviewed_by,
        row.rejection_reason,
        row.rejection_reason_code,
        json(sanitized),
        ctx.runId,
      ]
    );
    if ((result.rowCount ?? 0) > 0) bumpInserted(ctx, sourceKey, 1);
    else bumpSkipped(ctx, sourceKey, 1);
  }
}

export async function copyStateSnapshots(
  ctx: RunContext,
  prod: PoolClient,
  backup: PoolClient
): Promise<void> {
  const d = ctx.snapshotDate;
  const runId = ctx.runId;

  await copyFullSnapshot(ctx, prod, backup, {
    sourceKey: "state.users",
    tableKey: "public.users",
    selectSql: `SELECT id, username, email, role, status, parent_id, referral_code,
      admin_sub_role, kyc_verified, last_login_at, last_seen_at, created_at, updated_at
      FROM public.users`,
    insertSql: `INSERT INTO archive.state_users (
      snapshot_date, source_id, username, email, role, status, parent_id, referral_code,
      admin_sub_role, kyc_verified, last_login_at, last_seen_at, source_created_at,
      source_updated_at, source_row, first_run_id
    ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15::jsonb,$16)
    ON CONFLICT (snapshot_date, source_id) DO NOTHING`,
    mapRow: (row) => {
      const sanitized = row;
      return [
        d,
        row.id,
        row.username,
        row.email,
        row.role,
        row.status,
        row.parent_id,
        row.referral_code,
        row.admin_sub_role,
        row.kyc_verified,
        row.last_login_at,
        row.last_seen_at,
        row.created_at,
        row.updated_at,
        json(sanitized),
        runId,
      ];
    },
  });

  await copyFullSnapshot(ctx, prod, backup, {
    sourceKey: "state.user_profiles",
    tableKey: "public.user_profiles",
    selectSql: `SELECT * FROM public.user_profiles`,
    insertSql: `INSERT INTO archive.state_user_profiles (
      snapshot_date, source_id, nickname, full_name, phone, avatar_url, country, language,
      source_row, first_run_id
    ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,$10)
    ON CONFLICT (snapshot_date, source_id) DO NOTHING`,
    mapRow: (row) => [
      d,
      row.user_id,
      row.nickname,
      row.full_name,
      row.phone,
      row.avatar_url,
      row.country,
      row.language,
      json(row),
      runId,
    ],
  });

  await copyFullSnapshot(ctx, prod, backup, {
    sourceKey: "state.wallets",
    tableKey: "public.wallets",
    selectSql: `SELECT * FROM public.wallets`,
    insertSql: `INSERT INTO archive.state_wallets (
      snapshot_date, source_id, user_id, balance, locked_amount, currency, source_updated_at,
      source_row, first_run_id
    ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9)
    ON CONFLICT (snapshot_date, source_id) DO NOTHING`,
    mapRow: (row) => [
      d,
      row.id,
      row.user_id,
      row.balance,
      row.locked_amount,
      row.currency,
      row.updated_at,
      json(row),
      runId,
    ],
  });

  await copyFullSnapshot(ctx, prod, backup, {
    sourceKey: "state.ding_balances",
    tableKey: "public.ding_balances",
    selectSql: `SELECT * FROM public.ding_balances`,
    insertSql: `INSERT INTO archive.state_ding_balances (
      snapshot_date, source_id, balance, locked_amount, source_updated_at, source_row, first_run_id
    ) VALUES ($1,$2,$3,$4,$5,$6::jsonb,$7)
    ON CONFLICT (snapshot_date, source_id) DO NOTHING`,
    mapRow: (row) => [
      d,
      row.user_id,
      row.balance,
      row.locked_amount,
      row.updated_at,
      json(row),
      runId,
    ],
  });

  await copyFullSnapshot(ctx, prod, backup, {
    sourceKey: "state.player_affiliation",
    tableKey: "public.player_affiliation",
    selectSql: `SELECT * FROM public.player_affiliation`,
    insertSql: `INSERT INTO archive.state_player_affiliation (
      snapshot_date, source_id, agent_id, super_id, source_row, first_run_id
    ) VALUES ($1,$2,$3,$4,$5::jsonb,$6)
    ON CONFLICT (snapshot_date, source_id) DO NOTHING`,
    mapRow: (row) => [d, row.user_id, row.agent_id, row.super_id, json(row), runId],
  });

  await copyFullSnapshot(ctx, prod, backup, {
    sourceKey: "state.user_commissions",
    tableKey: "public.user_commissions",
    selectSql: `SELECT * FROM public.user_commissions`,
    insertSql: `INSERT INTO archive.state_user_commissions (
      snapshot_date, source_id, agent_commission, super_commission, source_row, first_run_id
    ) VALUES ($1,$2,$3,$4,$5::jsonb,$6)
    ON CONFLICT (snapshot_date, source_id) DO NOTHING`,
    mapRow: (row) => [
      d,
      row.user_id,
      row.agent_commission,
      row.super_commission,
      json(row),
      runId,
    ],
  });

  await copyFullSnapshot(ctx, prod, backup, {
    sourceKey: "state.room_templates",
    tableKey: "public.room_templates",
    selectSql: `SELECT id, price, commission_rate, line_reward_percentage, full_reward_percentage,
      ding_per_number, status, name, currency, min_players, max_players, room_type, created_at, updated_at
      FROM public.room_templates`,
    insertSql: `INSERT INTO archive.state_room_templates (
      snapshot_date, source_id, name, price, commission_rate, line_reward_percentage,
      full_reward_percentage, ding_per_number, status, source_row, first_run_id
    ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb,$11)
    ON CONFLICT (snapshot_date, source_id) DO NOTHING`,
    mapRow: (row) => [
      d,
      row.id,
      row.name,
      row.price,
      row.commission_rate,
      row.line_reward_percentage,
      row.full_reward_percentage,
      row.ding_per_number,
      row.status,
      json(row),
      runId,
    ],
  });
}

export { copyGameArchive } from "./gameArchive.js";
