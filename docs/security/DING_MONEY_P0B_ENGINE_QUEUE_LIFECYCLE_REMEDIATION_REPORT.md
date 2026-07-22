# DING MONEY — P0-B Engine Queue Lifecycle Remediation Report

**Date:** 2026-07-21  
**Target:** Deployed Supabase **main** (`gtwgatewbagklpmxdlsj`) — branch `v02` **not modified**  
**Prerequisites:** [P0-A report](./DING_MONEY_P0A_FINANCIAL_DING_REMEDIATION_REPORT.md) · [P0-B plan](./DING_MONEY_P0B_ENGINE_QUEUE_LIFECYCLE_REMEDIATION_PLAN.md)

---

## 1. Executive summary

P0-B applied **one grant/RLS-hygiene migration** on main that removes direct **PUBLIC / anon / authenticated** access to **20** engine/queue/lifecycle RPCs and removes all **anon/authenticated** table privileges on `public.app_runtime_flags`. **service_role** retains required EXECUTE and table access. **No game logic, financial logic, runtime configuration, or production data** was changed.

| Item | Value |
|------|--------|
| Repo migration file | `sql/migrations/20260721180000_p0b_lock_engine_queue_lifecycle_grants.sql` |
| Applied on main (catalog) | `supabase_migrations.schema_migrations.version` **20260721161730**, name `20260721180000_p0b_lock_engine_queue_lifecycle_grants` |
| Functions locked | **20** |
| Default privileges | **Unchanged** (deferred P0-B2/P1) |
| Pre-apply vs plan | **Matched** — all targets broadly executable; apply proceeded |

---

## 2. Migration applied

Exact SQL matches the approved plan and repo file. Mechanism:

1. Temporary helper `pg_temp.p0b_lock_fn_to_service_role(regprocedure)`: revoke PUBLIC/anon/authenticated; grant service_role EXECUTE.
2. Loop over **20** exact `regprocedure` signatures.
3. `REVOKE ALL ON public.app_runtime_flags FROM anon, authenticated`; retain service_role table grants.

---

## 3. Functions locked (20)

### public (11)

| Function |
|----------|
| `public.fn_heartbeat_tick()` |
| `public.rpc_pick_draw_jobs(integer)` |
| `public.rpc_requeue_failed_draw_jobs()` |
| `public.fn_process_draw_jobs_batch()` |
| `public.fn_process_draw_jobs_batch_worker(integer, integer)` |
| `public.rpc_apply_marks_for_draw(uuid, integer)` |
| `public.rpc_claim_game_room(uuid, text, integer)` |
| `public.rpc_renew_game_room_lease(uuid, text, integer, bigint)` |
| `public.rpc_release_game_room(uuid, text, bigint)` |
| `public.rpc_insert_draw_if_ready(uuid, integer, timestamptz, integer)` |
| `public.rpc_insert_draw_if_ready_owner_guard(uuid, integer, timestamptz, text, integer, timestamptz, bigint)` |

### game_core (9)

| Function |
|----------|
| `game_core.rpc_pick_draw_jobs(integer)` |
| `game_core.rpc_pick_draw_jobs(integer, integer, integer)` |
| `game_core.fn_requeue_failed_draw_jobs()` |
| `game_core.fn_manage_waiting_rooms(integer, boolean)` |
| `game_core.fn_manage_room_live_actions()` |
| `game_core.fn_janitor_sweep()` |
| `game_core.fn_janitor_repair_unsettled_finished(integer)` |
| `game_core.fn_stamp_orphan_draws_on_terminal_rooms()` |
| `game_core.rpc_apply_marks_for_draw(uuid, integer)` |

---

## 4. Privileges revoked and retained

### Functions (all 20 locked targets)

| Role | EXECUTE before | EXECUTE after |
|------|----------------|---------------|
| PUBLIC | true | **false** |
| anon | true | **false** |
| authenticated | true | **false** |
| service_role | true | **true** |
| postgres (owner/cron) | owner privileges | **unchanged** |

### Intentionally unchanged (spot-check)

| Function | authenticated | service_role | Notes |
|----------|---------------|--------------|-------|
| `fn_join_or_create_room` | true | true | Browser join flow |
| `fn_cancel_waiting_room` | true | true | Cancel/refund flow |
| `fn_tournament_wallet_hold` | true | true | Tournament PWA |
| `public.fn_janitor_repair_unsettled_finished` | false | true | P0-A locked; engine janitor path |
| `rpc_finalize_engine_draw_job` | false | true | P0-A locked; draw processor |
| `rpc_find_claimable_playing_rooms` | true | true | **P0-B2 deferral** — read-only helper |

### `public.app_runtime_flags`

| Property | Before | After |
|----------|--------|-------|
| RLS enabled | true | **true** (unchanged) |
| FORCE RLS | false | **false** (unchanged) |
| Policies | 0 | **0** (unchanged) |
| anon grants | ALL column privs | **none** |
| authenticated grants | ALL column privs | **none** |
| service_role grants | ALL column privs | **SELECT, INSERT, UPDATE, DELETE, REFERENCES, TRIGGER, TRUNCATE** |

Legitimate access remains via **Next.js API routes** and **game-engine** using `createServiceClient()` (service_role).

---

## 5. Post-migration privilege matrix (catalog verification)

Verified with `has_function_privilege` on main immediately after apply. **All 20** locked functions:

