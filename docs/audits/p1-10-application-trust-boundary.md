# P1.10 - Application RPC Trust Boundary Audit (Read Only)

> **Date:** 2026-07-31  
> **Project:** `yqnptpreowkimopxicfz` (`winway_dev`)  
> **Mode:** Read-only (no migrations, ACL changes, SQL edits, code changes, commit/push)  
> **Prior:** P1.7 quarantine / P1.8 inventory / P1.9A ACL exposure / P1.9B Batch 0 (22 locked)  
> **Companion CSV:** [`p1-10-application-trust-boundary.csv`](./p1-10-application-trust-boundary.csv)

---

## Status

```
P1_10_AUDIT_COMPLETE
```

- Database / ACL / app code changes: **none**
- Batch 0 functions: **excluded** (22 signatures)
- Remaining functions audited: **183**

---

## Executive summary

| Category | Count |
|----------|------:|
| CLIENT_RPC | **43** |
| SERVER_RPC | **123** |
| HYBRID_RPC | **2** |
| UNSAFE_RPC | **15** |
| **Total remaining** | **183** |
| Batch 1 candidates (YES) | **80** |
| Batch 1 HIGH confidence | **18** |

**Recommended Batch 1 size:** **18** HIGH-confidence SERVER_RPC candidates (revoke PUBLIC/anon/authenticated; grant postgres+service_role).  
Defer MEDIUM (51), all HYBRID, and all UNSAFE until remediation.

**Note:** Repo references `get_user_referral_code_history` and `exec_sql`, but those functions are **absent from the live DEV catalog** (SQL file / scripts only) - excluded from counts.

**Estimated risk of Batch 1 (HIGH set):** **LOW-MEDIUM** - limited to Railway/admin-API/cron/server internals with no browser `.rpc` evidence; still require smoke (lobby + tournament + admin wallet/transfer/card-pool) after apply.

---

## Methodology

1. Live catalog via Supabase MCP (`pg_proc` in `public`, `game_core`, `game_finance`, `tournament`, `game_pool`, `load_test`, `monitor`), excluding Batch 0 OIDs and extension-owned procs.
2. ACL: `proacl` + `aclexplode` EXECUTE grantees.
3. Body auth heuristics: `auth.uid`, `auth.role`/`auth.jwt`, JWT `current_setting`, admin/role assert keywords, raise unauthorized.
4. Callers: repository `.rpc(` scan (`app/`, `lib/`, `services/`, `src/`, `game-engine/`, scripts); live `cron.job`; live triggers; nested SQL hints from prior audits.
5. Classification: exactly one of CLIENT / SERVER / HYBRID / UNSAFE.
6. Batch 1 candidate: SERVER_RPC with broad EXECUTE and no requirement for authenticated PostgREST (evidence-based).

### Limitations

| Limitation | Impact |
|------------|--------|
| Body auth is heuristic, not full formal review | Some ACCEPTABLE vs WEAK may need manual spot-check |
| Nested SQL edges incomplete vs full AST | Internals may be over-tagged SERVER |
| Orphan leaderboard helpers still count as CLIENT | Conservative retain EXECUTE |
| Local `.env` service_role key mismatch (other project) | Does not affect this catalog audit |
| No runtime exploit testing | Exposure classification only |

---

## Totals requested

1. **Total CLIENT_RPC:** 43  
2. **Total SERVER_RPC:** 123  
3. **Total HYBRID_RPC:** 2  
4. **Total UNSAFE_RPC:** 15  
5. **Recommended Batch 1 size:** 18 (HIGH only)  
6. **Estimated risk:** LOW-MEDIUM for HIGH Batch 1 set; HIGH residual risk remains in UNSAFE_RPC until remediated  

---

## CLIENT_RPC (43)

Must keep `authenticated` EXECUTE (and typically current grants) until call sites move behind service_role APIs.

