# P1.5 — Supabase Legacy Game Engine SQL Audit (Read-Only)

> **Date:** 2026-07-31  
> **Project:** `yqnptpreowkimopxicfz` (`winway_dev`)  
> **Mode:** READ-ONLY — no DROP/ALTER/CREATE/REPLACE/GRANT/REVOKE/DELETE, no migrations applied, no cron/env/deploy/commit changes, no application code edits.  
> **Authority model:** Railway (`winway-dev-production`) = canonical game runtime; Supabase = System of Record + maintenance.  
> **Known:** `bingo_heartbeat` / `bingo_draw_worker_1..3` already absent. Wave 2A complete.

---

## Executive summary

| Metric | Value |
|--------|------:|
| Game-related functions/procedures reviewed (name filter across `public`,`game_core`,`game_finance`,`tournament`,`api`,`game_pool`) | **165** |
| Game-related triggers inspected (non-internal on those schemas) | **14** (see trigger inventory) |
| Active `cron.job` rows | **4** (all maintenance; **zero** bingo/game-clock) |
| Category **A** (safe removal) | **0** |
| Category **B** (legacy orchestrator, rollback-linked) | **8** (+ overloads counted once per signature group below) |
| Category **C** (shared Railway / maintenance primitives) | **~35+** (lease/draw/settle/join/janitor/card-pool cluster) |
| Category **D** (deprecated / dependency unclear) | **~10** |
| Category **E** (current SoR / finance / auth / reporting / tournament) | **remainder** of reviewed set |

**Database-side game orchestration is currently inactive as a scheduler:** no `bingo_*` crons. The **functions themselves still exist** and remain callable (many with `anon`/`authenticated` EXECUTE). Railway `GAME_RUNTIME=hybrid` still has a **runtime code path** that RPCs `fn_heartbeat_tick`. Engine mode uses TS ports + DB primitives (`rpc_insert_draw_*`, `rpc_pick_draw_jobs`, settlement, etc.).

**Verdict on removals:** Under rule “external usage cannot be disproven → not A” (PostgREST + live ACLs) and “rollback callers keep B”, **no object meets Category A**.

### Final status

```
NO_SAFE_SQL_REMOVAL_FOUND
```

---

## Active cron (source of truth — this session)

| jobid | jobname | schedule | command | active |
|------:|---------|----------|---------|--------|
| 1 | `fn_generate_card_pool_step` | 15 seconds | `SELECT game_core.fn_generate_card_pool_step()` | true |
| 6 | `fn_janitor_sweep` | `* * * * *` | `SELECT game_core.fn_janitor_sweep()` | true |
| 8 | `heartbeat_log_partitions` | `10 3 * * *` | `SELECT public.fn_maintain_heartbeat_log_partitions(2, 7);` | true |
| 9 | `cleanup_retention` | `30 3 * * *` | `SELECT public.fn_cleanup_retention()` | true |

No `bingo_heartbeat`, no `bingo_draw_worker_*`.

---

## Explicit minimum objects (required audit)

### 1. `public.fn_heartbeat_tick()`

| Field | Value |
|-------|--------|
| Type / language | function / plpgsql |
| Security definer | **false** |
| Volatility | volatile |
| Owner | postgres |
| Comment | null |
| Body | `PERFORM game_core.fn_manage_waiting_rooms(50,false);` + `PERFORM game_core.fn_manage_room_live_actions();` |
| ACL (live DEV) | PUBLIC + anon + authenticated + service_role **EXECUTE** |
| Active cron | **none** |
| DB callers (body search) | none other than itself as entrypoint |
| Repo runtime | **A — hybrid only:** `apps/engines/bingo/src/workers/room-scheduler/index.ts` → `supabase.rpc("fn_heartbeat_tick")` when `GAME_RUNTIME` is not `engine`/`legacy_db` idle path |
| Repo rollback | `scripts/game-engine-cron-heartbeat.sql`; migrations history |
| Generated types | not required for classification |
| Docs | many audits/runbooks |
| Classification | **B** |
| Evidence | hybrid RPC still wired; cron absent; grants still open |
| Proposed action | Keep until hybrid/`legacy_db` rollback retired; separately consider grant lock (P0B migration exists in repo but **not reflected** on this DEV ACL set) |

### 2. `public.fn_process_draw_jobs_batch()`

