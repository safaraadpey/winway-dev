# P1.8 — Non-Destructive Database Function Inventory Audit

> **Date:** 2026-07-31  
> **Project:** `yqnptpreowkimopxicfz` (`winway_dev`)  
> **Mode:** Read-only (no DDL, DCL, migrations, Railway/env/cron changes, no commit)  
> **Companion CSV:** [`p1-8-database-function-inventory.csv`](./p1-8-database-function-inventory.csv)  
> **Prior:** P1.7 ACL lockdown (`20260731125604`); lobby/tournament smoke passed after lockdown

---

## Executive summary

Audited **205** non-extension functions across application schemas (`public` 97, `game_core` 37, `game_finance` 25, `tournament` 40, `game_pool` 4, `load_test` 1, `monitor` 1).

| Classification | Count |
|----------------|------:|
| A. KEEP_RAILWAY_TRANSACTION_PRIMITIVE | 41 |
| B. KEEP_APPLICATION_RPC | 44 |
| C. KEEP_MAINTENANCE | 10 |
| D. KEEP_FINANCE_OR_SECURITY_CRITICAL | 56 |
| E. KEEP_DATABASE_INFRASTRUCTURE | 33 |
| F. LEGACY_QUARANTINED | 5 |
| G. CANDIDATE_UNUSED_NEEDS_VALIDATION | 16 |
| H. CONFIRMED_UNUSED | **0** |
| I. UNKNOWN_BLOCKED | **0** |

**Immediate security finding (pre-existing, not introduced by this audit):** **170** functions have PUBLIC and/or `anon`/`authenticated` EXECUTE; **121** of those are `SECURITY DEFINER`. The five P1.7 quarantined orchestrators remain correctly locked to `{postgres=X, service_role=X}` only.

**Confirmed unused:** **0** (insufficient for H gates). **No database objects were changed.**

**Status:** `FUNCTION_INVENTORY_COMPLETE`

---

## Methodology

1. **Live catalog (Supabase MCP `execute_sql`)** — `pg_proc` + `pg_namespace` excluding `pg_catalog`, `information_schema`, and extension-owned procs (via dependency filter used in prior catalog pull). Captured: schema, name, identity args, owner, language, security mode, `proacl`, `has_function_privilege` for anon/authenticated/service_role.
2. **Cron** — `cron.job` (4 active maintenance jobs; no bingo/orchestrator jobs).
3. **Triggers** — `pg_trigger` → function mapping for app schemas.
4. **Repository callers** — ripgrep of `.rpc("…")` / `.rpc('…')` across `apps/engines/bingo/`, `app/`, `lib/`, `services/`, `src/`, scripts.
5. **Quarantine re-verify** — ACL + definition heads for the five P1.7 functions; body of `fn_heartbeat_tick` confirms nested calls to the two `game_core.fn_manage_*` functions.
6. **Classification** — single primary class A–I per function using the rules in the task brief; prefer G over H when any gate is unmet.
7. **Deliverables** — one CSV row per function (required columns); this Markdown report.

Classification heuristics (see build script used during audit): Railway `.rpc` → A/C/D; app `.rpc` → B/D; active cron entrypoints → C; trigger functions → E; five ACL-locked orchestrators → F; finance/wallet/settlement/authz names without confirmed callers → D or G (not H).

---

## Limitations

| Limitation | Impact |
|------------|--------|
| Full `pg_get_functiondef` bodies **not embedded** in CSV (multi-hundred KB+) | Definitions were verified live for existence/length; retrieve with SQL below |
| `tables_read` / `tables_written` not fully AST-parsed from bodies | Marked as placeholder; side-effect risk inferred from name/schema/callers |
| Dynamic SQL / string-built RPC names may be incomplete | Searched exact + known hybrids; residual risk → G where unclear |
| Generated types / migrations / docs alone do not prove runtime use | Used only as secondary notes |
| Absence from Railway/Supabase logs does not prove unused | No CONFIRMED_UNUSED from log silence |
| `has_function_privilege(anon)` is true when **PUBLIC** has EXECUTE | ACL findings use both `proacl` text and privilege checks |
| Overloads share a name across schemas (`public` + `game_*` wrappers) | Each signature is a separate inventory row |
| PostgREST `db_schemas` / exposed RPC surface not fully enumerated | Application usage = repo `.rpc` evidence |

