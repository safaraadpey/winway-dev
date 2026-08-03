# P6.1 — Financial Threat Model

> **Date:** 2026-08-03  
> **Mode:** READ ONLY — no code, SQL, ACL, API, or wallet changes  
> **Phase:** Pre–real-money payment integration  
> **Related:** P2.1–P2.3 wallet ACL audits · Phase 4 financial security · P0-A remediation

---

## 0. Executive posture

| Fact | Status today |
|------|----------------|
| Internal wallet (IRR) | **Live** — `wallets` + `transactions` |
| Player self-deposit (fiat / USDT) | **Not implemented** |
| Player withdrawal / cash-out | **Not implemented** |
| Wallet use | Purchase game / tournament entries only |
| Cashdesk “deposit/withdraw” | Admin/agent panel ops |
| Payment webhooks | **None** |
| Blockchain verification | **None** |

This model covers **current money paths** and **future payment-phase threats** that must be closed before enabling real deposits.

**Core invariant**

```
wallets.balance  ≡  projection of completed ledger rows in transactions
                    (per user_id + currency)
```

Plus: `locked_amount` must match open holds (join / tournament) that have not been captured or released.

---

## 1. Assets

| Asset | Sensitivity | Store |
|-------|-------------|-------|
| IRR spendable balance | Critical | `public.wallets.balance` |
| IRR locked funds | Critical | `public.wallets.locked_amount` |
| Ledger history | Critical / audit | `public.transactions` |
| Commission pending/settled | High | `commissions_log` |
| Ding balances | High (secondary) | `ding_balances` / `ding_transactions` |
| Tournament locks / payouts | High | `tournament_*` |
| Service role / JWT secrets | Critical | Env / Auth |
| Future: payment invoices, chain TXIDs, gateway secrets | Critical | TBD |

---

## 2. Flow-by-flow analysis

For each flow: assets → trust boundary → entry points → attack vectors → abuse → existing protection → residual risk → recommended mitigation (design-level only).

### 2.1 Registration

| | |
|--|--|
| **Assets** | New user row, empty wallet, referral affiliation |
| **Trust boundary** | Client → Supabase Auth → `handle_new_user` trigger |
| **Entry points** | Signup API / Auth |
| **Attack vectors** | Mass account creation; referral-code farming |
| **Abuse** | Prepare accounts for later deposit/bonus abuse |
| **Existing** | Wallet created at **0**; referral sets affiliation **without credit** |
| **Residual** | MEDIUM (prep for payment phase) |
| **Mitigation** | Rate-limit signup; device/IP signals; no auto-credit on register |

### 2.2 Login

| | |
|--|--|
| **Assets** | Session JWT, role claims |
| **Trust boundary** | Client ↔ Supabase Auth ↔ API Bearer |
| **Entry points** | Login, token refresh |
| **Attack vectors** | Stolen JWT; weak password; session fixation |
| **Abuse** | Impersonate player/agent/admin for money APIs |
| **Existing** | Bearer verification; role gates on admin APIs |
| **Residual** | HIGH if admin JWT stolen (cashdesk mint) |
| **Mitigation** | Short TTL; MFA for admin/agent; revoke on role change; bind cashdesk to step-up auth |

### 2.3 Wallet (balance read / SoR)

| | |
|--|--|
| **Assets** | Balance display and SoR |
| **Trust boundary** | Client must not write balance; reads via RLS / server |
| **Entry points** | Snapshot APIs, UI |
| **Attack vectors** | Client-side balance spoof (display only); direct PostgREST wallet UPDATE if grants wrong |
| **Abuse** | UI deception (not money); DB write = real theft |
| **Existing** | Mutations via DEFINER RPCs; P0-A/P2.3 revoke direct apply_delta from clients |
| **Residual** | MEDIUM if RLS/grants regress |
| **Mitigation** | Continuous ACL monitoring; never trust client balance for join |

### 2.4 Deposit (current = cashdesk)

| | |
|--|--|
| **Assets** | IRR balance |
| **Trust boundary** | Admin JWT → Next API → **service_role** → `fn_wallet_apply_delta` |
| **Entry points** | `POST /api/admin/wallet/adjust` (`action=deposit`) |
| **Attack vectors** | Stolen agent JWT; bulk arbitrary `userIds`; replay POST |
| **Abuse** | Mint unlimited IRR without payment |
| **Existing** | Admin role gate; amount > 0; audit log; apply_delta FOR UPDATE |
| **Residual** | **CRITICAL** — no hierarchy on adjust; **no idempotency** |
| **Mitigation** | Hierarchy like transfer; idempotency key; maker-checker for large amounts; rate limits |

### 2.5 Deposit (future = fiat gateway) — NOT BUILT

