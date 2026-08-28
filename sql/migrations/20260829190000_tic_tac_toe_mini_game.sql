-- Tic-Tac-Toe mini game: isolated schema, feature flag, settings + match audit

BEGIN;

CREATE SCHEMA IF NOT EXISTS tic_tac_toe;

CREATE TABLE IF NOT EXISTS tic_tac_toe.settings (
  id smallint PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  is_enabled boolean NOT NULL DEFAULT false,
  win_prize_ding bigint NOT NULL DEFAULT 5 CHECK (win_prize_ding >= 0),
  daily_win_cap integer NOT NULL DEFAULT 10 CHECK (daily_win_cap >= 0),
  placements jsonb NOT NULL DEFAULT '["player_home"]'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO tic_tac_toe.settings (id)
VALUES (1)
ON CONFLICT (id) DO NOTHING;

CREATE TABLE IF NOT EXISTS tic_tac_toe.matches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  seed text NOT NULL,
  difficulty text NOT NULL CHECK (difficulty IN ('easy', 'medium', 'hard')),
  prize_snapshot bigint NOT NULL DEFAULT 0 CHECK (prize_snapshot >= 0),
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'claimed', 'rejected')),
  player_moves jsonb,
  outcome text CHECK (outcome IS NULL OR outcome IN ('win', 'lose', 'draw')),
  paid_ding bigint NOT NULL DEFAULT 0 CHECK (paid_ding >= 0),
  paid_at timestamptz,
  claim_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  claimed_at timestamptz
);

CREATE INDEX IF NOT EXISTS matches_user_created_idx
  ON tic_tac_toe.matches (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS matches_user_paid_today_idx
  ON tic_tac_toe.matches (user_id, paid_at)
  WHERE paid_ding > 0;

COMMENT ON TABLE tic_tac_toe.settings IS
  'Admin-managed configuration for the Tic-Tac-Toe mini game popup.';
COMMENT ON TABLE tic_tac_toe.matches IS
  'Per-hand audit row; claim replays moves server-side before any ding credit.';

INSERT INTO public.features (key, name, description, is_enabled, default_enabled)
VALUES (
  'tic_tac_toe',
  'Tic-Tac-Toe Mini Game',
  'Access to Tic-Tac-Toe mini game popup and reward APIs',
  true,
  false
)
ON CONFLICT (key) DO NOTHING;

ALTER TABLE tic_tac_toe.settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE tic_tac_toe.matches ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON SCHEMA tic_tac_toe FROM PUBLIC;
REVOKE ALL ON SCHEMA tic_tac_toe FROM anon, authenticated;
REVOKE ALL ON ALL TABLES IN SCHEMA tic_tac_toe FROM PUBLIC;
REVOKE ALL ON ALL TABLES IN SCHEMA tic_tac_toe FROM anon, authenticated;

GRANT USAGE ON SCHEMA tic_tac_toe TO postgres, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA tic_tac_toe TO postgres, service_role;

COMMIT;
