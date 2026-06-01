# Financial System — System Reality Map

> STRICT EXTRACTION. Documents only what exists in code + database.

## Core model

- **Wallet**: `wallets(user_id, currency, balance bigint, locked_amount)`. One per
  user+currency; default currency `IRR`. Created lazily on first delta.
- **Ledger**: `transactions` — append-only; `amount` always stored positive;
  direction encoded by `type`; carries `balance_before`/`balance_after`,
  `source_kind`, `source_ref`, `room_id`, `ticket_id`, `idempotency_key`, `meta`.
- All wallet mutation funnels through one primitive:
  **`game_finance.fn_wallet_apply_delta(...)`** (a `public` mirror exists).

### `fn_wallet_apply_delta(user, currency, delta, type, source_kind, source_ref, desc, meta, allow_negative)`
- `SECURITY DEFINER`, `STRICT`.
- Locks the wallet row `FOR UPDATE` (creates wallet if missing).
- `balance_after = balance_before + delta`.
- Rejects `delta = 0` (`zero amount not allowed`).
- Rejects `balance_after < 0` unless `allow_negative` (`insufficient funds`).
- Extracts `room_id`/`ticket_id` from `meta` jsonb.
- Updates `wallets.balance`, inserts one `transactions` row (`status='completed'`,
  `amount = ABS(delta)`), returns the transaction id.
- This is the only function that both moves balance and writes the ledger; every
  other money function calls it.

> NOTE: `wallets.balance` is `bigint` while `fn_wallet_apply_delta` works in
> `numeric`. Reward/commission math uses `CEIL`/`ROUND`, so fractional currency is
> rounded before it reaches the wallet.

## Money lifecycle: room (normal) play

### 1. Join / buy cards — `game_core.fn_join_or_create_room_core`
- Finds or creates a `waiting` room for the template.
- Reserves N cards (deterministic seed-hash ordering, `FOR UPDATE SKIP LOCKED`),
  inserts `tickets` with `reservation_status = 'reserved'`, `price = template.price`.
- For each ticket:
  - `fn_wallet_hold_join(user, price, currency, room, ticket)` — places a **hold**
    (locks funds; ledger `join_hold`).
  - `fn_record_ticket_commission(ticket)` — writes a `pending` `commissions_log` row.
- Enforces `max_cards_per_player`.