| | |
|--|--|
| **Assets** | Invoice, pending credit, final balance |
| **Trust boundary** | Gateway → webhook API → verify → ledger → wallet |
| **Entry points** | TBD callback URL |
| **Attack vectors** | Duplicate / forged / replayed callback; wrong amount/currency; expired invoice credit |
| **Abuse** | Free balance without paid invoice |
| **Existing** | **None** (no webhook) |
| **Residual** | **CRITICAL** before go-live |
| **Mitigation** | HMAC signature; IP allowlist; invoice-bound amount/currency/user; single-use invoice; idempotent credit keyed by `gateway_payment_id`; confirm before credit; expire without credit |

### 2.6 Payment callback (future)

| | |
|--|--|
| **Assets** | Same as fiat deposit |
| **Trust boundary** | Untrusted internet → API |
| **Attack vectors** | Forged callback; unsigned body; replay; out-of-order status |
| **Existing** | N/A |
| **Residual** | CRITICAL |
| **Mitigation** | Verify signature **before** any DB write; constant-time compare; reject unknown merchants; store raw payload for audit |

### 2.7 USDT / TRON deposit (future)

| | |
|--|--|
| **Assets** | Chain TX, memo/address mapping, wallet credit |
| **Trust boundary** | Public chain → watcher/API → verify → ledger |
| **Attack vectors** | Fake TXID; wrong recipient; wrong amount/token; under-confirmed TX; address reuse collision |
| **Existing** | N/A |
| **Residual** | CRITICAL |
| **Mitigation** | Unique deposit address or memo per invoice; confirmations ≥ N; verify token contract; amount tolerance rules; never credit on mempool-only |

### 2.8 TX verification (future)

| | |
|--|--|
| **Assets** | Confirmation state |
| **Attack vectors** | Race credit before N confirms; reorg after credit |
| **Residual** | HIGH |
| **Mitigation** | State machine: seen → confirming → credited; reorg handler; no double credit |

### 2.9 Pending / confirmed / expired deposit (future)

| | |
|--|--|
| **Assets** | Invoice lifecycle |
| **Attack vectors** | Credit on expired; revive expired; confirm twice |
| **Residual** | CRITICAL |
| **Mitigation** | Strict status enum + unique constraint on credit; expiry job never credits |

### 2.10 Bonus (future / absent)

| | |
|--|--|
| **Assets** | Promotional balance |
| **Attack vectors** | Multi-account bonus farm; self-referral loops |
| **Existing** | No bonus credit path |
| **Residual** | HIGH when added |
| **Mitigation** | Separate bonus ledger bucket; wagering requirements; KYC/device limits |

### 2.11 Referral

| | |
|--|--|
| **Assets** | Affiliation graph (no money today) |
| **Attack vectors** | Fake referrals for future payout |
| **Existing** | `fn_adjust_referral_wallet` orphan + ACL-locked; signup = no credit |
| **Residual** | MEDIUM (future) |
| **Mitigation** | Never credit from client RPC; server rules + caps |

### 2.12 Join game (buy cards)

| | |
|--|--|
| **Assets** | Balance → hold; tickets |
| **Trust boundary** | Player JWT → `fn_join_or_create_room` / engine service_role join |
| **Entry points** | Client RPC; Railway `/v1/join` |
| **Attack vectors** | Join race (double buy); inflate card count; price tampering |
| **Abuse** | Free cards if hold fails after ticket insert (must be same TX) |
| **Existing** | Price from template DB; hold + ticket in DEFINER path; wallet `FOR UPDATE`; pool `SKIP LOCKED` |
| **Residual** | MEDIUM (concurrency edge cases) |
| **Mitigation** | Keep single DB transaction; idempotent join keys; monitor insufficient-funds races |

### 2.13 Tournament entry

| | |
|--|--|
| **Assets** | IRR/DING hold |
| **Trust boundary** | Player JWT → tournament hold RPCs |
| **Attack vectors** | Hold without entry; entry without hold; multi-tab double hold |
| **Existing** | Server-side amount; FOR UPDATE; release on upsert failure (client-assisted) |
| **Residual** | HIGH — multi-tab / hold-then-fail documented in Phase 4 |
| **Mitigation** | Single RPC: hold+entry atomic; idempotency `entry_hold:{id}` |

### 2.14 Refund (cancel waiting / release)

| | |
|--|--|
| **Assets** | Locked funds → balance |
| **Trust boundary** | JWT → API often **service_role** + `p_user` → release |
| **Attack vectors** | Refund another user’s ticket; double refund |
| **Existing** | Membership/ownership checks in cancel RPC (must stay enforced); release via apply_delta |
| **Residual** | HIGH if `p_user` ever unbound from auth |
| **Mitigation** | Prefer auth.uid()-only cancel; never trust client user id without proof |

### 2.15 Settlement

