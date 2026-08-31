# Business backup worker (`@dingmoney/business-backup-worker`)

Railway **Node/Nixpacks** service. Copies critical business data from **Production** (read-only) into **`winway_backup`** daily at **05:00 Asia/Tehran**.

Production receives **zero writes**. All archive tables live in `archive.*` on the backup project.

## Prerequisites

1. Apply backup schema: [`sql/backup/migrations/20260831180000_archive_schema.sql`](../../../sql/backup/migrations/20260831180000_archive_schema.sql) on **winway_backup** only.
2. Create `backup_reader` on Production: [`docs/architecture/winway-backup-reader-role.md`](../../../docs/architecture/winway-backup-reader-role.md).
3. Create matching Storage buckets on winway_backup (e.g. `banner-images`).

## Local

From repo root:

```powershell
npm install
cd apps/workers/business-backup
# copy .env.example → .env
$env:BACKUP_RUN_ON_START="true"
npm run dev
curl http://localhost:8080/health
```

## Railway

| Setting | Value |
|---------|--------|
| **Root Directory** | repository root |
| **Builder** | Nixpacks (Node) |
| **Build Command** | `npm ci` |
| **Start Command** | `npm run start -w @dingmoney/business-backup-worker` |
| **Health check** | `GET /health` (port `BACKUP_HTTP_PORT`, default `8080`) |

### Env (required)

| Variable | Purpose |
|----------|---------|
| `PROD_DATABASE_URL` | `backup_reader` on Production (read-only) |
| `BACKUP_DATABASE_URL` | winway_backup Postgres (service_role) |
| `PROD_SUPABASE_URL` | Production project URL |
| `PROD_SUPABASE_SERVICE_ROLE_KEY` | Storage read |
| `BACKUP_SUPABASE_URL` | winway_backup project URL |
| `BACKUP_SUPABASE_SERVICE_ROLE_KEY` | Storage write |

See [`.env.example`](./.env.example) for tuning knobs.

## What gets archived

- **Ledgers** — append-only financial rows (`transactions`, `ding_transactions`, deposits, withdrawals, commissions, …)
- **State** — daily snapshots of users, wallets, ding balances, affiliation
- **Game** — terminal rooms with compressed draw sequences (no raw `draws` table)
- **Audit** — admin log, KYC metadata (no image bytes), operator play days
- **Storage** — dated copies under `archive/{snapshot_date}/{bucket}/{path}`

## Idempotency

- One `snapshot_runs` row per Tehran calendar day
- Re-runs use `ON CONFLICT DO NOTHING`; failed runs resume the same `run_id`
- No snapshot row is ever updated or deleted

## Logs

Stable prefix: `[Backup]`