```
PUBLIC=false  anon=false  authenticated=false  service_role=true
```

Full signature list matches §3; no exceptions.

---

## 6. Legitimate engine paths (why they still work)

| Flow | Caller | RPC / path | Role |
|------|--------|------------|------|
| Hybrid scheduler heartbeat | `room-scheduler` | `fn_heartbeat_tick` | service_role |
| Engine waiting promotion | `manageWaitingRooms` (TS) | Direct SQL via repo | service_role |
| Draw job pick | `pickDrawJobs` / `pickCoordinator` | `rpc_pick_draw_jobs` | service_role |
| Hybrid batch marks | `processDrawBatch` | `rpc_apply_marks_for_draw` | service_role |
| Room-loop lease | `GameRepo` | claim/renew/release RPCs | service_role |
| Room-loop draw insert | `GameRepo` | `rpc_insert_draw_if_ready_owner_guard` | service_role |
| Draw finalize | `GameRepo` | `rpc_finalize_engine_draw_job` | service_role (P0-A) |
| Janitor repair | `repairUnsettledFinishedRooms` | `public.fn_janitor_repair_unsettled_finished` | service_role (P0-A) |
| Stale job reaper | `reapStaleDrawJobs` | Direct `draw_jobs` UPDATE | service_role |
| pg_cron legacy jobs | postgres | All locked RPCs | **owner** — unaffected by client revokes |
| Global registration lock | Admin/player API routes | `app_runtime_flags` table | service_role |

**DB-internal chain preserved:** `fn_heartbeat_tick` (service_role or postgres) → `game_core.fn_manage_*` runs as **invoker**; service_role now holds EXECUTE on callees. `fn_janitor_sweep` (postgres cron) → internal calls use **owner** privileges.

---

## 7. Regression analysis

### Expected still working

- Hybrid `fn_heartbeat_tick` from engine scheduler
- Draw processor pick/dispatch/finalize pipeline
- Room-loop claim, insert, renew, release with lease epoch
- Janitor unsettled-room repair (public wrapper, P0-A)
- Tournament join/hold, room join/cancel (unchanged)
- Admin/player global registration lock APIs
- pg_cron jobs when `legacy_db` or cron still enabled (postgres role)

### Expected broken for attackers (intended)

- PostgREST `rpc('fn_heartbeat_tick')` as player → permission denied
- Client claim/requeue/lifecycle/lease RPCs → permission denied
- Direct client DML/SELECT on `app_runtime_flags` → denied (grants + RLS)

### Residual risk (P0-B2/P1)

- `rpc_find_claimable_playing_rooms`, `rpc_has_earlier_unprocessed_draw` still authenticated-executable (read-only reconnaissance)
- Broad `ALTER DEFAULT PRIVILEGES` for new functions on `public` schema
- Multi-replica without Redis + `COORDINATION_STRICT` (operational, not grant-layer)
- Repo SQL gaps: some `game_core` functions referenced in migrations but not CREATE’d in repo (live definitions exist on main)

---

## 8. Rollback procedure (emergency only)

**Re-opens P0-B attack surface. Do not run unless reverting a mistaken deploy.**

```sql
BEGIN;

-- Per locked function F (all 20 signatures from §3):
-- GRANT EXECUTE ON FUNCTION F TO PUBLIC, anon, authenticated, service_role;

-- Restore app_runtime_flags client grants (NOT recommended):
-- GRANT SELECT, INSERT, UPDATE, DELETE, REFERENCES, TRIGGER, TRUNCATE
--   ON public.app_runtime_flags TO anon, authenticated;

COMMIT;
```

Prefer **re-applying** the P0-B migration from repo if a legitimate caller was missed, then grant narrowly to that role only.

---

## 9. Remaining P0-B2 / P1 items

| Item | Status |
|------|--------|
| `ALTER DEFAULT PRIVILEGES` for `postgres` / `supabase_admin` | **Deferred** |
| Lock read-only engine helpers (`rpc_find_claimable_playing_rooms`, `rpc_has_earlier_unprocessed_draw`) | **Deferred P0-B2** |
| Version-control missing CREATE for `fn_manage_room_live_actions`, `fn_requeue_failed_draw_jobs`, `fn_stamp_orphan_draws_on_terminal_rooms` | **Deferred hygiene** |
| In-function authorization inside DEFINER bodies | Defense in depth |
| `FORCE ROW LEVEL SECURITY` on sensitive tables | Optional P1 |
| Dev/load-test RPC grant review | Separate scope |
| Retire legacy pg_cron when `legacy_db` fully decommissioned | Operational |

---

## 10. Staging smoke test plan (recommended)

No production mutation tests were run during apply. Recommended staging checks (from approved plan):

1. Waiting room promotion → playing  
2. Draw generation (room-loop + hybrid heartbeat)  
3. Draw job pick → processing  
4. Marks / evaluation / finalize / Ding / settlement / payout  
5. Stale job requeue via engine TS reaper  
6. Janitor repair tick  
7. Redis leader lock with `COORDINATION_STRICT=true`  
8. Global registration lock API (player GET, admin PATCH)  
9. Negative: anon/authenticated `rpc('fn_heartbeat_tick')` and `app_runtime_flags` UPDATE → fail  

---

*Report generated after live apply and read-only catalog verification on main (`gtwgatewbagklpmxdlsj`).*
