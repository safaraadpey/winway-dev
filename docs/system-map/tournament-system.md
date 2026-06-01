# Tournament System — System Reality Map

> STRICT EXTRACTION. Documents only what exists in code + database. Behavioral
> narrative corroborated by `docs/architecture/tournament/*` and verified against
> live function bodies.

## Design principle (as implemented)

A tournament does **not** have a bespoke game engine. It "impersonates" real
players: it seats participants into virtual tables and then performs **real
room joins** through `game_core.fn_system_join_or_create_room`, reusing the
normal Game Core (rooms, draws, marks, evaluation, settlement). Tournaments add a
bracketing/rounds layer and a separate commission/payout settlement on top.

## State machine — `tournament_status`

`draft → registration_open → running → settling → finished`, plus `cancelled`.

- `fn_admin_set_tournament_status(id, status)` allows only:
  `draft → registration_open|cancelled`, `registration_open → cancelled`.
  Requires active `admin`/`super`. On `registration_open → cancelled` it calls
  `fn_admin_refund_cancelled_tournament` (release held locks).
- The transition into `running`/`settling`/`finished` is driven by the tick engine,
  not the admin status RPC.

## Data model (recap)

`tournaments` (config) → `tournament_entries` (registrations) → per round:
`tournament_round_rooms` (virtual tables) + `tournament_round_assignments`
(player→table) → real `rooms`/`room_winners`. Money: `tournament_locks`,
`tournament_commission_snapshots` → `tournament_commission_payouts`,
`tournament_payouts`. Diagnostics: `tournament.tournament_tick_log`,
`tournament.template_reservations`.

## Registration

- `buy_tickets(tournament_id, delta)` (`SECURITY DEFINER`, `auth.uid()`):
  - Requires registration open (`_assert_registration_open`).
  - Reads `ticket_price`, `min/max_tickets_per_player` (locks tournament row).
  - Upserts the caller's `tournament_entries` row: new count clamped to
    `[min, max]`; `amount = count * ticket_price`; status `created`.
  - Raises `MAX_TICKETS_EXCEEDED` / `MIN_TICKETS_NOT_MET` / `ENTRY_NOT_ACTIVE`.
- `tournament_entries` RLS: a user can insert/update own row only while the
  tournament is `registration_open`.
- The `trg_tournament_entries_commission_snapshot` trigger recomputes
  `tournament_commission_snapshots` on every entry insert/update (see Commission).
- Entry funds are represented by `tournament_locks` (`lock_kind='entry'`,
  `status='held'`) — `sync_my_entry_lock`, `capture_entry_locks`,
  `release_entry_locks`.

## Runtime execution chain (tick)

Driven by the game-engine `tournament-orchestrator` worker (see
`game-engine-reality.md`), which calls the DB tick functions:

1. **`fn_tick_due_tournaments(limit, seed, batch_tables)`** — selects tournaments
   that are `registration_open` with `start_at` reached, or `running`; calls the
   per-tournament tick for each.
2. **`fn_tick_tournament(tournament_id, seed, batch_tables[])`** — logical lock;
   `registration_open → running` when start time reached; syncs
   `tournament_round_rooms` status against real `rooms`; decides whether to plan a
   new round or continue the current one.
3. **`fn_manage_tournament_cycle(tournament_id, seed)`** (planning):
   - Only runs while status `running`.
   - Participants = round-0 entries (`status='created'`) or previous round's
     `room_winners`.
   - If `current_round > 0` and ≤1 participant remains → tournament `finished`,
     then runs payouts (see below) and captures/burns locks.
   - Computes table count from `table_size_mode/min/max`; distributes players as
     evenly as possible; creates `tournament_round_rooms` (status `created`,
     `target_players`) and `tournament_round_assignments` (player→`trr_id`,
     `cards_count`), ordered deterministically by `md5(seed:tournament:user)`.
   - No real `rooms` created yet.
4. **`fn_assign_templates_for_round(tournament, round_no, batch_tables)`** — for each
   table without a `room_template_id`, picks a free active template
   (`fn_pick_free_room_template`) and records it on `tournament_round_rooms`.
5. **`fn_seat_table_players(tournament, round_no, table_no)`** (execution) — locks
   only that table row; finalizes each player's `cards_count` from
   `tournament_entries`; loops assignments and performs a **real join** per player.
   (`fn_seat_players_for_round` batches this across tables.)