### 2. Room start — `fn_manage_waiting_rooms`
- Promotes `waiting → playing` once `starts_at` reached and distinct paid players
  ≥ `min_players`. (Capture is **not** done here — "wallet capture disabled during
  Stage 1".) Rooms under min players get their countdown extended.

### 3. Settlement — `game_finance.fn_finish_room_and_settle(room, admin_user)`
Triggered when a `full` winner is detected (`fn_evaluate_room_after_draw` flips the
room to `settling` then calls this). Steps:
1. Lock room; require status `settling` (idempotent if already `finished`).
2. Resolve line/full reward percentages: room → template → defaults `0.5/0.5`.
   Normalizes if `line+full > 1`.
3. **Capture**: for every `reserved/confirmed` ticket in the room, set `consumed`
   and `fn_wallet_capture_join(player, price, currency, room, ticket)` — converts the
   hold into an actual debit.
4. **Commission**: for each `pending` `commissions_log` row in the room,
   `fn_distribute_ticket_commission(ticket, admin_user)` — pays agent/super/admin and
   returns `amount_to_pool`. Sum = `v_total_pool` (the prize pool).
5. **Split pool**: `line_pool = round(total * line_pct)`, `full_pool = total − line_pool`.
   If no line winners, line pool rolls into full pool.
6. **Pay winners**: line winners split `line_pool` equally; full winners split
   `full_pool` equally — each via `fn_wallet_apply_delta(type='win', source_kind='room_settlement')`.
   Updates `results.reward_amount` and `paid_at`.
7. Set room `finished`, `prize_paid_at`, zero the prize-pool columns.

Wrappers: `fn_payout_winners`, `game_core.fn_payout_room`,
`public.fn_payout_room_if_full` all call `fn_finish_room_and_settle`.

### 4. Cancellation — `game_core.fn_cancel_waiting_room_single`
- Only allowed while `waiting` (rejects if started / has `consumed` tickets).
- Releases each hold via `fn_wallet_release_join(ticket)` (ledger `join_refund`),
  sets tickets + room `cancelled`. Optional single-player guard.

## Commission (room tickets)

### `fn_record_ticket_commission(ticket)` — snapshot at join
- `rate = COALESCE(room.commission_rate, template.commission_rate, 0)`; ÷100 if >1.
- Agent/super resolved from `player_affiliation`; rates from `user_commissions`
  (`agent_commission`, `super_commission`).
- `total_comm = CEIL(price * rate)`.
- `agent_amount = CEIL(total_comm * agent_rate)`.
- `super_amount = CEIL(total_comm * max(super_rate − agent_rate, 0))` (super is paid
  the **net** above the agent).
- `admin_amount = total_comm − agent_amount − super_amount` (remainder).
- `amount_to_pool = price − total_comm` (this is what funds the prize pool).
- Inserted into `commissions_log` (`status='pending'`).

### `fn_distribute_ticket_commission(ticket, admin_user)` — payout at settle
- Resolves the receiving admin: explicit `admin_user` → first manager admin
  (`admin_sub_role IS NULL`, active) → any active admin → else error.
- Pays agent (`fee_agent`) and super (`fee_super`) if amounts > 0. If a payout
  raises, the amount **rolls up to admin** instead.
- Pays admin `admin_amount + rollups` as `fee_admin`.
- Marks the log `settled`, sets `distributed_at`, returns `amount_to_pool`.

The `commissions_log` `trg_lock_commission_snapshot` (BEFORE UPDATE) freezes the
snapshot so amounts cannot be silently mutated after creation.

> NOTE: triggers `trg_rooms_after_live` and `trg_tickets_after_paid` are **no-ops**
> in the current code (their commission bodies are commented out / log only).
> Commission recording happens at join; distribution happens at settle.

## Manual / panel money operations

| Function | Who | Effect |
| --- | --- | --- |
| `fn_adjust_wallet_manual(target, amount, currency, type, desc)` | `admin`/`agent`/`super` | `type` ∈ {`deposit`,`withdraw`}; calls delta primitive, `source_kind='manual_panel'`, `source_ref=actor`. |
| `fn_adjust_referral_wallet(...)` | referral context | same shape. |
| `fn_wallet_transfer_panel(...)` (2 overloads) | admin/super/agent | single two-sided transfer. |
| `fn_wallet_transfer_panel_bulk(target_ids[], currency, amount, direction, desc)` | admin/super/agent | bulk two-sided transfers; `IRR` only. Hierarchy enforced: admin→any non-admin; super→own agents/own players (via `player_affiliation` or `parent_id`); agent→own players. Deterministic wallet locking by id. Writes paired `transfer_out`/`transfer_in` rows linked by `transfer_id` + shared `group_id`, `source_kind='admin_panel_transfer'`. Rejects `insufficient_funds`. |

All manual operations go through `fn_wallet_apply_delta`, so they appear in the
ledger and respect the non-negative invariant.

## Tournament money

See `tournament-system.md`. Summary of the financial pieces:
- Entry funds are held via `tournament_locks` (`lock_kind='entry'`, status `held`).
- On finish: commission snapshots (`tournament_commission_snapshots`) drive
  `tournament_commission_payouts`, settled via `fn_settle_commission_payouts`
  (→ `fn_wallet_apply_delta`, `source_kind='tournament_commission'`).
- Prizes computed by `fn_payout_tournament` into `tournament_payouts`, paid via
  `fn_wallet_apply_delta` (`source_kind='tournament_prize'`).
- Entry locks are `captured` (`capture_entry_locks`) for money tournaments, or
  `burned` (`fn_burn_ding_locks`) for `entry_currency='DING'`.
- Cancellation from `registration_open` → `fn_admin_refund_cancelled_tournament`
  releases held locks.

## Reporting views & RPCs

- Views: `vw_finance_base`, `vw_finance_gmv` (inflow/outflow/commissions/prizes/
  deposits/withdrawals by date), `vw_finance_earnings_by_role`,
  `vw_finance_profit_summary` (per-room commission vs payout = gross profit),
  `vw_player_commission`.
- RPCs: `fn_dashboard_admin_commission_summary(_range)`,
  `fn_dashboard_admin_tournament_guarantee_summary(_range)`,
  `get_total_balances_by_role`, `fn_wallet_summary`, `fn_admin_games_report`,
  `fn_player_stats` / `fn_player_game_stats` / `fn_player_purchase_history`.

## Transaction `type` semantics (as used in code)

| type | Emitted by |
| --- | --- |
| `join_hold` | `fn_wallet_hold_join` at card reservation. |
| `join_capture` / `join` | capture at settlement (`fn_wallet_capture_join`). |
| `join_refund` | release on cancel (`fn_wallet_release_join`). |
| `win` | room prize, tournament prize, tournament commission payout. |
| `fee_agent` / `fee_super` / `fee_admin` | ticket commission distribution. |
| `deposit` / `withdraw` | manual panel adjustment. |
| `transfer_in` / `transfer_out` | panel transfers. |
| `adjustment`, `bet`, `refund` | available in enum; used by wrapper helpers. |