| Schema | Function | Signature | Mode | Grantees | AuthZ | Batch1 | Conf |
|--------|----------|-----------|------|----------|-------|--------|------|
| game_core | signup_player_with_code | `p_invitation_code text, p_username text, p_nickname text, p_country text, p_language text` | DEFINER | PUBLIC,postgres,service_role | NONE | NO | MEDIUM |
| game_core | validate_invitation_code | `p_code text` | DEFINER | PUBLIC,postgres,service_role | NONE | NO | MEDIUM |
| public | can_read_user | `target_user_id uuid` | DEFINER | PUBLIC,anon,authenticated,postgres,service_role | ACCEPTABLE | NO | HIGH |
| public | can_read_user_in_tournament | `target_user_id uuid` | DEFINER | PUBLIC,anon,authenticated,postgres,service_role | ACCEPTABLE | NO | HIGH |
| public | fn_adjust_referral_wallet | `p_target_user uuid, p_amount numeric, p_currency text, p_type transaction_type, p_description text` | DEFINER | PUBLIC,anon,authenticated,postgres,service_role | STRONG | NO | MEDIUM |
| public | fn_adjust_wallet_manual | `p_target_user uuid, p_amount numeric, p_currency text, p_type transaction_type, p_description text` | DEFINER | PUBLIC,anon,authenticated,postgres,service_role | STRONG | NO | MEDIUM |
| public | fn_admin_set_tournament_status | `p_tournament_id uuid, p_status tournament_status` | DEFINER | PUBLIC,anon,authenticated,postgres,service_role | STRONG | NO | HIGH |
| public | fn_cancel_waiting_room | `p_room uuid, p_by_admin boolean` | DEFINER | PUBLIC,anon,authenticated,postgres,service_role | ACCEPTABLE | NO | HIGH |
| public | fn_cancel_waiting_room | `p_room uuid, p_by_admin boolean, p_user uuid` | DEFINER | PUBLIC,anon,authenticated,postgres,service_role | NONE | NO | HIGH |
| public | fn_dashboard_admin_commission_summary | `` | DEFINER | anon,authenticated,postgres,service_role | STRONG | NO | HIGH |
| public | fn_dashboard_admin_commission_summary_range | `p_from timestamp with time zone, p_to timestamp with time zone` | DEFINER | anon,authenticated,postgres,service_role | STRONG | NO | HIGH |
| public | fn_dashboard_admin_tournament_guarantee_summary | `` | DEFINER | anon,authenticated,postgres,service_role | STRONG | NO | HIGH |
| public | fn_dashboard_admin_tournament_guarantee_summary_range | `p_from timestamp with time zone, p_to timestamp with time zone` | DEFINER | anon,authenticated,postgres,service_role | STRONG | NO | HIGH |
| public | fn_join_or_create_room | `p_template_id uuid, p_card_count integer, p_password text` | DEFINER | PUBLIC,anon,authenticated,postgres,service_role | ACCEPTABLE | NO | HIGH |
| public | fn_leaderboard_weekly | `p_from timestamp with time zone, p_to timestamp with time zone` | DEFINER | PUBLIC,anon,authenticated,postgres,service_role | NONE | NO | HIGH |
| public | fn_my_active_rooms | `p_user_id uuid` | DEFINER | PUBLIC,anon,authenticated,postgres,service_role | STRONG | NO | HIGH |
| public | fn_ping_presence | `` | DEFINER | anon,authenticated,postgres,service_role | ACCEPTABLE | NO | HIGH |
| public | fn_player_game_stats | `p_user_id uuid, p_from timestamp with time zone, p_to timestamp with time zone` | DEFINER | PUBLIC,anon,authenticated,postgres,service_role | STRONG | NO | HIGH |
| public | fn_player_purchase_history | `p_user_id uuid, p_from timestamp with time zone, p_to timestamp with time zone` | INVOKER | PUBLIC,anon,authenticated,postgres,service_role | NONE | NO | HIGH |
| public | fn_player_stats | `p_user_id uuid, p_date timestamp with time zone` | DEFINER | PUBLIC,anon,authenticated,postgres,service_role | NONE | NO | HIGH |
| public | fn_rooms_by_ids | `p_room_ids uuid[], p_template_ids uuid[]` | INVOKER | PUBLIC,anon,authenticated,postgres,service_role | NONE | NO | HIGH |
| public | fn_tournament_wallet_hold | `p_tournament_id uuid, p_qty integer, p_currency text, p_entry_id uuid` | DEFINER | PUBLIC,anon,authenticated,postgres,service_role | ACCEPTABLE | NO | HIGH |
| public | fn_tournament_wallet_release | `p_tournament_id uuid, p_currency text, p_entry_id uuid` | DEFINER | PUBLIC,anon,authenticated,postgres,service_role | ACCEPTABLE | NO | HIGH |
| public | fn_wallet_transfer_panel | `p_target_id uuid, p_amount bigint, p_action text, p_description text, p_meta jsonb` | DEFINER | anon,authenticated,postgres,service_role | STRONG | NO | HIGH |
| public | fn_wallet_transfer_panel | `p_target_id uuid, p_currency text, p_amount bigint, p_direction text, p_description text` | DEFINER | PUBLIC,anon,authenticated,postgres,service_role | NONE | NO | HIGH |
| public | fn_wallet_transfer_panel_bulk | `p_target_ids uuid[], p_currency text, p_amount bigint, p_direction text, p_description text` | DEFINER | PUBLIC,anon,authenticated,postgres,service_role | STRONG | NO | HIGH |
| public | get_daily_leaders | `limit_count integer` | DEFINER | PUBLIC,anon,authenticated,postgres,service_role | NONE | NO | MEDIUM |
| public | get_daily_leaders_by_date | `target_date date, limit_count integer` | DEFINER | PUBLIC,anon,authenticated,postgres,service_role | NONE | NO | MEDIUM |
| public | get_weekly_leaders | `limit_count integer` | DEFINER | PUBLIC,anon,authenticated,postgres,service_role | NONE | NO | MEDIUM |
| public | is_admin_active | `` | DEFINER | PUBLIC,anon,authenticated,postgres,service_role | STRONG | NO | HIGH |
| public | is_tournament_participant | `p_tournament_id uuid` | DEFINER | PUBLIC,anon,authenticated,postgres,service_role | ACCEPTABLE | NO | HIGH |
| public | rpc_register_player | `p_username text, p_referral_code text` | DEFINER | PUBLIC,anon,authenticated,postgres,service_role | ACCEPTABLE | NO | MEDIUM |
| tournament | buy_tickets | `p_tournament_id uuid, p_delta integer` | DEFINER | PUBLIC,authenticated,postgres | STRONG | NO | MEDIUM |
| tournament | cancel_registration | `p_tournament_id uuid` | DEFINER | PUBLIC,authenticated,postgres | STRONG | NO | MEDIUM |
| tournament | capture_entry_locks | `p_tournament_id uuid` | DEFINER | PUBLIC,authenticated,postgres | STRONG | NO | MEDIUM |
| tournament | fn_admin_create_tournament | `p_payload jsonb` | DEFINER | PUBLIC,authenticated,postgres | STRONG | NO | MEDIUM |
| tournament | fn_admin_delete_tournament | `p_tournament_id uuid` | DEFINER | PUBLIC,authenticated,postgres | STRONG | NO | MEDIUM |
| tournament | fn_admin_refund_cancelled_tournament | `p_tournament_id uuid` | DEFINER | PUBLIC,postgres | STRONG | NO | MEDIUM |
| tournament | fn_admin_set_tournament_status | `p_tournament_id uuid, p_status tournament_status` | DEFINER | PUBLIC,authenticated,postgres | STRONG | NO | MEDIUM |
| tournament | fn_admin_update_tournament | `p_tournament_id uuid, p_patch jsonb` | DEFINER | PUBLIC,authenticated,postgres | STRONG | NO | MEDIUM |
| tournament | get_my_registration | `p_tournament_id uuid` | DEFINER | PUBLIC,authenticated,postgres | ACCEPTABLE | NO | MEDIUM |
| tournament | open_registration | `p_tournament_id uuid` | DEFINER | PUBLIC,authenticated,postgres | STRONG | NO | MEDIUM |
| tournament | sync_my_entry_lock | `p_tournament_id uuid` | DEFINER | PUBLIC,authenticated,postgres | STRONG | NO | MEDIUM |

### Why authenticated must retain EXECUTE

