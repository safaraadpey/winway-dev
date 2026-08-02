# Local Game Engine Rollout

Operational steps to bring `apps/game-engine/` online against the **clone** project
(`gtwgatewbagklpmxdlsj`) while keeping DB cron as rollback.

## Prerequisites

- `winway/.env.local` has `NEXT_PUBLIC_SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY`
- DB crons: heartbeat (job 2), draw workers (3–5), janitor (6), tournament (7), card pool (1)
- Node 20+

## Quick commands

```powershell
# From repo root
cd apps/game-engine
npm install
npm run typecheck

# Phase 0 — engine idle, DB authoritative
$env:GAME_RUNTIME='legacy_db'
$env:GAME_ENGINE_ROLES='draw-processor'
..\..\scripts\sync-game-engine-env.ps1
npm run dev
# curl http://localhost:8080/health

# Phase 1 — engine drains draw_jobs (disable DB draw crons first!)
# In Supabase SQL: run scripts/game-engine-cron-draw-workers.sql (DISABLE section)
$env:GAME_RUNTIME='hybrid'
$env:GAME_ENGINE_ROLES='draw-processor'
..\..\scripts\sync-game-engine-env.ps1
npm run dev

# Phase 2 — engine owns heartbeat (disable bingo_heartbeat cron first!)
# In Supabase SQL: run scripts/game-engine-cron-heartbeat.sql (DISABLE section)
# Or migration: sql/migrations/20260602120000_game_engine_phase2_disable_heartbeat_cron.sql
$env:GAME_RUNTIME='hybrid'
$env:GAME_ENGINE_ROLES='scheduler,draw-processor'
..\..\scripts\sync-game-engine-env.ps1
npm run dev
# Logs should show room-scheduler ticks (fn_heartbeat_tick) + draw-processor batches

# Phase 5 — engine owns tournament tick (disable tournament cron first!)
# Requires: sql/migrations/20260605120000_public_tournament_tick_rpc_wrappers.sql
# In Supabase SQL: run scripts/game-engine-cron-tournament.sql (DISABLE section)
$env:GAME_RUNTIME='hybrid'
$env:GAME_ENGINE_ROLES='scheduler,draw-processor,tournament-orchestrator'
..\..\scripts\sync-game-engine-env.ps1
npm run dev
# Logs: tournament-orchestrator + tournament tick when due tournaments exist
```

## Phases

| Phase | GAME_RUNTIME | ROLES | DB cron OFF | DB cron ON |
|-------|--------------|-------|-------------|------------|
| 0 Smoke | `legacy_db` | any | — | all |
| 1 Draw hybrid | `hybrid` | `draw-processor` | draw 1–3 | heartbeat, janitor, tournament, pool |
| 2 Room hybrid | `hybrid` | `scheduler,draw-processor` | draw + heartbeat | janitor, tournament, pool |
| 3 API | + `GAME_ENGINE_API=true` | same | same | same |
| 4 Engine TS | `engine` | `scheduler,draw-processor` | draw + heartbeat | janitor, … |
| 5 Tournament | + `tournament-orchestrator` | unschedule tournament cron | tournament |

## Rollback (< 5 min)

1. Stop `apps/game-engine` (Ctrl+C).
2. `GAME_RUNTIME=legacy_db` in `.env` or stop running engine.
3. Run **RESTORE** section in `scripts/game-engine-cron-draw-workers.sql` (and heartbeat if phase 2 was applied).
4. Play one room cycle — confirm draws process via cron.

## Verify Phase 1

- Engine logs: `draw-processor` with `picked` / `done` > 0 during a `playing` room.
- SQL: `SELECT status, COUNT(*) FROM draw_jobs WHERE room_id = '<id>' GROUP BY status;`
- No duplicate marks (engine + cron both off for draw workers).

## Do not disable

- `fn_janitor_sweep` (job 6)
- `fn_generate_card_pool_step` (job 1)
