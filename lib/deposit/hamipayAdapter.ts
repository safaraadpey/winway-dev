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

/** Which HamiPay merchant key to use. Stored on intent metadata for verify/recon. */
export type HamiPayKeyProfile = "default" | "dev_player1";

/**
 * Temporary test: only these usernames use HAMIPAY_API_KEY_DEV_PLAYER1.
 * `dev_playe1` is accepted as an alias for the typed name.
 */
const DEV_PLAYER1_USERNAMES = new Set(["dev_player1", "dev_playe1"]);
const DEV_PLAYER1_USER_IDS = new Set([
  "1b6d5f20-b340-4058-8707-1b5987f201a1",
]);

/**
 * Temporary test fallback so Vercel works before the env var is set.
 * Prefer HAMIPAY_API_KEY_DEV_PLAYER1. Never log this value.
 */
const DEV_PLAYER1_API_KEY_FALLBACK =
  "hp_live_5f6ffda9c31c7b2d_5S__yVKLGBY31lM7QpZeYreCfWFSyl7T6bcq6AIcIAc";

export type HamiPayCreateInput = {
  depositId: string;
  merchantOrderId: string;
  amountProviderUnits: number;
  currency: string;
  returnUrl: string;
  keyProfile?: HamiPayKeyProfile;
  customer: {
    userId: string;
    displayName?: string | null;
    username?: string | null;
    email?: string | null;
    phone?: string | null;
  };
};

