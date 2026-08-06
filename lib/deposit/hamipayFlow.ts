/**
 * HamiPay deposit orchestration.
 * Adapters produce evidence; SQL (fn_pass_verification / fn_post_credit) is SoR.
 */
import { createHash } from "crypto";
import type { Pool, PoolClient } from "pg";
import { assertDepositIngressAllowed } from "@/lib/deposit/flag";
import {
  buildHamiPayEvidence,
  hamipayCreatePayment,
  hamipayGetPaymentStatus,
  providerAmountToToman,
  tomanToProviderAmount,
} from "@/lib/deposit/hamipayAdapter";
import {
  resolveDepositEnvironment,
  resolvePaymentReturnUrl,
  type DepositEnvironment,
} from "@/lib/deposit/limits";
import { activateDepositIntent, postDepositCredit } from "@/lib/deposit/service";

type Queryable = Pool | PoolClient;

export type DepositIntentRow = {
  id: string;
  user_id: string;
  amount_expected: string | number;
  currency: string;
  status: string;
  provider: string;
  channel: string;
  provider_intent_ref: string | null;
  payment_url: string | null;
  merchant_order_id: string | null;
  environment: string | null;
  metadata: Record<string, unknown> | null;
  expires_at: string;
};

async function q<T = any>(
  db: Queryable,
  sql: string,
  params: unknown[] = []
): Promise<T[]> {
  const { rows } = await db.query(sql, params);
  return rows as T[];
}

export async function loadDepositIntent(
  db: Queryable,
  intentId: string
): Promise<DepositIntentRow | null> {
  const rows = await q<DepositIntentRow>(
    db,
    `SELECT id, user_id, amount_expected, currency, status, provider, channel,
            provider_intent_ref, payment_url, merchant_order_id, environment,
            metadata, expires_at
     FROM deposit.intents
     WHERE id = $1
     LIMIT 1`,
    [intentId]
  );
  return rows[0] || null;
}

/** Resolve deposit after clean returnUrl (no depositId query) via merchantOrderId. */
export async function loadDepositIntentByMerchantOrderId(
  db: Queryable,
  merchantOrderId: string
): Promise<DepositIntentRow | null> {
  const rows = await q<DepositIntentRow>(
    db,
    `SELECT id, user_id, amount_expected, currency, status, provider, channel,
            provider_intent_ref, payment_url, merchant_order_id, environment,
            metadata, expires_at
     FROM deposit.intents
     WHERE merchant_order_id = $1
     LIMIT 1`,
    [merchantOrderId]
  );
  return rows[0] || null;
}

/**
 * Latest non-terminal HamiPay intent for the authenticated user.
 * Used when HamiPay returns to /payment/callback without depositId.
 */
export async function findLatestPendingHamiPayDeposit(
  db: Queryable,
  userId: string
): Promise<DepositIntentRow | null> {
  const rows = await q<DepositIntentRow>(
    db,
    `SELECT id, user_id, amount_expected, currency, status, provider, channel,
            provider_intent_ref, payment_url, merchant_order_id, environment,
            metadata, expires_at
     FROM deposit.intents
     WHERE user_id = $1
       AND provider = 'hamipay'
       AND status IN ('pending', 'created', 'observed', 'verifying', 'confirmed')
     ORDER BY created_at DESC
     LIMIT 1`,
    [userId]
  );
  return rows[0] || null;
}

