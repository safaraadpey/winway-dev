# Local Game Engine Rollout

Operational steps to bring `game-engine/` online against the **clone** project
(`gtwgatewbagklpmxdlsj`) while keeping DB cron as rollback.

## Prerequisites

- `winway/.env.local` has `NEXT_PUBLIC_SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY`
- DB crons: heartbeat (job 2), draw workers (3–5), janitor (6), tournament (7), card pool (1)
- Node 20+

## Quick commands

```powershell
# From repo root
cd game-engine
npm install
npm run typecheck

# Phase 0 — engine idle, DB authoritative
$env:GAME_RUNTIME='legacy_db'
$env:GAME_ENGINE_ROLES='draw-processor'
..\scripts\sync-game-engine-env.ps1
npm run dev
# curl http://localhost:8080/health

# Phase 1 — engine drains draw_jobs (disable DB draw crons first!)
# In Supabase SQL: run scripts/game-engine-cron-draw-workers.sql (DISABLE section)
$env:GAME_RUNTIME='hybrid'
$env:GAME_ENGINE_ROLES='draw-processor'
..\scripts\sync-game-engine-env.ps1
npm run dev
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

1. Stop `game-engine` (Ctrl+C).
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
