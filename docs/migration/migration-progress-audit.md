# Migration Progress Audit — Consolidated Completion Report

> Final progress audit of the Game Engine migration. Source of truth: existing
> migration artifacts (`game-engine-architecture.md`, `function-mapping.md`,
> `api-migration-plan.md`, `compatibility-report.md`, `migration-checklist.md`),
> the implemented `apps/engines/bingo/src/**` code, and the verified DB inventory in
> `docs/system-map/*`.
>
> This is an audit only — no architecture change, no re-evaluation of completed
> MOVE items. Legacy DB implementations remain the fallback in every line below.

---

## 0. Legend

- **Owner**: who executes the business logic in the target (`engine`) runtime —
  **DB**, **Engine**, or **Hybrid** (engine decides/drives, DB performs an atomic
  step or vice-versa).
- **State**: `MOVE` (done — ported to TS), `WRAP` (engine calls DB RPC),
  `KEEP` (DB system-of-record by design), `PARTIAL` (decision ported, atomic
  write/op delegated).
- Already-completed MOVE items are listed in §4 for context but are **not**
  re-audited.

---

## 1. Remaining capabilities (KEEP / WRAP / PARTIALLY MIGRATED)

### 1.1 Financial / Ledger

| # | Function / capability | Domain | Owner | State | Why not fully migrated | Complexity | Risk | Next step |
|---|---|---|---|---|---|---|---|---|
| F1 | `game_finance.fn_wallet_apply_delta` | wallet | DB | KEEP | Single atomic ledger primitive; `FOR UPDATE` + balance invariant must be one transaction | High | High | Keep as DB primitive. Only migrate if a TS transactional boundary (advisory lock + RPC batching) is introduced; not recommended |
| F2 | `game_finance.fn_finish_room_and_settle` | financial | DB | PARTIAL | Settlement *decision* (when) is in engine (`winEvaluation`); the multi-write money path (capture + commission + prize payout) stays atomic in DB | High | High | Optional: engine computes breakdown (already mirrored in `core/prizeSplit`) and calls per-winner `fn_wallet_apply_delta` inside a DB tx wrapper. Defer — atomicity risk |
| F3 | `fn_record_ticket_commission` / `fn_distribute_ticket_commission` | commission | DB | PARTIAL | Math mirrored in `core/commission`; snapshot+payout writes kept atomic; admin-remainder rollup needs the wallet tx | Medium | High | Keep writes in DB; use `core/commission` for shadow parity only |
| F4 | `fn_wallet_transfer_panel(_bulk)`, `fn_adjust_wallet_manual`, `fn_adjust_referral_wallet` | wallet / admin | DB | KEEP | Admin/agent money ops with hierarchy checks; called from Next API routes (server-side already) | Medium | High | Route through engine command API later; logic stays DB |
| F5 | `fn_wallet_hold_join` / `fn_wallet_capture_join` / `fn_wallet_release_join` | wallet | DB | KEEP | Join/settlement money steps; atomic | Medium | High | Keep; invoked by join + settlement RPCs |

### 1.2 Tournament

| # | Function / capability | Domain | Owner | State | Why not fully migrated | Complexity | Risk | Next step |
|---|---|---|---|---|---|---|---|---|
| T1 | `tournament.fn_tick_tournament` | tournament | DB | WRAP | Atomic per-tournament advance (`FOR UPDATE NOWAIT`) wrapping cycle+seating; engine decides *when/which* (`tickDueTournamentsEngine`) | High | High | Decompose into TS state machine calling cycle/seat sub-RPCs under a per-tournament lock (advisory lock). Defer until seating is safe |
| T2 | `fn_manage_tournament_cycle` | tournament | DB | WRAP | Round creation / bracket progression; complex writes | High | Medium | Port round-advance decision to TS, keep room creation as RPC |
| T3 | `fn_assign_templates_for_round` | tournament | DB | WRAP | Template assignment per round/table | Medium | Medium | Portable to TS (selection logic); writes via repo |
| T4 | `fn_seat_table_players` / `fn_seat_players_for_round` | tournament / matchmaking | DB | WRAP | Seating uses JWT impersonation / system join; security-sensitive | High | High | Replace with explicit `SeatPlayer` command + assignment check (roadmap A3/A5); `fn_seat_players_for_round` is DEPRECATE |
| T5 | `fn_commission_snapshot_entry` (+ `trg_te_commission_snapshot`) | commission | DB (trigger) | PARTIAL | Auto-snapshot on entry insert/update; math mirrored in `core/commission.computeTournamentCommission` | Medium | Medium | Keep trigger; enable TS only if trigger disabled |
| T6 | `fn_commission_payout` / `fn_settle_commission_payouts` | commission | DB | WRAP | Builds + settles tournament commission payout rows (atomic, wallet writes) | Medium | High | Keep writes in DB; engine can drive timing |
| T7 | `fn_tournament_wallet_hold/capture/release`, `fn_tournament_entry_upsert` | financial | DB | KEEP | Entry money + entry rows; `entry_upsert` is a security item (REVOKE from client) | Medium | High | REVOKE `fn_tournament_entry_upsert` from client; route entry via engine command |
| T8 | `fn_payout_tournament`, `fn_burn_ding_locks`, `fn_admin_refund_cancelled_tournament` | financial | DB | KEEP | Final payout / refund / ding-lock cleanup; atomic money | Medium | High | Keep; engine triggers via command/timing |