| Field | Value |
|-------|--------|
| Type | function / plpgsql / invoker / volatile / postgres |
| Body | loops `game_core.rpc_pick_draw_jobs()` → `rpc_apply_marks_for_draw` → `fn_evaluate_room_after_draw` → marks job done |
| ACL | PUBLIC + anon + authenticated + service_role |
| Cron | **none** (was bingo draw worker era / single-batch) |
| Repo runtime RPC | **none** (engine uses `rpc_pick_draw_jobs` + TS / `rpc_finalize_engine_draw_job`) |
| Repo refs | migrations; `src/types/supabase.ts`; comments in `processDrawBatch.ts`; optimization SQL |
| Classification | **B** (rollback cron scripts / historical batch path) — **not A** (PostgREST EXECUTE; cannot disprove external call) |

### 3. `public.fn_process_draw_jobs_batch_worker(integer, integer)`

| Field | Value |
|-------|--------|
| Type | function / plpgsql / invoker / volatile |
| Body | `game_core.rpc_pick_draw_jobs(limit, worker_id, total)` → marks → evaluate |
| Cron | **none** (formerly `bingo_draw_worker_1..3`) |
| Repo runtime RPC | **none** |
| Rollback | `scripts/game-engine-cron-draw-workers.sql` (RESTORE schedules this) |
| Classification | **B** (not A: grants + rollback script) |

### 4. `game_core.fn_manage_waiting_rooms(integer, boolean)`

| Field | Value |
|-------|--------|
| Type | function / plpgsql / **SECURITY DEFINER** / volatile |
| ACL | PUBLIC + postgres + service_role (no explicit anon in ACL string; PUBLIC still grants) |
| Called by | `public.fn_heartbeat_tick` (DB body) |
| Engine `engine` mode | TS port `manageWaitingRooms` — **does not RPC this** |
| Hybrid | via `fn_heartbeat_tick` |
| Migration source (latest shape) | e.g. `sql/migrations/20260622100000_fix_max_players_capacity_promotion.sql` (and prior) |
| Classification | **B** (rollback orchestrator half) — also indirectly maintenance-adjacent for promotion semantics but **not** on maintenance cron |

### 5. `game_core.fn_manage_room_live_actions()`

| Field | Value |
|-------|--------|
| Type | function / plpgsql / invoker / volatile |
| Comment | live loop: draws next number… |
| ACL | PUBLIC + anon + authenticated + service_role |
| Called by | `fn_heartbeat_tick` |
| Engine `engine` mode | TS `runOneDrawCycle` + `rpc_insert_draw_if_ready*` — **does not RPC this** |
| Classification | **B** |

**Overloads / variants found:** no alternate signatures for the five names above except draw-job worker’s two-arg form and `rpc_pick_draw_jobs` 1-arg vs 3-arg (see inventory).

---

## Complete inventory table (orchestrator + high-risk / related)

> Full 165-name dump is too large for a single table; below is the **decision-relevant** set. Classification keys: **A–E**. Repo ref codes: **A** runtime, **B** rollback-only, **C** migration/history, **D** generated types, **E** docs only, **F** none.

