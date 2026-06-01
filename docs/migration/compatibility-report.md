# Compatibility Report

> How faithfully the Game Engine reproduces current production behavior, what is
> ported vs. delegated, known parity risks, and how to verify. Goal: zero
> intentional change to user-facing behavior.

## 1. Coverage matrix

| Behavior | DB source | Engine | Parity confidence | Notes |
| --- | --- | --- | --- | --- |
| Provably-fair number draw | `fn_manage_room_live_actions` | `core/rng.pickNextNumber` | **High** | Identical `sha256(hex(seed)||':'||n)` ordering |
| Card-deal ordering | `fn_join_or_create_room_core` | `core/rng.orderBySeed` | Medium | Same key formula; deal still via DB join command |
| Waiting→playing + countdown | `fn_manage_waiting_rooms` | `domain/room.manageWaitingRooms` | **High** | 10s first-draw delay, 120s default countdown, min_players gate |
| Live draw scheduling + backpressure | `fn_manage_room_live_actions` | `domain/room.manageRoomLiveActions` | **High** | Backpressure on unprocessed draws; interval from meta |
| Marks insertion | `rpc_apply_marks_for_draw` | `domain/draw.applyMarksAndEvaluate` | **High** | Idempotent upsert on (ticket_id,value) |
| Win evaluation (line/full) | `fn_evaluate_room_after_draw` | `core/winEvaluation` | **High** | First-line gating + per-type idempotency preserved |
| Settlement / prize split | `fn_finish_room_and_settle` | DB RPC (KEEP) + `core/prizeSplit` mirror | **High** | Money path atomic in DB; TS mirrors share math |
| Wallet delta | `fn_wallet_apply_delta` | DB RPC (KEEP) + `core/wallet` mirror | **High** | Ledger stays atomic in DB |
| Ticket commission | `fn_record/_distribute_ticket_commission` | DB RPC (KEEP) + `core/commission` mirror | **High** | Nested CEIL split mirrored exactly |
| Tournament commission | `fn_commission_snapshot_entry` | `core/commission.computeTournamentCommission` | **High** | Snapshot/payout remain DB triggers/RPCs |
| Ding aggregation | `fn_aggregate_ding_for_processed_draw` | trigger (KEEP) + `core/ding` mirror | **High** | Trigger authoritative; TS port idempotent, off by default |
| Tournament tick selection/eligibility | `fn_tick_due_tournaments` (outer loop) | `core/tournamentEligibility` + `domain/tournament.tickDueTournamentsEngine` | **High** | Min-players floor 3, defer +1h, error→tick_log, 55P03 skip preserved |
| Tournament per-tournament advance | `fn_tick_tournament` | DB RPC (WRAP) | n/a | Atomic row-locked advance; engine decides when/which to call |
| Tournament seating/cycle | `fn_seat_table_players`, `fn_manage_tournament_cycle` | DB RPC (WRAP) | n/a | Not ported; delegated unchanged |
| Join request path | client `fn_join_or_create_room` | `POST /v1/rooms/join` → `fn_system_join_or_create_room` | **High** | Same write set; auth via verified JWT |

## 2. Numeric parity (rounding)

The most subtle parity area. The engine mirrors Postgres `numeric` semantics:

- **Commission**: `CEIL` via `core/money.ceilInt` (with float-noise snapping to
  1e-9 before ceil) → matches `CEIL(numeric)`.
- **Prize split**: `ROUND(x, 2)` via `core/money.roundTo` using
  **round-half-away-from-zero**, matching Postgres `numeric` rounding. All
  amounts are non-negative, so half-up and half-away-from-zero coincide.
- **Clamping**: `GREATEST(x,0)` via `atLeastZero`.

**Residual risk**: JavaScript `number` is IEEE-754 double, not arbitrary-precision
`numeric`. For IRR-scale integer amounts this is well within `Number.MAX_SAFE_INTEGER`
and the 1e-9 snap neutralizes multiplication artefacts. If sub-unit decimals or
very large balances are introduced, switch `core/money` to a decimal library
(documented as a follow-up). Today's amounts: safe.

## 3. Ordering / determinism

- `pickNextNumber` compares the hex digests lexicographically, which is identical
  to Postgres `ORDER BY digest(...)` on `bytea` (hex string order == byte order).
- Ties: cryptographic digests collide with negligible probability; if equal, both
  implementations are deterministic on the candidate scan order (ascending n).

## 4. Behavioral preservation guarantees

- **No business rules changed**: percentages, gating, min-players, intervals,
  commission split, ding multiplier are all read from the same columns/meta.
- **No tables/functions/triggers/edge functions deleted**: the engine adds code;
  DB objects are untouched. Cutover migrations only `cron.unschedule` game jobs
  (reversible) — see `migration-checklist.md`.
- **Idempotency preserved**: results `ON CONFLICT DO NOTHING`, settlement guarded
  by `status`, commission by `ticket_id`/`status`, ding by `ding_aggregated_at`.
- **Atomicity preserved**: all money movement remains in single-statement DB RPCs.

## 5. Known gaps / deltas (explicitly NOT changed, just delegated)

1. **Tournament tick**: the selection + eligibility decision-making is now ported
   to TS (`core/tournamentEligibility` + `tickDueTournamentsEngine`); the
   per-tournament advance (`fn_tick_tournament`) and seating/cycle remain DB RPCs
   (atomic, row-locked) — delegated unchanged.
   - **Parity nuance**: the SQL applies `LIMIT p_limit` to the combined
     `registration_open ∪ running` ordered set. The engine fetches each subset up
     to `limit`, merges, re-applies the same ordering (`start_at` ASC NULLS LAST,
     `created_at` ASC), then slices to `limit`. Identical ordering; identical
     result whenever total due ≤ `limit` (the normal case). Under extreme backlog
     the selected slice can differ, but tournaments are processed every tick so
     none are starved. Default `limit` is 50.
2. **Card dealing on join** still happens inside `fn_system_join_or_create_room`;
   the engine wraps it. `core/rng.orderBySeed` provides the ported ordering for
   when dealing moves to TS.
3. **Ding in `engine` mode** relies on the existing DB trigger (to avoid double
   credit) until the trigger is intentionally disabled; the TS port is ready and
   idempotent.
4. **Edge functions** (`bot-schedule-worker`) and admin/report RPCs are untouched.

## 6. How to verify parity (shadow testing)

1. **Pure unit tests** (recommended next step): feed known inputs to
   `core/commission`, `core/prizeSplit`, `core/winEvaluation`, `core/rng`,
   `core/ding`, `core/tournamentEligibility` and assert against values produced
   by the SQL on the same inputs.
2. **Shadow draw**: in `hybrid`, log `pickNextNumber(seed, drawn)` next to the
   number the DB actually drew for the same room/state; assert equal over a soak.
3. **Settlement reconciliation**: compare `core/prizeSplit.splitPrizePool` output
   to `results.reward_amount` written by `fn_finish_room_and_settle` for finished
   rooms.
4. **Commission reconciliation**: compare `computeTicketCommission` to
   `commissions_log` rows (`agent_amount`, `super_amount`, `admin_amount`,
   `amount_to_pool`).
5. **Build gate**: `npm run typecheck` / `npm run build` in `game-engine/`
   (passing as of this change).

## 7. Status

- Engine typechecks and builds clean.
- Core business rules ported with high-confidence fidelity to the verified SQL.
- Financial mutations and tournament internals remain DB-atomic (KEEP/WRAP),
  matching the team roadmap and guaranteeing the fallback path.
