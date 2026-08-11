# Supabase CLI migrations

Canonical schema lives in `sql/baseline/`.

Historical CLI migration files were moved to:

`sql/migrations/_legacy_archive/supabase_cli/`

Do not use this folder to rebuild the database. Add forward deltas under `sql/migrations/` instead.