export type HamiPayCreateResult = {
  providerPaymentId: string;
  paymentUrl: string;
  keyProfile: HamiPayKeyProfile;
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

export function resolveHamiPayKeyProfile(opts: {
  username?: string | null;
  userId?: string | null;
}): HamiPayKeyProfile {
  const username = (opts.username || "").trim().toLowerCase();
  if (DEV_PLAYER1_USERNAMES.has(username)) return "dev_player1";
  const userId = (opts.userId || "").trim().toLowerCase();
  if (userId && DEV_PLAYER1_USER_IDS.has(userId)) return "dev_player1";
  return "default";
}

export function hamipayKeyProfileFromIntentMetadata(
  metadata: Record<string, unknown> | null | undefined
): HamiPayKeyProfile {
  const raw = metadata?.hamipay_key_profile;
  if (raw === "dev_player1") return "dev_player1";
  return "default";
}

function resolveDevPlayer1ApiKey(): string {
  const fromEnv = (process.env.HAMIPAY_API_KEY_DEV_PLAYER1 || "").trim();
  if (fromEnv) return fromEnv;
  return DEV_PLAYER1_API_KEY_FALLBACK;
}

function requireConfig(profile: HamiPayKeyProfile = "default"): {
  apiKey: string;
  baseUrl: string;
  keyProfile: HamiPayKeyProfile;
} {
  const defaultKey = (process.env.HAMIPAY_API_KEY || "").trim();
  let apiKey = defaultKey;
  let keyProfile: HamiPayKeyProfile = "default";

  if (profile === "dev_player1") {
    const override = resolveDevPlayer1ApiKey();
    if (override) {
      apiKey = override;
      keyProfile = "dev_player1";
    } else {
      console.warn(
        "[DepositAdapter:hamipay] dev_player1 key missing; using default key"
      );
    }
  }

  const baseUrl = (process.env.HAMIPAY_API_BASE_URL || "").replace(/\/$/, "");
  if (!apiKey || !baseUrl) {
    throw new Error("hamipay_config_missing");
  }
  if (apiKey.startsWith("NEXT_PUBLIC_")) {
    throw new Error("hamipay_api_key_must_not_be_public");
  }
  return { apiKey, baseUrl, keyProfile };
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
 * Provider amount unit for HamiPay / Shaparak SEP.
 * Iranian PSP gateways display and settle in **Rials**.
 * Wallet SoR stays toman-scale under currency code IRR.
 *
 * Default: `rial` → send toman×10 (matches BuyRial input, e.g. 1_000_000 ریال).
 * Override with HAMIPAY_AMOUNT_UNIT=toman only for legacy/mock contracts.
 */
function resolveHamiPayAmountUnit(): "rial" | "toman" {
  const unit = (process.env.HAMIPAY_AMOUNT_UNIT || "rial").toLowerCase();
  return unit === "toman" ? "toman" : "rial";
}

/** Convert wallet toman amount to HamiPay/SEP provider units (default: Rials). */
export function tomanToProviderAmount(toman: number): number {
  if (resolveHamiPayAmountUnit() === "toman") return Math.floor(toman);
  return Math.floor(toman) * 10;
}

/** Convert provider amount back to wallet toman. */
export function providerAmountToToman(providerAmount: number): number {
  if (resolveHamiPayAmountUnit() === "toman") {
    return Math.floor(providerAmount);
  }
  return Math.floor(providerAmount / 10);
}

function resolveCustomerName(customer: HamiPayCreateInput["customer"]): string {
  const name =
    (customer.displayName && customer.displayName.trim()) ||
    (customer.username && customer.username.trim()) ||
    (customer.email && customer.email.split("@")[0]) ||
    "DingMoney User";
  return name.slice(0, 120);
}

function resolveCustomerPhone(customer: HamiPayCreateInput["customer"]): string {
  const fromInput = (customer.phone || "").replace(/\D/g, "");
  if (fromInput.length >= 10) return fromInput.slice(0, 15);
  throw new Error("hamipay_customer_phone_required");
}

export async function hamipayCreatePayment(
  input: HamiPayCreateInput
): Promise<HamiPayCreateResult> {
  const requestedProfile =
    input.keyProfile ||
    resolveHamiPayKeyProfile({
      username: input.customer.username,
      userId: input.customer.userId,
    });

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
      keyProfile: requestedProfile,
    });
    return {
      providerPaymentId,
      paymentUrl,
      keyProfile: requestedProfile,
      rawRedacted: { mock: true, providerPaymentId },
    };
  }

  const { apiKey, baseUrl, keyProfile } = requireConfig(requestedProfile);
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
    keyProfile,
    hasIdempotencyKey: Boolean(input.depositId),
    idempotencyKeyEqualsDepositId: input.depositId === input.merchantOrderId,
    bodyFieldNames: Object.keys(body),
    amount: body.amount,
    amountUnit: resolveHamiPayAmountUnit(),
    merchantOrderId: body.merchantOrderId,
    descriptionLength: body.description.length,
    returnUrl: body.returnUrl,
    hasCustomerName: Boolean(body.customerName),
    hasCustomerPhone: Boolean(body.customerPhone),
  });

  const startedAt = Date.now();
  let res: Response;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Api-Key": apiKey,
        "Idempotency-Key": input.depositId,
        Connection: "close",
      },
      body: JSON.stringify(body),
      // Fail before Vercel function hard-timeout when upstream is unreachable
      signal: AbortSignal.timeout(25_000),
    });
  } catch (err) {
    const elapsedMs = Date.now() - startedAt;
    const cause =
      err instanceof Error
        ? { name: err.name, message: err.message }
        : { message: String(err) };
    console.error("[DepositAdapter:hamipay] create network/timeout", {
      url,
      elapsedMs,
      cause,
    });
    throw new Error(`hamipay_create_network:${cause.name || "error"}:${elapsedMs}ms`);
  }

  const elapsedMs = Date.now() - startedAt;
  const rawText = await res.text();
  let json: Record<string, unknown> = {};
  try {
    json = rawText ? (JSON.parse(rawText) as Record<string, unknown>) : {};
  } catch {
    json = { nonJsonBody: rawText.slice(0, 500) };
  }
  const redacted = redact(json);

  if (!res.ok) {
    const providerError =
      typeof json.error === "string"
        ? json.error
        : typeof json.message === "string"
          ? json.message
          : undefined;
    console.error("[DepositAdapter:hamipay] create failed — provider response", {
      status: res.status,
      statusText: res.statusText,
      elapsedMs,
      url,
      body: redacted,
      rawBodyPreview: rawText.slice(0, 800),
      returnUrl: body.returnUrl,
      hint:
        res.status === 504
          ? "Upstream 504 usually means Vercel cannot reach HamiPay (Iran CDN). Postman from Iran can still succeed."
          : providerError && /بازگشت|return/i.test(providerError)
            ? "HamiPay returnUrl must match the base URL registered for this API key (domain change)."
            : undefined,
    });
    if (providerError && /بازگشت|return/i.test(providerError)) {
      throw new Error(`hamipay_return_url_mismatch:${res.status}`);
    }
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
    keyProfile,
    hasPaymentUrl: true,
  });

  return { providerPaymentId, paymentUrl, keyProfile, rawRedacted: redacted };
}

export async function hamipayGetPaymentStatus(opts: {
  providerPaymentId: string;
  merchantOrderId: string;
  keyProfile?: HamiPayKeyProfile;
}): Promise<HamiPayStatusResult> {
  const requestedProfile = opts.keyProfile || "default";
  if (isMockMode()) {
    const forced = (process.env.HAMIPAY_MOCK_STATUS || "paid").toLowerCase();
    const status = mapStatus(forced);
    const amount = Number(process.env.HAMIPAY_MOCK_AMOUNT || 0);
    console.log("[DepositAdapter:hamipay] mock status", {
      providerPaymentId: opts.providerPaymentId,
      keyProfile: requestedProfile,
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

  const { apiKey, baseUrl, keyProfile } = requireConfig(requestedProfile);
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
    keyProfile,
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