### 1.3 Room / Draw / Matchmaking

| # | Function / capability | Domain | Owner | State | Why not fully migrated | Complexity | Risk | Next step |
|---|---|---|---|---|---|---|---|---|
| R1 | `game_core.rpc_pick_draw_jobs` | draw | DB | WRAP | Atomic `FOR UPDATE SKIP LOCKED` shard claim; cheaper/safer in SQL | Low | Medium | Keep as claim primitive (recommended) or port with row-locking semantics |
| R2 | `trg_after_draw_enqueue` (draws → `draw_jobs`) | draw | DB (trigger) | KEEP | Engine's `INSERT draws` relies on this trigger to enqueue jobs | Low | High | **Hidden dependency** — keep until engine enqueues `draw_jobs` explicitly (then optional MOVE) |
| R3 | `fn_join_or_create_room` / `_core` / `_base` / `fn_system_join_or_create_room` | matchmaking | Hybrid | PARTIAL | Engine API gateway authenticates + routes (`POST /v1/rooms/join`); room/card/hold logic stays in `fn_system_join_or_create_room` | High | High | Port validation + card selection (`core/rng.orderBySeed`) to TS; keep wallet hold + ticket insert atomic in a join RPC |
| R4 | Card dealing (inside join) | draw | DB | PARTIAL | Ordering ported (`core/rng.orderBySeed`); allocation still in join RPC | Medium | Medium | Move allocation to TS after R3 |
| R5 | `fn_generate_card_pool` / `fn_generate_card_pool_step` / `game_pool.*` | draw | DB | KEEP | Admin/maintenance pool build (cron 15); not on the hot path | Low | Low | Keep (admin domain) |
| R6 | `fn_janitor_sweep` (cron 14) | room / resiliency | DB | KEEP | Self-healing: cancels stuck `waiting`/`playing` rooms, re-settles stuck `settling` | Medium | High | **Hidden critical** — port to a `domain/room` janitor worker before cutover, or keep cron 14 active in `engine` mode |
| R7 | `api_get_room_state`, `rpc_get_active_rooms`, `rpc_get_lobby_price_summary`, `fn_my_active_rooms` | read | Hybrid | WRAP | Read RPCs fronted by engine API; no behavior change needed | Low | Low | Optional: add short Redis cache; keep RPC |
| R8 | `fn_cancel_waiting_room(s)` | room | DB | WRAP | Cancel + hold release; atomic money | Medium | Medium | Keep RPC; engine can expose a cancel command |
| R9 | `rpc_reveal_room_seed` / `rpc_get_room_seed_hash` | provably-fair | DB | KEEP | Seed reveal/verify; trivial reads | Low | Low | Keep |

### 1.4 Ding

| # | Function / capability | Domain | Owner | State | Why not fully migrated | Complexity | Risk | Next step |
|---|---|---|---|---|---|---|---|---|
| D1 | `fn_aggregate_ding_for_processed_draw` (`trg_aggregate_ding_on_processed_at`) | ding | DB (trigger) | PARTIAL | TS port exists (`core/ding` + `domain/ding`, idempotent) but **off by default** to avoid double-credit while the trigger is live | Low | Medium | To finish: disable the trigger and enable `aggregateDingForDraw` in the draw-processor — never both |
| D2 | `update_ding_balance` | ding | DB | WRAP | Balance increment RPC used by the TS port | Low | Low | Keep as increment primitive |

### 1.5 Admin / Identity / Presence / Bots

