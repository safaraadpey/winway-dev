# P6.2 — Payment Adapter Contract

> **READ ONLY** · Adapters produce **verification evidence only**  
> They **must not** call wallet mutation or write intent status directly.

---

## 1. Principle

```
Ingress → Attempt (raw)
       → Adapter.normalize + Adapter.verifyHints
       → Verification Zone (authoritative checks)
       → CreditCommand
       → fn_wallet_apply_delta
```

Adapters are **pure-ish ports**: given untrusted input + intent context, return structured evidence or error.  
**Verification Zone** decides pass/fail. **Credit worker** alone talks to wallet.

---

## 2. Shared types (logical)

### `DepositIntentView` (read-only to adapters)

```
id, user_id, provider, channel, amount_expected, currency,
destination_ref, expires_at, status
```

### `RawPaymentObservation`

```
provider, observed_at, headers, body_bytes, source: webhook|poll|chain_watcher
```

### `VerificationEvidence` (adapter output)

```
provider: string
external_payment_id: string          # canonical money id
external_event_id?: string           # delivery id if any
user_binding_hint?: string           # never authoritative alone
amount_observed: numeric
currency_observed: string
token_contract?: string              # USDT
destination_observed: string
confirmations?: number
observed_at: timestamptz
signature_valid?: boolean            # fiat
merchant_id_match?: boolean
raw_fingerprint: string              # hash
provider_status?: string             # e.g. PAID
extras: object                       # non-authoritative
```

### `AdapterError`

```
code: malformed|unauthorized|unsupported|temporary
message: string
retryable: boolean
```

---

## 3. Interface: `FiatGatewayAdapter`

### Responsibility

Translate gateway webhooks/API polls into `VerificationEvidence`.

### Methods (design)

| Method | Input | Output |
|--------|-------|--------|
| `parseObservation(raw)` | RawPaymentObservation | structured event \| AdapterError |
| `extractExternalIds(parsed)` | | `{ paymentId, eventId }` |
| `verifySignature(raw, secrets)` | | `{ ok: boolean }` — **crypto only**; zone still re-checks |
| `buildEvidence(parsed, intent)` | | VerificationEvidence \| AdapterError |
| `mapProviderStatus(parsed)` | | `paid\|pending\|failed\|unknown` |

### Must

- Treat body as **untrusted**
- Use constant-time signature compare
- Never credit wallet
- Never trust client-supplied amount over gateway fields **after** signature OK (still bind to intent)

### Must not

- Call `fn_wallet_apply_delta`
- UPDATE `deposit_intents`
- Accept unsigned “admin simulate paid” in production adapter

### Canonical idempotency id

`gateway payment / transaction reference id`  
→ `deposit:fiat:{provider}:{payment_id}`

---

## 4. Interface: `TronUsdtAdapter`

### Responsibility

From watcher/indexer observation, build chain evidence for USDT-TRC20 (or configured token).

### Methods (design)

| Method | Input | Output |
|--------|-------|--------|
| `parseTxObservation(raw)` | watcher payload | parsed transfer \| error |
| `buildEvidence(parsed, intent)` | | VerificationEvidence |
| `requiredConfirmations()` | config | number N |
| `isCorrectToken(parsed)` | | boolean |
| `isCorrectDestination(parsed, intent)` | | boolean |

### Evidence must include

- `txid`
- `log_index` (or vout index)
- `to_address` / memo
- `amount_observed` (token decimals normalized)
- `token_contract`
- `confirmations`

### Canonical idempotency id

`txid + log_index`  
→ `deposit:tron:{txid}:{log_index}`

### Must not

- Credit on mempool-only (`confirmations < N`)
- Accept wrong contract “USDT lookalike”
- Call wallet

---

## 5. Interface: `FuturePaymentAdapter`

Same shape as fiat:

```
parseObservation → verifySignature? → buildEvidence → external_payment_id
```

Registration via provider registry:

```
provider_code → Adapter implementation + secret refs + config
```

No wallet access; no shared mutable global state beyond config.

---

## 6. Interface: `ManualDepositAdapter` (future optional)

Only if cashdesk is later folded into Deposit Domain (roadmap Phase D).

| Rule | |
|------|--|
| Evidence | Actor id, reason code, dual-approval refs |
| Idempotency | `deposit:manual:{intent_id}` |
| Extra gates | Hierarchy, limits, maker-checker |
| Still | Credit only via CreditCommand → apply_delta |

**Not in v1.** Cashdesk remains separate.

---

## 7. Verification Zone — trust rules

| Data | Trust |
|------|-------|
| HTTP body / chain payload | **Untrusted** |
| Adapter evidence fields | **Untrusted until zone checks** |
| Intent row (locked) | **Trusted binding** (user, amount, dest, expiry) |
| Signature result | Trusted only if secret correct + constant-time |
| Merchant id | Must match config allowlist |
| Amount / currency / token / destination | Must match intent (+ policy) |
| Confirmations | Must ≥ N from **independent** chain query when possible |
| Prior posted credit | Trusted stop — no second credit |

### Zone checklist (authoritative)

1. Signature / auth of observation  
2. Merchant / watcher identity  
3. Load intent `FOR UPDATE`  
4. Intent status allows verify  
5. Not expired  
6. Amount / currency / token / destination  
7. Confirmations  
8. Replay: UNIQUE external_payment_id for pass  
9. Emit `deposit_verifications` row  
10. Transition intent → `confirmed` or `rejected`

Adapters **assist**; zone **decides**.

---

## 8. CreditCommand (wallet-facing)

```
CreditCommand {
  intent_id
  user_id
  amount          # from intent / policy — NOT from client
  currency
  idempotency_key
  verification_id
  source_kind: "deposit_domain"
  source_ref: intent_id
  tx_type: "deposit"
}
```

Executor: server-only Deposit Creditor → `fn_wallet_apply_delta` in one transaction with `deposit_credits` update.

---

## 9. Observability hooks (adapter level)

Log prefixes (stable):

- `[DepositAdapter:fiat]`
- `[DepositAdapter:tron]`
- `[DepositVerify]`
- `[DepositCredit]`

Metrics: parse_fail, sig_fail, evidence_built, temporary_errors.

---

P6_2_DEPOSIT_DOMAIN_DESIGN_COMPLETE
