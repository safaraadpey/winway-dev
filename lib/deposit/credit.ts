/**
 * CreditCommand executor — thin wrapper around deposit.fn_post_credit.
 * Wallet mutation only via fn_wallet_apply_delta inside that SQL TX.
 */
import type { Pool, PoolClient } from "pg";
import { postDepositCredit } from "@/lib/deposit/service";
import type { CreditCommand } from "@/lib/deposit/types";

type Queryable = Pool | PoolClient;

/**
 * Build CreditCommand from a confirmed intent (read-only helper).
 * Amount/currency always from intent — never from client/adapter alone.
 */
export async function buildCreditCommand(
  db: Queryable,
  intentId: string
): Promise<CreditCommand> {
  const { rows } = await db.query(
    `
    SELECT i.id, i.user_id, i.amount_expected, i.currency, i.status,
           v.id AS verification_id, v.external_payment_id, v.provider, i.channel
    FROM deposit.intents i
    JOIN deposit.verifications v
      ON v.intent_id = i.id AND v.result = 'pass'
    WHERE i.id = $1
    LIMIT 1
    `,
    [intentId]
  );
  const r = rows[0];
  if (!r) throw new Error("confirmed_verification_required");
  if (r.status !== "confirmed" && r.status !== "credited") {
    throw new Error(`intent_not_creditworthy:${r.status}`);
  }

  let key = `deposit:fiat:${r.provider}:${r.external_payment_id}`;
  if (r.channel === "fake") {
    key = `deposit:fake:${r.provider}:${r.external_payment_id}`;
  } else if (r.channel === "tron_usdt") {
    key = `deposit:tron:${r.external_payment_id}`;
  } else if (r.channel === "manual_adapter") {
    key = `deposit:manual:${intentId}`;
  }

  return {
    intent_id: intentId,
    user_id: r.user_id,
    amount: Number(r.amount_expected),
    currency: r.currency,
    idempotency_key: key,
    verification_id: r.verification_id,
    source_kind: "deposit_domain",
    source_ref: intentId,
    tx_type: "deposit",
  };
}

/** Execute credit in one DB transaction (SQL function). */
export async function executeCreditCommand(
  db: Queryable,
  intentId: string
): Promise<Record<string, unknown>> {
  return postDepositCredit(db, intentId);
}
