-- P5.2 — Additive Platform Session Foundation
-- Scope: CREATE schema platform + canonical session tables + seed games/engines + one dummy session.
-- Non-goals: no DROP/RENAME of existing objects; no Bingo/rooms/tickets/wallet/settle changes;
--            no dual-write; no app cutover; no data migration from rooms.
-- Applied target: DEV via MCP apply_migration (name: p5_2_platform_session_foundation).
-- Rollback: see docs/architecture/p5-2-platform-foundation.md (drop platform schema cascade).

BEGIN;

-- ---------------------------------------------------------------------------
-- Schema
-- ---------------------------------------------------------------------------
CREATE SCHEMA IF NOT EXISTS platform;

COMMENT ON SCHEMA platform IS
  'Ding Platform Core — engine-agnostic games, sessions, settlement envelopes. No Bingo/Backgammon rules.';

REVOKE ALL ON SCHEMA platform FROM PUBLIC;
GRANT USAGE ON SCHEMA platform TO postgres;
GRANT USAGE ON SCHEMA platform TO service_role;
-- Explicitly no USAGE for anon / authenticated in this foundation phase.

-- ---------------------------------------------------------------------------
-- platform.games
-- ---------------------------------------------------------------------------
CREATE TABLE platform.games (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code        text NOT NULL,
  name        text NOT NULL,
  status      text NOT NULL DEFAULT 'enabled'
                CHECK (status IN ('enabled', 'disabled')),
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT games_code_format CHECK (code ~ '^[a-z][a-z0-9_]*$'),
  CONSTRAINT games_code_unique UNIQUE (code)
);

COMMENT ON TABLE platform.games IS
  'Product game catalog (bingo, backgammon, …). No rule columns.';

CREATE INDEX games_status_idx ON platform.games (status);

-- ---------------------------------------------------------------------------
-- platform.engine_registry
-- ---------------------------------------------------------------------------
CREATE TABLE platform.engine_registry (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  game_id         uuid NOT NULL REFERENCES platform.games (id),
  code            text NOT NULL,
  display_name    text NOT NULL,
  status          text NOT NULL DEFAULT 'inactive'
                    CHECK (status IN ('active', 'inactive')),
  version         text,
  environment     text,
  last_health_at  timestamptz,
  metadata        jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT engine_registry_code_format CHECK (code ~ '^[a-z][a-z0-9_-]*$'),
  CONSTRAINT engine_registry_code_unique UNIQUE (code)
);

COMMENT ON TABLE platform.engine_registry IS
  'Deployed engine instances that may claim/advance platform.game_sessions.';

CREATE INDEX engine_registry_game_id_idx ON platform.engine_registry (game_id);
CREATE INDEX engine_registry_status_idx ON platform.engine_registry (status);

-- ---------------------------------------------------------------------------
-- platform.game_sessions
-- ---------------------------------------------------------------------------
CREATE TABLE platform.game_sessions (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  game_id               uuid NOT NULL REFERENCES platform.games (id),
  engine_id             uuid NOT NULL REFERENCES platform.engine_registry (id),
  -- Nullable: platform.game_templates not created in P5.2 (additive foundation only).
  template_id           uuid NULL,
  -- Nullable: tournaments not wired in P5.2.
  tournament_match_id   uuid NULL,
  status                text NOT NULL DEFAULT 'created'
                          CHECK (status IN (
                            'created',
                            'waiting',
                            'claimed',
                            'running',
                            'finished',
                            'settled',
                            'archived',
                            'cancelled',
                            'failed'
                          )),
  capacity              integer NULL CHECK (capacity IS NULL OR capacity > 0),
  participant_count     integer NOT NULL DEFAULT 0 CHECK (participant_count >= 0),
  entry_fee             numeric(18, 2) NULL CHECK (entry_fee IS NULL OR entry_fee >= 0),
  currency              text NULL,
  lease_owner           text NULL,
  lease_epoch           bigint NOT NULL DEFAULT 0,
  lease_expires_at      timestamptz NULL,
  correlation_key       text NULL,
  created_at            timestamptz NOT NULL DEFAULT now(),
  started_at            timestamptz NULL,
  finished_at           timestamptz NULL,
  settled_at            timestamptz NULL,
  updated_at            timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT game_sessions_correlation_key_unique UNIQUE (correlation_key)
);