| Function | Why | Auth enforced |
|----------|-----|---------------|
| `game_core.signup_player_with_code` | Browser and/or user-JWT API `.rpc` in repo | Weak/absent in SQL --- rely on RLS/API carefully; still CLIENT by caller evidence +  client JWT |
| `game_core.validate_invitation_code` | Browser and/or user-JWT API `.rpc` in repo | Weak/absent in SQL --- rely on RLS/API carefully; still CLIENT by caller evidence +  client JWT |
| `public.can_read_user` | Browser and/or user-JWT API `.rpc` in repo | Inside SQL (auth.uid / manual gates) +  client JWT |
| `public.can_read_user_in_tournament` | Browser and/or user-JWT API `.rpc` in repo | Inside SQL (auth.uid / manual gates) +  client JWT |
| `public.fn_adjust_referral_wallet` | Browser and/or user-JWT API `.rpc` in repo | Inside SQL (auth.uid / manual gates) +  client JWT |
| `public.fn_adjust_wallet_manual` | Browser and/or user-JWT API `.rpc` in repo | Inside SQL (auth.uid / manual gates) +  client JWT |
| `public.fn_admin_set_tournament_status` | Browser and/or user-JWT API `.rpc` in repo | Inside SQL (auth.uid / manual gates) +  client JWT |
| `public.fn_cancel_waiting_room` | Browser and/or user-JWT API `.rpc` in repo | Inside SQL (auth.uid / manual gates) +  API route session checks |
| `public.fn_cancel_waiting_room` | Browser and/or user-JWT API `.rpc` in repo | Weak/absent in SQL --- rely on RLS/API carefully; still CLIENT by caller evidence +  API route session checks |
| `public.fn_dashboard_admin_commission_summary` | Browser and/or user-JWT API `.rpc` in repo | Inside SQL (auth.uid / manual gates) +  API route session checks |
| `public.fn_dashboard_admin_commission_summary_range` | Browser and/or user-JWT API `.rpc` in repo | Inside SQL (auth.uid / manual gates) +  client JWT |
| `public.fn_dashboard_admin_tournament_guarantee_summary` | Browser and/or user-JWT API `.rpc` in repo | Inside SQL (auth.uid / manual gates) +  API route session checks |
| `public.fn_dashboard_admin_tournament_guarantee_summary_range` | Browser and/or user-JWT API `.rpc` in repo | Inside SQL (auth.uid / manual gates) +  client JWT |
| `public.fn_join_or_create_room` | Browser and/or user-JWT API `.rpc` in repo | Inside SQL (auth.uid / manual gates) +  client JWT |
| `public.fn_leaderboard_weekly` | Browser and/or user-JWT API `.rpc` in repo | Weak/absent in SQL --- rely on RLS/API carefully; still CLIENT by caller evidence +  client JWT |
| `public.fn_my_active_rooms` | Browser and/or user-JWT API `.rpc` in repo | Inside SQL (auth.uid / manual gates) +  API route session checks |
| `public.fn_ping_presence` | Browser and/or user-JWT API `.rpc` in repo | Inside SQL (auth.uid / manual gates) +  API route session checks |
| `public.fn_player_game_stats` | Browser and/or user-JWT API `.rpc` in repo | Inside SQL (auth.uid / manual gates) +  client JWT |
| `public.fn_player_purchase_history` | Browser and/or user-JWT API `.rpc` in repo | Weak/absent in SQL --- rely on RLS/API carefully; still CLIENT by caller evidence +  client JWT |
| `public.fn_player_stats` | Browser and/or user-JWT API `.rpc` in repo | Weak/absent in SQL --- rely on RLS/API carefully; still CLIENT by caller evidence +  client JWT |
| `public.fn_rooms_by_ids` | Browser and/or user-JWT API `.rpc` in repo | Weak/absent in SQL --- rely on RLS/API carefully; still CLIENT by caller evidence +  client JWT |
| `public.fn_tournament_wallet_hold` | Browser and/or user-JWT API `.rpc` in repo | Inside SQL (auth.uid / manual gates) +  client JWT |
| `public.fn_tournament_wallet_release` | Browser and/or user-JWT API `.rpc` in repo | Inside SQL (auth.uid / manual gates) +  client JWT |
| `public.fn_wallet_transfer_panel` | Browser and/or user-JWT API `.rpc` in repo | Inside SQL (auth.uid / manual gates) +  API route session checks |
| `public.fn_wallet_transfer_panel` | Browser and/or user-JWT API `.rpc` in repo | Weak/absent in SQL --- rely on RLS/API carefully; still CLIENT by caller evidence +  API route session checks |
| `public.fn_wallet_transfer_panel_bulk` | Browser and/or user-JWT API `.rpc` in repo | Inside SQL (auth.uid / manual gates) +  API route session checks |
| `public.get_daily_leaders` | Browser and/or user-JWT API `.rpc` in repo | Weak/absent in SQL --- rely on RLS/API carefully; still CLIENT by caller evidence +  client JWT |
| `public.get_daily_leaders_by_date` | Browser and/or user-JWT API `.rpc` in repo | Weak/absent in SQL --- rely on RLS/API carefully; still CLIENT by caller evidence +  client JWT |
| `public.get_weekly_leaders` | Browser and/or user-JWT API `.rpc` in repo | Weak/absent in SQL --- rely on RLS/API carefully; still CLIENT by caller evidence +  client JWT |
| `public.is_admin_active` | Browser and/or user-JWT API `.rpc` in repo | Inside SQL (auth.uid / manual gates) +  client JWT |
| `public.is_tournament_participant` | Browser and/or user-JWT API `.rpc` in repo | Inside SQL (auth.uid / manual gates) +  client JWT |
| `public.rpc_register_player` | Browser and/or user-JWT API `.rpc` in repo | Inside SQL (auth.uid / manual gates) +  client JWT |
| `tournament.buy_tickets` | Browser and/or user-JWT API `.rpc` in repo | Inside SQL (auth.uid / manual gates) +  client JWT |
| `tournament.cancel_registration` | Browser and/or user-JWT API `.rpc` in repo | Inside SQL (auth.uid / manual gates) +  client JWT |
| `tournament.capture_entry_locks` | Browser and/or user-JWT API `.rpc` in repo | Inside SQL (auth.uid / manual gates) +  client JWT |
| `tournament.fn_admin_create_tournament` | Browser and/or user-JWT API `.rpc` in repo | Inside SQL (auth.uid / manual gates) +  client JWT |
| `tournament.fn_admin_delete_tournament` | Browser and/or user-JWT API `.rpc` in repo | Inside SQL (auth.uid / manual gates) +  client JWT |
| `tournament.fn_admin_refund_cancelled_tournament` | Browser and/or user-JWT API `.rpc` in repo | Inside SQL (auth.uid / manual gates) +  client JWT |
| `tournament.fn_admin_set_tournament_status` | Browser and/or user-JWT API `.rpc` in repo | Inside SQL (auth.uid / manual gates) +  client JWT |
| `tournament.fn_admin_update_tournament` | Browser and/or user-JWT API `.rpc` in repo | Inside SQL (auth.uid / manual gates) +  client JWT |
| `tournament.get_my_registration` | Browser and/or user-JWT API `.rpc` in repo | Inside SQL (auth.uid / manual gates) +  client JWT |
| `tournament.open_registration` | Browser and/or user-JWT API `.rpc` in repo | Inside SQL (auth.uid / manual gates) +  client JWT |
| `tournament.sync_my_entry_lock` | Browser and/or user-JWT API `.rpc` in repo | Inside SQL (auth.uid / manual gates) +  client JWT |

---

## HYBRID_RPC (2)

Needs architectural refactor before ACL reduction.

| Schema | Function | Signature | Mode | Grantees | AuthZ | Notes | Conf |
|--------|----------|-----------|------|----------|-------|-------|------|
| game_finance | fn_wallet_apply_delta | `p_user_id uuid, p_currency text, p_amount_delta numeric, p_transaction_type transaction_type, p_source_kind text, p_source_ref text, p_description text, p_meta jsonb, p_allow_negative boolean` | DEFINER | PUBLIC,authenticated,postgres,service_role | NONE | Admin API (service_role after app auth) + Railway finance; locking authenticated would be OK for PostgREST user JWT but Batch0 excluded admin-facing; refactor to dedicated admin RPC first | HIGH |
| public | fn_wallet_apply_delta | `p_user_id uuid, p_currency text, p_amount_delta numeric, p_transaction_type transaction_type, p_source_kind text, p_source_ref text, p_description text, p_meta jsonb, p_allow_negative boolean` | DEFINER | PUBLIC,anon,authenticated,postgres,service_role | NONE | Admin API (service_role after app auth) + Railway finance; locking authenticated would be OK for PostgREST user JWT but Batch0 excluded admin-facing; refactor to dedicated admin RPC first | HIGH |

---

## UNSAFE_RPC (15)

