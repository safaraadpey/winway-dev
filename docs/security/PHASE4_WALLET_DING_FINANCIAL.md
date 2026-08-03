# Phase 4 — Wallet, Ding & Financial Security (Read-Only)

**Platform:** Ding Money (winway)  
**Phase:** 4 — Financial mutation paths, ledger integrity, concurrency & abuse  
**Date:** 2026-07-21  
**Status:** Read-only; no code, config, or data changes.

**Sources:** `winway/` (Next.js, game-engine, services), `supabase/schema.sql`, `winway/sql/migrations/`.  
**Related:** [Phase 1](./PHASE1_ARCHITECTURE_ATTACK_SURFACE_AUDIT.md) · [Phase 2](./PHASE2_SECRETS_INFRA_DEPLOYMENT.md) · [Phase 3](./PHASE3_AUTH_RLS_AUTHORIZATION.md) · [Phase 5 — Game engine](./PHASE5_GAME_ENGINE_REDIS_CONCURRENCY.md)

**Scope note:** IRR wallet truth lives in PostgreSQL (`wallets`, `transactions`, `commissions_log`). **Redis is not used as wallet ledger** (engine Redis is coordination/locks only). Ding uses `ding_balances` + `ding_transactions`.

---

## 1. Financial system of record

| Asset | Balance table | Ledger | Primary write API |
|-------|---------------|--------|-------------------|
| **Toman (IRR)** | `public.wallets` (`balance`, `locked_amount`) | `public.transactions` (+ `commissions_log` for fee splits) | `game_finance.fn_wallet_apply_delta` and specialized hold/capture/release |
| **Ding** | `public.ding_balances` | `public.ding_transactions` | Engine RPC `rpc_apply_ding_credits_for_draw`, legacy trigger path, tournament DING holds |
| **Commissions** | Credited to agent/super/admin **wallets** | `commissions_log` + commission `transactions` | `fn_record_ticket_commission` → `fn_distribute_ticket_commission` |

**Core IRR mutation primitive** (`game_finance.fn_wallet_apply_delta` in `schema.sql` ~3322):

1. `SELECT … FROM wallets … FOR UPDATE` (per user + currency)  
2. Reject `p_amount_delta = 0`; reject negative balance unless `p_allow_negative`  
3. `UPDATE wallets SET balance = balance_before + delta`  
4. `INSERT INTO transactions` with `balance_before`, `balance_after`, `status = completed`  

**Hold / capture model (room join):**

- **Hold:** `fn_wallet_apply_delta(-price)` + `locked_amount += price`  
- **Capture (settlement):** `locked_amount -= price` only (balance already debited on hold)  
- **Release (cancel):** `fn_wallet_apply_delta(+price)` + `locked_amount -= price`  

---

## 2. Catalog of financial mutation paths

### 2.1 Player — room buy-in (hold)

| Step | Detail |
|------|--------|
| **Client** | `services/rooms.ts` → `supabase.rpc('fn_join_or_create_room', { p_template_id, p_card_count, p_password })` or game-engine `/v1/join` → `fn_system_join_or_create_room` |
| **Auth** | `auth.uid()` inside `fn_join_or_create_room` / core; player status / affiliation checks (~5576+) |
| **Validation** | Template `price`, `max_cards_per_player`, password; card pool availability `FOR UPDATE SKIP LOCKED` |
| **DB** | Insert `tickets`; per ticket: `game_finance.fn_wallet_hold_join(v_user, v_price, …)` + `fn_record_ticket_commission` |
| **Ledger** | `transactions` type `join_hold`; `commissions_log` row `pending` |
| **Amount control** | **Client controls `p_card_count` only**; **price from DB template/room**, not client |

### 2.2 Player — room cancel / refund (release hold)

| Step | Detail |
|------|--------|
| **Client** | RPC `fn_cancel_waiting_room` (2-arg uses `auth.uid()`; 3-arg accepts `p_user` — see Phase 3) |
| **DB** | `fn_wallet_release_join(ticket)` → credit + unlock |
| **Ledger** | `join_refund` via `fn_wallet_apply_delta` |

### 2.3 Room settlement (buy-in capture + commission + prizes)

