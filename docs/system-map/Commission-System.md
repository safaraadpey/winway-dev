# Commission System — System Reality Map

> STRICT EXTRACTION. Documents only what exists in code + database. Function bodies
> below are summarized from the live DB definitions (verified via introspection).

## What this system is (as implemented)

On each paid play, a configurable percentage of the stake is taken as **commission**
and split across three tiers — **agent → super → admin** — and paid into wallets. The
remainder of the stake (`amount_to_pool`) goes to the prize pool.

There are **two independent pipelines** with **separate tables**:

| Pipeline | Schema | Snapshot table | Payout mechanism |
| --- | --- | --- | --- |
| Room / ticket | `game_finance` | `public.commissions_log` | `fn_distribute_ticket_commission` |
| Tournament | `tournament` | `public.tournament_commission_snapshots` → `tournament_commission_payouts` | `fn_settle_commission_payouts` |

Both read tier rates from `public.user_commissions` and resolve the agent/super from
`public.player_affiliation`.

## Rate model (critical, shared by both pipelines)

Two layers of rates:
1. **Event rate** — `rooms.commission_rate` (fallback `room_templates.commission_rate`)
   for rooms; `tournaments.commission_rate` for tournaments. Values `>1` are treated as
   percent and divided by 100. This determines the **total commission**:
   `total_comm = CEIL(gross * event_rate)`.
2. **Tier split rates** — `user_commissions.agent_commission` / `.super_commission`
   (also `/100` if `>1`). These split the `total_comm` across tiers.

**Nested (net) split — this is how the live code actually distributes:**
```
agent_amount = CEIL(total_comm * agent_rate)
super_amount = CEIL(total_comm * GREATEST(super_rate - agent_rate, 0))   ← NET of agent
admin_amount = total_comm - agent_amount - super_amount                  ← remainder
amount_to_pool = gross - total_comm
```
So `super_commission` is the **combined** agent+super cut; the super only nets the
difference above the agent's rate, and the admin sweeps whatever is left.

## Data model

### `public.commissions_log` (room/ticket, immutable snapshot + ledger)
`id`(bigint), `ticket_id`, `room_id`, `player_id`, `agent_id`, `super_id`,
`gross_amount`, `commission_rate`, `commission_base`(=total_comm), `agent_rate`,
`super_rate`, `agent_amount`, `super_amount`, `admin_amount`, `amount_to_pool`,
`currency`, `source`, `notes`(jsonb), `status` (`pending`→`settled`), `created_at`,
`distributed_at`. Unique on `ticket_id`. Immutability enforced by trigger
`fn_lock_commission_snapshot` (raises if any snapshot/amount field changes after insert).

### `public.user_commissions` (tier rate config)
`user_id`, `agent_commission`, `super_commission`, `created_at`, `updated_at`. 5 rows.

### Tournament tables
- `public.tournament_commission_snapshots` — per-entry snapshot (same amount columns +
  `commission_model`, `admin_id`). Unique `(tournament_id, entry_id)`.
- `public.tournament_commission_payouts` — per-beneficiary payout rows
  (`beneficiary_user_id`, `role`, `amount`, `currency`, `status` `pending`→`paid`).

### `public.vw_player_commission` (view)
Read model joining player → agent/super and their rates (used by `fn_calc_commission`).

## Pipeline 1 — Room / ticket commission (`game_finance`)

### `fn_record_ticket_commission(p_ticket uuid) → uuid`  (SECURITY DEFINER)
- Idempotent: returns early if a `commissions_log` row already exists for the ticket.
- Loads ticket (must be `reserved`/`confirmed`/`consumed`) → `room_id`, `player_id`,
  `price`, room `currency`.
- Resolves `event_rate` from `rooms.commission_rate` ?? `room_templates.commission_rate`.
- Resolves `agent_id`/`super_id` from `player_affiliation`; their rates from
  `user_commissions`.
- Computes amounts using the **nested split** above; inserts `commissions_log` row with
  `status='pending'` (`ON CONFLICT (ticket_id) DO NOTHING`).

### `fn_distribute_ticket_commission(p_ticket uuid, p_admin_user uuid DEFAULT NULL) → numeric`
- Locks the log row (`FOR UPDATE`); if missing, calls `fn_record_ticket_commission` first.
- Returns `0` if not `pending` (already settled).
- Resolves an **admin beneficiary**: explicit `p_admin_user` (must be active admin) →
  else first active admin with `admin_sub_role IS NULL` → else any active admin; else raises.
- Credits via `game_finance.fn_wallet_apply_delta`:
  - agent: `transaction_type='fee_agent'`, `source_kind='ticket_commission'`.
  - super: `transaction_type='fee_super'`.
  - admin: `admin_amount` **+ any rolled-up** agent/super amounts that failed to credit
    (each tier credit is wrapped in a `BEGIN…EXCEPTION` that, on error, adds the amount
    to `v_rollup_amount` instead of failing). `transaction_type='fee_admin'`.
