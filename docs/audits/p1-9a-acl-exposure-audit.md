# P1.9A — Read-Only ACL Exposure Audit

> **Date:** 2026-07-31  
> **Project:** `yqnptpreowkimopxicfz` (`winway_dev`)  
> **Mode:** Read-only (no GRANT/REVOKE/ALTER/migrations/code/env/cron/commit)  
> **Canonical list:** [`p1-8-database-function-inventory.csv`](./p1-8-database-function-inventory.csv) (205 functions)  
> **Companion CSV:** [`p1-9a-acl-exposure-audit.csv`](./p1-9a-acl-exposure-audit.csv)  
> **Prior:** P1.7 quarantined five orchestrators; P1.8 inventory complete

---

## Executive summary

All **205** application-owned functions were re-audited for EXECUTE exposure, caller categories, internal authorization strength, and SECURITY DEFINER justification.

| Metric | Count |
|--------|------:|
| Functions reviewed | **205** |
| PUBLIC EXECUTE (via `aclexplode` / defaults) | **187** |
| Callable by `anon` | **200** |
| Callable by `authenticated` | **200** |
| SECURITY DEFINER | **146** |
| DEFINER with broad EXECUTE (PUBLIC/anon/auth) | **145** |
| Recommended ACL reduction (`REDUCE_ACL_IN_P1_9B`) | **38** |
| Body authorization review (`REVIEW_FUNCTION_AUTHORIZATION`) | **55** |
| DEFINER hygiene review (`REVIEW_SECURITY_DEFINER`) | **25** |
| CRITICAL risk | **35** |
| HIGH risk | **86** |
| Manual review (`MANUAL_REVIEW_REQUIRED`) | **45** |
| Internal authorization = NONE | **60** |

**Core finding:** Most game/finance primitives are still executable by client roles because of PUBLIC (and often direct anon/authenticated) grants, while many SECURITY DEFINER bodies contain **no caller authorization**—they assume a trusted `service_role` caller. That combination is a privilege-escalation risk for any client that can reach PostgREST.

**Five P1.7 quarantined orchestrators:** ACL remains `{postgres, service_role}` only → **KEEP_CURRENT_ACL**.

**Database / app / Railway / cron changes this phase:** **none**.

```
ACL_EXPOSURE_AUDIT_COMPLETE
```

---

## Methodology

1. **Canonical set** — every row from P1.8 CSV (205 signatures).
2. **Live ACL** — `pg_proc.proacl` + `aclexplode(COALESCE(proacl, acldefault('f', owner)))` to separate:
   - PUBLIC EXECUTE (grantee 0)
   - direct role grants (`anon` / `authenticated` / `service_role`)
   - effective EXECUTE via `has_function_privilege` (includes PUBLIC inheritance)
3. **DEFINER / search_path** — `prosecdef`, `proconfig` (`search_path=…`).
4. **Body heuristics** — `pg_get_functiondef` scanned for `auth.uid`, JWT/role keywords, raise/forbidden patterns; targeted full-body samples for wallet, settle, claim, admin, transfer, join, ding.
5. **Callers** — repository `.rpc` evidence (Railway `game-engine`, app/API/admin), cron.job, triggers, nested DB callers from P1.8, hybrid-only heartbeat path.
6. **Classification** — single recommended ACL, risk level, and proposed action per required enums (no SQL emitted).

---

## Limitations

| Limitation | Impact |
|------------|--------|
| Not every body line-audited end-to-end | Auth class may be UNKNOWN/PARTIAL; flagged for manual review |
| Heuristic keyword scans can miss custom helpers | Prefer sample-backed STRONG/NONE where available |
| PostgREST schema exposure not fully enumerated | Client reachability assumed if EXECUTE + typical `public`/`game_*` exposure |
| API routes may add auth *before* RPC | Documented as defense-in-depth; DB ACL still overexposed if body weak |
| Effective anon=200 includes PUBLIC inheritance | Distinguish PUBLIC vs direct grants in CSV `notes` |
| No runtime exploit testing | Risk is exposure analysis, not a penetration proof |

---

## Exposure totals

| Exposure | Count | Notes |
|----------|------:|-------|
| PUBLIC EXECUTE | 187 | Includes default privileges when `proacl` NULL |
| Effective `anon` EXECUTE | 200 | Mostly via PUBLIC |
| Effective `authenticated` EXECUTE | 200 | Mostly via PUBLIC |
| Direct `anon` grant (explode) | ~109 | See precise ACL dump notes in build |
| Direct `authenticated` grant | ~122 | |
| Locked to postgres+service_role (no PUBLIC/anon/auth) | 5 quarantined + a few others | Quarantine verified |

