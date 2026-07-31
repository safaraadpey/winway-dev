# P1.11 — UNSAFE RPC Remediation Plan (Read Only)

> **Date:** 2026-07-31  
> **Project:** `yqnptpreowkimopxicfz` (`winway_dev`)  
> **Mode:** Read-only (no migrations, ACL/SQL/code changes, no commit/push)  
> **Source:** P1.10 `UNSAFE_RPC` set (15) + repository + live catalog evidence  
> **Companion CSV:** [`p1-11-unsafe-rpc-remediation.csv`](./p1-11-unsafe-rpc-remediation.csv)

---

## Status

```
P1_11_REMEDIATION_PLAN_COMPLETE
```

- Database / ACL / application changes this phase: **none**
- Scope: **15** UNSAFE_RPC only (CLIENT / SERVER / HYBRID ignored except as nested references)

---

## Final summary

| # | Metric | Count |
|---|--------|------:|
| 1 | Total UNSAFE reviewed | **15** |
| 2 | SQL authorization fixes required | **3** (public admin tournament wrappers) |
| 3 | API migration required | **3** (same admin wrappers — preferred long-term path) |
| 4 | ACL reductions required | **12** (shims, ding, debug, backfill, capture, dead trigger fn) |
| 5 | Legacy removals (candidate) | **6** (confirm_win, payout shims, distribute_ding_on_draw, optional delete after validation) |
| 6 | Batch 1 blocked | **3** (admin create/update/delete public wrappers — browser JWT) |
| 7 | Batch 1 ready | **12** (ACL-lock to postgres+service_role with evidence of no authenticated product need) |

**Estimated sequencing:** lock Batch1-ready shims/debug/ding/backfill first; remediate admin wrappers via API move or wrapper auth before touching their ACL; delete dead ding trigger function only after confirming no recreate migrations.

---

## Methodology

1. Took the exact 15 `UNSAFE_RPC` rows from `p1-10-application-trust-boundary.csv`.
2. Re-read live `pg_get_functiondef` heads + ACL for each.
3. Ripgrep for `.rpc(` / SQL `PERFORM` / triggers / docs.
4. Classified root cause / fix / risk / Batch1 using **repository + catalog evidence only**.

### Root-cause legend

| Code | Meaning |
|------|---------|
| A | Missing SQL authorization |
| B | Browser should never call this function |
| C | Wrapper bypasses authorization |
| D | Legacy function |
| E | ACL too broad |
| F | Dead code |

### Remediation legend

| Code | Meaning |
|------|---------|
| 1 | Add SQL authorization |
| 2 | Move invocation to server API |
| 3 | Reduce ACL |
| 4 | Replace wrapper |
| 5 | Delete after validation |
| 6 | Split into client/server variants |

---

## Per-function remediation

### 1. `game_core.fn_confirm_win(p_room_id uuid, p_ticket_id uuid, p_type text)`

| Field | Value |
|-------|--------|
| Mode | INVOKER |
| ACL | PUBLIC, anon, authenticated, postgres, service_role |
| Callers | **SQL only** (body may `PERFORM public.fn_payout_room`); **no** browser/API/Railway/cron/trigger `.rpc` |
| Authorization | **nowhere** (no `auth.uid` / role / admin checks) |
| Root cause | **D** Legacy function — soft shim inserts into `results` then may settle; superseded by engine evaluate/settle |
| Recommended fix | **3** Reduce ACL (postgres+service_role), then **5** delete after validation |
| Risk | **CRITICAL** — any client with EXECUTE can insert win rows / trigger settle path |
| Batch1 Ready | **YES** — no product `.rpc` callers |
| Confidence | HIGH |

---

### 2. `game_core.fn_payout_room(p_room uuid)`

| Field | Value |
|-------|--------|
| Mode | DEFINER |
| ACL | PUBLIC + anon + authenticated + postgres + service_role |
| Callers | SQL nested from `fn_confirm_win`; no TS `.rpc` |
| Authorization | **nowhere** — body is `PERFORM game_finance.fn_finish_room_and_settle(p_room)` (Batch 0 locked settle) |
| Root cause | **D** Legacy settle alias |
| Recommended fix | **3** Reduce ACL |
| Risk | **CRITICAL** — DEFINER settle entry still client-executable |
| Batch1 Ready | **YES** |
| Confidence | HIGH |

