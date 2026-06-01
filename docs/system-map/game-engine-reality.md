# Game Engine Reality — System Reality Map

> STRICT EXTRACTION. Documents only what exists in code + database. The "engine"
> exists in TWO places; this records which one actually runs today.

## Big picture: who actually drives the game

There are two candidate runtimes. **The live runtime is Postgres `pg_cron`**, not
the Node service.

### 1. Postgres `pg_cron` jobs (ACTIVE — the real engine today)

Verified from `cron.job`:

| jobid | schedule | command | active |
| --- | --- | --- | --- |
| 8 | every 1s | `select public.fn_heartbeat_log();` | ✅ |
| 9 | every 1s | `select public.fn_heartbeat_tick();` | ✅ |
| 11 | every 1s | `SELECT public.fn_process_draw_jobs_batch_worker(1, 3);` | ✅ |
| 12 | every 1s | `SELECT public.fn_process_draw_jobs_batch_worker(2, 3);` | ✅ |
| 13 | every 1s | `SELECT public.fn_process_draw_jobs_batch_worker(3, 3);` | ✅ |
| 14 | every minute | `SELECT game_core.fn_janitor_sweep()` | ✅ |
| 15 | every 30s | `SELECT game_core.fn_generate_card_pool_step()` | ✅ |
| 16 | every 5s | `SELECT tournament.fn_tick_due_tournaments()` | ✅ |
| 19 | daily 03:10 | `fn_maintain_heartbeat_log_partitions(2,7)` | ✅ |
| 20 | daily 03:30 | `fn_cleanup_retention()` | ✅ |
| 21 | every minute | http_post → edge function `bot-schedule-worker` | ✅ |
| 5 | every 1s | http_post → edge function `draw-worker` | ❌ (inactive) |

**Consequences (current behavior):**
- **Room lifecycle + draws**: job 9 runs `fn_heartbeat_tick()` every second, which calls
  `game_core.fn_manage_waiting_rooms(50,false)` (waiting→playing) then
  `game_core.fn_manage_room_live_actions()` (draw next number for due rooms).
- **Draw job processing**: jobs 11/12/13 run `fn_process_draw_jobs_batch_worker`
  in 3 shards every second (apply marks, evaluate wins/settle, stamp `processed_at`).
- **Tournament progression**: job 16 runs `fn_tick_due_tournaments()` every 5s.
- **Self-healing**: job 14 (`fn_janitor_sweep`) cancels stuck `waiting` rooms,
  cancels stuck `playing` rooms with no consumed tickets (releasing holds), and
  re-settles stuck `settling` rooms.
- **Card pool**: job 15 incrementally builds pools (`fn_generate_card_pool_step`).
- **Bots**: job 21 invokes the `bot-schedule-worker` edge function each minute.
- The external `draw-worker` edge function (job 5) is **disabled**.

### 2. Node `game-engine` service (`game-engine/src`) — mostly scaffold

A standalone TypeScript service exists but is gated by `GAME_RUNTIME` (default
`legacy_db`). In `legacy_db` mode all workers no-op. Even when enabled, only the
draw-processor is implemented.

- Entry `src/index.ts` → `main()`: load config, create service-role Supabase client,
  optional Redis, optional health server, then start workers selected by
  `GAME_ENGINE_ROLES` (`scheduler`, `draw-processor`, `tournament-orchestrator`).
- **draw-processor** (`workers/draw-processor`): interval `DRAW_PROCESSOR_INTERVAL_MS`
  (default 500ms). When `GAME_RUNTIME !== legacy_db`, drains via
  `domain/draw/processDrawBatch.ts`, which calls:
  - `supabase.rpc('rpc_pick_draw_jobs')`
  - `supabase.rpc('rpc_apply_marks_for_draw', { p_room_id, p_draw_number })`
  - `supabase.rpc('fn_evaluate_room_after_draw', { p_room_id, p_draw_number })`
  - direct updates to `draw_jobs` (done/queued/failed) and `draws.processed_at`.
  Uses an optional Redis leader lock `ding:game-engine:lock:draw-processor`
  (TTL `DRAW_PROCESSOR_LOCK_TTL_SEC`, default 30s) so only one replica drains.