6. **`fn_system_join_or_create_room(user, template, cards_count, password)`** —
   system variant of the player join: creates/reuses a real `room`, creates real
   `tickets`, reserves cards, places wallet holds + records commission. On first
   successful join the `room_id` is stored on `tournament_round_rooms` and all the
   table's assignments are linked to it.
7. **Round end / loop** — subsequent ticks detect when all of the round's `rooms`
   are `finished`; `fn_manage_tournament_cycle` then builds the next round from the
   winners. Repeats until ≤1 participant remains.

## Commission (tournament)

Commission is **snapshotted at registration** and **settled at finish**.

### Snapshot — `fn_commission_snapshot_entry(tournament, entry)`
- Fired by the entry trigger; deleted if the entry is `cancelled`.
- `rate = tournaments.commission_rate` (÷100 if >1).
- `gross = tickets_count * ticket_price`.
- Agent/super from `player_affiliation`; rates from `user_commissions`.
- `total_comm = CEIL(gross * rate)`.
- `agent_amount = min(total_comm, CEIL(total_comm * agent_rate))`.
- `super_amount = min(remaining, CEIL(total_comm * max(super_rate − agent_rate,0)))`
  (super paid net above agent).
- `admin_amount = remainder`; `amount_to_pool = gross − total_comm`.
- `admin_id = tournaments.created_by`.
- Upserted into `tournament_commission_snapshots` (`commission_model='tournament_entry'`).
- (`fn_calc_commission` is a pure calculator variant using `vw_player_commission`.)

### Payout derivation — `fn_commission_payout(tournament, entry)`
- Reads the snapshot; resolves admin (snapshot `admin_id`, else user `adminzero`).
- Rebuilds `tournament_commission_payouts` rows (`pending`) for admin/agent/super
  where amount > 0.

### Settlement — `fn_settle_commission_payouts(tournament)`
- For each `pending` payout (roles admin/agent/super, amount>0): pay via
  `fn_wallet_apply_delta(type='win', source_kind='tournament_commission')`; mark `paid`.

## Prize payout — `fn_payout_tournament(tournament)`
- Locks tournament. Computes pools:
  - `entries_total = sum(entries.amount where created)`; `players = distinct users`.
  - Guarantee: if `ticket_price>0` and `meta.min_players_for_guarantee` set and
    players < that → effective guarantee = 0; else `guaranteed_prize`.
  - `pool_from_comm = sum(commission_snapshots.amount_to_pool)`.
  - If `entry_currency = 'DING'` → entries_total and pool_from_comm set to 0.
  - `pool_base = COALESCE(NULLIF(pool_from_comm,0), entries_total)`;
    `pool = GREATEST(effective_guarantee, pool_base)`.
- Winners = distinct `room_winners` of the last round (must be > 0).
- If no `tournament_prize_rules`: single winner (top by summed `weight`) gets the
  whole pool (rank 1). Else: for each rule (by rank) the Nth-ranked winner gets
  `percent` of pool or a fixed value.
- Inserts `tournament_payouts` (`pending`), then pays each via
  `fn_wallet_apply_delta(type='win', source_kind='tournament_prize')`, marks `paid`.

## Finish + cleanup ordering (from `fn_manage_tournament_cycle`)
When ≤1 participant remains:
1. `tournaments.status = finished`.
2. `fn_payout_tournament(tournament)` — prizes.
3. If `entry_currency <> 'DING'`:
   - For each snapshot entry: `fn_commission_payout` → then
     `fn_settle_commission_payouts` (pay agent/super/admin commissions).
   - `fn_capture_entry_locks` (convert held entry locks to captured).
4. Else (`DING`): `fn_burn_ding_locks`.

## Admin CRUD
- `fn_admin_create_tournament(payload jsonb)`, `fn_admin_update_tournament(id, patch)`,
  `fn_admin_delete_tournament(id)` (in both `public` and `tournament` schemas).
- Admin UI: `app/admin/tournaments/**` (list, `[id]`, `[id]/edit`, `TournamentForm`,
  `report`). Player UI: `app/player/tournaments/**`. Reports:
  `components/reports/TournamentsReportPage.tsx`, `app/api/admin/tournaments/report`,
  `app/agent/tournaments/report`.
