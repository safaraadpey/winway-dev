# Game Engine Architecture

> Goal: faithfully reproduce the CURRENT production behavior while gradually
> moving business logic out of Postgres into maintainable TypeScript, with the
> database logic preserved as a runtime-selectable fallback. No intentional
> change to user-facing behavior.

## 1. Where the engine lives

The engine is the existing standalone service at `apps/engines/bingo/` (Node 20 +
TypeScript, ESM). This implementation fleshes out the previously-scaffolded
service rather than introducing a new project, consistent with the team's
existing plan in `docs/roadmap/GAME_ENGINE_MIGRATION.md`.

## 2. Runtime modes (the fallback guarantee)

`GAME_RUNTIME` selects how much logic runs in the engine. The DB implementation
is never deleted, so any mode can be reverted instantly.

| Mode | Loops driven by | Business logic executes in | DB cron |
| --- | --- | --- | --- |
| `legacy_db` | Postgres `pg_cron` | Postgres functions | ON (authoritative) |
| `hybrid` | Engine workers | Postgres RPCs (engine orchestrates) | OFF for game jobs |
| `engine` | Engine workers | **TypeScript core** (DB = fallback) | OFF for game jobs |

- In `legacy_db` all engine workers idle → no double execution.
- `hybrid` moves the *driver* out of cron; logic still runs in DB RPCs.
- `engine` runs the ported TS business logic; the equivalent DB functions remain
  callable (re-enable cron or flip the flag to fall back).

Helpers: `src/runtime.ts` (`isIdle`, `drivesLoops`, `executesBusinessLogic`).

## 3. Layered design

```
apps/engines/bingo/src/
├── core/            ← PURE business rules (no I/O), faithful SQL ports
│   ├── money.ts         CEIL / ROUND(…,2) matching Postgres numeric
│   ├── rng.ts           provably-fair sha256 number/card ordering
│   ├── winEvaluation.ts line/full detection + first-line gating
│   ├── commission.ts    ticket + tournament nested split (CEIL)
│   ├── prizeSplit.ts    line/full pool split + carryover
│   ├── ding.ts          ding delta per user
│   ├── wallet.ts        wallet-delta invariants
│   └── tournamentEligibility.ts  tick selection + min-players decision
├── repositories/    ← typed game-data access (rooms, draws, tickets, marks, results, tournaments)
├── domain/          ← orchestrators that compose core + repositories
│   ├── room/            waiting→playing, live draw scheduling
│   ├── draw/            pick jobs, marks+evaluate (hybrid RPC & engine TS), settle
│   ├── ding/            ding aggregation (port; trigger-driven by default)
│   └── tournament/      tick selection/eligibility (TS); advance via DB RPC
├── finance/         ← RPC wrappers for the ledger (KEEP in DB; atomic)
├── workers/         ← interval loops: room-scheduler, draw-processor, tournament-orchestrator
├── http/            ← command API gateway (auth + commands) for the frontend
├── redis/           ← optional leader locks
├── db/ · config/ · metrics/ · health/
```

### Design rules

1. **`core/` is pure.** No Supabase, no `Date.now()` inside the rules, no
   randomness — every output is a deterministic function of inputs, so it can be
   unit-tested against the SQL and is provably-fair-reproducible.
2. **The ledger stays in Postgres.** `wallets`/`transactions`/commission writes
   go through `SECURITY DEFINER` RPCs (`fn_wallet_apply_delta`,
   `fn_finish_room_and_settle`, `fn_*_commission`). The engine computes/decides
   but money mutations remain atomic in one DB transaction. This is the KEEP
   decision from the roadmap and is essential for correctness.
3. **Triggers are not deleted.** Ding aggregation
   (`trg_aggregate_ding_on_processed_at`), winner sync
   (`trg_sync_room_winners_from_results`), commission immutability, etc. remain
   active. The engine's TS ports of trigger logic are gated/idempotent so they
   never double-apply alongside the live triggers (see §6).

## 4. What moves vs. what stays

| Concern | Current source | Engine treatment |
| --- | --- | --- |
| Room start (waiting→playing) | `game_core.fn_manage_waiting_rooms` | **MOVE** → `domain/room.manageWaitingRooms` |
| Live draw scheduling + RNG | `game_core.fn_manage_room_live_actions` | **MOVE** → `domain/room.manageRoomLiveActions` + `core/rng` |
| Draw job processing | cron `fn_process_draw_jobs_batch_worker` | **MOVE** → `domain/draw` (hybrid RPC / engine TS) |
| Apply marks | `rpc_apply_marks_for_draw` | **MOVE** → `domain/draw/evaluateDraw` |
| Win evaluation | `public.fn_evaluate_room_after_draw` | **MOVE** → `core/winEvaluation` |
| Settlement / prize payout | `game_finance.fn_finish_room_and_settle` | **KEEP** (RPC); math mirrored in `core/prizeSplit` |
| Wallet ledger | `game_finance.fn_wallet_apply_delta` | **KEEP** (RPC); invariants in `core/wallet` |
| Commission | `fn_record/_distribute_ticket_commission`, `tournament.fn_commission_*` | **KEEP** (RPC); math in `core/commission` |
| Ding aggregation | trigger `fn_aggregate_ding_for_processed_draw` | **KEEP** (trigger); ported to `core/ding` + `domain/ding` |
| Tournament tick selection + eligibility | `tournament.fn_tick_due_tournaments` | **MOVE** → `core/tournamentEligibility` + `domain/tournament.tickDueTournamentsEngine` |
| Tournament per-tournament advance | `tournament.fn_tick_tournament` | **WRAP** (DB; atomic row-locked advance) |
| Tournament seating/cycle | `fn_seat_table_players`, `fn_manage_tournament_cycle` | **WRAP** (DB) for now |
| Card pool generation | `fn_generate_card_pool*` | **KEEP** (admin/DB) |
| Auth / RLS | RLS + `auth.uid()` | API gateway verifies JWT, calls engine-only RPCs |

## 5. Request path (API migration)

```
Browser ──JWT──▶ Next.js route ──▶ Game Engine /v1/* ──service_role──▶ Postgres
                                   (verify JWT → engine-only RPC)
```

The frontend stops calling business-logic RPCs from the browser; it calls the
engine command API (`http/server.ts`), which verifies the Supabase JWT and
invokes the engine-facing RPCs (e.g. `fn_system_join_or_create_room`). Read and
ledger semantics are unchanged. See `api-migration-plan.md`.

## 6. Avoiding double execution (correctness)

- **Cron vs engine**: a mode other than `legacy_db` requires cron game jobs to be
  unscheduled (cutover migration). The worker idles in `legacy_db`, so both can
  coexist only when the engine is intentionally off.
- **Ding**: stamping `draws.processed_at` (engine or DB) fires the live ding
  trigger. The engine therefore does NOT run TS ding by default; the `domain/ding`
  port is idempotent (guarded by `draws.ding_aggregated_at`) and is enabled only
  when the trigger is disabled.
- **Idempotency**: results use `ON CONFLICT (ticket_id, win_type) DO NOTHING`;
  settlement and commission are idempotent in the DB; the engine relies on the
  same guards.

## 7. Determinism / provably fair

`core/rng.ts` reproduces the exact SQL ordering
`sha256(hex(room_seed) || ':' || key)` used for both number selection and card
dealing, so engine-drawn numbers verify against the published `room_seed_hash`
identically to the DB engine.