| # | Function / capability | Domain | Owner | State | Why not fully migrated | Complexity | Risk | Next step |
|---|---|---|---|---|---|---|---|---|
| A1 | `handle_new_user` (auth.users trigger) | identity / referral | DB (trigger) | KEEP | Signup → users/affiliation/wallets/profile; tied to Supabase Auth events | High | High | **Hidden critical** — out of game-engine scope; keep in DB |
| A2 | `fn_admin_create/update/delete/set_status_tournament`, `fn_admin_games_report` | admin | DB | KEEP/WRAP | Admin business ops; called from admin pages/API | Medium | Medium | Route admin mutations through an engine admin command later |
| A3 | `fn_dashboard_*`, leaderboards (`get_*_leaders`), `fn_player_*` | reporting | DB | KEEP | Pure read/reporting; no migration value | Low | Low | Keep (optionally cache) |
| A4 | `fn_heartbeat_log` (cron 8), `fn_ping_presence` | presence | DB | KEEP | Presence logging; high-frequency, cheap in DB | Low | Low | Keep |
| A5 | Edge fn `dev-schedule-worker` (cron 21) | dev-players | Edge | KEEP | Dev player room scheduling via `fn_pick_dev_room_schedules` | Medium | Medium | Keep; could become an engine worker post-cutover |
| A6 | Edge fn `draw-worker` (cron 5, inactive) | draw | Edge | DEPRECATE | Superseded by engine draw-processor; already disabled | Low | Low | Remove after cutover (cleanup only) |
| A7 | Maintenance crons: `fn_maintain_heartbeat_log_partitions` (19), `fn_cleanup_retention` (20) | ops | DB | KEEP | DB housekeeping | Low | Low | Keep |

---

## 2. Hidden critical logic still in DB

These are not obvious from the API surface but are load-bearing. Each must be
explicitly accounted for before `GAME_RUNTIME=engine` cutover.

| Mechanism | Location | Why it's critical | Status |
|---|---|---|---|
| `trg_after_draw_enqueue` | trigger on `draws` | Turns the engine's `INSERT draws` into `draw_jobs`; the entire draw pipeline depends on it | KEEP (engine relies on it) — **do not disable** |
| `fn_janitor_sweep` | cron 14 | Self-healing of stuck waiting/playing/settling rooms; without it a stalled room never recovers | KEEP — **must stay scheduled** or be ported before cutover |
| `trg_sync_room_winners_from_results` | trigger on `results` | Denormalizes winners into `room_winners` that the UI reads | KEEP (fires on engine result inserts) |
| `fn_lock_commission_snapshot` | trigger on `commissions_log` | Enforces commission-snapshot immutability | KEEP |
| `trg_te_commission_snapshot` → `fn_commission_snapshot_entry` | trigger on `tournament_entries` | Auto-creates commission snapshots on entry; engine does not | KEEP (PARTIAL port) |
| `trg_rooms_after_live` / `trg_tickets_after_paid` | triggers (game_finance) | Hook room-live / ticket-paid into commission/capture | KEEP — verify they still fire under engine writes |
| `handle_new_user` | trigger on `auth.users` | Entire signup/affiliation/wallet bootstrap | KEEP (identity domain) |
| `trg_guard_tournament_entry_mutations`, `trg_on_entry_cancel_cleanup` | triggers | Entry mutation guards + cancel cleanup | KEEP |

**Audit note**: the engine writes `rooms`, `draws`, `marks`, `results` directly
in `engine` mode. The triggers above fire on those writes exactly as they do for
DB-driven writes, so behavior is preserved — but this coupling means those
triggers are **required**, not optional, during migration.

---

## 3. Migration completion score

Methodology: capability-count across the **business-logic surface** in §1 + the
completed MOVE set in §4, classified by who executes the logic in `engine`
runtime. Pure reporting/identity/ops that are KEEP-by-design are included (they
are real DB dependencies) and called out separately. Percentages are rounded;
see the two lenses.

### Lens A — Whole business-logic surface (all of §1 + §4)

| Owner | Capabilities | Share |
|---|---|---|
| **Engine** (MOVE, fully ported) | room start, live draw + RNG, marks, win-eval, settlement-decision, tournament tick selection/eligibility, draw-loop drivers, API auth | **~34%** |
| **Hybrid / shared** (engine decides/drives, DB performs) | draw-job claim, join routing, ding (port ready/off), card-deal ordering, tournament per-tournament advance, reads via API | **~24%** |
| **Database** (KEEP system-of-record) | wallet ledger, settlement writes, commission writes, tournament finance, seating/cycle, janitor, card-pool, signup, presence, reporting, bots | **~42%** |

### Lens B — Hot-path game runtime only (the loops the migration targets)

> Excludes intentionally-permanent KEEP domains (ledger, identity, reporting,
> ops). This is the "did we move the live game engine?" view.

| Owner | Share |
|---|---|
| **Engine** | **~80%** (room lifecycle, draw scheduling+RNG, marks, evaluation, settlement-decision, tournament selection) |
| **Hybrid** | **~15%** (atomic draw-job claim, per-tournament advance, join logic) |
| **DB-only on hot path** | **~5%** (settlement money write + draw-enqueue trigger) |

### Headline