**Retrieve full definition:**

```sql
SELECT n.nspname, p.proname, pg_get_function_identity_arguments(p.oid),
       pg_get_functiondef(p.oid)
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = :schema AND p.proname = :name;
```

---

## Classification totals

See executive summary table. Sum = **205**.

Schema breakdown of catalog: public 97 · game_core 37 · tournament 40 · game_finance 25 · game_pool 4 · load_test 1 · monitor 1.

---

## High-risk findings

1. **Broad EXECUTE on DEFINER finance/game RPCs** — 121 DEFINER functions still callable via PUBLIC/`anon`/`authenticated`. Highest risk: wallet/settle/commission/payout wrappers and admin RPCs. Recommended action class: `ACL_REVIEW` (future work; **not** changed in P1.8).
2. **Soft-shim finance paths** — `fn_confirm_win`, `fn_payout_room*`, `distribute_ding_on_draw`, `fn_adjust_wallet_manual`, `update_ding_balance` lack direct TS `.rpc` callers but remain DEFINER + broad grants → classified **G** or **D**, never H.
3. **Duplicate Railway TypeScript ports** — quarantined orchestrators + `fn_evaluate_room_after_draw` have TS mirrors under `GAME_RUNTIME=engine`; DB copies retained for hybrid/rollback.
4. **Hybrid dormant path** — `game-engine/.../room-scheduler` still contains `supabase.rpc("fn_heartbeat_tick")` for hybrid mode. Live Railway is `GAME_RUNTIME=engine`, so this path is **not active**, but code presence means the function is rollback-relevant → **F**, not H.

---

## ACL findings

| Metric | Count |
|--------|------:|
| Functions with PUBLIC and/or anon/authenticated EXECUTE in ACL | **170** |
| Of those, SECURITY DEFINER | **121** |
| Rows tagged `recommended_action=ACL_REVIEW` in CSV | **45** (subset prioritized by classifier) |
| P1.7 quarantined five: anon EXECUTE | **false** |
| P1.7 quarantined five: authenticated EXECUTE | **false** |
| P1.7 quarantined five: service_role + postgres EXECUTE | **true** |

Quarantined ACL snapshot (live 2026-07-31):

| Function | Mode | ACL |
|----------|------|-----|
| `public.fn_heartbeat_tick()` | INVOKER | `{postgres=X, service_role=X}` |
| `public.fn_process_draw_jobs_batch()` | INVOKER | `{postgres=X, service_role=X}` |
| `public.fn_process_draw_jobs_batch_worker(int,int)` | INVOKER | `{postgres=X, service_role=X}` |
| `game_core.fn_manage_waiting_rooms(int,bool)` | DEFINER | `{postgres=X, service_role=X}` |
| `game_core.fn_manage_room_live_actions()` | INVOKER | `{postgres=X, service_role=X}` |

---

## Duplicate / overlapping logic findings

### DB ↔ Railway TypeScript

| DB function | Railway evidence |
|-------------|------------------|
| `fn_heartbeat_tick` / `fn_manage_waiting_rooms` / `fn_manage_room_live_actions` | Engine room-scheduler + room domain ports; hybrid still RPCs heartbeat |
| `fn_process_draw_jobs_batch_worker` | `processDrawBatch.ts` documents Phase-1 mirror |
| `fn_evaluate_room_after_draw` | Still called via RPC from engine **and** exists as SoR |

### Schema wrappers / overloads

Many `public.*` wrappers forward to `game_core` / `game_finance` / `tournament` (e.g. `fn_wallet_apply_delta`, `fn_finish_room_and_settle`, `fn_tick_*`, admin tournament RPCs). Treat as intentional PostgREST surface, not duplicates to drop.

---

## Candidate lists

### F. LEGACY_QUARANTINED (5)

1. `game_core.fn_manage_room_live_actions()`
2. `game_core.fn_manage_waiting_rooms(p_limit integer, p_capture boolean)`
3. `public.fn_heartbeat_tick()`
4. `public.fn_process_draw_jobs_batch()`
5. `public.fn_process_draw_jobs_batch_worker(p_worker_id integer, p_total_workers integer)`

