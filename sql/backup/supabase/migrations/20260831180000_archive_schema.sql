-- winway_backup only — business archive schema (NOT for Production)
-- Apply via BACKUP_DATABASE_URL / Supabase winway_backup project

BEGIN;

CREATE SCHEMA IF NOT EXISTS archive;

-- ---------------------------------------------------------------------------
-- Control
-- ---------------------------------------------------------------------------

CREATE TABLE archive.snapshot_runs (
  run_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  snapshot_date date NOT NULL UNIQUE,
  status text NOT NULL CHECK (status IN ('running', 'succeeded', 'failed')),
  started_at timestamptz NOT NULL,
  finished_at timestamptz,
  read_as_of timestamptz NOT NULL,
  timezone text NOT NULL DEFAULT 'Asia/Tehran',
  row_counts jsonb NOT NULL DEFAULT '{}'::jsonb,
  checksums jsonb NOT NULL DEFAULT '{}'::jsonb,
  error text,
  heartbeat_at timestamptz NOT NULL
);

CREATE INDEX snapshot_runs_status_heartbeat_idx
  ON archive.snapshot_runs (status, heartbeat_at);

CREATE TABLE archive.watermarks (
  source_key text PRIMARY KEY,
  last_created_at timestamptz,
  last_id text,
  last_source_updated_at timestamptz,
  rows_copied_total bigint NOT NULL DEFAULT 0,
  updated_run_id uuid NOT NULL REFERENCES archive.snapshot_runs (run_id),
  updated_at timestamptz NOT NULL
);

-- ---------------------------------------------------------------------------
-- Helpers: shared ledger columns pattern
-- ---------------------------------------------------------------------------

-- Immutable ledger (one row per source PK)
-- Versioned ledger adds source_row_hash + UNIQUE (source_id, source_row_hash)

-- ---------------------------------------------------------------------------
-- Layer A — immutable ledgers
-- ---------------------------------------------------------------------------