---

### 3. `game_finance.fn_payout_room_prize(p_room uuid)`

| Field | Value |
|-------|--------|
| Mode | DEFINER |
| ACL | PUBLIC, postgres, service_role (PUBLIC ⇒ effective client EXECUTE) |
| Callers | No TS `.rpc`; SQL legacy / docs only. Listed in unapplied/partial P0-A lock list `sql/migrations/20260721160000_p0a_lock_financial_ding_client_access.sql` |
| Authorization | **nowhere** — delegates to `fn_finish_room_and_settle` |
| Root cause | **D** Legacy |
| Recommended fix | **3** Reduce ACL |
| Risk | **CRITICAL** |
| Batch1 Ready | **YES** |
| Confidence | HIGH |

---

### 4. `game_finance.fn_payout_winners(p_room uuid)`

| Field | Value |
|-------|--------|
| Mode | DEFINER |
| ACL | PUBLIC, postgres, service_role |
| Callers | Same pattern as prize shim; no TS `.rpc` |
| Authorization | **nowhere** |
| Root cause | **D** Legacy |
| Recommended fix | **3** Reduce ACL |
| Risk | **CRITICAL** |
| Batch1 Ready | **YES** |
| Confidence | HIGH |

---

### 5. `public.fn_payout_room_if_full(p_room_id uuid)`

| Field | Value |
|-------|--------|
| Mode | DEFINER |
| ACL | PUBLIC + anon + authenticated + postgres + service_role |
| Callers | Docs/migration comments (`optimization_guide_*`); **no** live TS `.rpc`. Body: `PERFORM game_finance.fn_finish_room_and_settle` |
| Authorization | **nowhere** |
| Root cause | **D** Legacy |
| Recommended fix | **3** Reduce ACL |
| Risk | **CRITICAL** |
| Batch1 Ready | **YES** |
| Confidence | HIGH |

---

### 6. `public.distribute_ding_on_draw()`

| Field | Value |
|-------|--------|
| Mode | INVOKER (returns trigger) |
| ACL | PUBLIC + anon + authenticated + postgres + service_role |
| Callers | Function body `PERFORM update_ding_balance(...)` (`sql/migrations/20251208131500_update_ding_trigger.sql`). Live catalog: **zero** non-internal triggers attach this function |
| Authorization | **nowhere** |
| Root cause | **F** Dead code — trigger function with no attached trigger |
| Recommended fix | **5** Delete after validation (confirm no recreate job); interim **3** Reduce ACL |
| Risk | **MEDIUM** (orphaned; still callable as plain function if mistyped, and documents a legacy ding path) |
| Batch1 Ready | **YES** (ACL reduce safe; delete is separate validation) |
| Confidence | HIGH |

---

### 7. `public.update_ding_balance(p_user_id uuid, p_amount numeric)`

| Field | Value |
|-------|--------|
| Mode | INVOKER |
| ACL | PUBLIC + anon + authenticated + postgres + service_role |
| Callers | Nested from `distribute_ding_on_draw` SQL; **no** app `.rpc`. Security docs (`DING_MONEY_*`) mark as CRITICAL. P0-A migration **intends** service_role-only lock but **live ACL still broad** on DEV |
| Authorization | **nowhere** in SQL; INVOKER relies on table RLS (historically own-row UPDATE was the exploit class) |
| Root cause | **E** ACL too broad (+ missing SQL auth) |
| Recommended fix | **3** Reduce ACL to postgres+service_role (align with P0-A intent) |
| Risk | **CRITICAL** — arbitrary ding credit if table policies allow |
| Batch1 Ready | **YES** — no product `.rpc`; nested callers need postgres/DEFINER owner EXECUTE retained |
| Confidence | HIGH |

---

### 8. `public.rpc_backfill_missed_engine_ding(p_room_id uuid)`