---

## SECURITY DEFINER findings

- **146** DEFINER functions; **145** still broadly executable.
- **~67** DEFINER without explicit `search_path` (from metadata)—search-path injection / object-shadowing risk under elevated rights.
- **DEFINER is often justified** for wallet/settle/join (must bypass RLS and write ledger tables), but **justification does not excuse broad EXECUTE**.
- Examples of **DEFINER_PROBABLY_REQUIRED** + **NONE** internal auth + PUBLIC:
  - `game_finance.fn_wallet_apply_delta` / `public.fn_wallet_apply_delta`
  - `game_finance.fn_finish_room_and_settle` / public wrapper
  - `public.rpc_claim_game_room`, `rpc_finalize_engine_draw_job`, `rpc_insert_draw_if_ready*`
- Examples of **DEFINER + STRONG** internal auth (ACL still too wide):
  - `public.fn_adjust_wallet_manual`, `fn_wallet_transfer_panel` (+ bulk), dashboard admin summaries, `tournament.fn_admin_*`, `can_read_user`, `is_admin_active`

---

## Finance / security findings (P0)

Highest-priority overexposure:

| Pattern | Examples | Auth | Risk |
|---------|----------|------|------|
| Wallet core mutation, no caller check | `fn_wallet_apply_delta`, `fn_wallet_add/subtract/deposit/withdraw/capture/hold/release*` | NONE | CRITICAL |
| Settlement / commission | `fn_finish_room_and_settle`, `fn_record_ticket_commission`, `fn_distribute_ticket_commission`, payout shims | NONE | CRITICAL |
| Ding balance mutation | `update_ding_balance`, `rpc_apply_ding_credits_for_draw` | NONE | CRITICAL |
| Soft win/payout shims | `fn_confirm_win`, `fn_payout_room*` | NONE | CRITICAL |
| Admin-gated finance with body checks | `fn_adjust_wallet_manual`, transfer panel | STRONG | HIGH (still PUBLIC) |

**Admin API note:** `app/api/admin/wallet/adjust` calls `fn_wallet_apply_delta` directly (not only the gated manual wrapper). Even if the route checks admin, any authenticated (or anon via PUBLIC) PostgREST caller can hit the core delta RPC.

---

## Admin / player authorization findings (P1 / P3)

| Class | Finding |
|-------|---------|
| Admin tournament RPCs | `tournament.fn_admin_*` enforce `auth.uid` + admin/super; `public.fn_admin_*` are thin DEFINER wrappers (PARTIAL at wrapper, STRONG at callee) — still PUBLIC |
| Dashboard summaries | `fn_dashboard_admin_commission_summary*` require admin role — STRONG; remove PUBLIC |
| Dev panel | `fn_dev_panel_dev_player_finance_summary` DEFINER, **no auth.uid/role check**, finance aggregates — CRITICAL |
| Player join | `fn_join_or_create_room` uses `auth.uid` + suspension checks — PARTIAL; still PUBLIC/`anon` |
| Leaders / presence | authenticated product RPCs — reduce PUBLIC; keep authenticated |
| Registration | `rpc_register_player` requires `auth.uid`; invitation signup paths differ — anon+authenticated may be intentional |

---

## Railway-only functions exposed publicly (P2)

~**30** Railway `.rpc` targets still show PUBLIC EXECUTE while intended caller is `service_role` only (engine). Examples:

- Claim/lease: `rpc_claim_game_room`, `rpc_renew_game_room_lease`, `rpc_release_game_room`, `rpc_find_claimable_playing_rooms`
- Draw pipeline: `rpc_insert_draw_if_ready*`, `rpc_pick_draw_jobs`, `rpc_apply_marks_for_draw`, `rpc_finalize_engine_draw_job`, `rpc_apply_ding_credits_for_draw`
- Settlement path: `fn_finish_room_and_settle`, commission helpers, `fn_evaluate_room_after_draw`
- System join / room state: `fn_system_join_or_create_room`, `api_get_room_state`

**Recommended ACL for these:** `postgres + service_role` (P1.9B batch).

---

## Functions with no internal authorization

**60** classified `internal_authorization=NONE` (CSV filter). Dominant groups:

1. `game_finance.fn_wallet_*` mutators  
2. Settlement / commission / payout helpers  
3. Engine RPCs (`rpc_*` claim/draw/finalize)  
4. Maintenance helpers invoked as service_role (`fn_janitor_repair_*`)  
5. Legacy shims (`update_ding_balance`, confirm/payout)

