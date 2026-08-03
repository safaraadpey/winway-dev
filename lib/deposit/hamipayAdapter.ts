/**
 * Server-only HamiPay adapter.
 * Produces create/status results only — never credits wallet.
 */

import { createHash } from "crypto";
import type { VerificationEvidence } from "@/lib/deposit/types";

export type HamiPayCreateInput = {
  depositId: string;
  merchantOrderId: string;
  amountProviderUnits: number;
  currency: string;
  returnUrl: string;
  customer: {
    userId: string;
    username?: string | null;
    email?: string | null;
  };
};

export type HamiPayCreateResult = {
  providerPaymentId: string;
  paymentUrl: string;
  rawRedacted: Record<string, unknown>;
};

export type HamiPayStatusResult = {
  providerPaymentId: string;
  merchantOrderId: string;
  status: "paid" | "pending" | "failed" | "cancelled" | "unknown";
  amountProviderUnits: number;
  currency: string;
  rawRedacted: Record<string, unknown>;
};

function requireConfig(): { apiKey: string; baseUrl: string } {
  const apiKey = process.env.HAMIPAY_API_KEY || "";
  const baseUrl = (process.env.HAMIPAY_API_BASE_URL || "").replace(/\/$/, "");
  if (!apiKey || !baseUrl) {
    throw new Error("hamipay_config_missing");
  }
  if (apiKey.startsWith("NEXT_PUBLIC_")) {
    throw new Error("hamipay_api_key_must_not_be_public");
  }
  return { apiKey, baseUrl };
}

function isMockMode(): boolean {
  return process.env.HAMIPAY_MOCK === "true";
}

function redact(obj: Record<string, unknown>): Record<string, unknown> {
  const clone: Record<string, unknown> = { ...obj };
  for (const key of Object.keys(clone)) {
    const lower = key.toLowerCase();
    if (
      lower.includes("key") ||
      lower.includes("secret") ||
      lower.includes("token") ||
      lower.includes("authorization")
    ) {
      clone[key] = "[redacted]";
    }
  }
  return clone;
}

function fingerprint(payload: unknown): string {
  return createHash("sha256")
    .update(JSON.stringify(payload ?? {}))
    .digest("hex")
    .slice(0, 32);
}

function pickString(obj: Record<string, unknown>, keys: string[]): string | null {
  for (const k of keys) {
    const v = obj[k];
    if (typeof v === "string" && v.trim()) return v.trim();
    if (typeof v === "number" && Number.isFinite(v)) return String(v);
  }
  // nested data
  const data = obj.data;
  if (data && typeof data === "object") {
    return pickString(data as Record<string, unknown>, keys);
  }
  return null;
}

function pickNumber(obj: Record<string, unknown>, keys: string[]): number | null {
  for (const k of keys) {
    const v = obj[k];
    if (typeof v === "number" && Number.isFinite(v)) return v;
    if (typeof v === "string" && v.trim() && !Number.isNaN(Number(v))) {
      return Number(v);
    }
  }
  const data = obj.data;
  if (data && typeof data === "object") {
    return pickNumber(data as Record<string, unknown>, keys);
  }
  return null;
}

function mapStatus(raw: string | null): HamiPayStatusResult["status"] {
  const s = (raw || "").toLowerCase();
  if (["paid", "success", "successful", "completed", "verified"].includes(s)) {
    return "paid";
  }
  if (["pending", "processing", "created", "waiting", "in_progress"].includes(s)) {
    return "pending";
  }
  if (["cancelled", "canceled", "cancel"].includes(s)) {
    return "cancelled";
  }
  if (["failed", "fail", "rejected", "expired", "error"].includes(s)) {
    return "failed";
  }
  return "unknown";
}

/**
 * Convert wallet toman amount to provider units (rial by default).
 */
export function tomanToProviderAmount(toman: number): number {
  const unit = (process.env.HAMIPAY_AMOUNT_UNIT || "rial").toLowerCase();
  if (unit === "toman") return toman;
  return toman * 10; // rial
}

export function providerAmountToToman(providerAmount: number): number {
  const unit = (process.env.HAMIPAY_AMOUNT_UNIT || "rial").toLowerCase();
  if (unit === "toman") return Math.floor(providerAmount);
  return Math.floor(providerAmount / 10);
}

