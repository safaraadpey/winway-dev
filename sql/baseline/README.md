# Database schema baseline

This folder is the **source of truth** for rebuilding the application database structure.

| File | Role |
| --- | --- |
| `000_extensions.sql` | Required extensions (`pgcrypto`, `uuid-ossp`) |
| `001_schema.sql` | Full schema-only dump (tables, types, functions, RLS, grants, …) |
| `SOURCE.md` | Where/when this dump was taken |

## Rebuild (clone) onto an empty Supabase DB

```powershell
# From repo root; DATABASE_URL must point at the *target* empty project
.\scripts\db-apply-baseline.ps1
```

Or manually (psql 17+):

```bash
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f sql/baseline/000_extensions.sql
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f sql/baseline/001_schema.sql
```

Then apply any **new** files under `sql/migrations/` (post-baseline deltas only).

## Refresh baseline from live develop

```powershell
.\scripts\db-dump-baseline.ps1
```

Requires WSL with `postgresql-client-17` and network reachability to the pooler.
