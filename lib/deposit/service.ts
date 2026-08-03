/**
 * Deposit Domain service orchestration (P6.5).
 * Adapters produce evidence only; SQL enforces lifecycle + credit.
 */
import type { Pool, PoolClient } from "pg";
import {
  assertDepositIngressAllowed,
  isDepositDomainEnabled,
} from "@/lib/deposit/flag";
import {
  buildFakeEvidence,
  isAdapterError,
  type FakeIntentContext,
  type FakeObservation,
} from "@/lib/deposit/fakeAdapter";
import type { FakeScenario } from "@/lib/deposit/types";
import { createHash } from "crypto";

type Queryable = Pool | PoolClient;

async function q<T = any>(
  db: Queryable,
  sql: string,
  params: unknown[] = []
): Promise<T[]> {
  const { rows } = await db.query(sql, params);
  return rows as T[];
}

export async function createDepositIntent(
  db: Queryable,
  input: {
    userId: string;
    amount: number;
    currency?: string;
    expiresAt?: Date;
    destinationRef?: string;
    provider?: string;
    channel?: string;
    metadata?: Record<string, unknown>;
  }
): Promise<string> {
  const expires =
    input.expiresAt || new Date(Date.now() + 60 * 60 * 1000);
  const rows = await q<{ id: string }>(
    db,
    `SELECT deposit.fn_create_intent(
       $1::uuid, $2, $3, $4::numeric, $5, $6::timestamptz, $7, $8::jsonb,
       'test', NULL, NULL
     ) AS id`,
    [
      input.userId,
      input.channel || "fake",
      input.provider || "fake",
      input.amount,
      (input.currency || "IRR").toUpperCase(),
      expires.toISOString(),
      input.destinationRef || `fake-dest-${input.userId.slice(0, 8)}`,
      JSON.stringify(input.metadata || {}),
    ]
  );
  console.log("[DepositIntent] created", { intentId: rows[0].id });
  return rows[0].id;
}

export async function activateDepositIntent(
  db: Queryable,
  intentId: string,
  destinationRef?: string
): Promise<void> {
  await q(
    db,
    `SELECT deposit.fn_activate_intent($1::uuid, $2)`,
    [intentId, destinationRef ?? null]
  );
  console.log("[DepositIntent] activated", { intentId });
}

export async function getDepositIntentStatus(
  db: Queryable,
  intentId: string
): Promise<Record<string, unknown>> {
  const rows = await q<{ status: Record<string, unknown> }>(
    db,
    `SELECT deposit.fn_get_intent_status($1::uuid) AS status`,
    [intentId]
  );
  return rows[0].status;
}

export async function recordDepositAttempt(
  db: Queryable,
  input: {
    intentId: string;
    provider: string;
    externalEventId: string;
    payload: unknown;
    parseStatus: "accepted" | "malformed" | "unauthorized";
  }
): Promise<{ attempt_id: string; duplicate: boolean }> {
  const body = JSON.stringify(input.payload);
  const hash = createHash("sha256").update(body).digest("hex");
  const rows = await q<{ result: any }>(
    db,
    `SELECT deposit.fn_record_attempt(
       $1::uuid, $2, $3, $4, $5::deposit.attempt_parse_status, $6, $7::jsonb
     ) AS result`,
    [
      input.intentId,
      input.provider,
      input.externalEventId,
      hash,
      input.parseStatus,
      `inline:${hash.slice(0, 16)}`,
      JSON.stringify({ source: "fake" }),
    ]
  );
  const result = rows[0].result;
  console.log("[DepositAttempt] recorded", {
    intentId: input.intentId,
    duplicate: result.duplicate,
    attemptId: result.attempt_id,
  });
  return result;
}

/**
 * Run fake adapter → attempt → verify → (optional) credit.
 * Blocked unless DEPOSIT_DOMAIN_ENABLED or explicit test harness mode.
 */
