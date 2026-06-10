# End-to-End Event Flows — System Reality Map

> STRICT EXTRACTION. Each flow is reconstructed from the actual DB functions,
> triggers, and worker loops. Application route names are included where they wrap
> these calls (see `admin-system.md` / `game-engine-reality.md` for route detail).

---

## A. Player lifecycle (signup → gameplay → exit)

### A1. Signup
Two implemented entry paths:

**Path 1 — Supabase Auth trigger (`handle_new_user`)**
1. A row is created in `auth.users` (email like `<username>@dingmoney.org`, metadata
   carrying `referral_code`).
2. `handle_new_user()` fires: requires a non-empty `referral_code`; resolves the
   referrer (`agent`/`super`/`admin`, active); rejects player referral codes.
3. Inserts `public.users` (role `player`, `parent_id = referrer`), `player_affiliation`
   (agent/super derived from referrer role), `wallets` (0 IRR), `ding_balances` (0),
   `user_profiles` (lang `fa`).

**Path 2 — invitation code RPC (`game_core.signup_player_with_code`)**
1. Validate `invitation_links` code (active, not expired, uses remaining).
2. Create `users` (player) + `user_profiles`; resolve agent/super from
   `inviter_role`; insert `player_affiliation`; create wallet; increment link
   `current_uses`; log `player_signups`.

Both guarantee a player has at least one of agent/super (commission routing basis).

### A2. Login → routing
- `app/(auth)/login` authenticates; `app/post-login/page.tsx` routes by role and
  (for admins) by `admin_sub_role`. Players → player area.
- Presence: `fn_ping_presence` / heartbeat updates `users.last_seen_at` and
  `heartbeat_log` partitions; lobby online counts use `v_lobby_online_players` /
  `v_lobby_active_players`.

### A3. Lobby
- Player browses rooms via lobby APIs (`app/api/player/lobby-*`) backed by
  `rpc_get_active_rooms` / `rpc_get_lobby_price_summary` and `room_templates`
  (RLS lets authenticated users see non-`inactive` templates).

### A4. Buy cards / join
1. Client calls join (`app/api/player/gameroom` / `fn_join_or_create_room`).
2. `fn_join_or_create_room_core`: find/create `waiting` room → reserve N cards →
   insert `reserved` tickets → `fn_wallet_hold_join` per ticket (`join_hold`) →
   `fn_record_ticket_commission` per ticket (`commissions_log` pending).
3. Room `starts_at` set (now + countdown for normal rooms).

### A5. Game start
- `fn_manage_waiting_rooms` (room-scheduler worker): when `starts_at` reached and
  distinct paid players ≥ `min_players`, room `waiting → playing`, first
  `next_draw_at = now + 10s`. Under min players → countdown extended.

### A6. Live play (draw → mark → win → ding)
1. `fn_manage_room_live_actions` (room-scheduler): for due `playing` rooms with no
   unprocessed draw, picks next number 1–90 by `room_seed` hash, inserts into
   `draws`. Trigger `trg_after_draw_enqueue` → `draw_jobs` row.
2. Draw worker (`fn_process_draw_jobs_batch_worker`): `rpc_apply_marks_for_draw`
   (insert `marks` for matching cards) → `fn_evaluate_room_after_draw` →
   mark job `done`; when last job for the draw is done → `draws.processed_at = now`.
3. `fn_evaluate_room_after_draw`: detects `line`/`full` winners → inserts `results`
   (idempotent); trigger syncs `room_winners`; sets `first_line_draw_number`; on a
   `full` winner flips room → `settling` and calls `fn_finish_room_and_settle`.
4. `draws.processed_at` UPDATE fires `trg_aggregate_ding_on_processed_at` →
   credits `ding_balances` + `ding_transactions` (matched cards × `ding_per_number`).

### A7. Settlement (money)
`fn_finish_room_and_settle` (see `financial-system.md`): capture held ticket funds
→ distribute ticket commissions (agent/super/admin) and accumulate `amount_to_pool`
→ split pool by line/full % → pay winners (`win`) → room `finished`.

### A8. Exit
- No explicit "exit" transaction. Player leaves the room UI; their tickets/results
  persist. Active games are surfaced via `fn_my_active_rooms` and
  `ActiveGamesOrchestrator` (client). Account remains until status changes
  (`suspended`/`deleted`).

---

## B. Tournament lifecycle (create → join → start → finish)

1. **Create** — `fn_admin_create_tournament(payload)` (admin/super); status `draft`.
2. **Open** — `fn_admin_set_tournament_status(id,'registration_open')`.
3. **Join** — players call `buy_tickets(id, delta)`; `tournament_entries` upserted;
   `trg_te_commission_snapshot` writes `tournament_commission_snapshots`; entry
   locks held (`tournament_locks`).