### G. CANDIDATE_UNUSED_NEEDS_VALIDATION (16)

1. `game_core.fn_confirm_win(p_room_id uuid, p_ticket_id uuid, p_type text)`
2. `load_test._pool_cards_for_room(...)`
3. `monitor.fn_rooms_settling_lag()`
4. `public.debug_runtime_context(p_room_id uuid)`
5. `public.debug_ticket_counts(p_room_id uuid)`
6. `public.distribute_ding_on_draw()`
7. `public.fn_adjust_wallet_manual(...)`
8. `public.fn_backfill_card_bitmask_definitions()`
9. `public.fn_dashboard_admin_tournament_guarantee_summary_range(...)`
10. `public.fn_heartbeat_log()`
11. `public.fn_payout_room_if_full(p_room_id uuid)`
12. `public.fn_tournament_entry_upsert(...)`
13. `public.make_short_id_from_uuid(p_id uuid)`
14. `public.test_active_cards_bypass_rls(p_room_id uuid)`
15. `public.test_constraint_resolution()`
16. `public.update_ding_balance(p_user_id uuid, p_amount numeric)`

### H. CONFIRMED_UNUSED

**None (0).** No function met all H gates.

### I. UNKNOWN_BLOCKED

**None (0).**

---

## Functions used directly by Railway (repo `.rpc`)

Unique names with `game-engine` repository callers (excluding quarantined F classification for the hybrid-only heartbeat — heartbeat remains in code for hybrid but is not engine-mode runtime):

`api_get_room_state`, `fn_evaluate_room_after_draw`, `fn_janitor_repair_unsettled_finished`, `fn_system_join_or_create_room`, `rpc_apply_marks_for_draw`, `rpc_pick_draw_jobs`, `fn_distribute_ticket_commission`, `fn_finish_room_and_settle`, `fn_record_ticket_commission`, `fn_wallet_apply_delta`, `fn_pick_dev_room_schedules`, `fn_tick_due_tournaments`, `fn_tick_tournament`, `load_test_cleanup`, `load_test_seed_playing_rooms`, `rpc_apply_ding_credits_for_draw`, `rpc_claim_game_room`, `rpc_finalize_engine_draw_job`, `rpc_find_claimable_playing_rooms`, `rpc_has_earlier_unprocessed_draw`, `rpc_insert_draw_if_ready`, `rpc_insert_draw_if_ready_owner_guard`, `rpc_release_game_room`, `rpc_renew_game_room_lease`.

(Plus schema-qualified twins under `game_core` / `game_finance` / `tournament` where wrappers exist — see CSV `repository_callers`.)

**Note:** `fn_heartbeat_tick` appears in hybrid branch only; live `GAME_RUNTIME=engine` does not call it.

---

## Functions used directly by the application (repo `.rpc`)

Including admin/player/API surfaces: `fn_generate_card_pool`, `fn_wallet_apply_delta`, `fn_admin_*` tournament CRUD/status, `fn_admin_games_report`, `fn_cancel_waiting_room`, dashboard commission/guarantee summaries (+ range), `fn_dev_panel_dev_player_finance_summary`, `fn_join_or_create_room`, `fn_my_active_rooms`, `fn_ping_presence`, `fn_tournament_wallet_hold` / `release`, `fn_wallet_transfer_panel`, `get_weekly_leaders`, `get_daily_leaders`, `get_daily_leaders_by_date`.

---

## Cron-triggered functions (active)

| Cron job | Schedule | Command |
|----------|----------|---------|
| `fn_generate_card_pool_step` | 15 seconds | `SELECT game_core.fn_generate_card_pool_step()` |
| `fn_janitor_sweep` | `* * * * *` | `SELECT game_core.fn_janitor_sweep()` |
| `heartbeat_log_partitions` | `10 3 * * *` | `SELECT public.fn_maintain_heartbeat_log_partitions(2, 7)` |
| `cleanup_retention` | `30 3 * * *` | `SELECT public.fn_cleanup_retention()` |

