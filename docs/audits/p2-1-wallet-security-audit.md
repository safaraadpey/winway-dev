# P2.1 — Wallet Security Audit (Read-Only)

> **Date:** 2026-08-02  
> **Project:** `yqnptpreowkimopxicfz` (`winway_dev`)  
> **Mode:** Read-only (no SQL / ACL / migrations / app / Railway / cron / trigger / RLS / commit / push)  
> **Prior:** P1.7 → P2.0 Batch 2  
> **Companion CSV:** [`p2-1-wallet-security-audit.csv`](./p2-1-wallet-security-audit.csv)

---

## Status

```
P2_1_WALLET_SECURITY_AUDIT_COMPLETE
```

---

## Executive summary

| Class | Count (mutation-relevant) |
|-------|--------------------------:|
| **UNSAFE** | **13** |
| **HYBRID** | **4** |
| **CLIENT** | **6** |
| **SERVER** | **42** |
| **SAFE** | **3** |
| **Total catalogued** | **68** |

**Critical finding:** `public.fn_wallet_apply_delta` and `game_finance.fn_wallet_apply_delta` are **SECURITY DEFINER balance mutators with no `auth.uid` / role checks**. Anyone who can `EXECUTE` them can credit/debit any user. Public wrapper still grants **PUBLIC + anon + authenticated**.

**Good news for remediation:** Nearly all product paths call `apply_delta` **nested inside other DEFINER functions** (owner `postgres`). Tightening `apply_delta` to **postgres + service_role** should preserve join/settle/tournament/nested paths while cutting direct PostgREST abuse — **except** confirm no authenticated client still calls `apply_delta` directly (today: Admin adjust + Railway use **service_role** only).

---

## Seed functions

| Seed | Schema | Role |
|------|--------|------|
| `fn_wallet_apply_delta` | `public` (thin wrapper) + `game_finance` (SoR) | Core ledger primitive |
| `fn_adjust_wallet_manual` | `public` | Legacy admin adjust → calls `apply_delta` (P2.0 ACL-locked; **no live TS caller**) |
| `fn_adjust_referral_wallet` | `public` | Legacy referral adjust; **direct wallet UPDATE** (no `apply_delta`); P2.0 ACL-locked; **no live TS caller** |

---

## Complete dependency graph

### A. Core ledger

```
public.fn_wallet_apply_delta
  └── SELECT game_finance.fn_wallet_apply_delta(...)
        ├── LOCK/UPSERT public.wallets (FOR UPDATE)
        └── INSERT public.transactions (before/after balance)
```

**No AuthZ inside `apply_delta`.** Trust boundary = **who can EXECUTE** + outer DEFINER parents.

### B. Who calls `fn_wallet_apply_delta` (SQL nested)

```
public.fn_adjust_wallet_manual
game_finance.fn_wallet_hold_join (5-arg)
game_finance.fn_wallet_release_join (5-arg)
game_finance.fn_distribute_ticket_commission
game_finance.fn_finish_room_and_settle
public.fn_tournament_wallet_hold
public.fn_tournament_wallet_release
tournament.fn_wallet_capture_join
tournament.fn_payout_tournament
tournament.fn_settle_commission_payouts
tournament.fn_admin_refund_cancelled_tournament
(+ legacy shims that route through settle)
```

### C. Join / cancel money path

```
BROWSER  services/rooms.ts
  → public.fn_join_or_create_room (JWT)
    → game_core.fn_join_or_create_room_core
      → game_finance.fn_wallet_hold_join → apply_delta
      → game_finance.fn_record_ticket_commission

RAILWAY  fn_system_join_or_create_room (service_role)
  → same hold + commission nests

API  /api/player/cancel-waiting-room (service_role)
  → public.fn_cancel_waiting_room*
    → game_core cancel helpers
      → game_finance.fn_wallet_release_join → apply_delta

CRON/RAILWAY janitor
  → game_core.fn_janitor_sweep / repair
    → release_join and/or finish_room_and_settle
```

### D. Settlement / payout path

```
RAILWAY settleRoom / evaluate / reconcile / janitor
  → public|game_finance.fn_finish_room_and_settle (service_role)
      → capture_join, distribute_ticket_commission, apply_delta (wins)

Also nested from:
  public.fn_evaluate_room_after_draw
  public.fn_payout_room_if_full / game_finance payout shims
  game_core.fn_payout_room
```

### E. Tournament money path

