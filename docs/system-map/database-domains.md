# Database Domains — System Reality Map

> STRICT EXTRACTION. This documents only what currently exists in the Supabase
> Postgres database (schemas, tables, columns, functions, triggers, RLS, enums).
> No proposed or assumed behavior. Source: live database introspection.

## Schemas present

| Schema | Purpose (by contents) |
| --- | --- |
| `public` | Main application tables, views, RPC surface exposed to clients/service. |
| `game_core` | Internal game engine logic (rooms, draws, joins, marks, seeds, signup). |
| `game_finance` | Wallet ledger primitives, room settlement, ticket commission. |
| `game_pool` | Card pool generation / activation / retention. |
| `tournament` | Tournament lifecycle, seating, commission, payouts, locks. |

There is no separate `finance` schema object set (financial logic lives in
`public` + `game_finance`).

---

## 1. Enum types (authoritative)

| Enum | Values |
| --- | --- |
| `user_role` | `admin`, `super`, `agent`, `player` |
| `user_status` | `active`, `suspended`, `deleted` |
| `admin_sub_role` | `finance`, `support`, `room`, `dev_panel` (NULL = full manager) |
| `room_status` | `idle`, `live`, `finished`, `cancelled`, `waiting`, `playing`, `settling` |
| `room_template_status` | `active`, `draining`, `inactive` |
| `room_type` | `normal`, `tournament` |
| `reservation_status` | `held`, `confirmed`, `released`, `cancelled`, `reserved`, `consumed`, `expired` |
| `transaction_type` | `deposit`, `withdraw`, `bet`, `win`, `refund`, `adjustment`, `join`, `fee_admin`, `fee_agent`, `fee_super`, `join_hold`, `join_refund`, `join_capture`, `transfer_in`, `transfer_out` |
| `transaction_status` | `pending`, `completed`, `failed`, `cancelled`, `settled` |
| `tournament_status` | `draft`, `registration_open`, `running`, `settling`, `finished`, `cancelled` |
| `tournament_entry_status` | `created`, `cancelled` |
| `tournament_round_room_status` | `created`, `running`, `finished` |
| `tournament_table_size_mode` | `fixed`, `range` |
| `tournament_remainder_policy` | `adaptive_tables`, `uniform_with_bye`, `uniform_with_ghost` |
| `dev_schedule_status` | `draft`, `approved`, `processing`, `done`, `failed`, `cancelled` |
| `tournament.lock_status` | `held`, `released`, `captured` |

> NOTE / discrepancy: `docs/backend/admin-sub-roles.md` lists `manager` as an enum
> value. The live DB enum does **not** contain `manager`; it contains `dev_panel`.
> Full-access admins are represented by `admin_sub_role IS NULL`.

---

## 2. Tables grouped by domain

### 2.1 Player / User system

| Table | Rows* | Key columns |
| --- | --- | --- |
| `users` | 49 | `id`, `username`, `email`, `role` (default `player`), `status`, `parent_id`, `referral_code`, `admin_sub_role`, `last_login_at`, `last_seen_at`, `must_change_password` |
| `user_profiles` | 49 | `user_id` (PK), `nickname`, `avatar_url`, `country`, `language` (`fa`), `metadata` |
| `user_profiles_old_backup` | 0 | Legacy snapshot of old profile shape (`username/email/role/balance/...`). Not used by live flows. |
| `user_notes` | 0 | `user_id`, `author_id`, `note` (≤150 char) — admin/agent/super notes on subordinate users. |

Views: `user_profiles_view` (joins users + profile + commissions).

`parent_id` on `users` encodes the hierarchy: player → agent/super parent.

### 2.2 Agent / Affiliation / Referral system

| Table | Rows | Purpose |
| --- | --- | --- |
| `player_affiliation` | 42 | `user_id` → (`agent_id`, `super_id`). Resolved at signup; basis of all commission routing. |
| `user_commissions` | 5 | `user_id`, `agent_commission`, `super_commission` (rate per agent/super). |
| `invitation_links` | 0 | `code`, `inviter_id`, `inviter_role`, `max_uses`, `current_uses`, `expires_at`, `is_active`. Unique invite codes for player signup. |
| `player_signups` | 0 | Log of signups via invitation link (`invitation_link_id`, `player_id`). |

`users.referral_code` is the alternative referral mechanism used by
`handle_new_user` (auth trigger path).

### 2.3 Game system