| Step | Detail |
|------|--------|
| **Trigger** | Heartbeat / engine when room → `settling`; `game_finance.fn_finish_room_and_settle(p_room)` |
| **Auth** | SECURITY DEFINER; callers: engine/service RPCs, internal game_core |
| **Idempotency** | If `rooms.status = finished` → **early RETURN** (no double settlement) |
| **Steps** | Lock room `FOR UPDATE`; consume tickets; `fn_wallet_capture_join` each; distribute pending commissions; pay `results` with `paid_at` null then set `paid_at` |
| **Ledger** | `win`, `fee_agent`, `fee_super`, etc. via `fn_wallet_apply_delta`; `results.reward_amount` / `paid_at` |
| **Partial failure** | Single PL/pgSQL function body → **one DB transaction** per call (rollback on exception). Risk is **duplicate invocation before** status flips to `finished`, mitigated by status gate + result `paid_at` |

### 2.4 Tournament — register (hold)

| Step | Detail |
|------|--------|
| **Client** | `TournamentRoomScreen.tsx`: `fn_tournament_wallet_hold` then `tournament_entries` upsert; rollback `fn_tournament_wallet_release` on upsert failure |
| **Auth** | `auth.uid()`; registration_open; currency match; qty ≥ 1 |
| **Validation** | `amount = ticket_price * p_qty` **computed server-side** |
| **IRR path** | `fn_wallet_apply_delta(-amount)` + `wallets.locked_amount += amount` |
| **DING path** | `ding_balances` `FOR UPDATE`; debit balance, increase `locked_amount` (no IRR transaction row for hold) |

### 2.5 Tournament — capture / payout / release

| Step | Detail |
|------|--------|
| **DB** | `fn_tournament_wallet_capture`, `fn_tournament_wallet_release`, tournament settlement migrations (`tournament.fn_wallet_capture_join`, payout RPCs in schema/migrations) |
| **Caller** | Orchestrator / admin RPCs (service role) |

### 2.6 Ding — per draw credit

| Step | Detail |
|------|--------|
| **Client UI** | **Display only:** `useBalances.creditDingOnReveal` (local optimistic, keyed by `roomId:number`) |
| **Authority** | **Engine:** `rpc_finalize_engine_draw_job` → `rpc_apply_ding_credits_for_draw` (`20250610140000_rpc_apply_ding_credits_for_draw.sql`) |
| **Auth** | `GRANT EXECUTE … TO service_role` only (finalize RPC) |
| **Idempotency** | Unique indexes on `ding_transactions` (room/draw/user); `ding_aggregated_at` on draw; `ON CONFLICT DO NOTHING` on insert |
| **Legacy** | Trigger `distribute_ding_on_draw` on draws (schema) — parallel path if still enabled in prod |

### 2.7 Admin / agent — manual deposit & withdraw (adjust)

| Step | Detail |
|------|--------|
| **Client** | Admin/agent panel → `POST /api/admin/wallet/adjust` |
| **Auth** | Bearer JWT + `getAdminContextOrThrow` (admin, super, **agent**) |
| **Validation** | `amount > 0`, action `deposit` \| `withdraw`, `userIds[]` from body |
| **DB** | **Service role** → `public.fn_wallet_apply_delta` per user (**no actor check in DB function**) |
| **Ledger** | `manual_panel`, `source_ref = adminId` |
| **Gap** | **No downline check** in API; **no idempotency key** |

### 2.8 Admin / agent / super — panel transfer (two-sided)

| Step | Detail |
|------|--------|
| **Client** | `POST /api/admin/wallet/transfer` |
| **Auth** | JWT verified once → `createUserClientFromAccessToken` → `fn_wallet_transfer_panel` |
| **Validation** | Integer amount > 0; IRR only; hierarchy **in DB** |
| **DB** | Dual wallet `FOR UPDATE` ordered by id; two `transactions` rows sharing `transfer_id` in meta |
| **Gap** | **Replay = duplicate transfer** (no idempotency) |

### 2.9 Direct PostgREST RPCs (bypass app)

| RPC | Risk |
|-----|------|
| `public.fn_wallet_apply_delta` | **anon/authenticated EXECUTE**, no caller check — **mint/debit any user** (Phase 3 CRITICAL) |
| `public.fn_adjust_wallet_manual` | Role gate in DB (admin/agent/super) but **no hierarchy** |
| `public.fn_adjust_referral_wallet` | Role gate only; **two-sided wallet UPDATE** without hierarchy — agent can **withdraw from any player wallet** to self if RPC invoked |
| `public.update_ding_balance(p_user_id, p_amount)` | **anon/authenticated GRANT**; adds to balance (invoker; RLS-bound to rows caller can touch) |
| `ding_balances` **RLS UPDATE** | Policy allows user to **UPDATE own row** with no column restriction |