| | |
|--|--|
| **Assets** | Captures, wins, commissions |
| **Trust boundary** | Engine / cron (service_role) → `fn_finish_room_and_settle` |
| **Attack vectors** | Double settle; forged win rows; settle unfinished room |
| **Existing** | Room `FOR UPDATE`; status `finished` early return; `results.paid_at`; commission pending gate |
| **Residual** | MEDIUM |
| **Mitigation** | Keep settle single-writer; alert on settle errors; never client-callable settle |

### 2.16 Admin credit / adjustment

| | |
|--|--|
| **Assets** | Arbitrary mint/burn |
| **Entry points** | `/api/admin/wallet/adjust`, transfer panel |
| **Attack vectors** | Privilege abuse; agent credits self/out-of-tree; replay |
| **Existing** | Role gate; transfer has SQL hierarchy; adjust does **not** |
| **Residual** | **CRITICAL** |
| **Mitigation** | Hierarchy on adjust; dual control; immutable audit; idempotency |

### 2.17 Commission

| | |
|--|--|
| **Assets** | fee_agent / fee_super / fee_admin credits |
| **Attack vectors** | Inflate commission snapshot; redistribute twice |
| **Existing** | Snapshot at join; distribute only `pending` → `settled` |
| **Residual** | MEDIUM |
| **Mitigation** | Preserve unique ticket commission; reconcile commissions_log vs fee txs |

### 2.18 Dual-write / transfer panel

| | |
|--|--|
| **Assets** | Balance + ledger consistency |
| **Attack vectors** | Partial failure if not one transaction; replay duplicate transfer |
| **Existing** | Ordered dual-wallet locks in `fn_wallet_transfer_panel` |
| **Residual** | HIGH — bypasses apply_delta; no request idempotency |
| **Mitigation** | Route through apply_delta twice in one TX; idempotency key |

---

## 3. Cross-cutting attack themes

| Theme | Status | Severity if exploited |
|-------|--------|----------------------|
| Duplicate callback | Future | CRITICAL |
| Replay (webhook or cashdesk POST) | Present (cashdesk) / Future (webhook) | CRITICAL |
| Forged callback | Future | CRITICAL |
| Forged chain TX | Future | CRITICAL |
| Wrong amount / currency / recipient | Future | CRITICAL |
| Expired invoice credit | Future | CRITICAL |
| Duplicate deposit credit | Future + cashdesk replay | CRITICAL |
| Join race | Present (mitigated) | HIGH |
| Wallet race | Present (FOR UPDATE) | MEDIUM |
| Ledger ≠ wallet | Dual writers / ACL regress | CRITICAL |
| Bonus / referral abuse | Future | HIGH |
| Admin / privilege escalation | Present | CRITICAL |
| Service_role abuse | Present if key leaks | CRITICAL |
| API / JWT abuse | Present | HIGH–CRITICAL |
| Rate-limit gaps | Present | HIGH |
| Idempotency gaps | Present (adjust/transfer) | CRITICAL |
| Webhook auth / signature | Missing (future) | CRITICAL |
| Confirmation depth | Missing (future) | HIGH |

---

## 4. Wallet ≡ Ledger invariant — break points

| Location | How invariant breaks | Likelihood today |
|----------|----------------------|------------------|
| `fn_wallet_apply_delta` path | Unlikely if TX commits atomically | Low |
| `fn_wallet_transfer_panel` | Direct wallet UPDATE + inserts; any partial/logic bug | Medium |
| Legacy `fn_wallet_add` / deposit / withdraw / referral adjust | Direct UPDATE without apply_delta (ACL-locked orphans) | Low if ACL holds |
| `p_allow_negative=true` callers | Balance diverges from “funded” expectation | Low–Med |
| Failed settlement mid-function | Rolled back as one TX — OK; **external** double-call before `finished` | Mitigated |
| Manual DB repair / service_role ad-hoc SQL | Operator error | Process risk |
| Future deposit credit outside apply_delta | Instant CRITICAL | Must forbid |
| Ding vs IRR | Separate ledgers — do not mix projection | By design |

**Verification approach (ops, not implemented here):** periodic job  
`wallets.balance` vs `SUM(signed amounts from transactions)` per user/currency; alert on drift.

---

## 5. Data-flow (target payment architecture)

See `p6-1-payment-dataflow.md`.

---

## 6. Documents in this pack

| Doc | Contents |
|-----|----------|
| `p6-1-financial-threat-model.md` | This file |
| `p6-1-trust-boundaries.md` | Boundaries & trust decisions |
| `p6-1-payment-dataflow.md` | Diagrams current + target |
| `p6-1-risk-register.md` | Prioritized register + Top 10 |

---

P6_1_FINANCIAL_THREAT_MODEL_COMPLETE
