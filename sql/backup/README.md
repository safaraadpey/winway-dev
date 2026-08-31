# winway_backup SQL

Migrations in this folder apply **only** to the `winway_backup` Supabase project (`BACKUP_DATABASE_URL`).

Production (`PROD_DATABASE_URL`) must never receive these files.

## Apply

```powershell
# From repo root; BACKUP_DATABASE_URL must point at winway_backup
psql "$env:BACKUP_DATABASE_URL" -v ON_ERROR_STOP=1 -f sql/backup/migrations/20260831180000_archive_schema.sql
psql "$env:BACKUP_DATABASE_URL" -v ON_ERROR_STOP=1 -f sql/backup/migrations/20260831180100_storage_buckets.sql
```

Or via Supabase MCP on the `winway_backup` project using `apply_migration`.

## Related docs

- [backup-reader role (Production)](../../docs/architecture/winway-backup-reader-role.md)
- [Business backup worker](../../apps/workers/business-backup/README.md)