| Table | Rows | Purpose |
| --- | --- | --- |
| `room_templates` | 86 | Blueprint for rooms: `price`, `currency`, `min_players`, `countdown_sec`, `draw_interval_sec` (3), `line_reward_percentage` (0.5), `full_reward_percentage` (0.8), `ding_per_number` (1), `commission_rate`, `max_cards_per_player` (10), `room_type`, `vip`, `password`, `repeatable`, `scheduled_start_time`, `status`. |
| `rooms` | 63 | Live room instances. `room_code`, `status`, `card_price`, `pool_id`, `room_seed`/`room_seed_hash`, `next_draw_at`, `starts_at`, `min_players`, `countdown_sec`, reward %, `line_prize_pool`, `full_prize_pool`, `first_line_draw_number`, `prize_paid_at`, cancel fields, `admin_action` jsonb. |
| `card_pools` | 3 | `version`, `is_active`, `pool_seed`, `commit_hash`, `prng_version`, `card_count`, `is_building`, `cards_built`. |
| `card_pool_cards` | 513 | `pool_id`, `card_no`, `card_data` (jsonb). |
| `card_numbers` | 7,815 | Flattened cells: `pool_card_id`, `row_no`, `col_no`, `value`. |
| `tickets` | 4 | Purchased cards: `room_id`, `player_user_id`, `pool_card_id`, `card_no`, `price`, `reservation_status`, `transaction_id`, `claimed_bingo_at`, `is_verified_win`, `cancelled_at`. |
| `marks` | 0 | `ticket_id`, `value` — marked numbers per ticket. |
| `draws` | 0 | `room_id`, `number`, `timestamp`, `processed_at`, `ding_processed_at`, `ding_aggregated_at`. |
| `draw_jobs` | 3,735 | Work queue: `room_id`, `draw_number`, `status` (`queued`/`done`), `attempts`. |
| `results` | 0 | Win records: `room_id`, `user_id`, `ticket_id`, `win_type` (`line`/`full`), `reward_amount`, `draw_number`, `paid_at`. |
| `room_winners` | 12 | `room_id`, `ticket_id`, `user_id`, `weight` — synced from `results`. |
| `dev_room_schedules` | 0 | Scheduled dev player joins (`user_id`, `room_template_id`, `ticket_count`, `scheduled_at`, `status`, results). |
| `dev_player_configs` | 0 | Per-user dev player settings from Dev Panel (`is_enabled`, `play_windows`, price bounds, `max_ticket_count`). |
| `debug_room_status_log` | 228 | Audit of room status transitions (trigger-written). |

Views: `v_active_pool`, `v_card_hits`, `v_row_hits`,
`v_lobby_active_players`, `v_lobby_online_players`.

### 2.4 Financial system

| Table | Rows | Purpose |
| --- | --- | --- |
| `wallets` | 49 | `user_id`, `balance` (bigint), `currency` (`IRR`), `locked_amount`. One per user/currency. |
| `transactions` | 1,934 | Immutable ledger. `wallet_id`, `user_id`, `type`, `status`, `amount` (always positive), `balance_before`/`balance_after`, `source_kind`, `source_ref`, `source_ticket_id`, `source_room_id`, `room_id`, `ticket_id`, `idempotency_key`, `meta`. |

Views: `vw_finance_base`, `vw_finance_earnings_by_role`, `vw_finance_gmv`,
`vw_finance_profit_summary`.

### 2.5 Commission system

| Table | Rows | Purpose |
| --- | --- | --- |
| `commissions_log` | 4 | Per-ticket commission breakdown: `ticket_id`, `room_id`, `player_id`, `gross_amount`, `commission_rate`, `commission_base`, `agent_id`/`super_id`, `agent_rate`/`super_rate`, `agent_amount`/`super_amount`/`admin_amount`, `amount_to_pool`, `status` (`pending`/`settled`), `distributed_at`. |
| `user_commissions` | 5 | Agent/super commission rates (see Agent domain). |

Views: `vw_player_commission` (player → agent/super + rates).

### 2.6 Ding system

| Table | Rows | Purpose |
| --- | --- | --- |
| `ding_balances` | 49 | `user_id` (PK), `balance` (bigint), `locked_amount`. Soft/secondary point balance. |
| `ding_transactions` | 0 | `user_id`, `room_id`, `ticket_id`, `draw_id`, `drawn_number`, `amount`, `description`. One row per ding credit event. |