COMMENT ON TABLE platform.game_sessions IS
  'Engine-agnostic playable session shell. Lifecycle + money shell only; no game rules.';

COMMENT ON COLUMN platform.game_sessions.template_id IS
  'Reserved for future platform.game_templates; no FK in P5.2.';

COMMENT ON COLUMN platform.game_sessions.tournament_match_id IS
  'Reserved for future tournament match FK; no FK in P5.2.';

CREATE INDEX game_sessions_game_id_idx ON platform.game_sessions (game_id);
CREATE INDEX game_sessions_engine_id_idx ON platform.game_sessions (engine_id);
CREATE INDEX game_sessions_status_idx ON platform.game_sessions (status);
CREATE INDEX game_sessions_created_at_idx ON platform.game_sessions (created_at DESC);

-- Enforce session.game_id matches engine_registry.game_id (engine-agnostic integrity).
CREATE OR REPLACE FUNCTION platform.fn_assert_session_engine_game()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_engine_game_id uuid;
BEGIN
  SELECT er.game_id INTO v_engine_game_id
  FROM platform.engine_registry er
  WHERE er.id = NEW.engine_id;

  IF v_engine_game_id IS NULL THEN
    RAISE EXCEPTION 'engine_id % not found', NEW.engine_id;
  END IF;

  IF NEW.game_id IS DISTINCT FROM v_engine_game_id THEN
    RAISE EXCEPTION 'game_sessions.game_id (%) must match engine_registry.game_id (%)',
      NEW.game_id, v_engine_game_id;
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION platform.fn_assert_session_engine_game() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION platform.fn_assert_session_engine_game() TO postgres;
GRANT EXECUTE ON FUNCTION platform.fn_assert_session_engine_game() TO service_role;

CREATE TRIGGER trg_game_sessions_assert_engine_game
  BEFORE INSERT OR UPDATE OF game_id, engine_id
  ON platform.game_sessions
  FOR EACH ROW
  EXECUTE FUNCTION platform.fn_assert_session_engine_game();

-- ---------------------------------------------------------------------------
-- platform.session_participants
-- ---------------------------------------------------------------------------
CREATE TABLE platform.session_participants (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id    uuid NOT NULL REFERENCES platform.game_sessions (id) ON DELETE CASCADE,
  user_id       uuid NOT NULL REFERENCES public.users (id),
  seat_no       integer NULL CHECK (seat_no IS NULL OR seat_no >= 0),
  status        text NOT NULL DEFAULT 'joined'
                  CHECK (status IN ('joined', 'active', 'left', 'forfeit')),
  hold_ref      text NULL,
  joined_at     timestamptz NOT NULL DEFAULT now(),
  left_at       timestamptz NULL,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT session_participants_session_user_unique UNIQUE (session_id, user_id)
);

COMMENT ON TABLE platform.session_participants IS
  'Platform membership + economic hold refs. No engine seat semantics beyond opaque seat_no.';

CREATE INDEX session_participants_session_id_idx
  ON platform.session_participants (session_id);
CREATE INDEX session_participants_user_id_idx
  ON platform.session_participants (user_id);
CREATE INDEX session_participants_status_idx
  ON platform.session_participants (status);

