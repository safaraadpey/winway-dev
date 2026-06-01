# Migration Checklist

> Operational steps to roll the Game Engine out safely, phase by phase, with the
> database logic preserved as a fallback at every step. Nothing here deletes DB
> objects; cutover only unschedules cron jobs (reversible).

## Phase 0 — Foundation (no behavior change)

- [x] Engine service structure (`game-engine/`) + health.
- [x] Pure business-logic core (`src/core/*`) ported from verified SQL.
- [x] Domain orchestrators (`room`, `draw`, `ding`, `tournament`).
- [x] Repositories for game-data tables.
- [x] Finance adapter (RPC wrappers; ledger stays in DB).
- [x] Command API gateway (`/v1/*`) + JWT auth.
- [x] Runtime modes wired (`legacy_db` / `hybrid` / `engine`).
- [x] `npm run typecheck` passes.
- [ ] Add unit tests for `core/*` asserting parity with SQL (recommended next).
- [ ] Deploy engine to staging with `GAME_RUNTIME=legacy_db` (workers idle).

## Phase 1 — Hybrid draw (engine drives, DB logic)

- [ ] Set `GAME_RUNTIME=hybrid`, `GAME_ENGINE_ROLES=draw-processor` on staging.
- [ ] **Unschedule** cron draw jobs only:
      `SELECT cron.unschedule(jobid)` for jobs 11/12/13
      (`fn_process_draw_jobs_batch_worker`). Keep the script to re-`cron.schedule`
      for rollback.
- [ ] Verify draws drain via engine; `draw_jobs` queue stable.
- [ ] Shadow-test `core/rng.pickNextNumber` vs DB-drawn numbers.
- [ ] Load test ~20 playing rooms.

## Phase 2 — Room scheduler + reads

- [ ] Add `GAME_ENGINE_ROLES=scheduler` (+ Redis leader lock for >1 replica).
- [ ] **Unschedule** cron job 9 (`fn_heartbeat_tick`) — keep rollback script.
- [ ] Confirm waiting→playing + draw scheduling parity (hybrid calls
      `fn_heartbeat_tick`; engine mode runs TS port).
- [ ] Enable command API (`GAME_ENGINE_API=true`); smoke `/v1/lobby`,
      `/v1/rooms/:id/state`.

## Phase 3 — Join through the engine

- [ ] Smoke `POST /v1/rooms/join` with a real JWT (creates ticket + holds funds
      via `fn_system_join_or_create_room`).
- [ ] Add frontend feature flag `NEXT_PUBLIC_USE_GAME_ENGINE` +
      `NEXT_PUBLIC_GAME_ENGINE_URL`; update `services/rooms.ts` join shim.
- [ ] **Security migrations** (additive grants only):
  - [ ] `REVOKE EXECUTE ON FUNCTION public.fn_system_join_or_create_room(...) FROM anon, authenticated;`
  - [ ] `REVOKE EXECUTE ON FUNCTION public.fn_tournament_entry_upsert(...) FROM anon, authenticated;`
  - [ ] Keep client `fn_join_or_create_room` until cutover validated.
- [ ] Flip the flag in staging; verify identical behavior; then production.

## Phase 4 — Tournament tick driver + selection logic

- [x] Port tick selection/eligibility decision to TS (`core/tournamentEligibility`,
      `domain/tournament.tickDueTournamentsEngine`, `repositories/tournamentRepo`):
      due-set selection, min-players floor 3, defer +1h, per-tournament error
      isolation → `tournament.tournament_tick_log`, `55P03` skip.
- [x] Wire worker: `engine` mode → TS selection driving `fn_tick_tournament` per
      tournament; `hybrid` mode → whole DB RPC (`fn_tick_due_tournaments`).
- [ ] Add `GAME_ENGINE_ROLES=tournament-orchestrator`.
- [ ] **Unschedule** cron job 16 (`fn_tick_due_tournaments`) — keep rollback.
- [ ] Verify registration→running, seating, round advance unchanged (per-tournament
      advance is still the atomic `fn_tick_tournament` RPC — fallback preserved).
- [ ] Shadow-test: compare engine `decideTournamentTick` outcomes to DB behavior
      over a soak (defer vs advance counts).

## Phase 5 — Full engine business logic

- [ ] Set `GAME_RUNTIME=engine` on staging; soak 24h.
- [ ] Verify settlement reconciliation (`core/prizeSplit` vs `results`).
- [ ] Verify commission reconciliation (`core/commission` vs `commissions_log`).
- [ ] Decide on ding: keep DB trigger (default) OR disable trigger and enable the
      TS port (`domain/ding`) — never both.

## Cutover (production)

- [ ] Maintenance window.
- [ ] `SELECT * FROM cron.job` → confirm no active game jobs (8/9/11/12/13/16 as
      applicable) while engine is authoritative.
- [ ] Engine `/health` OK on all replicas; `SUPABASE_SERVICE_ROLE_KEY` only on
      engine + Next server.
- [ ] Deploy engine → deploy Next with flags.
- [ ] Smoke: join, play a full room (line + full + settle), tournament seat, payout.

## Rollback (< 15 min, any phase)

- [ ] Set `GAME_RUNTIME=legacy_db` on the engine (workers idle).
- [ ] Re-run the saved `cron.schedule(...)` script to re-enable the DB jobs.
- [ ] Set `NEXT_PUBLIC_USE_GAME_ENGINE=false` (clients call DB RPCs again).
- [ ] Verify one complete room cycle on the DB engine.

## Invariants enforced throughout (do-not-break)

- [ ] No DB table deleted.
- [ ] No SQL function deleted.
- [ ] No trigger deleted.
- [ ] No edge function deleted.
- [ ] No API endpoint removed (frontend flag is additive/reversible).
- [ ] DB business logic remains callable as fallback in every phase.

## Environment variables (engine)

| Var | Purpose | Cutover value |
| --- | --- | --- |
| `GAME_RUNTIME` | `legacy_db`/`hybrid`/`engine` | staged per phase |
| `GAME_ENGINE_ROLES` | `scheduler,draw-processor,tournament-orchestrator` | per replica |
| `GAME_ENGINE_API` | enable command API | `true` (from Phase 2) |
| `GAME_ENGINE_HTTP_PORT` | API/health port | `8080` |
| `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` | DB access | required |
| `REDIS_URL` | leader locks (multi-replica) | recommended at scale |

| Var (Next.js) | Purpose |
| --- | --- |
| `NEXT_PUBLIC_USE_GAME_ENGINE` | route business calls to engine |
| `NEXT_PUBLIC_GAME_ENGINE_URL` | engine base URL |