### 2.10 Game engine (service role)

| Operation | Module |
|-----------|--------|
| Join / system join | `apps/engines/bingo/src/http/commands.ts` |
| Draw finalize + ding | `repositories/index.ts` → `rpc_finalize_engine_draw_job` |
| Settlement | `finance/finishRoomAndSettle` → `fn_finish_room_and_settle` |
| Wallet delta | `finance/walletApplyDelta` → `fn_wallet_apply_delta` |

### 2.11 Legacy / alternate writers (still in schema)

| Function | Pattern | Ledger quality |
|----------|---------|----------------|
| `game_finance.fn_wallet_deposit` | Read wallet → UPDATE balance → INSERT transaction | **No** `balance_before`/`after`; bypasses unified core |
| `game_finance.fn_wallet_release` | UPDATE balance + locked; INSERT refund | Same |
| `fn_adjust_referral_wallet` | Manual two-wallet UPDATE + INSERT | Uses `source_factory` column (typo vs `source_kind`?) — verify live schema |

### 2.12 Read-only / display paths (no mutation)

- `GET /api/me/ding-balance` — JWT + service read own row  
- `useBalances` / `useWalletBalances` — Supabase SELECT on `wallets`, `ding_balances`; Realtime subscriptions  
- Admin reports — read `transactions`, `commissions_log`, tournament snapshots  

---

## 3. End-to-end flow template (reference)

```
CLIENT (PWA / panel / engine worker)
  → Transport (Bearer JWT / service_role / PostgREST)
    → AUTHORIZATION (route role, auth.uid(), or MISSING)
      → VALIDATION (amount, currency, state machine, template price)
        → DATABASE (FOR UPDATE wallets; SECURITY DEFINER RPC)
          → BALANCE MUTATION (wallets.balance / locked_amount or ding_balances)
            → LEDGER (transactions / ding_transactions / commissions_log)
              → RESPONSE (tx id / ok / error)
```

**Redis:** not on this path for balances.

---

## 4. Investigation checklist (answers)