`room_templates.ding_per_number` / `rooms.ding_per_number` drive ding amounts.

### 2.7 Tournament system

| Table | Rows | Purpose |
| --- | --- | --- |
| `tournaments` | 5 | Config + status. `status`, `start_at`, `ticket_price`, `min/max_tickets_per_player`, `table_size_mode/fixed/min/max`, `remainder_policy`, `bye_*`, `ghost_*`, `guaranteed_prize`, `commission_rate`, `commission_snapshot_at`, `room_template_id`, `meta` (holds `commission_rate`, `entry_currency`, `min_players_for_guarantee`). |
| `tournament_entries` | 49 | `tournament_id`, `user_id`, `tickets_count`, `price_per_ticket`, `amount`, `status` (`created`/`cancelled`). |
| `tournament_round_rooms` | 8 | Virtual tables per round: `round_no`, `table_no`, `room_id`, `room_template_id`, `status`, `target_players`, `seated_players`. |
| `tournament_round_assignments` | 49 | Player→table mapping: `round_no`, `trr_id`, `user_id`, `cards_count`, `seed`, `room_id`/`game_room_id`. |
| `tournament_prize_rules` | 0 | `rank`, `payout_type` (`percent`/fixed), `payout_value`. |
| `tournament_payouts` | 4 | Final prize payouts: `user_id`, `rank`, `amount`, `status` (`pending`/`paid`), `paid_at`. |
| `tournament_locks` | 3 | Wallet holds for entries: `entry_id`, `owner_user_id`, `lock_kind` (`entry`), `status` (`held`/`released`/`captured`), `amount`, `idempotency_key`. |
| `tournament_commission_snapshots` | 44 | Frozen commission breakdown per entry (mirror of `commissions_log` for tournaments) incl. `amount_to_pool`, `commission_model`. |
| `tournament_commission_payouts` | 9 | Derived payable rows per beneficiary: `role` (`admin`/`agent`/`super`), `amount`, `status`. |
| `tournament_commission_log` | 0 | Alternate/legacy commission log (beneficiary-based). Currently empty. |
| `tournament.template_reservations` | 0 | Short-lived reservation of a `room_template` to a tournament table. |
| `tournament.tournament_tick_log` | 2.6M | High-volume diagnostic log of tick stages/errors. |

### 2.8 Admin / Ops / Infra

| Table | Rows | Purpose |
| --- | --- | --- |
| `admin_audit_log` | 166 | `admin_id`, `action`, `target_table`, `target_id`, `payload`, `ip_address`, `user_agent`. |
| `admin_permissions` | 0 | `admin_id`, `permission_key`, `granted`. Granular permission store (currently unused/empty). |
| `entry_banners` | 2 | Login banners: content, image, schedule window, `target_audience`, `require_confirmation`. |
| `app_runtime_flags` | 1 | Single-row global flags: `global_registration_locked` + who/when/reason. |
| `heartbeat_log` (+ daily partitions) | many | Presence/heartbeat tick storage (`heartbeat_log_YYYYMMDD`). |

\* Row counts are a point-in-time snapshot from introspection.

---

## 3. SQL functions by purpose

### 3.1 Wallet / ledger core (`game_finance`)
- `fn_wallet_apply_delta(user, currency, delta, type, source_kind, source_ref, desc, meta, allow_negative)` → `uuid` (txn id). **The single primitive that mutates `wallets` and writes `transactions`.** Locks the wallet `FOR UPDATE`, creates it if missing, rejects zero amount, rejects negative result unless `allow_negative`. Extracts `room_id`/`ticket_id` from `meta`. (Mirror exists as `public.fn_wallet_apply_delta`.)
- `fn_wallet_hold_join`, `fn_wallet_capture_join`, `fn_wallet_release_join` — join lifecycle holds/captures/releases (several overloads, ticket- or room-scoped).
- `fn_wallet_deposit`, `fn_wallet_withdraw`, `fn_wallet_add`, `fn_wallet_subtract`, `fn_wallet_capture`, `fn_wallet_release` — wrappers around the delta primitive.
- `fn_wallet_summary(user, currency, since, room)` → balance/locked/inflow/outflow + per-type sums.

