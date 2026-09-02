# Performance snapshot worker (`@dingmoney/performance-snapshot-worker`)

Railway **Node/Nixpacks** service. Each day at **08:05 Asia/Tehran** it closes the prior **08:00–08:00** accounting window and writes base metrics into PostgreSQL.

Panels still read live queries in this phase; this worker only builds the snapshot tables.

## Prerequisites

Apply migrations **in order** on the target database:

1. [`sql/migrations/20260902140000_performance_daily_snapshot.sql`](../../../sql/migrations/20260902140000_performance_daily_snapshot.sql) — daily snapshot schema + `fn_performance_snapshot_run`
2. [`sql/migrations/20260902150000_performance_lifetime_stats.sql`](../../../sql/migrations/20260902150000_performance_lifetime_stats.sql) — `performance_lifetime_stats` + lifetime rebuild inside snapshot run
3. [`sql/migrations/20260902160000_performance_player_commission_snapshot.sql`](../../../sql/migrations/20260902160000_performance_player_commission_snapshot.sql) — player **کانیات / کانیات کل** columns + `fn_performance_apply_player_commission_daily`

`DATABASE_URL` must use a role with `EXECUTE` on `public.fn_performance_snapshot_run` (typically `postgres` or `service_role` direct connection).

## Accounting window

| Concept | Definition |
|--------|------------|
| Accounting day `D` | `[D 08:00 Tehran, (D+1) 08:00 Tehran)` |
| Worker schedule | **08:05 Tehran** daily |
| Default snapshot | Yesterday's calendar date in Tehran when run after 08:00 |

Example: run at **08:05 on 2 Sep** → `snapshot_date = 1 Sep`, window **1 Sep 08:00 → 2 Sep 08:00**.

Week dashboards (player **هفته** tab): **Saturday 08:00 Tehran → current day 08:00** — aggregate from daily rows at read time, not stored separately.

## Local

From repo root:

```powershell
npm install
cd apps/workers/performance-snapshot
# copy .env.example → .env
$env:SNAPSHOT_RUN_ON_START="true"
# optional backfill one day:
# $env:SNAPSHOT_DATE="2026-09-01"
npm run dev
curl http://localhost:8081/health
```

## Railway

| Setting | Value |
|---------|--------|
| **Root Directory** | repository root |
| **Builder** | Nixpacks (Node) |
| **Build Command** | `npm ci` |
| **Start Command** | `npm run start -w @dingmoney/performance-snapshot-worker` |
| **Health check** | `GET /health` on Railway **`PORT`** (auto-injected) |

### Env (required)

| Variable | Purpose |
|----------|---------|
| `DATABASE_URL` | Writable Postgres connection |

### Env (optional)

| Variable | Default | Purpose |
|----------|---------|---------|
| `SNAPSHOT_CRON_HOUR` | `8` | Schedule hour (Tehran) |
| `SNAPSHOT_CRON_MINUTE` | `5` | Schedule minute (Tehran) |
| `SNAPSHOT_RUN_ON_START` | `false` | Run once on boot |
| `SNAPSHOT_DATE` | — | Force one accounting date (`YYYY-MM-DD`); remove after backfill |
| `SNAPSHOT_HTTP_PORT` | — | Local dev only; on Railway the app listens on `PORT` |

## Tables written

- `public.performance_snapshot_runs` — one row per accounting day (status, window, row count)
- `public.performance_daily_stats` — base metrics per `(snapshot_date, user_id, role)`
- `public.performance_lifetime_stats` — overall base metrics per `(user_id, role)` through last closed accounting day

**Overall** means through the last **08:00 Asia/Tehran** closed window (`through_snapshot_date`), not through the current moment.

### What the worker runs (DB-side)

The Node worker only calls `fn_performance_snapshot_run(date)`. Each successful run:

1. Deletes and rebuilds that day's rows in `performance_daily_stats` (game, deposits, operator commission, …)
2. Calls `fn_performance_apply_player_commission_daily` — for **player** rows, fills:
   - `player_commission_amount` — SUM(`agent_amount` + `super_amount` + `admin_amount`) from `commissions_log` where `player_id` matches, `status = settled`, in the accounting window
   - `player_commission_base` — SUM(`commission_base`) for the same filter  
   (UI: **کانیات** / **کانیات کل** on player **آمار کل** and **هفته** tabs)
3. Calls `fn_performance_rebuild_lifetime_stats()` — full DELETE + INSERT from `SUM(performance_daily_stats)` (not incremental `+=`)

Other derived UI fields (**عملکرد بازی**, **بیلان**, operator کانیات کل, …) are still computed at read time from stored base columns.

## Idempotency

- Advisory lock prevents concurrent runs on one DB
- Re-run for the same `snapshot_date` deletes and rebuilds that day's stats rows
- Lifetime table is fully rebuilt from daily SUM after each successful day (safe on retry/backfill)
- `performance_snapshot_runs` row is overwritten on retry

## Manual verification

1. Pick a closed accounting day `D` and set `SNAPSHOT_DATE=D`.
2. Run worker with `SNAPSHOT_RUN_ON_START=true`.
3. Compare sample rows in `performance_daily_stats` against ledger sums for `[D 08:00, (D+1) 08:00)` Tehran:
   - Player purchases: `tickets` + normal rooms
   - Player winnings: `results` with `paid_at` set
   - Agent commission: `commissions_log.agent_amount` where `agent_id` matches
   - Player generated commission: `player_commission_amount` / `player_commission_base` vs `commissions_log` where `player_id` matches and `status = settled`
4. Confirm `performance_lifetime_stats` for a sample player matches `SUM(performance_daily_stats)` including `player_commission_*`.
5. Re-run same date; `row_count` should match and no duplicate `(snapshot_date, user_id, role)` rows.

## Logs

Stable prefix: `[PerformanceSnapshot]`