export async function createHamiPayDepositIntent(
  db: Queryable,
  input: {
    userId: string;
    amountToman: number;
    customerName?: string | null;
    customerPhone?: string | null;
    username?: string | null;
    email?: string | null;
  }
): Promise<{ depositId: string; paymentUrl: string }> {
  assertDepositIngressAllowed();

  const environment = resolveDepositEnvironment();
  const expires = new Date(Date.now() + 60 * 60 * 1000);

  console.log("[DepositIntent] HamiPay create started", {
    userId: input.userId,
    amountToman: input.amountToman,
    hasCustomerName: Boolean(input.customerName),
    hasCustomerPhone: Boolean(input.customerPhone),
    environment,
  });

  const created = await q<{ id: string }>(
    db,
    `SELECT deposit.fn_create_intent(
       $1::uuid, 'fiat_gateway', 'hamipay', $2::numeric, 'IRR',
       $3::timestamptz, NULL, $4::jsonb, 'user', $1::uuid, NULL
     ) AS id`,
    [
      input.userId,
      input.amountToman,
      expires.toISOString(),
      JSON.stringify({
        source: "buy_rial",
        environment,
      }),
    ]
  );

  const depositId = created[0]!.id;
  const merchantOrderId = depositId;

  await q(
    db,
    `UPDATE deposit.intents
     SET environment = $2,
         merchant_order_id = $3,
         metadata = coalesce(metadata, '{}'::jsonb) || $4::jsonb
     WHERE id = $1`,
    [
      depositId,
      environment,
      merchantOrderId,
      JSON.stringify({ merchant_order_id: merchantOrderId, environment }),
    ]
  );

  try {
    const amountProviderUnits = tomanToProviderAmount(input.amountToman);
    console.log("[DepositIntent] HamiPay amount scale", {
      depositId,
      amountToman: input.amountToman,
      amountProviderUnits,
      expectedRialIfUnitRial: input.amountToman * 10,
    });

    const createdPay = await hamipayCreatePayment({
      depositId,
      merchantOrderId,
      amountProviderUnits,
      currency: "IRR",
      returnUrl: resolvePaymentReturnUrl(depositId),
      customer: {
        userId: input.userId,
        displayName: input.customerName,
        phone: input.customerPhone,
        username: input.username,
        email: input.email,
      },
    });

    await q(
      db,
      `UPDATE deposit.intents
       SET provider_intent_ref = $2,
           payment_url = $3,
           metadata = coalesce(metadata, '{}'::jsonb) || $4::jsonb
       WHERE id = $1 AND status = 'created'`,
      [
        depositId,
        createdPay.providerPaymentId,
        createdPay.paymentUrl,
        JSON.stringify({
          hamipay_create: createdPay.rawRedacted,
        }),
      ]
    );

    await activateDepositIntent(db, depositId, createdPay.providerPaymentId);

    console.log("[DepositIntent] HamiPay pending", {
      depositId,
      providerPaymentId: createdPay.providerPaymentId,
      source: "postgresql",
    });

    return { depositId, paymentUrl: createdPay.paymentUrl };
  } catch (err) {
    const message = err instanceof Error ? err.message : "failed_to_create";
    console.error("[DepositIntent] HamiPay create failed", {
      depositId,
      error: message,
    });
    await q(
      db,
      `SELECT deposit.fn_mark_create_failed($1::uuid, $2)`,
      [depositId, message]
    );
    throw err;
  }
}

/**
 * Idempotent resume: if pending intent already has payment_url, return it
 * without creating a new provider payment.
 */
export async function resumeHamiPayPaymentUrl(
  db: Queryable,
  opts: { userId: string; depositId: string }
): Promise<{ depositId: string; paymentUrl: string } | null> {
  const intent = await loadDepositIntent(db, opts.depositId);
  if (!intent) return null;
  if (intent.user_id !== opts.userId) return null;
  if (intent.provider !== "hamipay") return null;
  if (!intent.payment_url) return null;
  if (!["pending", "created"].includes(intent.status)) return null;
  return { depositId: intent.id, paymentUrl: intent.payment_url };
}

export type VerifyDepositResult = {
  depositId: string;
  status: string;
  ui:
    | "credited"
    | "pending"
    | "failed"
    | "cancelled"
    | "verification_error";
  message: string;
  credited?: boolean;
  replayed?: boolean;
};

function uiForStatus(status: string): VerifyDepositResult["ui"] {
  if (status === "credited") return "credited";
  if (status === "rejected" || status === "failed" || status === "expired") {
    return "failed";
  }
  if (
    status === "pending" ||
    status === "observed" ||
    status === "verifying" ||
    status === "confirmed"
  ) {
    return "pending";
  }
  return "verification_error";
}

function messageForUi(ui: VerifyDepositResult["ui"]): string {
  switch (ui) {
    case "credited":
      return "پرداخت با موفقیت انجام شد و کیف پول شما شارژ شد.";
    case "pending":
      return "پرداخت ثبت شده اما تأیید نهایی هنوز انجام نشده است.";
    case "failed":
    case "cancelled":
      return "پرداخت انجام نشد یا لغو شد.";
    default:
      return "خطا در بررسی نتیجه پرداخت. می‌توانید دوباره تلاش کنید.";
  }
}

