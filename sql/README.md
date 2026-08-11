# SQL layout

| Path | Role |
| --- | --- |
| `baseline/` | **Canonical schema** for rebuild/clone (`000_extensions.sql` + `001_schema.sql`) |
| `migrations/` | **Forward-only deltas** applied *after* baseline (empty until next schema change) |
| `migrations/_legacy_archive/` | Historical migrations (cannot rebuild DB alone) — kept for audit only |
| `functions/` | Reference / ad-hoc SQL notes (not the apply chain) |
| `optimization/` | Optional indexes / tuning notes |

## Rebuild a database

1. Provision empty Supabase Postgres (auth/storage present).
2. Apply baseline: `scripts/db-apply-baseline.ps1`
3. Apply any new files in `migrations/` in filename order.
4. Optionally load a minimal seed (not shipped here — no production data in repo).

## New schema changes

1. Change develop (or a branch DB).
2. Either:
   - add a dated file under `migrations/` (`YYYYMMDDHHMMSS_description.sql`), **or**
   - refresh baseline with `scripts/db-dump-baseline.ps1` and keep migrations empty for a new greenfield cut.
3. Never re-apply `_legacy_archive`.