Triggers and quarantined functions are `NOT_APPLICABLE`.

---

## Functions requiring manual review

**45** rows with `proposed_action=MANUAL_REVIEW_REQUIRED` — primarily:

- Tournament internal helpers without clear PostgREST callers  
- P1.8 G-list candidates (debug/test/monitor/load_test/soft shims)  
- Overloads where one signature is gated and another delegates  

These are **not** deletion candidates; ACL may still need tightening after product confirmation.

---

## Special: five quarantined functions

| Function | PUBLIC | anon | authenticated | service_role | Action |
|----------|:------:|:----:|:-------------:|:------------:|--------|
| `public.fn_heartbeat_tick()` | F | F | F | T | KEEP_CURRENT_ACL |
| `public.fn_process_draw_jobs_batch()` | F | F | F | T | KEEP_CURRENT_ACL |
| `public.fn_process_draw_jobs_batch_worker(int,int)` | F | F | F | T | KEEP_CURRENT_ACL |
| `game_core.fn_manage_waiting_rooms(int,bool)` | F | F | F | T | KEEP_CURRENT_ACL |
| `game_core.fn_manage_room_live_actions()` | F | F | F | T | KEEP_CURRENT_ACL |

No broader access recommended. Hybrid code path still references heartbeat under non-engine runtime (dormant when `GAME_RUNTIME=engine`).

---

## Sixteen P1.8 candidate-unused functions

Audited for ACL/auth normally; **not** marked unused/removable. Notable ACL issues among them: `fn_confirm_win`, `fn_payout_room_if_full`, `distribute_ding_on_draw`, `fn_adjust_wallet_manual` (strong auth but broad grant), `update_ding_balance`, debug/test helpers with PUBLIC. See CSV `notes` containing `P1.8 candidate-unused`.

---

## Prioritized P1.9B change batches

> P1.9A does **not** generate migrations. Batches below are planning only.

### Batch 0 — Emergency finance ACL (CRITICAL)

REVOKE PUBLIC/anon/authenticated EXECUTE on:

- `game_finance.fn_wallet_apply_delta` + `public.fn_wallet_apply_delta`
- All other `game_finance.fn_wallet_*` mutators
- `fn_finish_room_and_settle` (both schemas)
- commission record/distribute
- `update_ding_balance`, ding credit RPC
- payout/confirm shims

GRANT remain: `service_role` (+ `postgres`).  
**Parallel:** stop calling unprotected `fn_wallet_apply_delta` from user-scoped clients; route admin adjusts through `fn_adjust_wallet_manual` / transfer panel only.

### Batch 1 — Railway primitives (HIGH)

REVOKE client EXECUTE on all `rpc_claim_*`, `rpc_renew_*`, `rpc_release_*`, `rpc_insert_draw_*`, `rpc_pick_draw_jobs`, `rpc_finalize_*`, `rpc_apply_*`, `fn_system_join_or_create_room`, engine evaluate/settle wrappers. Keep `service_role`.

### Batch 2 — Admin / dev (HIGH)

- Remove PUBLIC from admin/dashboard/dev RPCs that already have STRONG body checks  
- **Fix body** on `fn_dev_panel_dev_player_finance_summary` (add admin gate) before or with ACL tighten  
- Prefer authenticated-only EXECUTE

### Batch 3 — Player RPCs (MEDIUM)

- Remove PUBLIC from join/cancel/presence/leaders/tournament player RPCs  
- Keep `authenticated` (and `anon` only where signup/register truly requires it)

### Batch 4 — Trigger / maintenance hygiene (LOW–MEDIUM)

- Remove PUBLIC default grants on trigger functions and cron entrypoints (`fn_janitor_sweep`, card-pool step, retention, partition maint) — EXECUTE not needed for clients

### Batch 5 — DEFINER search_path

- Set explicit `search_path` on DEFINER functions lacking it (especially finance + engine RPCs)

---

## Evidence table

Full per-function rows: [`p1-9a-acl-exposure-audit.csv`](./p1-9a-acl-exposure-audit.csv)

Columns match the P1.9A brief (identity, exposure flags, callers, auth, DEFINER justification, RLS bypass risk, recommended ACL, risk, proposed action, confidence, notes).

---

## Change-control confirmation

| Item | Value |
|------|-------|
| Database changes made | **none** |
| Migrations created | **none** |
| GRANT / REVOKE / ALTER executed | **none** |
| Application / Railway / env / cron changes | **none** |
| Commit / push | **none** |

```
ACL_EXPOSURE_AUDIT_COMPLETE
```