export async function verifyAndCreditHamiPayDeposit(
  db: Queryable,
  opts: {
    userId: string;
    depositId: string;
    /** Cron / recon may skip user ownership when using service context */
    skipOwnershipCheck?: boolean;
  }
): Promise<VerifyDepositResult> {
  assertDepositIngressAllowed();

  const intent = await loadDepositIntent(db, opts.depositId);
  if (!intent) {
    return {
      depositId: opts.depositId,
      status: "missing",
      ui: "verification_error",
      message: "درخواست پرداخت یافت نشد.",
    };
  }

  if (!opts.skipOwnershipCheck && intent.user_id !== opts.userId) {
    return {
      depositId: intent.id,
      status: intent.status,
      ui: "verification_error",
      message: "دسترسی به این پرداخت مجاز نیست.",
    };
  }

  if (intent.provider !== "hamipay" || intent.channel !== "fiat_gateway") {
    return {
      depositId: intent.id,
      status: intent.status,
      ui: "verification_error",
      message: "درگاه پرداخت نامعتبر است.",
    };
  }

  const expectedEnv = resolveDepositEnvironment();
  if (intent.environment && intent.environment !== expectedEnv) {
    console.error("[DepositVerify] environment mismatch", {
      depositId: intent.id,
      intentEnv: intent.environment,
      expectedEnv,
    });
    return {
      depositId: intent.id,
      status: intent.status,
      ui: "verification_error",
      message: "محیط پرداخت با سرور هم‌خوانی ندارد.",
    };
  }

  if (intent.status === "credited") {
    return {
      depositId: intent.id,
      status: "credited",
      ui: "credited",
      message: messageForUi("credited"),
      credited: true,
      replayed: true,
    };
  }

  if (["rejected", "failed", "expired", "reversed"].includes(intent.status)) {
    const ui = intent.status === "failed" ? "failed" : uiForStatus(intent.status);
    return {
      depositId: intent.id,
      status: intent.status,
      ui: ui === "pending" ? "failed" : ui,
      message: messageForUi(ui === "pending" ? "failed" : ui),
    };
  }

  if (!intent.provider_intent_ref) {
    return {
      depositId: intent.id,
      status: intent.status,
      ui: "verification_error",
      message: messageForUi("verification_error"),
    };
  }

  const merchantOrderId = intent.merchant_order_id || intent.id;

  let providerStatus;
  try {
    providerStatus = await hamipayGetPaymentStatus({
      providerPaymentId: intent.provider_intent_ref,
      merchantOrderId,
    });
  } catch (err) {
    console.error("[DepositVerify] provider status error", err);
    return {
      depositId: intent.id,
      status: intent.status,
      ui: "verification_error",
      message: messageForUi("verification_error"),
    };
  }

  // Bindings — never trust browser query params
  if (providerStatus.providerPaymentId !== intent.provider_intent_ref) {
    console.error("[DepositVerify] provider payment id mismatch", {
      depositId: intent.id,
    });
    return {
      depositId: intent.id,
      status: intent.status,
      ui: "verification_error",
      message: messageForUi("verification_error"),
    };
  }

  if (providerStatus.merchantOrderId !== merchantOrderId) {
    console.error("[DepositVerify] merchant order mismatch", {
      depositId: intent.id,
      expected: merchantOrderId,
      got: providerStatus.merchantOrderId,
    });
    return {
      depositId: intent.id,
      status: intent.status,
      ui: "verification_error",
      message: messageForUi("verification_error"),
    };
  }

  const amountObservedToman = providerAmountToToman(
    providerStatus.amountProviderUnits
  );
  // In mock mode without amount, fall back to expected so local tests can credit
  const observedToman =
    amountObservedToman > 0
      ? amountObservedToman
      : process.env.HAMIPAY_MOCK === "true"
        ? Number(intent.amount_expected)
        : amountObservedToman;

  if (providerStatus.status === "pending" || providerStatus.status === "unknown") {
    return {
      depositId: intent.id,
      status: intent.status,
      ui: "pending",
      message: messageForUi("pending"),
    };
  }

  if (
    providerStatus.status === "failed" ||
    providerStatus.status === "cancelled"
  ) {
    try {
      await recordAttemptAndFail(db, {
        intent,
        providerStatus,
        failureCode:
          providerStatus.status === "cancelled" ? "cancelled" : "provider_failed",
        terminal: true,
      });
    } catch (err) {
      console.error("[DepositVerify] fail path error", err);
    }
    const ui =
      providerStatus.status === "cancelled" ? "cancelled" : "failed";
    return {
      depositId: intent.id,
      status: "rejected",
      ui,
      message: messageForUi(ui),
    };
  }

  // paid
  if (observedToman !== Number(intent.amount_expected)) {
    console.error("[DepositVerify] amount mismatch", {
      depositId: intent.id,
      expected: Number(intent.amount_expected),
      observedToman,
      providerUnits: providerStatus.amountProviderUnits,
    });
    try {
      await recordAttemptAndFail(db, {
        intent,
        providerStatus,
        failureCode: "amount_mismatch",
        terminal: true,
        amountObservedToman: observedToman,
      });
    } catch (err) {
      console.error("[DepositVerify] amount mismatch fail path", err);
    }
    return {
      depositId: intent.id,
      status: "rejected",
      ui: "failed",
      message: messageForUi("failed"),
    };
  }

  try {
    const evidence = buildHamiPayEvidence({
      status: providerStatus,
      amountObservedToman: observedToman,
      currency: String(intent.currency || "IRR").toUpperCase(),
    });

    const body = JSON.stringify(evidence);
    const hash = createHash("sha256").update(body).digest("hex");

    const attemptRows = await q<{ result: any }>(
      db,
      `SELECT deposit.fn_record_attempt(
         $1::uuid, 'hamipay', $2, $3, 'accepted'::deposit.attempt_parse_status,
         $4, $5::jsonb
       ) AS result`,
      [
        intent.id,
        evidence.external_event_id || `hamipay_${intent.provider_intent_ref}`,
        hash,
        `inline:${hash.slice(0, 16)}`,
        JSON.stringify({ source: "hamipay_poll", redacted: providerStatus.rawRedacted }),
      ]
    );
    const attemptId = attemptRows[0]!.result.attempt_id as string;

    // Move to verifying from pending/observed
    const st = intent.status;
    if (st === "pending" || st === "observed" || st === "verifying") {
      if (st !== "verifying") {
        await q(db, `SELECT deposit.fn_begin_verification($1::uuid)`, [
          intent.id,
        ]);
      }
    } else if (st === "confirmed") {
      const credit = await postDepositCredit(db, intent.id);
      return {
        depositId: intent.id,
        status: "credited",
        ui: "credited",
        message: messageForUi("credited"),
        credited: true,
        replayed: Boolean(credit.replayed),
      };
    }

    const pass = await q<{ result: any }>(
      db,
      `SELECT deposit.fn_pass_verification(
         $1::uuid, $2::uuid, 'hamipay', $3, $4::numeric, $5, $6::jsonb, NULL, NULL
       ) AS result`,
      [
        intent.id,
        attemptId,
        evidence.external_payment_id,
        evidence.amount_observed,
        evidence.currency_observed,
        JSON.stringify({
          ...evidence,
          raw_redacted: providerStatus.rawRedacted,
        }),
      ]
    );

    const passResult = pass[0]!.result;
    if (passResult.result === "fail") {
      return {
        depositId: intent.id,
        status: "rejected",
        ui: "failed",
        message: messageForUi("failed"),
      };
    }

    const credit = await postDepositCredit(db, intent.id);
    console.log("[DepositCredit] HamiPay credited", {
      depositId: intent.id,
      replayed: credit.replayed,
      ledgerTxId: credit.ledger_tx_id,
      source: "postgresql",
    });

    return {
      depositId: intent.id,
      status: "credited",
      ui: "credited",
      message: messageForUi("credited"),
      credited: true,
      replayed: Boolean(credit.replayed),
    };
  } catch (err) {
    console.error("[DepositVerify] verify/credit error", err);
    return {
      depositId: intent.id,
      status: intent.status,
      ui: "verification_error",
      message: messageForUi("verification_error"),
    };
  }
}