CREATE TABLE archive.ledger_transactions (
  source_id uuid PRIMARY KEY,
  source_created_at timestamptz NOT NULL,
  user_id uuid,
  wallet_id uuid,
  type text,
  status text,
  amount numeric,
  currency text,
  balance_before numeric,
  balance_after numeric,
  source_kind text,
  source_ticket_id uuid,
  source_room_id uuid,
  source_ref text,
  idempotency_key text,
  related_room uuid,
  ticket_id uuid,
  room_id uuid,
  source_row jsonb NOT NULL,
  first_run_id uuid NOT NULL REFERENCES archive.snapshot_runs (run_id),
  archived_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX ledger_transactions_created_idx ON archive.ledger_transactions (source_created_at);
CREATE INDEX ledger_transactions_user_idx ON archive.ledger_transactions (user_id);

CREATE TABLE archive.ledger_ding_transactions (
  source_id uuid PRIMARY KEY,
  source_created_at timestamptz NOT NULL,
  user_id uuid,
  room_id uuid,
  ticket_id uuid,
  draw_id uuid,
  drawn_number integer,
  amount numeric,
  source_row jsonb NOT NULL,
  first_run_id uuid NOT NULL REFERENCES archive.snapshot_runs (run_id),
  archived_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX ledger_ding_transactions_created_idx ON archive.ledger_ding_transactions (source_created_at);
CREATE INDEX ledger_ding_transactions_user_idx ON archive.ledger_ding_transactions (user_id);
CREATE INDEX ledger_ding_transactions_room_idx ON archive.ledger_ding_transactions (room_id);

CREATE TABLE archive.ledger_commissions (
  source_id bigint PRIMARY KEY,
  source_created_at timestamptz NOT NULL,
  ticket_id uuid,
  room_id uuid,
  player_id uuid,
  agent_id uuid,
  super_id uuid,
  gross_amount numeric,
  agent_amount numeric,
  super_amount numeric,
  admin_amount numeric,
  amount_to_pool numeric,
  status text,
  source_row jsonb NOT NULL,
  first_run_id uuid NOT NULL REFERENCES archive.snapshot_runs (run_id),
  archived_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX ledger_commissions_created_idx ON archive.ledger_commissions (source_created_at);

CREATE TABLE archive.ledger_commission_stat_events (
  source_kind text NOT NULL,
  source_id uuid NOT NULL,
  settled_at timestamptz,
  source_created_at timestamptz NOT NULL,
  source_row jsonb NOT NULL,
  first_run_id uuid NOT NULL REFERENCES archive.snapshot_runs (run_id),
  archived_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (source_kind, source_id)
);

CREATE TABLE archive.ledger_wallet_transfer_idempotency (
  source_id uuid PRIMARY KEY,
  source_created_at timestamptz NOT NULL,
  actor_id uuid,
  from_user_id uuid,
  to_user_id uuid,
  amount bigint,
  action text,
  transfer_id uuid,
  payload_hash text,
  source_row jsonb NOT NULL,
  first_run_id uuid NOT NULL REFERENCES archive.snapshot_runs (run_id),
  archived_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE archive.ledger_deposit_attempts (
  source_id uuid PRIMARY KEY,
  source_created_at timestamptz NOT NULL,
  intent_id uuid,
  provider text,
  payload_hash text,
  source_row jsonb NOT NULL,
  first_run_id uuid NOT NULL REFERENCES archive.snapshot_runs (run_id),
  archived_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE archive.ledger_deposit_verifications (
  source_id uuid PRIMARY KEY,
  source_created_at timestamptz NOT NULL,
  intent_id uuid,
  result text,
  amount_observed numeric,
  evidence jsonb,
  source_row jsonb NOT NULL,
  first_run_id uuid NOT NULL REFERENCES archive.snapshot_runs (run_id),
  archived_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE archive.ledger_deposit_events (
  source_id bigint PRIMARY KEY,
  source_created_at timestamptz NOT NULL,
  intent_id uuid,
  event_type text,
  actor text,
  payload jsonb,
  source_row jsonb NOT NULL,
  first_run_id uuid NOT NULL REFERENCES archive.snapshot_runs (run_id),
  archived_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX ledger_deposit_events_created_idx ON archive.ledger_deposit_events (source_created_at);

CREATE TABLE archive.ledger_user_crypto_addresses (
  source_id uuid PRIMARY KEY,
  source_created_at timestamptz NOT NULL,
  user_id uuid,
  derivation_index integer,
  bep20_address text,
  trc20_address text,
  source_row jsonb NOT NULL,
  first_run_id uuid NOT NULL REFERENCES archive.snapshot_runs (run_id),
  archived_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE archive.ledger_deposit_recon_reports (
  source_id bigint PRIMARY KEY,
  source_created_at timestamptz NOT NULL,
  status text,
  summary jsonb,
  details jsonb,
  source_row jsonb NOT NULL,
  first_run_id uuid NOT NULL REFERENCES archive.snapshot_runs (run_id),
  archived_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE archive.ledger_finance_recon_reports (
  source_id bigint PRIMARY KEY,
  source_created_at timestamptz NOT NULL,
  kind text,
  status text,
  summary jsonb,
  details jsonb,
  source_row jsonb NOT NULL,
  first_run_id uuid NOT NULL REFERENCES archive.snapshot_runs (run_id),
  archived_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE archive.ledger_tournament_commission_snapshots (
  source_id uuid PRIMARY KEY,
  source_created_at timestamptz NOT NULL,
  tournament_id uuid,
  entry_id uuid,
  user_id uuid,
  agent_amount numeric,
  super_amount numeric,
  admin_amount numeric,
  source_row jsonb NOT NULL,
  first_run_id uuid NOT NULL REFERENCES archive.snapshot_runs (run_id),
  archived_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE archive.ledger_tournament_prize_rules (
  source_id uuid PRIMARY KEY,
  source_created_at timestamptz NOT NULL,
  tournament_id uuid,
  rank integer,
  payout_type text,
  payout_value numeric,
  source_row jsonb NOT NULL,
  first_run_id uuid NOT NULL REFERENCES archive.snapshot_runs (run_id),
  archived_at timestamptz NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- Layer A — versioned ledgers (mutable source rows)
-- ---------------------------------------------------------------------------

CREATE TABLE archive.ledger_commission_daily_stats (
  user_id uuid NOT NULL,
  stat_date date NOT NULL,
  currency text NOT NULL,
  source_kind text NOT NULL,
  role text NOT NULL,
  source_row_hash text NOT NULL,
  earned_amount numeric,
  commission_base numeric,
  gross_amount numeric,
  source_updated_at timestamptz,
  source_row jsonb NOT NULL,
  first_run_id uuid NOT NULL REFERENCES archive.snapshot_runs (run_id),
  archived_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, stat_date, currency, source_kind, role, source_row_hash)
);

CREATE INDEX ledger_commission_daily_stats_source_idx
  ON archive.ledger_commission_daily_stats (user_id, stat_date, archived_at DESC);

CREATE TABLE archive.ledger_deposit_intents (
  source_id uuid NOT NULL,
  source_row_hash text NOT NULL,
  source_created_at timestamptz NOT NULL,
  source_updated_at timestamptz,
  user_id uuid,
  channel text,
  provider text,
  amount_expected numeric,
  currency text,
  status text,
  source_row jsonb NOT NULL,
  first_run_id uuid NOT NULL REFERENCES archive.snapshot_runs (run_id),
  archived_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (source_id, source_row_hash)
);

CREATE INDEX ledger_deposit_intents_source_idx
  ON archive.ledger_deposit_intents (source_id, archived_at DESC);

CREATE TABLE archive.ledger_deposit_credits (
  source_id uuid NOT NULL,
  source_row_hash text NOT NULL,
  source_created_at timestamptz NOT NULL,
  source_updated_at timestamptz,
  intent_id uuid,
  user_id uuid,
  amount numeric,
  ledger_tx_id uuid,
  status text,
  source_row jsonb NOT NULL,
  first_run_id uuid NOT NULL REFERENCES archive.snapshot_runs (run_id),
  archived_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (source_id, source_row_hash)
);

CREATE INDEX ledger_deposit_credits_source_idx
  ON archive.ledger_deposit_credits (source_id, archived_at DESC);

CREATE TABLE archive.ledger_crypto_transactions (
  source_id uuid NOT NULL,
  source_row_hash text NOT NULL,
  source_created_at timestamptz NOT NULL,
  source_updated_at timestamptz,
  user_id uuid,
  tx_hash text,
  toman_amount numeric,
  wallet_tx_id uuid,
  status text,
  source_row jsonb NOT NULL,
  first_run_id uuid NOT NULL REFERENCES archive.snapshot_runs (run_id),
  archived_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (source_id, source_row_hash)
);

CREATE INDEX ledger_crypto_transactions_source_idx
  ON archive.ledger_crypto_transactions (source_id, archived_at DESC);

CREATE TABLE archive.ledger_withdrawal_requests (
  source_id uuid NOT NULL,
  source_row_hash text NOT NULL,
  source_created_at timestamptz NOT NULL,
  source_updated_at timestamptz,
  player_id uuid,
  agent_id uuid,
  amount bigint,
  kind text,
  status text,
  card_number text,
  sheba_number text,
  wallet_address text,
  source_row jsonb NOT NULL,
  first_run_id uuid NOT NULL REFERENCES archive.snapshot_runs (run_id),
  archived_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (source_id, source_row_hash)
);

CREATE INDEX ledger_withdrawal_requests_source_idx
  ON archive.ledger_withdrawal_requests (source_id, archived_at DESC);

CREATE TABLE archive.ledger_auto_buy_sessions (
  source_id uuid NOT NULL,
  source_row_hash text NOT NULL,
  source_created_at timestamptz NOT NULL,
  source_updated_at timestamptz,
  user_id uuid,
  fund_initial numeric,
  fund_remaining numeric,
  status text,
  source_row jsonb NOT NULL,
  first_run_id uuid NOT NULL REFERENCES archive.snapshot_runs (run_id),
  archived_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (source_id, source_row_hash)
);

CREATE INDEX ledger_auto_buy_sessions_source_idx
  ON archive.ledger_auto_buy_sessions (source_id, archived_at DESC);

CREATE TABLE archive.ledger_session_settlement (
  source_id uuid NOT NULL,
  source_row_hash text NOT NULL,
  source_created_at timestamptz NOT NULL,
  source_updated_at timestamptz,
  session_id uuid,
  settlement_key text,
  gross_in numeric,
  gross_out numeric,
  fee_total numeric,
  lines jsonb,
  ledger_refs jsonb,
  status text,
  source_row jsonb NOT NULL,
  first_run_id uuid NOT NULL REFERENCES archive.snapshot_runs (run_id),
  archived_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (source_id, source_row_hash)
);

CREATE INDEX ledger_session_settlement_source_idx
  ON archive.ledger_session_settlement (source_id, archived_at DESC);

CREATE TABLE archive.ledger_tournament_entries (
  source_id uuid NOT NULL,
  source_row_hash text NOT NULL,
  source_created_at timestamptz NOT NULL,
  source_updated_at timestamptz,
  tournament_id uuid,
  user_id uuid,
  amount numeric,
  status text,
  source_row jsonb NOT NULL,
  first_run_id uuid NOT NULL REFERENCES archive.snapshot_runs (run_id),
  archived_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (source_id, source_row_hash)
);

CREATE INDEX ledger_tournament_entries_source_idx
  ON archive.ledger_tournament_entries (source_id, archived_at DESC);

CREATE TABLE archive.ledger_tournament_locks (
  source_id uuid NOT NULL,
  source_row_hash text NOT NULL,
  source_created_at timestamptz NOT NULL,
  source_updated_at timestamptz,
  tournament_id uuid,
  entry_id uuid,
  amount numeric,
  status text,
  captured_at timestamptz,
  released_at timestamptz,
  source_row jsonb NOT NULL,
  first_run_id uuid NOT NULL REFERENCES archive.snapshot_runs (run_id),
  archived_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (source_id, source_row_hash)
);

CREATE INDEX ledger_tournament_locks_source_idx
  ON archive.ledger_tournament_locks (source_id, archived_at DESC);

CREATE TABLE archive.ledger_tournament_payouts (
  source_id uuid NOT NULL,
  source_row_hash text NOT NULL,
  source_created_at timestamptz NOT NULL,
  source_updated_at timestamptz,
  tournament_id uuid,
  user_id uuid,
  rank integer,
  amount numeric,
  status text,
  paid_at timestamptz,
  source_row jsonb NOT NULL,
  first_run_id uuid NOT NULL REFERENCES archive.snapshot_runs (run_id),
  archived_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (source_id, source_row_hash)
);

CREATE INDEX ledger_tournament_payouts_source_idx
  ON archive.ledger_tournament_payouts (source_id, archived_at DESC);

CREATE TABLE archive.ledger_tournament_player_ding (
  tournament_id uuid NOT NULL,
  user_id uuid NOT NULL,
  source_row_hash text NOT NULL,
  ding_total numeric,
  source_updated_at timestamptz,
  source_row jsonb NOT NULL,
  first_run_id uuid NOT NULL REFERENCES archive.snapshot_runs (run_id),
  archived_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tournament_id, user_id, source_row_hash)
);

CREATE INDEX ledger_tournament_player_ding_source_idx
  ON archive.ledger_tournament_player_ding (tournament_id, user_id, archived_at DESC);

CREATE TABLE archive.ledger_tic_tac_toe_matches (
  source_id uuid NOT NULL,
  source_row_hash text NOT NULL,
  source_created_at timestamptz NOT NULL,
  source_updated_at timestamptz,
  user_id uuid,
  seed text,
  outcome text,
  paid_ding bigint,
  prize_snapshot bigint,
  player_moves jsonb,
  source_row jsonb NOT NULL,
  first_run_id uuid NOT NULL REFERENCES archive.snapshot_runs (run_id),
  archived_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (source_id, source_row_hash)
);

CREATE INDEX ledger_tic_tac_toe_matches_source_idx
  ON archive.ledger_tic_tac_toe_matches (source_id, archived_at DESC);

-- ---------------------------------------------------------------------------
-- Layer B — daily state snapshots
-- ---------------------------------------------------------------------------

CREATE TABLE archive.state_users (
  snapshot_date date NOT NULL,
  source_id uuid NOT NULL,
  username text,
  email text,
  role text,
  status text,
  parent_id uuid,
  referral_code text,
  admin_sub_role text,
  kyc_verified boolean,
  last_login_at timestamptz,
  last_seen_at timestamptz,
  source_created_at timestamptz,
  source_updated_at timestamptz,
  source_row jsonb NOT NULL,
  first_run_id uuid NOT NULL REFERENCES archive.snapshot_runs (run_id),
  archived_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (snapshot_date, source_id)
);

CREATE TABLE archive.state_user_profiles (
  snapshot_date date NOT NULL,
  source_id uuid NOT NULL,
  nickname text,
  full_name text,
  phone text,
  avatar_url text,
  country text,
  language text,
  source_row jsonb NOT NULL,
  first_run_id uuid NOT NULL REFERENCES archive.snapshot_runs (run_id),
  archived_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (snapshot_date, source_id)
);

CREATE TABLE archive.state_wallets (
  snapshot_date date NOT NULL,
  source_id uuid NOT NULL,
  user_id uuid,
  balance bigint,
  locked_amount numeric,
  currency text,
  source_updated_at timestamptz,
  source_row jsonb NOT NULL,
  first_run_id uuid NOT NULL REFERENCES archive.snapshot_runs (run_id),
  archived_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (snapshot_date, source_id)
);

CREATE TABLE archive.state_ding_balances (
  snapshot_date date NOT NULL,
  source_id uuid NOT NULL,
  balance bigint,
  locked_amount bigint,
  source_updated_at timestamptz,
  source_row jsonb NOT NULL,
  first_run_id uuid NOT NULL REFERENCES archive.snapshot_runs (run_id),
  archived_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (snapshot_date, source_id)
);

CREATE TABLE archive.state_player_affiliation (
  snapshot_date date NOT NULL,
  source_id uuid NOT NULL,
  agent_id uuid,
  super_id uuid,
  source_row jsonb NOT NULL,
  first_run_id uuid NOT NULL REFERENCES archive.snapshot_runs (run_id),
  archived_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (snapshot_date, source_id)
);

CREATE TABLE archive.state_user_commissions (
  snapshot_date date NOT NULL,
  source_id uuid NOT NULL,
  agent_commission numeric,
  super_commission numeric,
  source_row jsonb NOT NULL,
  first_run_id uuid NOT NULL REFERENCES archive.snapshot_runs (run_id),
  archived_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (snapshot_date, source_id)
);

CREATE TABLE archive.state_room_templates (
  snapshot_date date NOT NULL,
  source_id uuid NOT NULL,
  name text,
  price numeric,
  commission_rate numeric,
  line_reward_percentage numeric,
  full_reward_percentage numeric,
  ding_per_number numeric,
  status text,
  source_row jsonb NOT NULL,
  first_run_id uuid NOT NULL REFERENCES archive.snapshot_runs (run_id),
  archived_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (snapshot_date, source_id)
);

-- ---------------------------------------------------------------------------
-- Layer C — compact game archive
-- ---------------------------------------------------------------------------

CREATE TABLE archive.game_rooms (
  room_id uuid PRIMARY KEY,
  room_code text,
  status text,
  card_price numeric,
  price numeric,
  currency text,
  commission_rate numeric,
  line_prize_pool numeric,
  full_prize_pool numeric,
  line_reward_percentage numeric,
  full_reward_percentage numeric,
  ding_per_number numeric,
  room_template_id uuid,
  pool_id uuid,
  starts_at timestamptz,
  ends_at timestamptz,
  created_at timestamptz,
  cancelled_at timestamptz,
  cancelled_by uuid,
  cancelled_reason text,
  prize_paid_at timestamptz,
  first_line_draw_number integer,
  room_seed_hash text,
  source_row jsonb NOT NULL,
  first_run_id uuid NOT NULL REFERENCES archive.snapshot_runs (run_id),
  archived_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE archive.game_room_seed_reveals (
  room_id uuid PRIMARY KEY,
  room_seed bytea,
  seed_revealed_at timestamptz,
  first_run_id uuid NOT NULL REFERENCES archive.snapshot_runs (run_id),
  archived_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE archive.game_room_draws (
  room_id uuid PRIMARY KEY,
  numbers integer[] NOT NULL,
  drawn_at timestamptz[] NOT NULL,
  draw_count integer NOT NULL,
  first_drawn_at timestamptz,
  last_drawn_at timestamptz,
  numbers_hash text NOT NULL,
  first_run_id uuid NOT NULL REFERENCES archive.snapshot_runs (run_id),
  archived_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT game_room_draws_cardinality_chk CHECK (
    draw_count = cardinality(numbers)
    AND cardinality(numbers) = cardinality(drawn_at)
  )
);

CREATE TABLE archive.game_tickets (
  ticket_id uuid PRIMARY KEY,
  room_id uuid NOT NULL,
  player_user_id uuid,
  pool_card_id bigint,
  card_no smallint,
  price numeric,
  reservation_status text,
  cancelled_at timestamptz,
  transaction_id uuid,
  source_row jsonb NOT NULL,
  first_run_id uuid NOT NULL REFERENCES archive.snapshot_runs (run_id),
  archived_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX game_tickets_room_idx ON archive.game_tickets (room_id);
CREATE INDEX game_tickets_player_idx ON archive.game_tickets (player_user_id);

CREATE TABLE archive.game_results (
  result_id uuid PRIMARY KEY,
  room_id uuid NOT NULL,
  user_id uuid,
  ticket_id uuid,
  win_type text,
  reward_amount numeric,
  draw_number integer,
  paid_at timestamptz,
  source_row jsonb NOT NULL,
  first_run_id uuid NOT NULL REFERENCES archive.snapshot_runs (run_id),
  archived_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE archive.game_room_winners (
  room_id uuid NOT NULL,
  ticket_id uuid NOT NULL,
  user_id uuid,
  weight numeric,
  first_run_id uuid NOT NULL REFERENCES archive.snapshot_runs (run_id),
  archived_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (room_id, ticket_id)
);

CREATE TABLE archive.game_card_pools (
  pool_id uuid NOT NULL,
  version integer NOT NULL,
  commit_hash text,
  pool_seed bytea,
  prng_version text,
  card_count integer,
  source_row jsonb NOT NULL,
  first_run_id uuid NOT NULL REFERENCES archive.snapshot_runs (run_id),
  archived_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (pool_id, version)
);

CREATE TABLE archive.game_card_pool_cards (
  pool_card_id bigint PRIMARY KEY,
  pool_id uuid,
  card_no integer,
  card_data jsonb,
  source_row jsonb NOT NULL,
  first_run_id uuid NOT NULL REFERENCES archive.snapshot_runs (run_id),
  archived_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE archive.game_card_numbers (
  pool_card_id bigint NOT NULL,
  row_no smallint NOT NULL,
  col_no smallint NOT NULL,
  value integer,
  bit_position smallint,
  source_row jsonb NOT NULL,
  first_run_id uuid NOT NULL REFERENCES archive.snapshot_runs (run_id),
  archived_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (pool_card_id, row_no, col_no)
);

CREATE TABLE archive.game_tournaments (
  tournament_id uuid PRIMARY KEY,
  title text,
  status text,
  start_at timestamptz,
  currency text,
  ticket_price numeric,
  commission_rate numeric,
  guaranteed_prize numeric,
  watch_code integer,
  source_row jsonb NOT NULL,
  first_run_id uuid NOT NULL REFERENCES archive.snapshot_runs (run_id),
  archived_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE archive.game_tournament_round_rooms (
  source_id uuid PRIMARY KEY,
  tournament_id uuid,
  round_no integer,
  table_no integer,
  room_id uuid,
  status text,
  source_row jsonb NOT NULL,
  first_run_id uuid NOT NULL REFERENCES archive.snapshot_runs (run_id),
  archived_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE archive.game_tournament_round_assignments (
  tournament_id uuid NOT NULL,
  round_no integer NOT NULL,
  user_id uuid NOT NULL,
  room_id uuid NOT NULL,
  seed integer,
  cards_count integer,
  source_row jsonb NOT NULL,
  first_run_id uuid NOT NULL REFERENCES archive.snapshot_runs (run_id),
  archived_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tournament_id, round_no, user_id, room_id)
);

CREATE TABLE archive.game_sessions (
  session_id uuid PRIMARY KEY,
  game_id uuid,
  status text,
  entry_fee numeric,
  currency text,
  participant_count integer,
  created_at timestamptz,
  started_at timestamptz,
  finished_at timestamptz,
  settled_at timestamptz,
  source_row jsonb NOT NULL,
  first_run_id uuid NOT NULL REFERENCES archive.snapshot_runs (run_id),
  archived_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE archive.game_session_participants (
  session_id uuid NOT NULL,
  user_id uuid NOT NULL,
  seat_no integer,
  status text,
  ticket_count integer,
  amount_total numeric,
  joined_at timestamptz,
  left_at timestamptz,
  source_row jsonb NOT NULL,
  first_run_id uuid NOT NULL REFERENCES archive.snapshot_runs (run_id),
  archived_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (session_id, user_id)
);

-- ---------------------------------------------------------------------------
-- Layer D — audit
-- ---------------------------------------------------------------------------

CREATE TABLE archive.audit_admin_log (
  source_id uuid PRIMARY KEY,
  source_created_at timestamptz NOT NULL,
  admin_id uuid,
  action text,
  target_table text,
  target_id text,
  payload jsonb,
  ip_address text,
  user_agent text,
  source_row jsonb NOT NULL,
  first_run_id uuid NOT NULL REFERENCES archive.snapshot_runs (run_id),
  archived_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE archive.audit_kyc_submissions (
  source_id uuid NOT NULL,
  source_row_hash text NOT NULL,
  source_created_at timestamptz NOT NULL,
  source_updated_at timestamptz,
  user_id uuid,
  kyc_code text,
  status text,
  image_mime_type text,
  image_byte_size integer,
  reviewed_by uuid,
  rejection_reason text,
  rejection_reason_code text,
  source_row jsonb NOT NULL,
  first_run_id uuid NOT NULL REFERENCES archive.snapshot_runs (run_id),
  archived_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (source_id, source_row_hash)
);

CREATE INDEX audit_kyc_submissions_source_idx
  ON archive.audit_kyc_submissions (source_id, archived_at DESC);

CREATE TABLE archive.audit_operator_play_days (
  stat_date date NOT NULL,
  operator_id uuid NOT NULL,
  player_id uuid NOT NULL,
  operator_role text,
  first_seen_at timestamptz,
  source_row jsonb NOT NULL,
  first_run_id uuid NOT NULL REFERENCES archive.snapshot_runs (run_id),
  archived_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (stat_date, operator_id, player_id)
);

CREATE TABLE archive.audit_invitation_links (
  source_id uuid PRIMARY KEY,
  source_created_at timestamptz NOT NULL,
  code text,
  inviter_id uuid,
  inviter_role text,
  is_active boolean,
  source_row jsonb NOT NULL,
  first_run_id uuid NOT NULL REFERENCES archive.snapshot_runs (run_id),
  archived_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE archive.audit_player_signups (
  source_id uuid PRIMARY KEY,
  source_created_at timestamptz NOT NULL,
  invitation_link_id uuid,
  player_id uuid,
  signed_up_at timestamptz,
  source_row jsonb NOT NULL,
  first_run_id uuid NOT NULL REFERENCES archive.snapshot_runs (run_id),
  archived_at timestamptz NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- Storage manifest
-- ---------------------------------------------------------------------------

CREATE TABLE archive.storage_manifest (
  snapshot_date date NOT NULL,
  bucket_id text NOT NULL,
  object_path text NOT NULL,
  object_id uuid,
  content_md5 text,
  size_bytes bigint,
  mime text,
  backup_path text NOT NULL,
  copied boolean NOT NULL DEFAULT false,
  first_run_id uuid NOT NULL REFERENCES archive.snapshot_runs (run_id),
  archived_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (snapshot_date, bucket_id, object_path)
);

-- ---------------------------------------------------------------------------
-- RLS — deny client roles; service_role / postgres bypass RLS
-- ---------------------------------------------------------------------------

DO $$
DECLARE
  tbl text;
BEGIN
  FOR tbl IN
    SELECT table_name
    FROM information_schema.tables
    WHERE table_schema = 'archive'
      AND table_type = 'BASE TABLE'
  LOOP
    EXECUTE format('ALTER TABLE archive.%I ENABLE ROW LEVEL SECURITY', tbl);
    EXECUTE format(
      'CREATE POLICY archive_deny_all ON archive.%I FOR ALL TO authenticated, anon USING (false)',
      tbl
    );
  END LOOP;
END $$;

REVOKE ALL ON SCHEMA archive FROM PUBLIC, anon, authenticated;
GRANT USAGE ON SCHEMA archive TO postgres, service_role;

DO $$
DECLARE
  tbl text;
BEGIN
  FOR tbl IN
    SELECT table_name
    FROM information_schema.tables
    WHERE table_schema = 'archive'
      AND table_type = 'BASE TABLE'
  LOOP
    EXECUTE format('REVOKE ALL ON TABLE archive.%I FROM PUBLIC, anon, authenticated', tbl);
    EXECUTE format('GRANT SELECT, INSERT ON TABLE archive.%I TO postgres, service_role', tbl);
  END LOOP;
END $$;

COMMIT;
