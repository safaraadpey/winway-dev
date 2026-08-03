# P6.2 — Deposit Domain Model

> **Phase:** P6.2 · **Mode:** READ ONLY (design only)  
> **Prerequisite:** P6.1 Financial Threat Model  
> **Invariant:** `wallets.balance` ≡ ledger projection of `transactions`  
> **No SQL / migrations / APIs in this phase**

---

## 1. Purpose

Introduce a **Deposit Domain** that owns:

- payment intents (invoices)
- external observation & verification
- exactly-once credit authorization

**Wallet / ledger remain money SoR** via `game_finance.fn_wallet_apply_delta` only.

Wallet must **never** store gateway payloads, chain TX details, or provider-specific fields.  
It may only receive a **verified, idempotent credit request** from this domain.

---

## 2. Entity decision

Evaluated candidates: `deposit_intents`, `deposit_attempts`, `deposit_verifications`, `deposit_credits`, `deposit_events`.

| Entity | Keep? | Rationale |
|--------|-------|-----------|
| **deposit_intents** | **Yes** | Canonical invoice / user-facing deposit request |
| **deposit_attempts** | **Yes** | Each inbound webhook / chain observation (replay surface) |
| **deposit_verifications** | **Yes** | Immutable evidence + pass/fail outcome |
| **deposit_credits** | **Yes** | Exactly-once credit authorization + ledger linkage |
| **deposit_events** | **Yes** | Append-only domain audit (ops + forensics) |

**Not chosen as tables:** provider-specific “fiat_payments” / “tron_txs” as SoR — those live as **payload blobs + typed evidence** under attempts/verifications, behind adapters.

**Optional later (not required for v1):** `deposit_addresses` (pooled USDT addresses), `deposit_refunds` (if overpayment policy needs payouts — out of scope while withdrawals disabled).

---

## 3. Bounded context

```
┌──────────────────────────────────────────────────────────┐
│ Deposit Domain                                           │
│  intents · attempts · verifications · credits · events   │
│  adapters (evidence only) · verifier · credit issuer     │
└────────────────────────────┬─────────────────────────────┘
                             │ CreditCommand (idempotent)
                             ▼
┌──────────────────────────────────────────────────────────┐
│ Wallet / Ledger (existing)                               │
│  fn_wallet_apply_delta → transactions + wallets.balance  │
└──────────────────────────────────────────────────────────┘

Game Engine must NOT credit deposits.
Cashdesk (today) remains outside this domain (see §8).
```

---

## 4. Entity: `deposit_intents`

### Responsibility

User- or system-created **invoice**: “credit user U amount A in currency C via channel X before expiry.”

This is the **business identity** of a deposit request.

### Required fields (logical)

| Field | Notes |
|-------|-------|
| `id` | UUID PK — internal deposit id |
| `user_id` | FK → users; immutable after create |
| `channel` | `fiat_gateway` \| `tron_usdt` \| `manual_adapter` (future) |
| `provider` | e.g. `zarinpal`, `tron`; immutable |
| `amount_expected` | numeric ≥ 0; policy unit (IRR or token minor units — document per channel) |
| `currency` | e.g. `IRR`, `USDT` |
| `status` | lifecycle (see lifecycle doc) |
| `expires_at` | timestamptz |
| `destination_ref` | opaque: gateway order id placeholder, deposit address id, memo |
| `metadata` | jsonb non-secret UX hints only |
| `created_at` / `updated_at` | |
| `created_by` | `user` \| `system` \| `admin` + actor id |

### Unique constraints

| Constraint | Purpose |
|------------|---------|
| PK `id` | Canonical internal id |
| Optional `(provider, provider_intent_ref)` UNIQUE WHERE NOT NULL | Bind gateway-created order |

### Foreign keys

- `user_id` → `public.users`
- Soft refs only to wallet (no FK required); credit row links later

### Mutable vs immutable

| Immutable after create | Mutable |
|------------------------|---------|
| `user_id`, `channel`, `provider`, `amount_expected`, `currency`, `destination_ref` (once assigned), `expires_at` (or only extend via explicit policy event) | `status`, `updated_at`, destination assignment if two-phase address allocate |

### Audit / retention

- Every status change → `deposit_events`
- Retain intents ≥ **7 years** (financial) or legal minimum; never hard-delete credited intents (soft archive)

---

## 5. Entity: `deposit_attempts`

### Responsibility

One **observation** of an external signal: webhook delivery, poll result, or chain watcher sighting.  
Does **not** mean money is good — only that something was seen.

### Required fields

| Field | Notes |
|-------|-------|
| `id` | UUID PK |
| `intent_id` | FK → intents (nullable only for unmatched orphan observations — prefer require intent) |
| `provider` | |
| `external_event_id` | gateway event id / delivery id / synthetic watcher id |
| `observed_at` | |
| `payload_hash` | sha256 of raw body |
| `payload_ref` | storage pointer or encrypted blob ref (not in wallet) |
| `headers_meta` | non-secret: signature present?, IP class |
| `parse_status` | `accepted` \| `malformed` \| `unauthorized` |
| `created_at` | immutable insert |

### Unique constraints

| Constraint | Purpose |
|------------|---------|
| UNIQUE `(provider, external_event_id)` | **Replay protection** at ingress |

### Mutable vs immutable

**Insert-only** (immutable). Reprocessing creates a new attempt or links verification — do not edit payload.

### Audit / retention

- Retain raw payloads ≥ 2 years (security); hash forever with intent
- Orphan attempts (no intent) retained for fraud review

---

## 6. Entity: `deposit_verifications`

### Responsibility

**Immutable verdict** produced by the Verification Zone from attempt(s) + intent + adapter evidence.