### 3.2 Manual / panel money movement (`public`)
- `fn_adjust_wallet_manual(target, amount, currency, type, desc)` — only `admin/agent/super`; `type` must be `deposit`/`withdraw`; calls `fn_wallet_apply_delta` with `source_kind='manual_panel'`, `source_ref=actor`.
- `fn_adjust_referral_wallet(...)` — same shape for referral context.
- `fn_wallet_transfer_panel` (two overloads) and `fn_wallet_transfer_panel_bulk(target_ids[], currency, amount, direction, desc)` — two-sided transfers between actor and target(s). Enforces hierarchy (admin→any non-admin; super→own agents/players; agent→own players), `IRR` only, deterministic wallet locking, paired `transfer_out`/`transfer_in` rows linked by `transfer_id`+`group_id`, `source_kind='admin_panel_transfer'`.

### 3.3 Ticket commission (`game_finance`)
- `fn_record_ticket_commission(ticket)` → computes & inserts a `commissions_log` row (status `pending`). Rate = `room.commission_rate ?? template.commission_rate ?? 0` (÷100 if >1). Agent/super rates from `user_commissions`. Super gets `super_rate − agent_rate` net; admin gets remainder; `amount_to_pool = price − total_commission`.
- `fn_distribute_ticket_commission(ticket, admin_user)` → pays agent/super via `fn_wallet_apply_delta` (`fee_agent`/`fee_super`), admin gets remainder + any failed rollups (`fee_admin`), marks log `settled`, returns `amount_to_pool`.

### 3.4 Room lifecycle (`game_core`)
- `fn_join_or_create_room_core(template, card_count, password)` and wrappers `fn_join_or_create_room_base`, `public.fn_join_or_create_room` — find/create a `waiting` room for the template, reserve N cards deterministically (seed-hashed order, `FOR UPDATE SKIP LOCKED`), insert `reserved` tickets, `fn_wallet_hold_join` + `fn_record_ticket_commission` per ticket, set room `starts_at`.
- `fn_system_join_or_create_room(user, template, card_count, password)` — system (tournament) variant that joins on behalf of a user.
- `fn_manage_waiting_rooms(limit, capture)` — promotes `waiting`→`playing` when `starts_at` reached and distinct paid players ≥ `min_players`; sets first `next_draw_at` (+10s); extends countdown for rooms under min players.
- `fn_manage_room_live_actions()` — for each `playing` room whose `next_draw_at ≤ now` and with no unprocessed draw (backpressure): pick next unused number 1–90 by seed hash, insert into `draws` (trigger enqueues a `draw_job`), advance `next_draw_at` by `draw_interval_sec`; if all 90 drawn → `finished`.
- `fn_cancel_waiting_room_single` / `fn_cancel_waiting_rooms` (+ `public.fn_cancel_waiting_room`) — cancel a `waiting` room, release holds via `fn_wallet_release_join`, set tickets+room `cancelled`.
- `fn_confirm_win(room, ticket, type)` — insert a `results` row; if `full`, call `fn_payout_room`.
- `fn_janitor_sweep()` — maintenance.
- `api_get_room_state(room)` → jsonb snapshot. `rpc_get_active_rooms`, `rpc_get_lobby_price_summary`, `rpc_get_room_seed_hash`, `rpc_reveal_room_seed`.

### 3.5 Draw processing (`public` / `game_core`)
- `rpc_pick_draw_jobs(limit, worker_id, total_workers)` — claims queued jobs sharded by worker.
- `fn_process_draw_jobs_batch_worker(worker_id, total_workers)` — per job: `rpc_apply_marks_for_draw` then `fn_evaluate_room_after_draw`, mark job `done`; when last job for a draw is done, set `draws.processed_at`. On error: requeue with `attempts+1`.
- `rpc_apply_marks_for_draw(room, draw_number)` — insert `marks` for tickets whose card contains the number, then evaluate.
- `fn_evaluate_room_after_draw(room, draw_number)` — detects `line` (any full row) and `full` (all cells) winners, inserts `results` (idempotent), sets `first_line_draw_number`, and when a `full` winner appears flips room to `settling` and calls `game_finance.fn_finish_room_and_settle`.

### 3.6 Room settlement / payout (`game_finance`)
- `fn_finish_room_and_settle(room, admin_user)` — the money settlement core (see `financial-system.md`). Captures held ticket funds, distributes ticket commissions into a pool, splits pool by line/full %, pays winners (`win`), sets room `finished`.
- `fn_payout_winners`, `fn_payout_room`, `public.fn_payout_room_if_full` — thin wrappers around `fn_finish_room_and_settle`.
- `fn_consume_room_tickets(room)`.