| Field | Value |
|-------|--------|
| Mode | DEFINER |
| ACL | anon, authenticated, postgres, service_role (PUBLIC revoked in migration text, but client roles still granted) |
| Callers | **No** TS `.rpc`. Migrations `supabase/migrations/20260615130100_*` / `20260615130200_*` grant **service_role** and revoke PUBLIC — live still allows anon/authenticated |
| Authorization | **nowhere** — credits ding for processed draws |
| Root cause | **E** ACL too broad (drift from intended service_role-only) |
| Recommended fix | **3** Reduce ACL to postgres+service_role |
| Risk | **HIGH** — unauthorized ding backfill |
| Batch1 Ready | **YES** |
| Confidence | HIGH |

---

### 9–11. Admin tournament public wrappers

#### `public.fn_admin_create_tournament(p_payload jsonb)`  
#### `public.fn_admin_update_tournament(p_tournament_id uuid, p_patch jsonb)`  
#### `public.fn_admin_delete_tournament(p_tournament_id uuid)`

| Field | Value |
|-------|--------|
| Mode | DEFINER |
| ACL | PUBLIC + anon + authenticated + postgres + service_role |
| Callers | **Browser:** `app/admin/tournaments/create/page.tsx`, `app/admin/tournaments/[id]/edit/page.tsx` via `supabase.rpc(...)` (user JWT from `@/lib/supabaseClient`). No Server Action. No Railway. |
| Wrapper auth | **nowhere** in public body — thin `RETURN/PERFORM tournament.fn_admin_*` |
| Nested auth | **Inside SQL** — `tournament.fn_admin_*` uses `auth.uid()`, loads `users.role/status`, raises `UNAUTHORIZED` (see `sql/migrations/20251231113000_lock_tournament_admin_writes.sql` + live defs) |
| Authorization overall | **Inside SQL (nested only)** — not in API (browser direct RPC) |
| Root cause | **C** Wrapper bypasses authorization **at the public layer** (no local gate; depends entirely on nested). Also **E** (anon EXECUTE unnecessary) |
| Recommended fix | **2** Move invocation to server API (admin session + service_role or user JWT with explicit checks) — **preferred**. Interim: **1** Add SQL authorization in public wrapper mirroring nested admin checks; **3** revoke anon |
| Risk | **HIGH** — privileged tournament mutation surface; nested auth mitigates non-admin JWT but PUBLIC/anon grants and thin wrappers are fragile |
| Batch1 Ready | **NO** / **BLOCKED** for full revoke of `authenticated` — browser product path requires EXECUTE until API migration |
| Confidence | HIGH |

HYBRID note: not HYBRID_RPC in P1.10; nested `tournament.fn_admin_*` classified CLIENT there with STRONG auth.

---

### 12. `public.fn_tournament_wallet_capture(...)`

| Field | Value |
|-------|--------|
| Mode | DEFINER |
| ACL | PUBLIC + anon + authenticated + postgres + service_role |
| Callers | **No** TS `.rpc` (contrast: browser calls `fn_tournament_wallet_hold` / `fn_tournament_wallet_release` in `TournamentRoomScreen.tsx`). Wrapper → `tournament.fn_wallet_capture_join` which **does** `auth.uid()` + raise `unauthenticated` |
| Authorization | Wrapper: **nowhere**; nested: **SQL** (`auth.uid`) |
| Root cause | **D** Legacy / unused public capture wrapper (hold/release used instead for client flow) |
| Recommended fix | **3** Reduce ACL (or **5** after proving unused). Do **not** revoke nested `tournament.fn_wallet_capture_join` without tournament path review |
| Risk | **HIGH** if callable without nested auth succeeding; nested requires JWT uid |
| Batch1 Ready | **YES** for locking **public** wrapper only |
| Confidence | MEDIUM |

---

### 13–15. Debug / test RPCs (gameroom incident tooling)

#### `public.debug_ticket_counts(p_room_id uuid)`  
#### `public.debug_runtime_context(p_room_id uuid)`  
#### `public.test_active_cards_bypass_rls(p_room_id uuid)`