| Object | Signature | Type | DB references | Repo runtime references | Cron/trigger | External exposure | Classification | Evidence | Proposed action |
|--------|-----------|------|---------------|-------------------------|--------------|-------------------|----------------|----------|-----------------|
| `public.fn_heartbeat_tick` | `()` | fn plpgsql | calls waiting + live_actions | **A** hybrid scheduler RPC | cron: none | anon/auth EXECUTE | **B** | room-scheduler `callDbScheduler` | keep (rollback) |
| `public.fn_process_draw_jobs_batch` | `()` | fn | pick/marks/evaluate | **C/D/E** mirror comments | none | anon/auth | **B** | no TS rpc; types+scripts | keep until rollback retired |
| `public.fn_process_draw_jobs_batch_worker` | `(int,int)` | fn | sharded pick path | **B** cron RESTORE script | none | anon/auth | **B** | `scripts/game-engine-cron-draw-workers.sql` | keep |
| `game_core.fn_manage_waiting_rooms` | `(int,bool)` | fn secdef | heartbeat; join/promote SQL | **B** hybrid via heartbeat; **E** comments for engine port | none | PUBLIC EXECUTE | **B** | body of heartbeat | keep |
| `game_core.fn_manage_room_live_actions` | `()` | fn | heartbeat | **E** rng comments; hybrid via heartbeat | none | anon/auth | **B** | heartbeat body | keep |
| `game_core.rpc_pick_draw_jobs` | `(int)` / `(int,int,int)` | fn | batch workers; public wrappers | **A** draw-processor `pickDrawJobs` | none | anon/auth (1-arg); 3-arg service_role-heavy | **C** | engine queue claim | keep permanently |
| `public.rpc_pick_draw_jobs` | `(int)` | fn secdef | — | **A** same | none | anon/auth | **C** | Railway draw drain | keep |
| `public.rpc_requeue_failed_draw_jobs` | `()` | fn sql secdef | wraps `game_core.fn_requeue_failed_draw_jobs` | **F** in TS | none | anon/auth | **C** | called from **janitor** core | keep |
| `game_core.fn_requeue_failed_draw_jobs` | `()` | fn secdef | janitor_sweep body | via wrapper | maintenance via janitor | service_role + PUBLIC | **C** | janitor dependency | keep |
| `game_core.fn_stamp_orphan_draws_on_terminal_rooms` | `()` | fn secdef | janitor_sweep body | **F** | via janitor | service_role (+PUBLIC) | **C** | maintenance | keep |
| `game_core.fn_janitor_sweep` | `()` | fn secdef | force_cancel, settle, requeue, stamp… | cron + engine maybeRepair | **cron active** | PUBLIC+service_role | **C** | cron job 6 | keep |
| `game_core.fn_janitor_repair_unsettled_finished` | `(int)` | fn secdef | evaluate/settle | **A** `janitorRepair.ts` | none | (P0B target) | **C** | engine repair | keep |
| `game_core.fn_generate_card_pool_step` | `(int)` | fn secdef | — | cron | **cron active** | broad EXECUTE | **C** | maintenance | keep |
| `public.fn_maintain_heartbeat_log_partitions` | `(int,int)` | fn | — | cron | **cron active** | broad | **C** | partitions | keep |
| `public.fn_cleanup_retention` | `()` | fn | — | cron | **cron active** | broad | **C** | retention | keep |
| `public.rpc_claim_game_room` / renew / release | lease sigs | fn secdef | — | **A** repositories | none | anon/auth still | **C** | room-loop ownership | keep |
| `public.rpc_insert_draw_if_ready` (+ owner_guard) | draw insert | fn secdef | — | **A** room-loop | none | anon/auth | **C** | engine draw persist | keep |
| `public.rpc_finalize_engine_draw_job` | large | fn secdef | — | **A** processEngineDrawJob | none | (engine) | **C** | engine finalize | keep |
| `public.rpc_find_claimable_playing_rooms` | `(int)` | fn | — | **A** claim path | none | | **C** | engine | keep |
| `public.rpc_has_earlier_unprocessed_draw` | `(uuid,int)` | fn | — | **A** | none | | **C** | engine | keep |
| `public`/`game_core`.`rpc_apply_marks_for_draw` | `(uuid,int)` | fn | batch workers; evaluate chain | **A** hybrid batch path | none | anon/auth | **C** | still used hybrid + legacy batch | keep |
| `public.fn_evaluate_room_after_draw` | `(uuid,int)` | fn secdef | batch; janitor repair | **A** reconcile + processDrawBatch | none | anon/auth | **C** | winner/settle path | keep |
| `game_core.fn_evaluate_room_after_draw` | `(uuid,int)` | fn | older signature | unclear vs public wrapper | none | anon/auth | **D** | dual evaluate; which is authoritative for RPC name | clarify before any drop |
| `public`/`game_finance`.`fn_finish_room_and_settle` | `(uuid,uuid)` | fn secdef | many finance callers | **A** finance/settleRoom | none | anon/auth | **E**/**C** | finance SoR | keep permanently |
| `game_core.fn_payout_room` | `(uuid)` | fn secdef | → finish_room_and_settle | soft shim; `fn_confirm_win` body | none | anon/auth | **D** | shim; confirm_win may be dead | do not drop without confirm_win analysis |
| `public.fn_payout_room_if_full` | `(uuid)` | fn secdef | **no live body callers found** | **C** migrations; P0A lock list | none | anon/auth | **D** | likely soft-deprecated | Wave 2C-2 candidate **after** grant proof |
| `game_core.fn_confirm_win` | `(uuid,uuid,text)` | fn | calls fn_payout_room | **F** app/engine | none | anon/auth | **D** | no repo runtime | needs product confirmation |
| `game_core.trg_after_draw_enqueue` | trigger fn | trigger on `draws` INSERT | enqueues draw_jobs | engine inserts draws | **TRIGGER active** | n/a | **C** | queue plumbing | keep |
| `public.fn_aggregate_ding_for_processed_draw` | trigger fn | on draws.processed_at | — | engine may also apply ding via rpc | **TRIGGER active** | anon/auth | **C**/**E** | ding SoR path | keep |
| `public.fn_ding_aggregate_dryrun_on_draw_processed` | trigger fn | on draws.processed_at | — | | **TRIGGER active** | anon/auth | **C** or **D** | dry-run still firing | decide product; not A while trigger exists |
| `public.distribute_ding_on_draw` | `()` | fn | **no callers/triggers found this session** | **C** old migration | none observed | anon/auth | **D** | superseded by aggregate trigger? | not A (external grants) |
| `public.fn_heartbeat_log` | `()` | fn | **no callers found** | docs | none (partitions ≠ this) | anon/auth | **D** | name≠maintenance partition fn | not A |
| `public.fn_draw_schedule_jitter_ms` | `(uuid)` | fn secdef | likely waiting_rooms | via manage_waiting | none | | **C**/**B** | used by waiting promotion SQL | keep with waiting_rooms |
| Join/create family (`fn_join_or_create_room*`, `fn_system_join_or_create_room`) | various | fn secdef | deep core | **A** engine commands + Next paths | none | | **E**/**C** | SoR join | keep |
| Wallet / commission family | various | fn secdef | settle/join | **A** admin + engine finance | none | | **E** | finance | keep |
| Tournament tick/seat/payout | various | fn | | **A** tournament worker | none (engine drives) | | **E**/**C** | tournament SoR | keep |
| Lobby RPCs (`rpc_get_active_rooms`, price summary) | | | | Next/lobby | none | | **E** | product | keep |
| Cancel waiting (`fn_cancel_waiting_room*`, force_cancel) | | | janitor uses force | **A** API cancel-waiting-room | none | | **E**/**C** | product + maintenance | keep |