async function recordAttemptAndFail(
  db: Queryable,
  opts: {
    intent: DepositIntentRow;
    providerStatus: Awaited<ReturnType<typeof hamipayGetPaymentStatus>>;
    failureCode: string;
    terminal: boolean;
    amountObservedToman?: number;
  }
): Promise<void> {
  const observed =
    opts.amountObservedToman ??
    providerAmountToToman(opts.providerStatus.amountProviderUnits);
  const payload = {
    failure: opts.failureCode,
    redacted: opts.providerStatus.rawRedacted,
  };
  const hash = createHash("sha256")
    .update(JSON.stringify(payload))
    .digest("hex");

  const attemptRows = await q<{ result: any }>(
    db,
    `SELECT deposit.fn_record_attempt(
       $1::uuid, 'hamipay', $2, $3, 'accepted'::deposit.attempt_parse_status,
       $4, $5::jsonb
     ) AS result`,
    [
      opts.intent.id,
      `hamipay_fail_${opts.providerStatus.providerPaymentId}_${opts.failureCode}`,
      hash,
      `inline:${hash.slice(0, 16)}`,
      JSON.stringify(payload),
    ]
  );

  if (opts.intent.status === "pending" || opts.intent.status === "observed") {
    await q(db, `SELECT deposit.fn_begin_verification($1::uuid)`, [
      opts.intent.id,
    ]);
  }

  if (opts.intent.status === "verifying" || opts.intent.status === "pending" || opts.intent.status === "observed") {
    await q(
      db,
      `SELECT deposit.fn_fail_verification(
         $1::uuid, $2::uuid, 'hamipay', $3, $4::jsonb, $5::boolean
       )`,
      [
        opts.intent.id,
        attemptRows[0]!.result.attempt_id,
        opts.failureCode,
        JSON.stringify({
          amount_observed: observed,
          provider_status: opts.providerStatus.status,
        }),
        opts.terminal,
      ]
    );
  }
}

