# Room-Actor Game Loop — Rollout & Rollback Runbook

Operational runbook for the room-actor-driven game loop (see
`docs/architecture/low-latency-room-actor-game-loop.md` and the implementation
plan). Goal: per-room enqueue→first_pick p95 < 3000ms while preserving draw
order, idempotency, recovery, provably-fair draws, and atomic settlement.

## Components

- **Role `room-loop`** — set in `GAME_ENGINE_ROLES`. Runs `RoomLoopManager`,
  which discovers claimable playing rooms (`rpc_find_claimable_playing_rooms`),
  claims a per-room lease (`rpc_claim_game_room`), and runs one `RoomGameActor`
  per claimed room.
- **`ROOM_LOOP_MODE`** — `scheduler_queue` (default, legacy path) or `actor`
  (global default for the loop). Per-room override via `rooms.meta.loop_mode`.
- **Owner-guarded insert** — `rpc_insert_draw_if_ready_owner_guard` only lets the
  lease owner insert; advances `next_draw_at` and renews the lease atomically.
- **Double-drive guard** — `manageRoomLiveActions` skips any room that resolves
  to actor mode, so the legacy scheduler never inserts draws for actor rooms.
- **draw-processor skip** — picked `draw_jobs` for actor-owned rooms are not
  evaluated by the queue processor: already-processed draws mark the job `done`;
  in-flight draws are requeued for the room-loop actor (which owns eval/finalize).

## Env vars

| var | default | meaning |
|---|---|---|
| `ROOM_LOOP_MODE` | `scheduler_queue` | global loop mode |
| `ROOM_LOOP_DISCOVERY_MS` | `1000` | discovery/claim cadence |
| `ROOM_LOOP_LEASE_SEC` | `30` | lease duration (renewed at half-life) |
| `ROOM_LOOP_MAX_ACTIVE_ROOMS` | `50` | max rooms driven per replica (0 = unlimited) |

## Monitoring (DB views)

- `v_draw_latency_slo` — overall p50/p95/p99 (last 1h). **Gate: p95 < 3000ms.**
- `v_draw_latency_slo_by_mode` — same split into `actor` vs `queue`. Watch the
  `actor` row during rollout.
- `v_engine_loop_health` — active rooms, unprocessed draws, queue depth,
  settlement lag.
- Engine logs: `room-loop heartbeat` (claimed / leaseLost / drawsInserted /
  backpressureSkips / recoveries / shadowParityMismatch / errors) and
  `room-loop shadow parity ok|MISMATCH` during shadow.

Baseline (queue path, pre-rollout): p50 ≈ 5.3s, p95 ≈ 8.0s, p99 ≈ 9.8s,
100% of draws over 3s. This is the bar the actor path must beat.

## Rollout (gate at each step before widening)

1. **Shadow (no writes).** Deploy `room-loop` with `ROOM_LOOP_MODE=scheduler_queue`
   in a `hybrid`/`engine` replica. Actors claim + predict but do **not** insert.
   Verify `room-loop shadow parity ok` with zero `MISMATCH` over a sustained
   window. This proves RNG/ordering parity against live scheduler draws.
2. **5%** — enable actor mode for a small set of dev/test rooms:
   ```sql
   UPDATE public.rooms
      SET meta = jsonb_set(COALESCE(meta, '{}'::jsonb), '{loop_mode}', '"actor"')
    WHERE id = '<room_id>';
   ```
   (Or tag a template so its new rooms inherit `meta.loop_mode='actor'`.)
3. **25% → 50% → 100%** — widen the tagged set. At each step confirm on
   `v_draw_latency_slo_by_mode` (actor row):
   - p95 < 3000ms,
   - `over_3s` trending to ~0,
   - no duplicate / out-of-order draws (`draws` unique on `(room_id, number)`;
     ordering enforced by backpressure + recovery),
   - no double Ding (single finalize path; `ding_aggregated_at` guard),
   - no settlement mismatch.
4. **Global flip (optional)** — once 100% of tagged rooms are healthy, set
   `ROOM_LOOP_MODE=actor` so all playing rooms default to the actor path.

## Rollback (target < 15 minutes)

The new schema/RPCs are **inert** unless the `room-loop` role is running and a
room is gated to actor mode, so rollback is config-only:

1. **Per-room** — flip a single room back:
   ```sql
   UPDATE public.rooms
      SET meta = jsonb_set(meta, '{loop_mode}', '"scheduler_queue"')
    WHERE id = '<room_id>';
   ```
2. **Global** — set `ROOM_LOOP_MODE=scheduler_queue` and redeploy. New claims
   stop entering actor mode; the legacy scheduler resumes inserting draws.
3. **Stop the role** — remove `room-loop` from `GAME_ENGINE_ROLES` and redeploy.
   On shutdown the manager releases all held leases (`rpc_release_game_room`).
4. **Clear stray leases** (only if a replica died without releasing):
   ```sql
   UPDATE public.rooms
      SET engine_owner_id = NULL, engine_lease_until = NULL, engine_loop_state = 'idle'
    WHERE engine_lease_until < now();
   ```
   Expired leases are already ignored by claim/insert guards, so this is cosmetic.

The legacy `scheduler` + `draw-processor` path remains fully functional as the
fallback at all times; no data migration or reverse migration is required.

## Failure handling (built-in)

- **Two actors for one room** → prevented by the DB lease + owner-guarded insert
  (`not_owner`).
- **Crash mid-draw** → next cycle `recoverRoom` processes the oldest
  `processed_at IS NULL` draw before inserting a new one (insert order).
- **Lease lost** → actor exits without releasing; another replica re-claims after
  expiry.
- **Double Ding** → ding stays inside `rpc_finalize_engine_draw_job` (single
  path) with the `ding_aggregated_at` guard.