---

## Triggers (game-related)

| Table | Trigger | Function | Role |
|-------|---------|----------|------|
| `draws` | `trg_after_draw_enqueue` | `game_core.trg_after_draw_enqueue` | **C** queue |
| `draws` | `trg_aggregate_ding_on_processed_at` | `fn_aggregate_ding_for_processed_draw` | **C**/ding |
| `draws` | `trg_ding_aggregate_dryrun_on_processed_at` | `fn_ding_aggregate_dryrun_on_draw_processed` | dry-run still on |
| `results` | `trg_sync_room_winners_from_results` | `trg_sync_room_winners_from_results` | SoR |
| `rooms` | `trg_rooms_after_live` | `game_finance.trg_rooms_after_live` | finance |
| `rooms` | `trg_rooms_stamp_waiting_started_at` | `game_core.trg_rooms_stamp_waiting_started_at` | waiting |
| `rooms` | `trg_rooms_status_template_draining` | `trg_rooms_status_template_draining` | templates |
| `rooms` | `trg_debug_rooms_status` | `trg_debug_rooms_status` | debug — **D**? |
| card_pool* | updated_at / sync numbers | helpers | maintenance/pool |
| tournament_round_rooms | updated_at | `set_updated_at` | E |

Event triggers: none relevant found in this pass.

Views/matviews referencing heartbeat/batch orchestrators: **none** found.

`pg_depend` dependents of the five orchestrators: **empty** (expected — PL/pgSQL calls often lack hard deps). Body search used instead.

---

## Removal candidates (Category A)

**None.**

No DROP statements are proposed for execution. Hypothetical future drops would still be blocked until:

1. `REVOKE` from `anon`/`authenticated`/`PUBLIC` proven on DEV (repo has `20260721180000_p0b_lock_engine_queue_lifecycle_grants.sql` aimed at another project ref historically — **DEV ACLs still show anon EXECUTE** on heartbeat/batch/live_actions).
2. Hybrid/legacy rollback code and cron RESTORE scripts retired by explicit product decision.
3. External/API traffic analysis (PostgREST logs) proving zero calls.

---

## Objects that must remain

| Cluster | Why |
|---------|-----|
| Lease/claim/insert/finalize (`rpc_claim_*`, `rpc_insert_draw_*`, `rpc_finalize_engine_draw_job`, `rpc_pick_draw_jobs`) | **Railway runtime DB primitives** |
| `fn_evaluate_room_after_draw`, `fn_finish_room_and_settle`, wallet/commission | **Finance / settlement SoR** |
| `fn_janitor_*`, `fn_requeue_failed_draw_jobs`, `fn_stamp_orphan_*`, card-pool step, retention, partitions | **Maintenance** (active cron or janitor body) |
| `fn_heartbeat_tick`, `fn_manage_*`, `fn_process_draw_jobs_batch*` | **Rollback** (`hybrid` / `legacy_db` + RESTORE scripts) |
| Join/cancel/lobby/tournament admin RPCs | **Product SoR / API** |
| `trg_after_draw_enqueue` | **Shared** queue for both legacy batch and engine drain |

