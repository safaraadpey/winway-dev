# P1.12 — Batch 1 Server-Only ACL Hardening

> **Date:** 2026-07-31  
> **Project:** `yqnptpreowkimopxicfz` (`winway_dev`)  
> **Migration:** `sql/migrations/20260731183309_p1_12_batch1_acl_hardening.sql`  
> **Applied:** **YES** (via Supabase MCP `apply_migration` → `p1_12_batch1_acl_hardening`)  
> **Source:** P1.11 Batch1 Ready = YES (12 functions)  
> **Commit / push:** **none**

---

## Status

```
BATCH_1_READY_FOR_MANUAL_TEST
```

- Scope: **ACL REVOKE/GRANT only**
- Function bodies / signatures / SECURITY mode / owners / cron / triggers / RLS: **unchanged**
- Application code: **unchanged**

---

## Affected functions (12)

| # | Signature | Mode | Before ACL (summary) | After ACL |
|---|-----------|------|----------------------|-----------|
| 1 | `game_core.fn_confirm_win(uuid, uuid, text)` | INVOKER | PUBLIC+anon+auth+postgres+service | **postgres, service_role** |
| 2 | `game_core.fn_payout_room(uuid)` | DEFINER | PUBLIC+anon+auth+postgres+service | **postgres, service_role** |
| 3 | `game_finance.fn_payout_room_prize(uuid)` | DEFINER | PUBLIC+postgres+service | **postgres, service_role** |
| 4 | `game_finance.fn_payout_winners(uuid)` | DEFINER | PUBLIC+postgres+service | **postgres, service_role** |
| 5 | `public.fn_payout_room_if_full(uuid)` | DEFINER | PUBLIC+anon+auth+postgres+service | **postgres, service_role** |
| 6 | `public.distribute_ding_on_draw()` | INVOKER | PUBLIC+anon+auth+postgres+service | **postgres, service_role** |
| 7 | `public.update_ding_balance(uuid, numeric)` | INVOKER | PUBLIC+anon+auth+postgres+service | **postgres, service_role** |
| 8 | `public.rpc_backfill_missed_engine_ding(uuid)` | DEFINER | anon+auth+postgres+service | **postgres, service_role** |
| 9 | `public.fn_tournament_wallet_capture(uuid, uuid, numeric, text)` | DEFINER | PUBLIC+anon+auth+postgres+service | **postgres, service_role** |
| 10 | `public.debug_ticket_counts(uuid)` | DEFINER | anon+auth+postgres+service | **postgres, service_role** |
| 11 | `public.debug_runtime_context(uuid)` | DEFINER | anon+auth+postgres+service | **postgres, service_role** |
| 12 | `public.test_active_cards_bypass_rls(uuid)` | DEFINER | anon+auth+postgres+service | **postgres, service_role** |

Exact post-state for all 12: `proacl = {postgres=X/postgres,service_role=X/postgres}`  
EXECUTE: postgres=true, service_role=true, anon=false, authenticated=false, PUBLIC=false  
def MD5 / mode / owner: **unchanged** (12/12)

---

## Excluded (not touched)

| Item | Reason |
|------|--------|
| `public.fn_admin_create_tournament` | P1.11 Batch1 **BLOCKED** (browser JWT) |
| `public.fn_admin_update_tournament` | P1.11 Batch1 **BLOCKED** |
| `public.fn_admin_delete_tournament` | P1.11 Batch1 **BLOCKED** |
| `public.fn_wallet_apply_delta` / `game_finance.fn_wallet_apply_delta` | HYBRID — out of Batch 1 |
| All CLIENT_RPC | Out of scope |
| Batch 0 (22) / P1.7 (5) | Already locked; verified unchanged |

---

## Non-target validation

| Control | Pre | Post | Result |
|---------|-----|------|--------|
| `public.fn_heartbeat_tick` (P1.7) | `{postgres,service_role}` / md5 `91001c7b…` | same | PASS |
| `public.fn_process_draw_jobs_batch` (P1.7) | `{postgres,service_role}` / md5 `7bf306d5…` | same | PASS |
| `public.rpc_claim_game_room` (Batch 0) | `{postgres,service_role}` / md5 `df853353…` | same | PASS |
| `public.fn_finish_room_and_settle` (Batch 0) | `{postgres,service_role}` / md5 `0c3612cc…` | same | PASS |
| `public.fn_admin_create_tournament` | broad PUBLIC+roles / md5 `12bce5e9…` | same | PASS |
| `public.fn_admin_update_tournament` | broad / md5 `5bf950b1…` | same | PASS |
| `public.fn_admin_delete_tournament` | broad / md5 `285a4f84…` | same | PASS |
| `public.fn_wallet_apply_delta` | broad / md5 `572f2f9e…` | same | PASS |
| `game_finance.fn_wallet_apply_delta` | PUBLIC+auth+postgres+service / md5 `23bac03a…` | same | PASS |
| `cron.job` (4 maintenance jobs) | jobs 1,6,8,9 | identical | PASS |
| Scoped triggers fingerprint | `trg_cnt=17` fp `ca57ca5a…` | same | PASS |

---

## Runtime verification

| Check | Result |
|-------|--------|
| Migration apply | **success** (no errors) |
| Railway `GET /health` | **PASS** `{"ok":true,"service":"game-engine","redis":"disabled"}` |
| `SET ROLE service_role` → `debug_ticket_counts` / `test_active_cards_bypass_rls` | **PASS** (executes) |
| `SET ROLE anon` → `debug_ticket_counts` | **PASS** `42501 permission denied` |
| `SET ROLE authenticated` → `update_ding_balance` | **PASS** `42501 permission denied` |

Manual lobby/tournament smoke: **not performed** (per brief).

---

## Operator next steps

1. Confirm gameroom still loads (debug RPCs via `createServiceClient` / service_role).  
2. Lobby + tournament smoke (join, play, settle, ding display).  
3. Confirm admin tournament create/edit/delete still works (wrappers intentionally unlocked).  
4. Confirm admin wallet adjust still works (`fn_wallet_apply_delta` untouched).

---

## Git

```
?? sql/migrations/20260731183309_p1_12_batch1_acl_hardening.sql
?? docs/audits/p1-12-batch1-acl-hardening.md
```

No commit / push.

```
BATCH_1_READY_FOR_MANUAL_TEST
```