4. **Start / run** — orchestrator calls `fn_tick_due_tournaments` →
   `fn_tick_tournament` (flips `registration_open → running` at `start_at`).
5. **Round planning** — `fn_manage_tournament_cycle` builds `tournament_round_rooms`
   + `tournament_round_assignments` from entries (round 1) or previous winners.
6. **Seat & play** — `fn_assign_templates_for_round` → `fn_seat_table_players` →
   `fn_system_join_or_create_room` (real rooms/tickets/holds/commission). Rooms run
   through the normal draw/evaluate/settle engine. Winners land in `room_winners`.
7. **Advance** — next ticks detect all round rooms `finished`; cycle builds the next
   round from winners. Repeats until ≤1 participant.
8. **Finish** — tournament `finished`; `fn_payout_tournament` (prizes from
   guarantee/commission-pool/entries) → `tournament_payouts` paid (`win`).
9. **Commission settle** — per entry `fn_commission_payout` →
   `fn_settle_commission_payouts` (agent/super/admin paid). Entry locks
   `captured` (money) or `burned` (DING).
- **Cancel** — `registration_open → cancelled` triggers
  `fn_admin_refund_cancelled_tournament` (release held locks).

---

## C. Financial lifecycle (hold → capture → commission → refund)

| Event | Function | Ledger types |
| --- | --- | --- |
| Reserve card | `fn_wallet_hold_join` | `join_hold` (locks funds) |
| Commission recorded | `fn_record_ticket_commission` | (no ledger; `commissions_log` pending) |
| Room settles — capture | `fn_wallet_capture_join` | capture (`join`/`join_capture`) |
| Commission paid | `fn_distribute_ticket_commission` | `fee_agent`, `fee_super`, `fee_admin` |
| Prize paid | `fn_finish_room_and_settle` / `fn_payout_tournament` | `win` |
| Cancel waiting room | `fn_wallet_release_join` | `join_refund` |
| Manual deposit/withdraw | `fn_adjust_wallet_manual` | `deposit` / `withdraw` |
| Panel transfer | `fn_wallet_transfer_panel(_bulk)` | `transfer_out` + `transfer_in` |

All pass through `fn_wallet_apply_delta` (locks wallet, writes one ledger row,
enforces non-negative unless `allow_negative`).

---

## D. Admin actions affecting the live system

| Action | Path / RPC | Effect on live system |
| --- | --- | --- |
| Global registration lock | `app/api/admin/runtime/global-registration-lock` → `app_runtime_flags` | Blocks new registrations system-wide. |
| Cancel waiting room | `fn_cancel_waiting_room(room, by_admin, user)` | Releases holds, cancels tickets+room. |
| Adjust wallet | `fn_adjust_wallet_manual` | Direct balance change + ledger row. |
| Transfer funds | `fn_wallet_transfer_panel(_bulk)` | Moves balance between users. |
| Set commission rate | `app/api/admin/users/set-commission` → `user_commissions` | Changes future commission splits. |
| Set role / sub-role | `app/api/admin/users/set-role` | Changes access + hierarchy. |
| Tournament status/CRUD | `fn_admin_*_tournament` | Opens/cancels/edits tournaments (cancel refunds). |
| Room templates | `app/admin/room-templates` (RLS `is_admin_active`) | Changes future room economics. |
| Card pool | `app/api/admin/card-pool/*`, `fn_generate_card_pool`, `activate_card_pool` | Changes the active deck for new rooms. |
| Banners | `entry_banners` (manager-only writes) | Login banners shown to users. |
| Dev player schedules | `dev_room_schedules`, `fn_pick_dev_room_schedules` | Schedules dev player joins. |

Sensitive admin operations are recorded in `admin_audit_log`
(`action`, `target_table`, `target_id`, `payload`, ip/user-agent).

---

## E. Agent / affiliate commission flow

1. Player is bound to `agent_id`/`super_id` in `player_affiliation` at signup.
2. Agent/super commission **rates** live in `user_commissions`
   (`agent_commission`, `super_commission`); set via `app/api/admin/users/set-commission`.
3. On each ticket purchase, `fn_record_ticket_commission` snapshots the split into
   `commissions_log` (agent net, super net-above-agent, admin remainder).
4. On room settlement, `fn_distribute_ticket_commission` credits agent/super
   wallets (`fee_agent`/`fee_super`); failed sub-payouts roll up to admin.
5. Tournaments mirror this via `tournament_commission_snapshots` →
   `tournament_commission_payouts` → `fn_settle_commission_payouts`.
6. Agents/supers view their commissions via RLS-scoped reads on `commissions_log`,
   `user_commissions`, `transactions`, and the agent UI
   (`app/agent/dashboard`, `app/agent/tournaments/report`).
