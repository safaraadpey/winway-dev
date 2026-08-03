# P1.9B Batch 0 — Server-Only ACL Hardening (Ready for Approval — NOT Applied)

> **Date:** 2026-07-31  
> **Project:** `yqnptpreowkimopxicfz` (`winway_dev`)  
> **Migration file:** `sql/migrations/20260731172739_p1_9b_batch_0_server_only_acl_hardening.sql`  
> **Applied:** **NO** (awaiting explicit operator approval)  
> **Prior:** P1.7 quarantine · P1.8 inventory · P1.9A ACL audit

---

## Status

```
BATCH_0_READY_FOR_APPROVAL
```

- Database changes made: **none**
- Migration applied: **no**
- Application / Railway / cron / env changes: **none**
- Commit / push: **none**

---

## Executive summary

Reviewed priority engine/finance candidates against Batch 0 admission rules.  
**Accepted: 22 signatures** (Railway/`service_role` + postgres/nested DEFINER only).  
**Rejected: wallet apply-delta pair** (admin API) plus several out-of-scope / uncertain / already-quarantined items.

Security impact if approved: removes PUBLIC/`anon`/`authenticated` EXECUTE from claim/lease/draw/finalize/settle/commission/janitor RPCs that today are client-callable while having **no internal caller authorization**.

---

## Counts

| Metric | Count |
|--------|------:|
| Candidate names / signatures reviewed (priority + schema twins) | **24** live signatures inspected (+ related rejects documented) |
| **Accepted into Batch 0** | **22** |
| **Rejected** | **2** wallet signatures (+ documented non-admitted siblings) |
| Migration applied | **no** |

---

## Admission rules (recap)

Include only if **all** hold:

1. Currently PUBLIC / anon / authenticated executable  
2. Legitimate callers ∈ {service_role, postgres, cron, trigger/internal}  
3. No browser / player / agent / admin **product** RPC requirement  
4. No authenticated PostgREST end-user requirement  
5. Nested DEFINER callers remain viable (owner/`postgres` EXECUTE retained)  
6. Exact signature known  
7. Rollback ACL captured from live catalog  
8. Confidence **HIGH**

---

## Accepted into Batch 0 (22)

Exact signatures (target ACL = `postgres` + `service_role` only):

1. `public.rpc_claim_game_room(uuid, text, integer)`
2. `public.rpc_release_game_room(uuid, text, bigint)`
3. `public.rpc_renew_game_room_lease(uuid, text, integer, bigint)`
4. `public.rpc_find_claimable_playing_rooms(integer)`
5. `public.rpc_has_earlier_unprocessed_draw(uuid, integer)`
6. `public.rpc_insert_draw_if_ready(uuid, integer, timestamp with time zone, integer)`
7. `public.rpc_insert_draw_if_ready_owner_guard(uuid, integer, timestamp with time zone, text, integer, timestamp with time zone, bigint)`
8. `public.rpc_pick_draw_jobs(integer)`
9. `game_core.rpc_pick_draw_jobs(integer)`
10. `game_core.rpc_pick_draw_jobs(integer, integer, integer)`
11. `public.rpc_apply_marks_for_draw(uuid, integer)`
12. `game_core.rpc_apply_marks_for_draw(uuid, integer)`
13. `public.rpc_finalize_engine_draw_job(bigint, uuid, integer, jsonb, jsonb, boolean, integer, jsonb, integer, integer, timestamp with time zone, timestamp with time zone, timestamp with time zone, timestamp with time zone, timestamp with time zone, text, bigint)`
14. `public.rpc_apply_ding_credits_for_draw(uuid, integer, integer, jsonb)`
15. `public.fn_evaluate_room_after_draw(uuid, integer)`
16. `game_core.fn_evaluate_room_after_draw(uuid, integer)`
17. `public.fn_finish_room_and_settle(uuid, uuid)`
18. `game_finance.fn_finish_room_and_settle(uuid, uuid)`
19. `game_finance.fn_record_ticket_commission(uuid)`
20. `game_finance.fn_distribute_ticket_commission(uuid, uuid)`
21. `public.fn_janitor_repair_unsettled_finished(integer)`
22. `game_core.fn_janitor_repair_unsettled_finished(integer)`

### Why safe

