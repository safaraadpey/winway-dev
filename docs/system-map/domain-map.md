# Domain Map — System Reality Map

> STRICT EXTRACTION. Cross-domain relationships and ownership, derived from the
> actual schema (FKs/usage), functions, and code paths.

## Ownership grid (who writes what)

| Domain | Owns (write authority) | Reads from |
| --- | --- | --- |
| Player/User | `users`, `user_profiles`, `user_notes` | — |
| Agent/Affiliation | `player_affiliation`, `invitation_links`, `player_signups`, `user_commissions` | `users` |
| Game | `rooms`, `tickets`, `marks`, `draws`, `draw_jobs`, `results`, `room_winners`, `card_pools`, `card_pool_cards`, `card_numbers`, `room_templates`, `bot_room_schedules` | `users`, `card_pools` |
| Financial | `wallets`, `transactions` | all domains (via `fn_wallet_apply_delta`) |
| Commission | `commissions_log`, `tournament_commission_snapshots/payouts/log` | `tickets`, `rooms`, `player_affiliation`, `user_commissions`, `tournaments` |
| Ding | `ding_balances`, `ding_transactions` | `draws`, `tickets`, `card_numbers`, `rooms`, `room_templates` |
| Tournament | `tournaments`, `tournament_entries`, `tournament_round_rooms`, `tournament_round_assignments`, `tournament_locks`, `tournament_payouts`, `tournament_prize_rules` | `users`, `room_templates`, `rooms`, `room_winners` |
| Admin/Ops | `admin_audit_log`, `admin_permissions`, `entry_banners`, `app_runtime_flags` | all domains (reporting) |
| Presence | `heartbeat_log*`, `users.last_seen_at` | — |

## Key relationships (entity → entity)

```
users 1──* user_profiles
users *──1 users (parent_id)                # hierarchy
users 1──1 player_affiliation (user_id)     # → agent_id, super_id
users 1──1 user_commissions                 # agent/super rates
users 1──* wallets (currency)
users 1──1 ding_balances

invitation_links 1──* player_signups *──1 users

room_templates 1──* rooms
card_pools 1──* card_pool_cards 1──* card_numbers
rooms *──1 card_pools (pool_id)
rooms 1──* tickets *──1 card_pool_cards
tickets 1──* marks
rooms 1──* draws 1──* draw_jobs
rooms 1──* results ──> room_winners (trigger sync)
tickets 1──1 commissions_log
wallets 1──* transactions

tournaments 1──* tournament_entries *──1 users
tournaments 1──* tournament_round_rooms 1──* tournament_round_assignments
tournament_round_rooms *──1 rooms                 # real room per table
tournaments 1──* tournament_commission_snapshots ──> tournament_commission_payouts
tournaments 1──* tournament_payouts
tournaments 1──* tournament_locks                 # entry holds
```

## Cross-domain interaction points (the "seams")

1. **Game → Financial (holds)**: `fn_join_or_create_room_core` →
   `fn_wallet_hold_join` (creates `join_hold` ledger + locks funds) per ticket.
2. **Game → Commission (snapshot)**: same join → `fn_record_ticket_commission`
   writes a `pending` `commissions_log` using `player_affiliation` + `user_commissions`.
3. **Game → Financial + Commission (settle)**: `fn_finish_room_and_settle` captures
   holds (`fn_wallet_capture_join`), distributes commission
   (`fn_distribute_ticket_commission` → `fee_agent/super/admin`), pays winners (`win`).
4. **Game → Ding**: `draws.processed_at` → `fn_aggregate_ding_for_processed_draw`
   credits `ding_balances`/`ding_transactions`.
5. **Tournament → Game**: `fn_seat_table_players` → `fn_system_join_or_create_room`
   creates real `rooms`/`tickets` (reusing the game seam above).
6. **Tournament → Commission/Financial**: entry trigger snapshots commission;
   finish runs `fn_commission_payout` → `fn_settle_commission_payouts` and
   `fn_payout_tournament` (prizes), then captures/burns `tournament_locks`.
7. **Admin → all domains**: panel RPCs (`fn_wallet_transfer_panel`,
   `fn_adjust_wallet_manual`/`fn_wallet_apply_delta`, `fn_admin_*_tournament`,
   `fn_generate_card_pool`, registration lock) mutate live state; sensitive ones
   write `admin_audit_log`.
8. **Agent ↔ User**: `player_affiliation` (set at signup) is the join used by
   commission routing and by RLS hierarchy visibility on `wallets`/`transactions`.

## Currency model
- Money domain currency is `IRR` throughout (`wallets`, `transactions`,
  `room_templates`, `tournaments` default). Panel transfers reject non-`IRR`.
- `ding_balances`/`ding_transactions` are a **separate unit** (not IRR).
- Tournaments may set `meta.entry_currency = 'DING'`, which zeroes money pools and
  burns ding locks at settlement instead of capturing money.

## The "player behavior" / presence sub-system
- `fn_ping_presence` (called by `POST /api/me/ping-presence`) and cron
  `fn_heartbeat_log` / `fn_heartbeat_tick` populate `heartbeat_log*` partitions and
  update `users.last_seen_at`.
- Lobby online/active counts come from views `v_lobby_online_players` /
  `v_lobby_active_players`.
- Player game behavior/stats are surfaced via `fn_player_stats`,
  `fn_player_game_stats`, `fn_player_purchase_history`, leaderboards
  (`get_daily_leaders`, `get_weekly_leaders`, `fn_leaderboard_weekly`).
- Active games for a player: `fn_my_active_rooms` (+ client `ActiveGamesOrchestrator`).
