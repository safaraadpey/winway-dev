/** Shared Deposit Domain types (P6.5 / P6.2 contract). */

export type DepositChannel =
  | "fiat_gateway"
  | "tron_usdt"
  | "manual_adapter"
  | "fake";

export type DepositIntentStatus =
  | "created"
  | "pending"
  | "observed"
  | "verifying"
  | "confirmed"
  | "credited"
  | "failed"
  | "expired"
  | "rejected"
  | "reversed";

export type VerificationEvidence = {
  provider: string;
  external_payment_id: string;
  external_event_id?: string;
  amount_observed: number;
  currency_observed: string;
  destination_observed?: string;
  confirmations?: number;
  observed_at: string;
  signature_valid?: boolean;
  provider_status?: string;
  raw_fingerprint: string;
  extras?: Record<string, unknown>;
};

export type AdapterError = {
  code: "malformed" | "unauthorized" | "unsupported" | "temporary";
  message: string;
  retryable: boolean;
};

export type FakeScenario =
  | "paid"
  | "duplicate_callback"
  | "wrong_amount"
  | "wrong_currency"
  | "expired_invoice"
  | "forged_callback"
  | "temporary_verification_error";

export type CreditCommand = {
  intent_id: string;
  user_id: string;
  amount: number;
  currency: string;
  idempotency_key: string;
  verification_id: string;
  source_kind: "deposit_domain";
  source_ref: string;
  tx_type: "deposit";
};