| Function group | Repository callers | App/browser callers | Nested / DB |
|----------------|--------------------|----------------------|-------------|
| `rpc_claim/renew/release/find_claimable` | `apps/engines/bingo/src/repositories/index.ts` | **none** | none required for clients |
| `rpc_insert_draw*`, `rpc_has_earlier*` | same repo | **none** | none |
| `rpc_pick_draw_jobs` | `pickDrawJobs.ts` / draw workers | **none** | quarantined batch workers (already service_role-only) |
| `rpc_apply_marks*`, `rpc_finalize*`, `rpc_apply_ding*` | draw processor / finalize path | **none** | finalize → ding credits |
| `fn_evaluate_room_after_draw` | `processDrawBatch.ts`, `reconcileWinners.ts` | **none** | may call settle |
| `fn_finish_room_and_settle` | `apps/engines/bingo/src/finance/index.ts` | **none** | evaluate / janitor / payout shims (DEFINER → postgres) |
| `fn_record/distribute_ticket_commission` | `finance/index.ts` | **none** | settle / ticket triggers (DEFINER) |
| `fn_janitor_repair_unsettled_finished` | `janitorRepair.ts` | **none** | calls settle as DEFINER |

No `app/`, `lib/`, `services/`, or `src/screens` `.rpc` call sites for these names (verified by ripgrep).

---

## Rejected from Batch 0

| Signature | Reason |
|-----------|--------|
| `public.fn_wallet_apply_delta(...)` | **Admin-facing application RPC** — `app/api/admin/wallet/adjust/route.ts` calls it via `getAdminContextOrThrow` service client. Excluded by Batch 0 “no admin-facing RPC” rule even though caller role is service_role. Defer until admin routes exclusively through `fn_adjust_wallet_manual` / transfer panel. |
| `game_finance.fn_wallet_apply_delta(...)` | Same core primitive; nested DEFINER parents and public wrapper depend on it. Locking only the finance schema while leaving `public` open does not close the client attack surface; locking both would be the correct security move **after** admin call-path remediation. **MANUAL_REVIEW / later batch.** |

### Reviewed but not admitted (out of Batch 0 scope / uncertain)

| Item | Reason |
|------|--------|
| P1.7 five quarantined orchestrators | Already locked; **do not touch** |
| `fn_system_join_or_create_room`, `api_get_room_state` | Railway HTTP helpers; eligible in a later batch but not required for Batch 0 priority list |
| `fn_tick_due_tournaments` / `fn_tick_tournament` / `fn_pick_dev_room_schedules` | Railway-only candidates for Batch 1; keep Batch 0 narrowly engine/settle |
| `fn_adjust_wallet_manual`, transfer panel, join, dashboard | Authenticated product RPCs — **forbidden** in Batch 0 |
| Soft shims (`fn_confirm_win`, `fn_payout_room*`, `update_ding_balance`) | P1.8 G-list / uncertain callers — **MANUAL_REVIEW_REQUIRED** |

---

## Before ACL (live catalog 2026-07-31)

Legend: `public_x` = PUBLIC EXECUTE via `aclexplode`; anon/auth = effective `has_function_privilege`.

| Signature | Mode | ACL (proacl) | PUBLIC | anon | auth | service | postgres |
|-----------|------|--------------|:------:|:----:|:----:|:-------:|:--------:|
| `public.rpc_claim_game_room(uuid,text,int)` | DEFINER | `{=X,postgres=X,anon=X,authenticated=X,service_role=X}` | T | T | T | T | T |
| `public.rpc_release_game_room(uuid,text,bigint)` | DEFINER | same pattern | T | T | T | T | T |
| `public.rpc_renew_game_room_lease(...)` | DEFINER | same | T | T | T | T | T |
| `public.rpc_find_claimable_playing_rooms(int)` | DEFINER | same | T | T | T | T | T |
| `public.rpc_has_earlier_unprocessed_draw(...)` | DEFINER | same | T | T | T | T | T |
| `public.rpc_insert_draw_if_ready(...)` | DEFINER | same | T | T | T | T | T |
| `public.rpc_insert_draw_if_ready_owner_guard(...)` | DEFINER | same | T | T | T | T | T |
| `public.rpc_pick_draw_jobs(int)` | DEFINER | same | T | T | T | T | T |
| `game_core.rpc_pick_draw_jobs(int)` | INVOKER | same | T | T | T | T | T |
| `game_core.rpc_pick_draw_jobs(int,int,int)` | INVOKER | `{=X,postgres=X,service_role=X}` | T | T* | T* | T | T |
| `public.rpc_apply_marks_for_draw(...)` | INVOKER | full PUBLIC+roles | T | T | T | T | T |
| `game_core.rpc_apply_marks_for_draw(...)` | INVOKER | full | T | T | T | T | T |
| `public.rpc_finalize_engine_draw_job(...)` | DEFINER | full | T | T | T | T | T |
| `public.rpc_apply_ding_credits_for_draw(...)` | DEFINER | full | T | T | T | T | T |
| `public.fn_evaluate_room_after_draw(...)` | DEFINER | full | T | T | T | T | T |
| `game_core.fn_evaluate_room_after_draw(...)` | INVOKER | full | T | T | T | T | T |
| `public.fn_finish_room_and_settle(uuid,uuid)` | DEFINER | full | T | T | T | T | T |
| `game_finance.fn_finish_room_and_settle(uuid,uuid)` | DEFINER | `{=X,postgres=X,service_role=X}` | T | T* | T* | T | T |
| `game_finance.fn_record_ticket_commission(uuid)` | DEFINER | `{=X,postgres=X,service_role=X}` | T | T* | T* | T | T |
| `game_finance.fn_distribute_ticket_commission(uuid,uuid)` | DEFINER | `{=X,postgres=X,service_role=X}` | T | T* | T* | T | T |
| `public.fn_janitor_repair_unsettled_finished(int)` | DEFINER | full | T | T | T | T | T |
| `game_core.fn_janitor_repair_unsettled_finished(int)` | DEFINER | `NULL` (default PUBLIC) | T | T | T | T | T |