export async function hamipayCreatePayment(
  input: HamiPayCreateInput
): Promise<HamiPayCreateResult> {
  if (isMockMode()) {
    const providerPaymentId = `mock_pay_${input.depositId.replace(/-/g, "").slice(0, 16)}`;
    const origin =
      process.env.NEXT_PUBLIC_APP_ORIGIN ||
      process.env.NEXT_PUBLIC_ADMIN_ORIGIN ||
      "http://localhost:3000";
    const paymentUrl = `${origin.replace(/\/$/, "")}/payment/callback?depositId=${encodeURIComponent(input.depositId)}&mock=1`;
    console.log("[DepositAdapter:hamipay] mock create", {
      depositId: input.depositId,
      providerPaymentId,
    });
    return {
      providerPaymentId,
      paymentUrl,
      rawRedacted: { mock: true, providerPaymentId },
    };
  }

  const { apiKey, baseUrl } = requireConfig();
  const path = process.env.HAMIPAY_CREATE_PATH || "/v1/payments";
  const url = `${baseUrl}${path.startsWith("/") ? path : `/${path}`}`;

  const body = {
    amount: input.amountProviderUnits,
    currency: input.currency,
    merchantOrderId: input.merchantOrderId,
    returnUrl: input.returnUrl,
    customer: {
      id: input.customer.userId,
      username: input.customer.username || undefined,
      email: input.customer.email || undefined,
    },
    description: "DingMoney wallet deposit",
  };

  console.log("[DepositAdapter:hamipay] create started", {
    depositId: input.depositId,
    merchantOrderId: input.merchantOrderId,
    amountProviderUnits: input.amountProviderUnits,
  });

  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Api-Key": apiKey,
      "Idempotency-Key": input.depositId,
    },
    body: JSON.stringify(body),
  });

  const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  const redacted = redact(json);

  if (!res.ok) {
    console.error("[DepositAdapter:hamipay] create failed", {
      status: res.status,
      body: redacted,
    });
    throw new Error(`hamipay_create_failed:${res.status}`);
  }

  const providerPaymentId = pickString(json, [
    "providerPaymentId",
    "paymentId",
    "payment_id",
    "id",
  ]);
  const paymentUrl = pickString(json, [
    "paymentUrl",
    "payment_url",
    "redirectUrl",
    "redirect_url",
    "url",
  ]);

  if (!providerPaymentId || !paymentUrl) {
    console.error("[DepositAdapter:hamipay] create missing fields", redacted);
    throw new Error("hamipay_create_invalid_response");
  }

  console.log("[DepositAdapter:hamipay] create ok", {
    depositId: input.depositId,
    providerPaymentId,
  });

  return { providerPaymentId, paymentUrl, rawRedacted: redacted };
}

export async function hamipayGetPaymentStatus(opts: {
  providerPaymentId: string;
  merchantOrderId: string;
}): Promise<HamiPayStatusResult> {
  if (isMockMode()) {
    const forced = (process.env.HAMIPAY_MOCK_STATUS || "paid").toLowerCase();
    const status = mapStatus(forced);
    const amount = Number(process.env.HAMIPAY_MOCK_AMOUNT || 0);
    console.log("[DepositAdapter:hamipay] mock status", {
      providerPaymentId: opts.providerPaymentId,
      status,
    });
    return {
      providerPaymentId: opts.providerPaymentId,
      merchantOrderId: opts.merchantOrderId,
      status,
      amountProviderUnits: amount,
      currency: "IRR",
      rawRedacted: { mock: true, status },
    };
  }

  const { apiKey, baseUrl } = requireConfig();
  const pathTemplate =
    process.env.HAMIPAY_STATUS_PATH || "/v1/payments/{paymentId}";
  const path = pathTemplate.replace(
    "{paymentId}",
    encodeURIComponent(opts.providerPaymentId)
  );
  const url = `${baseUrl}${path.startsWith("/") ? path : `/${path}`}`;

  console.log("[DepositAdapter:hamipay] status started", {
    providerPaymentId: opts.providerPaymentId,
  });

  const res = await fetch(url, {
    method: "GET",
    headers: {
      "X-Api-Key": apiKey,
      Accept: "application/json",
    },
  });

  const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  const redacted = redact(json);

  if (!res.ok) {
    console.error("[DepositAdapter:hamipay] status failed", {
      status: res.status,
      body: redacted,
    });
    throw new Error(`hamipay_status_failed:${res.status}`);
  }

  const providerPaymentId =
    pickString(json, ["providerPaymentId", "paymentId", "payment_id", "id"]) ||
    opts.providerPaymentId;
  const merchantOrderId =
    pickString(json, ["merchantOrderId", "merchant_order_id", "orderId"]) ||
    opts.merchantOrderId;
  const amountProviderUnits = pickNumber(json, [
    "amount",
    "amount_paid",
    "paidAmount",
    "orderAmount",
  ]);
  const currency =
    pickString(json, ["currency", "currency_code"]) || "IRR";
  const status = mapStatus(
    pickString(json, ["status", "paymentStatus", "payment_status", "state"])
  );

  if (amountProviderUnits == null) {
    throw new Error("hamipay_status_missing_amount");
  }

  return {
    providerPaymentId,
    merchantOrderId,
    status,
    amountProviderUnits,
    currency: currency.toUpperCase(),
    rawRedacted: redacted,
  };
}

export function buildHamiPayEvidence(opts: {
  status: HamiPayStatusResult;
  amountObservedToman: number;
  currency: string;
}): VerificationEvidence {
  return {
    provider: "hamipay",
    external_payment_id: opts.status.providerPaymentId,
    external_event_id: `hamipay_status_${opts.status.providerPaymentId}`,
    amount_observed: opts.amountObservedToman,
    currency_observed: opts.currency,
    observed_at: new Date().toISOString(),
    provider_status: opts.status.status,
    raw_fingerprint: fingerprint(opts.status.rawRedacted),
    extras: {
      merchant_order_id: opts.status.merchantOrderId,
      provider_amount_units: opts.status.amountProviderUnits,
    },
  };
}