- **room-scheduler** (`workers/room-scheduler`): **stub** — logs
  "room-scheduler tick (not implemented)"; no RPCs.
- **tournament-orchestrator** (`workers/tournament-orchestrator`): **stub** — logs
  "not implemented"; no RPCs.
- `domain/room`, `domain/tournament`, `finance/`, `commands/` are **empty modules**
  (comments only).
- DB access: `db/supabase-admin.ts` uses `SUPABASE_SERVICE_ROLE_KEY`
  (`autoRefreshToken:false`, `persistSession:false`).
- Health: `GET /health` → `{ ok, service:"game-engine", redis }` (200/503).
- Logging: `metrics/logger.ts` JSON lines.

**Net**: the Node draw-processor is a (Redis-coordinated) reimplementation of cron
jobs 11–13. With `GAME_RUNTIME=legacy_db` it is dormant and the DB cron is
authoritative. This is the current production reality.

## Redis / state management (as implemented)

- Redis is **optional**. If `REDIS_URL` (ioredis) or `UPSTASH_REDIS_REST_URL`+token
  (Upstash REST) are set, the engine uses it; otherwise single-instance mode.
- Only real use: draw-processor leader lock (`SET key token EX ttl NX`, Lua-guarded
  release).
- Defined-but-unused keys: `scheduler` lock, `tournament-tick` lock,
  `lobby-snapshot` cache, `draw:inflight:{room}:{draw}`.
- Otherwise, **all game state lives in Postgres** (rooms, draws, draw_jobs, tickets,
  marks, results). There is no separate in-memory authoritative state.

## Provably-fair / RNG (DB)

- Each room gets `room_seed` (bytea) + `room_seed_hash` (char(64)) via
  `game_core.fn_generate_room_seed()` at creation.
- Number selection (`fn_manage_room_live_actions`) and card dealing
  (`fn_join_or_create_room_core`) are **deterministic**: they order candidates by
  `digest(encode(room_seed,'hex') || ':' || key, 'sha256')`.
- Card pools also carry `pool_seed` + `commit_hash` + `prng_version`.
- Seed reveal: `game_core.rpc_reveal_room_seed`, `rpc_get_room_seed_hash`,
  `rooms.seed_revealed_at`. (See `docs/backend/.../provably_fair_*`.)

## Draw → settle → ding pipeline (authoritative ordering)

1. `fn_manage_room_live_actions` inserts a `draws` row (number) for a due room.
2. Trigger `trg_after_draw_enqueue` enqueues a `draw_jobs` row.
3. `fn_process_draw_jobs_batch_worker` (cron 11–13): `rpc_apply_marks_for_draw`
   (writes `marks`) → `fn_evaluate_room_after_draw` (writes `results`, syncs
   `room_winners`; on full-win flips room to `settling` + `fn_finish_room_and_settle`)
   → mark job `done`; when all jobs for the draw are done → `draws.processed_at`.
4. `draws.processed_at` UPDATE fires `trg_aggregate_ding_on_processed_at` →
   credits `ding_balances`/`ding_transactions`.

## Background jobs summary

| Concern | Mechanism | Cadence |
| --- | --- | --- |
| Room start + draws | cron `fn_heartbeat_tick` | 1s |
| Draw job processing | cron `fn_process_draw_jobs_batch_worker` ×3 | 1s |
| Heartbeat/presence log | cron `fn_heartbeat_log` | 1s |
| Tournament tick | cron `fn_tick_due_tournaments` | 5s |
| Card pool build | cron `fn_generate_card_pool_step` | 30s |
| Stuck-room janitor | cron `fn_janitor_sweep` | 60s |
| Bot schedules | edge fn `bot-schedule-worker` | 60s |
| Heartbeat partition maint. | cron `fn_maintain_heartbeat_log_partitions` | daily |
| Retention cleanup | cron `fn_cleanup_retention` | daily |
| (Disabled) external draw worker | edge fn `draw-worker` | inactive |
| (Dormant) Node engine | `game-engine` service | `GAME_RUNTIME=legacy_db` ⇒ idle |