\*Effective via PUBLIC inheritance when direct role grant absent.

### After (expected if applied)

For every accepted signature:

| Role | EXECUTE |
|------|---------|
| PUBLIC | **false** |
| anon | **false** |
| authenticated | **false** |
| service_role | **true** |
| postgres | **true** |

`proacl` expected shape: `{postgres=X/postgres,service_role=X/postgres}`

---

## Pre-apply analysis (per accepted group)

### Engine claim / lease

- **Callers:** Railway room-loop (`repositories/index.ts`) with service_role.  
- **Auth in body:** NONE (trusts caller + lease tokens).  
- **Proposed ACL:** postgres + service_role.  
- **Safe:** yes — browser must not claim rooms.

### Draw insert / pick / marks / finalize / ding

- **Callers:** Railway draw workers only.  
- **Nested:** finalize may call `rpc_apply_ding_credits_for_draw` as DEFINER (postgres).  
- **Safe:** yes.

### Evaluate + settle + commission

- **Callers:** Railway finance/draw paths; DB nested from evaluate/janitor/triggers.  
- **Nested rule:** DEFINER parents owned by postgres retain EXECUTE after REVOKE from PUBLIC.  
- **Safe:** yes — no app `.rpc`.

### Janitor repair

- **Callers:** Railway `janitorRepair.ts` only.  
- **Safe:** yes.

---

## Migration SQL

See: [`sql/migrations/20260731172739_p1_9b_batch_0_server_only_acl_hardening.sql`](../sql/migrations/20260731172739_p1_9b_batch_0_server_only_acl_hardening.sql)

Pattern (idempotent privilege-wise): for each `regprocedure`:

```sql
REVOKE ALL ON FUNCTION ... FROM PUBLIC;
REVOKE ALL ON FUNCTION ... FROM anon;
REVOKE ALL ON FUNCTION ... FROM authenticated;
GRANT EXECUTE ON FUNCTION ... TO postgres;
GRANT EXECUTE ON FUNCTION ... TO service_role;
```

No `ALTER DEFAULT PRIVILEGES`. No body/search_path/DEFINER changes.

---

## Rollback SQL (exact restore from before-state)

Run only if Batch 0 must be undone. Restores pre-migration grants (including PUBLIC and, where previously present, direct anon/authenticated).