-- ---------------------------------------------------------------------------
-- platform.session_state (1:1 thin envelope — not the game board)
-- ---------------------------------------------------------------------------
CREATE TABLE platform.session_state (
  session_id         uuid PRIMARY KEY
                       REFERENCES platform.game_sessions (id) ON DELETE CASCADE,
  state_version      bigint NOT NULL DEFAULT 0 CHECK (state_version >= 0),
  engine_state_ref   text NULL,
  needs_settle       boolean NOT NULL DEFAULT false,
  metadata           jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at         timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE platform.session_state IS
  'Thin Platform envelope (version/flags/pointer). Authoritative play state lives in engine schemas.';

-- ---------------------------------------------------------------------------
-- platform.session_settlement
-- ---------------------------------------------------------------------------
CREATE TABLE platform.session_settlement (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id        uuid NOT NULL REFERENCES platform.game_sessions (id) ON DELETE CASCADE,
  settlement_key    text NOT NULL,
  status            text NOT NULL DEFAULT 'pending'
                      CHECK (status IN ('pending', 'applied', 'failed', 'cancelled')),
  currency          text NULL,
  gross_in          numeric(18, 2) NULL,
  gross_out         numeric(18, 2) NULL,
  fee_total         numeric(18, 2) NULL,
  -- Opaque proposal lines (engine_ref allowed); not a second ledger.
  lines             jsonb NOT NULL DEFAULT '[]'::jsonb,
  ledger_refs       jsonb NOT NULL DEFAULT '[]'::jsonb,
  error_message     text NULL,
  created_at        timestamptz NOT NULL DEFAULT now(),
  applied_at        timestamptz NULL,
  updated_at        timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT session_settlement_session_key_unique UNIQUE (session_id, settlement_key)
);

COMMENT ON TABLE platform.session_settlement IS
  'Settlement intent/completion envelope. Wallet mutation remains Platform finance RPCs (unchanged in P5.2).';

CREATE INDEX session_settlement_session_id_idx
  ON platform.session_settlement (session_id);
CREATE INDEX session_settlement_status_idx
  ON platform.session_settlement (status);

-- ---------------------------------------------------------------------------
-- platform.session_events
-- ---------------------------------------------------------------------------
CREATE TABLE platform.session_events (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id    uuid NOT NULL REFERENCES platform.game_sessions (id) ON DELETE CASCADE,
  seq           bigint NOT NULL CHECK (seq >= 0),
  event_type    text NOT NULL,
  actor         text NULL,
  payload       jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at    timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT session_events_session_seq_unique UNIQUE (session_id, seq),
  CONSTRAINT session_events_type_format CHECK (char_length(event_type) BETWEEN 1 AND 128)
);

COMMENT ON TABLE platform.session_events IS
  'Append-only Platform-visible session events. Not financial source of truth.';

CREATE INDEX session_events_session_id_idx
  ON platform.session_events (session_id);
CREATE INDEX session_events_created_at_idx
  ON platform.session_events (created_at DESC);

-- ---------------------------------------------------------------------------
-- ACL: tables — service_role + postgres only (foundation unused by app clients)
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'games',
    'engine_registry',
    'game_sessions',
    'session_participants',
    'session_state',
    'session_settlement',
    'session_events'
  ]
  LOOP
    EXECUTE format('REVOKE ALL ON TABLE platform.%I FROM PUBLIC', t);
    EXECUTE format('REVOKE ALL ON TABLE platform.%I FROM anon', t);
    EXECUTE format('REVOKE ALL ON TABLE platform.%I FROM authenticated', t);
    EXECUTE format('GRANT ALL ON TABLE platform.%I TO postgres', t);
    EXECUTE format('GRANT ALL ON TABLE platform.%I TO service_role', t);
  END LOOP;
END;
$$;

ALTER DEFAULT PRIVILEGES IN SCHEMA platform
  GRANT ALL ON TABLES TO postgres;
ALTER DEFAULT PRIVILEGES IN SCHEMA platform
  GRANT ALL ON TABLES TO service_role;

-- ---------------------------------------------------------------------------
-- RLS: enabled; no anon/authenticated policies → client roles denied even if granted later.
-- service_role bypasses RLS in Supabase.
-- ---------------------------------------------------------------------------
ALTER TABLE platform.games ENABLE ROW LEVEL SECURITY;
ALTER TABLE platform.engine_registry ENABLE ROW LEVEL SECURITY;
ALTER TABLE platform.game_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE platform.session_participants ENABLE ROW LEVEL SECURITY;
ALTER TABLE platform.session_state ENABLE ROW LEVEL SECURITY;
ALTER TABLE platform.session_settlement ENABLE ROW LEVEL SECURITY;
ALTER TABLE platform.session_events ENABLE ROW LEVEL SECURITY;