```
BROWSER TournamentRoomScreen
  → public.fn_tournament_wallet_hold / release (JWT)
      → apply_delta (+ ding/locks as applicable)

RAILWAY tournament ticks
  → tournament.fn_payout_tournament → apply_delta
  → tournament.fn_settle_commission_payouts → apply_delta

Admin (SQL only today)
  → tournament.fn_admin_refund_cancelled_tournament → apply_delta
```

### F. Admin panel money path

```
BROWSER services/transactions.ts
  → API /api/admin/wallet/adjust (service_role)
      → public.fn_wallet_apply_delta          ★ no SQL AuthZ
  → API /api/admin/wallet/transfer (user JWT)
      → public.fn_wallet_transfer_panel       ★ AuthZ admin|super|agent + hierarchy
        (direct wallets/transactions UPDATE — does NOT call apply_delta)
```

### G. Ding credits (parallel ledger)

```
RAILWAY rpc_finalize_engine_draw_job / rpc_apply_ding_credits_for_draw
  → ding_balances / ding_transactions

Legacy (ACL locked P1.12):
  distribute_ding_on_draw → update_ding_balance
```

### H. Dual-write / legacy wallet helpers (bypass apply_delta)

```
game_finance.fn_wallet_add / subtract / deposit / withdraw
  → direct UPDATE wallets + INSERT transactions
  (broad or PUBLIC-ish ACL; no live TS callers)

public.fn_adjust_referral_wallet
  → direct wallet/tx mutation (staff AuthZ in SQL)

public.fn_wallet_transfer_panel[_bulk]
  → direct wallet/tx mutation (staff AuthZ in SQL for live 5-arg + bulk)
```

---

## Complete caller graph (live application)

| Function | Browser | API | Railway | Trigger | Cron | Nested SQL |
|----------|---------|-----|---------|---------|------|------------|
| `public.fn_wallet_apply_delta` | — | **adjust** (service_role) | adapter (via settle mostly) | — | — | many DEFINER parents |
| `game_finance.fn_wallet_apply_delta` | — | via public wrapper | via public wrapper | — | — | same |
| `fn_adjust_wallet_manual` | — | — | — | — | — | orphan (calls apply_delta) |
| `fn_adjust_referral_wallet` | — | — | — | — | — | orphan |
| `fn_wallet_transfer_panel` 5-arg | — | **transfer** (JWT) | — | — | — | — |
| `fn_wallet_transfer_panel` legacy | — | — | — | — | — | → bulk |
| `fn_wallet_transfer_panel_bulk` | — | — | — | — | — | from legacy |
| `fn_tournament_wallet_hold/release` | **TournamentRoomScreen** | — | — | — | — | → apply_delta |
| `fn_join_or_create_room` | **services/rooms.ts** | — | — | — | — | → hold/commission |
| `fn_system_join_or_create_room` | — | — | **commands** | — | — | → hold/commission |
| `fn_cancel_waiting_room*` | — | **cancel-waiting-room** | — | — | — | → release |
| `fn_finish_room_and_settle` | — | — | **settleRoom** + nested | — | via janitor | evaluate/payout/janitor |
| `fn_record/distribute_ticket_commission` | — | — | nested in settle/join | — | — | settle/join |
| `rpc_apply_ding_credits_for_draw` | — | — | **ding domain** + finalize | — | — | finalize |
| `update_ding_balance` / `distribute_ding_on_draw` | — | — | — | legacy path | — | locked ACL |
| `set_wallets_updated_at` | — | — | — | **wallets BEFORE UPDATE** | — | stamp only |
| `trg_te_commission_snapshot` | — | — | — | tournament entry | — | snapshot (not balance) |

---

## Authorization analysis

| Pattern | Used by |
|---------|---------|
| **none** (EXECUTE = trust) | `fn_wallet_apply_delta` (both), most `game_finance.fn_wallet_*` primitives, settle/payout shims, ding apply |
| **auth.uid + staff roles** | `fn_wallet_transfer_panel` 5-arg, bulk, `fn_adjust_*`, tournament admin refund |
| **auth.uid + ownership** | `fn_tournament_wallet_hold/release` (actor must own entry / be registrant) |
| **auth.uid (join actor)** | `fn_join_or_create_room` path (player JWT) |
| **service_role at API/engine** | adjust, cancel-waiting, all Railway settle/ding/system-join |
| **RLS** | Protects **direct table** SELECT/UPDATE for clients; **bypassed by SECURITY DEFINER** wallet RPCs |

