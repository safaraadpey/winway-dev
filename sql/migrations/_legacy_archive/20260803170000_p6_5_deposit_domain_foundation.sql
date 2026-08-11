-- P6.5 — Deposit Domain Foundation
-- Fake/simulated payments only. No real gateway / chain integration.
-- ACL: RLS on; anon/authenticated direct table access = none; service_role/postgres EXECUTE.

BEGIN;

CREATE SCHEMA IF NOT EXISTS deposit;
COMMENT ON SCHEMA deposit IS 'P6.5 Deposit Domain — payment intents, verification, exactly-once credit authorization';

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------
DO $$ BEGIN
  CREATE TYPE deposit.intent_status AS ENUM (
    'created', 'pending', 'observed', 'verifying', 'confirmed',
    'credited', 'failed', 'expired', 'rejected', 'reversed'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE deposit.credit_status AS ENUM ('pending', 'posted', 'failed');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE deposit.verification_result AS ENUM ('pass', 'fail');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE deposit.attempt_parse_status AS ENUM ('accepted', 'malformed', 'unauthorized');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS deposit.intents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.users(id),
  channel text NOT NULL CHECK (channel IN ('fiat_gateway', 'tron_usdt', 'manual_adapter', 'fake')),
  provider text NOT NULL,
  amount_expected numeric NOT NULL CHECK (amount_expected > 0),
  currency text NOT NULL,
  status deposit.intent_status NOT NULL DEFAULT 'created',
  expires_at timestamptz NOT NULL,
  destination_ref text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by text NOT NULL DEFAULT 'system',
  created_by_actor_id uuid,
  provider_intent_ref text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS deposit_intents_provider_ref_uidx
  ON deposit.intents (provider, provider_intent_ref)
  WHERE provider_intent_ref IS NOT NULL;

CREATE INDEX IF NOT EXISTS deposit_intents_user_id_idx ON deposit.intents (user_id);
CREATE INDEX IF NOT EXISTS deposit_intents_status_idx ON deposit.intents (status);
CREATE INDEX IF NOT EXISTS deposit_intents_expires_at_idx ON deposit.intents (expires_at);

CREATE TABLE IF NOT EXISTS deposit.attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  intent_id uuid NOT NULL REFERENCES deposit.intents(id),
  provider text NOT NULL,
  external_event_id text NOT NULL,
  observed_at timestamptz NOT NULL DEFAULT now(),
  payload_hash text NOT NULL,
  payload_ref text,
  headers_meta jsonb NOT NULL DEFAULT '{}'::jsonb,
  parse_status deposit.attempt_parse_status NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT deposit_attempts_provider_event_uidx
    UNIQUE (provider, external_event_id)
);

CREATE INDEX IF NOT EXISTS deposit_attempts_intent_id_idx ON deposit.attempts (intent_id);

CREATE TABLE IF NOT EXISTS deposit.verifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  intent_id uuid NOT NULL REFERENCES deposit.intents(id),
  attempt_id uuid REFERENCES deposit.attempts(id),
  provider text NOT NULL,
  result deposit.verification_result NOT NULL,
  failure_code text,
  evidence jsonb NOT NULL DEFAULT '{}'::jsonb,
  external_payment_id text,
  amount_observed numeric,
  currency_observed text,
  confirmations int,
  verified_at timestamptz NOT NULL DEFAULT now(),
  verifier_version text NOT NULL DEFAULT 'p6.5'
);

-- One successful verification identity globally
CREATE UNIQUE INDEX IF NOT EXISTS deposit_verifications_pass_payment_uidx
  ON deposit.verifications (provider, external_payment_id)
  WHERE result = 'pass' AND external_payment_id IS NOT NULL;

-- At most one pass per intent (v1)
CREATE UNIQUE INDEX IF NOT EXISTS deposit_verifications_pass_intent_uidx
  ON deposit.verifications (intent_id)
  WHERE result = 'pass';

CREATE INDEX IF NOT EXISTS deposit_verifications_intent_id_idx ON deposit.verifications (intent_id);

CREATE TABLE IF NOT EXISTS deposit.credits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  intent_id uuid NOT NULL REFERENCES deposit.intents(id),
  verification_id uuid NOT NULL REFERENCES deposit.verifications(id),
  user_id uuid NOT NULL REFERENCES public.users(id),
  amount numeric NOT NULL CHECK (amount > 0),
  currency text NOT NULL,
  idempotency_key text NOT NULL,
  ledger_tx_id uuid,
  status deposit.credit_status NOT NULL DEFAULT 'pending',
  posted_at timestamptz,
  error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT deposit_credits_intent_uidx UNIQUE (intent_id),
  CONSTRAINT deposit_credits_idempotency_uidx UNIQUE (idempotency_key),
  CONSTRAINT deposit_credits_ledger_tx_uidx UNIQUE (ledger_tx_id)
);