| # | Question | Finding |
|---|----------|---------|
| 1 | Client controls amount? | **Room/tournament ticket money:** mostly **no** (server price × qty). **Adjust API / direct RPC:** **yes**. **Ding RPC payload:** engine computes credits; client optimistic ding is display-only. |
| 2 | Negative amounts? | Core rejects `p_amount_delta = 0`; hold functions reject `p_amount < 0`. Adjust API rejects `amount <= 0`. **Direct RPC** can pass negative delta (credit or forced debit with `p_allow_negative`). |
| 3 | Zero / huge / decimal / NaN? | DB `numeric`; API adjust: `amount <= 0` but **no integer cap** (transfer route requires integer). JS adjust: `Infinity` may pass validation. Tournament DING requires integer amount. |
| 4 | user_id / wallet_id tampering? | Join/tournament hold bind **auth.uid()**. Adjust/transfer accept **target userIds** (intended for panel). **fn_wallet_apply_delta** accepts arbitrary `p_user_id`. Wallet id not used client-side for writes. |
| 5 | Same request twice? | **Adjust / transfer / manual RPC:** **yes**, duplicate money. Settlement: **mostly no** (finished gate + paid_at). Ding draw: **mostly no** (unique indexes + ding_aggregated_at). |
| 6 | Idempotent? | **Partial:** commission log dedupe by ticket; distribute returns 0 if not pending; settlement skip if finished; ding batch ON CONFLICT; optional `transactions.idempotency_key` index **if key set** — **most RPCs do not set it**. |
| 7 | Concurrent double spend? | Wallet row **`FOR UPDATE`** in apply_delta/hold/transfer reduces parallel overdraft on **same wallet**. **Parallel joins** still serialize on wallet lock; **two devices** can race separate operations (e.g. double adjust requests). |
| 8 | Atomic balance updates? | **apply_delta, transfer_panel, tournament hold (ding/IRR)** use row locks in one function transaction. **Legacy fn_wallet_deposit** uses UPDATE without going through single core (still one function). |
| 9 | Ledger? | **Yes:** `transactions` append-style; `ding_transactions`; `commissions_log`. |
| 10 | Balance vs ledger desync? | Possible via **legacy deposit/release**, **direct ding_balances UPDATE (RLS)**, or **apply_delta failure after partial legacy path**. Reconciliation = sum(transactions) vs wallets (ops task). |
| 11 | Modify/delete transactions? | RLS: **no authenticated UPDATE/DELETE** policies on `transactions` (insert service_role only). Janitor **DELETE** on old ding_transactions (maintenance function). |
| 12 | Withdraw/deposit status manipulation? | Inserts use **`completed`** immediately; **no** player-facing pending withdrawal state in core path reviewed. |
| 13 | Partial settlement? | Unlikely within single `fn_finish_room_and_settle` call; **risk** if room stuck in `settling` and retried with different code version. |
| 14 | Replay creates money? | **Yes** for adjust, transfer replay, **fn_wallet_apply_delta**, **ding balance UPDATE/RPC**. **No** for finished room + ding aggregate locks (under normal engine path). |
| 15 | Multi-tab race? | **Tournament:** double hold possible if both tabs submit before entry upsert; **join:** wallet lock serializes; **adjust:** duplicate POSTs duplicate credit. |
| 16 | Disconnect / reconnect settlement? | Settlement is **server-driven**; client `scheduleWalletBalanceSync` polls wallet — **does not** trigger payout. Duplicate settlement guarded by room status. |
| 17 | Agent/super mint unauthorized value? | **Transfer panel:** actor funds or hierarchy-limited target withdraw. **Adjust API + apply_delta RPC:** can credit **any** user without hierarchy. **fn_adjust_referral_wallet withdraw:** can pull from **any** player to agent wallet via RPC. **Cannot** create IRR without debiting someone except **apply_delta mint**. |
| 18 | Privileged adjustments server-authorized? | **Transfer:** strong (JWT + DB hierarchy). **Adjust:** JWT role only + **service role RPC**. **PostgREST RPCs:** weak. |

---

## 5. Anti-patterns searched

| Pattern | Present? | Where |
|---------|----------|--------|
| Read balance → compute → write **without** lock | **Legacy** `fn_wallet_deposit`, parts of `fn_adjust_referral_wallet` (uses FOR UPDATE on wallets — OK) | schema ~3511+, ~4377+ |
| Client-side balance truth | **Ding UI only** (re-sync via API); Toman uses wallet SELECT | `useBalances.ts` |
| Service role after weak JWT | **Adjust route** | `wallet/adjust/route.ts` |
| SECURITY DEFINER without caller binding | **fn_wallet_apply_delta** | public wrapper |

---

## 6. Findings (with attack scenarios)

| ID | Severity | Class | Attack scenario | Location | Access | Impact |
|----|----------|-------|-----------------|----------|--------|--------|
| F4-CRIT-1 | **CRITICAL** | Balance manipulation | Attacker calls `fn_wallet_apply_delta` with victim id and large positive `p_amount_delta` | PostgREST / Supabase JS | anon or authenticated | Unlimited IRR credit |
| F4-CRIT-2 | **CRITICAL** | Ding manipulation | Player `UPDATE ding_balances SET balance = 1e9 WHERE user_id = auth.uid()` via Supabase client (RLS permits UPDATE own row) | Table RLS | authenticated | Inflate Ding; spend in DING tournaments |
| F4-CRIT-3 | **CRITICAL** | Ding manipulation | Call `update_ding_balance(auth.uid(), huge_amount)` via RPC | `schema.sql` GRANT anon/auth | authenticated | Same as above if RLS allows |
| F4-HIGH-1 | **HIGH** | Privilege / debit | Agent invokes `fn_adjust_referral_wallet(target=player, type=withdraw, amount=X)` to pull player IRR to agent | RPC | agent JWT | Drain player without hierarchy |
| F4-HIGH-2 | **HIGH** | Privilege / credit | Agent uses `POST /api/admin/wallet/adjust` with arbitrary `userIds` (service RPC) | `wallet/adjust/route.ts` | agent Bearer | Credit/debit any user |
| F4-HIGH-3 | **HIGH** | Replay | Replay successful `wallet/adjust` or `fn_adjust_wallet_manual` request | API / RPC | agent+ | Duplicate manual credits |
| F4-HIGH-4 | **HIGH** | Replay | Double-click transfer: two `fn_wallet_transfer_panel` calls | `/api/admin/wallet/transfer` | agent/super/admin | Double transfer if actor has balance |
| F4-MED-1 | **MEDIUM** | Race | Two tabs tournament register: two holds before entry row consistent | `TournamentRoomScreen.tsx` + hold RPC | player | Double lock / inconsistent entry vs hold |
| F4-MED-2 | **MEDIUM** | Ledger desync | Legacy `fn_wallet_deposit` updates wallet without full apply_delta invariants | DB function | service/definer callers | Audit trail gaps |
| F4-MED-3 | **MEDIUM** | Display vs truth | User trusts optimistic Ding from `creditDingOnReveal` after reconnect before API sync | Client | player | UX mismatch only (not minting) |
| F4-MED-4 | **MEDIUM** | Input validation | `wallet/adjust` accepts non-integer huge `amount` (no upper bound) | API | admin/agent | Large ledger entries / overflow edge cases |
| F4-MED-5 | **MEDIUM** | Settlement | Engine requeues stale draw jobs; settlement idempotent on room — **verify** lease epoch fencing prevents double finalize | migrations `20260720120000_*` | service | Potential duplicate ding if locks fail |
| F4-LOW-1 | **LOW** | Idempotency | `idempotency_key` on transactions unused by panel/adjust | `ux_tx_idempotency` | — | Operational replay risk only |

