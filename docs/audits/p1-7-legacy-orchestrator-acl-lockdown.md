# P1.7 — Legacy Orchestrator ACL Lockdown (Executed)

> **Date:** 2026-07-31  
> **Project:** `yqnptpreowkimopxicfz`  
> **Applied via:** Supabase MCP `apply_migration` name `p1_7_lock_legacy_orchestrator_acls`  
> **Recorded version:** `20260731125604`  
> **Repo file:** `sql/migrations/20260731125604_p1_7_lock_legacy_orchestrator_acls.sql`  
> **Prior:** P1.6 `READY_FOR_ACL_LOCKDOWN`

## Pre-check (PASSED)

| Check | Result |
|-------|--------|
| `GAME_RUNTIME` | `engine` |
| bingo_* crons | **absent** |
| Target signatures | **5/5 resolved** (no extra overloads) |
| ACL snapshot | saved (before table below) |

## Signatures modified

1. `public.fn_heartbeat_tick()`
2. `public.fn_process_draw_jobs_batch()`
3. `public.fn_process_draw_jobs_batch_worker(integer, integer)`
4. `game_core.fn_manage_waiting_rooms(integer, boolean)`
5. `game_core.fn_manage_room_live_actions()`

## Before / after ACL

| Signature | Before acl | Before anon/auth/service/postgres | After acl | After anon/auth/service/postgres |
|-----------|------------|-----------------------------------|-----------|----------------------------------|
| `fn_heartbeat_tick()` | PUBLIC+anon+auth+service+postgres | T/T/T/T | `{postgres=X,service_role=X}` | **F/F/T/T** |
| `fn_process_draw_jobs_batch()` | same | T/T/T/T | same | **F/F/T/T** |
| `fn_process_draw_jobs_batch_worker(int,int)` | same | T/T/T/T | same | **F/F/T/T** |
| `fn_manage_waiting_rooms(int,bool)` | PUBLIC+postgres+service | T*/T*/T/T (*via PUBLIC) | `{postgres=X,service_role=X}` | **F/F/T/T** |
| `fn_manage_room_live_actions()` | PUBLIC+anon+auth+service+postgres | T/T/T/T | `{postgres=X,service_role=X}` | **F/F/T/T** |

Untouched spot-check (`rpc_pick_draw_jobs`, `rpc_claim_game_room`, `rpc_insert_draw_if_ready`, `fn_janitor_sweep`, `fn_finish_room_and_settle`, `fn_wallet_apply_delta`): grants **unchanged**.

## Validation

| Item | Result |
|------|--------|
| Functions still exist | **5/5** |
| anon EXECUTE | **false** all five |
| authenticated EXECUTE | **false** all five |
| service_role EXECUTE | **true** all five |
| postgres EXECUTE | **true** all five |
| PUBLIC grant removed | **yes** (acl has only postgres + service_role) |
| Maintenance crons | `fn_generate_card_pool_step`, `fn_janitor_sweep`, `heartbeat_log_partitions`, `cleanup_retention` — **unchanged / active** |
| bingo_* | **still absent** |
| `service_role` can `SELECT public.fn_heartbeat_tick()` | **OK** (rollback path retained) |
| Railway `/health` | `{"ok":true,"service":"game-engine","redis":"disabled"}` |
| Railway logs | room-loop + DrawPicker continue; **no** permission denied / RPC / heartbeat / draw / scheduler failures attributed to lockdown |
| Interactive full game flow | **Not executed** this session (no player auth; `activeRooms=0`). Engine idle path healthy; lockdown does not gate engine RPCs. |

## Rollback SQL (do **not** auto-run)

```sql
BEGIN;

GRANT EXECUTE ON FUNCTION public.fn_heartbeat_tick() TO PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.fn_process_draw_jobs_batch() TO PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.fn_process_draw_jobs_batch_worker(integer, integer) TO PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION game_core.fn_manage_waiting_rooms(integer, boolean) TO PUBLIC, service_role;
GRANT EXECUTE ON FUNCTION game_core.fn_manage_room_live_actions() TO PUBLIC, anon, authenticated, service_role;

COMMIT;
```

## Status

```
ACL_LOCKDOWN_COMPLETE
```
