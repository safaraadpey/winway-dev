# Horizontal scaling deploy gate

Do **not** raise Railway game-engine replica count until every item below passes.

## Required environment (production)

| Variable | Expected | Notes |
|----------|----------|--------|
| `GAME_RUNTIME` | `engine` | Actor-only live draw path |
| `SCHEDULER_ENABLED` | `true` | On engine service only |
| `GAME_ENGINE_ROLES` | includes `scheduler`, `room-loop`, `draw-processor` | See ADR-0001 |
| `REDIS_URL` or Upstash REST | configured | Required when `COORDINATION_STRICT=true` |
| `COORDINATION_STRICT` | `true` | Fail-closed global locks; do not scale without Redis |
| `ENGINE_REPLICA_COUNT` | matches Railway replicas | Used for startup warnings |

## PostgreSQL (no dual driver)

Confirm game-driving cron jobs are **not** scheduled:

- `bingo_heartbeat` / `fn_heartbeat_tick`
- `bingo_draw_worker_*` / `fn_process_draw_jobs_batch_worker`
- `tournament.fn_tick_due_tournaments` (if engine runs tournament role)

Safe to remain: `fn_janitor_sweep`, card pool, retention maintenance.

## Startup log prefix

On boot, `[Coordination]` lines from `startupGate.ts` must show:

- `coordinationStrict` and Redis availability aligned
- `replicaCount` warning if `> 1` without strict + Redis
- `roomLoop` role present when `GAME_RUNTIME=engine`

## Scale-out order

1. One replica, strict coordination on, soak 24h
2. Two replicas, `ROOM_LOOP_MAX_ACTIVE_ROOMS` capped per instance, run `npm test` + `scripts/test-multi-replica.ts`
3. Three replicas after crash/takeover tests pass

## Rollback

Reduce Railway replicas to **1** immediately if duplicate draws, split ownership, or rising `unprocessed_draws` appear.