Broadly executable without sufficient authorization and/or privileged shims without trusted-only callers.

| Schema | Function | Signature | Mode | Grantees | AuthZ | Why unsafe | Conf |
|--------|----------|-----------|------|----------|-------|------------|------|
| game_core | fn_confirm_win | `p_room_id uuid, p_ticket_id uuid, p_type text` | INVOKER | PUBLIC,anon,authenticated,postgres,service_role | NONE | Privileged DEFINER/shim with broad EXECUTE, no verified product caller, insufficient body authorization | HIGH |
| game_core | fn_payout_room | `p_room uuid` | DEFINER | PUBLIC,anon,authenticated,postgres,service_role | NONE | Privileged DEFINER/shim with broad EXECUTE, no verified product caller, insufficient body authorization | HIGH |
| game_finance | fn_payout_room_prize | `p_room uuid` | DEFINER | PUBLIC,postgres,service_role | NONE | Privileged DEFINER/shim with broad EXECUTE, no verified product caller, insufficient body authorization | HIGH |
| game_finance | fn_payout_winners | `p_room uuid` | DEFINER | PUBLIC,postgres,service_role | NONE | Privileged shim/payout with broad EXECUTE, no body auth, no verified product .rpc --- manual review before lock or drop | HIGH |
| public | debug_runtime_context | `p_room_id uuid` | DEFINER | anon,authenticated,postgres,service_role | WEAK | Debug/test RPC with broad EXECUTE and no body authorization; lock after confirming no product need --- not auto Batch1 | HIGH |
| public | debug_ticket_counts | `p_room_id uuid` | DEFINER | anon,authenticated,postgres,service_role | NONE | Debug/test RPC with broad EXECUTE and no body authorization; lock after confirming no product need --- not auto Batch1 | HIGH |
| public | distribute_ding_on_draw | `` | INVOKER | PUBLIC,anon,authenticated,postgres,service_role | NONE | Privileged DEFINER/shim with broad EXECUTE, no verified product caller, insufficient body authorization | HIGH |
| public | fn_admin_create_tournament | `p_payload jsonb` | DEFINER | PUBLIC,anon,authenticated,postgres,service_role | NONE | Admin browser .rpc caller exists, but public DEFINER body has no auth.uid/admin gate while PUBLIC/authenticated can EXECUTE | HIGH |
| public | fn_admin_delete_tournament | `p_tournament_id uuid` | DEFINER | PUBLIC,anon,authenticated,postgres,service_role | NONE | Admin browser .rpc caller exists, but public DEFINER body has no auth.uid/admin gate while PUBLIC/authenticated can EXECUTE | HIGH |
| public | fn_admin_update_tournament | `p_tournament_id uuid, p_patch jsonb` | DEFINER | PUBLIC,anon,authenticated,postgres,service_role | NONE | Admin browser .rpc caller exists, but public DEFINER body has no auth.uid/admin gate while PUBLIC/authenticated can EXECUTE | HIGH |
| public | fn_payout_room_if_full | `p_room_id uuid` | DEFINER | PUBLIC,anon,authenticated,postgres,service_role | NONE | Privileged DEFINER/shim with broad EXECUTE, no verified product caller, insufficient body authorization | HIGH |
| public | fn_tournament_wallet_capture | `p_tournament_id uuid, p_entry_id uuid, p_amount numeric, p_currency text` | DEFINER | PUBLIC,anon,authenticated,postgres,service_role | NONE | Broad EXECUTE + DEFINER + no internal auth + no verified trusted-only caller path in repo | MEDIUM |
| public | rpc_backfill_missed_engine_ding | `p_room_id uuid` | DEFINER | anon,authenticated,postgres,service_role | NONE | Broad EXECUTE + DEFINER + no internal auth + no verified trusted-only caller path in repo | MEDIUM |
| public | test_active_cards_bypass_rls | `p_room_id uuid` | DEFINER | anon,authenticated,postgres,service_role | NONE | Debug/test RPC with broad EXECUTE and no body authorization; lock after confirming no product need --- not auto Batch1 | HIGH |
| public | update_ding_balance | `p_user_id uuid, p_amount numeric` | INVOKER | PUBLIC,anon,authenticated,postgres,service_role | NONE | Privileged DEFINER/shim with broad EXECUTE, no verified product caller, insufficient body authorization | HIGH |

**Do not auto-include UNSAFE in Batch 1** without either locking after confirming zero product need, or adding body auth / retiring the function.

---

## SERVER_RPC (123)

### Batch 1 candidates (YES)

Can Batch 1 safely revoke PUBLIC / anon / authenticated?

