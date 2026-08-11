# Schema baseline source

| Field | Value |
| --- | --- |
| Captured at | 2026-08-11 |
| Project | Supabase **develop** `yqnptpreowkimopxicfz` |
| Server | PostgreSQL 17.6 |
| Dump tool | `pg_dump` 17.10 (`--schema-only --no-owner`) |
| Contents | App schemas only (no row data) |

## Schemas included

`public`, `tournament`, `game_core`, `game_finance`, `game_pool`, `game_ticket`, `game_admin`, `game_archive`, `game_trash`, `platform`, `deposit`, `monitor`, `load_test`

## Not included (platform / managed)

`auth`, `storage`, `realtime`, `vault`, `cron`, `net`, `graphql*`, `supabase_migrations`, `extensions` objects beyond what `000_extensions.sql` creates

## Notes

- `public.users.id` FK references `auth.users(id)` — restore target must be Supabase (or provide an `auth.users` stub).
- Functions use `extensions.gen_random_bytes` / `extensions.digest` — apply `000_extensions.sql` first.
- Legacy incremental migrations that previously lived under `sql/migrations/` are archived at `sql/migrations/_legacy_archive/` (historical only; **do not** use them to build a DB).
