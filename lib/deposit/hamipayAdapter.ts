/**
 * Server-only HamiPay adapter.
 * Produces create/status results only — never credits wallet.
 *
 * Outbound create-payment body must match the known-working Postman contract:
 * {
 *   customerName, customerPhone, amount, merchantOrderId, description, returnUrl
 * }
 * Headers: Content-Type, X-Api-Key, Idempotency-Key (header only, never in body)
 */

import { createHash } from "crypto";
import type { VerificationEvidence } from "@/lib/deposit/types";
import { parseEnvFlag } from "@/lib/deposit/env";

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
    phone?: string | null;
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

const DEFAULT_DESCRIPTION = "شارژ کیف پول DingMoney";

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
  return parseEnvFlag(process.env.HAMIPAY_MOCK);
}

function redact(obj: Record<string, unknown>): Record<string, unknown> {
  const clone: Record<string, unknown> = { ...obj };
  for (const key of Object.keys(clone)) {
    const lower = key.toLowerCase();
    if (
      lower.includes("key") ||
      lower.includes("secret") ||
      lower.includes("token") ||
      lower.includes("authorization") ||
      lower.includes("phone")
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
 * Convert wallet toman amount to provider units.
 * Default: toman (matches working Postman amount scale).
 * Set HAMIPAY_AMOUNT_UNIT=rial to send toman*10.
 */
export function tomanToProviderAmount(toman: number): number {
  const unit = (process.env.HAMIPAY_AMOUNT_UNIT || "toman").toLowerCase();
  if (unit === "rial") return toman * 10;
  return toman;
}

export function providerAmountToToman(providerAmount: number): number {
  const unit = (process.env.HAMIPAY_AMOUNT_UNIT || "toman").toLowerCase();
  if (unit === "rial") return Math.floor(providerAmount / 10);
  return Math.floor(providerAmount);
}

function resolveCustomerName(customer: HamiPayCreateInput["customer"]): string {
  const name =
    (customer.username && customer.username.trim()) ||
    (customer.email && customer.email.split("@")[0]) ||
    "DingMoney User";
  return name.slice(0, 120);
}

function resolveCustomerPhone(customer: HamiPayCreateInput["customer"]): string {
  const fromInput = (customer.phone || "").replace(/\D/g, "");
  if (fromInput.length >= 10) return fromInput.slice(0, 15);
  const fromEnv = (process.env.HAMIPAY_DEFAULT_CUSTOMER_PHONE || "").replace(
    /\D/g,
    ""
  );
  if (fromEnv.length >= 10) return fromEnv.slice(0, 15);
  // HamiPay Postman contract requires customerPhone; use a stable non-secret placeholder
  return "09000000000";
}

export async function hamipayCreatePayment(
  input: HamiPayCreateInput
): Promise<HamiPayCreateResult> {
  if (isMockMode()) {
    const providerPaymentId = `mock_pay_${input.depositId.replace(/-/g, "").slice(0, 16)}`;
    const origin =
      process.env.HAMIPAY_RETURN_BASE_URL ||
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
  // If base already ends with /api/v1 (Vercel config), default path is /payments
  // — not /v1/payments (that produced .../api/v1/v1/payments → wrong).
  const path =
    process.env.HAMIPAY_CREATE_PATH ||
    (baseUrl.endsWith("/v1") || baseUrl.endsWith("/api/v1")
      ? "/payments"
      : "/v1/payments");
  const url = `${baseUrl}${path.startsWith("/") ? path : `/${path}`}`;

  const description = (
    process.env.HAMIPAY_PAYMENT_DESCRIPTION || DEFAULT_DESCRIPTION
  ).trim();
  if (!description) {
    throw new Error("hamipay_description_empty");
  }

  // Exact Postman contract field names (flat body — no nested customer object)
  const body = {
    customerName: resolveCustomerName(input.customer),
    customerPhone: resolveCustomerPhone(input.customer),
    amount: input.amountProviderUnits,
    merchantOrderId: input.merchantOrderId,
    description,
    returnUrl: input.returnUrl,
  };

  const headerNames = ["Content-Type", "X-Api-Key", "Idempotency-Key"];
  console.log("[DepositAdapter:hamipay] outbound create diagnostic", {
    url,
    headerNames,
    hasApiKey: Boolean(apiKey),
    hasIdempotencyKey: Boolean(input.depositId),
    idempotencyKeyEqualsDepositId: input.depositId === input.merchantOrderId,
    bodyFieldNames: Object.keys(body),
    amount: body.amount,
    amountUnit: (process.env.HAMIPAY_AMOUNT_UNIT || "toman").toLowerCase(),
    merchantOrderId: body.merchantOrderId,
    descriptionLength: body.description.length,
    returnUrl: body.returnUrl,
    hasCustomerName: Boolean(body.customerName),
    hasCustomerPhone: Boolean(body.customerPhone),
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

  const rawText = await res.text();
  let json: Record<string, unknown> = {};
  try {
    json = rawText ? (JSON.parse(rawText) as Record<string, unknown>) : {};
  } catch {
    json = { nonJsonBody: rawText.slice(0, 500) };
  }
  const redacted = redact(json);

  if (!res.ok) {
    console.error("[DepositAdapter:hamipay] create failed — provider response", {
      status: res.status,
      statusText: res.statusText,
      body: redacted,
      rawBodyPreview: rawText.slice(0, 800),
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
    console.error("[DepositAdapter:hamipay] create missing fields", {
      status: res.status,
      body: redacted,
      hasProviderPaymentId: Boolean(providerPaymentId),
      hasPaymentUrl: Boolean(paymentUrl),
    });
    throw new Error("hamipay_create_invalid_response");
  }

  console.log("[DepositAdapter:hamipay] create ok", {
    depositId: input.depositId,
    providerPaymentId,
    hasPaymentUrl: true,
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
    process.env.HAMIPAY_STATUS_PATH ||
    (baseUrl.endsWith("/v1") || baseUrl.endsWith("/api/v1")
      ? "/payments/{paymentId}"
      : "/v1/payments/{paymentId}");
  const path = pathTemplate.replace(
    "{paymentId}",
    encodeURIComponent(opts.providerPaymentId)
  );
  const url = `${baseUrl}${path.startsWith("/") ? path : `/${path}`}`;

  console.log("[DepositAdapter:hamipay] status started", {
    providerPaymentId: opts.providerPaymentId,
    url,
    headerNames: ["X-Api-Key", "Accept"],
    hasApiKey: Boolean(apiKey),
  });

  const res = await fetch(url, {
    method: "GET",
    headers: {
      "X-Api-Key": apiKey,
      Accept: "application/json",
    },
  });

  const rawText = await res.text();
  let json: Record<string, unknown> = {};
  try {
    json = rawText ? (JSON.parse(rawText) as Record<string, unknown>) : {};
  } catch {
    json = { nonJsonBody: rawText.slice(0, 500) };
  }
  const redacted = redact(json);

  if (!res.ok) {
    console.error("[DepositAdapter:hamipay] status failed — provider response", {
      status: res.status,
      statusText: res.statusText,
      body: redacted,
      rawBodyPreview: rawText.slice(0, 800),
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
