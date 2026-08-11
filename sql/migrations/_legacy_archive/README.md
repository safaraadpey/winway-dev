# Legacy migration archive

All pre-baseline incremental SQL migrations lived here before `2026-08-11`.

They were written as **patches on an already-existing live database** and **cannot** recreate the schema from an empty Postgres.

Kept for history / blame / incident review only.

**Do not** run these to provision a new environment.

Canonical rebuild path: `sql/baseline/` + any new top-level files in `sql/migrations/`.