- **Game-loop orchestration: ~80% engine-owned** (the high-traffic runtime is
  migrated; only atomic claims, settlement writes, and one trigger remain).
- **Financial ledger: ~0% migrated by design** (KEEP) — and should stay DB-atomic.
- **Overall decision-making logic: ~34% engine / ~24% hybrid / ~42% DB.**

---

## 4. Completed MOVE items (context only — not re-audited)

`fn_manage_waiting_rooms`, `fn_manage_room_live_actions` (+ provably-fair RNG),
`rpc_apply_marks_for_draw`, `fn_evaluate_room_after_draw` (line/full + first-line
gating), `fn_process_draw_jobs_batch_worker` (engine draw-processor),
`fn_heartbeat_tick` (driver), and `fn_tick_due_tournaments` **selection +
eligibility** decision-making. See `function-mapping.md` §A and §D1.

---

## 5. Final prioritized checklist (business impact ↓, risk ↑ within tier)

Ordered: highest business impact first; within each tier, lowest-risk first.

### Tier 1 — Required for a safe `engine` cutover (do first)
1. **[R6] Guarantee `fn_janitor_sweep` runs in `engine` mode** — keep cron 14
   scheduled (or port to a `domain/room` janitor worker). *Low cost, prevents
   stuck-room outages.* Risk: High if forgotten.
2. **[R2] Document + lock `trg_after_draw_enqueue` as a required dependency** —
   add a cutover check that it is enabled. *Low cost.* 
3. **[D1] Finalize ding ownership** — choose: keep trigger (default, zero-risk) OR
   disable trigger + enable `aggregateDingForDraw`. *Decision + flag.* Risk: Medium
   (double-credit if both).
4. **[verification] Add `core/*` parity unit tests + hybrid shadow soak**
   (commission, prizeSplit, winEvaluation, rng, ding, tournamentEligibility).
   *Low risk, high confidence gain.*

### Tier 2 — High business impact, medium risk
5. **[R3/R4] Move join validation + card-deal allocation to TS**, keeping wallet
   hold + ticket insert atomic in a join RPC; REVOKE `fn_system_join_or_create_room`
   from client. *High impact (hot path), High risk — stage carefully.*
6. **[T7] REVOKE `fn_tournament_entry_upsert` from client + route entry via engine**
   command. *Security + impact; Medium-High risk.*
7. **[T4] Replace seating impersonation with explicit `SeatPlayer` command +
   assignment check**; deprecate `fn_seat_players_for_round`. *High impact security.*

### Tier 3 — Decision-logic ports (medium impact, medium risk)
8. **[T2/T3] Port round-advance + template-assignment decision** to TS, keeping
   room creation as RPC.
9. **[R7] Front reads with a short Redis cache** (lobby/room-state). *Low risk.*
10. **[R8] Expose cancel-waiting-room as an engine command** (logic stays DB).

### Tier 4 — Keep-by-design / cleanup (low priority)
11. **[F1–F5, T6, T8] Keep ledger + atomic money RPCs in DB** — do not migrate;
    use `core/*` mirrors for shadow parity only.
12. **[A2] Route admin tournament mutations through an engine admin command** (logic DB).
13. **[A5] Optionally convert `dev-schedule-worker` edge fn to an engine worker** post-cutover.
14. **[A6] Remove the disabled `draw-worker` edge function** (cleanup).

---

## 6. Completion summary

| Question | Answer |
|---|---|
| Is the live game loop migrated? | **Yes (~80%)** — room lifecycle, draws+RNG, marks, evaluation, settlement-decision, tournament selection run in the engine in `engine` mode. |
| Is the financial ledger migrated? | **No, by design (KEEP)** — atomic wallet/commission/settlement writes stay in DB RPCs (mirrored in `core/*` for parity). |
| Biggest remaining hot-path items? | Join orchestration (R3/R4), tournament per-tournament advance + seating (T1/T4), ding ownership decision (D1). |
| Biggest hidden risks? | `fn_janitor_sweep` (R6) and `trg_after_draw_enqueue` (R2) must remain active in `engine` mode; ding double-credit (D1). |
| Fallback intact? | **Yes** — every item above retains its DB implementation; `GAME_RUNTIME=legacy_db` + re-enabled cron fully restores the DB engine. |
| Safe to cut over now? | After Tier 1 (janitor guarantee, enqueue dependency, ding decision, parity tests). |

**Bottom line**: the migration has moved the real-time game orchestration into
maintainable TypeScript while correctly preserving the atomic financial ledger
and identity logic in the database. Remaining work is concentrated in (a) two
must-keep DB safety mechanisms that need cutover guarantees, (b) the join/seating
hot-path ports, and (c) a one-time ding ownership decision — all low-to-medium
effort with the fallback fully preserved.