**RLS note:** `wallets` / `transactions` have owner/hierarchy SELECT and service UPDATE policies. They do **not** authorize DEFINER RPCs — DEFINER runs as owner and writes regardless of RLS (unless `FORCE ROW LEVEL SECURITY`, not observed here).

---

## Who is legitimately allowed (intent)

| Mutation | Player | Admin | Super | Agent | Railway | Cron | Trigger | Internal SQL |
|----------|:------:|:-----:|:-----:|:-----:|:-------:|:----:|:-------:|:------------:|
| `apply_delta` (primitive) | ✗ direct | via API service | via API | ✗ direct | ✓ | via janitor parents | ✗ | ✓ nested |
| Admin adjust (API→apply_delta) | ✗ | ✓ | ✓ | ✓* | ✗ | ✗ | ✗ | ✗ |
| Transfer panel | ✗ | ✓ | ✓ | ✓ (hierarchy) | ✗ | ✗ | ✗ | ✗ |
| Join hold | ✓ (self) | ✗ | ✗ | ✗ | ✓ system-join | ✗ | ✗ | ✓ |
| Cancel release | ✓ (self via API) | ✓ flag | — | — | ✓ | ✓ janitor | ✗ | ✓ |
| Settle / commission distribute | ✗ | ✗ | ✗ | ✗ | ✓ | ✓ | ✗ | ✓ |
| Tournament hold/release | ✓ (own entry) | ✗ | ✗ | ✗ | ticks | — | ✗ | ✓ |
| Tournament payout/commission | ✗ | ✗ | ✗ | ✗ | ✓ ticks | — | ✗ | ✓ |
| Ding credits | ✗ | ✗ | ✗ | ✗ | ✓ | — | legacy | ✓ |
| Adjust manual/referral RPCs | ✗ | ✓* | ✓* | ✓* | ✗ | ✗ | ✗ | orphan |

\*API/role gates vary; adjust uses service_role after Next auth (admin/super/agent per route).

---

## Risk classification (definitions)

| Class | Meaning |
|-------|---------|
| **SAFE** | ACL already service/postgres-only **and** no residual direct-client need **and** not a raw unauthenticated mutator exposed to anon |
| **CLIENT** | Browser/JWT product still needs `authenticated` EXECUTE |
| **SERVER** | Intended service_role / Railway / cron / nested-only |
| **HYBRID** | Productive browser **and** server paths, or dual public+schema entry |
| **UNSAFE** | Balance/ledger mutation with **weak/no SQL AuthZ** and **anon or PUBLIC EXECUTE** (or equivalent exposure) |

---

## Critical findings

1. **`fn_wallet_apply_delta` (public + game_finance) — CRITICAL UNSAFE**  
   No actor check; public ACL includes anon/authenticated; any authenticated user who discovers the RPC can mint/burn funds unless stopped at PostgREST.

2. **Admin adjust trusts service_role only**  
   Route checks admin session, then calls `apply_delta` as service_role — correct pattern, but DB itself would accept any service_role caller with any `p_user_id`.

3. **Parallel mutators bypass `apply_delta`**  
   Transfer panel, referral adjust, and legacy `fn_wallet_add/deposit/withdraw/subtract` write wallets/transactions directly → dual code paths, harder audit.

4. **Tournament hold/release remain CLIENT**  
   Browser JWT; must keep `authenticated` on those entrypoints if ACL-hardening nested primitives.

5. **Join still browser CLIENT** (`fn_join_or_create_room`)  
   Nested hold uses DEFINER → nested `apply_delta` ACL can still be locked.

6. **P2.0 already locked** `fn_adjust_wallet_manual` / `fn_adjust_referral_wallet` to postgres+service_role (orphans) — good; do not re-open.

7. **Many `game_finance.fn_wallet_*` still show PUBLIC in `proacl`** (`anon_x=true` via PUBLIC) even when grant list looks “service-ish” — treat as **UNSAFE/SERVER candidates** for PUBLIC revoke.

---

## ACL recommendations (do NOT apply)

| Recommendation | Functions |
|----------------|-----------|
| **service_role only** (also grant postgres) | `public.fn_wallet_apply_delta`, `game_finance.fn_wallet_apply_delta`, `fn_wallet_add/subtract/deposit/withdraw/capture*/release*/hold*` (non-entry), commission distribute/record (already mostly locked), settle wrappers already locked — **revoke PUBLIC/anon/authenticated** where still present |
| **keep current ACL** | `fn_wallet_transfer_panel` 5-arg (needs authenticated JWT), `fn_tournament_wallet_hold/release`, `fn_join_or_create_room`, live cancel overloads until reviewed |
| **revoke PUBLIC** (minimum) | Any game_finance wallet helper still showing `=X/postgres` |
| **revoke anon** | Same set; transfer panel 5-arg (soft — keep authenticated) |
| **revoke authenticated** | Only after confirming no JWT callers — **apply_delta**, legacy wallet helpers, orphan adjust (already done), payout shims |
| **postgres only** | Trigger stamps (`set_wallets_updated_at`) if safe for trigger owner |