### 3.7 Ding (`public`)
- `update_ding_balance(user, amount)` — upsert `ding_balances`.
- `distribute_ding_on_draw()` (trigger fn) — legacy per-ticket ding on draw insert.
- `fn_aggregate_ding_for_processed_draw()` (trigger fn) — active aggregation when a draw's `processed_at` is set (see `Ding-system.md`).
- `fn_ding_aggregate_dryrun_on_draw_processed()` — dry-run variant.

### 3.8 Card pool (`game_pool` / `game_core`)
- `fn_generate_card_pool` / `generate_card_pool_housie` / `fn_generate_card_pool_step` — build pools.
- `activate_card_pool(id)`, `fn_retain_last_n_pools(keep)`, `fn_sync_card_numbers()` (trigger).

### 3.9 Signup / identity
- `game_core.signup_player_with_code(code, username, nickname, country, language)` — invitation-link signup: validates link, creates `users` (player), `user_profiles`, resolves agent/super from inviter role, inserts `player_affiliation`, creates `wallet`, increments link uses, logs `player_signups`.
- `public.handle_new_user()` (auth trigger) — Supabase `auth.users` → derives username from email, requires `referral_code` in metadata, resolves referrer (`agent`/`super`/`admin`), inserts `users`, `player_affiliation`, `wallets`, `ding_balances`, `user_profiles`.
- `rpc_register_player(username, referral_code)`, `validate_invitation_code(code)`.

### 3.10 Tournament functions (`tournament`)
- Status / registration: `fn_admin_set_tournament_status`, `open_registration`, `close_registration`, `cancel_registration`, `_assert_registration_open`, `_assert_status`, `buy_tickets(tournament, delta)`, `get_my_registration`.
- Cycle / seating: `fn_tick_due_tournaments`, `fn_tick_tournament`, `fn_manage_tournament_cycle(tournament, seed)`, `fn_assign_templates_for_round`, `fn_create_rooms_for_round`, `fn_seat_players_for_round`, `fn_seat_table_players`, `fn_create_or_get_table_template`, `fn_join_table`.
- Money: `fn_calc_commission`, `fn_commission_snapshot_entry`, `fn_commission_payout`, `fn_settle_commission_payouts`, `fn_payout_tournament`, wallet hold/capture/release (`fn_tournament_wallet_*`, `fn_wallet_capture_join`), locks (`capture_entry_locks`, `release_entry_locks`, `sync_my_entry_lock`, `fn_burn_ding_locks`), `fn_admin_refund_cancelled_tournament`.
- Admin CRUD: `fn_admin_create_tournament`, `fn_admin_update_tournament`, `fn_admin_delete_tournament` (also mirrored in `public`).

### 3.11 Reporting / dashboards (`public`)
- `fn_admin_games_report`, `fn_dashboard_admin_commission_summary(_range)`, `fn_dashboard_admin_tournament_guarantee_summary(_range)`, `fn_player_stats`, `fn_player_game_stats`, `fn_player_purchase_history`, `fn_leaderboard_weekly`, `get_daily_leaders(_by_date)`, `get_weekly_leaders`, `get_total_balances_by_role`, `fn_my_active_rooms`, `fn_rooms_by_ids`.

### 3.12 Presence / maintenance
- `fn_ping_presence`, `fn_heartbeat_log`, `fn_heartbeat_tick`, `fn_maintain_heartbeat_log_partitions`, `fn_cleanup_retention`.

### 3.13 RLS helper predicates
- `is_admin_active()`, `can_read_user(id)`, `can_read_user_in_tournament(id)`, `is_tournament_participant(id)`.

---

## 4. Triggers (event → effect)

