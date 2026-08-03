/**
 * Fake payment adapter — evidence only. Never touches wallets or intent status.
 * Test / DEV harness only.
 */
import { createHash, randomUUID } from "crypto";
import type {
  AdapterError,
  FakeScenario,
  VerificationEvidence,
} from "@/lib/deposit/types";

export type FakeIntentContext = {
  id: string;
  amount_expected: number;
  currency: string;
  destination_ref: string | null;
  expires_at: string;
  provider: string;
};

export type FakeObservation = {
  scenario: FakeScenario;
  /** Stable payment id for duplicate / retry scenarios */
  paymentId?: string;
  eventId?: string;
  forged?: boolean;
};

const FAKE_SECRET = "p6.5-fake-adapter-secret";

export function fakeSign(body: string): string {
  return createHash("sha256").update(`${FAKE_SECRET}:${body}`).digest("hex");
}

export function verifyFakeSignature(
  body: string,
  signature: string | undefined
): boolean {
  if (!signature) return false;
  const expected = fakeSign(body);
  if (expected.length !== signature.length) return false;
  let ok = 0;
  for (let i = 0; i < expected.length; i++) {
    ok |= expected.charCodeAt(i) ^ signature.charCodeAt(i);
  }
  return ok === 0;
}

/**
 * Build untrusted evidence for the Verification Zone.
 * Must NOT update wallets or deposit intent status.
 */
export function buildFakeEvidence(
  intent: FakeIntentContext,
  observation: FakeObservation
): VerificationEvidence | AdapterError {
  const paymentId =
    observation.paymentId || `fake_pay_${randomUUID().replace(/-/g, "")}`;
  const eventId = observation.eventId || `fake_evt_${randomUUID()}`;

  if (observation.scenario === "forged_callback" || observation.forged) {
    return {
      code: "unauthorized",
      message: "forged or invalid signature",
      retryable: false,
    };
  }

  if (observation.scenario === "temporary_verification_error") {
    return {
      code: "temporary",
      message: "fake provider temporary error",
      retryable: true,
    };
  }

  let amount = intent.amount_expected;
  let currency = intent.currency;
  let providerStatus = "PAID";

  if (observation.scenario === "wrong_amount") {
    amount = Number(intent.amount_expected) + 1;
  }
  if (observation.scenario === "wrong_currency") {
    currency = intent.currency === "IRR" ? "USD" : "IRR";
  }
  if (observation.scenario === "expired_invoice") {
    providerStatus = "PAID_LATE";
  }

  const fingerprint = createHash("sha256")
    .update(`${paymentId}|${eventId}|${amount}|${currency}`)
    .digest("hex");

  console.log("[DepositAdapter:fake] evidence built", {
    scenario: observation.scenario,
    paymentId,
    eventId,
  });

  return {
    provider: intent.provider,
    external_payment_id: paymentId,
    external_event_id: eventId,
    amount_observed: amount,
    currency_observed: currency,
    destination_observed: intent.destination_ref || undefined,
    confirmations: 1,
    observed_at: new Date().toISOString(),
    signature_valid: true,
    provider_status: providerStatus,
    raw_fingerprint: fingerprint,
    extras: { scenario: observation.scenario, adapter: "fake" },
  };
}

export function isAdapterError(
  v: VerificationEvidence | AdapterError
): v is AdapterError {
  return "code" in v && "retryable" in v;
}