### Dependency safety of locking `apply_delta` → postgres+service_role

| Flow | Break? | Why |
|------|--------|-----|
| Settlement / room settle | **No** | DEFINER parents + Railway service_role |
| Tournament settlement/payout | **No** | Nested DEFINER / service ticks |
| Ticket purchase (join hold) | **No** | Nested from DEFINER join core |
| Ding credits | **N/A** | Separate RPCs (already service-locked) |
| Referral commission distribute | **No** | Nested in settle DEFINER |
| Manual admin adjust | **No** | API uses service_role |
| Transfer panel | **N/A** | Does not call apply_delta |
| Reconciliation / janitor | **No** | service_role / DEFINER |
| Tournament browser hold/release | **No** (nested) | Outer DEFINER → postgres EXECUTE on child |
| **Direct PostgREST apply_delta by player** | **Yes (desired)** | Should fail 42501 |

---

## Proposed remediation order

1. **P2.2 ACL:** Lock `public.fn_wallet_apply_delta` + `game_finance.fn_wallet_apply_delta` to `{postgres, service_role}` (highest ROI).  
2. **Revoke PUBLIC** on remaining `game_finance.fn_wallet_*` helpers that still expose PUBLIC.  
3. **Deprecate/lock** legacy `fn_wallet_add/deposit/withdraw/subtract` (no TS callers).  
4. **Soft:** revoke anon (keep authenticated) on `fn_wallet_transfer_panel` 5-arg.  
5. **Product:** migrate tournament hold/release and join behind Next API if CLIENT surface must shrink further.  
6. **Longer-term:** force all balance writes through `apply_delta` only (eliminate transfer/referral direct UPDATEs) + optional SQL AuthZ on apply_delta for non-service callers.  
7. Do **not** lock transfer 5-arg authenticated until API switches to service_role **or** remains JWT-by-design.

---

## Per-function summary table

See CSV for full rows. Highlights:

| Function | Class | AuthZ | Allowed actors (intent) | ACL rec |
|----------|-------|-------|-------------------------|---------|
| `public.fn_wallet_apply_delta` | **UNSAFE** | none | Railway/API service; nested SQL | **service_role only** |
| `game_finance.fn_wallet_apply_delta` | **UNSAFE** | none | nested + service | **service_role only** |
| `fn_adjust_wallet_manual` | SERVER | staff roles | orphan / service | keep (P2.0 locked) |
| `fn_adjust_referral_wallet` | SERVER | staff roles | orphan | keep (P2.0 locked) |
| `fn_wallet_transfer_panel` 5-arg | SERVER* | staff+hierarchy | Admin API JWT | revoke PUBLIC/anon; **keep authenticated** |
| `fn_wallet_transfer_panel` legacy | UNSAFE/SERVER | none (shim) | none live | service_role only |
| `fn_wallet_transfer_panel_bulk` | SERVER | staff | unused TS | revoke PUBLIC/anon |
| `fn_tournament_wallet_hold/release` | **CLIENT** | uid/ownership | Player | keep current |
| `fn_join_or_create_room` | **CLIENT** | uid | Player | keep current |
| `fn_system_join_or_create_room` | **HYBRID**/SERVER | system | Railway (+ broad ACL) | revoke PUBLIC/anon |
| `fn_finish_room_and_settle` | **SAFE**/SERVER | none | Railway | keep locked |
| `fn_wallet_hold_join` / `release_join` | SERVER | none | nested | revoke PUBLIC |
| `fn_wallet_add/deposit/withdraw/subtract` | **UNSAFE** | none | none live | service_role only |
| `rpc_apply_ding_credits_for_draw` | SAFE/SERVER | none | Railway | keep locked |
| `update_ding_balance` | SAFE/SERVER | none | legacy | keep locked |

\*Classed SERVER because no browser `.rpc`; still requires authenticated EXECUTE for API JWT.

---

## Final status

**P2_1_WALLET_SECURITY_AUDIT_COMPLETE**