| Schema | Function | Signature | Mode | Grantees | Auth model | Batch1 safe? | Evidence | Conf |
|--------|----------|-----------|------|----------|------------|--------------|----------|------|
| game_core | api_get_room_state | `p_room_id uuid` | INVOKER | PUBLIC,postgres,service_role | None | **YES** if callers are service_role/postgres/cron only | Railway/game-engine caller only; browser=NO api=NO railway=YES cron=NO | HIGH |
| public | fn_admin_games_report | `p_from timestamp with time zone, p_to timestamp with time zone, p_limit integer, p_offset integer` | DEFINER | PUBLIC,anon,authenticated,postgres,service_role | None | **YES** if callers are service_role/postgres/cron only | app/api/admin/games/report uses service_role admin context; no browser .rpc; browser=NO api=YES railway=NO cron=NO | HIGH |
| public | fn_cleanup_retention | `` | INVOKER | PUBLIC,anon,authenticated,postgres,service_role | None | **YES** if callers are service_role/postgres/cron only | Cron/maintenance entrypoint; browser=NO api=NO railway=YES cron=YES | HIGH |
| public | fn_dev_panel_dev_player_finance_summary | `p_period text, p_timezone text` | DEFINER | anon,authenticated,postgres,service_role | None | **YES** if callers are service_role/postgres/cron only | Invoked only via Next.js admin/dev API with service_role after app auth; no browser .rpc; browser=NO api=YES railway=NO cron=NO | HIGH |
| game_core | fn_generate_card_pool | `p_card_count integer, p_created_by uuid, p_prng_version text` | DEFINER | PUBLIC,postgres,service_role | None | **YES** if callers are service_role/postgres/cron only | app/api/admin/card-pool/generate uses getAdminContext service_role; no browser .rpc; browser=NO api=YES railway=NO cron=YES | HIGH |
| public | fn_generate_card_pool | `p_card_count integer, p_created_by uuid, p_prng_version text` | DEFINER | PUBLIC,anon,authenticated,postgres,service_role | None | **YES** if callers are service_role/postgres/cron only | app/api/admin/card-pool/generate uses getAdminContext service_role; no browser .rpc; browser=NO api=YES railway=NO cron=YES | HIGH |
| game_core | fn_generate_card_pool_step | `p_batch_size integer` | DEFINER | PUBLIC,postgres,service_role | None | **YES** if callers are service_role/postgres/cron only | Cron/maintenance entrypoint; browser=NO api=NO railway=YES cron=YES | HIGH |
| game_core | fn_janitor_sweep | `` | DEFINER | PUBLIC,postgres,service_role | None | **YES** if callers are service_role/postgres/cron only | Cron/maintenance entrypoint; browser=NO api=NO railway=YES cron=YES | HIGH |
| public | fn_maintain_heartbeat_log_partitions | `p_keep_days integer, p_future_days integer` | INVOKER | PUBLIC,anon,authenticated,postgres,service_role | None | **YES** if callers are service_role/postgres/cron only | Cron/maintenance entrypoint; browser=NO api=NO railway=YES cron=YES | HIGH |
| public | fn_pick_dev_room_schedules | `p_limit integer` | DEFINER | PUBLIC,anon,authenticated,postgres,service_role | None | **YES** if callers are service_role/postgres/cron only | Railway/game-engine caller only; browser=NO api=NO railway=YES cron=NO | HIGH |
| game_core | fn_system_join_or_create_room | `p_user_id uuid, p_template_id uuid, p_card_count integer, p_password text` | DEFINER | PUBLIC,postgres,service_role | auth.role()/jwt+raises_auth | **YES** if callers are service_role/postgres/cron only | Railway/game-engine caller only; browser=NO api=NO railway=YES cron=NO | HIGH |
| public | fn_system_join_or_create_room | `p_user_id uuid, p_template_id uuid, p_card_count integer, p_password text` | DEFINER | PUBLIC,anon,authenticated,postgres,service_role | None | **YES** if callers are service_role/postgres/cron only | Railway/game-engine caller only; browser=NO api=NO railway=YES cron=NO | HIGH |
| public | fn_tick_due_tournaments | `p_limit integer, p_seed bigint, p_batch_tables integer` | DEFINER | PUBLIC,anon,authenticated,postgres,service_role | None | **YES** if callers are service_role/postgres/cron only | Railway/game-engine caller only; browser=NO api=NO railway=YES cron=NO | HIGH |
| tournament | fn_tick_due_tournaments | `p_limit integer, p_seed bigint, p_batch_tables integer` | DEFINER | PUBLIC,postgres | None | **YES** if callers are service_role/postgres/cron only | Railway/game-engine caller only; browser=NO api=NO railway=YES cron=NO | HIGH |
| public | fn_tick_tournament | `p_tournament_id uuid, p_seed bigint, p_batch_tables integer[]` | DEFINER | PUBLIC,anon,authenticated,postgres,service_role | None | **YES** if callers are service_role/postgres/cron only | Railway/game-engine caller only; browser=NO api=NO railway=YES cron=NO | HIGH |
| tournament | fn_tick_tournament | `p_tournament_id uuid, p_seed bigint, p_batch_tables integer[]` | DEFINER | PUBLIC,postgres | None | **YES** if callers are service_role/postgres/cron only | Railway/game-engine caller only; browser=NO api=NO railway=YES cron=NO | HIGH |
| public | load_test_cleanup | `p_tag text` | DEFINER | anon,authenticated,postgres,service_role | None | **YES** if callers are service_role/postgres/cron only | Ops/script only; browser=NO api=NO railway=YES cron=NO | HIGH |
| public | load_test_seed_playing_rooms | `p_room_count integer, p_tickets_per_room integer, p_draw_interval_sec integer, p_tag text` | DEFINER | anon,authenticated,postgres,service_role | jwt_setting | **YES** if callers are service_role/postgres/cron only | Ops/script only; browser=NO api=NO railway=YES cron=NO | HIGH |
| public | fn_backfill_card_bitmask_definitions | `` | INVOKER | PUBLIC,anon,authenticated,postgres,service_role | None | **YES** if callers are service_role/postgres/cron only | No repository browser/API caller found; treat as server/SQL internal; browser=NO api=NO railway=NO cron=NO | LOW |
| public | fn_draw_schedule_jitter_ms | `p_room_id uuid` | DEFINER | PUBLIC,anon,authenticated,postgres,service_role | None | **YES** if callers are service_role/postgres/cron only | No repository browser/API caller found; treat as server/SQL internal; browser=NO api=NO railway=NO cron=NO | LOW |
| public | fn_generate_room_code | `` | INVOKER | PUBLIC,anon,authenticated,postgres,service_role | None | **YES** if callers are service_role/postgres/cron only | No repository browser/API caller found; treat as server/SQL internal; browser=NO api=NO railway=NO cron=NO | LOW |
| public | fn_heartbeat_log | `` | INVOKER | PUBLIC,anon,authenticated,postgres,service_role | None | **YES** if callers are service_role/postgres/cron only | No repository browser/API caller found; treat as server/SQL internal; browser=NO api=NO railway=NO cron=NO | LOW |
| public | fn_join_or_create_room_base | `p_template_id uuid, p_card_count integer, p_password text` | DEFINER | PUBLIC,anon,authenticated,postgres,service_role | None | **YES** if callers are service_role/postgres/cron only | No repository browser/API caller found; treat as server/SQL internal; browser=NO api=NO railway=NO cron=NO | LOW |
| public | fn_tournament_entry_upsert | `p_tournament_id uuid, p_user_id uuid, p_qty integer, p_amount numeric, p_status tournament_entry_status` | DEFINER | PUBLIC,anon,authenticated,postgres,service_role | None | **YES** if callers are service_role/postgres/cron only | No repository browser/API caller found; treat as server/SQL internal; browser=NO api=NO railway=NO cron=NO | LOW |
| public | fn_try_mark_template_inactive_if_drained | `p_template_id uuid` | DEFINER | PUBLIC,anon,authenticated,postgres,service_role | None | **YES** if callers are service_role/postgres/cron only | No repository browser/API caller found; treat as server/SQL internal; browser=NO api=NO railway=NO cron=NO | LOW |
| public | make_short_id_from_uuid | `p_id uuid` | INVOKER | PUBLIC,anon,authenticated,postgres,service_role | None | **YES** if callers are service_role/postgres/cron only | No repository browser/API caller found; treat as server/SQL internal; browser=NO api=NO railway=NO cron=NO | LOW |
| public | rpc_requeue_failed_draw_jobs | `` | DEFINER | PUBLIC,anon,authenticated,postgres,service_role | None | **YES** if callers are service_role/postgres/cron only | No repository browser/API caller found; treat as server/SQL internal; browser=NO api=NO railway=NO cron=NO | LOW |
| public | set_user_profiles_updated_at | `` | INVOKER | PUBLIC,anon,authenticated,postgres,service_role | None | **YES** if callers are service_role/postgres/cron only | No repository browser/API caller found; treat as server/SQL internal; browser=NO api=NO railway=NO cron=NO | LOW |
| public | test_constraint_resolution | `` | INVOKER | PUBLIC,anon,authenticated,postgres,service_role | None | **YES** if callers are service_role/postgres/cron only | No repository browser/API caller found; treat as server/SQL internal; browser=NO api=NO railway=NO cron=NO | LOW |
| load_test | _pool_cards_for_room | `p_pool_id uuid, p_room_id uuid, p_room_seed bytea, p_room_type room_type, p_limit integer` | INVOKER | PUBLIC,postgres | None | **YES** if callers are service_role/postgres/cron only | Internal schema helper; no browser/API .rpc evidence --- nested/SQL or cron/engine; browser=NO api=NO railway=NO cron=NO | MEDIUM |
| game_pool | activate_card_pool | `p_id uuid` | INVOKER | PUBLIC,anon,authenticated,postgres,service_role | None | **YES** if callers are service_role/postgres/cron only | Internal schema helper; no browser/API .rpc evidence --- nested/SQL or cron/engine; browser=NO api=NO railway=NO cron=NO | MEDIUM |
| tournament | close_registration | `p_tournament_id uuid` | DEFINER | PUBLIC,authenticated,postgres | None | **YES** if callers are service_role/postgres/cron only | tournament internal; nested/SQL; browser=NO api=NO railway=NO cron=NO | MEDIUM |
| tournament | fn_assign_templates_for_round | `p_tournament_id uuid, p_round_no integer, p_batch_tables integer[]` | INVOKER | PUBLIC,postgres | None | **YES** if callers are service_role/postgres/cron only | tournament internal; nested/SQL; browser=NO api=NO railway=NO cron=NO | MEDIUM |
| tournament | fn_burn_ding_locks | `p_tournament_id uuid` | DEFINER | PUBLIC,postgres | None | **YES** if callers are service_role/postgres/cron only | tournament internal; nested/SQL; browser=NO api=NO railway=NO cron=NO | MEDIUM |
| tournament | fn_calc_commission | `p_tournament_id uuid, p_user_id uuid, p_gross numeric` | DEFINER | PUBLIC,postgres | None | **YES** if callers are service_role/postgres/cron only | tournament internal; nested/SQL; browser=NO api=NO railway=NO cron=NO | MEDIUM |
| tournament | fn_capture_entry_locks | `p_tournament_id uuid` | DEFINER | PUBLIC,postgres | None | **YES** if callers are service_role/postgres/cron only | tournament internal; nested/SQL; browser=NO api=NO railway=NO cron=NO | MEDIUM |
| tournament | fn_commission_payout | `p_tournament_id uuid, p_entry_id uuid` | DEFINER | PUBLIC,postgres | None | **YES** if callers are service_role/postgres/cron only | tournament internal; nested/SQL; browser=NO api=NO railway=NO cron=NO | MEDIUM |
| tournament | fn_commission_snapshot | `p_tournament_id uuid, p_entry_id uuid` | DEFINER | PUBLIC,postgres | None | **YES** if callers are service_role/postgres/cron only | tournament internal; nested/SQL; browser=NO api=NO railway=NO cron=NO | MEDIUM |
| tournament | fn_commission_snapshot_entry | `p_tournament_id uuid, p_entry_id uuid` | DEFINER | PUBLIC,postgres | None | **YES** if callers are service_role/postgres/cron only | tournament internal; nested/SQL; browser=NO api=NO railway=NO cron=NO | MEDIUM |
| game_finance | fn_consume_room_tickets | `p_room uuid` | DEFINER | PUBLIC,postgres,service_role | None | **YES** if callers are service_role/postgres/cron only | Internal schema helper; no browser/API .rpc evidence --- nested/SQL or cron/engine; browser=NO api=NO railway=NO cron=NO | MEDIUM |
| tournament | fn_create_or_get_table_template | `p_tournament_id uuid, p_round_no integer, p_table_no integer` | INVOKER | PUBLIC,postgres | None | **YES** if callers are service_role/postgres/cron only | tournament internal; nested/SQL; browser=NO api=NO railway=NO cron=NO | MEDIUM |
| tournament | fn_create_rooms_for_round | `p_tournament_id uuid, p_round_no integer, p_force_pool_id uuid` | DEFINER | PUBLIC,postgres | None | **YES** if callers are service_role/postgres/cron only | tournament internal; nested/SQL; browser=NO api=NO railway=NO cron=NO | MEDIUM |
| game_core | fn_ensure_waiting_started_at | `p_room uuid, p_now timestamp with time zone` | DEFINER | PUBLIC,postgres | None | **YES** if callers are service_role/postgres/cron only | Internal schema helper; no browser/API .rpc evidence --- nested/SQL or cron/engine; browser=NO api=NO railway=NO cron=NO | MEDIUM |
| game_core | fn_force_cancel_waiting_room | `p_room uuid, p_reason text, p_now timestamp with time zone` | DEFINER | PUBLIC,postgres | None | **YES** if callers are service_role/postgres/cron only | Internal schema helper; no browser/API .rpc evidence --- nested/SQL or cron/engine; browser=NO api=NO railway=NO cron=NO | MEDIUM |
| game_core | fn_generate_room_seed | `` | INVOKER | PUBLIC,postgres,service_role | None | **YES** if callers are service_role/postgres/cron only | Internal schema helper; no browser/API .rpc evidence --- nested/SQL or cron/engine; browser=NO api=NO railway=NO cron=NO | MEDIUM |
| game_core | fn_join_or_create_room_base | `p_template_id uuid, p_card_count integer, p_password text` | DEFINER | PUBLIC,postgres,service_role | None | **YES** if callers are service_role/postgres/cron only | Internal schema helper; no browser/API .rpc evidence --- nested/SQL or cron/engine; browser=NO api=NO railway=NO cron=NO | MEDIUM |
| tournament | fn_join_table | `p_tournament_id uuid, p_round_no integer, p_table_no integer, p_user_id uuid, p_card_count integer` | DEFINER | PUBLIC,postgres | None | **YES** if callers are service_role/postgres/cron only | tournament internal; nested/SQL; browser=NO api=NO railway=NO cron=NO | MEDIUM |
| tournament | fn_manage_tournament_cycle | `p_tournament_id uuid, p_seed bigint` | INVOKER | PUBLIC,postgres | None | **YES** if callers are service_role/postgres/cron only | tournament internal; nested/SQL; browser=NO api=NO railway=NO cron=NO | MEDIUM |
| tournament | fn_payout_tournament | `p_tournament_id uuid` | DEFINER | PUBLIC,postgres | None | **YES** if callers are service_role/postgres/cron only | tournament internal; nested/SQL; browser=NO api=NO railway=NO cron=NO | MEDIUM |
| tournament | fn_pick_admin_user | `p_admin_user uuid` | DEFINER | PUBLIC,postgres | None | **YES** if callers are service_role/postgres/cron only | tournament internal; nested/SQL; browser=NO api=NO railway=NO cron=NO | MEDIUM |
| game_core | fn_requeue_failed_draw_jobs | `` | DEFINER | PUBLIC,postgres,service_role | None | **YES** if callers are service_role/postgres/cron only | Internal schema helper; no browser/API .rpc evidence --- nested/SQL or cron/engine; browser=NO api=NO railway=NO cron=NO | MEDIUM |
| game_pool | fn_retain_last_n_pools | `p_keep integer` | INVOKER | PUBLIC,anon,authenticated,postgres,service_role | None | **YES** if callers are service_role/postgres/cron only | Internal schema helper; no browser/API .rpc evidence --- nested/SQL or cron/engine; browser=NO api=NO railway=NO cron=NO | MEDIUM |
| monitor | fn_rooms_settling_lag | `` | INVOKER | PUBLIC,postgres | None | **YES** if callers are service_role/postgres/cron only | Internal schema helper; no browser/API .rpc evidence --- nested/SQL or cron/engine; browser=NO api=NO railway=NO cron=NO | MEDIUM |
| tournament | fn_seat_table_players | `p_tournament_id uuid, p_round_no integer, p_table_no integer` | INVOKER | PUBLIC,postgres | None | **YES** if callers are service_role/postgres/cron only | tournament internal; nested/SQL; browser=NO api=NO railway=NO cron=NO | MEDIUM |
| tournament | fn_settle_commission_payouts | `p_tournament_id uuid` | DEFINER | PUBLIC,postgres | None | **YES** if callers are service_role/postgres/cron only | tournament internal; nested/SQL; browser=NO api=NO railway=NO cron=NO | MEDIUM |
| game_core | fn_stamp_orphan_draws_on_terminal_rooms | `` | DEFINER | PUBLIC,postgres,service_role | None | **YES** if callers are service_role/postgres/cron only | Internal schema helper; no browser/API .rpc evidence --- nested/SQL or cron/engine; browser=NO api=NO railway=NO cron=NO | MEDIUM |
| game_core | fn_sync_player_affiliation_for_user | `p_user_id uuid` | DEFINER | PUBLIC,postgres,service_role | None | **YES** if callers are service_role/postgres/cron only | Internal schema helper; no browser/API .rpc evidence --- nested/SQL or cron/engine; browser=NO api=NO railway=NO cron=NO | MEDIUM |
| tournament | fn_tick_tournament_batch | `p_tournament_id uuid, p_seed text, p_batch_tables integer[]` | DEFINER | PUBLIC,postgres | None | **YES** if callers are service_role/postgres/cron only | tournament internal; nested/SQL; browser=NO api=NO railway=NO cron=NO | MEDIUM |
| game_core | fn_try_promote_room_at_max_capacity | `p_room uuid` | DEFINER | PUBLIC,postgres | None | **YES** if callers are service_role/postgres/cron only | Internal schema helper; no browser/API .rpc evidence --- nested/SQL or cron/engine; browser=NO api=NO railway=NO cron=NO | MEDIUM |
| game_finance | fn_wallet_add | `p_user uuid, p_amount numeric, p_currency text, p_desc text, p_type transaction_type, p_room uuid` | DEFINER | PUBLIC,anon,authenticated,postgres,service_role | None | **YES** if callers are service_role/postgres/cron only | Internal schema helper; no browser/API .rpc evidence --- nested/SQL or cron/engine; browser=NO api=NO railway=NO cron=NO | MEDIUM |
| game_finance | fn_wallet_capture | `p_user uuid, p_amount numeric, p_currency text, p_room uuid` | DEFINER | PUBLIC,postgres,service_role | None | **YES** if callers are service_role/postgres/cron only | Internal schema helper; no browser/API .rpc evidence --- nested/SQL or cron/engine; browser=NO api=NO railway=NO cron=NO | MEDIUM |
| game_finance | fn_wallet_capture_and_distribute | `p_room uuid` | DEFINER | PUBLIC,postgres,service_role | None | **YES** if callers are service_role/postgres/cron only | Internal schema helper; no browser/API .rpc evidence --- nested/SQL or cron/engine; browser=NO api=NO railway=NO cron=NO | MEDIUM |
| game_finance | fn_wallet_capture_join | `p_user uuid, p_amount numeric, p_currency text, p_room uuid, p_ticket uuid` | DEFINER | PUBLIC,postgres,service_role | None | **YES** if callers are service_role/postgres/cron only | Internal schema helper; no browser/API .rpc evidence --- nested/SQL or cron/engine; browser=NO api=NO railway=NO cron=NO | MEDIUM |
| game_finance | fn_wallet_deposit | `p_user uuid, p_amount numeric, p_currency text, p_desc text` | DEFINER | PUBLIC,postgres,service_role | None | **YES** if callers are service_role/postgres/cron only | Internal schema helper; no browser/API .rpc evidence --- nested/SQL or cron/engine; browser=NO api=NO railway=NO cron=NO | MEDIUM |
| game_finance | fn_wallet_hold_join | `p_user uuid, p_amount numeric, p_currency text, p_room uuid` | DEFINER | PUBLIC,postgres,service_role | None | **YES** if callers are service_role/postgres/cron only | Internal schema helper; no browser/API .rpc evidence --- nested/SQL or cron/engine; browser=NO api=NO railway=NO cron=NO | MEDIUM |
| game_finance | fn_wallet_hold_join | `p_user uuid, p_amount numeric, p_currency text, p_room uuid, p_ticket uuid` | DEFINER | PUBLIC,postgres,service_role | None | **YES** if callers are service_role/postgres/cron only | Internal schema helper; no browser/API .rpc evidence --- nested/SQL or cron/engine; browser=NO api=NO railway=NO cron=NO | MEDIUM |
| game_finance | fn_wallet_release | `p_user uuid, p_amount numeric, p_currency text, p_room uuid` | DEFINER | PUBLIC,postgres,service_role | None | **YES** if callers are service_role/postgres/cron only | Internal schema helper; no browser/API .rpc evidence --- nested/SQL or cron/engine; browser=NO api=NO railway=NO cron=NO | MEDIUM |
| game_finance | fn_wallet_release_join | `p_ticket uuid` | DEFINER | PUBLIC,postgres,service_role | None | **YES** if callers are service_role/postgres/cron only | Internal schema helper; no browser/API .rpc evidence --- nested/SQL or cron/engine; browser=NO api=NO railway=NO cron=NO | MEDIUM |
| game_finance | fn_wallet_release_join | `p_user uuid, p_amount numeric, p_currency text, p_room uuid` | DEFINER | PUBLIC,postgres,service_role | None | **YES** if callers are service_role/postgres/cron only | Internal schema helper; no browser/API .rpc evidence --- nested/SQL or cron/engine; browser=NO api=NO railway=NO cron=NO | MEDIUM |
| game_finance | fn_wallet_release_join | `p_user uuid, p_amount numeric, p_currency text, p_room uuid, p_ticket uuid` | DEFINER | PUBLIC,postgres,service_role | None | **YES** if callers are service_role/postgres/cron only | Internal schema helper; no browser/API .rpc evidence --- nested/SQL or cron/engine; browser=NO api=NO railway=NO cron=NO | MEDIUM |
| game_finance | fn_wallet_subtract | `p_user uuid, p_amount numeric, p_currency text, p_desc text, p_type transaction_type, p_room uuid` | DEFINER | PUBLIC,postgres,service_role | None | **YES** if callers are service_role/postgres/cron only | Internal schema helper; no browser/API .rpc evidence --- nested/SQL or cron/engine; browser=NO api=NO railway=NO cron=NO | MEDIUM |
| game_finance | fn_wallet_summary | `p_user uuid, p_currency text, p_since timestamp with time zone, p_room uuid` | DEFINER | PUBLIC,postgres,service_role | None | **YES** if callers are service_role/postgres/cron only | Internal schema helper; no browser/API .rpc evidence --- nested/SQL or cron/engine; browser=NO api=NO railway=NO cron=NO | MEDIUM |
| game_finance | fn_wallet_withdraw | `p_user uuid, p_amount numeric, p_currency text, p_desc text` | DEFINER | PUBLIC,postgres,service_role | None | **YES** if callers are service_role/postgres/cron only | Internal schema helper; no browser/API .rpc evidence --- nested/SQL or cron/engine; browser=NO api=NO railway=NO cron=NO | MEDIUM |
| game_pool | generate_card_pool_housie | `p_created_by uuid` | INVOKER | PUBLIC,anon,authenticated,postgres,service_role | None | **YES** if callers are service_role/postgres/cron only | Internal schema helper; no browser/API .rpc evidence --- nested/SQL or cron/engine; browser=NO api=NO railway=NO cron=NO | MEDIUM |
| game_core | rpc_get_active_rooms | `p_only_status room_status[], p_price_min numeric, p_price_max numeric` | INVOKER | PUBLIC,anon,authenticated,postgres,service_role | None | **YES** if callers are service_role/postgres/cron only | Internal schema helper; no browser/API .rpc evidence --- nested/SQL or cron/engine; browser=NO api=NO railway=NO cron=NO | MEDIUM |
| game_core | rpc_get_lobby_price_summary | `p_only_status room_status[]` | INVOKER | PUBLIC,postgres,service_role | None | **YES** if callers are service_role/postgres/cron only | Internal schema helper; no browser/API .rpc evidence --- nested/SQL or cron/engine; browser=NO api=NO railway=NO cron=NO | MEDIUM |
| game_core | rpc_get_room_seed_hash | `p_room_id uuid` | INVOKER | PUBLIC,postgres,service_role | None | **YES** if callers are service_role/postgres/cron only | Internal schema helper; no browser/API .rpc evidence --- nested/SQL or cron/engine; browser=NO api=NO railway=NO cron=NO | MEDIUM |
| game_core | rpc_reveal_room_seed | `p_room_id uuid, OUT room_id uuid, OUT room_seed bytea, OUT room_seed_hash character, OUT status room_status` | INVOKER | PUBLIC,postgres,service_role | None | **YES** if callers are service_role/postgres/cron only | Internal schema helper; no browser/API .rpc evidence --- nested/SQL or cron/engine; browser=NO api=NO railway=NO cron=NO | MEDIUM |
| game_core | set_rooms_updated_at | `` | INVOKER | PUBLIC,anon,authenticated,postgres,service_role | None | **YES** if callers are service_role/postgres/cron only | Internal schema helper; no browser/API .rpc evidence --- nested/SQL or cron/engine; browser=NO api=NO railway=NO cron=NO | MEDIUM |
| game_finance | set_wallets_updated_at | `` | INVOKER | PUBLIC,anon,authenticated,postgres,service_role | None | **YES** if callers are service_role/postgres/cron only | Internal schema helper; no browser/API .rpc evidence --- nested/SQL or cron/engine; browser=NO api=NO railway=NO cron=NO | MEDIUM |