| Table | Trigger | When | Effect |
| --- | --- | --- | --- |
| `draws` | `trg_after_draw_enqueue` | AFTER INSERT | Insert `draw_jobs(room, draw_number, 'queued')` (on conflict do nothing). |
| `draws` | `trg_aggregate_ding_on_processed_at` | AFTER UPDATE | `fn_aggregate_ding_for_processed_draw` — credit ding when `processed_at` set. |
| `draws` | `trg_ding_aggregate_dryrun_on_processed_at` | AFTER UPDATE | dry-run ding aggregation. |
| `results` | `trg_sync_room_winners_from_results` | AFTER INSERT | Upsert into `room_winners`. |
| `rooms` | `trg_rooms_after_live` | AFTER UPDATE | `game_finance.trg_rooms_after_live` — **currently a no-op** (commission body commented out). |
| `rooms` | `trg_rooms_status_template_draining` | AFTER UPDATE | Mark template inactive when drained. |
| `rooms` | `trg_debug_rooms_status` | AFTER INSERT/UPDATE | Write `debug_room_status_log`. |
| `tickets` | `trg_tickets_after_paid` | AFTER UPDATE | `game_finance.trg_tickets_after_paid` — **no-op** (logs only; settlement handled in room settle). |
| `users` | `trg_sync_player_affiliation_from_users` | AFTER INSERT/UPDATE | Sync `player_affiliation` from `users`. |
| `player_affiliation` | `trg_validate_affiliation_roles` | BEFORE INSERT/UPDATE | Validate agent/super roles. |
| `card_pool_cards` | `trg_sync_card_numbers` | AFTER INSERT/UPDATE | `game_pool.fn_sync_card_numbers` → maintain `card_numbers`. |
| `commissions_log` | `trg_lock_commission_snapshot` | BEFORE UPDATE | `game_finance.fn_lock_commission_snapshot` — freeze snapshot fields. |
| `tournament_entries` | `trg_tournament_entries_commission_snapshot` | AFTER INSERT/UPDATE | `tournament.trg_te_commission_snapshot` → recompute commission snapshot. |
| `tournament_entries` | `trg_guard_entry_mutations` | BEFORE UPDATE/DELETE | Guard illegal mutations. |
| `tournament_entries` | `trg_entry_cancel_cleanup` | AFTER UPDATE | Cleanup on cancel. |
| `tournament_entries` | `tournament_entries_snapshot_bd` | BEFORE DELETE | Snapshot before delete. |
| many tables | `trg_set_updated_at_*` / `set_updated_at` | BEFORE UPDATE | Maintain `updated_at`. |
| `admin_permissions`, `entry_banners`, `user_notes` | `update_*_updated_at` | BEFORE UPDATE | Maintain `updated_at`. |

---

## 5. RLS policy behavior (summary)

RLS is **enabled** on all `public` business tables. Key patterns:

- **Service-role only writes**: `draws`, `marks`, `draw_jobs`, `results` (insert), `room_winners`, `player_affiliation`, `tournament_*` runtime tables, `user_commissions`, `transactions` (insert), `wallets` (update) are writable only by `service_role`. The game engine / API server use the service key.
- **Owner read**: `wallets`, `transactions`, `tickets`, `results`, `tournament_entries`, `tournament_payouts`, `ding_balances`, `ding_transactions`, `tournament_commission_*` expose rows where `user_id = auth.uid()`.
- **Hierarchy read** (`wallets`, `transactions`): admin sees all non-admin users; agent sees own players (`parent_id` or `player_affiliation.agent_id`); super sees own agents+players (parent chain or `player_affiliation.super_id`). The `transactions` policy `tx_admin_agent_super_read` additionally matches via `source_ref`.
- **Admin-active gate**: many admin-only reads use `is_admin_active()` (`card_pools`, `card_numbers`, `room_templates` admin, `draw_jobs`, `marks`, `heartbeat_log`, `tournament_*` admin selects, `admin_audit_log`).
- **Commission visibility**: `commissions_log` readable by admin, by the agent (`agent_id = uid`), by the super (`super_id = uid`).
- **Manager-only writes**: `admin_permissions` and `entry_banners` modification requires `role='admin' AND admin_sub_role IS NULL` (full manager).
- **Public/anon read**: `rooms` and `draws` are world-readable (`USING true`). `users` referral rows are anon-readable when `referral_code IS NOT NULL AND status='active' AND role IN (agent,super,admin)`. `invitation_links` SELECT is `USING true` (anyone can validate a code).
- **Tournament participation**: `tournament_round_rooms`/`assignments` readable by admins, the owning user, or `is_tournament_participant(tournament_id)`. `tournaments` readable by any active user; insert requires active `admin`/`super`.

> SECURITY NOTE (from introspection advisory): 16 tables have **RLS disabled** —
> `tournament.tournament_tick_log`, `tournament.template_reservations`,
> `public.heartbeat_log_default`, `public.debug_room_status_log`,
> `public.dev_room_schedules`, `public.app_runtime_flags`, and the
> `public.heartbeat_log_YYYYMMDD` partitions. These are exposed to anon/authenticated
> via the Supabase client. This is the current state, reported as-is.
