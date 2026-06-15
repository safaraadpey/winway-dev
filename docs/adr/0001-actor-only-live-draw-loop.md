# ADR 0001: Actor-Only Live Draw Loop

**Status:** Accepted (pending implementation on `refactor/actor-only-game-loop`)

**Date:** 2026-06-14

**Deciders:** Game engine team

## Context

The game engine historically drove live bingo draws through a **scheduler_queue** path:

```text
room-scheduler poll
  → manageRoomLiveActions (insert draw)
  → DB trigger enqueues draw_jobs
  → draw-processor pick + evaluate + finalize
  → scheduler poll again for next_draw_at
```

This worked for correctness and incremental migration from pg_cron, but added multiple wait layers (poll intervals, queue pick latency) that made sub-3s draw cadence difficult.

A **room-actor loop** was introduced: each playing room is claimed via lease, and a `RoomGameActor` owns the game clock — inserting, evaluating, and finalizing draws inline when `next_draw_at` is due.

Production validated `ROOM_LOOP_MODE=actor`. The dual-mode switch (`scheduler_queue` vs `actor`), per-room `meta.loop_mode` overrides, and shadow parity were rollout tooling. They are no longer needed for normal operation and increase the risk of double-driving the game clock.

## Decision

**Adopt actor-only live draw execution in `GAME_RUNTIME=engine`.**

Responsibilities are split as follows:

| Role | Owns |
|------|------|
| `scheduler` | Waiting-room promotion (`manageWaitingRooms`), countdown extension, finished-room janitor |
| `room-loop` | Live draw timing and execution for all `playing` rooms (`runOneDrawCycle`) |
| `draw-processor` | Recovery and cleanup of `draw_jobs` — not the primary live path for playing rooms |

Global mode switching (`ROOM_LOOP_MODE`, `loopMode.ts`) is removed. Shadow parity remains available for debugging via `ENABLE_SHADOW_PARITY=true` (default `false`).

## Rationale

### Why actor-only

1. **Single clock owner** — Only the leased room actor advances `next_draw_at` and inserts draws. Eliminates the primary source of double-draw bugs.
2. **Lower latency** — Self-scheduling `setTimeout` on `next_draw_at` removes scheduler poll slack and draw_jobs queue wait for live play.
3. **Proven in production** — Actor mode ran successfully before this refactor; rollout gates are no longer worth the complexity.
4. **Simpler mental model** — New developers see one live path instead of two parallel pipelines gated by env vars and per-room meta.

### Why not remove draw_jobs / draw-processor entirely

1. **DB trigger still enqueues** — `trg_after_draw_enqueue` fires on draw insert. Jobs exist even when the actor finalizes inline.
2. **Crash recovery** — `reapStaleJobs` and `filterActorOwnedDrawJobs` handle orphaned or stuck jobs without re-running live evaluation on actor-owned rooms.
3. **Non-playing rooms** — Finished or transitional rooms may still have pending jobs that need processing.
4. **Gradual deprecation** — Removing the trigger and table requires a separate DB migration with higher blast radius.

### Why not delete shadow parity immediately

Shadow mode compared actor RNG predictions against scheduler-inserted draws during rollout. It is unused in production but useful for debugging regressions. It is gated behind `ENABLE_SHADOW_PARITY` (default off) rather than deleted, so it can be enabled without reintroducing `ROOM_LOOP_MODE`.

### Why scheduler wake was removed

`wakeRoomScheduler("finalize")` existed to clear backpressure so the scheduler could insert the next draw without waiting for the poll interval. The actor schedules its next tick from `next_draw_at` directly; waking the scheduler is unnecessary and would be harmful if `manageRoomLiveActions` were still active.

## Components removed

| Component | Reason |
|-----------|--------|
| `ROOM_LOOP_MODE` env var | Actor is the only engine-runtime live path |
| `RoomLoopMode` type + `parseRoomLoopMode()` | No mode switch |
| `loopMode.ts` / `isActorRoom()` | Per-room opt-in/out obsolete |
| `manageRoomLiveActions()` in engine scheduler | Live draws owned by room-loop |
| `room-scheduler-wake.ts` | No scheduler live path to wake |
| `wakeRoomScheduler("finalize")` | Actor owns cadence |

## Components intentionally retained

| Component | Why it still exists | Safe to delete when |
|-----------|--------------------|-----------------------|
| `draw-processor` role | Cleans actor-owned jobs; processes recovery cases | DB trigger removed AND all historical jobs drained |
| `filterActorOwnedDrawJobs` | Prevents double-evaluate on `playing` rooms | Draw insert no longer creates jobs OR trigger disabled |
| `reapStaleJobs` | Requeues stuck `processing` jobs after crashes | Alternative durable job store with built-in recovery |
| `recoverRoom` | Actor processes unprocessed draws before new insert | Provably impossible to have unprocessed draws mid-actor |
| `shadowCycle.ts` | Debug via `ENABLE_SHADOW_PARITY` | Team agrees parity debugging no longer needed |
| `scheduler` role | Waiting promotion + janitor | Room-loop also handles waiting (not planned) |
| `hybrid` / `legacy_db` runtime | DB `fn_heartbeat_tick` fallback | Full decommission of DB heartbeat |
| Lease RPCs + owner-guarded insert | Multi-replica safety | Single-replica deployment only (not recommended) |
| `DRAW_PROCESSOR_PER_ROOM_ACTOR` | How jobs are drained, orthogonal to room clock | Separate processor architecture decision |

## Consequences

### Positive

- One live draw code path in engine runtime
- Fewer env vars and per-room meta overrides
- Clearer ownership: scheduler = lobby, room-loop = table

### Negative / trade-offs

- `hybrid` runtime does not use the actor write path (room-loop idle without `actorCycle`); production must use `GAME_RUNTIME=engine`
- `draw_jobs` rows still created per draw (storage + cleanup overhead)
- Operators must ensure `room-loop` is in `GAME_ENGINE_ROLES` or playing rooms stall after promotion

## Verification

```bash
cd game-engine && npm test
```

Manual QA: see plan checklist in [`remove_scheduler_queue_mode` plan] — roles, promotion, lease, draw cadence, no `room-scheduler live`, skip logs from draw-processor.

## Related documents

- [Low-Latency Room-Actor Game Loop Architecture](../architecture/low-latency-room-actor-game-loop.md)
- [Game Engine Reality Map](../system-map/game-engine-reality.md)