---

## 7. Double-spend / replay / race summary matrix

| Operation | Double-spend | Replay | Race notes |
|-----------|--------------|--------|------------|
| Room join hold | Low (wallet FOR UPDATE) | New tickets each call | Card SKIP LOCKED |
| Room settlement | Low (finished + paid_at) | Re-call no-op if finished | Room row locked |
| Tournament hold | Medium | Release on failed upsert | Parallel tabs |
| Panel adjust | **High** | **No idempotency** | Parallel POSTs |
| Panel transfer | Medium | **No idempotency** | DB locks per transfer |
| apply_delta RPC | **High** | Each call moves money | N/A |
| Ding draw credit | Low | ding_aggregated_at + UNIQUE | Engine service only |
| Ding client UPDATE | **High** | N/A | Direct balance set |

---

## 8. Recommendations for Phase 5 (investigation only)

1. Live test: PostgREST policies on `ding_balances` UPDATE (column-level / revoke client UPDATE).  
2. Confirm whether `fn_adjust_referral_wallet` / `fn_adjust_wallet_manual` are exposed in production API docs.  
3. Reconcile one wallet: `wallets.balance` vs last `transactions.balance_after`.  
4. Trace tournament capture/release for DING vs IRR locked_amount invariants.  
5. Map all callers of `game_finance.fn_wallet_deposit` / `fn_wallet_release`.  
6. Verify engine-only EXECUTE on `rpc_finalize_engine_draw_job` in production grants.  
7. Add business review: should agents use **transfer-only** (deprecate adjust service path)?  

---

## Appendix A — Key files

| Path | Role |
|------|------|
| `supabase/schema.sql` | `game_finance.*`, `fn_join_or_create_room`, tournament wallet RPCs |
| `sql/migrations/20250127144614_finance_core_wallet_apply_delta.sql` | Core design notes |
| `sql/migrations/20250610140000_rpc_apply_ding_credits_for_draw.sql` | Ding batch credit |
| `app/api/admin/wallet/adjust/route.ts` | Service-role adjust |
| `app/api/admin/wallet/transfer/route.ts` | User-scoped transfer |
| `apps/engines/bingo/src/finance/index.ts` | Engine ledger adapter |
| `services/rooms.ts` | Player join RPC |
| `src/screens/TournamentRoomScreen.tsx` | Hold + entry upsert |
| `lib/hooks/useBalances.ts` | Balances + optimistic Ding |

---

## Appendix B — Transaction types (representative)

From schema usage: `deposit`, `withdraw`, `join_hold`, `join_refund`, `win`, `fee_agent`, `fee_super`, `transfer_in`, `transfer_out`, tournament-related types in migrations, `manual_panel` source kinds.

**Commission lifecycle:** `commissions_log.status`: `pending` → distributed via `fn_distribute_ticket_commission` (skips if not pending).

---

*End of Phase 4 report.*