### SERVER_RPC not Batch 1 (already locked, trigger infra, or low confidence)

Count: **43** --- includes P1.7 locked orchestrators, trigger/`set_updated_at` infrastructure, and LOW-confidence internals. See CSV.

---

## Recommended Batch 1 (HIGH confidence only)

1. `game_core.api_get_room_state(p_room_id uuid)`
2. `game_core.fn_generate_card_pool(p_card_count integer, p_created_by uuid, p_prng_version text)`
3. `game_core.fn_generate_card_pool_step(p_batch_size integer)`
4. `game_core.fn_janitor_sweep()`
5. `game_core.fn_system_join_or_create_room(p_user_id uuid, p_template_id uuid, p_card_count integer, p_password text)`
6. `public.fn_admin_games_report(p_from timestamp with time zone, p_to timestamp with time zone, p_limit integer, p_offset integer)`
7. `public.fn_cleanup_retention()`
8. `public.fn_dev_panel_dev_player_finance_summary(p_period text, p_timezone text)`
9. `public.fn_generate_card_pool(p_card_count integer, p_created_by uuid, p_prng_version text)`
10. `public.fn_maintain_heartbeat_log_partitions(p_keep_days integer, p_future_days integer)`
11. `public.fn_pick_dev_room_schedules(p_limit integer)`
12. `public.fn_system_join_or_create_room(p_user_id uuid, p_template_id uuid, p_card_count integer, p_password text)`
13. `public.fn_tick_due_tournaments(p_limit integer, p_seed bigint, p_batch_tables integer)`
14. `public.fn_tick_tournament(p_tournament_id uuid, p_seed bigint, p_batch_tables integer[])`
15. `public.load_test_cleanup(p_tag text)`
16. `public.load_test_seed_playing_rooms(p_room_count integer, p_tickets_per_room integer, p_draw_interval_sec integer, p_tag text)`
17. `tournament.fn_tick_due_tournaments(p_limit integer, p_seed bigint, p_batch_tables integer)`
18. `tournament.fn_tick_tournament(p_tournament_id uuid, p_seed bigint, p_batch_tables integer[])`