| Field | Value |
|-------|--------|
| Mode | DEFINER |
| ACL | anon + authenticated + postgres + service_role |
| Callers | **Next.js API:** `app/api/player/gameroom/route.ts` → `loadActiveCardsForRoom(supabase: createServiceClient, ...)` calls all three via `.rpc` for compare/logging (`docs/incidents/2026-06-16-supabase-postgrest-partial-read.md`). Not browser-direct. |
| Authorization | **nowhere** in SQL (DEFINER bypasses RLS by design). API uses **service_role** client — auth is “service_role expectation” only, not end-user checks |
| Root cause | **E** ACL too broad (and **B** — must not be browser-callable) |
| Recommended fix | **3** Reduce ACL to service_role (+postgres). Optionally remove calls from gameroom after incident tooling retired (**5**) |
| Risk | **HIGH** — ticket/player enumeration across rooms if client JWT retains EXECUTE |
| Batch1 Ready | **YES** — current product path uses service_role |
| Confidence | HIGH |

---

## Missing functions investigation

### `public.get_user_referral_code_history`

| Question | Evidence |
|----------|----------|
| Live DEV catalog? | **Absent** (`pg_proc` name lookup empty in P1.10/P1.11) |
| Repo SQL? | `sql/functions/get_user_referral_code_history.sql` — standalone CREATE, **not** under `sql/migrations/` (no migration match) |
| App caller? | `lib/auth-helpers.ts` → `getReferralCodeHistory()` calls `.rpc('get_user_referral_code_history')` then **falls back** on error `42883` / “does not exist” to direct `referral_code_history` table select |
| Verdict | **Missing migration** (function never applied to DEV, or only ever lived as a loose SQL file) + **stale optional repository reference** with working fallback |

### `public.exec_sql`

| Question | Evidence |
|----------|----------|
| Live DEV catalog? | **Absent** |
| Repo SQL migrations? | **No** `CREATE FUNCTION exec_sql` under `sql/migrations/` |
| Callers? | `scripts/list-tables.ts`, `scripts/execute-tickets-query.js` — ops scripts; JS already prints that RPC may not exist and suggests SQL Editor |
| Verdict | **Dead / never-deployed script helper** (stale repository reference). Not a product RPC. Do **not** create it on DEV |

---

## Batch 1 readiness matrix (UNSAFE only)

| Function | Batch1 | Why |
|----------|--------|-----|
| game_core.fn_confirm_win | YES | No product callers; lock ACL |
| game_core.fn_payout_room | YES | Legacy shim |
| game_finance.fn_payout_room_prize | YES | Legacy shim |
| game_finance.fn_payout_winners | YES | Legacy shim |
| public.fn_payout_room_if_full | YES | Legacy shim |
| public.distribute_ding_on_draw | YES | No trigger attached |
| public.update_ding_balance | YES | No `.rpc`; align P0-A |
| public.rpc_backfill_missed_engine_ding | YES | Ops/service only |
| public.fn_tournament_wallet_capture | YES | No TS caller |
| public.debug_* / test_active_cards_* | YES | service_role API only |
| public.fn_admin_create/update/delete_tournament | **BLOCKED** | Browser JWT `.rpc` until API migration |

---

## Recommended remediation order (plan only)

1. **Batch 1 ACL lock** (12 YES functions): revoke PUBLIC/anon/authenticated; grant postgres+service_role.  
2. **Admin wrappers:** implement Next.js admin API (pattern like wallet transfer) **or** add wrapper-local admin checks; then revoke anon; later optionally revoke authenticated if API uses service_role.  
3. **Delete candidates** after smoke: `distribute_ding_on_draw`, soft payout aliases, optionally `fn_confirm_win`.  
4. **Referral history:** either add a proper migration with `auth.uid()` ownership checks, or remove dead RPC call and keep table fallback only.  
5. **Never add `exec_sql`** to DEV.

---

## Out of scope

- Implementing fixes  
- Generating migrations  
- Changing ACLs  
- HYBRID `fn_wallet_apply_delta` (except note: admin adjust uses it via service_role — separate track)