CREATE TABLE IF NOT EXISTS deposit.events (
  id bigserial PRIMARY KEY,
  intent_id uuid REFERENCES deposit.intents(id),
  event_type text NOT NULL,
  actor text NOT NULL CHECK (actor IN ('system', 'user', 'admin', 'adapter', 'test')),
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS deposit_events_intent_id_idx ON deposit.events (intent_id);
CREATE INDEX IF NOT EXISTS deposit_events_created_at_idx ON deposit.events (created_at DESC);

CREATE TABLE IF NOT EXISTS deposit.recon_reports (
  id bigserial PRIMARY KEY,
  status text NOT NULL CHECK (status IN ('ok', 'drift', 'error')),
  summary jsonb NOT NULL DEFAULT '{}'::jsonb,
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- Append-only / no-delete guards
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION deposit.trg_forbid_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'deposit_append_only_violation'
    USING ERRCODE = '55000';
END;
$$;

DROP TRIGGER IF EXISTS deposit_attempts_no_update ON deposit.attempts;
CREATE TRIGGER deposit_attempts_no_update
  BEFORE UPDATE OR DELETE ON deposit.attempts
  FOR EACH ROW EXECUTE FUNCTION deposit.trg_forbid_mutation();

DROP TRIGGER IF EXISTS deposit_verifications_no_update ON deposit.verifications;
CREATE TRIGGER deposit_verifications_no_update
  BEFORE UPDATE OR DELETE ON deposit.verifications
  FOR EACH ROW EXECUTE FUNCTION deposit.trg_forbid_mutation();

DROP TRIGGER IF EXISTS deposit_events_no_update ON deposit.events;
CREATE TRIGGER deposit_events_no_update
  BEFORE UPDATE OR DELETE ON deposit.events
  FOR EACH ROW EXECUTE FUNCTION deposit.trg_forbid_mutation();

CREATE OR REPLACE FUNCTION deposit.trg_credits_guard()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.status = 'posted' THEN
      RAISE EXCEPTION 'deposit_posted_credit_immutable'
        USING ERRCODE = '55000';
    END IF;
    RAISE EXCEPTION 'deposit_credits_no_delete'
      USING ERRCODE = '55000';
  END IF;
  IF TG_OP = 'UPDATE' THEN
    IF OLD.status = 'posted' THEN
      IF NEW.amount IS DISTINCT FROM OLD.amount
         OR NEW.currency IS DISTINCT FROM OLD.currency
         OR NEW.user_id IS DISTINCT FROM OLD.user_id
         OR NEW.idempotency_key IS DISTINCT FROM OLD.idempotency_key
         OR NEW.verification_id IS DISTINCT FROM OLD.verification_id
         OR NEW.intent_id IS DISTINCT FROM OLD.intent_id
         OR (OLD.ledger_tx_id IS NOT NULL AND NEW.ledger_tx_id IS DISTINCT FROM OLD.ledger_tx_id)
      THEN
        RAISE EXCEPTION 'deposit_posted_credit_immutable'
          USING ERRCODE = '55000';
      END IF;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS deposit_credits_guard ON deposit.credits;
CREATE TRIGGER deposit_credits_guard
  BEFORE UPDATE OR DELETE ON deposit.credits
  FOR EACH ROW EXECUTE FUNCTION deposit.trg_credits_guard();

CREATE OR REPLACE FUNCTION deposit.trg_intents_immutable_core()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.user_id IS DISTINCT FROM OLD.user_id
     OR NEW.channel IS DISTINCT FROM OLD.channel
     OR NEW.provider IS DISTINCT FROM OLD.provider
     OR NEW.amount_expected IS DISTINCT FROM OLD.amount_expected
     OR NEW.currency IS DISTINCT FROM OLD.currency
  THEN
    RAISE EXCEPTION 'deposit_intent_core_immutable'
      USING ERRCODE = '55000';
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS deposit_intents_immutable_core ON deposit.intents;
CREATE TRIGGER deposit_intents_immutable_core
  BEFORE UPDATE ON deposit.intents
  FOR EACH ROW EXECUTE FUNCTION deposit.trg_intents_immutable_core();

-- ---------------------------------------------------------------------------
-- RLS + grants
-- ---------------------------------------------------------------------------
ALTER TABLE deposit.intents ENABLE ROW LEVEL SECURITY;
ALTER TABLE deposit.intents FORCE ROW LEVEL SECURITY;
ALTER TABLE deposit.attempts ENABLE ROW LEVEL SECURITY;
ALTER TABLE deposit.attempts FORCE ROW LEVEL SECURITY;
ALTER TABLE deposit.verifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE deposit.verifications FORCE ROW LEVEL SECURITY;
ALTER TABLE deposit.credits ENABLE ROW LEVEL SECURITY;
ALTER TABLE deposit.credits FORCE ROW LEVEL SECURITY;
ALTER TABLE deposit.events ENABLE ROW LEVEL SECURITY;
ALTER TABLE deposit.events FORCE ROW LEVEL SECURITY;
ALTER TABLE deposit.recon_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE deposit.recon_reports FORCE ROW LEVEL SECURITY;

REVOKE ALL ON SCHEMA deposit FROM PUBLIC;
REVOKE ALL ON SCHEMA deposit FROM anon, authenticated;
GRANT USAGE ON SCHEMA deposit TO postgres, service_role;

REVOKE ALL ON ALL TABLES IN SCHEMA deposit FROM PUBLIC;
REVOKE ALL ON ALL TABLES IN SCHEMA deposit FROM anon, authenticated;
GRANT ALL ON ALL TABLES IN SCHEMA deposit TO postgres, service_role;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA deposit TO postgres, service_role;

ALTER DEFAULT PRIVILEGES IN SCHEMA deposit
  REVOKE ALL ON TABLES FROM PUBLIC, anon, authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA deposit
  GRANT ALL ON TABLES TO postgres, service_role;

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION deposit.fn_append_event(
  p_intent_id uuid,
  p_event_type text,
  p_actor text,
  p_payload jsonb DEFAULT '{}'::jsonb
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = deposit, public
AS $$
BEGIN
  INSERT INTO deposit.events (intent_id, event_type, actor, payload)
  VALUES (p_intent_id, p_event_type, p_actor, coalesce(p_payload, '{}'::jsonb));
END;
$$;

CREATE OR REPLACE FUNCTION deposit.fn_assert_transition(
  p_from deposit.intent_status,
  p_to deposit.intent_status
) RETURNS void
LANGUAGE plpgsql
IMMUTABLE
AS $$
BEGIN
  IF NOT (
    (p_from = 'created' AND p_to IN ('pending', 'expired'))
    OR (p_from = 'pending' AND p_to IN ('observed', 'expired', 'rejected'))
    OR (p_from = 'observed' AND p_to IN ('verifying', 'expired'))
    OR (p_from = 'verifying' AND p_to IN ('confirmed', 'rejected', 'observed'))
    OR (p_from = 'confirmed' AND p_to IN ('credited', 'failed'))
    OR (p_from = 'credited' AND p_to = 'reversed')
  ) THEN
    RAISE EXCEPTION 'deposit_forbidden_transition:%->%', p_from, p_to
      USING ERRCODE = '22023';
  END IF;
END;
$$;

-- ---------------------------------------------------------------------------
-- Lifecycle: create / activate / status
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION deposit.fn_create_intent(
  p_user_id uuid,
  p_channel text,
  p_provider text,
  p_amount_expected numeric,
  p_currency text,
  p_expires_at timestamptz,
  p_destination_ref text DEFAULT NULL,
  p_metadata jsonb DEFAULT '{}'::jsonb,
  p_created_by text DEFAULT 'system',
  p_created_by_actor_id uuid DEFAULT NULL,
  p_provider_intent_ref text DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = deposit, public
AS $$
DECLARE
  v_id uuid;
BEGIN
  IF p_user_id IS NULL THEN
    RAISE EXCEPTION 'user_id_required';
  END IF;
  IF p_amount_expected IS NULL OR p_amount_expected <= 0 THEN
    RAISE EXCEPTION 'amount_invalid';
  END IF;
  IF p_expires_at IS NULL OR p_expires_at <= now() THEN
    RAISE EXCEPTION 'expires_at_invalid';
  END IF;
  IF p_channel IS NULL OR p_provider IS NULL OR p_currency IS NULL THEN
    RAISE EXCEPTION 'intent_fields_required';
  END IF;

  INSERT INTO deposit.intents (
    user_id, channel, provider, amount_expected, currency, status,
    expires_at, destination_ref, metadata, created_by, created_by_actor_id,
    provider_intent_ref
  ) VALUES (
    p_user_id, p_channel, p_provider, p_amount_expected, upper(p_currency),
    'created', p_expires_at, p_destination_ref, coalesce(p_metadata, '{}'::jsonb),
    coalesce(p_created_by, 'system'), p_created_by_actor_id, p_provider_intent_ref
  )
  RETURNING id INTO v_id;

  PERFORM deposit.fn_append_event(v_id, 'intent.created', coalesce(p_created_by, 'system'),
    jsonb_build_object('amount', p_amount_expected, 'currency', upper(p_currency), 'provider', p_provider));

  RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION deposit.fn_activate_intent(
  p_intent_id uuid,
  p_destination_ref text DEFAULT NULL
) RETURNS deposit.intents
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = deposit, public
AS $$
DECLARE
  v_row deposit.intents%ROWTYPE;
BEGIN
  SELECT * INTO v_row FROM deposit.intents WHERE id = p_intent_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'intent_not_found'; END IF;

  PERFORM deposit.fn_assert_transition(v_row.status, 'pending');

  IF v_row.expires_at <= now() THEN
    RAISE EXCEPTION 'intent_already_expired';
  END IF;

  UPDATE deposit.intents
  SET status = 'pending',
      destination_ref = coalesce(p_destination_ref, destination_ref)
  WHERE id = p_intent_id
  RETURNING * INTO v_row;

  PERFORM deposit.fn_append_event(p_intent_id, 'intent.activated', 'system',
    jsonb_build_object('destination_ref', v_row.destination_ref));

  RETURN v_row;
END;
$$;

CREATE OR REPLACE FUNCTION deposit.fn_get_intent_status(p_intent_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = deposit, public
AS $$
DECLARE
  v_intent deposit.intents%ROWTYPE;
  v_credit deposit.credits%ROWTYPE;
BEGIN
  SELECT * INTO v_intent FROM deposit.intents WHERE id = p_intent_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'intent_not_found';
  END IF;

  SELECT * INTO v_credit FROM deposit.credits WHERE intent_id = p_intent_id;

  RETURN jsonb_build_object(
    'id', v_intent.id,
    'user_id', v_intent.user_id,
    'channel', v_intent.channel,
    'provider', v_intent.provider,
    'amount_expected', v_intent.amount_expected,
    'currency', v_intent.currency,
    'status', v_intent.status,
    'expires_at', v_intent.expires_at,
    'destination_ref', v_intent.destination_ref,
    'created_at', v_intent.created_at,
    'updated_at', v_intent.updated_at,
    'credit', CASE WHEN v_credit.id IS NULL THEN NULL ELSE jsonb_build_object(
      'id', v_credit.id,
      'status', v_credit.status,
      'ledger_tx_id', v_credit.ledger_tx_id,
      'idempotency_key', v_credit.idempotency_key,
      'posted_at', v_credit.posted_at
    ) END
  );
END;
$$;

-- ---------------------------------------------------------------------------
-- Attempts
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION deposit.fn_record_attempt(
  p_intent_id uuid,
  p_provider text,
  p_external_event_id text,
  p_payload_hash text,
  p_parse_status deposit.attempt_parse_status,
  p_payload_ref text DEFAULT NULL,
  p_headers_meta jsonb DEFAULT '{}'::jsonb,
  p_observed_at timestamptz DEFAULT now()
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = deposit, public
AS $$
DECLARE
  v_intent deposit.intents%ROWTYPE;
  v_attempt_id uuid;
  v_existing uuid;
BEGIN
  IF p_external_event_id IS NULL OR btrim(p_external_event_id) = '' THEN
    RAISE EXCEPTION 'external_event_id_required';
  END IF;

  SELECT id INTO v_existing
  FROM deposit.attempts
  WHERE provider = p_provider AND external_event_id = p_external_event_id;

  IF FOUND THEN
    RETURN jsonb_build_object(
      'attempt_id', v_existing,
      'duplicate', true,
      'intent_id', p_intent_id
    );
  END IF;

  SELECT * INTO v_intent FROM deposit.intents WHERE id = p_intent_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'intent_not_found'; END IF;

  INSERT INTO deposit.attempts (
    intent_id, provider, external_event_id, observed_at, payload_hash,
    payload_ref, headers_meta, parse_status
  ) VALUES (
    p_intent_id, p_provider, p_external_event_id, coalesce(p_observed_at, now()),
    p_payload_hash, p_payload_ref, coalesce(p_headers_meta, '{}'::jsonb), p_parse_status
  )
  RETURNING id INTO v_attempt_id;

  PERFORM deposit.fn_append_event(p_intent_id, 'attempt.received', 'adapter',
    jsonb_build_object(
      'attempt_id', v_attempt_id,
      'external_event_id', p_external_event_id,
      'parse_status', p_parse_status,
      'duplicate', false
    ));

  IF p_parse_status = 'accepted' AND v_intent.status = 'pending' THEN
    PERFORM deposit.fn_assert_transition(v_intent.status, 'observed');
    UPDATE deposit.intents SET status = 'observed' WHERE id = p_intent_id;
    PERFORM deposit.fn_append_event(p_intent_id, 'intent.observed', 'system', '{}'::jsonb);
  END IF;

  RETURN jsonb_build_object(
    'attempt_id', v_attempt_id,
    'duplicate', false,
    'intent_id', p_intent_id
  );
END;
$$;

-- ---------------------------------------------------------------------------
-- Verification
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION deposit.fn_begin_verification(p_intent_id uuid)
RETURNS deposit.intents
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = deposit, public
AS $$
DECLARE
  v_row deposit.intents%ROWTYPE;
BEGIN
  SELECT * INTO v_row FROM deposit.intents WHERE id = p_intent_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'intent_not_found'; END IF;

  PERFORM deposit.fn_assert_transition(v_row.status, 'verifying');

  UPDATE deposit.intents SET status = 'verifying' WHERE id = p_intent_id
  RETURNING * INTO v_row;

  PERFORM deposit.fn_append_event(p_intent_id, 'verification.begun', 'system', '{}'::jsonb);
  RETURN v_row;
END;
$$;

CREATE OR REPLACE FUNCTION deposit.fn_pass_verification(
  p_intent_id uuid,
  p_attempt_id uuid,
  p_provider text,
  p_external_payment_id text,
  p_amount_observed numeric,
  p_currency_observed text,
  p_evidence jsonb DEFAULT '{}'::jsonb,
  p_confirmations int DEFAULT NULL,
  p_destination_observed text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = deposit, public
AS $$
DECLARE
  v_intent deposit.intents%ROWTYPE;
  v_verification_id uuid;
  v_dest text;
BEGIN
  SELECT * INTO v_intent FROM deposit.intents WHERE id = p_intent_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'intent_not_found'; END IF;

  IF v_intent.status <> 'verifying' THEN
    RAISE EXCEPTION 'deposit_forbidden_transition:%->confirmed', v_intent.status
      USING ERRCODE = '22023';
  END IF;

  IF v_intent.expires_at <= now() THEN
    INSERT INTO deposit.verifications (
      intent_id, attempt_id, provider, result, failure_code, evidence,
      external_payment_id, amount_observed, currency_observed, confirmations
    ) VALUES (
      p_intent_id, p_attempt_id, p_provider, 'fail', 'expired', coalesce(p_evidence, '{}'::jsonb),
      p_external_payment_id, p_amount_observed, p_currency_observed, p_confirmations
    );
    PERFORM deposit.fn_assert_transition('verifying', 'rejected');
    UPDATE deposit.intents SET status = 'rejected' WHERE id = p_intent_id;
    PERFORM deposit.fn_append_event(p_intent_id, 'verification.failed', 'system',
      jsonb_build_object('failure_code', 'expired'));
    RAISE EXCEPTION 'verification_expired';
  END IF;

  IF p_external_payment_id IS NULL OR btrim(p_external_payment_id) = '' THEN
    RAISE EXCEPTION 'external_payment_id_required';
  END IF;

  IF p_amount_observed IS DISTINCT FROM v_intent.amount_expected THEN
    INSERT INTO deposit.verifications (
      intent_id, attempt_id, provider, result, failure_code, evidence,
      external_payment_id, amount_observed, currency_observed, confirmations
    ) VALUES (
      p_intent_id, p_attempt_id, p_provider, 'fail', 'amount_mismatch', coalesce(p_evidence, '{}'::jsonb),
      p_external_payment_id, p_amount_observed, p_currency_observed, p_confirmations
    );
    PERFORM deposit.fn_assert_transition('verifying', 'rejected');
    UPDATE deposit.intents SET status = 'rejected' WHERE id = p_intent_id;
    PERFORM deposit.fn_append_event(p_intent_id, 'verification.failed', 'system',
      jsonb_build_object('failure_code', 'amount_mismatch'));
    RAISE EXCEPTION 'verification_amount_mismatch';
  END IF;

  IF upper(coalesce(p_currency_observed, '')) IS DISTINCT FROM upper(v_intent.currency) THEN
    INSERT INTO deposit.verifications (
      intent_id, attempt_id, provider, result, failure_code, evidence,
      external_payment_id, amount_observed, currency_observed, confirmations
    ) VALUES (
      p_intent_id, p_attempt_id, p_provider, 'fail', 'currency_mismatch', coalesce(p_evidence, '{}'::jsonb),
      p_external_payment_id, p_amount_observed, p_currency_observed, p_confirmations
    );
    PERFORM deposit.fn_assert_transition('verifying', 'rejected');
    UPDATE deposit.intents SET status = 'rejected' WHERE id = p_intent_id;
    PERFORM deposit.fn_append_event(p_intent_id, 'verification.failed', 'system',
      jsonb_build_object('failure_code', 'currency_mismatch'));
    RAISE EXCEPTION 'verification_currency_mismatch';
  END IF;

  v_dest := coalesce(p_destination_observed, '');
  IF v_intent.destination_ref IS NOT NULL
     AND v_dest <> ''
     AND v_dest IS DISTINCT FROM v_intent.destination_ref THEN
    INSERT INTO deposit.verifications (
      intent_id, attempt_id, provider, result, failure_code, evidence,
      external_payment_id, amount_observed, currency_observed, confirmations
    ) VALUES (
      p_intent_id, p_attempt_id, p_provider, 'fail', 'wrong_destination', coalesce(p_evidence, '{}'::jsonb),
      p_external_payment_id, p_amount_observed, p_currency_observed, p_confirmations
    );
    PERFORM deposit.fn_assert_transition('verifying', 'rejected');
    UPDATE deposit.intents SET status = 'rejected' WHERE id = p_intent_id;
    PERFORM deposit.fn_append_event(p_intent_id, 'verification.failed', 'system',
      jsonb_build_object('failure_code', 'wrong_destination'));
    RAISE EXCEPTION 'verification_wrong_destination';
  END IF;

  INSERT INTO deposit.verifications (
    intent_id, attempt_id, provider, result, failure_code, evidence,
    external_payment_id, amount_observed, currency_observed, confirmations
  ) VALUES (
    p_intent_id, p_attempt_id, p_provider, 'pass', NULL, coalesce(p_evidence, '{}'::jsonb),
    p_external_payment_id, p_amount_observed, upper(p_currency_observed), p_confirmations
  )
  RETURNING id INTO v_verification_id;

  PERFORM deposit.fn_assert_transition('verifying', 'confirmed');
  UPDATE deposit.intents SET status = 'confirmed' WHERE id = p_intent_id;

  PERFORM deposit.fn_append_event(p_intent_id, 'verification.passed', 'system',
    jsonb_build_object(
      'verification_id', v_verification_id,
      'external_payment_id', p_external_payment_id
    ));

  RETURN jsonb_build_object(
    'verification_id', v_verification_id,
    'intent_id', p_intent_id,
    'result', 'pass'
  );
EXCEPTION
  WHEN unique_violation THEN
    RAISE EXCEPTION 'verification_duplicate_external_payment'
      USING ERRCODE = '23505';
END;
$$;

CREATE OR REPLACE FUNCTION deposit.fn_fail_verification(
  p_intent_id uuid,
  p_attempt_id uuid,
  p_provider text,
  p_failure_code text,
  p_evidence jsonb DEFAULT '{}'::jsonb,
  p_terminal boolean DEFAULT true
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = deposit, public
AS $$
DECLARE
  v_intent deposit.intents%ROWTYPE;
  v_verification_id uuid;
  v_to deposit.intent_status;
BEGIN
  SELECT * INTO v_intent FROM deposit.intents WHERE id = p_intent_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'intent_not_found'; END IF;

  IF v_intent.status <> 'verifying' THEN
    RAISE EXCEPTION 'deposit_forbidden_transition:%->fail', v_intent.status
      USING ERRCODE = '22023';
  END IF;

  INSERT INTO deposit.verifications (
    intent_id, attempt_id, provider, result, failure_code, evidence
  ) VALUES (
    p_intent_id, p_attempt_id, p_provider, 'fail', p_failure_code, coalesce(p_evidence, '{}'::jsonb)
  )
  RETURNING id INTO v_verification_id;

  IF p_terminal THEN
    v_to := 'rejected';
  ELSE
    v_to := 'observed'; -- soft / retryable
  END IF;

  PERFORM deposit.fn_assert_transition('verifying', v_to);
  UPDATE deposit.intents SET status = v_to WHERE id = p_intent_id;

  PERFORM deposit.fn_append_event(p_intent_id, 'verification.failed', 'system',
    jsonb_build_object(
      'verification_id', v_verification_id,
      'failure_code', p_failure_code,
      'terminal', p_terminal,
      'next_status', v_to
    ));

  RETURN jsonb_build_object(
    'verification_id', v_verification_id,
    'result', 'fail',
    'failure_code', p_failure_code,
    'status', v_to
  );
END;
$$;

CREATE OR REPLACE FUNCTION deposit.fn_expire_intent(p_intent_id uuid)
RETURNS deposit.intents
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = deposit, public
AS $$
DECLARE
  v_row deposit.intents%ROWTYPE;
BEGIN
  SELECT * INTO v_row FROM deposit.intents WHERE id = p_intent_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'intent_not_found'; END IF;

  IF v_row.status IN ('credited', 'rejected', 'failed', 'expired', 'reversed', 'confirmed') THEN
    RAISE EXCEPTION 'deposit_forbidden_transition:%->expired', v_row.status
      USING ERRCODE = '22023';
  END IF;

  -- confirmed should credit or fail — not expire (R06 path is pre-credit)
  PERFORM deposit.fn_assert_transition(v_row.status, 'expired');

  IF v_row.expires_at > now() AND v_row.status NOT IN ('created', 'pending', 'observed') THEN
    RAISE EXCEPTION 'intent_not_expired_yet';
  END IF;

  -- Allow forced expire only when past expires_at for created/pending/observed
  IF v_row.expires_at > now() THEN
    RAISE EXCEPTION 'intent_not_expired_yet';
  END IF;

  UPDATE deposit.intents SET status = 'expired' WHERE id = p_intent_id
  RETURNING * INTO v_row;

  PERFORM deposit.fn_append_event(p_intent_id, 'intent.expired', 'system', '{}'::jsonb);
  RETURN v_row;
END;
$$;

-- ---------------------------------------------------------------------------
-- Credit (one TX with apply_delta)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION deposit.fn_post_credit(p_intent_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = deposit, public, game_finance
AS $$
DECLARE
  v_intent deposit.intents%ROWTYPE;
  v_verif deposit.verifications%ROWTYPE;
  v_credit deposit.credits%ROWTYPE;
  v_key text;
  v_tx_id uuid;
  v_payload_hash text;
BEGIN
  SELECT * INTO v_intent FROM deposit.intents WHERE id = p_intent_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'intent_not_found'; END IF;

  IF v_intent.status = 'credited' THEN
    SELECT * INTO v_credit FROM deposit.credits WHERE intent_id = p_intent_id;
    RETURN jsonb_build_object(
      'credit_id', v_credit.id,
      'ledger_tx_id', v_credit.ledger_tx_id,
      'status', 'posted',
      'replayed', true
    );
  END IF;

  IF v_intent.status <> 'confirmed' THEN
    RAISE EXCEPTION 'deposit_forbidden_transition:%->credited', v_intent.status
      USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_verif
  FROM deposit.verifications
  WHERE intent_id = p_intent_id AND result = 'pass'
  ORDER BY verified_at DESC
  LIMIT 1
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'verification_pass_required';
  END IF;

  v_key := 'deposit:fiat:' || v_verif.provider || ':' || v_verif.external_payment_id;
  IF v_intent.channel = 'fake' THEN
    v_key := 'deposit:fake:' || v_verif.provider || ':' || v_verif.external_payment_id;
  ELSIF v_intent.channel = 'tron_usdt' THEN
    v_key := 'deposit:tron:' || v_verif.external_payment_id;
  ELSIF v_intent.channel = 'manual_adapter' THEN
    v_key := 'deposit:manual:' || p_intent_id::text;
  END IF;

  v_payload_hash := md5(
    v_intent.user_id::text || '|' || v_intent.amount_expected::text || '|' || v_intent.currency
  );

  SELECT * INTO v_credit FROM deposit.credits WHERE intent_id = p_intent_id FOR UPDATE;

  IF FOUND THEN
    IF v_credit.status = 'posted' THEN
      IF v_credit.idempotency_key IS DISTINCT FROM v_key
         OR v_credit.amount IS DISTINCT FROM v_intent.amount_expected
         OR v_credit.currency IS DISTINCT FROM v_intent.currency
         OR v_credit.user_id IS DISTINCT FROM v_intent.user_id THEN
        RAISE EXCEPTION 'idempotency_payload_mismatch'
          USING ERRCODE = '22023';
      END IF;
      RETURN jsonb_build_object(
        'credit_id', v_credit.id,
        'ledger_tx_id', v_credit.ledger_tx_id,
        'status', 'posted',
        'replayed', true
      );
    END IF;

    IF v_credit.idempotency_key IS DISTINCT FROM v_key THEN
      RAISE EXCEPTION 'idempotency_payload_mismatch'
        USING ERRCODE = '22023';
    END IF;
  ELSE
    BEGIN
      INSERT INTO deposit.credits (
        intent_id, verification_id, user_id, amount, currency,
        idempotency_key, status
      ) VALUES (
        p_intent_id, v_verif.id, v_intent.user_id, v_intent.amount_expected,
        v_intent.currency, v_key, 'pending'
      )
      RETURNING * INTO v_credit;
    EXCEPTION
      WHEN unique_violation THEN
        SELECT * INTO v_credit FROM deposit.credits WHERE idempotency_key = v_key;
        IF v_credit.status = 'posted' THEN
          IF v_credit.amount IS DISTINCT FROM v_intent.amount_expected
             OR v_credit.user_id IS DISTINCT FROM v_intent.user_id THEN
            RAISE EXCEPTION 'idempotency_payload_mismatch'
              USING ERRCODE = '22023';
          END IF;
          RETURN jsonb_build_object(
            'credit_id', v_credit.id,
            'ledger_tx_id', v_credit.ledger_tx_id,
            'status', 'posted',
            'replayed', true
          );
        END IF;
        IF v_credit.intent_id IS DISTINCT FROM p_intent_id THEN
          RAISE EXCEPTION 'idempotency_payload_mismatch'
            USING ERRCODE = '22023';
        END IF;
    END;
  END IF;

  -- Wallet mutation ONLY via apply_delta
  v_tx_id := public.fn_wallet_apply_delta(
    v_intent.user_id,
    v_intent.currency,
    v_intent.amount_expected,
    'deposit'::public.transaction_type,
    'deposit_domain',
    p_intent_id::text,
    'Deposit Domain credit',
    jsonb_build_object(
      'intent_id', p_intent_id,
      'verification_id', v_verif.id,
      'external_payment_id', v_verif.external_payment_id,
      'payload_hash', v_payload_hash
    ),
    false,
    v_key
  );

  UPDATE deposit.credits
  SET status = 'posted',
      ledger_tx_id = v_tx_id,
      posted_at = now(),
      error = NULL,
      updated_at = now()
  WHERE id = v_credit.id
  RETURNING * INTO v_credit;

  PERFORM deposit.fn_assert_transition('confirmed', 'credited');
  UPDATE deposit.intents SET status = 'credited' WHERE id = p_intent_id;

  PERFORM deposit.fn_append_event(p_intent_id, 'credit.posted', 'system',
    jsonb_build_object(
      'credit_id', v_credit.id,
      'ledger_tx_id', v_tx_id,
      'idempotency_key', v_key,
      'amount', v_intent.amount_expected
    ));

  RETURN jsonb_build_object(
    'credit_id', v_credit.id,
    'ledger_tx_id', v_tx_id,
    'status', 'posted',
    'replayed', false,
    'idempotency_key', v_key
  );
END;
$$;

-- ---------------------------------------------------------------------------
-- Deposit reconciliation (report only)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION deposit.fn_recon_deposit()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = deposit, public
AS $$
DECLARE
  v_confirmed_uncredited int;
  v_posted_no_ledger int;
  v_dup_payments int;
  v_credited_no_credit int;
  v_mismatch int;
  v_details jsonb := '{}'::jsonb;
  v_status text;
  v_id bigint;
BEGIN
  SELECT count(*) INTO v_confirmed_uncredited
  FROM deposit.intents WHERE status = 'confirmed';

  SELECT count(*) INTO v_posted_no_ledger
  FROM deposit.credits
  WHERE status = 'posted' AND ledger_tx_id IS NULL;

  SELECT count(*) INTO v_dup_payments
  FROM (
    SELECT provider, external_payment_id
    FROM deposit.verifications
    WHERE result = 'pass' AND external_payment_id IS NOT NULL
    GROUP BY provider, external_payment_id
    HAVING count(*) > 1
  ) d;

  SELECT count(*) INTO v_credited_no_credit
  FROM deposit.intents i
  WHERE i.status = 'credited'
    AND NOT EXISTS (
      SELECT 1 FROM deposit.credits c
      WHERE c.intent_id = i.id AND c.status = 'posted'
    );

  SELECT count(*) INTO v_mismatch
  FROM deposit.credits c
  JOIN public.transactions t ON t.id = c.ledger_tx_id
  WHERE c.status = 'posted'
    AND (
      t.source_kind IS DISTINCT FROM 'deposit_domain'
      OR abs(t.amount - c.amount) > 0.009
      OR t.user_id IS DISTINCT FROM c.user_id
      OR upper(t.currency) IS DISTINCT FROM upper(c.currency)
    );

  v_details := jsonb_build_object(
    'confirmed_not_credited', v_confirmed_uncredited,
    'posted_credit_without_ledger_tx_id', v_posted_no_ledger,
    'duplicate_external_payment_ids', v_dup_payments,
    'credited_intent_without_posted_credit', v_credited_no_credit,
    'deposit_credit_vs_ledger_mismatch', v_mismatch
  );

  v_status := CASE
    WHEN v_confirmed_uncredited = 0
     AND v_posted_no_ledger = 0
     AND v_dup_payments = 0
     AND v_credited_no_credit = 0
     AND v_mismatch = 0 THEN 'ok'
    ELSE 'drift'
  END;

  INSERT INTO deposit.recon_reports (status, summary, details)
  VALUES (
    v_status,
    jsonb_build_object('ok', v_status = 'ok'),
    v_details
  )
  RETURNING id INTO v_id;

  RETURN jsonb_build_object(
    'report_id', v_id,
    'status', v_status,
    'details', v_details
  );
END;
$$;

-- ---------------------------------------------------------------------------
-- ACL on functions
-- ---------------------------------------------------------------------------
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA deposit FROM PUBLIC;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA deposit FROM anon, authenticated;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA deposit TO postgres, service_role;

-- Public wrappers for PostgREST (service_role only)
CREATE OR REPLACE FUNCTION public.fn_deposit_create_intent(
  p_user_id uuid, p_channel text, p_provider text, p_amount_expected numeric,
  p_currency text, p_expires_at timestamptz, p_destination_ref text DEFAULT NULL,
  p_metadata jsonb DEFAULT '{}'::jsonb, p_created_by text DEFAULT 'system',
  p_created_by_actor_id uuid DEFAULT NULL, p_provider_intent_ref text DEFAULT NULL
) RETURNS uuid
LANGUAGE sql SECURITY DEFINER SET search_path = deposit, public
AS $$
  SELECT deposit.fn_create_intent(
    p_user_id, p_channel, p_provider, p_amount_expected, p_currency, p_expires_at,
    p_destination_ref, p_metadata, p_created_by, p_created_by_actor_id, p_provider_intent_ref
  );
$$;

CREATE OR REPLACE FUNCTION public.fn_deposit_post_credit(p_intent_id uuid)
RETURNS jsonb
LANGUAGE sql SECURITY DEFINER SET search_path = deposit, public
AS $$ SELECT deposit.fn_post_credit(p_intent_id); $$;

CREATE OR REPLACE FUNCTION public.fn_deposit_get_intent_status(p_intent_id uuid)
RETURNS jsonb
LANGUAGE sql SECURITY DEFINER SET search_path = deposit, public
AS $$ SELECT deposit.fn_get_intent_status(p_intent_id); $$;

CREATE OR REPLACE FUNCTION public.fn_deposit_recon()
RETURNS jsonb
LANGUAGE sql SECURITY DEFINER SET search_path = deposit, public
AS $$ SELECT deposit.fn_recon_deposit(); $$;

REVOKE ALL ON FUNCTION public.fn_deposit_create_intent(uuid, text, text, numeric, text, timestamptz, text, jsonb, text, uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.fn_deposit_post_credit(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.fn_deposit_get_intent_status(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.fn_deposit_recon() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fn_deposit_create_intent(uuid, text, text, numeric, text, timestamptz, text, jsonb, text, uuid, text) TO postgres, service_role;
GRANT EXECUTE ON FUNCTION public.fn_deposit_post_credit(uuid) TO postgres, service_role;
GRANT EXECUTE ON FUNCTION public.fn_deposit_get_intent_status(uuid) TO postgres, service_role;
GRANT EXECUTE ON FUNCTION public.fn_deposit_recon() TO postgres, service_role;

COMMIT;