No active cron invokes any of the five quarantined orchestrators. Bingo draw/heartbeat crons remain absent (P1.5/P1.7).

---

## Trigger / policy / view-dependent functions

Trigger-backed inventory names (non-exhaustive of all E class; see CSV `trigger_view_policy_dependency`):

`handle_new_user`, `set_updated_at` (+ several `update_*_updated_at`), `fn_sync_card_numbers`, `fn_lock_commission_snapshot`, `fn_aggregate_ding_for_processed_draw`, `fn_ding_aggregate_dryrun_on_draw_processed`, `trg_after_draw_enqueue`, `trg_rooms_after_live`, `trg_tickets_after_paid`, `trg_sync_room_winners_from_results`, `trg_rooms_stamp_waiting_started_at`, `trg_rooms_status_template_draining`, `trg_debug_rooms_status`, tournament entry guards/snapshots, affiliation validators/syncs.

(Extension/storage/realtime triggers excluded from app inventory classification.)

---

## Finance / security-critical functions

**56** classified **D**, plus additional A/C functions with high financial side effects (wallet apply, settle, ding credits, janitor repair unsettled). Full list in CSV where `primary_classification` starts with `D` or `financial_or_security_risk=high`.

Treat all wallet / ledger / commission / payout / settlement / ding-balance mutators as high risk regardless of caller confidence.

---

## Special review — five quarantined orchestrators

| Check | Result |
|-------|--------|
| Active cron invokes? | **No** (4 maintenance crons only) |
| Railway engine-mode invokes? | **No** (`GAME_RUNTIME=engine`; TS ports used) |
| Hybrid code path exists? | **Yes** — `fn_heartbeat_tick` only (dormant when engine) |
| Application `.rpc`? | **No** for all five |
| ACL service_role/postgres only? | **Yes** (re-verified) |
| Nested quarantine calls? | **Yes** — `fn_heartbeat_tick` → `fn_manage_waiting_rooms` + `fn_manage_room_live_actions`. Batch worker is sibling of batch entry (not called by heartbeat). |
| Operational risk of retaining? | Low while ACL locked; hybrid flip would re-enable heartbeat RPC via service_role |
| Security risk of retaining? | Residual if service_role key leaks; **much lower** than pre-P1.7 PUBLIC grants |
| Recommended action | `KEEP_QUARANTINED` |

Definition sizes (chars): heartbeat 340 · batch 1005 · batch_worker 1717 · waiting_rooms 4471 · live_actions 3009.

---

## Recommended next audit steps

1. **P1.9 ACL sweep** — prioritize DEFINER + PUBLIC/`anon`/`authenticated` on wallet/settle/admin RPCs (do not touch finance semantics; grants only).
2. **Validate G-list** — product confirmation for `fn_confirm_win` / payout shims / ding helpers / debug/test functions; only then consider FUTURE_DROP_CANDIDATE.
3. **Definition body parse** — automated table R/W + nested call graph for all 205 (fills CSV placeholders).
4. **Hybrid code cleanup (separate change)** — optional: gate or remove dormant `fn_heartbeat_tick` RPC behind explicit flag docs (not required for quarantine).
5. **Do not DROP** any function from this inventory without satisfying H gates + rollback plan.

---

## Evidence table

One row per function: see **[`p1-8-database-function-inventory.csv`](./p1-8-database-function-inventory.csv)**  
Columns: schema, function_name, signature, owner, language, security_mode, execute_acl, primary_classification, repository_callers, database_callers, calls_functions, trigger_view_policy_dependency, cron_dependency, railway_usage, application_usage, tables_read, tables_written, financial_or_security_risk, duplicate_in_railway, confidence, evidence_notes, recommended_action.

Recommended actions used: `KEEP` · `KEEP_QUARANTINED` · `INVESTIGATE` · `ACL_REVIEW` · `FUTURE_DROP_CANDIDATE` — **no `DROP_NOW`**.

---

## Change control

| Item | Value |
|------|-------|
| Database changes made | **None** |
| Migrations applied | **None** |
| Cron / Railway / env changes | **None** |
| Commit / push | **None** |

```
FUNCTION_INVENTORY_COMPLETE
```