/**
 * Reconcile pending HamiPay deposits by re-querying provider and crediting.
 */
export async function reconcilePendingHamiPayDeposits(
  db: Queryable,
  opts?: { limit?: number; environment?: DepositEnvironment }
): Promise<{
  scanned: number;
  credited: number;
  pending: number;
  failed: number;
  errors: number;
}> {
  assertDepositIngressAllowed();
  const environment = opts?.environment || resolveDepositEnvironment();
  const limit = opts?.limit ?? 50;

  const rows = await q<DepositIntentRow>(
    db,
    `SELECT id, user_id, amount_expected, currency, status, provider, channel,
            provider_intent_ref, payment_url, merchant_order_id, environment,
            metadata, expires_at
     FROM deposit.intents
     WHERE provider = 'hamipay'
       AND channel = 'fiat_gateway'
       AND status IN ('pending', 'observed', 'verifying', 'confirmed')
       AND (environment IS NULL OR environment = $1)
       AND provider_intent_ref IS NOT NULL
     ORDER BY created_at ASC
     LIMIT $2`,
    [environment, limit]
  );

  console.log("[DepositReconcile] HamiPay scan", {
    scanned: rows.length,
    environment,
  });

  let credited = 0;
  let pending = 0;
  let failed = 0;
  let errors = 0;

  for (const row of rows) {
    try {
      const result = await verifyAndCreditHamiPayDeposit(db, {
        userId: row.user_id,
        depositId: row.id,
        skipOwnershipCheck: true,
      });
      if (result.ui === "credited") credited += 1;
      else if (result.ui === "pending") pending += 1;
      else if (result.ui === "failed" || result.ui === "cancelled") failed += 1;
      else errors += 1;
    } catch (err) {
      errors += 1;
      console.error("[DepositReconcile] item failed", {
        depositId: row.id,
        err,
      });
    }
  }

  // Also run structural deposit recon report
  await q(db, `SELECT deposit.fn_recon_deposit()`);

  return {
    scanned: rows.length,
    credited,
    pending,
    failed,
    errors,
  };
}
