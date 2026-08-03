# P6.2 — Deposit Security Boundary

> **READ ONLY** · Security & ACL recommendations (no migrations)  
> Addresses P6.1 risks R04–R08, R16–R19 primarily.

---

## 1. Trust boundaries (deposit-specific)

```
Untrusted: User, Attacker, Gateway HTTP, public chain mempool
    ↓
Ingress API / Watcher feed     ← still untrusted data
    ↓
Verification Zone              ← first trusted decision point
    ↓
Credit Worker                  ← only wallet mutator for deposits
    ↓
fn_wallet_apply_delta          ← existing SoR primitive
    ↓
transactions + wallets
```

**Game engine** is outside this boundary for deposits (no deposit credit grants).

**Cashdesk** remains a separate mint boundary (P6.1 R01) until optional Manual adapter.

---

## 2. What is trusted vs untrusted

| Item | Classification |
|------|----------------|
| Webhook body / headers | Untrusted |
| Chain watcher payload | Untrusted until re-queried |
| Adapter evidence | Untrusted input to zone |
| Intent fields at create | Trusted after authz (user can only set own id via server) |
| Locked intent at verify | Trusted binding |
| `deposit_verifications` pass row | Trusted authorization to credit |
| Client “I paid” flag | Untrusted — ignore |
| Amount in CreditCommand | From intent/policy only |

---

## 3. Verification requirements

| Check | Fiat | USDT |
|-------|------|------|
| Signature / auth | HMAC/JWT per provider | Watcher auth + optional node re-fetch |
| Merchant | Allowlist | N/A (token contract allowlist) |
| Amount | Exact vs intent | Exact vs intent |
| Currency/token | IRR code | USDT contract id |
| Recipient / destination | Order id bind | Address/memo bind |
| Expiry | Intent `expires_at` | Same |
| Confirmations | Provider “paid” | ≥ N blocks |
| Replay | Attempt UNIQUE + payment_id UNIQUE on pass | txid+index UNIQUE |

---

## 4. Recommended schema & ACL (design only)

### Schema

Prefer new schema: **`deposit`** (parallel to `game_finance`, `platform`).

Tables: `deposit.intents`, `deposit.attempts`, `deposit.verifications`, `deposit.credits`, `deposit.events`.

### Table ACL

| Role | Access |
|------|--------|
| `anon` | **None** |
| `authenticated` | **None** direct; only via SECURITY DEFINER RPCs that enforce `auth.uid() = user_id` for create/read-own |
| `service_role` | Used by workers carefully — prefer dedicated DB role `deposit_worker` |
| `deposit_worker` | INSERT attempts/events; UPDATE intent status via functions; EXECUTE credit function |
| `postgres` | Migrations / break-glass |

### RLS posture

- **Enable RLS** on all deposit tables.
- No broad `USING (true)` for authenticated.
- Policies only if PostgREST exposure required; prefer **no PostgREST** for attempts/verifications/credits (server PG only).

### Server-only functions (recommended names — not implemented)

| Function | Role |
|----------|------|
| `deposit.fn_create_intent` | User JWT DEFINER; binds `auth.uid()` |
| `deposit.fn_record_attempt` | Worker only |
| `deposit.fn_apply_verification` | Worker only |
| `deposit.fn_post_credit` | Worker only → calls `game_finance.fn_wallet_apply_delta` |
| `deposit.fn_expire_intents` | Scheduler |

**REVOKE** public execute; grant to worker role / service_role only (except create/read-own).

### Separation from game engine

| Engine may | Engine must not |
|------------|-----------------|
| Read wallet balance for join | EXECUTE deposit credit functions |
| Settle rooms | Insert deposit verifications |
| | Hold gateway secrets |

Engine service_role is **too powerful** today (P6.1 R03); long-term split deposit secrets onto a **payment worker** identity.

---

## 5. Secrets

| Secret | Storage | Rotation |
|--------|---------|----------|
| Gateway webhook HMAC | Vercel/worker env | Dual-key overlap |
| Gateway API keys | env / secret manager | |
| Tron node / indexer auth | worker env | |
| Deposit address hot wallet keys | **Not on Vercel web** — cold/pool manager | |

Web app should not hold chain private keys for deposit address pools if avoidable.

---

## 6. Observability (required)

### Structured logs

| Prefix | Use |
|--------|-----|
| `[DepositIntent]` | create, expire |
| `[DepositAttempt]` | ingress, duplicate |
| `[DepositVerify]` | pass/fail codes |
| `[DepositCredit]` | post, retry, idempotent hit |
| `[DepositReconcile]` | drift, stuck states |

### Immutable audit

- All rows in `deposit_events`
- Link `admin_audit_log` only for human rejects/reversals

### Metrics

- intents_created, attempts_total, attempts_duplicate
- verify_fail{code}, verify_pass
- credit_posted, credit_retry, credit_fail
- intent_age_pending_seconds (histogram)

### Alerts

| Alert | Condition |
|-------|-----------|
| Pending too long | `pending/observed` > SLA |
| Verification failures spike | rate |
| Duplicate attempts flood | rate |
| Credit retries elevated | |
| **Confirmed but not credited** | `status=confirmed` age > T |
| **Wallet/ledger drift** | recon job ≠ 0 |
| Signature failures | possible attack |

### Reconciliation jobs

1. **Stuck confirmed:** enqueue credit  
2. **Posted credit without ledger_tx:** page on-call  
3. **Wallet vs ledger** for `source_kind=deposit_domain`  
4. **Pass verification without credit row**  
5. **Expired with late chain payment** — ops queue (no auto-credit)

---

## 7. Mapping to P6.1 Top risks

| Risk | Deposit Domain control |
|------|------------------------|
| R04 forged webhook | Signature + reject attempt |
| R05 duplicate callback | Attempt UNIQUE + credit idempotency |
| R06 expired credit | Expiry state + verify guard |
| R07 bad USDT | Adapter + zone token/dest/amount/depth |
| R08 ledger drift | Credit only via apply_delta one TX |
| R16 mismatch | Intent binding |
| R19 weak webhook auth | Dual secrets, constant-time |

Cashdesk R01/R02 remain **outside** until Manual adapter phase.

---

## 8. Explicit non-actions (this phase)

- No migrations  
- No RLS applied yet  
- No webhook endpoints  
- No wallet function changes  

---

P6_2_DEPOSIT_DOMAIN_DESIGN_COMPLETE