```sql
BEGIN;

-- Functions that had full PUBLIC+anon+authenticated+service_role+postgres
GRANT EXECUTE ON FUNCTION public.rpc_claim_game_room(uuid, text, integer) TO PUBLIC, anon, authenticated, service_role, postgres;
GRANT EXECUTE ON FUNCTION public.rpc_release_game_room(uuid, text, bigint) TO PUBLIC, anon, authenticated, service_role, postgres;
GRANT EXECUTE ON FUNCTION public.rpc_renew_game_room_lease(uuid, text, integer, bigint) TO PUBLIC, anon, authenticated, service_role, postgres;
GRANT EXECUTE ON FUNCTION public.rpc_find_claimable_playing_rooms(integer) TO PUBLIC, anon, authenticated, service_role, postgres;
GRANT EXECUTE ON FUNCTION public.rpc_has_earlier_unprocessed_draw(uuid, integer) TO PUBLIC, anon, authenticated, service_role, postgres;
GRANT EXECUTE ON FUNCTION public.rpc_insert_draw_if_ready(uuid, integer, timestamp with time zone, integer) TO PUBLIC, anon, authenticated, service_role, postgres;
GRANT EXECUTE ON FUNCTION public.rpc_insert_draw_if_ready_owner_guard(uuid, integer, timestamp with time zone, text, integer, timestamp with time zone, bigint) TO PUBLIC, anon, authenticated, service_role, postgres;
GRANT EXECUTE ON FUNCTION public.rpc_pick_draw_jobs(integer) TO PUBLIC, anon, authenticated, service_role, postgres;
GRANT EXECUTE ON FUNCTION game_core.rpc_pick_draw_jobs(integer) TO PUBLIC, anon, authenticated, service_role, postgres;
GRANT EXECUTE ON FUNCTION public.rpc_apply_marks_for_draw(uuid, integer) TO PUBLIC, anon, authenticated, service_role, postgres;
GRANT EXECUTE ON FUNCTION game_core.rpc_apply_marks_for_draw(uuid, integer) TO PUBLIC, anon, authenticated, service_role, postgres;
GRANT EXECUTE ON FUNCTION public.rpc_finalize_engine_draw_job(bigint, uuid, integer, jsonb, jsonb, boolean, integer, jsonb, integer, integer, timestamp with time zone, timestamp with time zone, timestamp with time zone, timestamp with time zone, timestamp with time zone, text, bigint) TO PUBLIC, anon, authenticated, service_role, postgres;
GRANT EXECUTE ON FUNCTION public.rpc_apply_ding_credits_for_draw(uuid, integer, integer, jsonb) TO PUBLIC, anon, authenticated, service_role, postgres;
GRANT EXECUTE ON FUNCTION public.fn_evaluate_room_after_draw(uuid, integer) TO PUBLIC, anon, authenticated, service_role, postgres;
GRANT EXECUTE ON FUNCTION game_core.fn_evaluate_room_after_draw(uuid, integer) TO PUBLIC, anon, authenticated, service_role, postgres;
GRANT EXECUTE ON FUNCTION public.fn_finish_room_and_settle(uuid, uuid) TO PUBLIC, anon, authenticated, service_role, postgres;
GRANT EXECUTE ON FUNCTION public.fn_janitor_repair_unsettled_finished(integer) TO PUBLIC, anon, authenticated, service_role, postgres;

-- PUBLIC + postgres + service_role only (no direct anon/auth grants in proacl)
GRANT EXECUTE ON FUNCTION game_core.rpc_pick_draw_jobs(integer, integer, integer) TO PUBLIC, service_role, postgres;
GRANT EXECUTE ON FUNCTION game_finance.fn_finish_room_and_settle(uuid, uuid) TO PUBLIC, service_role, postgres;
GRANT EXECUTE ON FUNCTION game_finance.fn_record_ticket_commission(uuid) TO PUBLIC, service_role, postgres;
GRANT EXECUTE ON FUNCTION game_finance.fn_distribute_ticket_commission(uuid, uuid) TO PUBLIC, service_role, postgres;

-- Was NULL proacl (default PUBLIC EXECUTE); restore PUBLIC + explicit service/postgres
GRANT EXECUTE ON FUNCTION game_core.fn_janitor_repair_unsettled_finished(integer) TO PUBLIC, service_role, postgres;

COMMIT;
```

---

## Security impact

| Before | After (if applied) |
|--------|--------------------|
| Anonymous/authenticated JWT can `rpc` claim rooms, insert draws, finalize jobs, settle rooms, mutate ding credits via PostgREST | Only `service_role` / `postgres` |
| CRITICAL engine DEFINER surface shrinks for 22 signatures | Matches Railway trust model |
| `fn_wallet_apply_delta` still broadly granted | **Still CRITICAL** — deferred |

---

## Validation checklist (post-apply — not run yet)

### Database

- [ ] All 22 targets: anon/auth EXECUTE = false; service_role/postgres = true  
- [ ] Spot-check non-targets unchanged (`fn_join_or_create_room`, `fn_wallet_apply_delta`, P1.7 five)  
- [ ] Function definitions / `prosecdef` unchanged  
- [ ] `cron.job` unchanged (4 maintenance jobs)  
- [ ] Triggers unchanged  

### Railway

- [ ] `/health` ok  
- [ ] No permission-denied / missing-function / RPC failures in room-loop, draw, settle, wallet paths  

### Operator smoke (manual — Cursor will not claim to play)

- [ ] One lobby game  
- [ ] One tournament game  
- [ ] Join / countdown / draws / winners / settlement / balances / commission / admin visibility  

---

## Operator smoke-test checklist (request after apply)

Please run and report pass/fail:

1. Lobby: create/join → countdown → draws → winner → settle → wallet  
2. Tournament: entry → play → settle path  
3. Confirm admin panels still load (wallet adjust may still use `fn_wallet_apply_delta` — unchanged this batch)

---

## Next steps

1. **Approve** this batch explicitly.  
2. Apply migration via Supabase MCP/`apply_migration` (or approved process).  
3. Validate ACL + Railway health.  
4. Operator smoke tests.  
5. Later: remediate admin wallet adjust → then ACL-lock `fn_wallet_apply_delta`.

```
BATCH_0_READY_FOR_APPROVAL
```
