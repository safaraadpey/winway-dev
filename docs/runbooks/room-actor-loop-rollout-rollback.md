# Room-Actor Game Loop — Operations Runbook

Operational runbook for the **actor-only** live draw loop. Historical rollout
steps (`ROOM_LOOP_MODE`, shadow parity) are retired — see
[ADR 0001](../adr/0001-actor-only-live-draw-loop.md).

## Required configuration

| Setting | Value |
|---------|-------|
| `GAME_RUNTIME` | `engine` |
| `GAME_ENGINE_ROLES` | Must include `scheduler`, `draw-processor`, `room-loop` |

## Components

- **`scheduler` role** — `manageWaitingRooms` (promote waiting → playing) + janitor.
  Does **not** insert live draws in engine runtime.
- **`room-loop` role** — `RoomLoopManager` claims playing rooms via lease and runs
  `RoomGameActor` → `runOneDrawCycle` (insert → evaluate → finalize inline).
- **`draw-processor` role** — recovery/cleanup for `draw_jobs` from DB trigger.
  Skips jobs for `status = playing` rooms (`filterActorOwnedDrawJobs`).

## Env vars

| var | default | meaning |
|---|---|---|
| `ROOM_LOOP_DISCOVERY_MS` | `1000` | discovery/claim cadence |
| `ROOM_LOOP_LEASE_SEC` | `30` | lease duration (renewed at half-life) |
| `ROOM_LOOP_MAX_ACTIVE_ROOMS` | `50` | max rooms driven per replica (0 = unlimited) |
| `ENABLE_SHADOW_PARITY` | `false` | observe-only parity (debug only; not for production) |

## Monitoring (DB views)

- `v_draw_latency_slo` — overall p50/p95/p99 (last 1h). **Gate: p95 < 3000ms.**
- `v_draw_latency_slo_by_mode` — `actor` vs historical `queue` rows.
- `v_engine_loop_health` — active rooms, unprocessed draws, queue depth.

## Engine logs to watch

| Log | Meaning |
|-----|---------|
| `room-loop manager starting` | room-loop role active |
| `room-loop heartbeat` | `activeRooms`, `claimed`, `leaseLost`, `drawsInserted` |
| `room-loop cycle completed` | actor draw cycle duration (`cycleDurationMs`) |
| `room-scheduler waiting` | waiting-room promotion (`promoted` / `extended`) |
| `draw-processor skip actor-owned jobs` | cleanup path working (not double-evaluate) |

**Should NOT appear in normal operation:**

- `room-scheduler live` with `drew > 0`
- `room-loop shadow parity` (unless `ENABLE_SHADOW_PARITY=true`)

## Manual QA checklist

- [ ] Waiting room promotes to `playing`
- [ ] Actor claims lease (`room-loop heartbeat` shows `activeRooms > 0`)
- [ ] Draws every configured interval (~3s)
- [ ] No double draw on same number
- [ ] `draw-processor skip actor-owned jobs` on playing rooms
- [ ] No shadow parity logs (unless explicitly enabled)

## Rollback (emergency)

If actor loop fails catastrophically:

1. Stop engine or remove `room-loop` from `GAME_ENGINE_ROLES`
2. Set `GAME_RUNTIME=hybrid` or re-enable pg_cron `fn_heartbeat_tick`
3. Investigate lease ownership and stuck `draw_jobs` via `reapStaleJobs`

Full revert to scheduler_queue in engine runtime is **no longer supported** in
code — use DB heartbeat (`hybrid`/`legacy_db`) as fallback.
