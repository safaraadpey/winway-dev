-- Dev Panel: registration campaigns for multi-tournament management.

BEGIN;

CREATE TABLE IF NOT EXISTS tournament.dev_registration_campaigns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id uuid UNIQUE,
  name text NOT NULL,
  tournament_id uuid NOT NULL REFERENCES public.tournaments(id) ON DELETE CASCADE,
  operator_id uuid REFERENCES public.users(id) ON DELETE SET NULL,
  registration_open_time timestamptz NOT NULL,
  mode text NOT NULL CHECK (mode IN ('scheduled', 'immediate')),
  status text NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'completed', 'cancelled')),
  player_count integer NOT NULL DEFAULT 0,
  summary jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by uuid REFERENCES public.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS dev_registration_campaigns_tournament_idx
  ON tournament.dev_registration_campaigns (tournament_id, created_at DESC);

CREATE INDEX IF NOT EXISTS dev_registration_campaigns_status_idx
  ON tournament.dev_registration_campaigns (status, created_at DESC);

REVOKE ALL ON TABLE tournament.dev_registration_campaigns FROM PUBLIC;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE tournament.dev_registration_campaigns TO service_role, postgres;

COMMIT;
