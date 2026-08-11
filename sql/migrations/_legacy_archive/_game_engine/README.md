# Game Engine migrations (develop branch)

Migration files for cutover and security hardening will be added here as phases complete.

**Target:** Git branch `develop` → Supabase preview branch `develop` (`ovclbgxtpxyzlcmwbviw`).

Local env: `scripts/use-supabase-develop.ps1` (writes `.env.develop.local`, swaps `.env.local`).

See: [docs/roadmap/GAME_ENGINE_MIGRATION.md](../../docs/roadmap/GAME_ENGINE_MIGRATION.md)

## Planned (P0)

- `YYYYMMDD_revoke_tournament_entry_upsert_client.sql`
- `YYYYMMDD_revoke_system_join_client.sql`
- `YYYYMMDD_revoke_game_core_client_execute.sql`

## Planned (P4 cutover)

- `YYYYMMDD_game_engine_cutover_disable_db_cron.sql`
- `YYYYMMDD_game_engine_cutover_rollback.sql`

## DEV mutex (manual apply — not top-level chain)

- `20260731150036_dev_mutex_disable_legacy_game_crons.sql` — unschedule `bingo_heartbeat` + `bingo_draw_worker_1..3` on DEV only (`yqnptpreowkimopxicfz`).
- Aborts with `RAISE EXCEPTION` if more than 4 matching `cron.job` rows exist (before any unschedule).
- Apply via: [docs/runbooks/dev-game-cron-mutex-apply.md](../../../docs/runbooks/dev-game-cron-mutex-apply.md)
- **Do not** promote to top-level `sql/migrations/` until Production ownership is approved.