-- Force RLS for table owners too (postgres still superuser; service_role bypasses).
ALTER TABLE platform.games FORCE ROW LEVEL SECURITY;
ALTER TABLE platform.engine_registry FORCE ROW LEVEL SECURITY;
ALTER TABLE platform.game_sessions FORCE ROW LEVEL SECURITY;
ALTER TABLE platform.session_participants FORCE ROW LEVEL SECURITY;
ALTER TABLE platform.session_state FORCE ROW LEVEL SECURITY;
ALTER TABLE platform.session_settlement FORCE ROW LEVEL SECURITY;
ALTER TABLE platform.session_events FORCE ROW LEVEL SECURITY;

-- service_role bypasses RLS; add explicit allow policies for clarity / non-bypass roles later.
CREATE POLICY platform_games_service_all
  ON platform.games
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE POLICY platform_engine_registry_service_all
  ON platform.engine_registry
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE POLICY platform_game_sessions_service_all
  ON platform.game_sessions
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE POLICY platform_session_participants_service_all
  ON platform.session_participants
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE POLICY platform_session_state_service_all
  ON platform.session_state
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE POLICY platform_session_settlement_service_all
  ON platform.session_settlement
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE POLICY platform_session_events_service_all
  ON platform.session_events
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- ---------------------------------------------------------------------------
-- Seed: games + engines only
-- ---------------------------------------------------------------------------
INSERT INTO platform.games (id, code, name, status)
VALUES
  ('a0000000-0000-4000-8000-000000000001', 'bingo', 'Bingo', 'enabled'),
  ('a0000000-0000-4000-8000-000000000002', 'backgammon', 'Backgammon', 'enabled')
ON CONFLICT (code) DO NOTHING;

INSERT INTO platform.engine_registry (id, game_id, code, display_name, status, version, environment)
VALUES
  (
    'b0000000-0000-4000-8000-000000000001',
    'a0000000-0000-4000-8000-000000000001',
    'bingo-engine',
    'Bingo Engine',
    'active',
    'p5.2-foundation',
    'dev'
  ),
  (
    'b0000000-0000-4000-8000-000000000002',
    'a0000000-0000-4000-8000-000000000002',
    'backgammon-engine',
    'Backgammon Engine',
    'inactive',
    'p5.2-foundation',
    'dev'
  )
ON CONFLICT (code) DO NOTHING;

-- ---------------------------------------------------------------------------
-- Validation smoke: one dummy Platform Session (no Bingo rooms/tickets linkage)
-- ---------------------------------------------------------------------------
INSERT INTO platform.game_sessions (
  id,
  game_id,
  engine_id,
  status,
  capacity,
  participant_count,
  entry_fee,
  currency,
  correlation_key
)
VALUES (
  'c0000000-0000-4000-8000-000000000001',
  'a0000000-0000-4000-8000-000000000001',
  'b0000000-0000-4000-8000-000000000001',
  'created',
  2,
  0,
  0,
  'IRR',
  'p5_2_foundation_dummy_session'
)
ON CONFLICT (id) DO NOTHING;

INSERT INTO platform.session_state (session_id, state_version, engine_state_ref, needs_settle)
VALUES (
  'c0000000-0000-4000-8000-000000000001',
  0,
  NULL,
  false
)
ON CONFLICT (session_id) DO NOTHING;

INSERT INTO platform.session_events (session_id, seq, event_type, actor, payload)
VALUES (
  'c0000000-0000-4000-8000-000000000001',
  1,
  'session.created',
  'p5.2-migration',
  jsonb_build_object('note', 'foundation smoke session; not linked to rooms')
)
ON CONFLICT (session_id, seq) DO NOTHING;

COMMIT;

-- ---------------------------------------------------------------------------
-- ROLLBACK (manual — not auto-applied)
-- BEGIN;
-- DROP SCHEMA platform CASCADE;
-- COMMIT;
-- ---------------------------------------------------------------------------
