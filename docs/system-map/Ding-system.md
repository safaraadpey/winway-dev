# Ding System — System Reality Map

> STRICT EXTRACTION. Documents only what exists in code + database.

## What "Ding" is (as implemented)

Ding is a **secondary point balance** separate from the money wallet. It is
credited to players as drawn numbers land on their cards during live play. It is
stored in `ding_balances` (bigint `balance`, plus `locked_amount`) with an event
log in `ding_transactions`.

There is **no implemented spend/redeem path** for ding in the database functions
(no debit RPC beyond the generic `update_ding_balance`, which can take a negative
amount but is only ever called with positive values by the triggers). Tournament
code references "ding locks" (`fn_burn_ding_locks`, `entry_currency = 'DING'`),
i.e. tournaments can be priced in DING, but the core room-play ding flow only
credits.

## Data model

| Object | Role |
| --- | --- |
| `ding_balances(user_id, balance, locked_amount, ...)` | Current ding per user. Seeded to 0 at signup (`handle_new_user`). |
| `ding_transactions(user_id, room_id, ticket_id, draw_id, drawn_number, amount, description, created_at)` | One row per ding credit. |
| `room_templates.ding_per_number` (default `1`) | Ding multiplier per matched number. |
| `rooms.ding_per_number` | Per-room override of the template value. |
| `draws.ding_processed_at`, `draws.ding_aggregated_at` | Idempotency markers. |

## How ding is credited (authoritative logic)

There are two trigger functions on `public.draws`. The **active, current** path is
aggregation-on-processed:

### `fn_aggregate_ding_for_processed_draw()` — trigger `trg_aggregate_ding_on_processed_at`
- Fires `AFTER UPDATE ON draws`.
- Runs **only** on the transition `processed_at: NULL → NOT NULL` (set by the draw
  worker once all draw jobs for that draw are `done`).
- Idempotent: returns immediately if `ding_aggregated_at IS NOT NULL`.
- Resolves `ding_per_card = COALESCE(room.ding_per_number, template.ding_per_number, 1)`.
- Computes, per user, the number of their cards that contain `draws.number`:
  - Joins `tickets` → `card_numbers` where `cn.value = draws.number`.
  - Filters `tickets.cancelled_at IS NULL` and `reservation_status = 'reserved'`.
  - `delta = matched_cards * ding_per_card`.
- Inserts aggregated rows into `ding_transactions` (one per user, `ticket_id = NULL`,
  description `Agg ding for draw ... (N cards x M)`), `ON CONFLICT DO NOTHING`.
- Increments `ding_balances.balance` by the summed delta (upsert).
- Sets `draws.ding_aggregated_at = now()` to lock against re-aggregation.

### `distribute_ding_on_draw()` — (legacy per-ticket path)
- Reads `ding_per_number` (room → template → 1).
- Loops over distinct tickets in the room (statuses `reserved/confirmed/consumed`)
  whose card contains the drawn number; for each, `update_ding_balance(player, ding_per_card)`
  and inserts a per-ticket `ding_transactions` row.
- Guards on room status `IN ('live','playing')`.
- This function exists but the **active trigger** wired to draws is the
  aggregation one above (`trg_aggregate_ding_on_processed_at`), plus a dry-run
  trigger `trg_ding_aggregate_dryrun_on_processed_at` → `fn_ding_aggregate_dryrun_on_draw_processed`.

### `update_ding_balance(user, amount)` → numeric
- Upsert into `ding_balances`; `balance = balance + amount`; returns new balance.

## Timing / ordering

1. Live-action loop inserts a row into `draws` (number drawn).
2. `trg_after_draw_enqueue` creates a `draw_jobs` row.
3. Draw worker processes the job: applies marks, evaluates wins, marks job `done`.
4. When the last job for that `(room, draw_number)` is done, the worker sets
   `draws.processed_at = now()`.
5. That UPDATE fires `trg_aggregate_ding_on_processed_at`, which credits ding and
   stamps `ding_aggregated_at`.

So **ding is credited after a draw is fully processed**, derived from how many of a
player's reserved cards matched that number, times `ding_per_number`.

## Client surface

- `app/api/me/ding-balance/route.ts` — endpoint returning the caller's ding balance.
- `ding_balances` RLS: a user may `SELECT`/`UPDATE` only their own row
  (`auth.uid() = user_id`; the UPDATE policy exists "for realtime updates").
- `ding_transactions` RLS: user reads only their own (`auth.uid() = user_id`).
- See `game-engine-reality.md` and the player UI section for how the balance is
  displayed/subscribed.

## Tournament + DING

- A tournament can set `meta.entry_currency = 'DING'`. In that case
  `fn_payout_tournament` zeroes the money entry pool and commission pool, and
  `fn_manage_tournament_cycle` calls `fn_burn_ding_locks(tournament)` instead of
  capturing money locks at the end.
