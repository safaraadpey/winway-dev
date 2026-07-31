# Game Engine Reality — System Reality Map

> Updated 2026-07-31 (docs drift cleanup).
>
> **DEV authority (current):**
> Railway Game Engine is the canonical runtime authority in DEV.
> Supabase remains the system of record and maintenance authority.

## Big picture: who drives the game

There are two candidate runtimes. **On DEV, the live game runtime is the Railway
Node `game-engine`**, not `pg_cron` game-clock jobs.

| Layer | DEV role |
| --- | --- |
| Railway `game-engine` | Waiting promote, live draw clock (`room-loop`), draw-job drain, tournament tick, optional dev-player workers (`GAME_RUNTIME=engine`, `SCHEDULER_ENABLED=true`) |
| Supabase Postgres | System of record (tables, settlement RPCs, leases, seeds) |
| `pg_cron` | Maintenance only on DEV after mutex: janitor, card pool, partitions, retention |
| Edge functions | Not the live game runtime (Hello stubs / historical); do not treat as draw authority |

### DEV cron mutex (applied)

The following **game-clock** jobs were unscheduled on Supabase DEV
(`yqnptpreowkimopxicfz`) so they cannot double-drive with Railway:

- `bingo_heartbeat` → previously `fn_heartbeat_tick()` (waiting + live actions)
- `bingo_draw_worker_1` / `_2` / `_3` → previously `fn_process_draw_jobs_batch_worker`

They remain **callable as SQL functions** for rollback / hybrid mode, but they are
**not** scheduled owners of the DEV runtime. See
`docs/runbooks/dev-game-cron-mutex-apply.md` and
`sql/migrations/_game_engine/20260731150036_dev_mutex_disable_legacy_game_crons.sql`.

**Maintenance crons that stay active on DEV (examples):**

| jobname | Role |
| --- | --- |
| `fn_janitor_sweep` | Full janitor sweep |
| `fn_generate_card_pool_step` | Card pool build |
| `heartbeat_log_partitions` | Partition maintenance |
| `cleanup_retention` | Retention cleanup |

> **Production:** do not assume the same mutex. Inventory `cron.job` and Railway
> env separately (`docs/audits/deployment-runtime-state-audit.md`).

### Historical note (pre-mutex / DB-cron era)

Older inventories listed `bingo_heartbeat` and sharded `bingo_draw_worker_*` as the
live engine, with the Node service idle under `GAME_RUNTIME=legacy_db`. That model
is **obsolete for DEV** after the Railway cutover + mutex. Keep rollback scripts
(`scripts/game-engine-cron-*.sql`) for emergency restore only.

## Node `game-engine` service (`game-engine/src`) — DEV live runtime

Standalone TypeScript service on Railway. Configured on DEV approximately as:

- `GAME_RUNTIME=engine`
- `SCHEDULER_ENABLED=true`
- `GAME_ENGINE_ROLES` includes at least
  `scheduler`, `draw-processor`, `room-loop`, `tournament-orchestrator`
  (plus optional `dev-player-scheduler` / `dev-player-processor`)

### Workers (engine mode)

| Role | Behavior |
| --- | --- |
| `scheduler` | TS `manageWaitingRooms` (waiting→playing); nested unsettled-finish repair RPC. Does **not** insert live draws. |
| `room-loop` | Claims playing rooms; `runOneDrawCycle` owns the live draw clock (actor-only; **no** `ROOM_LOOP_MODE` switch — removed). |
| `draw-processor` | Drains / recovers `draw_jobs` (per-room actors by default); coordinates with actor-owned rooms. |
| `tournament-orchestrator` | TS tournament tick path (`tickDueTournamentsEngine`). |
| `dev-player-*` | Independent of `GAME_RUNTIME`; replace historical edge schedule worker. |

Code still contains `legacy_db` / `hybrid` branches for rollback; **DEV deploy uses `engine`.**

- Entry `src/index.ts` → load config, service-role Supabase, optional Redis, HTTP
  (`GAME_ENGINE_API` mounts `/v1/*` + `/health`).
- Health: `GET /health` → `{ ok, service:"game-engine", redis }` (200/503).
- Redis: optional leader locks / coordination (`REDIS_URL` or Upstash REST). DEV
  may run single-replica with Redis disabled.

## Redis / state management (as implemented)

- Redis is **optional** for single-replica. Multi-replica needs Redis +
  `COORDINATION_STRICT=true`.
- Used by the **Game Engine**, not Next.js lobby caching.
- Otherwise, **all authoritative game state lives in Postgres**.

## Provably-fair / RNG (DB)

- Each room gets `room_seed` (bytea) + `room_seed_hash` (char(64)) via
  `game_core.fn_generate_room_seed()` at creation.
- Number selection and card dealing remain **deterministic** from `room_seed`
  (engine and DB paths share seed semantics).
- Card pools also carry `pool_seed` + `commit_hash` + `prng_version`.
- Seed reveal: `game_core.rpc_reveal_room_seed`, `rpc_get_room_seed_hash`,
  `rooms.seed_revealed_at`.

## Draw → settle → ding pipeline (authoritative ordering)

On DEV with Railway `engine` + room-loop:

1. Room-loop / actor inserts a `draws` row when due (owner-guarded).
2. Trigger / enqueue may create `draw_jobs` for marks/recovery paths.
3. Engine draw-processor and/or inline actor path applies marks, evaluates wins,
   and settles via `fn_finish_room_and_settle` (and related RPCs) as implemented.
4. `draws.processed_at` UPDATE can still fire ding aggregation triggers.

Fallback DB batch path (`fn_process_draw_jobs_batch_worker`) exists in SQL for
rollback / `legacy_db`+cron restore — **not scheduled on DEV after mutex**.

## Background jobs summary (DEV)

| Concern | Mechanism | Notes |
| --- | --- | --- |
| Room start (waiting→playing) | Railway `scheduler` | Canonical on DEV |
| Live draws | Railway `room-loop` | Actor-only; no `ROOM_LOOP_MODE` |
| Draw job processing | Railway `draw-processor` | Canonical on DEV |
| Tournament tick | Railway `tournament-orchestrator` | Tournament cron absent on DEV |
| Card pool build | cron `fn_generate_card_pool_step` | Maintenance — keep |
| Stuck-room janitor | cron `fn_janitor_sweep` | Maintenance — keep (+ engine repair RPC) |
| Heartbeat partition maint. | cron `heartbeat_log_partitions` | Keep |
| Retention cleanup | cron `cleanup_retention` | Keep |
| `bingo_heartbeat` / `bingo_draw_worker_*` | **Unscheduled on DEV** | Mutex; restore only via runbook |
| Edge `draw-worker` / `dev-schedule-worker` | Not live game authority | Stubs / historical |
