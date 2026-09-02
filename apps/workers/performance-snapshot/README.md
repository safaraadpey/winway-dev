# Performance snapshot worker (`@dingmoney/performance-snapshot-worker`)

Railway **Node/Nixpacks** service. Each day at **08:05 Asia/Tehran** it closes the prior **08:00–08:00** accounting window and writes base metrics into PostgreSQL.

Panels still read live queries in this phase; this worker only builds the snapshot tables.

## Prerequisites

1. Apply migration [`sql/migrations/20260902140000_performance_daily_snapshot.sql`](../../../sql/migrations/20260902140000_performance_daily_snapshot.sql) on the target database.
2. `DATABASE_URL` must use a role with `EXECUTE` on `public.fn_performance_snapshot_run` (typically `postgres` or `service_role` direct connection).

## Accounting window

| Concept | Definition |
|--------|------------|
| Accounting day `D` | `[D 08:00 Tehran, (D+1) 08:00 Tehran)` |
| Worker schedule | **08:05 Tehran** daily |
| Default snapshot | Yesterday's calendar date in Tehran when run after 08:00 |

Example: run at **08:05 on 2 Sep** → `snapshot_date = 1 Sep`, window **1 Sep 08:00 → 2 Sep 08:00**.

Week start (future dashboards): **Saturday 08:00 Tehran** — aggregate from daily rows, not stored separately yet.

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

**Overall** means through the last **08:00 Asia/Tehran** closed window (`through_snapshot_date`), not through the current moment. After each daily close, `fn_performance_rebuild_lifetime_stats()` rebuilds lifetime from `SUM(performance_daily_stats)` (full DELETE + INSERT, not incremental `+=`).

Derived dashboard fields (کانیات کل، عملکرد بازی، بیلان، …) are **not** stored; compute at read time from base columns.

Apply migration [`sql/migrations/20260902150000_performance_lifetime_stats.sql`](../../../sql/migrations/20260902150000_performance_lifetime_stats.sql) after the daily snapshot migration.

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
4. Re-run same date; `row_count` should match and no duplicate `(snapshot_date, user_id, role)` rows.

## Logs

Stable prefix: `[PerformanceSnapshot]`