### Required fields

| Field | Notes |
|-------|-------|
| `id` | UUID PK |
| `intent_id` | FK |
| `attempt_id` | FK (nullable if batched) |
| `result` | `pass` \| `fail` |
| `failure_code` | e.g. `bad_signature`, `amount_mismatch`, `expired`, `wrong_destination` |
| `evidence` | jsonb: normalized VerificationEvidence (adapter output) |
| `external_payment_id` | canonical external money id (see idempotency) |
| `amount_observed` | |
| `currency_observed` | |
| `confirmations` | int / null for fiat |
| `verified_at` | |
| `verifier_version` | code/config version for forensics |

### Unique constraints

| Constraint | Purpose |
|------------|---------|
| UNIQUE `(provider, external_payment_id)` WHERE result = `pass` | One successful verification identity globally |
| Optional UNIQUE `(intent_id)` WHERE result = `pass` | At most one pass per intent (v1 policy) |

### Mutable vs immutable

**Insert-only.** Failures are new rows; never flip `fail` → `pass` in place (new verification after new evidence).

### Audit / retention

- Retain forever for credited deposits; failures ≥ 2 years

---

## 7. Entity: `deposit_credits`

### Responsibility

**Exactly-once logical credit** authorization that drives wallet mutation.

### Required fields

| Field | Notes |
|-------|-------|
| `id` | UUID PK |
| `intent_id` | FK UNIQUE — one credit per intent (v1) |
| `verification_id` | FK to passing verification |
| `user_id` | denormalized immutable copy from intent |
| `amount` | must equal policy amount for credit |
| `currency` | |
| `idempotency_key` | string UNIQUE — see money contract |
| `ledger_tx_id` | FK/uuid of `transactions.id` after success |
| `status` | `pending` \| `posted` \| `failed` |
| `posted_at` | |
| `error` | last failure reason if retryable |

### Unique constraints

| Constraint | Purpose |
|------------|---------|
| UNIQUE `idempotency_key` | Exactly-once credit |
| UNIQUE `intent_id` | One credit row per intent |
| UNIQUE `ledger_tx_id` WHERE NOT NULL | 1:1 ledger link |

### Mutable vs immutable

| Immutable | Mutable |
|-----------|---------|
| amounts, user, keys, verification_id | `status` pending→posted/failed; `ledger_tx_id`; `error` |

### Audit / retention

- Permanent; never delete posted credits

---

## 8. Entity: `deposit_events`

### Responsibility

Append-only **domain audit stream** (not a substitute for `transactions`).

### Required fields

| Field | Notes |
|-------|-------|
| `id` | bigserial / UUID |
| `intent_id` | nullable for orphans |
| `event_type` | e.g. `intent.created`, `attempt.received`, `verification.passed`, `credit.posted` |
| `actor` | `system` \| `user` \| `admin` \| `adapter` |
| `payload` | jsonb small facts |
| `created_at` | |

### Constraints

- Insert-only; no updates/deletes (except legal purge of PII in payload with redaction policy)

### Retention

- ≥ 7 years for money-related events

---

## 9. Relationships (logical ER)

```
users 1──* deposit_intents
deposit_intents 1──* deposit_attempts
deposit_intents 1──* deposit_verifications
deposit_intents 1──0..1 deposit_credits
deposit_verifications 1──0..1 deposit_credits
deposit_credits 0..1──1 transactions   (via ledger_tx_id / source_ref)
*──* deposit_events (keyed by intent_id)
```

---

## 10. Money contract (summary)

Credit wallet **only if** all hold:

1. Unique external payment identity  
2. User binding matches intent  
3. Amount matches policy  
4. Currency/token matches  
5. Destination matches  
6. Intent not expired  
7. Required confirmations exist  
8. Credit not already posted  

Full rules: `p6-2-deposit-lifecycle.md` + `p6-2-payment-adapter-contract.md`.

### Idempotency keys (canonical)

| Channel | Canonical external id | Credit `idempotency_key` |
|---------|----------------------|---------------------------|
| Fiat gateway | Gateway **payment / ref id** (not delivery id) | `deposit:fiat:{provider}:{payment_id}` |
| USDT/TRON | **txid + log/vout index** | `deposit:tron:{txid}:{index}` |
| Internal ops | Intent id (manual adapter only) | `deposit:manual:{intent_id}` |

**Delivery/event ids** key `deposit_attempts` only — never wallet credit keys (webhooks retry with new delivery ids).

---

## 11. Cashdesk boundary (decision)

**Decision: A — remain separate for now.**

| Option | Tradeoff |
|--------|----------|
| **A. Separate (chosen)** | Cashdesk stays admin mint; Deposit Domain stays payment-verified only. Clear trust split; no accidental “gateway rules” on panel ops. Continues R01/R02 risks until cashdesk hardened separately. |
| **B. Manual adapter later** | Cashdesk becomes `ManualDepositAdapter` producing verification evidence + same credit path. Better audit uniformity; risk of operators bypassing payment checks if adapter is weak. |

**Later (roadmap):** optional B only after hierarchy + idempotency + maker-checker on manual path.

**Do not change current cashdesk behavior in P6.2.**

---

## 12. Out of scope

- Player withdrawals  
- Implementing adapters / webhooks / watchers  
- Changing `fn_wallet_apply_delta`  
- Game join / settlement  

---

## Related docs

- `p6-2-deposit-lifecycle.md`  
- `p6-2-payment-adapter-contract.md`  
- `docs/security/p6-2-deposit-security-boundary.md`  
- `p6-2-deposit-implementation-roadmap.md`  

---

P6_2_DEPOSIT_DOMAIN_DESIGN_COMPLETE