---

## Ambiguities

1. **PostgREST `db_schemas`:** session cannot read `pgrst.db_schemas` (NULL historically). `public` is assumed exposed; whether `game_core` is directly reachable via Data API is **unproven** — therefore game_core-only objects with PUBLIC EXECUTE are still **not A**.
2. **P0B grant lock:** migration exists in repo; **live DEV ACLs contradict “locked”** for heartbeat/batch/live_actions. Was it never applied to `yqnptpreowkimopxicfz`?
3. **Railway live `GAME_RUNTIME`:** not re-read this session (CLI historically unauthorized). Classification of heartbeat as **B** uses **repo hybrid caller**, not live env. If production were stuck on `hybrid`, heartbeat is still **active runtime** (would be **C**, not removable).
4. **Dual `fn_evaluate_room_after_draw`** (`public` vs `game_core` different arg names): which overloads are dead?
5. **`fn_payout_room` / `fn_payout_room_if_full` / `fn_confirm_win`:** soft-shim pattern; body callers sparse; product may still depend via unknown clients.
6. **`distribute_ding_on_draw` vs active ding triggers:** appears orphaned but grants remain — **D**.
7. **`fn_heartbeat_log` vs `fn_maintain_heartbeat_log_partitions`:** naming confusion; former looks unused — **D**.
8. **External scripts / Edge / webhooks:** no Edge source in repo for these RPCs; cannot prove absence of out-of-repo callers → blocks **A**.
9. **`trg_debug_rooms_status`:** may be debug-only — insufficient evidence for **A**.

---

## Proposed Wave 2C plan

### Wave 2C-1 — unquestionably dead SQL objects
**Empty for now.** Revisit only after: (a) grant lockdown applied+verified on this project, (b) PostgREST logs show zero hits for ≥N days, (c) no hybrid/legacy code paths.

### Wave 2C-2 — rollback-only orchestrator objects (defer)
Only after explicit “retire hybrid/`legacy_db`” decision:

- `public.fn_heartbeat_tick()`
- `public.fn_process_draw_jobs_batch()`
- `public.fn_process_draw_jobs_batch_worker(integer,integer)`
- Optionally keep `game_core.fn_manage_waiting_rooms` / `fn_manage_room_live_actions` longer if any admin/manual ops use them

Must update/remove: hybrid branch in `room-scheduler`, RESTORE scripts, docs. **Do not** drop while scripts remain.

### Wave 2C-3 — generated types / docs cleanup
- `src/types/supabase.ts` entries for batch workers
- Docs that still imply bingo crons are active (many already superseded in Wave 2A)
- Comment-only references

### Keep permanently
- All lease/draw/finalize/pick primitives used by Railway
- Settlement, wallet, join, cancel, tournament
- Janitor + card-pool + retention + partition jobs/functions
- `trg_after_draw_enqueue` and ding aggregate trigger (until product replaces)

---

## Validation plan (after any future SQL removal)

1. **Migration validation:** apply on branch DB; `pg_proc` absence checks; no broken `cron.job` commands.
2. **Railway health:** `/health` (or project health endpoint); worker roles up; no RPC errors in logs for dropped names.
3. **Full game lifecycle:** create/join waiting room → promote → draws → marks → line/full winners → settle → wallet delta audited.
4. **Join / room start / draw / winner / settlement / balance** each checked against PG snapshot APIs.
5. **Admin visibility:** games report, dashboard snapshot, card-pool status.
6. **Maintenance cron verification:** janitor, card-pool step, partitions, retention still succeed.
7. **Rollback procedure:** re-apply function DDL from last known migration + optionally RESTORE bingo crons **only** if intentionally falling back to DB clock (mutex runbook inverse); set `GAME_RUNTIME=hybrid` or `legacy_db` per runbook; verify single owner (no double-drive).

---

## Evidence appendix (methods)

- MCP `execute_sql` on `user-supabase_dev` / project `yqnptpreowkimopxicfz`
- Catalogs: `pg_proc`, `pg_trigger`, `cron.job`, ACLs (`proacl`), body `pg_get_functiondef` substring search
- Repo: `apps/engines/bingo/`, `app/`, `scripts/`, `sql/`, `docs/`, `src/types/supabase.ts`
- Distinctions enforced: scheduler ownership ≠ “all SQL is legacy”; Railway still depends on many DB RPCs

---

## Status

```
NO_SAFE_SQL_REMOVAL_FOUND
```