- Updates log: `status='settled'`, `distributed_at=now()`, `admin_amount` += rollup.
- Returns `amount_to_pool` (consumed by room settlement to fund the prize pool).

### `fn_lock_commission_snapshot()` (trigger on `commissions_log`)
- Raises `"Commission snapshots are immutable after insert"` if any
  gross/base/rate/id/amount/currency field is changed.

> Net per ticket: stake captured → agent + super + admin wallets credited (`fee_*`
> transactions) → log row `settled` → pool funded by `amount_to_pool`.

## Pipeline 2 — Tournament commission (`tournament`)

### Snapshot on entry — `trg_te_commission_snapshot` → `fn_commission_snapshot_entry`
- Trigger on `tournament_entries`: on INSERT, or UPDATE of `tickets_count`/`status`,
  recomputes the snapshot.
- `fn_commission_snapshot_entry(p_tournament_id, p_entry_id)`:
  - If entry `status='cancelled'` → deletes its snapshot and returns.
  - `gross = tickets_count * tournaments.ticket_price`.
  - `event_rate = tournaments.commission_rate` (`/100` if `>1`).
  - agent/super from `player_affiliation`; tier rates from `user_commissions`.
  - Same **nested split**; `admin_id = tournaments.created_by`.
  - Upserts `tournament_commission_snapshots` (`commission_model='tournament_entry'`),
    `currency = tournaments.currency` (default `IRR`).

> A second, older variant `fn_commission_snapshot(...)` also exists: it reads agent/super
> from `tournament_entries` columns, **skips `DING` entry currency**, leaves `admin_id`
> NULL, and reads rate from `tournaments.meta->>'commission_rate'`. The live trigger uses
> `fn_commission_snapshot_entry`.

### Pure calculator — `fn_calc_commission(p_tournament_id, p_user_id, p_gross)`
- Returns a table of rates/amounts. Reads event rate from `tournaments.meta->>'commission_rate'`
  and agent/super rates from `vw_player_commission`. **Note:** here the super share is
  `total_comm * super_rate` (gross, not net) — differs from the snapshot functions. Used
  as a helper/estimator, not the settlement source of truth.

### Build payout rows — `fn_commission_payout(p_tournament_id, p_entry_id)`
- Reads the snapshot; resolves admin (snapshot `admin_id`, else user `adminzero`).
- Clears existing payouts for the entry, then inserts `tournament_commission_payouts`
  rows (`status='pending'`) for admin / agent / super where amount `> 0`.

### Settle — `fn_settle_commission_payouts(p_tournament_id)`
- Loops `pending` payouts (`FOR UPDATE SKIP LOCKED`, roles admin/agent/super, amount>0).
- Credits each beneficiary via `fn_wallet_apply_delta` (`transaction_type='win'`,
  `source_kind='tournament_commission'`); sets `status='paid'`, `paid_at`.

> Tournament commission runs inside the tournament runtime chain (driven by `pg_cron`,
> see `tournament-system.md`): snapshot on entry → payout rows → settle on finish.

## Routing & resolution (shared)
```
play (gross) → player_affiliation[player] → {agent_id, super_id}
            → user_commissions[agent]/[super] → {agent_rate, super_rate}
            → nested split → snapshot row (pending)
            → fn_wallet_apply_delta credits agent/super/admin wallets
```
- No agent/super in `player_affiliation` (e.g. admin-referred player) → that tier's
  amount is 0 and folds into the admin remainder.

## Reporting surface
- `public.fn_dashboard_admin_commission_summary` / `_summary_range` — admin dashboard
  commission aggregates.
- Agent/super dashboard (`services/dashboard.ts`) shows period commission scoped to the
  operator's subtree.
- `commissions_log` (room) and `tournament_commission_snapshots`/`_payouts` (tournament)
  are the authoritative per-event audit trails.

## RLS / access
- `user_commissions`: `_select_agent`, `_select_super`, `_select_owner`, `_select_admin`
  policies — operators see their own rate row; admin sees all.
- `commissions_log`: agent reads where `agent_id=auth.uid()`; super where
  `super_id=auth.uid()`; admin sees all.
- All write/credit functions are `SECURITY DEFINER`; players never write commission data.

## Current-state notes (recorded, not judged)
- Two pipelines use **different tables** (room → `commissions_log`; tournament →
  `tournament_commission_*`). They are not unified.
- Commission credits land in the beneficiary's **main wallet** (no separate commission
  wallet); room credits use `fee_agent`/`fee_super`/`fee_admin` types, tournament uses
  `win` type with `source_kind='tournament_commission'`.
- `super_commission` is interpreted as the **combined** agent+super cut; super nets only
  `super_rate − agent_rate`.
- All amounts use `CEIL` rounding; admin always absorbs the rounding remainder.
- `fn_calc_commission` uses a **different (gross) super formula** and a different rate
  source (`meta`/view) than the actual snapshot/settlement path — treat it as a helper.
- Tournament `fn_commission_payout` falls back to a hard-coded `adminzero` username when
  no `admin_id` is on the snapshot.
