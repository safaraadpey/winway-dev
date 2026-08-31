# Production `backup_reader` role (read-only for Business Backup)

The daily Business Backup job runs on a **separate Railway service** and connects to Production with a dedicated PostgreSQL role that can **only SELECT** from an explicit allowlist. No writes, watermarks, or DDL on Production.

Apply this SQL **once on Production** (Supabase SQL editor or migration run by an admin). Replace `[STRONG_PASSWORD]` before running.

## 1. Create role

```sql
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'backup_reader') THEN
    CREATE ROLE backup_reader LOGIN PASSWORD '[STRONG_PASSWORD]';
  END IF;
END $$;

ALTER ROLE backup_reader SET default_transaction_read_only = on;
ALTER ROLE backup_reader SET statement_timeout = '3600000'; -- 1h for large backfill batches
ALTER ROLE backup_reader CONNECTION LIMIT 3;
```

Store the connection string as `PROD_DATABASE_URL` on the Railway `business-backup` service only:

```
postgresql://backup_reader.[project-ref]:[password]@aws-0-[region].pooler.supabase.com:6543/postgres?sslmode=require
```

Use the **pooler** host for long-running reads. Never reuse this URL in the Next.js app or game engine.

## 2. Schema usage

```sql
GRANT USAGE ON SCHEMA public TO backup_reader;
GRANT USAGE ON SCHEMA deposit TO backup_reader;
GRANT USAGE ON SCHEMA platform TO backup_reader;
GRANT USAGE ON SCHEMA tic_tac_toe TO backup_reader;
GRANT USAGE ON SCHEMA storage TO backup_reader;
```

## 3. Table allowlist (SELECT only)

```sql
-- public — users & balances
GRANT SELECT ON TABLE
  public.users,
  public.user_profiles,
  public.wallets,
  public.ding_balances,
  public.player_affiliation,
  public.user_commissions
TO backup_reader;

-- public — financial ledgers
GRANT SELECT ON TABLE
  public.transactions,
  public.ding_transactions,
  public.commissions_log,
  public.commission_stat_events,
  public.commission_daily_stats,
  public.withdrawal_requests,
  public.wallet_transfer_idempotency,
  public.finance_recon_reports,
  public.player_auto_buy_sessions
TO backup_reader;

-- public — game (for compact archive queries)
GRANT SELECT ON TABLE
  public.rooms,
  public.tickets,
  public.results,
  public.room_winners,
  public.draws,
  public.room_templates,
  public.card_pools,
  public.card_pool_cards,
  public.card_numbers
TO backup_reader;

-- public — tournaments
GRANT SELECT ON TABLE
  public.tournaments,
  public.tournament_entries,
  public.tournament_locks,
  public.tournament_payouts,
  public.tournament_prize_rules,
  public.tournament_round_rooms,
  public.tournament_round_assignments,
  public.tournament_commission_snapshots,
  public.tournament_player_ding_totals
TO backup_reader;

-- public — audit / referral
GRANT SELECT ON TABLE
  public.admin_audit_log,
  public.kyc_submissions,
  public.operator_player_play_days,
  public.invitation_links,
  public.player_signups
TO backup_reader;

-- deposit (exclude crypto_xpub_settings)
GRANT SELECT ON TABLE
  deposit.intents,
  deposit.attempts,
  deposit.verifications,
  deposit.credits,
  deposit.events,
  deposit.crypto_transactions,
  deposit.user_crypto_addresses,
  deposit.recon_reports
TO backup_reader;

-- platform (exclude shadow_*)
GRANT SELECT ON TABLE
  platform.session_settlement,
  platform.game_sessions,
  platform.session_participants
TO backup_reader;

-- tic_tac_toe
GRANT SELECT ON TABLE tic_tac_toe.matches TO backup_reader;

-- storage metadata
GRANT SELECT ON TABLE storage.buckets, storage.objects TO backup_reader;
```

## 4. Explicit denylist (never grant)

Do **not** grant SELECT on:

| Object | Reason |
|---|---|
| `auth.*` | Sessions, refresh tokens, identity secrets |
| `vault.secrets` | Infrastructure secrets |
| `deposit.crypto_xpub_settings` | xpub keys |
| `public.draw_jobs`, `public.marks` | Engine ops; not needed for audit archive |
| `platform.shadow_mirror_log`, `platform.shadow_outbox` | Shadow pipeline |
| `public.heartbeat_log*`, `public.debug_room_status_log` | Debug noise |
| `public.dev_*`, `public.leo_*` | Dev/automation only |
| `cron.*`, `realtime.*` | Infrastructure |

Column-level denylist is enforced in the **worker** (not Postgres): `rooms.password`, `rooms.room_seed` (until reveal table), `kyc_submissions.image_data` are stripped before `source_row` is written to backup.

## 5. Session hardening (worker)

Each Production pool connection should run at connect time:

```sql
SET default_transaction_read_only = on;
SET application_name = 'winway-backup';
SET search_path = public, deposit, platform, tic_tac_toe, storage;
```

The worker must use **read-only transactions** for all Production queries. Any write attempt fails immediately.

## 6. Storage API (Production read)

SQL access to `storage.objects` is metadata only. Binary copy uses Supabase Storage API with **Production service role** (read) on the backup worker — still no Production Postgres writes.

Env on Railway:

- `PROD_SUPABASE_URL` + `PROD_SUPABASE_SERVICE_ROLE_KEY` — list/download objects
- `BACKUP_SUPABASE_URL` + `BACKUP_SUPABASE_SERVICE_ROLE_KEY` — upload dated copies

## 7. Verification

After grants, connect as `backup_reader` and confirm:

```sql
-- must succeed
SELECT count(*) FROM public.transactions;

-- must fail
INSERT INTO public.transactions DEFAULT VALUES;
```

```sql
-- must fail (permission denied)
SELECT * FROM auth.sessions LIMIT 1;
```

## 8. Rotation

Rotate `backup_reader` password on the same schedule as other service credentials. Update `PROD_DATABASE_URL` on Railway only; backup history in `winway_backup` is unaffected.
