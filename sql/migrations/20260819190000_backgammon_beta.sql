-- Backgammon Beta: domain schema, feature seed, engine registry activation

BEGIN;

CREATE SCHEMA IF NOT EXISTS backgammon;

CREATE TABLE IF NOT EXISTS backgammon.match_state (
  session_id uuid PRIMARY KEY
    REFERENCES platform.game_sessions(id) ON DELETE CASCADE,
  state jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE backgammon.match_state IS
  'Backgammon domain state aggregate keyed by platform.game_sessions.id';

CREATE OR REPLACE FUNCTION backgammon.tg_match_state_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_match_state_updated_at ON backgammon.match_state;
CREATE TRIGGER trg_match_state_updated_at
  BEFORE UPDATE ON backgammon.match_state
  FOR EACH ROW
  EXECUTE FUNCTION backgammon.tg_match_state_updated_at();

ALTER TABLE backgammon.match_state ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE backgammon.match_state FROM PUBLIC;
REVOKE ALL ON TABLE backgammon.match_state FROM anon, authenticated;

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE backgammon.match_state
  TO postgres, service_role;

REVOKE ALL ON SCHEMA backgammon FROM PUBLIC;
REVOKE ALL ON SCHEMA backgammon FROM anon, authenticated;
GRANT USAGE ON SCHEMA backgammon TO postgres, service_role;

UPDATE platform.engine_registry
SET status = 'active',
    updated_at = now()
WHERE code = 'backgammon-engine';

INSERT INTO public.features (key, name, description, is_enabled, default_enabled)
VALUES (
  'backgammon_beta',
  'Backgammon Beta',
  'Access to Backgammon beta game entry and APIs',
  true,
  false
)
ON CONFLICT (key) DO NOTHING;

COMMIT;