export async function runFakeDepositFlow(
  db: Queryable,
  opts: {
    userId: string;
    amount: number;
    scenario: FakeScenario;
    paymentId?: string;
    eventId?: string;
    skipCredit?: boolean;
    expireIntentFirst?: boolean;
    testHarness?: boolean;
  }
): Promise<{
  intentId: string;
  status: string;
  attemptId?: string;
  verificationId?: string;
  credit?: unknown;
  error?: string;
}> {
  assertDepositIngressAllowed({ testHarness: opts.testHarness ?? true });

  const intentId = await createDepositIntent(db, {
    userId: opts.userId,
    amount: opts.amount,
    currency: "IRR",
    expiresAt: new Date(Date.now() + 3_600_000),
  });

  await activateDepositIntent(db, intentId);

  if (opts.expireIntentFirst) {
    await q(
      db,
      `UPDATE deposit.intents SET expires_at = now() - interval '1 minute' WHERE id = $1`,
      [intentId]
    );
  }

  const st0 = (await getDepositIntentStatus(db, intentId)) as any;
  const intentCtx: FakeIntentContext = {
    id: intentId,
    amount_expected: Number(st0.amount_expected),
    currency: String(st0.currency),
    destination_ref: st0.destination_ref ? String(st0.destination_ref) : null,
    expires_at: String(st0.expires_at),
    provider: String(st0.provider),
  };

  const observation: FakeObservation = {
    scenario: opts.scenario,
    paymentId: opts.paymentId,
    eventId: opts.eventId,
  };

  const evidenceOrErr = buildFakeEvidence(intentCtx, observation);

  if (isAdapterError(evidenceOrErr)) {
    if (evidenceOrErr.code === "unauthorized") {
      const att = await recordDepositAttempt(db, {
        intentId,
        provider: intentCtx.provider,
        externalEventId: opts.eventId || `forged_${Date.now()}`,
        payload: { forged: true },
        parseStatus: "unauthorized",
      });
      return {
        intentId,
        status: String((await getDepositIntentStatus(db, intentId)).status),
        attemptId: att.attempt_id,
        error: "forged_callback",
      };
    }

    if (evidenceOrErr.code === "temporary") {
      await recordDepositAttempt(db, {
        intentId,
        provider: intentCtx.provider,
        externalEventId: opts.eventId || `tmp_${Date.now()}`,
        payload: { temporary: true },
        parseStatus: "accepted",
      });
      await q(db, `SELECT deposit.fn_begin_verification($1::uuid)`, [intentId]);
      const fail = await q<{ result: any }>(
        db,
        `SELECT deposit.fn_fail_verification(
           $1::uuid, NULL, $2, 'temporary', '{}'::jsonb, false
         ) AS result`,
        [intentId, intentCtx.provider]
      );
      console.log("[DepositVerify] soft fail", fail[0].result);
      return {
        intentId,
        status: String((await getDepositIntentStatus(db, intentId)).status),
        error: "temporary_verification_error",
      };
    }

    return {
      intentId,
      status: String((await getDepositIntentStatus(db, intentId)).status),
      error: evidenceOrErr.message,
    };
  }

  const evidence = evidenceOrErr;
  const att = await recordDepositAttempt(db, {
    intentId,
    provider: evidence.provider,
    externalEventId: evidence.external_event_id || `evt_${Date.now()}`,
    payload: evidence,
    parseStatus: "accepted",
  });

  if (opts.scenario === "duplicate_callback") {
    const dup = await recordDepositAttempt(db, {
      intentId,
      provider: evidence.provider,
      externalEventId: evidence.external_event_id || att.attempt_id,
      payload: evidence,
      parseStatus: "accepted",
    });
    if (!dup.duplicate) {
      return {
        intentId,
        status: String((await getDepositIntentStatus(db, intentId)).status),
        attemptId: att.attempt_id,
        error: "expected_duplicate",
      };
    }
  }

  await q(db, `SELECT deposit.fn_begin_verification($1::uuid)`, [intentId]);

  try {
    const pass = await q<{ result: any }>(
      db,
      `SELECT deposit.fn_pass_verification(
         $1::uuid, $2::uuid, $3, $4, $5::numeric, $6, $7::jsonb, $8, $9
       ) AS result`,
      [
        intentId,
        att.attempt_id,
        evidence.provider,
        evidence.external_payment_id,
        evidence.amount_observed,
        evidence.currency_observed,
        JSON.stringify(evidence),
        evidence.confirmations ?? null,
        evidence.destination_observed ?? null,
      ]
    );
    const passResult = pass[0].result;
    console.log("[DepositVerify] result", passResult);

    if (passResult.result === "fail") {
      return {
        intentId,
        status: String((await getDepositIntentStatus(db, intentId)).status),
        attemptId: att.attempt_id,
        verificationId: passResult.verification_id,
        error: passResult.failure_code,
      };
    }

    if (opts.skipCredit) {
      return {
        intentId,
        status: String((await getDepositIntentStatus(db, intentId)).status),
        attemptId: att.attempt_id,
        verificationId: passResult.verification_id,
      };
    }

    const credit = await postDepositCredit(db, intentId);
    return {
      intentId,
      status: String((await getDepositIntentStatus(db, intentId)).status),
      attemptId: att.attempt_id,
      verificationId: passResult.verification_id,
      credit,
    };
  } catch (e: any) {
    console.error("[DepositVerify] fail", e.message);
    return {
      intentId,
      status: String((await getDepositIntentStatus(db, intentId)).status),
      attemptId: att.attempt_id,
      error: e.message,
    };
  }
}

export async function postDepositCredit(
  db: Queryable,
  intentId: string
): Promise<Record<string, unknown>> {
  const rows = await q<{ result: Record<string, unknown> }>(
    db,
    `SELECT deposit.fn_post_credit($1::uuid) AS result`,
    [intentId]
  );
  console.log("[DepositCredit] posted", {
    intentId,
    replayed: rows[0].result.replayed,
    ledgerTxId: rows[0].result.ledger_tx_id,
  });
  return rows[0].result;
}

export async function runDepositReconciliation(
  db: Queryable
): Promise<Record<string, unknown>> {
  const rows = await q<{ result: Record<string, unknown> }>(
    db,
    `SELECT deposit.fn_recon_deposit() AS result`
  );
  console.log("[DepositReconcile] done", rows[0].result);
  return rows[0].result;
}

export { isDepositDomainEnabled };