### Suggested smoke after future Batch 1 apply

1. Lobby join/play/settle  
2. Tournament entry/play/settle  
3. Admin wallet transfer + card-pool generate + games report  
4. Railway health + room-loop  
5. Cron: card-pool step + janitor sweep still succeeding  

---

## Per-function detail

Full per-function fields (schema, signature, SECURITY DEFINER, ACL, grantees, callers, auth model, category) are in the CSV. Markdown tables above summarize by category; the builder also recorded `auth_model` and `reason` for Batch1/unsafe/hybrid rows.

### Authentication model legend

| Value | Meaning |
|-------|---------|
| auth.uid() | Body references `auth.uid()` |
| auth.role()/jwt | Body references `auth.role` / `auth.jwt` |
| manual_authz | Admin/role assert helpers or similar keywords |
| raises_auth | Raises forbidden/unauthorized-style exceptions |
| None | No heuristic auth markers |

### Authorization quality

| Grade | Meaning |
|-------|---------|
| STRONG | auth.uid + manual/raise gates |
| ACCEPTABLE | auth.uid or combined role gates |
| WEAK | Partial role/manual only |
| NONE | No end-user authorization in body (expected for true SERVER if ACL locked) |

---

## Out of scope (Batch 0 --- ignored)

22 signatures already locked to postgres+service_role in P1.9B Batch 0 (claim/lease/draw/finalize/evaluate/settle/commission/janitor).

---

## Next steps (not executed)

1. Operator review of HIGH Batch 1 list.  
2. Remediate HYBRID (`fn_wallet_apply_delta`): route admin exclusively through a dedicated admin DEFINER with authz, then ACL-lock.  
3. Remediate or lock UNSAFE soft shims after confirming no production dependency.  
4. Only then generate a Batch 1 migration (separate approval).

