--
-- WinWay / DingMoney — schema baseline (schema-only)
-- Source: Supabase develop yqnptpreowkimopxicfz (PostgreSQL 17.6)
-- Captured: 2026-08-11
-- Regenerated via: scripts/db-dump-baseline.ps1
-- Apply order: 000_extensions.sql → 001_schema.sql
-- Target: empty Supabase Postgres (auth/storage already present)
--
-- PostgreSQL database dump
--

-- Dumped from database version 17.6
-- Dumped by pg_dump version 17.10 (Ubuntu 17.10-1.pgdg22.04+1)

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
-- SET transaction_timeout = 0; -- PG17+ only; commented for broader psql compatibility
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: deposit; Type: SCHEMA; Schema: -; Owner: -
--

CREATE SCHEMA IF NOT EXISTS "deposit";


--
-- Name: SCHEMA "deposit"; Type: COMMENT; Schema: -; Owner: -
--

COMMENT ON SCHEMA "deposit" IS 'P6.5 Deposit Domain — payment intents, verification, exactly-once credit authorization';


--
-- Name: game_admin; Type: SCHEMA; Schema: -; Owner: -
--

CREATE SCHEMA IF NOT EXISTS "game_admin";


--
-- Name: game_archive; Type: SCHEMA; Schema: -; Owner: -
--

CREATE SCHEMA IF NOT EXISTS "game_archive";


--
-- Name: game_core; Type: SCHEMA; Schema: -; Owner: -
--

CREATE SCHEMA IF NOT EXISTS "game_core";


--
-- Name: game_finance; Type: SCHEMA; Schema: -; Owner: -
--

CREATE SCHEMA IF NOT EXISTS "game_finance";


--
-- Name: game_pool; Type: SCHEMA; Schema: -; Owner: -
--

CREATE SCHEMA IF NOT EXISTS "game_pool";


--
-- Name: game_ticket; Type: SCHEMA; Schema: -; Owner: -
--

CREATE SCHEMA IF NOT EXISTS "game_ticket";


--
-- Name: game_trash; Type: SCHEMA; Schema: -; Owner: -
--

CREATE SCHEMA IF NOT EXISTS "game_trash";


--
-- Name: load_test; Type: SCHEMA; Schema: -; Owner: -
--

CREATE SCHEMA IF NOT EXISTS "load_test";


--
-- Name: monitor; Type: SCHEMA; Schema: -; Owner: -
--

CREATE SCHEMA IF NOT EXISTS "monitor";


--
-- Name: platform; Type: SCHEMA; Schema: -; Owner: -
--

CREATE SCHEMA IF NOT EXISTS "platform";


--
-- Name: SCHEMA "platform"; Type: COMMENT; Schema: -; Owner: -
--

COMMENT ON SCHEMA "platform" IS 'Ding Platform Core — engine-agnostic games, sessions, settlement envelopes. No Bingo/Backgammon rules.';


--
-- Name: public; Type: SCHEMA; Schema: -; Owner: -
--

CREATE SCHEMA IF NOT EXISTS "public";


--
-- Name: SCHEMA "public"; Type: COMMENT; Schema: -; Owner: -
--

COMMENT ON SCHEMA "public" IS 'standard public schema';


--
-- Name: tournament; Type: SCHEMA; Schema: -; Owner: -
--

CREATE SCHEMA IF NOT EXISTS "tournament";


--
-- Name: attempt_parse_status; Type: TYPE; Schema: deposit; Owner: -
--

CREATE TYPE "deposit"."attempt_parse_status" AS ENUM (
    'accepted',
    'malformed',
    'unauthorized'
);


--
-- Name: credit_status; Type: TYPE; Schema: deposit; Owner: -
--

CREATE TYPE "deposit"."credit_status" AS ENUM (
    'pending',
    'posted',
    'failed'
);


--
-- Name: crypto_tx_network; Type: TYPE; Schema: deposit; Owner: -
--

CREATE TYPE "deposit"."crypto_tx_network" AS ENUM (
    'BEP20',
    'TRC20'
);


--
-- Name: crypto_tx_status; Type: TYPE; Schema: deposit; Owner: -
--

CREATE TYPE "deposit"."crypto_tx_status" AS ENUM (
    'PENDING',
    'CONFIRMED',
    'FAILED',
    'SWEPT'
);


--
-- Name: intent_status; Type: TYPE; Schema: deposit; Owner: -
--

CREATE TYPE "deposit"."intent_status" AS ENUM (
    'created',
    'pending',
    'observed',
    'verifying',
    'confirmed',
    'credited',
    'failed',
    'expired',
    'rejected',
    'reversed'
);


--
-- Name: verification_result; Type: TYPE; Schema: deposit; Owner: -
--

CREATE TYPE "deposit"."verification_result" AS ENUM (
    'pass',
    'fail'
);


--
-- Name: admin_sub_role; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE "public"."admin_sub_role" AS ENUM (
    'finance',
    'support',
    'room',
    'dev_panel'
);


--
-- Name: dev_schedule_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE "public"."dev_schedule_status" AS ENUM (
    'draft',
    'approved',
    'processing',
    'done',
    'failed',
    'cancelled'
);


--
-- Name: reservation_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE "public"."reservation_status" AS ENUM (
    'held',
    'confirmed',
    'released',
    'cancelled',
    'reserved',
    'consumed',
    'expired'
);


--
-- Name: room_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE "public"."room_status" AS ENUM (
    'idle',
    'live',
    'finished',
    'cancelled',
    'waiting',
    'playing',
    'settling'
);


--
-- Name: room_template_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE "public"."room_template_status" AS ENUM (
    'active',
    'draining',
    'inactive'
);


--
-- Name: room_type; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE "public"."room_type" AS ENUM (
    'normal',
    'tournament'
);


--
-- Name: tournament_entry_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE "public"."tournament_entry_status" AS ENUM (
    'created',
    'cancelled',
    'settled'
);


--
-- Name: tournament_remainder_policy; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE "public"."tournament_remainder_policy" AS ENUM (
    'adaptive_tables',
    'uniform_with_bye',
    'uniform_with_ghost'
);


--
-- Name: tournament_round_room_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE "public"."tournament_round_room_status" AS ENUM (
    'created',
    'running',
    'finished'
);


--
-- Name: tournament_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE "public"."tournament_status" AS ENUM (
    'draft',
    'registration_open',
    'running',
    'settling',
    'finished',
    'cancelled'
);


--
-- Name: tournament_table_size_mode; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE "public"."tournament_table_size_mode" AS ENUM (
    'fixed',
    'range'
);


--
-- Name: transaction_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE "public"."transaction_status" AS ENUM (
    'pending',
    'completed',
    'failed',
    'cancelled',
    'settled'
);


--
-- Name: transaction_type; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE "public"."transaction_type" AS ENUM (
    'deposit',
    'withdraw',
    'bet',
    'win',
    'refund',
    'adjustment',
    'join',
    'fee_admin',
    'fee_agent',
    'fee_super',
    'join_hold',
    'join_refund',
    'join_capture',
    'transfer_in',
    'transfer_out'
);


--
-- Name: user_role; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE "public"."user_role" AS ENUM (
    'admin',
    'super',
    'agent',
    'player'
);


--
-- Name: user_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE "public"."user_status" AS ENUM (
    'active',
    'suspended',
    'deleted'
);


--
-- Name: withdrawal_request_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE "public"."withdrawal_request_status" AS ENUM (
    'pending',
    'approved',
    'rejected',
    'cancelled'
);


--
-- Name: lock_status; Type: TYPE; Schema: tournament; Owner: -
--

CREATE TYPE "tournament"."lock_status" AS ENUM (
    'held',
    'released',
    'captured'
);


SET default_tablespace = '';

SET default_table_access_method = "heap";

--
-- Name: intents; Type: TABLE; Schema: deposit; Owner: -
--

CREATE TABLE "deposit"."intents" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "channel" "text" NOT NULL,
    "provider" "text" NOT NULL,
    "amount_expected" numeric NOT NULL,
    "currency" "text" NOT NULL,
    "status" "deposit"."intent_status" DEFAULT 'created'::"deposit"."intent_status" NOT NULL,
    "expires_at" timestamp with time zone NOT NULL,
    "destination_ref" "text",
    "metadata" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_by" "text" DEFAULT 'system'::"text" NOT NULL,
    "created_by_actor_id" "uuid",
    "provider_intent_ref" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "environment" "text",
    "payment_url" "text",
    "merchant_order_id" "text",
    CONSTRAINT "deposit_intents_environment_check" CHECK ((("environment" IS NULL) OR ("environment" = ANY (ARRAY['development'::"text", 'production'::"text"])))),
    CONSTRAINT "intents_amount_expected_check" CHECK (("amount_expected" > (0)::numeric)),
    CONSTRAINT "intents_channel_check" CHECK (("channel" = ANY (ARRAY['fiat_gateway'::"text", 'tron_usdt'::"text", 'manual_adapter'::"text", 'fake'::"text"])))
);

ALTER TABLE ONLY "deposit"."intents" FORCE ROW LEVEL SECURITY;


--
-- Name: COLUMN "intents"."environment"; Type: COMMENT; Schema: deposit; Owner: -
--

COMMENT ON COLUMN "deposit"."intents"."environment" IS 'HamiPay / gateway environment isolation: development|production';


--
-- Name: COLUMN "intents"."payment_url"; Type: COMMENT; Schema: deposit; Owner: -
--

COMMENT ON COLUMN "deposit"."intents"."payment_url" IS 'Provider checkout URL; never treat as proof of payment';


--
-- Name: COLUMN "intents"."merchant_order_id"; Type: COMMENT; Schema: deposit; Owner: -
--

COMMENT ON COLUMN "deposit"."intents"."merchant_order_id" IS 'Merchant order id sent to provider (usually intent id)';


--
-- Name: fn_activate_intent("uuid", "text"); Type: FUNCTION; Schema: deposit; Owner: -
--

CREATE FUNCTION "deposit"."fn_activate_intent"("p_intent_id" "uuid", "p_destination_ref" "text" DEFAULT NULL::"text") RETURNS "deposit"."intents"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'deposit', 'public'
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


--
-- Name: fn_append_event("uuid", "text", "text", "jsonb"); Type: FUNCTION; Schema: deposit; Owner: -
--

CREATE FUNCTION "deposit"."fn_append_event"("p_intent_id" "uuid", "p_event_type" "text", "p_actor" "text", "p_payload" "jsonb" DEFAULT '{}'::"jsonb") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'deposit', 'public'
    AS $$
BEGIN
  INSERT INTO deposit.events (intent_id, event_type, actor, payload)
  VALUES (p_intent_id, p_event_type, p_actor, coalesce(p_payload, '{}'::jsonb));
END;
$$;


--
-- Name: fn_assert_transition("deposit"."intent_status", "deposit"."intent_status"); Type: FUNCTION; Schema: deposit; Owner: -
--

CREATE FUNCTION "deposit"."fn_assert_transition"("p_from" "deposit"."intent_status", "p_to" "deposit"."intent_status") RETURNS "void"
    LANGUAGE "plpgsql" IMMUTABLE
    AS $$
BEGIN
  IF NOT (
    (p_from = 'created' AND p_to IN ('pending', 'expired', 'failed'))
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


--
-- Name: fn_begin_verification("uuid"); Type: FUNCTION; Schema: deposit; Owner: -
--

CREATE FUNCTION "deposit"."fn_begin_verification"("p_intent_id" "uuid") RETURNS "deposit"."intents"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'deposit', 'public'
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


--
-- Name: fn_create_intent("uuid", "text", "text", numeric, "text", timestamp with time zone, "text", "jsonb", "text", "uuid", "text"); Type: FUNCTION; Schema: deposit; Owner: -
--

CREATE FUNCTION "deposit"."fn_create_intent"("p_user_id" "uuid", "p_channel" "text", "p_provider" "text", "p_amount_expected" numeric, "p_currency" "text", "p_expires_at" timestamp with time zone, "p_destination_ref" "text" DEFAULT NULL::"text", "p_metadata" "jsonb" DEFAULT '{}'::"jsonb", "p_created_by" "text" DEFAULT 'system'::"text", "p_created_by_actor_id" "uuid" DEFAULT NULL::"uuid", "p_provider_intent_ref" "text" DEFAULT NULL::"text") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'deposit', 'public'
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


--
-- Name: fn_expire_intent("uuid"); Type: FUNCTION; Schema: deposit; Owner: -
--

CREATE FUNCTION "deposit"."fn_expire_intent"("p_intent_id" "uuid") RETURNS "deposit"."intents"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'deposit', 'public'
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


--
-- Name: fn_fail_verification("uuid", "uuid", "text", "text", "jsonb", boolean); Type: FUNCTION; Schema: deposit; Owner: -
--

CREATE FUNCTION "deposit"."fn_fail_verification"("p_intent_id" "uuid", "p_attempt_id" "uuid", "p_provider" "text", "p_failure_code" "text", "p_evidence" "jsonb" DEFAULT '{}'::"jsonb", "p_terminal" boolean DEFAULT true) RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'deposit', 'public'
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


--
-- Name: fn_get_intent_status("uuid"); Type: FUNCTION; Schema: deposit; Owner: -
--

CREATE FUNCTION "deposit"."fn_get_intent_status"("p_intent_id" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'deposit', 'public'
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


--
-- Name: fn_mark_create_failed("uuid", "text"); Type: FUNCTION; Schema: deposit; Owner: -
--

CREATE FUNCTION "deposit"."fn_mark_create_failed"("p_intent_id" "uuid", "p_error" "text" DEFAULT 'failed_to_create'::"text") RETURNS "deposit"."intents"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'deposit', 'public'
    AS $$
DECLARE
  v_row deposit.intents%ROWTYPE;
BEGIN
  SELECT * INTO v_row FROM deposit.intents WHERE id = p_intent_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'intent_not_found'; END IF;

  IF v_row.status = 'failed' THEN
    RETURN v_row;
  END IF;

  IF v_row.status <> 'created' THEN
    RAISE EXCEPTION 'deposit_forbidden_transition:%->failed', v_row.status
      USING ERRCODE = '22023';
  END IF;

  PERFORM deposit.fn_assert_transition(v_row.status, 'failed');

  UPDATE deposit.intents
  SET status = 'failed',
      metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
        'create_failed', true,
        'create_error', left(coalesce(p_error, 'failed_to_create'), 500)
      )
  WHERE id = p_intent_id
  RETURNING * INTO v_row;

  PERFORM deposit.fn_append_event(
    p_intent_id,
    'intent.create_failed',
    'system',
    jsonb_build_object('error', left(coalesce(p_error, 'failed_to_create'), 500))
  );

  RETURN v_row;
END;
$$;


--
-- Name: fn_pass_verification("uuid", "uuid", "text", "text", numeric, "text", "jsonb", integer, "text"); Type: FUNCTION; Schema: deposit; Owner: -
--

CREATE FUNCTION "deposit"."fn_pass_verification"("p_intent_id" "uuid", "p_attempt_id" "uuid", "p_provider" "text", "p_external_payment_id" "text", "p_amount_observed" numeric, "p_currency_observed" "text", "p_evidence" "jsonb" DEFAULT '{}'::"jsonb", "p_confirmations" integer DEFAULT NULL::integer, "p_destination_observed" "text" DEFAULT NULL::"text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'deposit', 'public'
    AS $$
DECLARE
  v_intent deposit.intents%ROWTYPE;
  v_verification_id uuid;
  v_dest text;
  v_fail_code text;
BEGIN
  SELECT * INTO v_intent FROM deposit.intents WHERE id = p_intent_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'intent_not_found'; END IF;

  IF v_intent.status <> 'verifying' THEN
    RAISE EXCEPTION 'deposit_forbidden_transition:%->confirmed', v_intent.status
      USING ERRCODE = '22023';
  END IF;

  IF p_external_payment_id IS NULL OR btrim(p_external_payment_id) = '' THEN
    RAISE EXCEPTION 'external_payment_id_required';
  END IF;

  v_fail_code := NULL;
  IF v_intent.expires_at <= now() THEN
    v_fail_code := 'expired';
  ELSIF p_amount_observed IS DISTINCT FROM v_intent.amount_expected THEN
    v_fail_code := 'amount_mismatch';
  ELSIF upper(coalesce(p_currency_observed, '')) IS DISTINCT FROM upper(v_intent.currency) THEN
    v_fail_code := 'currency_mismatch';
  ELSE
    v_dest := coalesce(p_destination_observed, '');
    IF v_intent.destination_ref IS NOT NULL
       AND v_dest <> ''
       AND v_dest IS DISTINCT FROM v_intent.destination_ref THEN
      v_fail_code := 'wrong_destination';
    END IF;
  END IF;

  IF v_fail_code IS NOT NULL THEN
    INSERT INTO deposit.verifications (
      intent_id, attempt_id, provider, result, failure_code, evidence,
      external_payment_id, amount_observed, currency_observed, confirmations
    ) VALUES (
      p_intent_id, p_attempt_id, p_provider, 'fail', v_fail_code, coalesce(p_evidence, '{}'::jsonb),
      p_external_payment_id, p_amount_observed, p_currency_observed, p_confirmations
    )
    RETURNING id INTO v_verification_id;

    PERFORM deposit.fn_assert_transition('verifying', 'rejected');
    UPDATE deposit.intents SET status = 'rejected' WHERE id = p_intent_id;
    PERFORM deposit.fn_append_event(p_intent_id, 'verification.failed', 'system',
      jsonb_build_object('failure_code', v_fail_code, 'verification_id', v_verification_id));

    RETURN jsonb_build_object(
      'verification_id', v_verification_id,
      'intent_id', p_intent_id,
      'result', 'fail',
      'failure_code', v_fail_code
    );
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


--
-- Name: fn_post_credit("uuid"); Type: FUNCTION; Schema: deposit; Owner: -
--

CREATE FUNCTION "deposit"."fn_post_credit"("p_intent_id" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'deposit', 'public', 'game_finance'
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


--
-- Name: fn_recon_deposit(); Type: FUNCTION; Schema: deposit; Owner: -
--

CREATE FUNCTION "deposit"."fn_recon_deposit"() RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'deposit', 'public'
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


--
-- Name: fn_record_attempt("uuid", "text", "text", "text", "deposit"."attempt_parse_status", "text", "jsonb", timestamp with time zone); Type: FUNCTION; Schema: deposit; Owner: -
--

CREATE FUNCTION "deposit"."fn_record_attempt"("p_intent_id" "uuid", "p_provider" "text", "p_external_event_id" "text", "p_payload_hash" "text", "p_parse_status" "deposit"."attempt_parse_status", "p_payload_ref" "text" DEFAULT NULL::"text", "p_headers_meta" "jsonb" DEFAULT '{}'::"jsonb", "p_observed_at" timestamp with time zone DEFAULT "now"()) RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'deposit', 'public'
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


--
-- Name: tg_crypto_rate_tiers_updated_at(); Type: FUNCTION; Schema: deposit; Owner: -
--

CREATE FUNCTION "deposit"."tg_crypto_rate_tiers_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;


--
-- Name: tg_crypto_transactions_updated_at(); Type: FUNCTION; Schema: deposit; Owner: -
--

CREATE FUNCTION "deposit"."tg_crypto_transactions_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;


--
-- Name: trg_credits_guard(); Type: FUNCTION; Schema: deposit; Owner: -
--

CREATE FUNCTION "deposit"."trg_credits_guard"() RETURNS "trigger"
    LANGUAGE "plpgsql"
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


--
-- Name: trg_forbid_mutation(); Type: FUNCTION; Schema: deposit; Owner: -
--

CREATE FUNCTION "deposit"."trg_forbid_mutation"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  RAISE EXCEPTION 'deposit_append_only_violation'
    USING ERRCODE = '55000';
END;
$$;


--
-- Name: trg_intents_immutable_core(); Type: FUNCTION; Schema: deposit; Owner: -
--

CREATE FUNCTION "deposit"."trg_intents_immutable_core"() RETURNS "trigger"
    LANGUAGE "plpgsql"
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


--
-- Name: api_get_room_state("uuid"); Type: FUNCTION; Schema: game_core; Owner: -
--

CREATE FUNCTION "game_core"."api_get_room_state"("p_room_id" "uuid") RETURNS "jsonb"
    LANGUAGE "sql" STABLE
    AS $$
  SELECT jsonb_build_object(
    -- 🏠 اطلاعات روم
    'room', jsonb_build_object(
      'id', r.id,
      'room_code', r.room_code,
      'title', r.title,
      'status', r.status,
      'card_price', r.card_price,
      'currency', r.currency,
      'max_players', r.max_players,
      -- max_cards_per_player: ابتدا از rooms، اگر نبود از room_templates
      'max_cards_per_player', COALESCE(r.max_cards_per_player, rt.max_cards_per_player, 0),
      'seed', r.seed,
      'ding_per_number', r.ding_per_number,
      'starts_at', r.starts_at,
      'ends_at', r.ends_at,
      'meta', COALESCE(r.meta, '{}'::jsonb)
    ),

    -- 🎴 تیکت‌های این روم
    'tickets', (
      SELECT COALESCE(
        jsonb_agg(
          jsonb_build_object(
            'ticket_id', t.id,
            'player_user_id', t.player_user_id,
            'card_no', t.card_no,
            'pool_card_id', t.pool_card_id,
            'reservation_status', t.reservation_status,
            'transaction_id', t.transaction_id,
            'expires_at', t.expires_at,
            'claimed_bingo_at', t.claimed_bingo_at,
            'is_verified_win', t.is_verified_win,
            'created_at', t.created_at
          )
          ORDER BY t.card_no
        ),
        '[]'::jsonb
      )
      FROM public.tickets t
      WHERE t.room_id = r.id
    ),

    -- 🎯 قرعه‌های این روم
    'draws', (
      SELECT COALESCE(
        jsonb_agg(
          jsonb_build_object(
            'id', d.id,
            'number', d.number,
            'timestamp', d."timestamp",
            'created_at', d.created_at
          )
          ORDER BY d.created_at
        ),
        '[]'::jsonb
      )
      FROM public.draws d
      WHERE d.room_id = r.id
    )
  )
  FROM public.rooms r
  LEFT JOIN public.room_templates rt ON rt.id = r.room_template_id
  WHERE r.id = p_room_id;
$$;


--
-- Name: fn_cancel_waiting_room_single("uuid", "uuid", "text", boolean, timestamp with time zone); Type: FUNCTION; Schema: game_core; Owner: -
--

CREATE FUNCTION "game_core"."fn_cancel_waiting_room_single"("p_room" "uuid", "p_actor" "uuid", "p_reason" "text", "p_require_single_player" boolean, "p_now" timestamp with time zone) RETURNS integer
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
  v_room record;
  v_ticket record;
  v_cancelled integer := 0;
  v_ticket_count integer := 0;
  c_cancelable constant public.reservation_status[] := ARRAY['held'::public.reservation_status,'reserved'::public.reservation_status,'confirmed'::public.reservation_status];
BEGIN
  IF p_room IS NULL THEN
    RAISE EXCEPTION 'room id is required';
  END IF;

  SELECT *
    INTO v_room
  FROM public.rooms
  WHERE id = p_room
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'room % not found', p_room;
  END IF;

  IF v_room.status = 'cancelled'::public.room_status THEN
    RAISE NOTICE 'room % already cancelled; skipping', p_room;
    RETURN 0;
  END IF;

  IF v_room.status <> 'waiting'::public.room_status THEN
    RAISE EXCEPTION 'room % is not cancellable (status=%)', p_room, v_room.status;
  END IF;

  IF v_room.starts_at IS NOT NULL AND v_room.starts_at <= p_now THEN
    RAISE EXCEPTION 'room % is already live (starts_at passed)', p_room;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.tickets
    WHERE room_id = p_room
      AND reservation_status = 'consumed'::public.reservation_status
  ) THEN
    RAISE EXCEPTION 'room % is already live (consumed tickets exist)', p_room;
  END IF;

  IF p_require_single_player THEN
    IF p_actor IS NULL THEN
      RAISE EXCEPTION 'unauthorized';
    END IF;

    IF EXISTS (
      SELECT 1
      FROM public.tickets
      WHERE room_id = p_room
        AND reservation_status = ANY(c_cancelable)
        AND player_user_id <> p_actor
    ) THEN
      RAISE EXCEPTION 'cannot cancel room %: other players have tickets', p_room;
    END IF;
  END IF;

  FOR v_ticket IN
    SELECT id
    FROM public.tickets
    WHERE room_id = p_room
      AND reservation_status = ANY(c_cancelable)
    FOR UPDATE
  LOOP
    PERFORM game_finance.fn_wallet_release_join(v_ticket.id);
    v_ticket_count := v_ticket_count + 1;
  END LOOP;

  UPDATE public.tickets
     SET reservation_status = 'cancelled'::public.reservation_status,
         cancelled_at = p_now,
         updated_at = p_now
   WHERE room_id = p_room
     AND reservation_status = ANY(c_cancelable);

  UPDATE public.rooms
     SET status = 'cancelled'::public.room_status,
         starts_at = NULL,
         ends_at = COALESCE(ends_at, p_now),
         cancelled_at = p_now,
         cancelled_by = p_actor,
         cancelled_reason = p_reason,
         updated_at = p_now
   WHERE id = p_room;

  RAISE NOTICE 'room % cancelled (% tickets) reason=% actor=%',
    p_room, v_ticket_count, p_reason, COALESCE(p_actor::text, 'anon');

  v_cancelled := 1;
  RETURN v_cancelled;
END;
$$;


--
-- Name: fn_cancel_waiting_rooms("uuid", boolean); Type: FUNCTION; Schema: game_core; Owner: -
--

CREATE FUNCTION "game_core"."fn_cancel_waiting_rooms"("p_room" "uuid" DEFAULT NULL::"uuid", "p_by_admin" boolean DEFAULT false) RETURNS integer
    LANGUAGE "plpgsql"
    AS $$DECLARE
  v_user            uuid := auth.uid();
  v_now             timestamptz := now();
  v_cancelled_rooms int := 0;

  -- برای loop روی روم‌ها
  r_room RECORD;

  -- برای بازپرداخت هر پلیر
  r_pay RECORD;
  v_wallet_id uuid;
  v_refund    numeric;
BEGIN
  IF p_by_admin IS FALSE THEN
    -- حالت «لغو توسط تنها بازیکن حاضر»
    IF v_user IS NULL THEN
      RAISE EXCEPTION 'unauthorized';
    END IF;

    -- روم را قفل کن و اعتبارسنجی وضعیت
    SELECT id, status, card_price, currency, starts_at
      INTO r_room
    FROM public.rooms
    WHERE id = p_room
    FOR UPDATE;

    IF r_room.id IS NULL THEN
      RAISE EXCEPTION 'room not found';
    END IF;

    IF r_room.status <> 'waiting'::room_status THEN
      RAISE EXCEPTION 'room is not in waiting status';
    END IF;

    -- اگر موعد شروع گذشته یا اتاق عملاً شروع‌شده تلقی می‌شود، اجازه لغو نده
    IF r_room.starts_at IS NOT NULL AND r_room.starts_at <= v_now THEN
      RAISE EXCEPTION 'room already due to start';
    END IF;

    -- فقط وقتی اجازه لغو بده که هیچ بازیکن دیگری حاضر نباشد
    -- (یعنی تمام تیکت‌های reserved فقط متعلق به همین کاربر باشد)
    IF EXISTS (
      SELECT 1
        FROM public.tickets t
       WHERE t.room_id = r_room.id
         AND t.reservation_status IN ('reserved')
         AND t.player_user_id <> v_user
    ) THEN
      RAISE EXCEPTION 'cannot cancel: other players present';
    END IF;

    -- بازپرداخت pend برای خودِ کاربر (اگر رزروی دارد)
    FOR r_pay IN
      SELECT t.player_user_id AS uid, COUNT(*) AS cnt
        FROM public.tickets t
       WHERE t.room_id = r_room.id
         AND t.reservation_status = 'reserved'
       GROUP BY t.player_user_id
    LOOP
      -- فقط کاربر جاری باید باشد؛ اگر نبود، امنیتاً رد کن
      IF r_pay.uid <> v_user THEN
        RAISE EXCEPTION 'cannot cancel: other players present';
      END IF;

      v_refund := r_room.card_price * r_pay.cnt;

      SELECT id INTO v_wallet_id FROM public.wallets
       WHERE user_id = r_pay.uid
       FOR UPDATE;

      IF v_wallet_id IS NULL THEN
        RAISE EXCEPTION 'wallet not found for player %', r_pay.uid;
      END IF;

      -- تراکنش refund (status = completed)
      INSERT INTO public.transactions(
        id, wallet_id, user_id, type, status, amount, currency,
        description, related_room, balance_before, balance_after, created_at
      )
      SELECT gen_random_uuid(), v_wallet_id, r_pay.uid, 'refund', 'completed',
             v_refund, r_room.currency,
             'self-cancel waiting room '||r_room.id, r_room.id,
             w.balance, w.balance + v_refund, v_now
        FROM public.wallets w
       WHERE w.id = v_wallet_id;

      -- بازگرداندن pend: locked_amount -= refund و balance += refund
      UPDATE public.wallets
         SET locked_amount = GREATEST(locked_amount - v_refund, 0),
             balance       = balance + v_refund,
             updated_at    = v_now
       WHERE id = v_wallet_id;
    END LOOP;

    -- تیکت‌های reserved → cancelled
    UPDATE public.tickets
       SET reservation_status = 'cancelled',
           updated_at = v_now
     WHERE room_id = r_room.id
       AND reservation_status = 'reserved';

    -- وضعیت روم → cancelled
    UPDATE public.rooms
       SET status = 'cancelled',
           starts_at = NULL,
           updated_at = v_now
     WHERE id = r_room.id;

    v_cancelled_rooms := v_cancelled_rooms + 1;

  ELSE
    -- حالت «لغو سراسری توسط ادمین» روی همه‌ی روم‌های waiting
    FOR r_room IN
      SELECT id, card_price, currency
        FROM public.rooms
       WHERE status = 'waiting'::room_status
       FOR UPDATE SKIP LOCKED
    LOOP
      -- بازپرداخت pend برای همه‌ی بازیکنان این روم
      FOR r_pay IN
        SELECT t.player_user_id AS uid, COUNT(*) AS cnt
          FROM public.tickets t
         WHERE t.room_id = r_room.id
           AND t.reservation_status = 'reserved'
         GROUP BY t.player_user_id
      LOOP
        v_refund := r_room.card_price * r_pay.cnt;

        SELECT id INTO v_wallet_id FROM public.wallets
         WHERE user_id = r_pay.uid
         FOR UPDATE;

        IF v_wallet_id IS NULL THEN
          -- اگر والتی پیدا نشد، از روی اصل جلوگیری نمی‌کنیم؛ اما گزارش/لاگ ضروری است
          CONTINUE;
        END IF;

        INSERT INTO public.transactions(
          id, wallet_id, user_id, type, status, amount, currency,
          description, related_room, balance_before, balance_after, created_at
        )
        SELECT gen_random_uuid(), v_wallet_id, r_pay.uid, 'refund', 'completed',
               v_refund, r_room.currency,
               'admin-cancel waiting room '||r_room.id, r_room.id,
               w.balance, w.balance + v_refund, v_now
          FROM public.wallets w
         WHERE w.id = v_wallet_id;

        UPDATE public.wallets
           SET locked_amount = GREATEST(locked_amount - v_refund, 0),
               balance       = balance + v_refund,
               updated_at    = v_now
         WHERE id = v_wallet_id;
      END LOOP;

      UPDATE public.tickets
         SET reservation_status = 'cancelled',
             updated_at = v_now
       WHERE room_id = r_room.id
         AND reservation_status = 'reserved';

      UPDATE public.rooms
         SET status = 'cancelled',
             starts_at = NULL,
             updated_at = v_now
       WHERE id = r_room.id;

      v_cancelled_rooms := v_cancelled_rooms + 1;
    END LOOP;
  END IF;

  RETURN v_cancelled_rooms;
END;$$;


--
-- Name: FUNCTION "fn_cancel_waiting_rooms"("p_room" "uuid", "p_by_admin" boolean); Type: COMMENT; Schema: game_core; Owner: -
--

COMMENT ON FUNCTION "game_core"."fn_cancel_waiting_rooms"("p_room" "uuid", "p_by_admin" boolean) IS 'Cancels waiting rooms. If p_by_admin=false, allows self-cancel only when the caller is the sole reserving player in the room p_room.
If p_by_admin=true, cancels all waiting rooms. For each affected room, refunds pending amounts (locked -> balance), 
marks reserved tickets as cancelled, and sets room status to cancelled.';


--
-- Name: fn_cancel_waiting_rooms("uuid", boolean, "uuid"); Type: FUNCTION; Schema: game_core; Owner: -
--

CREATE FUNCTION "game_core"."fn_cancel_waiting_rooms"("p_room" "uuid" DEFAULT NULL::"uuid", "p_by_admin" boolean DEFAULT false, "p_requester" "uuid" DEFAULT NULL::"uuid") RETURNS integer
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
  v_now timestamptz := now();
  v_actor uuid := p_requester;
  v_actor_role public.user_role;
  v_cancelled integer := 0;
  v_room_id uuid;
BEGIN
  IF v_actor IS NULL THEN
    BEGIN
      v_actor := auth.uid();
    EXCEPTION
      WHEN OTHERS THEN
        v_actor := NULL;
    END;
  END IF;

  IF NOT p_by_admin THEN
    IF p_room IS NULL THEN
      RAISE EXCEPTION 'room id is required for player cancels';
    END IF;
    IF v_actor IS NULL THEN
      RAISE EXCEPTION 'unauthorized';
    END IF;

    RETURN game_core.fn_cancel_waiting_room_single(p_room, v_actor, 'player_cancel', true, v_now);
  END IF;

  -- admin path
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'permission denied';
  END IF;

  SELECT role INTO v_actor_role
  FROM public.users
  WHERE id = v_actor;

  IF v_actor_role IS DISTINCT FROM 'admin'::public.user_role THEN
    RAISE EXCEPTION 'permission denied';
  END IF;

  IF p_room IS NOT NULL THEN
    v_cancelled := v_cancelled + game_core.fn_cancel_waiting_room_single(p_room, v_actor, 'admin_cancel', false, v_now);
    RETURN v_cancelled;
  END IF;

  FOR v_room_id IN
    SELECT id
    FROM public.rooms
    WHERE status = 'waiting'::public.room_status
    ORDER BY created_at
  LOOP
    v_cancelled := v_cancelled + game_core.fn_cancel_waiting_room_single(v_room_id, v_actor, 'admin_cancel', false, v_now);
  END LOOP;

  RETURN v_cancelled;
END;
$$;


--
-- Name: fn_confirm_win("uuid", "uuid", "text"); Type: FUNCTION; Schema: game_core; Owner: -
--

CREATE FUNCTION "game_core"."fn_confirm_win"("p_room_id" "uuid", "p_ticket_id" "uuid", "p_type" "text") RETURNS "void"
    LANGUAGE "plpgsql"
    AS $$BEGIN
  -- برای full اگر قبلاً ثبت شده باشد، INSERT خطا می‌دهد (ایندکس جزئی)
  INSERT INTO public.results(id, room_id, user_id, ticket_id, win_type, reward_amount)
  SELECT gen_random_uuid(), r.id, t.player_user_id, p_ticket_id, p_type, 0
  FROM public.rooms r
  JOIN public.tickets t ON t.id = p_ticket_id
  WHERE r.id = p_room_id;

  -- در صورت نیاز پرداخت
  IF p_type = 'full' THEN
    PERFORM public.fn_payout_room(p_room_id);
  END IF;
END;$$;


--
-- Name: fn_ensure_waiting_started_at("uuid", timestamp with time zone); Type: FUNCTION; Schema: game_core; Owner: -
--

CREATE FUNCTION "game_core"."fn_ensure_waiting_started_at"("p_room" "uuid", "p_now" timestamp with time zone DEFAULT "now"()) RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'game_core', 'game_finance'
    AS $$
BEGIN
  UPDATE public.rooms
     SET waiting_started_at = p_now
   WHERE id = p_room
     AND status = 'waiting'::public.room_status
     AND waiting_started_at IS NULL;
END;
$$;


--
-- Name: fn_evaluate_room_after_draw("uuid", integer); Type: FUNCTION; Schema: game_core; Owner: -
--

CREATE FUNCTION "game_core"."fn_evaluate_room_after_draw"("p_room" "uuid", "p_draw" integer) RETURNS "void"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  PERFORM public.fn_evaluate_room_after_draw(p_room, p_draw);
END;
$$;


--
-- Name: FUNCTION "fn_evaluate_room_after_draw"("p_room" "uuid", "p_draw" integer); Type: COMMENT; Schema: game_core; Owner: -
--

COMMENT ON FUNCTION "game_core"."fn_evaluate_room_after_draw"("p_room" "uuid", "p_draw" integer) IS 'Checks marks after each draw: detects first-time line and full wins, records them in results, and closes room if full house complete.';


--
-- Name: fn_force_cancel_waiting_room("uuid", "text", timestamp with time zone); Type: FUNCTION; Schema: game_core; Owner: -
--

CREATE FUNCTION "game_core"."fn_force_cancel_waiting_room"("p_room" "uuid", "p_reason" "text" DEFAULT 'system_force_cancel'::"text", "p_now" timestamp with time zone DEFAULT "now"()) RETURNS integer
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'game_core', 'game_finance'
    AS $$
DECLARE
  v_room record;
  v_ticket record;
  v_ticket_count integer := 0;
  c_cancelable constant public.reservation_status[] := ARRAY[
    'held'::public.reservation_status,
    'reserved'::public.reservation_status,
    'confirmed'::public.reservation_status
  ];
BEGIN
  IF p_room IS NULL THEN
    RAISE EXCEPTION 'room id is required';
  END IF;

  SELECT *
    INTO v_room
  FROM public.rooms
  WHERE id = p_room
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'room % not found', p_room;
  END IF;

  IF v_room.status = 'cancelled'::public.room_status THEN
    RETURN 0;
  END IF;

  IF v_room.status <> 'waiting'::public.room_status THEN
    RAISE EXCEPTION 'room % is not cancellable (status=%)', p_room, v_room.status;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.tickets
    WHERE room_id = p_room
      AND reservation_status = 'consumed'::public.reservation_status
  ) THEN
    RAISE EXCEPTION 'room % is already live (consumed tickets exist)', p_room;
  END IF;

  FOR v_ticket IN
    SELECT id
    FROM public.tickets
    WHERE room_id = p_room
      AND reservation_status = ANY(c_cancelable)
    FOR UPDATE
  LOOP
    BEGIN
      PERFORM game_finance.fn_wallet_release_join(v_ticket.id);
    EXCEPTION
      WHEN OTHERS THEN
        RAISE LOG 'force_cancel: wallet release failed ticket % room %: %',
          v_ticket.id, p_room, SQLERRM;
    END;
    v_ticket_count := v_ticket_count + 1;
  END LOOP;

  UPDATE public.tickets
     SET reservation_status = 'cancelled'::public.reservation_status,
         cancelled_at = p_now,
         updated_at = p_now
   WHERE room_id = p_room
     AND reservation_status = ANY(c_cancelable);

  UPDATE public.rooms
     SET status = 'cancelled'::public.room_status,
         starts_at = NULL,
         ends_at = COALESCE(ends_at, p_now),
         cancelled_at = p_now,
         cancelled_by = NULL,
         cancelled_reason = p_reason,
         updated_at = p_now
   WHERE id = p_room;

  RAISE LOG 'force_cancel: room % cancelled (% tickets) reason=%',
    p_room, v_ticket_count, p_reason;

  RETURN 1;
END;
$$;


--
-- Name: FUNCTION "fn_force_cancel_waiting_room"("p_room" "uuid", "p_reason" "text", "p_now" timestamp with time zone); Type: COMMENT; Schema: game_core; Owner: -
--

COMMENT ON FUNCTION "game_core"."fn_force_cancel_waiting_room"("p_room" "uuid", "p_reason" "text", "p_now" timestamp with time zone) IS 'System/janitor waiting-room cancel: releases holds and cancels tickets without auth.uid().';


--
-- Name: fn_generate_card_pool(integer, "uuid", "text"); Type: FUNCTION; Schema: game_core; Owner: -
--

CREATE FUNCTION "game_core"."fn_generate_card_pool"("p_card_count" integer DEFAULT 10000, "p_created_by" "uuid" DEFAULT NULL::"uuid", "p_prng_version" "text" DEFAULT 'v1'::"text") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$DECLARE
  v_pool_id uuid;
  v_pool_seed bytea;
  v_commit_hash text;
  v_version integer;
BEGIN
  IF p_card_count IS NULL OR p_card_count <= 0 THEN
    RAISE EXCEPTION 'card_count must be positive';
  END IF;

  v_pool_seed := extensions.gen_random_bytes(32);
  v_commit_hash := encode(digest(v_pool_seed, 'sha256'), 'hex');

  SELECT COALESCE(MAX(version), 0) + 1 INTO v_version
  FROM public.card_pools;

  INSERT INTO public.card_pools (
    id,
    version,
    is_active,
    is_building,
    cards_built,
    created_by,
    pool_seed,
    commit_hash,
    prng_version,
    card_count,
    created_at,
    updated_at
  )
  VALUES (
    gen_random_uuid(),
    v_version,
    false,   -- not active until cards are fully built
    true,    -- mark building
    0,       -- no cards built yet
    p_created_by,
    v_pool_seed,
    v_commit_hash,
    p_prng_version,
    p_card_count,
    now(),
    now()
  )
  RETURNING id INTO v_pool_id;

  RAISE NOTICE 'Pool created for staged build: % (version %, card_count %)', v_pool_id, v_version, p_card_count;

  RETURN v_pool_id;
END;$$;


--
-- Name: fn_generate_card_pool_step(integer); Type: FUNCTION; Schema: game_core; Owner: -
--

CREATE FUNCTION "game_core"."fn_generate_card_pool_step"("p_batch_size" integer DEFAULT 20) RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
  v_pool record;
  v_start_card integer;
  v_end_card integer;
  v_card_no integer;
  v_row_no smallint;
  v_col_no smallint;
  v_value integer;
  v_card_data jsonb;
  v_row_array jsonb;
  v_row_values integer[];
  v_all_used_numbers integer[];
  v_row_positions integer[];
  v_temp_positions integer[];
  v_pos_index integer;
  v_selected_pos integer;
  v_col_min integer;
  v_col_max integer;
  v_random_index integer;
  v_attempts integer;
  v_found boolean;
  v_col_has_number boolean[];
  v_non_zero_count integer;
  v_row_data jsonb;
  v_generated integer := 0;
  v_new_built integer;
  v_now timestamptz := now();
  v_bitmask record;
  -- UK Housie: col 1 = 1-9, col 2 = 10-19, ..., col 9 = 80-90
  v_col_mins constant integer[] := ARRAY[1,10,20,30,40,50,60,70,80];
  v_col_maxs constant integer[] := ARRAY[9,19,29,39,49,59,69,79,90];
BEGIN
  IF p_batch_size IS NULL OR p_batch_size <= 0 THEN
    RAISE EXCEPTION 'p_batch_size must be positive';
  END IF;

  SELECT *
    INTO v_pool
  FROM public.card_pools
  WHERE is_building = true
    AND cards_built < card_count
  ORDER BY created_at
  LIMIT 1
  FOR UPDATE SKIP LOCKED;

  IF NOT FOUND THEN
    RETURN;
  END IF;

  v_start_card := v_pool.cards_built + 1;
  v_end_card := LEAST(v_pool.cards_built + p_batch_size, v_pool.card_count);

  FOR v_card_no IN v_start_card..v_end_card LOOP
    v_card_data := '[]'::jsonb;
    v_all_used_numbers := ARRAY[]::integer[];
    v_col_has_number := ARRAY[false, false, false, false, false, false, false, false, false]::boolean[];

    FOR v_row_no IN 1..3 LOOP
      v_row_values := ARRAY[0,0,0,0,0,0,0,0,0]::integer[];
      v_row_positions := ARRAY[]::integer[];
      v_temp_positions := ARRAY[1,2,3,4,5,6,7,8,9]::integer[];

      FOR v_pos_index IN 1..5 LOOP
        v_selected_pos := v_temp_positions[
          ABS(
            MOD(
              hashtext(
                encode(v_pool.pool_seed, 'hex') || ':' ||
                v_card_no::text || ':' ||
                v_row_no::text || ':' ||
                'pos' || v_pos_index::text
              ),
              array_length(v_temp_positions, 1)
            )
          ) + 1
        ];
        v_temp_positions := array_remove(v_temp_positions, v_selected_pos);
        v_row_positions := array_append(v_row_positions, v_selected_pos);
      END LOOP;

      FOR v_pos_index IN 1..5 LOOP
        v_col_no := v_row_positions[v_pos_index];
        v_col_min := v_col_mins[v_col_no];
        v_col_max := v_col_maxs[v_col_no];

        v_attempts := 0;
        LOOP
          v_attempts := v_attempts + 1;
          IF v_attempts > 500 THEN
            RAISE EXCEPTION 'Cannot generate unique number for card %, row %, col %', v_card_no, v_row_no, v_col_no;
          END IF;

          v_random_index := ABS(
            MOD(
              hashtext(
                encode(v_pool.pool_seed, 'hex') || ':' ||
                v_card_no::text || ':' ||
                v_row_no::text || ':' ||
                v_col_no::text || ':' ||
                v_pos_index::text || ':' ||
                v_attempts::text
              ),
              (v_col_max - v_col_min + 1)
            )
          ) + v_col_min;

          v_value := GREATEST(v_col_min, LEAST(v_col_max, v_random_index));

          v_found := v_value = ANY(v_all_used_numbers);
          IF NOT v_found THEN
            EXIT;
          END IF;
        END LOOP;

        v_row_values[v_col_no] := v_value;
        v_all_used_numbers := array_append(v_all_used_numbers, v_value);
        v_col_has_number[v_col_no] := true;
      END LOOP;

      v_row_array := '[]'::jsonb;
      FOR v_col_no IN 1..9 LOOP
        IF v_row_values[v_col_no] > 0 THEN
          v_row_array := v_row_array || jsonb_build_array(v_row_values[v_col_no]);
        ELSE
          v_row_array := v_row_array || jsonb_build_array(jsonb 'null');
        END IF;
      END LOOP;
      v_card_data := v_card_data || jsonb_build_array(v_row_array);
    END LOOP;

    FOR v_col_no IN 1..9 LOOP
      IF NOT v_col_has_number[v_col_no] THEN
        v_col_min := v_col_mins[v_col_no];
        v_col_max := v_col_maxs[v_col_no];
        v_attempts := 0;
        LOOP
          v_attempts := v_attempts + 1;
          IF v_attempts > 500 THEN
            RAISE EXCEPTION 'Cannot generate number for empty column % in card %', v_col_no, v_card_no;
          END IF;

          v_random_index := ABS(
            MOD(
              hashtext(
                encode(v_pool.pool_seed, 'hex') || ':' ||
                v_card_no::text || ':' ||
                'col_fix' || v_col_no::text || ':' ||
                v_attempts::text
              ),
              (v_col_max - v_col_min + 1)
            )
          ) + v_col_min;

          v_value := GREATEST(v_col_min, LEAST(v_col_max, v_random_index));

          v_found := v_value = ANY(v_all_used_numbers);
          IF NOT v_found THEN
            FOR v_row_no IN 1..3 LOOP
              v_row_data := v_card_data->(v_row_no - 1);
              IF COALESCE((v_row_data->>(v_col_no - 1))::integer, 0) = 0 THEN
                v_non_zero_count := 0;
                FOR v_pos_index IN 0..8 LOOP
                  IF COALESCE((v_row_data->>v_pos_index)::integer, 0) > 0 THEN
                    v_non_zero_count := v_non_zero_count + 1;
                  END IF;
                END LOOP;
                IF v_non_zero_count < 5 THEN
                  v_row_data := jsonb_set(
                    v_row_data,
                    ARRAY[(v_col_no - 1)::text],
                    to_jsonb(v_value)
                  );
                  v_card_data := jsonb_set(
                    v_card_data,
                    ARRAY[(v_row_no - 1)::text],
                    v_row_data
                  );
                  v_all_used_numbers := array_append(v_all_used_numbers, v_value);
                  v_col_has_number[v_col_no] := true;
                  EXIT;
                END IF;
              END IF;
            END LOOP;
            EXIT;
          END IF;
        END LOOP;
      END IF;
    END LOOP;

    INSERT INTO public.card_pool_cards (
      pool_id,
      card_no,
      card_data,
      created_at
    )
    VALUES (
      v_pool.id,
      v_card_no,
      v_card_data,
      v_now
    );

    v_generated := v_generated + 1;
  END LOOP;

  v_new_built := v_pool.cards_built + v_generated;

  UPDATE public.card_pools
     SET cards_built = v_new_built,
         updated_at = now()
   WHERE id = v_pool.id;

  IF v_new_built >= v_pool.card_count THEN
    UPDATE public.card_pools
       SET is_active = false,
           updated_at = now()
     WHERE is_active = true
       AND id <> v_pool.id;

    UPDATE public.card_pools
       SET is_building = false,
           is_active = true,
           updated_at = now()
     WHERE id = v_pool.id;

    -- Rebuild engine secondary tables after the pool is fully built + activated.
    SELECT * INTO v_bitmask FROM public.fn_backfill_card_bitmask_definitions();
    RAISE LOG
      '[CardPool] bitmask rebuilt after pool % activated: cards=%, index=%, masks=%',
      v_pool.id,
      v_bitmask.cards_processed,
      v_bitmask.index_rows,
      v_bitmask.mask_rows;
  END IF;

  RAISE NOTICE 'Pool %: built % cards this step (cards_built now % of %)',
    v_pool.id, v_generated, v_new_built, v_pool.card_count;

EXCEPTION
  WHEN OTHERS THEN
    RAISE;
END;
$$;


--
-- Name: fn_generate_room_seed(); Type: FUNCTION; Schema: game_core; Owner: -
--

CREATE FUNCTION "game_core"."fn_generate_room_seed"() RETURNS TABLE("seed" "bytea", "seed_hash" character)
    LANGUAGE "plpgsql"
    AS $$declare
  v_seed bytea;
  v_hash char(64);
begin
SET search_path = public, extensions, pg_temp;
  -- ۳۲ بایت رندوم امن
  v_seed := extensions.gen_random_bytes(32);

  -- هش سید به صورت hex (۶۴ کاراکتر)
  v_hash := encode(digest(v_seed, 'sha256'), 'hex')::char(64);

  return query select v_seed, v_hash;
end;$$;


--
-- Name: fn_janitor_repair_unsettled_finished(integer); Type: FUNCTION; Schema: game_core; Owner: -
--

CREATE FUNCTION "game_core"."fn_janitor_repair_unsettled_finished"("p_limit" integer DEFAULT 20) RETURNS TABLE("room_id" "uuid")
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_room record;
  v_last_draw integer;
  v_had_full_before integer;
  v_had_full_after integer;
  v_repaired integer := 0;
BEGIN
  FOR v_room IN
    SELECT r.id
    FROM public.rooms r
    WHERE r.status IN ('finished'::public.room_status, 'settling'::public.room_status)
      AND r.prize_paid_at IS NULL
      AND (SELECT count(*) FROM public.draws d WHERE d.room_id = r.id) >= 89
      AND (
        NOT EXISTS (
          SELECT 1 FROM public.results res
          WHERE res.room_id = r.id AND res.win_type = 'full'
        )
        OR EXISTS (
          SELECT 1 FROM public.results res
          WHERE res.room_id = r.id AND res.win_type = 'full'
        )
      )
    ORDER BY r.updated_at ASC
    LIMIT GREATEST(p_limit, 1)
    FOR UPDATE OF r SKIP LOCKED
  LOOP
    BEGIN
      SELECT d.number
        INTO v_last_draw
      FROM public.draws d
      WHERE d.room_id = v_room.id
      ORDER BY d.created_at DESC
      LIMIT 1;

      IF v_last_draw IS NULL THEN
        CONTINUE;
      END IF;

      IF EXISTS (
        SELECT 1 FROM public.draw_jobs j
        WHERE j.room_id = v_room.id
          AND j.status IN ('queued', 'processing')
        LIMIT 1
      ) THEN
        CONTINUE;
      END IF;

      SELECT count(*) INTO v_had_full_before
      FROM public.results res
      WHERE res.room_id = v_room.id AND res.win_type = 'full';

      PERFORM public.fn_evaluate_room_after_draw(v_room.id, v_last_draw);

      SELECT count(*) INTO v_had_full_after
      FROM public.results res
      WHERE res.room_id = v_room.id AND res.win_type = 'full';

      IF v_had_full_after > v_had_full_before OR v_had_full_after > 0 THEN
        UPDATE public.rooms
        SET status = 'settling'::public.room_status,
            updated_at = now()
        WHERE id = v_room.id
          AND status IN ('finished'::public.room_status, 'settling'::public.room_status);

        PERFORM game_finance.fn_finish_room_and_settle(v_room.id);
      END IF;

      room_id := v_room.id;
      v_repaired := v_repaired + 1;
      RETURN NEXT;
    EXCEPTION
      WHEN OTHERS THEN
        RAISE LOG 'janitor_repair_unsettled_finished: room % failed: %', v_room.id, SQLERRM;
    END;
  END LOOP;

  IF v_repaired > 0 THEN
    RAISE LOG 'janitor_repair_unsettled_finished: repaired % room(s)', v_repaired;
  END IF;
END;
$$;


--
-- Name: fn_janitor_sweep(); Type: FUNCTION; Schema: game_core; Owner: -
--

CREATE FUNCTION "game_core"."fn_janitor_sweep"() RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'game_core', 'game_finance'
    AS $$
DECLARE
  v_room record;
  v_now timestamptz := now();
  v_consumed_count integer;
  v_ticket record;
  v_cancelled integer;
  v_player_count integer;
  v_min_players integer;
  v_timeout_sec integer;
  c_cancelable constant public.reservation_status[] := ARRAY[
    'held'::public.reservation_status,
    'reserved'::public.reservation_status,
    'confirmed'::public.reservation_status
  ];
BEGIN
  FOR v_room IN
    SELECT r.id,
           r.min_players,
           r.meta,
           r.waiting_started_at,
           r.created_at,
           COALESCE(rt.waiting_timeout_seconds, 120) AS waiting_timeout_seconds
    FROM public.rooms r
    LEFT JOIN public.room_templates rt ON rt.id = r.room_template_id
    WHERE r.status = 'waiting'::public.room_status
      AND COALESCE(r.waiting_started_at, r.created_at) IS NOT NULL
    FOR UPDATE OF r SKIP LOCKED
  LOOP
    SELECT COUNT(DISTINCT t.player_user_id)
      INTO v_player_count
    FROM public.tickets t
    WHERE t.room_id = v_room.id
      AND t.reservation_status IN ('reserved', 'confirmed');

    v_min_players := COALESCE(
      v_room.min_players,
      (v_room.meta->>'min_players')::int,
      2
    );
    v_timeout_sec := GREATEST(COALESCE(v_room.waiting_timeout_seconds, 120), 10);

    IF v_player_count < v_min_players
       AND v_now - COALESCE(v_room.waiting_started_at, v_room.created_at, v_now)
           > make_interval(secs => v_timeout_sec) THEN
      BEGIN
        RAISE LOG 'janitor: waiting timeout room % (players=% min=% timeout=%s)',
          v_room.id, v_player_count, v_min_players, v_timeout_sec;
        v_cancelled := game_core.fn_force_cancel_waiting_room(
          v_room.id,
          'janitor_waiting_timeout',
          v_now
        );
        RAISE LOG 'janitor: force-cancelled waiting room % result=%', v_room.id, v_cancelled;
      EXCEPTION
        WHEN OTHERS THEN
          RAISE LOG 'janitor: error force-cancelling WAITING room %: %', v_room.id, SQLERRM;
      END;
    END IF;
  END LOOP;

  FOR v_room IN
    SELECT r.id
    FROM public.rooms r
    WHERE r.status = 'playing'::public.room_status
      AND r.updated_at < v_now - INTERVAL '6 minutes'
    FOR UPDATE SKIP LOCKED
  LOOP
    BEGIN
      SELECT COUNT(*)
        INTO v_consumed_count
      FROM public.tickets
      WHERE room_id = v_room.id
        AND reservation_status = 'consumed'::public.reservation_status;

      IF v_consumed_count > 0 THEN
        CONTINUE;
      END IF;

      FOR v_ticket IN
        SELECT id
        FROM public.tickets
        WHERE room_id = v_room.id
          AND reservation_status = ANY(c_cancelable)
        FOR UPDATE
      LOOP
        BEGIN
          PERFORM game_finance.fn_wallet_release_join(v_ticket.id);
        EXCEPTION
          WHEN OTHERS THEN
            NULL;
        END;
      END LOOP;

      UPDATE public.tickets
         SET reservation_status = 'cancelled'::public.reservation_status,
             cancelled_at = v_now,
             updated_at = v_now
       WHERE room_id = v_room.id
         AND reservation_status = ANY(c_cancelable);

      UPDATE public.rooms
         SET status = 'cancelled'::public.room_status,
             starts_at = NULL,
             ends_at = COALESCE(ends_at, v_now),
             cancelled_at = v_now,
             cancelled_by = NULL,
             cancelled_reason = 'janitor_cancel_stuck_playing',
             updated_at = v_now
       WHERE id = v_room.id;
    EXCEPTION
      WHEN OTHERS THEN
        RAISE LOG 'janitor: error processing PLAYING room %: %', v_room.id, SQLERRM;
    END;
  END LOOP;

  FOR v_room IN
    SELECT r.id
    FROM public.rooms r
    WHERE r.status = 'settling'::public.room_status
      AND r.updated_at < v_now - INTERVAL '2 minutes'
    FOR UPDATE SKIP LOCKED
  LOOP
    BEGIN
      PERFORM game_finance.fn_finish_room_and_settle(v_room.id);
    EXCEPTION
      WHEN OTHERS THEN
        RAISE LOG 'janitor: re-settle %: %', v_room.id, SQLERRM;
    END;
  END LOOP;

  PERFORM game_core.fn_requeue_failed_draw_jobs();
  PERFORM game_core.fn_stamp_orphan_draws_on_terminal_rooms();

  FOR v_room IN
    SELECT r.id
    FROM public.rooms r
    WHERE r.status = 'playing'::public.room_status
      AND EXISTS (
        SELECT 1
        FROM public.results res
        WHERE res.room_id = r.id
          AND res.win_type = 'full'
      )
    FOR UPDATE SKIP LOCKED
  LOOP
    BEGIN
      UPDATE public.rooms
         SET status = 'settling'::public.room_status,
             updated_at = v_now
       WHERE id = v_room.id
         AND status = 'playing'::public.room_status;
      PERFORM game_finance.fn_finish_room_and_settle(v_room.id);
    EXCEPTION
      WHEN OTHERS THEN
        RAISE LOG 'janitor: finish full-winner room %: %', v_room.id, SQLERRM;
    END;
  END LOOP;

  RAISE LOG 'janitor: sweep completed at %', v_now;
END;
$$;


--
-- Name: FUNCTION "fn_janitor_sweep"(); Type: COMMENT; Schema: game_core; Owner: -
--

COMMENT ON FUNCTION "game_core"."fn_janitor_sweep"() IS 'Janitor sweep: waiting timeout (template-based), stuck playing/settling, draw hygiene.';


--
-- Name: fn_join_or_create_room_base("uuid", integer, "text"); Type: FUNCTION; Schema: game_core; Owner: -
--

CREATE FUNCTION "game_core"."fn_join_or_create_room_base"("p_template_id" "uuid", "p_card_count" integer, "p_password" "text") RETURNS TABLE("room_id" "uuid", "starts_at" timestamp with time zone, "ticket_ids" "uuid"[])
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'game_core', 'game_finance'
    AS $$
BEGIN
  RETURN QUERY
  SELECT c.room_id, c.starts_at, c.ticket_ids
  FROM game_core.fn_join_or_create_room_core(p_template_id, p_card_count, p_password) AS c;
END;
$$;


--
-- Name: fn_join_or_create_room_core("uuid", integer, "text"); Type: FUNCTION; Schema: game_core; Owner: -
--

CREATE FUNCTION "game_core"."fn_join_or_create_room_core"("p_template_id" "uuid", "p_card_count" integer, "p_password" "text") RETURNS TABLE("room_id" "uuid", "starts_at" timestamp with time zone, "ticket_ids" "uuid"[])
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'game_core', 'game_finance'
    AS $$
DECLARE
  v_room_seed      bytea;
  v_room_seed_hash char(64);

  v_user           uuid := auth.uid();
  v_price          numeric;
  v_currency       text;
  v_min_players    int;
  v_cd             int;
  v_max_cards_pp   int;
  v_max_players    int;
  v_pool           uuid;
  v_room           uuid;
  v_room_type      public.room_type;
  v_sched_time     time;
  v_required_password text;

  v_taken          int := 0;
  v_ticket_ids     uuid[] := '{}';
  v_ticket_id      uuid;
  r_card           record;
  v_now            timestamptz := now();
  v_starts_at      timestamptz;
  v_active_players int;
  v_user_in_room   boolean;
BEGIN
  IF p_template_id IS NULL OR p_card_count IS NULL OR p_card_count < 1 THEN
    RAISE EXCEPTION 'invalid input';
  END IF;

  SELECT price,
         currency,
         GREATEST(COALESCE(min_players, 2), 2),
         COALESCE(countdown_sec, 120),
         COALESCE(max_cards_per_player, 999999),
         max_players,
         room_type,
         scheduled_start_time,
         password
    INTO v_price,
         v_currency,
         v_min_players,
         v_cd,
         v_max_cards_pp,
         v_max_players,
         v_room_type,
         v_sched_time,
         v_required_password
  FROM public.room_templates
  WHERE id = p_template_id;

  IF v_price IS NULL THEN
    RAISE EXCEPTION 'room template not found: %', p_template_id;
  END IF;

  IF v_room_type <> 'tournament'::public.room_type
     AND v_required_password IS NOT NULL
     AND (p_password IS NULL OR p_password <> v_required_password) THEN
    RAISE EXCEPTION 'invalid room password';
  END IF;

  SELECT id
    INTO v_pool
  FROM public.card_pools
  WHERE is_active = true
  ORDER BY created_at DESC
  LIMIT 1;

  IF v_pool IS NULL THEN
    RAISE EXCEPTION 'no active card pool';
  END IF;

  SELECT r.id, r.starts_at
    INTO v_room, v_starts_at
  FROM public.rooms r
  WHERE r.status = 'waiting'::public.room_status
    AND r.room_template_id = p_template_id
  ORDER BY r.created_at ASC
  LIMIT 1;

  IF v_room IS NULL THEN
    BEGIN
      SELECT seed, seed_hash
        INTO v_room_seed, v_room_seed_hash
      FROM game_core.fn_generate_room_seed();

      INSERT INTO public.rooms AS ins(
        id, room_template_id, status,
        card_price, currency, pool_id,
        starts_at, created_by, meta,
        min_players, max_players, countdown_sec, max_cards_per_player,
        room_seed, room_seed_hash,
        waiting_started_at,
        created_at, updated_at
      )
      VALUES (
        gen_random_uuid(),
        p_template_id,
        'waiting'::public.room_status,
        v_price, v_currency, v_pool,
        CASE
          WHEN v_room_type = 'tournament'
               AND v_sched_time IS NOT NULL
            THEN (v_now::date + v_sched_time)::timestamptz
          ELSE NULL
        END,
        v_user,
        jsonb_build_object(
          'source', 'template_snapshot',
          'min_players', v_min_players,
          'max_players', v_max_players,
          'countdown_sec', v_cd
        ),
        v_min_players, v_max_players, v_cd, v_max_cards_pp,
        v_room_seed, v_room_seed_hash,
        v_now,
        v_now, v_now
      )
      RETURNING ins.id, ins.starts_at INTO v_room, v_starts_at;

    EXCEPTION
      WHEN unique_violation THEN
        SELECT r.id, r.starts_at
          INTO v_room, v_starts_at
        FROM public.rooms r
        WHERE r.status = 'waiting'::public.room_status
          AND r.room_template_id = p_template_id
        ORDER BY r.created_at ASC
        LIMIT 1;

        IF v_room IS NULL THEN
          RAISE EXCEPTION 'race detected but no waiting room found';
        END IF;
    END;
  END IF;

  PERFORM game_core.fn_ensure_waiting_started_at(v_room, v_now);

  IF v_max_players IS NOT NULL THEN
    UPDATE public.rooms r
       SET max_players = v_max_players,
           meta = COALESCE(r.meta, '{}'::jsonb) || jsonb_build_object('max_players', v_max_players),
           updated_at = v_now
     WHERE r.id = v_room
       AND r.status = 'waiting'::public.room_status
       AND r.max_players IS DISTINCT FROM v_max_players;
  END IF;

  IF v_room_seed IS NULL THEN
    SELECT room_seed
      INTO v_room_seed
    FROM public.rooms
    WHERE id = v_room;

    IF v_room_seed IS NULL THEN
      RAISE EXCEPTION 'room % has no room_seed', v_room;
    END IF;
  END IF;

  IF v_max_players IS NOT NULL THEN
    SELECT COUNT(DISTINCT t.player_user_id)
      INTO v_active_players
    FROM public.tickets t
    WHERE t.room_id = v_room
      AND t.reservation_status IN ('reserved', 'confirmed');

    SELECT EXISTS (
      SELECT 1
      FROM public.tickets t
      WHERE t.room_id = v_room
        AND t.player_user_id = v_user
        AND t.reservation_status IN ('reserved', 'confirmed', 'consumed')
    )
    INTO v_user_in_room;

    IF v_active_players >= v_max_players AND NOT v_user_in_room THEN
      RAISE EXCEPTION 'room is full';
    END IF;
  END IF;

  IF (
      SELECT COUNT(*)
      FROM public.tickets t_count
      WHERE t_count.room_id = v_room
        AND t_count.player_user_id = v_user
        AND t_count.reservation_status IN ('reserved', 'confirmed', 'consumed')
     ) + p_card_count > v_max_cards_pp
  THEN
    RAISE EXCEPTION 'max_cards_per_player exceeded';
  END IF;

  FOR r_card IN
    SELECT c.id AS pool_card_id, c.card_no
      FROM public.card_pool_cards c
     WHERE c.pool_id = v_pool
       AND (
         v_room_type = 'tournament'
         OR c.card_no <= 200
       )
       AND NOT EXISTS (
         SELECT 1
           FROM public.tickets t
          WHERE t.pool_card_id = c.id
            AND t.room_id = v_room
            AND t.reservation_status IN ('reserved', 'confirmed', 'consumed')
       )
     ORDER BY extensions.digest(
       (encode(v_room_seed, 'hex') || ':' || c.id::text)::bytea,
       'sha256'::text
     )
     LIMIT p_card_count
     FOR UPDATE SKIP LOCKED
  LOOP
    v_taken := v_taken + 1;

    INSERT INTO public.tickets(
      id, room_id, player_user_id, pool_card_id, card_no,
      price, reservation_status, created_at, updated_at
    )
    VALUES (
      gen_random_uuid(), v_room, v_user, r_card.pool_card_id, r_card.card_no,
      v_price,
      'reserved',
      v_now, v_now
    )
    RETURNING id INTO v_ticket_id;

    IF NOT (v_room_type = 'tournament'::public.room_type AND COALESCE(v_price, 0) = 0) THEN
      PERFORM game_finance.fn_wallet_hold_join(
        p_user := v_user,
        p_amount := v_price,
        p_currency := v_currency,
        p_room := v_room,
        p_ticket := v_ticket_id
      );

      PERFORM game_finance.fn_record_ticket_commission(v_ticket_id);
    END IF;

    v_ticket_ids := array_append(v_ticket_ids, v_ticket_id);
  END LOOP;

  IF v_taken <> p_card_count THEN
    RAISE EXCEPTION
      'not enough free cards in pool for this room (wanted %, got %)',
      p_card_count, v_taken;
  END IF;

  UPDATE public.rooms r
     SET starts_at = CASE
                       WHEN r.starts_at IS NOT NULL THEN r.starts_at
                       WHEN v_room_type = 'normal'
                         THEN v_now + make_interval(secs => v_cd)
                       ELSE r.starts_at
                     END,
         updated_at = v_now
   WHERE r.id = v_room
  RETURNING r.starts_at INTO v_starts_at;

  PERFORM game_core.fn_try_promote_room_at_max_capacity(v_room);

  room_id := v_room;
  starts_at := v_starts_at;
  ticket_ids := v_ticket_ids;

  RETURN;
END;
$$;


--
-- Name: fn_manage_room_live_actions(); Type: FUNCTION; Schema: game_core; Owner: -
--

CREATE FUNCTION "game_core"."fn_manage_room_live_actions"() RETURNS TABLE("drew" integer, "evaluated" integer, "finished" integer)
    LANGUAGE "plpgsql"
    AS $$DECLARE
  v_now   timestamptz := now();  -- زمان فعلی
  v_drew  int := 0;              -- شمارنده قرعه
  v_eval  int := 0;              -- (اینجا صفر می‌ماند؛ داوری در draw-worker است)
  v_fin   int := 0;              -- شمارنده اتاق‌های تمام‌شده
  r_room  record;                -- رکورد هر اتاق در حال بازی
  v_next  int;                   -- شماره‌ی قرعه‌ی جدید
   v_draw_interval int;   
BEGIN
  -- 🔸 انتخاب اتاق‌هایی که اکنون نوبت قرعه‌ی جدید دارند
  FOR r_room IN
    select id, room_seed, meta
    FROM public.rooms
    WHERE status = 'playing'::room_status
      AND next_draw_at IS NOT NULL
      AND next_draw_at <= v_now
    FOR UPDATE SKIP LOCKED
  LOOP
    -- اگر به‌هر دلیلی سید نداشت، بهتره ارور بده تا مشکل رو زود بفهمیم
    IF r_room.room_seed IS NULL THEN
      RAISE EXCEPTION 'room % has no room_seed but is playing', r_room.id;
    END IF;

    ------------------------------------------------------------------
    -- 🧱 Backpressure: تا وقتی draw قبلی کاملاً processed نشده،
    -- برای این room عدد جدید نکش.
    ------------------------------------------------------------------
    PERFORM 1
    FROM public.draws d
    WHERE d.room_id = r_room.id
      AND d.processed_at IS NULL
    LIMIT 1;

    IF FOUND THEN
      -- یعنی هنوز حداقل یک draw برای این روم هست که
      -- تمام jobهاش done نشده و processed_at نگرفته
      CONTINUE;
    END IF;
    ------------------------------------------------------------------

    -- 1️⃣ انتخاب شماره‌ی جدید (۱ تا ۹۰ که قبلاً در این اتاق نیامده) بر اساس room_seed
    SELECT g.n
      INTO v_next
    FROM (
      SELECT generate_series(1, 90) AS n
    ) g
    WHERE NOT EXISTS (
      SELECT 1
      FROM public.draws d
      WHERE d.room_id = r_room.id
        AND d.number  = g.n
    )
    ORDER BY digest(
      encode(r_room.room_seed, 'hex') || ':' || g.n::text,
      'sha256'
    )
    LIMIT 1;

    -- اگر همه‌ی اعداد کشیده شده‌اند → اتاق تمام است
    IF v_next IS NULL THEN
      UPDATE public.rooms
         SET status = 'finished'::room_status,
             updated_at = v_now
       WHERE id = r_room.id;

      v_fin := v_fin + 1;
      CONTINUE;
    END IF;

    -- 2️⃣ ثبت شماره‌ی جدید در جدول draws (رسمی)
    INSERT INTO public.draws (id, room_id, number, "timestamp", created_at)
    VALUES (gen_random_uuid(), r_room.id, v_next, v_now, v_now);

    -- تریگر AFTER INSERT ON draws خودش draw_jobs را می‌سازد.

v_draw_interval := GREATEST(
  COALESCE((r_room.meta->>'draw_interval_sec')::int, 3),
  1
);

update public.rooms
   set next_draw_at = v_now + make_interval(secs => v_draw_interval),
       updated_at   = v_now
 where id = r_room.id;

v_drew := v_drew + 1;
end loop;

  -- خروجی برای لاگ/مانیتورینگ
  RETURN QUERY SELECT v_drew, v_eval, v_fin;
END;$$;


--
-- Name: FUNCTION "fn_manage_room_live_actions"(); Type: COMMENT; Schema: game_core; Owner: -
--

COMMENT ON FUNCTION "game_core"."fn_manage_room_live_actions"() IS 'Main live loop for playing rooms: draws next number, marks tickets, evaluates winners, closes full rooms, and triggers payouts (atomic, safe, triggerless).';


--
-- Name: fn_manage_waiting_rooms(integer, boolean); Type: FUNCTION; Schema: game_core; Owner: -
--

CREATE FUNCTION "game_core"."fn_manage_waiting_rooms"("p_limit" integer DEFAULT 50, "p_capture" boolean DEFAULT false) RETURNS TABLE("room_id" "uuid", "became_live_at" timestamp with time zone, "paid_players" integer)
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'game_core'
    AS $$
DECLARE
  r record;
  v_now timestamptz := now();
  v_active_players integer;
  v_draw_interval integer;
  v_first_draw_delay_sec integer := 7;
  v_jitter_ms integer;
BEGIN
  -- Promote when max_players capacity is reached (ignore starts_at timer).
  FOR r IN
    SELECT
      rm.id,
      COALESCE(rm.max_players, rt.max_players) AS max_players,
      COALESCE((rm.meta ->> 'draw_interval_sec')::int, 3) AS draw_interval_sec
    FROM public.rooms rm
    JOIN public.room_templates rt ON rt.id = rm.room_template_id
    WHERE rm.status = 'waiting'
      AND COALESCE(rm.max_players, rt.max_players) IS NOT NULL
      AND (
        SELECT COUNT(DISTINCT t.player_user_id)
        FROM public.tickets t
        WHERE t.room_id = rm.id
          AND t.reservation_status IN ('reserved','confirmed')
      ) >= COALESCE(rm.max_players, rt.max_players)
    ORDER BY rm.created_at ASC
    LIMIT p_limit
  LOOP
    SELECT COUNT(DISTINCT t.player_user_id)
      INTO v_active_players
      FROM public.tickets t
      WHERE t.room_id = r.id
        AND t.reservation_status IN ('reserved','confirmed');

    v_draw_interval := GREATEST(COALESCE(r.draw_interval_sec, 3), 1);
    v_jitter_ms := public.fn_draw_schedule_jitter_ms(r.id);

    UPDATE public.rooms
       SET status       = 'playing',
           max_players  = COALESCE(max_players, r.max_players),
           meta         = COALESCE(meta, '{}'::jsonb) || jsonb_build_object('max_players', r.max_players),
           next_draw_at = v_now
                        + make_interval(secs => v_first_draw_delay_sec)
                        + (v_jitter_ms * interval '1 millisecond'),
           updated_at   = v_now
     WHERE id = r.id
       AND status = 'waiting';

    room_id        := r.id;
    became_live_at := v_now;
    paid_players   := COALESCE(v_active_players, 0);
    RETURN NEXT;
  END LOOP;

  -- Promote when timer elapsed and min_players reached.
  FOR r IN
    SELECT
      rm.id,
      rm.min_players,
      rm.starts_at,
      rm.next_draw_at,
      COALESCE((rm.meta ->> 'draw_interval_sec')::int, 3) AS draw_interval_sec
    FROM public.rooms rm
    WHERE rm.status = 'waiting'
      AND rm.starts_at IS NOT NULL
      AND v_now >= rm.starts_at
      AND (
        SELECT COUNT(DISTINCT t.player_user_id)
        FROM public.tickets t
        WHERE t.room_id = rm.id
          AND t.reservation_status IN ('reserved','confirmed')
      ) >= GREATEST(COALESCE(rm.min_players, 2), 2)
    ORDER BY rm.starts_at ASC
    LIMIT p_limit
  LOOP
    SELECT COUNT(DISTINCT t.player_user_id)
      INTO v_active_players
      FROM public.tickets t
      WHERE t.room_id = r.id
        AND t.reservation_status IN ('reserved','confirmed');

    v_draw_interval := GREATEST(COALESCE(r.draw_interval_sec, 3), 1);
    v_jitter_ms := public.fn_draw_schedule_jitter_ms(r.id);

    UPDATE public.rooms
       SET status       = 'playing',
           next_draw_at = v_now
                        + make_interval(secs => v_first_draw_delay_sec)
                        + (v_jitter_ms * interval '1 millisecond'),
           updated_at   = v_now
     WHERE id = r.id
       AND status = 'waiting';

    room_id        := r.id;
    became_live_at := v_now;
    paid_players   := COALESCE(v_active_players, 0);
    RETURN NEXT;
  END LOOP;

  -- Extend countdown when timer elapsed but min_players not reached.
  FOR r IN
    SELECT
      rm.id,
      rm.countdown_sec
    FROM public.rooms rm
    WHERE rm.status = 'waiting'
      AND rm.starts_at IS NOT NULL
      AND v_now >= rm.starts_at
      AND (
        SELECT COUNT(DISTINCT t.player_user_id)
        FROM public.tickets t
        WHERE t.room_id = rm.id
          AND t.reservation_status IN ('reserved','confirmed')
      ) < GREATEST(COALESCE(rm.min_players, 2), 2)
    ORDER BY rm.starts_at ASC
    LIMIT p_limit
  LOOP
    UPDATE public.rooms r2
       SET starts_at = v_now + make_interval(secs => COALESCE(r.countdown_sec, 120)),
           updated_at = v_now
     WHERE r2.id = r.id
       AND r2.status = 'waiting';
  END LOOP;

  IF p_capture THEN
    RAISE NOTICE 'wallet capture is disabled during Stage 1';
  END IF;

  RETURN;
END;
$$;


--
-- Name: fn_payout_room("uuid"); Type: FUNCTION; Schema: game_core; Owner: -
--

CREATE FUNCTION "game_core"."fn_payout_room"("p_room" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
BEGIN
  PERFORM game_finance.fn_finish_room_and_settle(p_room);
END;
$$;


--
-- Name: FUNCTION "fn_payout_room"("p_room" "uuid"); Type: COMMENT; Schema: game_core; Owner: -
--

COMMENT ON FUNCTION "game_core"."fn_payout_room"("p_room" "uuid") IS 'Finalizes the game for the given room (p_room) by distributing all payouts and commissions. 
Calculates and credits rewards for Line and Full winners, records agent/super/admin commissions via fn_record_ticket_commission, 
updates player and agent wallets, and marks the room as finished.';


--
-- Name: fn_requeue_failed_draw_jobs(); Type: FUNCTION; Schema: game_core; Owner: -
--

CREATE FUNCTION "game_core"."fn_requeue_failed_draw_jobs"() RETURNS integer
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'game_core', 'game_finance'
    AS $$
DECLARE
  v_count integer;
BEGIN
  UPDATE public.draw_jobs AS dj
     SET status = 'queued',
         attempts = 0,
         updated_at = NOW()
    FROM public.draws AS d
   WHERE dj.room_id = d.room_id
     AND dj.draw_number = d.number
     AND dj.status = 'failed'
     AND d.processed_at IS NULL;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;


--
-- Name: fn_stamp_orphan_draws_on_terminal_rooms(); Type: FUNCTION; Schema: game_core; Owner: -
--

CREATE FUNCTION "game_core"."fn_stamp_orphan_draws_on_terminal_rooms"() RETURNS integer
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_count integer;
BEGIN
  UPDATE public.draws AS d
     SET processed_at = COALESCE(d.processed_at, NOW())
    FROM public.rooms AS r
   WHERE d.room_id = r.id
     AND d.processed_at IS NULL
     AND r.status IN ('finished'::public.room_status, 'settling'::public.room_status, 'cancelled'::public.room_status);
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;


--
-- Name: fn_sync_player_affiliation_for_user("uuid"); Type: FUNCTION; Schema: game_core; Owner: -
--

CREATE FUNCTION "game_core"."fn_sync_player_affiliation_for_user"("p_user_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_user_role text;
  v_parent_id uuid;
  v_parent_role text;
  v_parent_parent_id uuid;
  v_super_role text;
  v_expected_agent_id uuid;
  v_expected_super_id uuid;
begin
  select u.role::text, u.parent_id
    into v_user_role, v_parent_id
  from public.users u
  where u.id = p_user_id;

  if not found or v_user_role is distinct from 'player' then
    delete from public.player_affiliation pa
    where pa.user_id = p_user_id;
    return;
  end if;

  if v_parent_id is null then
    delete from public.player_affiliation pa
    where pa.user_id = p_user_id;
    return;
  end if;

  select p.role::text, p.parent_id
    into v_parent_role, v_parent_parent_id
  from public.users p
  where p.id = v_parent_id;

  v_expected_agent_id := null;
  v_expected_super_id := null;

  if v_parent_role = 'agent' then
    v_expected_agent_id := v_parent_id;
    if v_parent_parent_id is not null then
      select s.role::text
        into v_super_role
      from public.users s
      where s.id = v_parent_parent_id;

      if v_super_role = 'super' then
        v_expected_super_id := v_parent_parent_id;
      end if;
    end if;
  elsif v_parent_role = 'super' then
    v_expected_super_id := v_parent_id;
  end if;

  if v_expected_agent_id is null and v_expected_super_id is null then
    delete from public.player_affiliation pa
    where pa.user_id = p_user_id;
    return;
  end if;

  insert into public.player_affiliation (user_id, agent_id, super_id)
  values (p_user_id, v_expected_agent_id, v_expected_super_id)
  on conflict (user_id) do update
    set agent_id = excluded.agent_id,
        super_id = excluded.super_id;
end;
$$;


--
-- Name: fn_system_join_or_create_room("uuid", "uuid", integer, "text"); Type: FUNCTION; Schema: game_core; Owner: -
--

CREATE FUNCTION "game_core"."fn_system_join_or_create_room"("p_user_id" "uuid", "p_template_id" "uuid", "p_card_count" integer, "p_password" "text") RETURNS TABLE("room_id" "uuid", "starts_at" timestamp with time zone, "ticket_ids" "uuid"[])
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'game_core', 'game_finance'
    AS $$
DECLARE
  v_room_seed      bytea;
  v_room_seed_hash char(64);

  v_user           uuid := p_user_id;

  v_price          numeric;
  v_currency       text;
  v_min_players    int;
  v_cd             int;
  v_max_cards_pp   int;
  v_max_players    int;
  v_pool           uuid;
  v_room           uuid;
  v_room_type      public.room_type;
  v_sched_time     time;
  v_required_password text;

  v_taken          int := 0;
  v_ticket_ids     uuid[] := '{}';
  v_ticket_id      uuid;
  r_card           record;
  v_now            timestamptz := now();
  v_starts_at      timestamptz;
  v_active_players int;
  v_user_in_room   boolean;
BEGIN
  IF auth.role() <> 'service_role' THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  IF p_user_id IS NULL OR p_template_id IS NULL OR p_card_count IS NULL OR p_card_count < 1 THEN
    RAISE EXCEPTION 'invalid input';
  END IF;

  SELECT price,
         currency,
         GREATEST(COALESCE(min_players, 2), 2),
         COALESCE(countdown_sec, 120),
         COALESCE(max_cards_per_player, 999999),
         max_players,
         room_type,
         scheduled_start_time,
         password
    INTO v_price,
         v_currency,
         v_min_players,
         v_cd,
         v_max_cards_pp,
         v_max_players,
         v_room_type,
         v_sched_time,
         v_required_password
  FROM public.room_templates
  WHERE id = p_template_id
    AND status = 'active'::public.room_template_status;

  IF v_price IS NULL THEN
    RAISE EXCEPTION 'room template not found/active: %', p_template_id;
  END IF;

  IF v_room_type <> 'tournament'::public.room_type
     AND v_required_password IS NOT NULL
     AND (p_password IS NULL OR p_password <> v_required_password) THEN
    RAISE EXCEPTION 'invalid room password';
  END IF;

  SELECT id
    INTO v_pool
  FROM public.card_pools
  WHERE is_active = true
  ORDER BY created_at DESC
  LIMIT 1;

  IF v_pool IS NULL THEN
    RAISE EXCEPTION 'no active card pool';
  END IF;

  SELECT r.id, r.starts_at
    INTO v_room, v_starts_at
  FROM public.rooms r
  WHERE r.status = 'waiting'::public.room_status
    AND r.room_template_id = p_template_id
  ORDER BY r.created_at ASC
  LIMIT 1;

  IF v_room IS NULL THEN
    BEGIN
      SELECT seed, seed_hash
        INTO v_room_seed, v_room_seed_hash
      FROM game_core.fn_generate_room_seed();

      INSERT INTO public.rooms AS ins(
        id, room_template_id, status,
        card_price, currency, pool_id,
        starts_at, created_by, meta,
        min_players, max_players, countdown_sec, max_cards_per_player,
        room_seed, room_seed_hash,
        waiting_started_at,
        created_at, updated_at
      )
      VALUES (
        gen_random_uuid(),
        p_template_id,
        'waiting'::public.room_status,
        v_price, v_currency, v_pool,
        CASE
          WHEN v_room_type = 'tournament' AND v_sched_time IS NOT NULL
            THEN (v_now::date + v_sched_time)::timestamptz
          ELSE NULL
        END,
        v_user,
        jsonb_build_object(
          'source', 'template_snapshot',
          'min_players', v_min_players,
          'max_players', v_max_players,
          'countdown_sec', v_cd
        ),
        v_min_players, v_max_players, v_cd, v_max_cards_pp,
        v_room_seed, v_room_seed_hash,
        v_now,
        v_now, v_now
      )
      RETURNING ins.id, ins.starts_at INTO v_room, v_starts_at;

    EXCEPTION
      WHEN unique_violation THEN
        SELECT r.id, r.starts_at
          INTO v_room, v_starts_at
        FROM public.rooms r
        WHERE r.status = 'waiting'::public.room_status
          AND r.room_template_id = p_template_id
        ORDER BY r.created_at ASC
        LIMIT 1;

        IF v_room IS NULL THEN
          RAISE EXCEPTION 'race detected but no waiting room found';
        END IF;
    END;
  END IF;

  PERFORM game_core.fn_ensure_waiting_started_at(v_room, v_now);

  IF v_max_players IS NOT NULL THEN
    UPDATE public.rooms r
       SET max_players = v_max_players,
           meta = COALESCE(r.meta, '{}'::jsonb) || jsonb_build_object('max_players', v_max_players),
           updated_at = v_now
     WHERE r.id = v_room
       AND r.status = 'waiting'::public.room_status
       AND r.max_players IS DISTINCT FROM v_max_players;
  END IF;

  IF v_room_seed IS NULL THEN
    SELECT room_seed INTO v_room_seed
    FROM public.rooms
    WHERE id = v_room;

    IF v_room_seed IS NULL THEN
      RAISE EXCEPTION 'room % has no room_seed', v_room;
    END IF;
  END IF;

  IF v_max_players IS NOT NULL THEN
    SELECT COUNT(DISTINCT t.player_user_id)
      INTO v_active_players
    FROM public.tickets t
    WHERE t.room_id = v_room
      AND t.reservation_status IN ('reserved', 'confirmed');

    SELECT EXISTS (
      SELECT 1
      FROM public.tickets t
      WHERE t.room_id = v_room
        AND t.player_user_id = v_user
        AND t.reservation_status IN ('reserved', 'confirmed', 'consumed')
    )
    INTO v_user_in_room;

    IF v_active_players >= v_max_players AND NOT v_user_in_room THEN
      RAISE EXCEPTION 'room is full';
    END IF;
  END IF;

  IF (
      SELECT COUNT(*)
      FROM public.tickets t_count
      WHERE t_count.room_id = v_room
        AND t_count.player_user_id = v_user
        AND t_count.reservation_status IN ('reserved', 'confirmed', 'consumed')
     ) + p_card_count > v_max_cards_pp
  THEN
    RAISE EXCEPTION 'max_cards_per_player exceeded';
  END IF;

  FOR r_card IN
    SELECT c.id AS pool_card_id, c.card_no
      FROM public.card_pool_cards c
     WHERE c.pool_id = v_pool
       AND (v_room_type = 'tournament' OR c.card_no <= 200)
       AND NOT EXISTS (
         SELECT 1
           FROM public.tickets t
          WHERE t.pool_card_id = c.id
            AND t.room_id = v_room
            AND t.reservation_status IN ('reserved', 'confirmed', 'consumed')
       )
     ORDER BY extensions.digest(
       (encode(v_room_seed, 'hex') || ':' || c.id::text)::bytea,
       'sha256'::text
     )
     LIMIT p_card_count
     FOR UPDATE SKIP LOCKED
  LOOP
    v_taken := v_taken + 1;

    INSERT INTO public.tickets(
      id, room_id, player_user_id, pool_card_id, card_no,
      price, reservation_status, created_at, updated_at
    )
    VALUES (
      gen_random_uuid(), v_room, v_user, r_card.pool_card_id, r_card.card_no,
      v_price, 'reserved',
      v_now, v_now
    )
    RETURNING id INTO v_ticket_id;

    IF NOT (v_room_type = 'tournament'::public.room_type AND COALESCE(v_price, 0) = 0) THEN
      PERFORM game_finance.fn_wallet_hold_join(
        p_user := v_user,
        p_amount := v_price,
        p_currency := v_currency,
        p_room := v_room,
        p_ticket := v_ticket_id
      );

      PERFORM game_finance.fn_record_ticket_commission(v_ticket_id);
    END IF;

    v_ticket_ids := array_append(v_ticket_ids, v_ticket_id);
  END LOOP;

  IF v_taken <> p_card_count THEN
    RAISE EXCEPTION
      'not enough free cards in pool for this room (wanted %, got %)',
      p_card_count, v_taken;
  END IF;

  UPDATE public.rooms r
     SET starts_at = CASE
                       WHEN r.starts_at IS NOT NULL THEN r.starts_at
                       ELSE v_now + make_interval(secs => v_cd)
                     END,
         updated_at = v_now
   WHERE r.id = v_room
  RETURNING r.starts_at INTO v_starts_at;

  PERFORM game_core.fn_try_promote_room_at_max_capacity(v_room);

  room_id := v_room;
  starts_at := v_starts_at;
  ticket_ids := v_ticket_ids;
  RETURN QUERY SELECT room_id, starts_at, ticket_ids;
END;
$$;


--
-- Name: fn_trg_sync_player_affiliation_from_users(); Type: FUNCTION; Schema: game_core; Owner: -
--

CREATE FUNCTION "game_core"."fn_trg_sync_player_affiliation_from_users"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  r record;
begin
  perform game_core.fn_sync_player_affiliation_for_user(new.id);

  if (new.role::text = 'agent' or (tg_op = 'UPDATE' and old.role::text = 'agent')) then
    for r in
      select p.id
      from public.users p
      where p.role = 'player'
        and p.parent_id = new.id
    loop
      perform game_core.fn_sync_player_affiliation_for_user(r.id);
    end loop;
  end if;

  return new;
end;
$$;


--
-- Name: fn_try_promote_room_at_max_capacity("uuid"); Type: FUNCTION; Schema: game_core; Owner: -
--

CREATE FUNCTION "game_core"."fn_try_promote_room_at_max_capacity"("p_room" "uuid") RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'game_core'
    AS $$
DECLARE
  v_max_players integer;
  v_active_players integer;
  v_now timestamptz := now();
  v_jitter_ms integer;
  v_first_draw_delay_sec integer := 7;
BEGIN
  IF p_room IS NULL THEN
    RETURN false;
  END IF;

  SELECT COALESCE(r.max_players, rt.max_players)
    INTO v_max_players
  FROM public.rooms r
  JOIN public.room_templates rt ON rt.id = r.room_template_id
  WHERE r.id = p_room
    AND r.status = 'waiting'::public.room_status;

  IF v_max_players IS NULL THEN
    RETURN false;
  END IF;

  SELECT COUNT(DISTINCT t.player_user_id)
    INTO v_active_players
  FROM public.tickets t
  WHERE t.room_id = p_room
    AND t.reservation_status IN ('reserved', 'confirmed');

  IF COALESCE(v_active_players, 0) < v_max_players THEN
    RETURN false;
  END IF;

  v_jitter_ms := public.fn_draw_schedule_jitter_ms(p_room);

  UPDATE public.rooms r
     SET status = 'playing'::public.room_status,
         max_players = COALESCE(r.max_players, v_max_players),
         meta = COALESCE(r.meta, '{}'::jsonb) || jsonb_build_object('max_players', v_max_players),
         next_draw_at = v_now
                        + make_interval(secs => v_first_draw_delay_sec)
                        + (v_jitter_ms * interval '1 millisecond'),
         updated_at = v_now
   WHERE r.id = p_room
     AND r.status = 'waiting'::public.room_status;

  RETURN FOUND;
END;
$$;


--
-- Name: fn_validate_affiliation_roles(); Type: FUNCTION; Schema: game_core; Owner: -
--

CREATE FUNCTION "game_core"."fn_validate_affiliation_roles"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
declare
  r_user  text;
  r_agent text;
  r_super text;
begin
  -- user_id must be a player (use public.users explicitly)
  select role::text into r_user from public.users where id = new.user_id;
  if r_user is distinct from 'player' then
    raise exception 'user_id must have role=player (now=%)', r_user;
  end if;

  -- if agent_id provided, it must be role=agent
  if new.agent_id is not null then
    select role::text into r_agent from public.users where id = new.agent_id;
    if r_agent is distinct from 'agent' then
      raise exception 'agent_id must have role=agent (now=%)', r_agent;
    end if;
  end if;

  -- if super_id provided, it must be role=super
  if new.super_id is not null then
    select role::text into r_super from public.users where id = new.super_id;
    if r_super is distinct from 'super' then
      raise exception 'super_id must have role=super (now=%)', r_super;
    end if;
  end if;

  return new;
end;
$$;


--
-- Name: rpc_apply_marks_for_draw("uuid", integer); Type: FUNCTION; Schema: game_core; Owner: -
--

CREATE FUNCTION "game_core"."rpc_apply_marks_for_draw"("p_room_id" "uuid", "p_draw_number" integer) RETURNS "void"
    LANGUAGE "plpgsql"
    AS $$BEGIN
  INSERT INTO public.marks(ticket_id, value, created_at)
  SELECT t.id, p_draw_number, now()
  FROM public.tickets t
  JOIN public.card_numbers cn ON cn.pool_card_id = t.pool_card_id
  WHERE t.room_id = p_room_id
    AND cn.value = p_draw_number
    AND NOT EXISTS (
      SELECT 1 FROM public.marks m WHERE m.ticket_id=t.id AND m.value=p_draw_number
    );

  PERFORM public.fn_evaluate_room_after_draw(p_room_id, p_draw_number); -- ارزیابی line/full
END;$$;


--
-- Name: rpc_get_active_rooms("public"."room_status"[], numeric, numeric); Type: FUNCTION; Schema: game_core; Owner: -
--

CREATE FUNCTION "game_core"."rpc_get_active_rooms"("p_only_status" "public"."room_status"[] DEFAULT ARRAY['waiting'::"public"."room_status", 'playing'::"public"."room_status", 'settling'::"public"."room_status"], "p_price_min" numeric DEFAULT NULL::numeric, "p_price_max" numeric DEFAULT NULL::numeric) RETURNS TABLE("room_id" "uuid", "room_code" "text", "status" "public"."room_status", "price" numeric, "currency" "text", "players" integer, "tickets_reserved" integer, "tickets_consumed" integer, "starts_at" timestamp with time zone, "next_draw_at" timestamp with time zone, "min_players" integer, "countdown_sec" integer, "draw_interval_sec" integer)
    LANGUAGE "sql" STABLE
    AS $$
  SELECT
    r.id                           AS room_id,
    r.room_code,
    r.status,
    r.card_price                   AS price,
    r.currency,
    COUNT(DISTINCT t.player_user_id)
      FILTER (WHERE t.reservation_status IN ('reserved','confirmed')) AS players,
    COUNT(*) FILTER (WHERE t.reservation_status = 'reserved')  AS tickets_reserved,
    COUNT(*) FILTER (WHERE t.reservation_status = 'consumed')  AS tickets_consumed,
    r.starts_at,
    r.next_draw_at,
    COALESCE(r.min_players, (r.meta->>'min_players')::int, 2)  AS min_players,
    COALESCE(r.countdown_sec, (r.meta->>'countdown_sec')::int, 120) AS countdown_sec,
    COALESCE((r.meta->>'draw_interval_sec')::int, 3)           AS draw_interval_sec
  FROM public.rooms r
  LEFT JOIN public.tickets t ON t.room_id = r.id
  WHERE r.status = ANY (p_only_status)
    AND (p_price_min IS NULL OR r.card_price >= p_price_min)
    AND (p_price_max IS NULL OR r.card_price <= p_price_max)
  GROUP BY r.id
  ORDER BY r.card_price, r.starts_at NULLS LAST, r.updated_at DESC;
$$;


--
-- Name: FUNCTION "rpc_get_active_rooms"("p_only_status" "public"."room_status"[], "p_price_min" numeric, "p_price_max" numeric); Type: COMMENT; Schema: game_core; Owner: -
--

COMMENT ON FUNCTION "game_core"."rpc_get_active_rooms"("p_only_status" "public"."room_status"[], "p_price_min" numeric, "p_price_max" numeric) IS 'Lobby feed: list active rooms (waiting/playing/settling by default) with player counts and timing. Optional price filters.';


--
-- Name: rpc_get_lobby_price_summary("public"."room_status"[]); Type: FUNCTION; Schema: game_core; Owner: -
--

CREATE FUNCTION "game_core"."rpc_get_lobby_price_summary"("p_only_status" "public"."room_status"[] DEFAULT ARRAY['waiting'::"public"."room_status", 'playing'::"public"."room_status", 'settling'::"public"."room_status"]) RETURNS TABLE("price" numeric, "currency" "text", "waiting_rooms" integer, "playing_rooms" integer, "total_rooms" integer, "players" integer)
    LANGUAGE "sql" STABLE
    AS $$
  WITH room_base AS (
    SELECT r.id, r.card_price AS price, r.currency, r.status
    FROM public.rooms r
    WHERE r.status = ANY (p_only_status)
  ),
  players_per_room AS (
    SELECT t.room_id,
           COUNT(DISTINCT t.player_user_id)
             FILTER (WHERE t.reservation_status IN ('reserved','confirmed')) AS players
    FROM public.tickets t
    GROUP BY t.room_id
  )
  SELECT
    rb.price,
    rb.currency,
    COUNT(*) FILTER (WHERE rb.status = 'waiting') AS waiting_rooms,
    COUNT(*) FILTER (WHERE rb.status = 'playing') AS playing_rooms,
    COUNT(*)                                   AS total_rooms,
    COALESCE(SUM(ppr.players), 0)              AS players
  FROM room_base rb
  LEFT JOIN players_per_room ppr ON ppr.room_id = rb.id
  GROUP BY rb.price, rb.currency
  ORDER BY rb.price;
$$;


--
-- Name: FUNCTION "rpc_get_lobby_price_summary"("p_only_status" "public"."room_status"[]); Type: COMMENT; Schema: game_core; Owner: -
--

COMMENT ON FUNCTION "game_core"."rpc_get_lobby_price_summary"("p_only_status" "public"."room_status"[]) IS 'Lobby summary grouped by price/currency: counts of waiting/playing rooms (settling included in defaults) and total players.';


--
-- Name: rpc_get_room_seed_hash("uuid"); Type: FUNCTION; Schema: game_core; Owner: -
--

CREATE FUNCTION "game_core"."rpc_get_room_seed_hash"("p_room_id" "uuid") RETURNS character
    LANGUAGE "plpgsql"
    AS $$
declare
  v_hash char(64);
begin
  select room_seed_hash
    into v_hash
  from public.rooms
  where id = p_room_id;

  if v_hash is null then
    raise exception 'room % not found or has no room_seed_hash', p_room_id;
  end if;

  return v_hash;
end;
$$;


--
-- Name: rpc_pick_draw_jobs(integer); Type: FUNCTION; Schema: game_core; Owner: -
--

CREATE FUNCTION "game_core"."rpc_pick_draw_jobs"("p_limit" integer DEFAULT 200) RETURNS TABLE("id" bigint, "room_id" "uuid", "draw_number" integer, "status" "text", "attempts" integer, "created_at" timestamp with time zone, "updated_at" timestamp with time zone)
    LANGUAGE "plpgsql"
    AS $$BEGIN
  RETURN QUERY
  WITH picked AS (
    SELECT j.id
    FROM public.draw_jobs AS j
    WHERE j.status = 'queued'
    ORDER BY j.created_at
    FOR UPDATE SKIP LOCKED
    LIMIT p_limit
  )
  UPDATE public.draw_jobs AS j
     SET status     = 'processing',
         attempts   = j.attempts + 1,
         updated_at = NOW()
    FROM picked p
   WHERE j.id = p.id
  RETURNING
    j.id,
    j.room_id,
    j.draw_number,
    j.status,
    j.attempts,
    j.created_at,
    j.updated_at;
END;$$;


--
-- Name: rpc_pick_draw_jobs(integer, integer, integer); Type: FUNCTION; Schema: game_core; Owner: -
--

CREATE FUNCTION "game_core"."rpc_pick_draw_jobs"("p_limit" integer DEFAULT 200, "p_worker_id" integer DEFAULT 1, "p_total_workers" integer DEFAULT 1) RETURNS TABLE("id" bigint, "room_id" "uuid", "draw_number" integer, "status" "text", "attempts" integer, "created_at" timestamp with time zone, "updated_at" timestamp with time zone)
    LANGUAGE "plpgsql"
    AS $$
DECLARE
  v_job_ids bigint[];
BEGIN
  -- ابتدا Jobها را انتخاب و UPDATE می‌کنیم
  WITH available_jobs AS (
    SELECT 
      dj.id,
      -- استفاده از ABS برای اطمینان از مقدار مثبت
      ABS(MOD(hashtext(dj.room_id::text), p_total_workers)) as worker_hash
    FROM public.draw_jobs dj
    WHERE dj.status = 'queued'
    FOR UPDATE SKIP LOCKED
    LIMIT p_limit * p_total_workers
  ),
  worker_jobs AS (
    SELECT aj.id
    FROM available_jobs aj
    WHERE aj.worker_hash = p_worker_id - 1
    LIMIT p_limit
  )
  SELECT ARRAY_AGG(wj.id) INTO v_job_ids
  FROM worker_jobs wj;
  
  -- اگر Jobی پیدا نشد، خروج
  IF v_job_ids IS NULL OR array_length(v_job_ids, 1) IS NULL THEN
    RETURN;
  END IF;
  
  -- UPDATE Jobها (با استفاده از alias برای جلوگیری از ambiguous)
  UPDATE public.draw_jobs AS dj
  SET status = 'processing',
      attempts = dj.attempts + 1,
      updated_at = NOW()
  WHERE dj.id = ANY(v_job_ids);
  
  -- Return Jobها
  RETURN QUERY
  SELECT 
    dj2.id,
    dj2.room_id,
    dj2.draw_number,
    dj2.status,
    dj2.attempts,
    dj2.created_at,
    dj2.updated_at
  FROM public.draw_jobs dj2
  WHERE dj2.id = ANY(v_job_ids)
  ORDER BY dj2.created_at;
END;
$$;


--
-- Name: rpc_reveal_room_seed("uuid"); Type: FUNCTION; Schema: game_core; Owner: -
--

CREATE FUNCTION "game_core"."rpc_reveal_room_seed"("p_room_id" "uuid", OUT "room_id" "uuid", OUT "room_seed" "bytea", OUT "room_seed_hash" character, OUT "status" "public"."room_status") RETURNS "record"
    LANGUAGE "plpgsql"
    AS $$
begin
  -- load room data
  select id, room_seed, room_seed_hash, status
    into room_id, room_seed, room_seed_hash, status
  from public.rooms
  where id = p_room_id;

  if room_id is null then
    raise exception 'room % not found', p_room_id;
  end if;

  if room_seed is null or room_seed_hash is null then
    raise exception 'room % has no seed or seed_hash', p_room_id;
  end if;

  if status <> 'finished' then
    raise exception 'room % is not finished yet (status = %)', p_room_id, status;
  end if;

  -- outputs are already set via SELECT ... INTO
  return;
end;
$$;


--
-- Name: set_rooms_updated_at(); Type: FUNCTION; Schema: game_core; Owner: -
--

CREATE FUNCTION "game_core"."set_rooms_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$begin new.updated_at = now(); return new; end;$$;


--
-- Name: signup_player_with_code("text", "text", "text", "text", "text"); Type: FUNCTION; Schema: game_core; Owner: -
--

CREATE FUNCTION "game_core"."signup_player_with_code"("p_invitation_code" "text", "p_username" "text", "p_nickname" "text" DEFAULT NULL::"text", "p_country" "text" DEFAULT NULL::"text", "p_language" "text" DEFAULT 'fa'::"text") RETURNS TABLE("user_id" "uuid", "username" "text", "wallet_id" "uuid", "agent_id" "uuid", "super_id" "uuid")
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
  v_link invitation_links%ROWTYPE;
  v_user_id uuid;
  v_wallet_id uuid;
  v_agent_id uuid;
  v_super_id uuid;
  v_inviter_role user_role;
BEGIN
  -- پیدا کردن و بررسی لینک
  SELECT * INTO v_link
  FROM invitation_links
  WHERE code = upper(trim(p_invitation_code))
    AND is_active = true
    AND (expires_at IS NULL OR expires_at > now())
    AND (max_uses IS NULL OR current_uses < max_uses);
  
  IF NOT FOUND THEN
    RAISE EXCEPTION 'کد دعوت معتبر نیست یا منقضی شده است';
  END IF;
  
  -- بررسی یکتایی username
  IF EXISTS (SELECT 1 FROM users WHERE username = p_username) THEN
    RAISE EXCEPTION 'نام کاربری قبلاً استفاده شده است';
  END IF;
  
  -- ساخت کاربر با نقش player
  INSERT INTO users (
    username,
    role,
    status
  )
  VALUES (
    p_username,
    'player'::user_role,
    'active'::user_status
  )
  RETURNING id INTO v_user_id;
  
  -- ساخت پروفایل
  INSERT INTO user_profiles (
    user_id,
    nickname,
    country,
    language
  )
  VALUES (
    v_user_id,
    p_nickname,
    p_country,
    p_language
  );
  
  -- تعیین agent_id و super_id بر اساس inviter_role
  v_inviter_role := v_link.inviter_role;
  
  IF v_inviter_role = 'agent' THEN
    -- اگر inviter یک agent است
    v_agent_id := v_link.inviter_id;
    
    -- پیدا کردن super_id از طریق player_affiliation این agent
    SELECT super_id INTO v_super_id
    FROM player_affiliation
    WHERE user_id = v_link.inviter_id
    LIMIT 1;
    
  ELSIF v_inviter_role = 'super' THEN
    -- اگر inviter یک super است
    v_super_id := v_link.inviter_id;
    
  ELSIF v_inviter_role = 'admin' THEN
    -- admin می‌تواند مستقیماً player بسازد
    -- اما player باید حداقل یک agent یا super داشته باشد
    -- در این حالت، admin خودش را به عنوان super قرار می‌دهیم (یا می‌توانید NULL بگذارید)
    -- برای اطمینان از constraint، یک super پیش‌فرض پیدا می‌کنیم
    SELECT id INTO v_super_id
    FROM users
    WHERE role = 'super'
    LIMIT 1;
    
    IF v_super_id IS NULL THEN
      RAISE EXCEPTION 'هیچ super موجود نیست. لطفاً ابتدا یک super ایجاد کنید.';
    END IF;
  END IF;
  
  -- ساخت player_affiliation
  -- طبق constraint، player باید حداقل یک agent یا super داشته باشد
  IF v_agent_id IS NOT NULL OR v_super_id IS NOT NULL THEN
    INSERT INTO player_affiliation (
      user_id,
      agent_id,
      super_id
    )
    VALUES (
      v_user_id,
      v_agent_id,
      v_super_id
    );
  ELSE
    -- این حالت نباید رخ دهد، اما برای اطمینان
    RAISE EXCEPTION 'Player must have at least one agent or super';
  END IF;
  
  -- ساخت wallet
  INSERT INTO wallets (
    user_id,
    balance,
    currency
  )
  VALUES (
    v_user_id,
    0,
    'IRR'
  )
  RETURNING id INTO v_wallet_id;
  
  -- افزایش تعداد استفاده از لینک
  UPDATE invitation_links
  SET 
    current_uses = current_uses + 1,
    updated_at = now()
  WHERE id = v_link.id;
  
  -- لاگ ثبت‌نام
  INSERT INTO player_signups (
    invitation_link_id,
    player_id
  )
  VALUES (
    v_link.id,
    v_user_id
  );
  
  -- برگرداندن نتیجه
  RETURN QUERY
  SELECT 
    v_user_id,
    p_username,
    v_wallet_id,
    v_agent_id,
    v_super_id;
END;
$$;


--
-- Name: FUNCTION "signup_player_with_code"("p_invitation_code" "text", "p_username" "text", "p_nickname" "text", "p_country" "text", "p_language" "text"); Type: COMMENT; Schema: game_core; Owner: -
--

COMMENT ON FUNCTION "game_core"."signup_player_with_code"("p_invitation_code" "text", "p_username" "text", "p_nickname" "text", "p_country" "text", "p_language" "text") IS 'ثبت‌نام player از طریق کد دعوت. این تابع رکورد دیتابیس می‌سازد.
برای authentication باید از Supabase Auth استفاده شود.';


--
-- Name: trg_after_draw_enqueue(); Type: FUNCTION; Schema: game_core; Owner: -
--

CREATE FUNCTION "game_core"."trg_after_draw_enqueue"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  INSERT INTO public.draw_jobs (
      room_id,
      draw_number,
      status,
      attempts,
      created_at,
      updated_at
  )
  VALUES (
      NEW.room_id,
      NEW.number,
      'queued',
      0,
      now(),
      now()
  )
  ON CONFLICT (room_id, draw_number) DO NOTHING;

  PERFORM pg_notify('draw_job_enqueued', NEW.room_id::text);

  RETURN NEW;
END;
$$;


--
-- Name: trg_rooms_stamp_waiting_started_at(); Type: FUNCTION; Schema: game_core; Owner: -
--

CREATE FUNCTION "game_core"."trg_rooms_stamp_waiting_started_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  IF NEW.status = 'waiting'::public.room_status THEN
    IF TG_OP = 'INSERT'
       OR OLD.status IS DISTINCT FROM 'waiting'::public.room_status THEN
      IF NEW.waiting_started_at IS NULL THEN
        NEW.waiting_started_at := COALESCE(NEW.created_at, clock_timestamp());
      END IF;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;


--
-- Name: validate_invitation_code("text"); Type: FUNCTION; Schema: game_core; Owner: -
--

CREATE FUNCTION "game_core"."validate_invitation_code"("p_code" "text") RETURNS TABLE("is_valid" boolean, "inviter_name" "text", "inviter_role" "text", "message" "text", "expires_at" timestamp with time zone)
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
  v_link invitation_links%ROWTYPE;
  v_inviter_name text;
  v_inviter_role text;
BEGIN
  -- پیدا کردن لینک
  SELECT * INTO v_link
  FROM invitation_links
  WHERE code = upper(trim(p_code));
  
  IF NOT FOUND THEN
    RETURN QUERY 
    SELECT false, NULL::text, NULL::text, 'کد معتبر نیست'::text, NULL::timestamptz;
    RETURN;
  END IF;
  
  -- بررسی فعال بودن
  IF NOT v_link.is_active THEN
    RETURN QUERY 
    SELECT false, NULL::text, NULL::text, 'لینک غیرفعال است'::text, v_link.expires_at;
    RETURN;
  END IF;
  
  -- بررسی انقضا
  IF v_link.expires_at IS NOT NULL AND v_link.expires_at < now() THEN
    RETURN QUERY 
    SELECT false, NULL::text, NULL::text, 'لینک منقضی شده است'::text, v_link.expires_at;
    RETURN;
  END IF;
  
  -- بررسی محدودیت تعداد استفاده
  IF v_link.max_uses IS NOT NULL AND v_link.current_uses >= v_link.max_uses THEN
    RETURN QUERY 
    SELECT false, NULL::text, NULL::text, 'لینک به حداکثر استفاده رسیده است'::text, v_link.expires_at;
    RETURN;
  END IF;
  
  -- گرفتن نام دعوت‌کننده (اصلاح شده)
  SELECT 
    COALESCE(up.nickname, u.username, 'نامشخص'),
    u.role::text
  INTO 
    v_inviter_name,
    v_inviter_role
  FROM users u
  LEFT JOIN user_profiles up ON u.id = up.user_id
  WHERE u.id = v_link.inviter_id;
  
  -- برگرداندن نتیجه معتبر
  RETURN QUERY 
  SELECT 
    true, 
    v_inviter_name, 
    v_inviter_role,
    'کد معتبر است'::text, 
    v_link.expires_at;
END;
$$;


--
-- Name: fn_consume_room_tickets("uuid"); Type: FUNCTION; Schema: game_finance; Owner: -
--

CREATE FUNCTION "game_finance"."fn_consume_room_tickets"("p_room" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
BEGIN
  RAISE EXCEPTION 'deprecated: tickets are consumed inside fn_finish_room_and_settle';
END;
$$;


--
-- Name: fn_distribute_ticket_commission("uuid", "uuid"); Type: FUNCTION; Schema: game_finance; Owner: -
--

CREATE FUNCTION "game_finance"."fn_distribute_ticket_commission"("p_ticket" "uuid", "p_admin_user" "uuid" DEFAULT NULL::"uuid") RETURNS numeric
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
  c record;
  v_currency text;
  v_admin_user uuid;
  v_rollup_amount numeric := 0;
BEGIN
  SELECT *
    INTO c
  FROM public.commissions_log
  WHERE ticket_id = p_ticket
  FOR UPDATE;

  IF NOT FOUND THEN
    PERFORM game_finance.fn_record_ticket_commission(p_ticket);
    SELECT * INTO c
    FROM public.commissions_log
    WHERE ticket_id = p_ticket
    FOR UPDATE;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'commission log not found for ticket %', p_ticket;
    END IF;
  END IF;

  IF c.status IS DISTINCT FROM 'pending' THEN
    RETURN 0;
  END IF;

  SELECT currency INTO v_currency
  FROM public.rooms
  WHERE id = c.room_id;

  IF p_admin_user IS NOT NULL THEN
    SELECT u.id
      INTO v_admin_user
    FROM public.users u
    WHERE u.id = p_admin_user
      AND u.role = 'admin'
      AND (u.status IS NULL OR u.status = 'active'::public.user_status)
    LIMIT 1;
  END IF;

  IF v_admin_user IS NULL THEN
    SELECT u.id
      INTO v_admin_user
    FROM public.users u
    WHERE u.role = 'admin'
      AND u.admin_sub_role IS NULL
      AND (u.status IS NULL OR u.status = 'active'::public.user_status)
    ORDER BY u.created_at
    LIMIT 1;
  END IF;

  IF v_admin_user IS NULL THEN
    SELECT u.id
      INTO v_admin_user
    FROM public.users u
    WHERE u.role = 'admin'
      AND (u.status IS NULL OR u.status = 'active'::public.user_status)
    ORDER BY u.created_at
    LIMIT 1;
  END IF;

  IF v_admin_user IS NULL THEN
    RAISE EXCEPTION 'no admin user available for commission payout';
  END IF;

  IF c.agent_id IS NOT NULL AND c.agent_amount > 0 THEN
    BEGIN
      PERFORM game_finance.fn_wallet_apply_delta(
        p_user_id := c.agent_id,
        p_currency := v_currency,
        p_amount_delta := c.agent_amount,
        p_transaction_type := 'fee_agent',
        p_source_kind := 'ticket_commission',
        p_source_ref := c.ticket_id::text,
        p_description := 'ticket commission (agent)',
        p_meta := jsonb_build_object('room_id', c.room_id, 'ticket_id', c.ticket_id),
        p_allow_negative := false
      );
    EXCEPTION
      WHEN OTHERS THEN
        v_rollup_amount := v_rollup_amount + c.agent_amount;
    END;
  END IF;

  IF c.super_id IS NOT NULL AND c.super_amount > 0 THEN
    BEGIN
      PERFORM game_finance.fn_wallet_apply_delta(
        p_user_id := c.super_id,
        p_currency := v_currency,
        p_amount_delta := c.super_amount,
        p_transaction_type := 'fee_super',
        p_source_kind := 'ticket_commission',
        p_source_ref := c.ticket_id::text,
        p_description := 'ticket commission (super)',
        p_meta := jsonb_build_object('room_id', c.room_id, 'ticket_id', c.ticket_id),
        p_allow_negative := false
      );
    EXCEPTION
      WHEN OTHERS THEN
        v_rollup_amount := v_rollup_amount + c.super_amount;
    END;
  END IF;

  IF (c.admin_amount + v_rollup_amount) > 0 THEN
    PERFORM game_finance.fn_wallet_apply_delta(
      p_user_id := v_admin_user,
      p_currency := v_currency,
      p_amount_delta := c.admin_amount + v_rollup_amount,
      p_transaction_type := 'fee_admin',
      p_source_kind := 'ticket_commission',
      p_source_ref := c.ticket_id::text,
      p_description := 'ticket commission (admin remainder)',
      p_meta := jsonb_build_object('room_id', c.room_id, 'ticket_id', c.ticket_id),
      p_allow_negative := false
    );
  END IF;

  UPDATE public.commissions_log
     SET distributed_at = now(),
         admin_amount   = c.admin_amount + v_rollup_amount,
         status         = 'settled'
   WHERE id = c.id;

  RETURN GREATEST(COALESCE(c.amount_to_pool, 0), 0);
END;
$$;


--
-- Name: fn_finish_room_and_settle("uuid", "uuid"); Type: FUNCTION; Schema: game_finance; Owner: -
--

CREATE FUNCTION "game_finance"."fn_finish_room_and_settle"("p_room" "uuid", "p_admin_user" "uuid" DEFAULT NULL::"uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
  v_room record;
  v_now timestamptz := now();
  rec_ticket record;
  rec_comm record;
  rec_result record;
  v_total_pool numeric := 0;
  v_line_pct numeric;
  v_full_pct numeric;
  v_line_pool numeric := 0;
  v_full_pool numeric := 0;
  v_line_winners integer := 0;
  v_full_winners integer := 0;
  v_line_share numeric := 0;
  v_full_share numeric := 0;
  v_currency text;
BEGIN
  SELECT r.*,
         COALESCE(r.line_reward_percentage, rt.line_reward_percentage, 0.5) AS __line_pct,
         COALESCE(r.full_reward_percentage, rt.full_reward_percentage, 0.5) AS __full_pct
    INTO v_room
  FROM public.rooms r
  LEFT JOIN public.room_templates rt ON rt.id = r.room_template_id
  WHERE r.id = p_room
  FOR UPDATE OF r;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'room % not found', p_room;
  END IF;

  IF v_room.status = 'finished' THEN
    RAISE NOTICE 'fn_finish_room_and_settle: room % already finished', p_room;
    RETURN;
  END IF;

  IF v_room.status <> 'settling' THEN
    RAISE EXCEPTION 'room % is not settling (status=%)', p_room, v_room.status;
  END IF;

  v_currency := v_room.currency;
  v_line_pct := GREATEST(COALESCE(v_room.__line_pct, 0), 0);
  v_full_pct := GREATEST(COALESCE(v_room.__full_pct, 0), 0);

  IF v_line_pct = 0 AND v_full_pct = 0 THEN
    v_line_pct := 0.5;
    v_full_pct := 0.5;
  END IF;

  IF (v_line_pct + v_full_pct) > 1 THEN
    v_line_pct := v_line_pct / (v_line_pct + v_full_pct);
    v_full_pct := 1 - v_line_pct;
  END IF;

  FOR rec_ticket IN
    WITH updated AS (
      UPDATE public.tickets
         SET reservation_status = 'consumed'::public.reservation_status,
             updated_at = v_now
       WHERE room_id = p_room
         AND reservation_status IN ('reserved','confirmed')
       RETURNING id, player_user_id, price
    )
    SELECT * FROM updated
  LOOP
    PERFORM game_finance.fn_wallet_capture_join(
      rec_ticket.player_user_id,
      rec_ticket.price,
      v_currency,
      p_room,
      rec_ticket.id
    );
  END LOOP;

  FOR rec_comm IN
    SELECT ticket_id
      FROM public.commissions_log
     WHERE room_id = p_room
       AND status = 'pending'
     FOR UPDATE
  LOOP
    v_total_pool := v_total_pool + COALESCE(game_finance.fn_distribute_ticket_commission(rec_comm.ticket_id, p_admin_user), 0);
  END LOOP;

  v_line_pool := ROUND(v_total_pool * v_line_pct, 2);
  v_full_pool := ROUND(v_total_pool - v_line_pool, 2);

  SELECT COUNT(*)
    INTO v_line_winners
  FROM public.results
  WHERE room_id = p_room
    AND win_type = 'line'
    AND paid_at IS NULL;

  SELECT COUNT(*)
    INTO v_full_winners
  FROM public.results
  WHERE room_id = p_room
    AND win_type = 'full'
    AND paid_at IS NULL;

  IF v_line_winners = 0 THEN
    v_full_pool := v_full_pool + v_line_pool;
    v_line_pool := 0;
  END IF;

  IF v_line_winners > 0 THEN
    v_line_share := CASE WHEN v_line_pool > 0 THEN ROUND(v_line_pool / v_line_winners, 2) ELSE 0 END;

    FOR rec_result IN
      SELECT id, user_id, ticket_id
      FROM public.results
      WHERE room_id = p_room
        AND win_type = 'line'
        AND paid_at IS NULL
      FOR UPDATE
    LOOP
      IF v_line_share > 0 THEN
        PERFORM game_finance.fn_wallet_apply_delta(
          p_user_id := rec_result.user_id,
          p_currency := v_currency,
          p_amount_delta := v_line_share,
          p_transaction_type := 'win',
          p_source_kind := 'room_settlement',
          p_source_ref := p_room::text,
          p_description := 'room line prize payout',
          p_meta := jsonb_build_object('room_id', p_room, 'ticket_id', rec_result.ticket_id, 'win_type', 'line'),
          p_allow_negative := false
        );
      END IF;

      UPDATE public.results
         SET reward_amount = COALESCE(reward_amount, 0) + v_line_share,
             paid_at = v_now
       WHERE id = rec_result.id;
    END LOOP;
  END IF;

  IF v_full_winners > 0 THEN
    v_full_share := CASE WHEN v_full_pool > 0 THEN ROUND(v_full_pool / v_full_winners, 2) ELSE 0 END;

    FOR rec_result IN
      SELECT id, user_id, ticket_id
      FROM public.results
      WHERE room_id = p_room
        AND win_type = 'full'
        AND paid_at IS NULL
      FOR UPDATE
    LOOP
      IF v_full_share > 0 THEN
        PERFORM game_finance.fn_wallet_apply_delta(
          p_user_id := rec_result.user_id,
          p_currency := v_currency,
          p_amount_delta := v_full_share,
          p_transaction_type := 'win',
          p_source_kind := 'room_settlement',
          p_source_ref := p_room::text,
          p_description := 'room full prize payout',
          p_meta := jsonb_build_object('room_id', p_room, 'ticket_id', rec_result.ticket_id, 'win_type', 'full'),
          p_allow_negative := false
        );
      END IF;

      UPDATE public.results
         SET reward_amount = COALESCE(reward_amount, 0) + v_full_share,
             paid_at = v_now
       WHERE id = rec_result.id;
    END LOOP;
  END IF;

  UPDATE public.rooms
     SET status = 'finished',
         prize_paid_at = v_now,
         line_prize_pool = 0,
         full_prize_pool = 0,
         ends_at = COALESCE(ends_at, v_now),
         updated_at = v_now
   WHERE id = p_room;

  RAISE NOTICE 'room % settled: total_pool=%, line_winners=%, full_winners=%',
    p_room, v_total_pool, v_line_winners, v_full_winners;
END;
$$;


--
-- Name: fn_ledger_signed_amount("public"."transaction_type", numeric); Type: FUNCTION; Schema: game_finance; Owner: -
--

CREATE FUNCTION "game_finance"."fn_ledger_signed_amount"("p_type" "public"."transaction_type", "p_amount" numeric) RETURNS numeric
    LANGUAGE "sql" IMMUTABLE
    AS $$
  SELECT CASE
    WHEN p_type::text IN (
      'deposit', 'win', 'refund', 'adjustment',
      'fee_admin', 'fee_agent', 'fee_super',
      'join_refund', 'transfer_in'
    ) THEN p_amount
    WHEN p_type::text IN (
      'withdraw', 'bet', 'join', 'join_hold', 'transfer_out', 'join_capture'
    ) THEN -p_amount
    ELSE 0
  END;
$$;


--
-- Name: fn_lock_commission_snapshot(); Type: FUNCTION; Schema: game_finance; Owner: -
--

CREATE FUNCTION "game_finance"."fn_lock_commission_snapshot"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  -- اگر هر کدام از فیلدهای اسنپ‌شات بعداً تغییر کند، خطا بده
  IF (NEW.gross_amount     IS DISTINCT FROM OLD.gross_amount)     OR
     (NEW.commission_base  IS DISTINCT FROM OLD.commission_base)  OR
     (NEW.commission_rate  IS DISTINCT FROM OLD.commission_rate)  OR
     (NEW.agent_id         IS DISTINCT FROM OLD.agent_id)         OR
     (NEW.agent_rate       IS DISTINCT FROM OLD.agent_rate)       OR
     (NEW.super_id         IS DISTINCT FROM OLD.super_id)         OR
     (NEW.super_rate       IS DISTINCT FROM OLD.super_rate)       OR
     (NEW.admin_amount     IS DISTINCT FROM OLD.admin_amount)     OR
     (NEW.agent_amount     IS DISTINCT FROM OLD.agent_amount)     OR
     (NEW.super_amount     IS DISTINCT FROM OLD.super_amount)     OR
     (NEW.currency         IS DISTINCT FROM OLD.currency)
  THEN
     RAISE EXCEPTION 'Commission snapshots are immutable after insert';
  END IF;

  RETURN NEW;
END;
$$;


--
-- Name: fn_payout_room_prize("uuid"); Type: FUNCTION; Schema: game_finance; Owner: -
--

CREATE FUNCTION "game_finance"."fn_payout_room_prize"("p_room" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
BEGIN
  PERFORM game_finance.fn_finish_room_and_settle(p_room);
END;
$$;


--
-- Name: fn_payout_winners("uuid"); Type: FUNCTION; Schema: game_finance; Owner: -
--

CREATE FUNCTION "game_finance"."fn_payout_winners"("p_room" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
BEGIN
  PERFORM game_finance.fn_finish_room_and_settle(p_room);
END;
$$;


--
-- Name: fn_recon_money_conservation(); Type: FUNCTION; Schema: game_finance; Owner: -
--

CREATE FUNCTION "game_finance"."fn_recon_money_conservation"() RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'game_finance'
    AS $$
DECLARE
  v_transfer_in numeric;
  v_transfer_out numeric;
  v_manual_deposit numeric;
  v_manual_withdraw numeric;
  v_join_hold numeric;
  v_join_refund numeric;
  v_fees numeric;
  v_wins numeric;
  v_balance_sum numeric;
  v_locked_sum numeric;
BEGIN
  SELECT coalesce(sum(amount),0) INTO v_transfer_in
  FROM public.transactions WHERE type = 'transfer_in' AND status = 'completed';
  SELECT coalesce(sum(amount),0) INTO v_transfer_out
  FROM public.transactions WHERE type = 'transfer_out' AND status = 'completed';

  SELECT coalesce(sum(amount),0) INTO v_manual_deposit
  FROM public.transactions
  WHERE type = 'deposit' AND source_kind = 'manual_panel' AND status = 'completed';
  SELECT coalesce(sum(amount),0) INTO v_manual_withdraw
  FROM public.transactions
  WHERE type = 'withdraw' AND source_kind = 'manual_panel' AND status = 'completed';

  SELECT coalesce(sum(amount),0) INTO v_join_hold
  FROM public.transactions WHERE type = 'join_hold' AND status = 'completed';
  SELECT coalesce(sum(amount),0) INTO v_join_refund
  FROM public.transactions WHERE type = 'join_refund' AND status = 'completed';

  SELECT coalesce(sum(amount),0) INTO v_fees
  FROM public.transactions
  WHERE type IN ('fee_admin','fee_agent','fee_super') AND status = 'completed';
  SELECT coalesce(sum(amount),0) INTO v_wins
  FROM public.transactions WHERE type = 'win' AND status = 'completed';

  SELECT coalesce(sum(balance),0), coalesce(sum(locked_amount),0)
    INTO v_balance_sum, v_locked_sum
  FROM public.wallets WHERE currency = 'IRR';

  RETURN jsonb_build_object(
    'transfers', jsonb_build_object(
      'transfer_in', v_transfer_in,
      'transfer_out', v_transfer_out,
      'net', v_transfer_in - v_transfer_out,
      'ok', abs(v_transfer_in - v_transfer_out) < 0.009
    ),
    'treasury_injection', jsonb_build_object(
      'manual_panel_deposit', v_manual_deposit,
      'manual_panel_withdraw', v_manual_withdraw,
      'net_injection', v_manual_deposit - v_manual_withdraw
    ),
    'game_cycle', jsonb_build_object(
      'join_hold', v_join_hold,
      'join_refund', v_join_refund,
      'net_captured_approx', v_join_hold - v_join_refund,
      'fees_reminted', v_fees,
      'wins_reminted', v_wins,
      'fees_plus_wins', v_fees + v_wins,
      'note', 'Room capture has no ledger row; compare hold-refund vs fees+wins as approximation. Tournament guarantee is included in wins when paid.'
    ),
    'liability', jsonb_build_object(
      'balance_sum', v_balance_sum,
      'locked_sum', v_locked_sum,
      'liability', v_balance_sum + v_locked_sum
    ),
    'ok', abs(v_transfer_in - v_transfer_out) < 0.009
  );
END;
$$;


--
-- Name: fn_recon_run_and_store(); Type: FUNCTION; Schema: game_finance; Owner: -
--

CREATE FUNCTION "game_finance"."fn_recon_run_and_store"() RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'game_finance'
    AS $$
DECLARE
  v_wl jsonb;
  v_mc jsonb;
  v_status text;
  v_id bigint;
BEGIN
  v_wl := game_finance.fn_recon_wallet_ledger(200);
  v_mc := game_finance.fn_recon_money_conservation();
  v_status := CASE
    WHEN (v_wl->>'ok')::boolean AND (v_mc->>'ok')::boolean THEN 'ok'
    ELSE 'drift'
  END;

  INSERT INTO public.finance_recon_reports (kind, status, summary, details)
  VALUES (
    'combined',
    v_status,
    jsonb_build_object(
      'wallet_ledger_ok', (v_wl->>'ok')::boolean,
      'conservation_ok', (v_mc->>'ok')::boolean,
      'drift_count', (v_wl->>'drift_count')::int
    ),
    jsonb_build_object('wallet_ledger', v_wl, 'money_conservation', v_mc)
  )
  RETURNING id INTO v_id;

  RETURN jsonb_build_object(
    'report_id', v_id,
    'status', v_status,
    'wallet_ledger', v_wl,
    'money_conservation', v_mc
  );
END;
$$;


--
-- Name: fn_recon_wallet_ledger(integer); Type: FUNCTION; Schema: game_finance; Owner: -
--

CREATE FUNCTION "game_finance"."fn_recon_wallet_ledger"("p_limit" integer DEFAULT 500) RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'game_finance'
    AS $$
DECLARE
  v_drifts jsonb := '[]'::jsonb;
  v_count int := 0;
  v_checked int := 0;
  r record;
BEGIN
  FOR r IN
    SELECT w.user_id, w.currency, w.balance::numeric AS balance,
           coalesce((
             SELECT sum(t.balance_after - t.balance_before)
             FROM public.transactions t
             WHERE t.user_id = w.user_id AND t.currency = w.currency
               AND t.status = 'completed'
               AND t.balance_before IS NOT NULL
               AND t.balance_after IS NOT NULL
           ), 0)::numeric AS projection
    FROM public.wallets w
    WHERE w.currency = 'IRR'
  LOOP
    v_checked := v_checked + 1;
    IF abs(r.balance - r.projection) > 0.009 THEN
      v_count := v_count + 1;
      IF v_count <= p_limit THEN
        v_drifts := v_drifts || jsonb_build_array(jsonb_build_object(
          'user_id', r.user_id,
          'currency', r.currency,
          'balance', r.balance,
          'projection', r.projection,
          'delta', r.balance - r.projection
        ));
      END IF;
    END IF;
  END LOOP;

  RETURN jsonb_build_object(
    'checked', v_checked,
    'drift_count', v_count,
    'drifts', v_drifts,
    'ok', v_count = 0
  );
END;
$$;


--
-- Name: fn_record_ticket_commission("uuid"); Type: FUNCTION; Schema: game_finance; Owner: -
--

CREATE FUNCTION "game_finance"."fn_record_ticket_commission"("p_ticket" "uuid") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
  v_room uuid;
  v_player uuid;
  v_price numeric;
  v_currency text;
  v_rate_room numeric := 0;
  v_total_comm numeric := 0;
  v_agent uuid;
  v_super uuid;
  v_agent_rate numeric := 0;
  v_super_rate numeric := 0;
  v_agent_amount numeric := 0;
  v_super_amount numeric := 0;
  v_admin_amount numeric := 0;
  v_amount_to_pool numeric := 0;
BEGIN
  PERFORM 1 FROM public.commissions_log WHERE ticket_id = p_ticket;
  IF FOUND THEN
    RETURN p_ticket;
  END IF;

  SELECT t.room_id,
         t.player_user_id,
         t.price,
         r.currency
    INTO v_room,
         v_player,
         v_price,
         v_currency
  FROM public.tickets t
  JOIN public.rooms r ON r.id = t.room_id
  WHERE t.id = p_ticket
    AND t.reservation_status IN ('reserved','confirmed','consumed');

  IF v_room IS NULL OR v_price IS NULL THEN
    RAISE EXCEPTION 'ticket % not found or not reserved/confirmed', p_ticket;
  END IF;

  SELECT COALESCE(r.commission_rate, rt.commission_rate, 0)
    INTO v_rate_room
  FROM public.rooms r
  LEFT JOIN public.room_templates rt ON rt.id = r.room_template_id
  WHERE r.id = v_room;

  IF v_rate_room > 1 THEN
    v_rate_room := v_rate_room / 100;
  END IF;

  SELECT pa.agent_id, pa.super_id
    INTO v_agent, v_super
  FROM public.player_affiliation pa
  WHERE pa.user_id = v_player;

  IF v_agent IS NOT NULL THEN
    SELECT COALESCE(uc.agent_commission, 0)
      INTO v_agent_rate
    FROM public.user_commissions uc
    WHERE uc.user_id = v_agent;

    IF NOT FOUND OR v_agent_rate IS NULL THEN
      v_agent_rate := 0;
    ELSIF v_agent_rate > 1 THEN
      v_agent_rate := v_agent_rate / 100;
    END IF;
  END IF;

  IF v_super IS NOT NULL THEN
    SELECT COALESCE(uc.super_commission, 0)
      INTO v_super_rate
    FROM public.user_commissions uc
    WHERE uc.user_id = v_super;

    IF NOT FOUND OR v_super_rate IS NULL THEN
      v_super_rate := 0;
    ELSIF v_super_rate > 1 THEN
      v_super_rate := v_super_rate / 100;
    END IF;
  END IF;

  v_total_comm   := CEIL(v_price * v_rate_room);
  v_agent_amount := COALESCE(CEIL(v_total_comm * v_agent_rate), 0);
  v_super_amount := COALESCE(CEIL(v_total_comm * GREATEST(v_super_rate - v_agent_rate, 0)), 0);
  v_admin_amount := GREATEST(v_total_comm - v_agent_amount - v_super_amount, 0);
  v_amount_to_pool := GREATEST(v_price - v_total_comm, 0);

  INSERT INTO public.commissions_log(
    ticket_id, room_id, player_id,
    gross_amount, commission_rate, commission_base,
    agent_id, super_id,
    agent_rate, super_rate,
    agent_amount, super_amount, admin_amount,
    amount_to_pool, status
  ) VALUES (
    p_ticket, v_room, v_player,
    v_price, v_rate_room, v_total_comm,
    v_agent, v_super,
    COALESCE(v_agent_rate,0), COALESCE(v_super_rate,0),
    v_agent_amount, v_super_amount, v_admin_amount,
    v_amount_to_pool, 'pending'
  )
  ON CONFLICT (ticket_id) DO NOTHING;

  RETURN p_ticket;
END;
$$;


--
-- Name: fn_wallet_add("uuid", numeric, "text", "text", "public"."transaction_type", "uuid"); Type: FUNCTION; Schema: game_finance; Owner: -
--

CREATE FUNCTION "game_finance"."fn_wallet_add"("p_user" "uuid", "p_amount" numeric, "p_currency" "text", "p_desc" "text", "p_type" "public"."transaction_type", "p_room" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE v_wallet uuid;
BEGIN
  SELECT id INTO v_wallet FROM public.wallets
  WHERE user_id=p_user FOR UPDATE;

  IF v_wallet IS NULL THEN
    RAISE EXCEPTION 'wallet not found for user %', p_user;
  END IF;

  UPDATE public.wallets
     SET balance = balance + p_amount,
         updated_at = now()
   WHERE id = v_wallet;

  INSERT INTO public.transactions(
    id, wallet_id, user_id, type, amount, currency,
    description, room_id, created_at
  )
  VALUES (
    gen_random_uuid(), v_wallet, p_user,
    p_type, p_amount, p_currency,
    p_desc, p_room, now()
  );
END;$$;


--
-- Name: fn_wallet_apply_delta("uuid", "text", numeric, "public"."transaction_type", "text", "text", "text", "jsonb", boolean, "text"); Type: FUNCTION; Schema: game_finance; Owner: -
--

CREATE FUNCTION "game_finance"."fn_wallet_apply_delta"("p_user_id" "uuid", "p_currency" "text", "p_amount_delta" numeric, "p_transaction_type" "public"."transaction_type", "p_source_kind" "text", "p_source_ref" "text" DEFAULT NULL::"text", "p_description" "text" DEFAULT NULL::"text", "p_meta" "jsonb" DEFAULT '{}'::"jsonb", "p_allow_negative" boolean DEFAULT false, "p_idempotency_key" "text" DEFAULT NULL::"text") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'game_finance'
    AS $$
DECLARE
  v_wallet_id uuid;
  v_wallet_balance numeric;
  v_balance_before numeric;
  v_balance_after numeric;
  v_transaction_id uuid;
  v_room_id uuid;
  v_ticket_id uuid;
  v_existing record;
  v_existing_delta numeric;
  v_key text;
BEGIN
  v_key := NULLIF(btrim(COALESCE(p_idempotency_key, '')), '');

  IF p_amount_delta = 0 THEN
    RAISE EXCEPTION 'zero amount not allowed';
  END IF;

  -- Serialize duplicate keys within a transaction (and across backends via advisory lock)
  IF v_key IS NOT NULL THEN
    PERFORM pg_advisory_xact_lock(hashtextextended(v_key, 0));
    SELECT t.id, t.user_id, t.balance_before, t.balance_after, t.type, t.currency
      INTO v_existing
    FROM public.transactions t
    WHERE t.idempotency_key = v_key
    LIMIT 1;
    IF FOUND THEN
      v_existing_delta := (v_existing.balance_after - v_existing.balance_before);
      IF v_existing.user_id IS DISTINCT FROM p_user_id
         OR v_existing.currency IS DISTINCT FROM p_currency
         OR v_existing_delta IS DISTINCT FROM p_amount_delta
         OR v_existing.type IS DISTINCT FROM p_transaction_type THEN
        RAISE EXCEPTION 'idempotency_payload_mismatch'
          USING ERRCODE = '22023';
      END IF;
      RETURN v_existing.id;
    END IF;
  END IF;

  SELECT id, balance INTO v_wallet_id, v_wallet_balance
  FROM public.wallets
  WHERE user_id = p_user_id AND currency = p_currency
  FOR UPDATE;

  IF v_wallet_id IS NULL THEN
    INSERT INTO public.wallets (user_id, currency, balance, locked_amount, created_at, updated_at)
    VALUES (p_user_id, p_currency, 0, 0, now(), now())
    RETURNING id, balance INTO v_wallet_id, v_wallet_balance;
  END IF;

  v_balance_before := v_wallet_balance;
  v_balance_after := v_balance_before + p_amount_delta;

  IF NOT p_allow_negative AND v_balance_after < 0 THEN
    RAISE EXCEPTION 'insufficient funds: balance would be %', v_balance_after;
  END IF;

  v_room_id := NULL;
  v_ticket_id := NULL;
  IF p_meta IS NOT NULL THEN
    IF p_meta ? 'room_id' THEN
      v_room_id := (p_meta->>'room_id')::uuid;
    END IF;
    IF p_meta ? 'ticket_id' THEN
      v_ticket_id := (p_meta->>'ticket_id')::uuid;
    END IF;
  END IF;

  UPDATE public.wallets
  SET balance = v_balance_after,
      updated_at = now()
  WHERE id = v_wallet_id;

  INSERT INTO public.transactions (
    id, wallet_id, user_id, type, status, amount, currency, description,
    balance_before, balance_after, source_kind, source_ref, room_id, ticket_id,
    idempotency_key, created_at
  ) VALUES (
    gen_random_uuid(), v_wallet_id, p_user_id, p_transaction_type, 'completed',
    ABS(p_amount_delta), p_currency, COALESCE(p_description, 'wallet adjustment'),
    v_balance_before, v_balance_after, p_source_kind, p_source_ref, v_room_id, v_ticket_id,
    v_key, now()
  )
  RETURNING id INTO v_transaction_id;

  RETURN v_transaction_id;
END;
$$;


--
-- Name: fn_wallet_capture("uuid", numeric, "text", "uuid"); Type: FUNCTION; Schema: game_finance; Owner: -
--

CREATE FUNCTION "game_finance"."fn_wallet_capture"("p_user" "uuid", "p_amount" numeric, "p_currency" "text", "p_room" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE v_wallet uuid;
BEGIN
  SELECT id INTO v_wallet FROM public.wallets
  WHERE user_id=p_user FOR UPDATE;

  IF v_wallet IS NULL THEN
    RAISE EXCEPTION 'wallet not found for user %', p_user;
  END IF;

  UPDATE public.wallets
     SET locked_amount = locked_amount - p_amount,
         updated_at = now()
   WHERE id = v_wallet;

  INSERT INTO public.transactions(
    id, wallet_id, user_id, type, amount, currency,
    description, room_id, created_at
  )
  VALUES (
    gen_random_uuid(), v_wallet, p_user,
    'bet'::transaction_type, p_amount, p_currency,
    'capture after room start', p_room, now()
  );
END;$$;


--
-- Name: fn_wallet_capture_and_distribute("uuid"); Type: FUNCTION; Schema: game_finance; Owner: -
--

CREATE FUNCTION "game_finance"."fn_wallet_capture_and_distribute"("p_room" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
BEGIN
  RAISE EXCEPTION 'deprecated: use game_finance.fn_finish_room_and_settle instead';
END;
$$;


--
-- Name: fn_wallet_capture_join("uuid", numeric, "text", "uuid", "uuid"); Type: FUNCTION; Schema: game_finance; Owner: -
--

CREATE FUNCTION "game_finance"."fn_wallet_capture_join"("p_user" "uuid", "p_amount" numeric, "p_currency" "text", "p_room" "uuid", "p_ticket" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
  v_wallet uuid;
  v_locked numeric;
BEGIN
  IF p_amount < 0 THEN
    RAISE EXCEPTION 'amount must be non-negative';
  END IF;

  IF p_amount = 0 THEN
    RETURN;
  END IF;

  SELECT id, locked_amount
    INTO v_wallet, v_locked
  FROM public.wallets
  WHERE user_id = p_user
    AND currency = p_currency
  FOR UPDATE;

  IF v_wallet IS NULL THEN
    RAISE EXCEPTION 'wallet not found for user %', p_user;
  END IF;

  IF v_locked < p_amount THEN
    RAISE EXCEPTION 'insufficient locked amount for capture';
  END IF;

  UPDATE public.wallets
     SET locked_amount = locked_amount - p_amount,
         updated_at    = now()
   WHERE id = v_wallet;
END;
$$;


--
-- Name: fn_wallet_deposit("uuid", numeric, "text", "text"); Type: FUNCTION; Schema: game_finance; Owner: -
--

CREATE FUNCTION "game_finance"."fn_wallet_deposit"("p_user" "uuid", "p_amount" numeric, "p_currency" "text", "p_desc" "text" DEFAULT 'deposit'::"text") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
  v_wallet uuid;
  v_tx uuid;
BEGIN
  IF p_amount <= 0 THEN
    RAISE EXCEPTION 'amount must be positive';
  END IF;

  SELECT id FROM public.wallets WHERE user_id = p_user FOR UPDATE INTO v_wallet;
  IF v_wallet IS NULL THEN
    RAISE EXCEPTION 'wallet not found for user %', p_user;
  END IF;

  UPDATE public.wallets
     SET balance = balance + p_amount,
         updated_at = now()
   WHERE id = v_wallet;

  INSERT INTO public.transactions(
    id, wallet_id, user_id, type, amount, currency, description, created_at
  )
  VALUES (
    gen_random_uuid(), v_wallet, p_user, 'deposit'::transaction_type,
    p_amount, p_currency, COALESCE(p_desc,'deposit'), now()
  )
  RETURNING id INTO v_tx;

  RETURN v_tx;
END;
$$;


--
-- Name: fn_wallet_hold_join("uuid", numeric, "text", "uuid"); Type: FUNCTION; Schema: game_finance; Owner: -
--

CREATE FUNCTION "game_finance"."fn_wallet_hold_join"("p_user" "uuid", "p_amount" numeric, "p_currency" "text", "p_room" "uuid") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
BEGIN
  RETURN game_finance.fn_wallet_hold_join(p_user, p_amount, p_currency, p_room, NULL);
END;
$$;


--
-- Name: fn_wallet_hold_join("uuid", numeric, "text", "uuid", "uuid"); Type: FUNCTION; Schema: game_finance; Owner: -
--

CREATE FUNCTION "game_finance"."fn_wallet_hold_join"("p_user" "uuid", "p_amount" numeric, "p_currency" "text", "p_room" "uuid", "p_ticket" "uuid") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
  v_wallet uuid;
  v_free numeric;
  v_tx uuid;
BEGIN
  IF p_amount < 0 THEN
    RAISE EXCEPTION 'amount must be non-negative';
  END IF;

  IF p_amount = 0 THEN
    RETURN NULL;
  END IF;

  SELECT id, balance
    INTO v_wallet, v_free
  FROM public.wallets
  WHERE user_id = p_user
    AND currency = p_currency
  FOR UPDATE;

  IF v_wallet IS NULL THEN
    RAISE EXCEPTION 'wallet not found for user %', p_user;
  END IF;

  IF v_free < p_amount THEN
    RAISE EXCEPTION 'insufficient free balance';
  END IF;

  SELECT game_finance.fn_wallet_apply_delta(
           p_user_id         := p_user,
           p_currency        := p_currency,
           p_amount_delta    := -p_amount,
           p_transaction_type:= 'join_hold',
           p_source_kind     := 'room_join',
           p_source_ref      := p_room::text,
           p_description     := 'hold for room join',
           p_meta            := jsonb_build_object(
                                  'room_id',   p_room,
                                  'ticket_id', p_ticket
                                ),
           p_allow_negative  := false
         )
    INTO v_tx;

  UPDATE public.wallets
     SET locked_amount = locked_amount + p_amount,
         updated_at    = now()
   WHERE id = v_wallet;

  RETURN v_tx;
END;
$$;


--
-- Name: fn_wallet_release("uuid", numeric, "text", "uuid"); Type: FUNCTION; Schema: game_finance; Owner: -
--

CREATE FUNCTION "game_finance"."fn_wallet_release"("p_user" "uuid", "p_amount" numeric, "p_currency" "text", "p_room" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE v_wallet uuid;
BEGIN
  SELECT id INTO v_wallet FROM public.wallets
  WHERE user_id=p_user FOR UPDATE;

  IF v_wallet IS NULL THEN
    RAISE EXCEPTION 'wallet not found for user %', p_user;
  END IF;

  UPDATE public.wallets
     SET locked_amount = locked_amount - p_amount,
         balance = balance + p_amount,
         updated_at = now()
   WHERE id = v_wallet;

  INSERT INTO public.transactions(
    id, wallet_id, user_id, type, amount, currency,
    description, room_id, created_at
  )
  VALUES (
    gen_random_uuid(), v_wallet, p_user,
    'refund'::transaction_type, p_amount, p_currency,
    'release hold', p_room, now()
  );
END;$$;


--
-- Name: fn_wallet_release_join("uuid"); Type: FUNCTION; Schema: game_finance; Owner: -
--

CREATE FUNCTION "game_finance"."fn_wallet_release_join"("p_ticket" "uuid") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
  v_user uuid;
  v_room uuid;
  v_amount numeric;
  v_currency text;
BEGIN
  SELECT t.player_user_id,
         t.room_id,
         t.price,
         r.currency
    INTO v_user,
         v_room,
         v_amount,
         v_currency
  FROM public.tickets t
  JOIN public.rooms r ON r.id = t.room_id
  WHERE t.id = p_ticket;

  IF v_user IS NULL THEN
    RAISE EXCEPTION 'ticket % not found', p_ticket;
  END IF;

  RETURN game_finance.fn_wallet_release_join(
    p_user   := v_user,
    p_amount := v_amount,
    p_currency := v_currency,
    p_room   := v_room,
    p_ticket := p_ticket
  );
END;
$$;


--
-- Name: fn_wallet_release_join("uuid", numeric, "text", "uuid"); Type: FUNCTION; Schema: game_finance; Owner: -
--

CREATE FUNCTION "game_finance"."fn_wallet_release_join"("p_user" "uuid", "p_amount" numeric, "p_currency" "text", "p_room" "uuid") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
BEGIN
  RETURN game_finance.fn_wallet_release_join(p_user, p_amount, p_currency, p_room, NULL);
END;
$$;


--
-- Name: fn_wallet_release_join("uuid", numeric, "text", "uuid", "uuid"); Type: FUNCTION; Schema: game_finance; Owner: -
--

CREATE FUNCTION "game_finance"."fn_wallet_release_join"("p_user" "uuid", "p_amount" numeric, "p_currency" "text", "p_room" "uuid", "p_ticket" "uuid") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
  v_wallet uuid;
  v_locked numeric;
  v_tx uuid;
BEGIN
  IF p_amount < 0 THEN
    RAISE EXCEPTION 'amount must be non-negative';
  END IF;

  IF p_amount = 0 THEN
    RETURN NULL;
  END IF;

  SELECT id, locked_amount
    INTO v_wallet, v_locked
  FROM public.wallets
  WHERE user_id = p_user
    AND currency = p_currency
  FOR UPDATE;

  IF v_wallet IS NULL THEN
    RAISE EXCEPTION 'wallet not found for user %', p_user;
  END IF;

  IF v_locked < p_amount THEN
    RAISE EXCEPTION 'insufficient locked amount';
  END IF;

  SELECT game_finance.fn_wallet_apply_delta(
           p_user_id         := p_user,
           p_currency        := p_currency,
           p_amount_delta    := p_amount,
           p_transaction_type:= 'join_refund',
           p_source_kind     := 'room_join',
           p_source_ref      := p_room::text,
           p_description     := 'release hold',
           p_meta            := jsonb_build_object(
                                  'room_id',   p_room,
                                  'ticket_id', p_ticket
                                ),
           p_allow_negative  := false
         )
    INTO v_tx;

  UPDATE public.wallets
     SET locked_amount = locked_amount - p_amount,
         updated_at    = now()
   WHERE id = v_wallet;

  RETURN v_tx;
END;
$$;


--
-- Name: fn_wallet_subtract("uuid", numeric, "text", "text", "public"."transaction_type", "uuid"); Type: FUNCTION; Schema: game_finance; Owner: -
--

CREATE FUNCTION "game_finance"."fn_wallet_subtract"("p_user" "uuid", "p_amount" numeric, "p_currency" "text", "p_desc" "text", "p_type" "public"."transaction_type", "p_room" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE v_wallet uuid;
BEGIN
  SELECT id INTO v_wallet FROM public.wallets
  WHERE user_id=p_user FOR UPDATE;

  IF v_wallet IS NULL THEN
    RAISE EXCEPTION 'wallet not found for user %', p_user;
  END IF;

  IF (SELECT balance - locked_amount FROM public.wallets WHERE id=v_wallet) < p_amount THEN
    RAISE EXCEPTION 'insufficient available balance';
  END IF;

  UPDATE public.wallets
     SET balance = balance - p_amount,
         updated_at = now()
   WHERE id = v_wallet;

  INSERT INTO public.transactions(
    id, wallet_id, user_id, type, amount, currency,
    description, room_id, created_at
  )
  VALUES (
    gen_random_uuid(), v_wallet, p_user,
    p_type, p_amount, p_currency,
    p_desc, p_room, now()
  );
END;$$;


--
-- Name: fn_wallet_summary("uuid", "text", timestamp with time zone, "uuid"); Type: FUNCTION; Schema: game_finance; Owner: -
--

CREATE FUNCTION "game_finance"."fn_wallet_summary"("p_user" "uuid", "p_currency" "text" DEFAULT NULL::"text", "p_since" timestamp with time zone DEFAULT NULL::timestamp with time zone, "p_room" "uuid" DEFAULT NULL::"uuid") RETURNS TABLE("user_id" "uuid", "balance" numeric, "locked_amount" numeric, "available" numeric, "inflow_total" numeric, "outflow_total" numeric, "net_total" numeric, "sum_deposit" numeric, "sum_withdraw" numeric, "sum_join" numeric, "sum_bet" numeric, "sum_win" numeric, "sum_refund" numeric, "sum_adj" numeric, "sum_fee_admin" numeric, "sum_fee_agent" numeric, "sum_fee_super" numeric, "last_tx_at" timestamp with time zone)
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
BEGIN
  RETURN QUERY
  WITH w AS (
    SELECT w.user_id, w.balance, w.locked_amount, w.balance AS available
    FROM public.wallets w
    WHERE w.user_id = p_user
    FOR SHARE
  ),
  f AS (
    SELECT t.*
    FROM public.transactions t
    WHERE t.user_id = p_user
      AND (p_currency IS NULL OR t.currency = p_currency)
      AND (p_since IS NULL OR t.created_at >= p_since)
      AND (p_room  IS NULL OR t.room_id = p_room)
  ),
  a AS (
    SELECT
      COALESCE(SUM(CASE WHEN t.type IN ('deposit','win','refund') THEN t.amount ELSE 0 END), 0) AS inflow_total,
      COALESCE(SUM(CASE WHEN t.type IN ('withdraw','join','bet','adjustment','fee_admin','fee_agent','fee_super') THEN t.amount ELSE 0 END), 0) AS outflow_total,
      COALESCE(SUM(CASE WHEN t.type='deposit'    THEN t.amount ELSE 0 END), 0) AS sum_deposit,
      COALESCE(SUM(CASE WHEN t.type='withdraw'   THEN t.amount ELSE 0 END), 0) AS sum_withdraw,
      COALESCE(SUM(CASE WHEN t.type='join'       THEN t.amount ELSE 0 END), 0) AS sum_join,
      COALESCE(SUM(CASE WHEN t.type='bet'        THEN t.amount ELSE 0 END), 0) AS sum_bet,
      COALESCE(SUM(CASE WHEN t.type='win'        THEN t.amount ELSE 0 END), 0) AS sum_win,
      COALESCE(SUM(CASE WHEN t.type='refund'     THEN t.amount ELSE 0 END), 0) AS sum_refund,
      COALESCE(SUM(CASE WHEN t.type='adjustment' THEN t.amount ELSE 0 END), 0) AS sum_adj,
      COALESCE(SUM(CASE WHEN t.type='fee_admin'  THEN t.amount ELSE 0 END), 0) AS sum_fee_admin,
      COALESCE(SUM(CASE WHEN t.type='fee_agent'  THEN t.amount ELSE 0 END), 0) AS sum_fee_agent,
      COALESCE(SUM(CASE WHEN t.type='fee_super'  THEN t.amount ELSE 0 END), 0) AS sum_fee_super,
      MAX(t.created_at) AS last_tx_at
    FROM f t
  )
  SELECT
    w.user_id,
    w.balance,
    w.locked_amount,
    w.available,
    a.inflow_total,
    a.outflow_total,
    (a.inflow_total - a.outflow_total) AS net_total,
    a.sum_deposit,
    a.sum_withdraw,
    a.sum_join,
    a.sum_bet,
    a.sum_win,
    a.sum_refund,
    a.sum_adj,
    a.sum_fee_admin,
    a.sum_fee_agent,
    a.sum_fee_super,
    a.last_tx_at
  FROM w
  LEFT JOIN a ON true;
END;
$$;


--
-- Name: fn_wallet_withdraw("uuid", numeric, "text", "text"); Type: FUNCTION; Schema: game_finance; Owner: -
--

CREATE FUNCTION "game_finance"."fn_wallet_withdraw"("p_user" "uuid", "p_amount" numeric, "p_currency" "text", "p_desc" "text" DEFAULT 'withdraw'::"text") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
  v_wallet uuid;
  v_free   numeric;
  v_tx     uuid;
BEGIN
  IF p_amount <= 0 THEN
    RAISE EXCEPTION 'amount must be positive';
  END IF;

  SELECT id
    INTO v_wallet
  FROM public.wallets
  WHERE user_id = p_user
    AND currency = p_currency
  FOR UPDATE;

  IF v_wallet IS NULL THEN
    RAISE EXCEPTION 'wallet not found';
  END IF;

  SELECT balance
    INTO v_free
  FROM public.wallets
  WHERE id = v_wallet;

  IF v_free < p_amount THEN
    RAISE EXCEPTION 'insufficient free balance';
  END IF;

  UPDATE public.wallets
     SET balance = balance - p_amount,
         updated_at = now()
   WHERE id = v_wallet;

  INSERT INTO public.transactions(
    id, wallet_id, user_id, type, amount, currency, description, created_at
  )
  VALUES (
    gen_random_uuid(), v_wallet, p_user, 'withdraw'::transaction_type,
    p_amount, p_currency, COALESCE(p_desc,'withdraw'), now()
  )
  RETURNING id INTO v_tx;

  RETURN v_tx;
END;
$$;


--
-- Name: set_wallets_updated_at(); Type: FUNCTION; Schema: game_finance; Owner: -
--

CREATE FUNCTION "game_finance"."set_wallets_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$begin
  new.updated_at = now();
  return new;
end;$$;


--
-- Name: trg_rooms_after_live(); Type: FUNCTION; Schema: game_finance; Owner: -
--

CREATE FUNCTION "game_finance"."trg_rooms_after_live"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$BEGIN
 -- IF NEW.status IN ('live','playing') AND OLD.status = 'waiting' THEN
 --   PERFORM game_finance.fn_record_ticket_commission(NEW.id, t.id)
  --  FROM tickets t
  --  WHERE t.room_id = NEW.id AND t.reservation_status = 'paid';
  --END IF;
  RETURN NEW;
END;$$;


--
-- Name: trg_tickets_after_paid(); Type: FUNCTION; Schema: game_finance; Owner: -
--

CREATE FUNCTION "game_finance"."trg_tickets_after_paid"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
BEGIN
  IF TG_OP = 'UPDATE'
     AND NEW.reservation_status = 'consumed'::reservation_status
     AND (OLD.reservation_status IS DISTINCT FROM 'consumed'::reservation_status) THEN
    RAISE LOG 'trg_tickets_after_paid skip distribution for ticket=%; handled during room settle', NEW.id;
  END IF;
  RETURN NEW;
END;
$$;


--
-- Name: activate_card_pool("uuid"); Type: FUNCTION; Schema: game_pool; Owner: -
--

CREATE FUNCTION "game_pool"."activate_card_pool"("p_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql"
    AS $$--جزئیات: همهٔ رکوردهای card_pools به‌جز p_id را is_active=false می‌کند و سپس -- رکورد p_id را is_active=true می‌کند؛ تضمین می‌کند همیشه دقیقاً یک Pool فع
begin
  update card_pools set is_active = false where is_active = true and id <> p_id;
  update card_pools set is_active = true where id = p_id;
end$$;


--
-- Name: FUNCTION "activate_card_pool"("p_id" "uuid"); Type: COMMENT; Schema: game_pool; Owner: -
--

COMMENT ON FUNCTION "game_pool"."activate_card_pool"("p_id" "uuid") IS 'Activates the specified card pool (by p_id) and deactivates all other pools so that exactly one pool remains active at any time. Updates card_pools.is_active flags accordingly.';


--
-- Name: fn_retain_last_n_pools(integer); Type: FUNCTION; Schema: game_pool; Owner: -
--

CREATE FUNCTION "game_pool"."fn_retain_last_n_pools"("p_keep" integer DEFAULT 5) RETURNS integer
    LANGUAGE "plpgsql"
    AS $$DECLARE
  v_deleted integer := 0;
BEGIN
  WITH ranked AS (
    SELECT id, row_number() OVER (ORDER BY created_at DESC) AS rn
    FROM card_pools
  ),
  to_delete AS (
    SELECT id FROM ranked WHERE rn > p_keep
  )
  DELETE FROM card_pools cp
  USING to_delete td
  WHERE cp.id = td.id
  RETURNING 1 INTO v_deleted;

  RETURN COALESCE(v_deleted, 0);
END;$$;


--
-- Name: FUNCTION "fn_retain_last_n_pools"("p_keep" integer); Type: COMMENT; Schema: game_pool; Owner: -
--

COMMENT ON FUNCTION "game_pool"."fn_retain_last_n_pools"("p_keep" integer) IS 'Keeps only the most recent N card pools (defined by p_limit) and deletes older ones along with their related cards and numbers, 
to reduce database size and maintain performance.';


--
-- Name: fn_sync_card_numbers(); Type: FUNCTION; Schema: game_pool; Owner: -
--

CREATE FUNCTION "game_pool"."fn_sync_card_numbers"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $_$declare
  v_grid jsonb;
begin
  -- اگر کارت خالی شد: پاک و خروج
  if new.card_data is null then
    delete from public.card_numbers where pool_card_id = new.id;
    return new;
  end if;

  -- پشتیبانی هر دو فرمت: {"grid":[...]} یا [[...]]
  v_grid := coalesce( (new.card_data->'grid')::jsonb, new.card_data::jsonb );

  -- پاکسازی رکوردهای قبلی همین کارت
  delete from public.card_numbers where pool_card_id = new.id;

  -- استخراج و درج سلول‌ها (نادیده‌گرفتن خانه‌های خالی/غیرعددی)
  with rows as (
    select new.id as pool_card_id,
           r.row_no::smallint,
           r.row_elem::jsonb as row_json
    from jsonb_array_elements(v_grid) with ordinality as r(row_elem, row_no)
    where jsonb_typeof(v_grid) = 'array'
  ),
  cells as (
    select
      pool_card_id,
      row_no,
      c.col_no::smallint as col_no,
      case
        when jsonb_typeof(c.cell) = 'number' then (c.cell)::int
        when jsonb_typeof(c.cell) = 'string'
             and trim(both '"' from (c.cell)::text) ~ '^\d+$'
          then trim(both '"' from (c.cell)::text)::int
        else null
      end as value
    from rows
    cross join lateral jsonb_array_elements(rows.row_json) with ordinality as c(cell, col_no)
  )
  insert into public.card_numbers (pool_card_id, row_no, col_no, value)
  select pool_card_id, row_no, col_no, value
  from cells
  where value is not null;  -- فقط اعداد واقعی

  return new;
end;$_$;


--
-- Name: generate_card_pool_housie("uuid"); Type: FUNCTION; Schema: game_pool; Owner: -
--

CREATE FUNCTION "game_pool"."generate_card_pool_housie"("p_created_by" "uuid" DEFAULT NULL::"uuid") RETURNS "uuid"
    LANGUAGE "plpgsql"
    AS $$declare
  v_pool_id uuid;
  col_min int[] := array[1,10,20,30,40,50,60,70,80]; -- شروع هر ستون
  col_max int[] := array[9,19,29,39,49,59,69,79,90]; -- پایان هر ستون
  col_cnt int[];                 -- تعداد خانه‌های هر ستون (بین 0..3، مجموع=15)
  row_cnt int[];                 -- تعداد پرشده‌های هر ردیف
  grid int[];                    -- آرایه 3x9 (اندیس 1..27)؛ صفر = خالی
  c int; r int; k int; extra int; i int; n int;
  nums int[]; picked int[]; pos int[];
  card_json jsonb;
begin
  -- 1) نسخه جدید کارت‌پول
  insert into card_pools (created_by, is_active)
  values (p_created_by, false)
  returning id into v_pool_id;

  -- 2) ساخت 500 کارت 3x9
  for n in 1..500 loop
    -- 2.1: تعیین تعداد هر ستون: ابتدا همه 0، سپس تضمین 1 برای 9 ستون، بعد 6 عدد اضافه توزیع تا سقف 3
    col_cnt := array[0,0,0,0,0,0,0,0,0];
    for i in 1..9 loop col_cnt[i] := 1; end loop;
    extra := 6;
    while extra > 0 loop
      i := 1 + floor(random()*9)::int;
      if col_cnt[i] < 3 then
        col_cnt[i] := col_cnt[i] + 1;
        extra := extra - 1;
      end if;
    end loop;

    -- 2.2: چیدمان در ردیف‌ها تا هر ردیف دقیقاً 5 عدد داشته باشد
    row_cnt := array[0,0,0];                 -- ردیف‌های 1..3
    grid := array_fill(0, array[27]);        -- 3*9 خانه

    for c in 1..9 loop
      k := col_cnt[c];
      if k = 0 then continue; end if;

      -- ردیف‌های مجاز برای این ستون (بر اساس کمترین تعداد فعلی)
      pos := array[]::int[];
      while array_length(pos,1) is null or array_length(pos,1) < k loop
        r := 1 + floor(random()*3)::int;
        if row_cnt[r] < 5 and not (pos @> array[r]) then
          pos := pos || r;
        end if;
      end loop;

      -- 2.3: انتخاب k عدد یکتا از بازه ستون و صعودی
      nums := array[]::int[];
      while array_length(nums,1) is null or array_length(nums,1) < k loop
        i := col_min[c] + floor(random()*(col_max[c]-col_min[c]+1))::int;
        if not (nums @> array[i]) then nums := nums || i; end if;
      end loop;
      nums := (select array_agg(x order by x) from unnest(nums) x);

      -- 2.4: قراردادن در گرید (ستون c، ردیف‌های pos)
      for i in 1..k loop
        r := pos[i];
        grid[(r-1)*9 + c] := nums[i];
        row_cnt[r] := row_cnt[r] + 1;
      end loop;
    end loop;

    -- اگر به هر دلیل توزیع ردیف‌ها 5-5-5 نشد، کارت را از نو می‌سازیم
    if not (row_cnt[1]=5 and row_cnt[2]=5 and row_cnt[3]=5) then
      n := n - 1;  -- تکرار همین اندیس
      continue;
    end if;

    -- 2.5: خروجی JSON: آرایه 3 ردیفه × 9 ستونه (null به‌جای صفر)
card_json :=
  jsonb_build_array(
    to_jsonb( (select array_agg(nullif(grid[g],0)) from generate_series(1,9)  as gs(g)) ),
    to_jsonb( (select array_agg(nullif(grid[g],0)) from generate_series(10,18) as gs(g)) ),
    to_jsonb( (select array_agg(nullif(grid[g],0)) from generate_series(19,27) as gs(g)) )
  );

    insert into card_pool_cards (pool_id, card_no, card_data)
    values (v_pool_id, n, card_json);
  end loop;

  -- 3) فعال‌سازی همین نسخه
  perform activate_card_pool(v_pool_id);
  return v_pool_id;
end;$$;


--
-- Name: _pool_cards_for_room("uuid", "uuid", "bytea", "public"."room_type", integer); Type: FUNCTION; Schema: load_test; Owner: -
--

CREATE FUNCTION "load_test"."_pool_cards_for_room"("p_pool_id" "uuid", "p_room_id" "uuid", "p_room_seed" "bytea", "p_room_type" "public"."room_type", "p_limit" integer) RETURNS TABLE("pool_card_id" bigint, "card_no" integer)
    LANGUAGE "sql" STABLE
    AS $$
  SELECT c.id, c.card_no
  FROM public.card_pool_cards c
  WHERE c.pool_id = p_pool_id
    AND (
      p_room_type = 'tournament'::public.room_type
      OR c.card_no <= 200
    )
    AND NOT EXISTS (
      SELECT 1
      FROM public.tickets t
      WHERE t.pool_card_id = c.id
        AND t.room_id = p_room_id
        AND t.reservation_status IN ('reserved', 'confirmed', 'consumed')
    )
  ORDER BY digest(encode(p_room_seed, 'hex') || ':' || c.id::text, 'sha256')
  LIMIT p_limit;
$$;


--
-- Name: fn_rooms_settling_lag(); Type: FUNCTION; Schema: monitor; Owner: -
--

CREATE FUNCTION "monitor"."fn_rooms_settling_lag"() RETURNS TABLE("room_id" "uuid", "status" "public"."room_status", "updated_at" timestamp with time zone, "lag_seconds" bigint, "line_prize_pool" numeric, "full_prize_pool" numeric)
    LANGUAGE "sql"
    AS $$
  SELECT * FROM monitor.rooms_settling_lag;
$$;


--
-- Name: fn_assert_session_engine_game(); Type: FUNCTION; Schema: platform; Owner: -
--

CREATE FUNCTION "platform"."fn_assert_session_engine_game"() RETURNS "trigger"
    LANGUAGE "plpgsql"
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


--
-- Name: fn_shadow_bingo_ids(); Type: FUNCTION; Schema: platform; Owner: -
--

CREATE FUNCTION "platform"."fn_shadow_bingo_ids"(OUT "game_id" "uuid", OUT "engine_id" "uuid") RETURNS "record"
    LANGUAGE "plpgsql" STABLE
    AS $$
BEGIN
  SELECT g.id INTO game_id FROM platform.games g WHERE g.code = 'bingo';
  SELECT e.id INTO engine_id FROM platform.engine_registry e WHERE e.code = 'bingo-engine';
  IF game_id IS NULL OR engine_id IS NULL THEN
    RAISE EXCEPTION '[PlatformShadow] seeded bingo game/engine missing';
  END IF;
END;
$$;


--
-- Name: fn_shadow_drain(integer); Type: FUNCTION; Schema: platform; Owner: -
--

CREATE FUNCTION "platform"."fn_shadow_drain"("p_limit" integer DEFAULT 50) RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'platform', 'public'
    AS $$
DECLARE
  r record; v_res jsonb; v_pres jsonb; v_ok int := 0; v_err int := 0; v_skip int := 0; v_dlq int := 0;
  v_backoff interval; v_part_ok boolean;
BEGIN
  IF p_limit IS NULL OR p_limit < 1 THEN p_limit := 50; END IF;
  FOR r IN
    SELECT o.id, o.room_id, o.retry_count, o.max_retries
    FROM platform.shadow_outbox o
    WHERE o.processed_at IS NULL AND o.dead_lettered_at IS NULL AND o.next_attempt_at <= now()
    ORDER BY o.next_attempt_at, o.id FOR UPDATE SKIP LOCKED LIMIT p_limit
  LOOP
    v_res := platform.fn_shadow_mirror_room(r.room_id, r.retry_count);
    v_part_ok := true;
    IF (v_res->>'result') IN ('ok', 'skipped') THEN
      IF (v_res->>'result') = 'ok' OR EXISTS (SELECT 1 FROM platform.game_sessions gs WHERE gs.id = r.room_id) THEN
        v_pres := platform.fn_shadow_mirror_participants(r.room_id, r.retry_count);
        IF (v_pres->>'result') = 'error' THEN v_part_ok := false; v_res := v_pres; END IF;
      END IF;
    END IF;
    IF (v_res->>'result') = 'ok' AND v_part_ok THEN
      UPDATE platform.shadow_outbox SET processed_at = now(), last_error = NULL WHERE id = r.id; v_ok := v_ok + 1;
    ELSIF (v_res->>'result') = 'skipped' AND v_part_ok THEN
      UPDATE platform.shadow_outbox SET processed_at = now(), last_error = v_res->>'detail' WHERE id = r.id; v_skip := v_skip + 1;
    ELSE
      IF r.retry_count + 1 >= r.max_retries THEN
        UPDATE platform.shadow_outbox SET retry_count = r.retry_count + 1,
          last_error = COALESCE(v_res->>'detail', 'participant_or_room_mirror_error'),
          dead_lettered_at = now(), next_attempt_at = now() + interval '1 day' WHERE id = r.id;
        v_dlq := v_dlq + 1;
      ELSE
        v_backoff := make_interval(secs => LEAST(300, (power(2, LEAST(r.retry_count, 8)))::integer));
        UPDATE platform.shadow_outbox SET retry_count = r.retry_count + 1,
          last_error = COALESCE(v_res->>'detail', 'participant_or_room_mirror_error'),
          next_attempt_at = now() + v_backoff WHERE id = r.id;
        v_err := v_err + 1;
      END IF;
    END IF;
  END LOOP;
  RETURN jsonb_build_object('ok', v_ok, 'error', v_err, 'skipped', v_skip, 'dead_letter', v_dlq);
END;
$$;


--
-- Name: fn_shadow_enqueue("uuid"); Type: FUNCTION; Schema: platform; Owner: -
--

CREATE FUNCTION "platform"."fn_shadow_enqueue"("p_room_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'platform', 'public'
    AS $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM platform.shadow_outbox o
    WHERE o.room_id = p_room_id AND o.processed_at IS NULL AND o.dead_lettered_at IS NULL
  ) THEN
    RETURN;
  END IF;
  INSERT INTO platform.shadow_outbox (room_id) VALUES (p_room_id);
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING '[PlatformShadow] enqueue_failed room_id=% sqlstate=% err=%', p_room_id, SQLSTATE, SQLERRM;
END;
$$;


--
-- Name: fn_shadow_map_lifecycle("text", "text"); Type: FUNCTION; Schema: platform; Owner: -
--

CREATE FUNCTION "platform"."fn_shadow_map_lifecycle"("p_status" "text", "p_lease_owner" "text") RETURNS "text"
    LANGUAGE "sql" IMMUTABLE
    AS $$
  SELECT CASE
    WHEN p_status IN ('cancelled') THEN 'cancelled'
    WHEN p_status IN ('idle') THEN 'archived'
    WHEN p_status IN ('finished') THEN 'settled'
    WHEN p_status IN ('settling') THEN 'finished'
    WHEN p_status IN ('playing', 'live') THEN 'running'
    WHEN p_status IN ('waiting') AND p_lease_owner IS NOT NULL AND length(trim(p_lease_owner)) > 0 THEN 'claimed'
    WHEN p_status IN ('waiting') THEN 'waiting'
    ELSE 'created'
  END;
$$;


--
-- Name: fn_shadow_map_participant_status(integer, boolean, boolean); Type: FUNCTION; Schema: platform; Owner: -
--

CREATE FUNCTION "platform"."fn_shadow_map_participant_status"("p_active_tickets" integer, "p_has_held" boolean, "p_has_live" boolean) RETURNS "text"
    LANGUAGE "sql" IMMUTABLE
    AS $$
  SELECT CASE
    WHEN COALESCE(p_active_tickets, 0) <= 0 THEN 'left'
    WHEN COALESCE(p_has_live, false) THEN 'active'
    WHEN COALESCE(p_has_held, false) THEN 'joined'
    ELSE 'joined'
  END;
$$;


--
-- Name: fn_shadow_mirror_participants("uuid", integer); Type: FUNCTION; Schema: platform; Owner: -
--

CREATE FUNCTION "platform"."fn_shadow_mirror_participants"("p_room_id" "uuid", "p_retry_count" integer DEFAULT 0) RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'platform', 'public'
    AS $$
DECLARE
  v_started timestamptz := clock_timestamp();
  v_duration_ms numeric(12, 3);
  v_result text := 'ok';
  v_detail text := NULL;
  v_upserted int := 0;
  v_left int := 0;
  v_active_count int := 0;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.rooms r WHERE r.id = p_room_id) THEN
    v_result := 'skipped';
    v_detail := 'room_not_found';
    v_duration_ms := EXTRACT(EPOCH FROM (clock_timestamp() - v_started)) * 1000;
    INSERT INTO platform.shadow_mirror_log (room_id, session_id, lifecycle, result, retry_count, duration_ms, detail)
    VALUES (p_room_id, p_room_id, 'participants', v_result, p_retry_count, v_duration_ms, v_detail);
    RETURN jsonb_build_object('room_id', p_room_id, 'result', v_result, 'detail', v_detail, 'retry_count', p_retry_count, 'duration_ms', v_duration_ms);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM platform.game_sessions gs WHERE gs.id = p_room_id) THEN
    PERFORM platform.fn_shadow_mirror_room(p_room_id, p_retry_count);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM platform.game_sessions gs WHERE gs.id = p_room_id) THEN
    v_result := 'error';
    v_detail := 'session_missing_after_mirror_room';
    v_duration_ms := EXTRACT(EPOCH FROM (clock_timestamp() - v_started)) * 1000;
    INSERT INTO platform.shadow_mirror_log (room_id, session_id, lifecycle, result, retry_count, duration_ms, detail)
    VALUES (p_room_id, p_room_id, 'participants', v_result, p_retry_count, v_duration_ms, v_detail);
    RETURN jsonb_build_object('room_id', p_room_id, 'result', v_result, 'detail', v_detail, 'retry_count', p_retry_count, 'duration_ms', v_duration_ms);
  END IF;

  WITH ticket_agg AS (
    SELECT
      t.player_user_id AS user_id,
      count(*) FILTER (WHERE t.reservation_status::text NOT IN ('cancelled', 'released', 'expired'))::integer AS active_tickets,
      count(*)::integer AS ticket_count_all,
      coalesce(sum(t.price) FILTER (WHERE t.reservation_status::text NOT IN ('cancelled', 'released', 'expired')), 0)::numeric(18, 2) AS amount_total,
      coalesce(sum(t.price), 0)::numeric(18, 2) AS amount_gross,
      bool_or(t.reservation_status::text = 'held') AS has_held,
      bool_or(t.reservation_status::text IN ('reserved', 'confirmed', 'consumed')) AS has_live,
      min(t.created_at) AS joined_at,
      max(t.cancelled_at) AS max_cancelled_at,
      max(t.updated_at) AS source_updated_at,
      (array_agg(t.transaction_id ORDER BY t.created_at) FILTER (WHERE t.transaction_id IS NOT NULL))[1] AS hold_tx
    FROM public.tickets t
    WHERE t.room_id = p_room_id
    GROUP BY t.player_user_id
  ),
  normalized AS (
    SELECT
      a.user_id,
      platform.fn_shadow_map_participant_status(a.active_tickets, a.has_held, a.has_live) AS status,
      a.active_tickets AS ticket_count,
      a.ticket_count_all,
      a.amount_total,
      a.amount_gross,
      a.joined_at,
      CASE WHEN platform.fn_shadow_map_participant_status(a.active_tickets, a.has_held, a.has_live) = 'left'
        THEN COALESCE(a.max_cancelled_at, a.source_updated_at, now()) ELSE NULL END AS left_at,
      COALESCE(a.hold_tx::text, 'bingo.tickets:' || a.ticket_count_all::text) AS hold_ref,
      a.source_updated_at,
      jsonb_build_object('active_tickets', a.active_tickets, 'ticket_count_all', a.ticket_count_all, 'has_held', a.has_held, 'has_live', a.has_live) AS mirror_meta
    FROM ticket_agg a
  ),
  upserted AS (
    INSERT INTO platform.session_participants AS sp (
      session_id, user_id, status, seat_no, hold_ref, joined_at, left_at,
      ticket_count, ticket_count_all, amount_total, amount_gross, source_updated_at, mirror_meta, updated_at
    )
    SELECT p_room_id, n.user_id, n.status, NULL, n.hold_ref, n.joined_at, n.left_at,
      n.ticket_count, n.ticket_count_all, n.amount_total, n.amount_gross, n.source_updated_at, n.mirror_meta, now()
    FROM normalized n
    ON CONFLICT (session_id, user_id) DO UPDATE SET
      status = EXCLUDED.status,
      hold_ref = EXCLUDED.hold_ref,
      joined_at = LEAST(sp.joined_at, EXCLUDED.joined_at),
      left_at = EXCLUDED.left_at,
      ticket_count = EXCLUDED.ticket_count,
      ticket_count_all = EXCLUDED.ticket_count_all,
      amount_total = EXCLUDED.amount_total,
      amount_gross = EXCLUDED.amount_gross,
      source_updated_at = EXCLUDED.source_updated_at,
      mirror_meta = EXCLUDED.mirror_meta,
      updated_at = now()
    RETURNING 1
  )
  SELECT count(*)::int INTO v_upserted FROM upserted;

  UPDATE platform.session_participants sp
  SET status = 'left', ticket_count = 0, amount_total = 0,
      left_at = COALESCE(sp.left_at, now()), updated_at = now(),
      mirror_meta = COALESCE(sp.mirror_meta, '{}'::jsonb) || jsonb_build_object('removed_from_tickets', true)
  WHERE sp.session_id = p_room_id
    AND NOT EXISTS (SELECT 1 FROM public.tickets t WHERE t.room_id = p_room_id AND t.player_user_id = sp.user_id)
    AND sp.status IS DISTINCT FROM 'left';
  GET DIAGNOSTICS v_left = ROW_COUNT;

  SELECT count(*)::int INTO v_active_count
  FROM platform.session_participants sp
  WHERE sp.session_id = p_room_id AND sp.status IN ('joined', 'active');

  UPDATE platform.game_sessions gs
  SET participant_count = v_active_count, updated_at = now()
  WHERE gs.id = p_room_id AND gs.participant_count IS DISTINCT FROM v_active_count;

  v_duration_ms := EXTRACT(EPOCH FROM (clock_timestamp() - v_started)) * 1000;
  INSERT INTO platform.shadow_mirror_log (room_id, session_id, lifecycle, result, retry_count, duration_ms, detail)
  VALUES (p_room_id, p_room_id, 'participants', v_result, p_retry_count, v_duration_ms,
    format('upserted=%s left_marked=%s active=%s', v_upserted, v_left, v_active_count));
  RAISE LOG '[PlatformShadow] participants room_id=% result=% upserted=% active=%', p_room_id, v_result, v_upserted, v_active_count;
  RETURN jsonb_build_object('room_id', p_room_id, 'session_id', p_room_id, 'result', v_result, 'upserted', v_upserted, 'left_marked', v_left, 'active', v_active_count, 'retry_count', p_retry_count, 'duration_ms', v_duration_ms);
EXCEPTION WHEN OTHERS THEN
  v_duration_ms := EXTRACT(EPOCH FROM (clock_timestamp() - v_started)) * 1000;
  v_result := 'error'; v_detail := SQLERRM;
  BEGIN
    INSERT INTO platform.shadow_mirror_log (room_id, session_id, lifecycle, result, retry_count, duration_ms, detail)
    VALUES (p_room_id, p_room_id, 'participants', v_result, p_retry_count, v_duration_ms, v_detail);
  EXCEPTION WHEN OTHERS THEN NULL;
  END;
  RETURN jsonb_build_object('room_id', p_room_id, 'session_id', p_room_id, 'result', v_result, 'detail', v_detail, 'retry_count', p_retry_count, 'duration_ms', v_duration_ms);
END;
$$;


--
-- Name: fn_shadow_mirror_room("uuid", integer); Type: FUNCTION; Schema: platform; Owner: -
--

CREATE FUNCTION "platform"."fn_shadow_mirror_room"("p_room_id" "uuid", "p_retry_count" integer DEFAULT 0) RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'platform', 'public'
    AS $$
DECLARE
  v_started timestamptz := clock_timestamp();
  v_duration_ms numeric(12, 3);
  v_game_id uuid;
  v_engine_id uuid;
  v_room public.rooms%ROWTYPE;
  v_lifecycle text;
  v_prev_lifecycle text;
  v_seq bigint;
  v_result text := 'ok';
  v_detail text := NULL;
BEGIN
  SELECT f.game_id, f.engine_id INTO v_game_id, v_engine_id FROM platform.fn_shadow_bingo_ids() AS f;
  SELECT * INTO v_room FROM public.rooms r WHERE r.id = p_room_id;
  IF NOT FOUND THEN
    v_result := 'skipped';
    v_detail := 'room_not_found';
    v_duration_ms := EXTRACT(EPOCH FROM (clock_timestamp() - v_started)) * 1000;
    INSERT INTO platform.shadow_mirror_log (room_id, session_id, lifecycle, result, retry_count, duration_ms, detail)
    VALUES (p_room_id, p_room_id, NULL, v_result, p_retry_count, v_duration_ms, v_detail);
    RAISE LOG '[PlatformShadow] room_id=% session_id=% lifecycle=% result=% retry=% duration_ms=% detail=%',
      p_room_id, p_room_id, NULL, v_result, p_retry_count, v_duration_ms, v_detail;
    RETURN jsonb_build_object('room_id', p_room_id, 'session_id', p_room_id, 'result', v_result, 'detail', v_detail, 'retry_count', p_retry_count, 'duration_ms', v_duration_ms);
  END IF;

  v_lifecycle := platform.fn_shadow_map_lifecycle(v_room.status::text, v_room.engine_owner_id);
  SELECT gs.status INTO v_prev_lifecycle FROM platform.game_sessions gs WHERE gs.id = p_room_id;

  INSERT INTO platform.game_sessions AS gs (
    id, game_id, engine_id, status, capacity, participant_count, entry_fee, currency,
    lease_owner, lease_epoch, lease_expires_at, correlation_key,
    created_at, started_at, finished_at, settled_at, updated_at
  ) VALUES (
    v_room.id, v_game_id, v_engine_id, v_lifecycle, NULL, 0, v_room.card_price, 'IRR',
    v_room.engine_owner_id, COALESCE(v_room.engine_lease_epoch, 0), v_room.engine_lease_until,
    'bingo.room:' || v_room.id::text, v_room.created_at,
    CASE WHEN v_lifecycle IN ('running', 'finished', 'settled', 'archived') THEN COALESCE(v_room.waiting_started_at, v_room.created_at) END,
    CASE WHEN v_lifecycle IN ('finished', 'settled', 'archived') THEN v_room.updated_at END,
    CASE WHEN v_lifecycle = 'settled' THEN v_room.updated_at END,
    now()
  )
  ON CONFLICT (id) DO UPDATE SET
    game_id = EXCLUDED.game_id,
    engine_id = EXCLUDED.engine_id,
    status = EXCLUDED.status,
    entry_fee = COALESCE(EXCLUDED.entry_fee, gs.entry_fee),
    lease_owner = EXCLUDED.lease_owner,
    lease_epoch = EXCLUDED.lease_epoch,
    lease_expires_at = EXCLUDED.lease_expires_at,
    correlation_key = COALESCE(gs.correlation_key, EXCLUDED.correlation_key),
    started_at = COALESCE(gs.started_at, EXCLUDED.started_at),
    finished_at = CASE WHEN EXCLUDED.status IN ('finished', 'settled', 'archived') THEN COALESCE(gs.finished_at, EXCLUDED.finished_at) ELSE gs.finished_at END,
    settled_at = CASE WHEN EXCLUDED.status = 'settled' THEN COALESCE(gs.settled_at, EXCLUDED.settled_at) ELSE gs.settled_at END,
    updated_at = now();

  INSERT INTO platform.session_state AS ss (session_id, state_version, engine_state_ref, needs_settle, metadata, updated_at)
  VALUES (v_room.id, 0, 'bingo.room:' || v_room.id::text, (v_lifecycle = 'finished'), jsonb_build_object('bingo_status', v_room.status::text), now())
  ON CONFLICT (session_id) DO UPDATE SET
    state_version = ss.state_version + CASE WHEN v_prev_lifecycle IS DISTINCT FROM v_lifecycle THEN 1 ELSE 0 END,
    engine_state_ref = EXCLUDED.engine_state_ref,
    needs_settle = EXCLUDED.needs_settle,
    metadata = EXCLUDED.metadata,
    updated_at = now();

  IF v_lifecycle = 'settled' THEN
    INSERT INTO platform.session_settlement AS st (session_id, settlement_key, status, currency, lines, ledger_refs, applied_at, updated_at)
    VALUES (v_room.id, 'bingo.settle:' || v_room.id::text, 'applied', 'IRR', '[]'::jsonb, '[]'::jsonb, v_room.updated_at, now())
    ON CONFLICT (session_id, settlement_key) DO UPDATE SET
      status = 'applied',
      applied_at = COALESCE(st.applied_at, EXCLUDED.applied_at),
      updated_at = now();
  END IF;

  IF v_prev_lifecycle IS DISTINCT FROM v_lifecycle THEN
    SELECT COALESCE(MAX(se.seq), 0) + 1 INTO v_seq FROM platform.session_events se WHERE se.session_id = v_room.id;
    INSERT INTO platform.session_events (session_id, seq, event_type, actor, payload)
    VALUES (v_room.id, v_seq, 'shadow.lifecycle', 'platform-shadow',
      jsonb_build_object('from', v_prev_lifecycle, 'to', v_lifecycle, 'bingo_status', v_room.status::text))
    ON CONFLICT (session_id, seq) DO NOTHING;
  END IF;

  v_duration_ms := EXTRACT(EPOCH FROM (clock_timestamp() - v_started)) * 1000;
  INSERT INTO platform.shadow_mirror_log (room_id, session_id, lifecycle, result, retry_count, duration_ms, detail)
  VALUES (v_room.id, v_room.id, v_lifecycle, v_result, p_retry_count, v_duration_ms, v_detail);
  RAISE LOG '[PlatformShadow] room_id=% session_id=% lifecycle=% result=% retry=% duration_ms=%',
    v_room.id, v_room.id, v_lifecycle, v_result, p_retry_count, v_duration_ms;
  RETURN jsonb_build_object('room_id', v_room.id, 'session_id', v_room.id, 'lifecycle', v_lifecycle, 'bingo_status', v_room.status::text, 'result', v_result, 'retry_count', p_retry_count, 'duration_ms', v_duration_ms);
EXCEPTION WHEN OTHERS THEN
  v_duration_ms := EXTRACT(EPOCH FROM (clock_timestamp() - v_started)) * 1000;
  v_result := 'error';
  v_detail := SQLERRM;
  BEGIN
    INSERT INTO platform.shadow_mirror_log (room_id, session_id, lifecycle, result, retry_count, duration_ms, detail)
    VALUES (p_room_id, p_room_id, v_lifecycle, v_result, p_retry_count, v_duration_ms, v_detail);
  EXCEPTION WHEN OTHERS THEN NULL;
  END;
  RAISE LOG '[PlatformShadow] room_id=% session_id=% lifecycle=% result=% retry=% duration_ms=% detail=%',
    p_room_id, p_room_id, v_lifecycle, v_result, p_retry_count, v_duration_ms, v_detail;
  RETURN jsonb_build_object('room_id', p_room_id, 'session_id', p_room_id, 'lifecycle', v_lifecycle, 'result', v_result, 'detail', v_detail, 'retry_count', p_retry_count, 'duration_ms', v_duration_ms);
END;
$$;


--
-- Name: fn_shadow_participant_recon_report(); Type: FUNCTION; Schema: platform; Owner: -
--

CREATE FUNCTION "platform"."fn_shadow_participant_recon_report"() RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'platform', 'public'
    AS $$
DECLARE
  v_sessions int; v_bingo_users int; v_platform_users int; v_missing int; v_dup int;
  v_status_mismatch int; v_amount_mismatch int; v_ts_mismatch int; v_dlq int; v_pending int; v_max_retry int;
BEGIN
  SELECT count(*)::int INTO v_sessions FROM platform.game_sessions gs WHERE gs.correlation_key LIKE 'bingo.room:%';
  SELECT count(*)::int INTO v_bingo_users FROM (SELECT DISTINCT room_id, player_user_id FROM public.tickets) b;
  SELECT count(*)::int INTO v_platform_users FROM platform.session_participants;

  SELECT count(*)::int INTO v_missing FROM (
    SELECT DISTINCT t.room_id, t.player_user_id FROM public.tickets t
    WHERE t.reservation_status::text NOT IN ('cancelled', 'released', 'expired')
  ) b WHERE NOT EXISTS (
    SELECT 1 FROM platform.session_participants sp
    WHERE sp.session_id = b.room_id AND sp.user_id = b.player_user_id AND sp.status IN ('joined', 'active')
  );

  SELECT count(*)::int INTO v_dup FROM (
    SELECT session_id, user_id FROM platform.session_participants GROUP BY session_id, user_id HAVING count(*) > 1
  ) d;

  SELECT count(*)::int INTO v_status_mismatch FROM (
    SELECT t.room_id, t.player_user_id,
      platform.fn_shadow_map_participant_status(
        count(*) FILTER (WHERE t.reservation_status::text NOT IN ('cancelled', 'released', 'expired'))::integer,
        bool_or(t.reservation_status::text = 'held'),
        bool_or(t.reservation_status::text IN ('reserved', 'confirmed', 'consumed'))
      ) AS expected_status
    FROM public.tickets t GROUP BY t.room_id, t.player_user_id
  ) e
  JOIN platform.session_participants sp ON sp.session_id = e.room_id AND sp.user_id = e.player_user_id
  WHERE sp.status IS DISTINCT FROM e.expected_status;

  SELECT count(*)::int INTO v_amount_mismatch FROM (
    SELECT t.room_id, t.player_user_id,
      coalesce(sum(t.price) FILTER (WHERE t.reservation_status::text NOT IN ('cancelled', 'released', 'expired')), 0)::numeric(18,2) AS expected_amount
    FROM public.tickets t GROUP BY t.room_id, t.player_user_id
  ) e
  JOIN platform.session_participants sp ON sp.session_id = e.room_id AND sp.user_id = e.player_user_id
  WHERE sp.amount_total IS DISTINCT FROM e.expected_amount;

  SELECT count(*)::int INTO v_ts_mismatch FROM (
    SELECT t.room_id, t.player_user_id, max(t.updated_at) AS src_updated
    FROM public.tickets t GROUP BY t.room_id, t.player_user_id
  ) e
  JOIN platform.session_participants sp ON sp.session_id = e.room_id AND sp.user_id = e.player_user_id
  WHERE sp.source_updated_at IS NOT NULL AND sp.source_updated_at IS DISTINCT FROM e.src_updated;

  SELECT count(*)::int INTO v_dlq FROM platform.shadow_outbox WHERE dead_lettered_at IS NOT NULL;
  SELECT count(*)::int INTO v_pending FROM platform.shadow_outbox WHERE processed_at IS NULL AND dead_lettered_at IS NULL;
  SELECT coalesce(max(retry_count), 0)::int INTO v_max_retry FROM platform.shadow_outbox;

  RETURN jsonb_build_object(
    'sessions_checked', v_sessions,
    'bingo_participant_keys', v_bingo_users,
    'platform_participants', v_platform_users,
    'participants_checked', v_bingo_users,
    'missing', v_missing,
    'duplicate', v_dup,
    'status_mismatch', v_status_mismatch,
    'amount_mismatch', v_amount_mismatch,
    'timestamp_mismatch', v_ts_mismatch,
    'dlq', v_dlq,
    'pending_outbox', v_pending,
    'max_retry_count', v_max_retry,
    'generated_at', now()
  );
END;
$$;


--
-- Name: fn_shadow_reconcile(integer); Type: FUNCTION; Schema: platform; Owner: -
--

CREATE FUNCTION "platform"."fn_shadow_reconcile"("p_limit" integer DEFAULT 200) RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'platform', 'public'
    AS $$
DECLARE
  r record; v_n int := 0;
BEGIN
  IF p_limit IS NULL OR p_limit < 1 THEN p_limit := 200; END IF;
  FOR r IN
    SELECT z.id FROM (
      SELECT u.id, max(u.updated_at) AS updated_at FROM (
        SELECT rm.id, rm.updated_at FROM public.rooms rm
        LEFT JOIN platform.game_sessions gs ON gs.id = rm.id
        WHERE gs.id IS NULL
           OR gs.status IS DISTINCT FROM platform.fn_shadow_map_lifecycle(rm.status::text, rm.engine_owner_id)
           OR gs.lease_owner IS DISTINCT FROM rm.engine_owner_id
           OR gs.lease_expires_at IS DISTINCT FROM rm.engine_lease_until
        UNION ALL
        SELECT t.room_id AS id, max(t.updated_at) AS updated_at
        FROM public.tickets t
        WHERE t.reservation_status::text NOT IN ('cancelled', 'released', 'expired')
          AND NOT EXISTS (
            SELECT 1 FROM platform.session_participants sp
            WHERE sp.session_id = t.room_id AND sp.user_id = t.player_user_id AND sp.status IN ('joined', 'active')
          )
        GROUP BY t.room_id
        UNION ALL
        SELECT t.room_id AS id, max(t.updated_at) AS updated_at
        FROM public.tickets t
        JOIN platform.session_participants sp ON sp.session_id = t.room_id AND sp.user_id = t.player_user_id
        WHERE t.reservation_status::text NOT IN ('cancelled', 'released', 'expired')
        GROUP BY t.room_id, t.player_user_id, sp.amount_total
        HAVING sp.amount_total IS DISTINCT FROM coalesce(sum(t.price), 0)
      ) u
      GROUP BY u.id
    ) z
    ORDER BY z.updated_at DESC NULLS LAST
    LIMIT p_limit
  LOOP
    PERFORM platform.fn_shadow_enqueue(r.id);
    v_n := v_n + 1;
  END LOOP;
  RETURN jsonb_build_object('enqueued', v_n);
END;
$$;


--
-- Name: trg_rooms_platform_shadow(); Type: FUNCTION; Schema: platform; Owner: -
--

CREATE FUNCTION "platform"."trg_rooms_platform_shadow"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'platform', 'public'
    AS $$
BEGIN
  BEGIN
    PERFORM platform.fn_shadow_enqueue(NEW.id);
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING '[PlatformShadow] trigger_enqueue_failed room_id=% sqlstate=% err=%', NEW.id, SQLSTATE, SQLERRM;
  END;
  RETURN NULL;
END;
$$;


--
-- Name: trg_tickets_platform_shadow(); Type: FUNCTION; Schema: platform; Owner: -
--

CREATE FUNCTION "platform"."trg_tickets_platform_shadow"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'platform', 'public'
    AS $$
DECLARE
  v_room uuid;
BEGIN
  BEGIN
    v_room := COALESCE(NEW.room_id, OLD.room_id);
    IF v_room IS NOT NULL THEN
      PERFORM platform.fn_shadow_enqueue(v_room);
    END IF;
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING '[PlatformShadow] tickets_enqueue_failed room_id=% sqlstate=% err=%', v_room, SQLSTATE, SQLERRM;
  END;
  RETURN NULL;
END;
$$;


--
-- Name: can_read_user("uuid"); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."can_read_user"("target_user_id" "uuid") RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    SET "row_security" TO 'off'
    AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_role public.user_role;
  v_status public.user_status;
BEGIN
  IF v_uid IS NULL THEN
    RETURN FALSE;
  END IF;

  SELECT role, status
  INTO v_role, v_status
  FROM public.users
  WHERE id = v_uid;

  IF v_role IS NULL OR v_status IS NULL THEN
    RETURN FALSE;
  END IF;

  IF v_role = 'admin'::public.user_role AND v_status = 'active'::public.user_status THEN
    RETURN TRUE;
  END IF;

  IF v_uid = target_user_id THEN
    RETURN TRUE;
  END IF;

  IF v_role = 'agent'::public.user_role AND v_status = 'active'::public.user_status THEN
    RETURN EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.id = target_user_id AND u.parent_id = v_uid
    );
  END IF;

  IF v_role = 'super'::public.user_role AND v_status = 'active'::public.user_status THEN
    RETURN EXISTS (
      SELECT 1
      FROM public.users u
      LEFT JOIN public.users agent
        ON agent.id = u.parent_id
       AND agent.role = 'agent'::public.user_role
      WHERE u.id = target_user_id
        AND (u.parent_id = v_uid OR agent.parent_id = v_uid)
    );
  END IF;

  RETURN FALSE;
END;
$$;


--
-- Name: can_read_user_in_tournament("uuid"); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."can_read_user_in_tournament"("target_user_id" "uuid") RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    SET "row_security" TO 'off'
    AS $$
DECLARE
  v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN
    RETURN FALSE;
  END IF;

  RETURN EXISTS (
    SELECT 1
    FROM public.tournament_entries te_self
    JOIN public.tournaments t
      ON t.id = te_self.tournament_id
    JOIN public.tournament_entries te_target
      ON te_target.tournament_id = te_self.tournament_id
    WHERE te_self.user_id = v_uid
      AND te_target.user_id = target_user_id
      AND t.status IN (
        'registration_open'::public.tournament_status,
        'running'::public.tournament_status,
        'settling'::public.tournament_status,
        'finished'::public.tournament_status
      )
      AND te_target.status = 'created'::public.tournament_entry_status
  );
END;
$$;


--
-- Name: debug_runtime_context("uuid"); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."debug_runtime_context"("p_room_id" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  result jsonb;
BEGIN
  SELECT jsonb_build_object(
    'current_database', current_database(),
    'current_schema', current_schema(),
    'current_user', current_user,
    'session_user', session_user,
    'jwt_role', current_setting('request.jwt.claim.role', true),
    'jwt_sub', current_setting('request.jwt.claim.sub', true),
    'server_addr', inet_server_addr(),
    'server_port', inet_server_port(),
    'room_count', (
      SELECT count(*)
      FROM public.tickets
      WHERE room_id = p_room_id
        AND reservation_status IN ('reserved', 'confirmed', 'consumed')
    ),
    'room_rows', (
      SELECT jsonb_agg(jsonb_build_object(
        'id', id,
        'player_user_id', player_user_id,
        'reservation_status', reservation_status,
        'created_at', created_at
      ) ORDER BY created_at)
      FROM public.tickets
      WHERE room_id = p_room_id
        AND reservation_status IN ('reserved', 'confirmed', 'consumed')
    ),
    'total_tickets', (
      SELECT count(*)
      FROM public.tickets
    )
  )
  INTO result;

  RETURN result;
END;
$$;


--
-- Name: debug_ticket_counts("uuid"); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."debug_ticket_counts"("p_room_id" "uuid") RETURNS "jsonb"
    LANGUAGE "sql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  SELECT jsonb_build_object(
    'room_counts',
    COALESCE(
      (
        SELECT jsonb_agg(
          jsonb_build_object(
            'player_user_id', s.player_user_id,
            'cards', s.cards
          )
          ORDER BY s.player_user_id
        )
        FROM (
          SELECT t.player_user_id, count(*)::bigint AS cards
          FROM public.tickets t
          WHERE t.room_id = p_room_id
            AND t.reservation_status IN ('reserved', 'confirmed', 'consumed')
          GROUP BY t.player_user_id
        ) s
      ),
      '[]'::jsonb
    ),
    'total_tickets', (SELECT count(*)::bigint FROM public.tickets)
  );
$$;


--
-- Name: distribute_ding_on_draw(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."distribute_ding_on_draw"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
DECLARE
  v_room_id UUID;
  v_drawn_number INTEGER;
  v_ding_per_card NUMERIC;
  v_room_template_id UUID;
  v_ticket_record RECORD;
  v_total_ding NUMERIC;
BEGIN
  v_room_id := NEW.room_id;
  v_drawn_number := NEW.number;

  IF NOT EXISTS (
    SELECT 1 FROM rooms
    WHERE id = v_room_id
      AND status IN ('live', 'playing')
  ) THEN
    RETURN NEW;
  END IF;

  SELECT
    r.ding_per_number,
    r.room_template_id
  INTO
    v_ding_per_card,
    v_room_template_id
  FROM rooms r
  WHERE r.id = v_room_id;

  IF v_ding_per_card IS NULL THEN
    SELECT COALESCE(rt.ding_per_number, 1)
    INTO v_ding_per_card
    FROM room_templates rt
    WHERE rt.id = v_room_template_id;

    IF v_ding_per_card IS NULL THEN
      v_ding_per_card := 1;
    END IF;
  END IF;

  FOR v_ticket_record IN
    SELECT DISTINCT
      t.id AS ticket_id,
      t.player_user_id,
      t.room_id
    FROM tickets t
    JOIN card_pool_cards cpc ON cpc.id = t.pool_card_id
    JOIN card_numbers cn ON cn.pool_card_id = cpc.id
    WHERE t.room_id = v_room_id
      AND t.reservation_status IN ('reserved', 'confirmed', 'consumed')
      AND cn.value = v_drawn_number
  LOOP
    v_total_ding := v_ding_per_card;

    PERFORM update_ding_balance(v_ticket_record.player_user_id, v_total_ding);

    INSERT INTO ding_transactions (
      user_id,
      room_id,
      ticket_id,
      draw_id,
      drawn_number,
      amount,
      description
    ) VALUES (
      v_ticket_record.player_user_id,
      v_room_id,
      v_ticket_record.ticket_id,
      NEW.id,
      v_drawn_number,
      v_total_ding,
      format('Ding برای عدد %s روی کارت (ضریب: %s)', v_drawn_number, v_ding_per_card)
    );
  END LOOP;

  RETURN NEW;
END;
$$;


--
-- Name: fn_adjust_referral_wallet("uuid", numeric, "text", "public"."transaction_type", "text"); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."fn_adjust_referral_wallet"("p_target_user" "uuid", "p_amount" numeric, "p_currency" "text", "p_type" "public"."transaction_type", "p_description" "text" DEFAULT NULL::"text") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
  v_actor          uuid := auth.uid();
  v_actor_role     text;
  v_actor_wallet   public.wallets%ROWTYPE;
  v_target_wallet  public.wallets%ROWTYPE;
  v_from_before    numeric;
  v_from_after     numeric;
  v_to_before      numeric;
  v_to_after       numeric;
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'permission denied (no actor)';
  END IF;

  IF p_target_user IS NULL THEN
    RAISE EXCEPTION 'target user is required';
  END IF;

  IF v_actor = p_target_user THEN
    RAISE EXCEPTION 'cannot transfer to self';
  END IF;

  SELECT role INTO v_actor_role
  FROM public.users
  WHERE id = v_actor;

  IF v_actor_role NOT IN ('admin','agent','super') THEN
    RAISE EXCEPTION 'permission denied for role %', coalesce(v_actor_role, 'NULL');
  END IF;

  IF p_amount <= 0 THEN
    RAISE EXCEPTION 'amount must be positive';
  END IF;

  -- بازیابی والت مبدأ (actor)
  SELECT * INTO v_actor_wallet
  FROM public.wallets
  WHERE user_id = v_actor AND currency = p_currency
  FOR UPDATE;

  IF NOT FOUND THEN
    INSERT INTO public.wallets (user_id, balance, currency, locked_amount, created_at, updated_at)
    VALUES (v_actor, 0, p_currency, 0, now(), now())
    RETURNING * INTO v_actor_wallet;
  END IF;

  -- بازیابی والت مقصد (target)
  SELECT * INTO v_target_wallet
  FROM public.wallets
  WHERE user_id = p_target_user AND currency = p_currency
  FOR UPDATE;

  IF NOT FOUND THEN
    INSERT INTO public.wallets (user_id, balance, currency, locked_amount, created_at, updated_at)
    VALUES (p_target_user, 0, p_currency, 0, now(), now())
    RETURNING * INTO v_target_wallet;
  END IF;

  IF p_type = 'deposit' THEN
    -- actor -> target
    v_from_before := v_actor_wallet.balance;
    v_to_before   := v_target_wallet.balance;

    v_from_after := v_from_before - p_amount;
    IF v_from_after < 0 THEN
      RAISE EXCEPTION 'insufficient funds in source wallet';
    END IF;

    v_to_after := v_to_before + p_amount;

    UPDATE public.wallets
      SET balance = v_from_after,
          updated_at = now()
    WHERE id = v_actor_wallet.id;

    UPDATE public.wallets
      SET balance = v_to_after,
          updated_at = now()
    WHERE id = v_target_wallet.id;

    -- تراکنش برداشت از actor
    INSERT INTO public.transactions(
      id, wallet_id, user_id, type, status,
      amount, currency, description,
      balance_before, balance_after,
      source_factory, source_ref
    ) VALUES (
      gen_random_uuid(), v_actor_wallet.id, v_actor,
      'withdraw', 'completed',
      p_amount, p_currency,
      coalesce(p_description, 'manual panel transfer to ' || p_target_user::text),
      v_from_before, v_from_after,
      'manual_panel', p_target_user::text
    );

    -- تراکنش واریز به target
    INSERT INTO public.transactions(
      id, wallet_id, user_id, type, status,
      amount, currency, description,
      balance_before, balance_after,
      source_factory, source_ref
    ) VALUES (
      gen_random_uuid(), v_target_wallet.id, p_target_user,
      'deposit', 'completed',
      p_amount, p_currency,
      coalesce(p_description, 'manual panel deposit from ' || v_actor::text),
      v_to_before, v_to_after,
      'manual_panel', v_actor::text
    );

  ELSIF p_type = 'withdraw' THEN
    -- target -> actor
    v_from_before := v_target_wallet.balance;
    v_to_before   := v_actor_wallet.balance;

    v_from_after := v_from_before - p_amount;
    IF v_from_after < 0 THEN
      RAISE EXCEPTION 'insufficient funds in source wallet';
    END IF;

    v_to_after := v_to_before + p_amount;

    UPDATE public.wallets
      SET balance = v_from_after,
          updated_at = now()
    WHERE id = v_target_wallet.id;

    UPDATE public.wallets
      SET balance = v_to_after,
          updated_at = now()
    WHERE id = v_actor_wallet.id;

    -- تراکنش برداشت از target
    INSERT INTO public.transactions(
      id, wallet_id, user_id, type, status,
      amount, currency, description,
      balance_before, balance_after,
      source_factory, source_ref
    ) VALUES (
      gen_random_uuid(), v_target_wallet.id, p_target_user,
      'withdraw', 'completed',
      p_amount, p_currency,
      coalesce(p_description, 'manual panel withdraw by ' || v_actor::text),
      v_from_before, v_from_after,
      'manual_panel', v_actor::text
    );

    -- تراکنش واریز به actor
    INSERT INTO public.transactions(
      id, wallet_id, user_id, type, status,
      amount, currency, description,
      balance_before, balance_after,
      source_factory, source_ref
    ) VALUES (
      gen_random_uuid(), v_actor_wallet.id, v_actor,
      'deposit', 'completed',
      p_amount, p_currency,
      coalesce(p_description, 'manual panel receive from ' || p_target_user::text),
      v_to_before, v_to_after,
      'manual_panel', p_target_user::text
    );

  ELSE
    RAISE EXCEPTION 'unsupported transaction type %', p_type;
  END IF;
END;
$$;


--
-- Name: fn_adjust_wallet_manual("uuid", numeric, "text", "public"."transaction_type", "text"); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."fn_adjust_wallet_manual"("p_target_user" "uuid", "p_amount" numeric, "p_currency" "text", "p_type" "public"."transaction_type", "p_description" "text" DEFAULT NULL::"text") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
  v_actor uuid;
  v_actor_role text;
  v_amount_delta numeric;
  v_transaction_id uuid;
BEGIN
  -- 1. بررسی نقش (منطق امنیتی)
  v_actor := auth.uid();
  
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'permission denied: user not authenticated';
  END IF;
  
  SELECT role INTO v_actor_role
  FROM public.users
  WHERE id = v_actor;
  
  IF v_actor_role NOT IN ('admin', 'agent', 'super') THEN
    RAISE EXCEPTION 'permission denied: only admin/agent/super can adjust wallets';
  END IF;
  
  -- 2. Validation
  IF p_amount <= 0 THEN
    RAISE EXCEPTION 'amount must be positive';
  END IF;
  
  IF p_type NOT IN ('deposit', 'withdraw') THEN
    RAISE EXCEPTION 'unsupported transaction type: %', p_type;
  END IF;
  
  -- 3. تعیین delta بر اساس type
  IF p_type = 'deposit' THEN
    v_amount_delta := p_amount;
  ELSIF p_type = 'withdraw' THEN
    v_amount_delta := -p_amount;
  END IF;
  
  -- 4. فراخوانی هسته مالی
  SELECT game_finance.fn_wallet_apply_delta(
    p_user_id := p_target_user,
    p_currency := p_currency,
    p_amount_delta := v_amount_delta,
    p_transaction_type := p_type,
    p_source_kind := 'manual_panel',
    p_source_ref := v_actor::text,  -- تبدیل به text برای سازگاری
    p_description := COALESCE(p_description, 'manual panel adjustment'),
    p_meta := '{}'::jsonb,
    p_allow_negative := false
  ) INTO v_transaction_id;
  
  -- تابع void است، بنابراین transaction_id را برنمی‌گردانیم
  -- اما می‌توان در آینده signature را تغییر داد اگر نیاز باشد
END;
$$;


--
-- Name: tournaments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."tournaments" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "title" "text" NOT NULL,
    "status" "public"."tournament_status" DEFAULT 'draft'::"public"."tournament_status" NOT NULL,
    "start_at" timestamp with time zone,
    "currency" "text" DEFAULT 'IRR'::"text" NOT NULL,
    "table_size_mode" "public"."tournament_table_size_mode" DEFAULT 'fixed'::"public"."tournament_table_size_mode" NOT NULL,
    "table_size_fixed" integer,
    "table_size_min" integer,
    "table_size_max" integer,
    "remainder_policy" "public"."tournament_remainder_policy" DEFAULT 'adaptive_tables'::"public"."tournament_remainder_policy" NOT NULL,
    "bye_max_count" integer DEFAULT 0 NOT NULL,
    "bye_compensation_rule" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "ghost_fill_mode" "text",
    "ghost_is_neutral" boolean DEFAULT true NOT NULL,
    "optimizer_weights" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "guaranteed_prize" numeric(12,2) DEFAULT 0 NOT NULL,
    "created_by" "uuid",
    "meta" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "ticket_price" numeric(12,2) DEFAULT 0 NOT NULL,
    "min_tickets_per_player" integer DEFAULT 1 NOT NULL,
    "max_tickets_per_player" integer DEFAULT 1 NOT NULL,
    "room_template_id" "uuid",
    "commission_rate" numeric,
    "commission_snapshot_at" timestamp with time zone,
    CONSTRAINT "tournaments_bye_max_count_check" CHECK (("bye_max_count" >= 0)),
    CONSTRAINT "tournaments_max_tickets_check" CHECK (("max_tickets_per_player" >= 1)),
    CONSTRAINT "tournaments_min_le_max_tickets_check" CHECK (("min_tickets_per_player" <= "max_tickets_per_player")),
    CONSTRAINT "tournaments_min_tickets_check" CHECK (("min_tickets_per_player" >= 1)),
    CONSTRAINT "tournaments_table_size_fixed_check" CHECK ((("table_size_mode" <> 'fixed'::"public"."tournament_table_size_mode") OR (("table_size_fixed" IS NOT NULL) AND ("table_size_fixed" >= 2)))),
    CONSTRAINT "tournaments_table_size_range_check" CHECK ((("table_size_mode" <> 'range'::"public"."tournament_table_size_mode") OR (("table_size_min" IS NOT NULL) AND ("table_size_max" IS NOT NULL) AND ("table_size_min" >= 2) AND ("table_size_max" >= "table_size_min"))))
);


--
-- Name: fn_admin_create_tournament("jsonb"); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."fn_admin_create_tournament"("p_payload" "jsonb") RETURNS "public"."tournaments"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'tournament', 'public', 'pg_temp'
    AS $$
BEGIN
  RETURN tournament.fn_admin_create_tournament(p_payload);
END;
$$;


--
-- Name: fn_admin_delete_tournament("uuid"); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."fn_admin_delete_tournament"("p_tournament_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'tournament', 'public', 'pg_temp'
    AS $$
BEGIN
  PERFORM tournament.fn_admin_delete_tournament(p_tournament_id);
END;
$$;


--
-- Name: fn_admin_games_report(timestamp with time zone, timestamp with time zone, integer, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."fn_admin_games_report"("p_from" timestamp with time zone, "p_to" timestamp with time zone, "p_limit" integer DEFAULT 20, "p_offset" integer DEFAULT 0) RETURNS TABLE("room_id" "uuid", "room_title" "text", "room_code" "text", "room_amount" numeric, "played_at" timestamp with time zone, "line_wins_count" bigint, "full_wins_count" bigint, "total_reward" numeric, "total_rows" bigint)
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  if p_from is null or p_to is null or p_from > p_to then
    raise exception 'INVALID_RANGE';
  end if;

  return query
  with grouped as (
    select
      r.room_id,
      max(r.created_at) as played_at,
      count(*) filter (where lower(coalesce(r.win_type, '')) = 'line')::bigint as line_wins_count,
      count(*) filter (where lower(coalesce(r.win_type, '')) = 'full')::bigint as full_wins_count,
      coalesce(sum(r.reward_amount), 0)::numeric as total_reward
    from public.results r
    where r.room_id is not null
      and r.created_at >= p_from
      and r.created_at <= p_to
    group by r.room_id
  ),
  enriched as (
    select
      g.room_id,
      coalesce(
        nullif(trim(rm.title), ''),
        nullif(trim(rm.room_code), ''),
        concat('room-', left(g.room_id::text, 8))
      )::text as room_title,
      rm.room_code::text as room_code,
      coalesce(rm.price, rm.card_price, 0)::numeric as room_amount,
      g.played_at,
      g.line_wins_count,
      g.full_wins_count,
      g.total_reward
    from grouped g
    left join public.rooms rm on rm.id = g.room_id
  ),
  counted as (
    select
      e.*,
      count(*) over ()::bigint as total_rows
    from enriched e
  )
  select
    c.room_id,
    c.room_title,
    c.room_code,
    c.room_amount,
    c.played_at,
    c.line_wins_count,
    c.full_wins_count,
    c.total_reward,
    c.total_rows
  from counted c
  order by c.played_at desc
  limit greatest(coalesce(p_limit, 20), 1)
  offset greatest(coalesce(p_offset, 0), 0);
end;
$$;


--
-- Name: fn_admin_set_tournament_status("uuid", "public"."tournament_status"); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."fn_admin_set_tournament_status"("p_tournament_id" "uuid", "p_status" "public"."tournament_status") RETURNS "public"."tournaments"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
  v_actor         uuid := auth.uid();
  v_actor_role    public.user_role;
  v_actor_status  public.user_status;
  v_row           public.tournaments%ROWTYPE;
  v_prev_status   public.tournament_status;
  v_now           timestamptz := now();
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'UNAUTHORIZED';
  END IF;

  SELECT role, status
    INTO v_actor_role, v_actor_status
  FROM public.users
  WHERE id = v_actor;

  IF v_actor_role NOT IN ('admin','super') OR v_actor_status IS DISTINCT FROM 'active' THEN
    RAISE EXCEPTION 'FORBIDDEN';
  END IF;

  SELECT *
    INTO v_row
  FROM public.tournaments
  WHERE id = p_tournament_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'tournament_not_found';
  END IF;

  IF p_status IS NULL THEN
    RAISE EXCEPTION 'status is required';
  END IF;

  -- نگه داشتن وضعیت قبلی برای تشخیص transition
  v_prev_status := v_row.status;

  -- Allowed transitions:
  -- draft -> registration_open | cancelled
  -- registration_open -> cancelled
  IF v_row.status = 'draft' AND p_status IN ('registration_open','cancelled') THEN
    NULL;
  ELSIF v_row.status = 'registration_open' AND p_status = 'cancelled' THEN
    NULL;
  ELSE
    RAISE EXCEPTION 'invalid status transition from % to %', v_row.status, p_status;
  END IF;

  UPDATE public.tournaments t
     SET status     = p_status,
         updated_at = v_now
   WHERE t.id = p_tournament_id
   RETURNING * INTO v_row;

  -- ✅ الحاق: اگر از registration_open به cancelled رفتیم، پول‌های لاک‌شده را دسته‌جمعی آزاد کن
  IF v_prev_status = 'registration_open'::public.tournament_status
     AND v_row.status = 'cancelled'::public.tournament_status THEN
    PERFORM tournament.fn_admin_refund_cancelled_tournament(p_tournament_id);
  END IF;

  RETURN v_row;
END;
$$;


--
-- Name: fn_admin_update_tournament("uuid", "jsonb"); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."fn_admin_update_tournament"("p_tournament_id" "uuid", "p_patch" "jsonb") RETURNS "public"."tournaments"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'tournament', 'public', 'pg_temp'
    AS $$
BEGIN
  RETURN tournament.fn_admin_update_tournament(p_tournament_id, p_patch);
END;
$$;


--
-- Name: fn_aggregate_ding_for_processed_draw(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."fn_aggregate_ding_for_processed_draw"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
declare
  v_ding_per_card int;
begin
  -- فقط وقتی processed_at از NULL -> NOT NULL شد
  if not (tg_op = 'UPDATE' and old.processed_at is null and new.processed_at is not null) then
    return new;
  end if;

  -- اگر قبلاً aggregation انجام شده، هیچ کاری نکن (idempotent)
  if new.ding_aggregated_at is not null then
    return new;
  end if;

  -- ding_per_number: room override -> template -> 1
  select coalesce(r.ding_per_number, rt.ding_per_number, 1)::int
    into v_ding_per_card
  from public.rooms r
  join public.room_templates rt on rt.id = r.room_template_id
  where r.id = new.room_id;

  -- 4) محاسبه per user و ثبت تراکنش‌های تجمیعی (یکبار برای هر user)
  with per_user as (
    select
      t.player_user_id as user_id,
      count(*)::int as marked_cards_per_draw_quantity
    from public.tickets t
    join public.card_numbers cn
      on cn.pool_card_id = t.pool_card_id
     and cn.value = new.number
    where t.room_id = new.room_id
      and t.cancelled_at is null
      and t.reservation_status in ('reserved')  -- اگر خواستی فقط consumed کن
    group by t.player_user_id
  ),
  inc as (
    select
      user_id,
      marked_cards_per_draw_quantity,
      (marked_cards_per_draw_quantity * v_ding_per_card)::int as delta
    from per_user
    where marked_cards_per_draw_quantity > 0
  ),
  ins as (
    insert into public.ding_transactions
      (user_id, room_id, ticket_id, draw_id, drawn_number, amount, description, created_at)
    select
      i.user_id,
      new.room_id,
      null::uuid,
      new.id,
      new.number,
      i.delta,
      format('Agg ding for draw %s number %s (%s cards x %s)',
             new.id, new.number, i.marked_cards_per_draw_quantity, v_ding_per_card),
      now()
    from inc i
    on conflict do nothing
    returning user_id, amount
  )
  -- 5) فقط برای رکوردهایی که واقعاً insert شدند، balance را افزایش بده
  insert into public.ding_balances (user_id, balance, updated_at, created_at)
  select
    user_id,
    sum(amount)::numeric,
    now(),
    now()
  from ins
  group by user_id
  on conflict (user_id) do update set
    balance = public.ding_balances.balance + excluded.balance,
    updated_at = now();

  -- 6) در پایان draw را قفل کن که دوباره aggregate نشود
  update public.draws
  set ding_aggregated_at = now()
  where id = new.id
    and ding_aggregated_at is null;

  return new;
end;
$$;


--
-- Name: fn_backfill_card_bitmask_definitions(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."fn_backfill_card_bitmask_definitions"() RETURNS TABLE("cards_processed" bigint, "index_rows" bigint, "mask_rows" bigint)
    LANGUAGE "plpgsql"
    AS $$
DECLARE
  v_cards bigint := 0;
  v_index bigint := 0;
  v_masks bigint := 0;
BEGIN
  WITH ordered AS (
    SELECT
      cn.pool_card_id,
      cn.row_no,
      cn.col_no,
      cn.value,
      ROW_NUMBER() OVER (
        PARTITION BY cn.pool_card_id, cn.row_no
        ORDER BY cn.col_no
      ) - 1 AS pos_in_row
    FROM public.card_numbers cn
  ),
  positioned AS (
    SELECT
      pool_card_id,
      row_no,
      col_no,
      value,
      CASE row_no
        WHEN 1 THEN pos_in_row
        WHEN 2 THEN pos_in_row + 5
        WHEN 3 THEN pos_in_row + 10
        ELSE NULL
      END AS bit_position
    FROM ordered
    WHERE row_no BETWEEN 1 AND 3
  )
  UPDATE public.card_numbers cn
  SET bit_position = p.bit_position
  FROM positioned p
  WHERE cn.pool_card_id = p.pool_card_id
    AND cn.row_no = p.row_no
    AND cn.col_no = p.col_no
    AND cn.value = p.value;

  TRUNCATE public.card_number_index;

  INSERT INTO public.card_number_index (value, pool_card_id, bit_position)
  SELECT cn.value, cn.pool_card_id, cn.bit_position
  FROM public.card_numbers cn
  WHERE cn.bit_position IS NOT NULL
  ON CONFLICT (value, pool_card_id) DO UPDATE
  SET bit_position = EXCLUDED.bit_position;

  GET DIAGNOSTICS v_index = ROW_COUNT;

  TRUNCATE public.card_definition_masks;

  INSERT INTO public.card_definition_masks (
    pool_card_id,
    line1_mask,
    line2_mask,
    line3_mask,
    full_mask,
    cell_count
  )
  SELECT
    cn.pool_card_id,
    COALESCE(SUM(CASE WHEN cn.row_no = 1 THEN (1 << cn.bit_position) ELSE 0 END), 0)::integer,
    COALESCE(SUM(CASE WHEN cn.row_no = 2 THEN (1 << cn.bit_position) ELSE 0 END), 0)::integer,
    COALESCE(SUM(CASE WHEN cn.row_no = 3 THEN (1 << cn.bit_position) ELSE 0 END), 0)::integer,
    COALESCE(SUM(1 << cn.bit_position), 0)::integer,
    COUNT(*)::smallint
  FROM public.card_numbers cn
  WHERE cn.bit_position IS NOT NULL
  GROUP BY cn.pool_card_id;

  GET DIAGNOSTICS v_masks = ROW_COUNT;

  SELECT COUNT(DISTINCT pool_card_id)
    INTO v_cards
  FROM public.card_numbers
  WHERE bit_position IS NOT NULL;

  cards_processed := v_cards;
  index_rows := v_index;
  mask_rows := v_masks;
  RETURN NEXT;
END;
$$;


--
-- Name: fn_cancel_waiting_room("uuid", boolean); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."fn_cancel_waiting_room"("p_room" "uuid", "p_by_admin" boolean DEFAULT false) RETURNS integer
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
  v_user uuid;
BEGIN
  BEGIN
    v_user := auth.uid();
  EXCEPTION
    WHEN OTHERS THEN
      v_user := NULL;
  END;

  RETURN game_core.fn_cancel_waiting_rooms(p_room, p_by_admin, v_user);
END;
$$;


--
-- Name: fn_cancel_waiting_room("uuid", boolean, "uuid"); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."fn_cancel_waiting_room"("p_room" "uuid", "p_by_admin" boolean, "p_user" "uuid") RETURNS integer
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
BEGIN
  RETURN game_core.fn_cancel_waiting_rooms(p_room, p_by_admin, p_user);
END;
$$;


--
-- Name: fn_cleanup_retention(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."fn_cleanup_retention"() RETURNS "void"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  -- marks: 24 hours
  DELETE FROM public.marks
  WHERE created_at < now() - interval '1 day';

  -- draws: 7 days (delete dependent ding_transactions first)
  WITH old_draws AS (
    SELECT id FROM public.draws WHERE created_at < now() - interval '7 days'
  )
  DELETE FROM public.ding_transactions dt
  USING old_draws od
  WHERE dt.draw_id = od.id;

  DELETE FROM public.draws
  WHERE created_at < now() - interval '7 days';

  -- draw_jobs: 7 days (done/failed only; live queue rows must remain)
  DELETE FROM public.draw_jobs
  WHERE status IN ('done', 'failed')
    AND created_at < now() - interval '7 days';

  -- ding_transactions: 7 days
  DELETE FROM public.ding_transactions
  WHERE created_at < now() - interval '7 days';

  -- commissions_log: 35 days
  DELETE FROM public.commissions_log
  WHERE created_at < now() - interval '35 days';

  -- tickets: 7 days (delete dependents first)
  WITH old_tickets AS (
    SELECT id FROM public.tickets WHERE created_at < now() - interval '7 days'
  )
  DELETE FROM public.marks m
  USING old_tickets ot
  WHERE m.ticket_id = ot.id;

  WITH old_tickets AS (
    SELECT id FROM public.tickets WHERE created_at < now() - interval '7 days'
  )
  DELETE FROM public.commissions_log c
  USING old_tickets ot
  WHERE c.ticket_id = ot.id;

  WITH old_tickets AS (
    SELECT id FROM public.tickets WHERE created_at < now() - interval '7 days'
  )
  DELETE FROM public.ding_transactions d
  USING old_tickets ot
  WHERE d.ticket_id = ot.id;

  WITH old_tickets AS (
    SELECT id FROM public.tickets WHERE created_at < now() - interval '7 days'
  )
  DELETE FROM public.results r
  USING old_tickets ot
  WHERE r.ticket_id = ot.id;

  WITH old_tickets AS (
    SELECT id FROM public.tickets WHERE created_at < now() - interval '7 days'
  )
  DELETE FROM public.tickets t
  USING old_tickets ot
  WHERE t.id = ot.id;
END;
$$;


--
-- Name: fn_dashboard_admin_commission_summary(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."fn_dashboard_admin_commission_summary"() RETURNS TABLE("effective_user_id" "uuid", "day_amount" numeric, "week_amount" numeric, "month_amount" numeric, "day_total" numeric, "week_total" numeric, "month_total" numeric, "day_tournament_total" numeric, "week_tournament_total" numeric, "month_tournament_total" numeric, "day_tournament_amount" numeric, "week_tournament_amount" numeric, "month_tournament_amount" numeric)
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_actor uuid;
  v_actor_role text;
  v_adminzero_id uuid;
  v_effective uuid;
begin
  v_actor := auth.uid();
  if v_actor is null then
    raise exception 'UNAUTHORIZED';
  end if;

  select u.role::text
    into v_actor_role
  from public.users u
  where u.id = v_actor;

  if v_actor_role is distinct from 'admin' then
    raise exception 'FORBIDDEN';
  end if;

  select u.id
    into v_adminzero_id
  from public.users u
  where u.username = 'adminzero'
    and u.role = 'admin'
  limit 1;

  v_effective := coalesce(v_adminzero_id, v_actor);

  return query
  with b as (
    select now() as n
  ),
  fee_ticket as (
    select
      coalesce(sum(t.amount) filter (where t.created_at >= date_trunc('day', b.n)), 0) as day_amount,
      coalesce(sum(t.amount) filter (where t.created_at >= date_trunc('week', b.n)), 0) as week_amount,
      coalesce(sum(t.amount) filter (where t.created_at >= date_trunc('month', b.n)), 0) as month_amount
    from public.transactions t
    cross join b
    where t.user_id = v_effective
      and t.type = 'fee_admin'
      and t.source_kind = 'ticket_commission'
  ),
  fee_tournament as (
    select
      coalesce(sum(s.admin_amount) filter (where s.created_at >= date_trunc('day', b.n)), 0) as day_amount,
      coalesce(sum(s.admin_amount) filter (where s.created_at >= date_trunc('week', b.n)), 0) as week_amount,
      coalesce(sum(s.admin_amount) filter (where s.created_at >= date_trunc('month', b.n)), 0) as month_amount
    from public.tournament_commission_snapshots s
    cross join b
    where s.admin_id = v_effective
       or s.admin_id is null
  ),
  base_ticket as (
    select
      coalesce(sum(c.commission_base) filter (where c.created_at >= date_trunc('day', b.n)), 0) as day_total,
      coalesce(sum(c.commission_base) filter (where c.created_at >= date_trunc('week', b.n)), 0) as week_total,
      coalesce(sum(c.commission_base) filter (where c.created_at >= date_trunc('month', b.n)), 0) as month_total
    from public.commissions_log c
    cross join b
  ),
  base_tournament as (
    select
      coalesce(sum(s.commission_base) filter (where s.created_at >= date_trunc('day', b.n)), 0) as day_total,
      coalesce(sum(s.commission_base) filter (where s.created_at >= date_trunc('week', b.n)), 0) as week_total,
      coalesce(sum(s.commission_base) filter (where s.created_at >= date_trunc('month', b.n)), 0) as month_total
    from public.tournament_commission_snapshots s
    cross join b
    where s.admin_id = v_effective
       or s.admin_id is null
  )
  select
    v_effective as effective_user_id,
    fee_ticket.day_amount + fee_tournament.day_amount as day_amount,
    fee_ticket.week_amount + fee_tournament.week_amount as week_amount,
    fee_ticket.month_amount + fee_tournament.month_amount as month_amount,
    base_ticket.day_total + base_tournament.day_total as day_total,
    base_ticket.week_total + base_tournament.week_total as week_total,
    base_ticket.month_total + base_tournament.month_total as month_total,
    base_tournament.day_total as day_tournament_total,
    base_tournament.week_total as week_tournament_total,
    base_tournament.month_total as month_tournament_total,
    fee_tournament.day_amount as day_tournament_amount,
    fee_tournament.week_amount as week_tournament_amount,
    fee_tournament.month_amount as month_tournament_amount
  from fee_ticket, fee_tournament, base_ticket, base_tournament;
end;
$$;


--
-- Name: fn_dashboard_admin_commission_summary_range(timestamp with time zone, timestamp with time zone); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."fn_dashboard_admin_commission_summary_range"("p_from" timestamp with time zone, "p_to" timestamp with time zone) RETURNS TABLE("effective_user_id" "uuid", "amount" numeric, "total" numeric, "tournament_amount" numeric, "tournament_total" numeric)
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_actor uuid;
  v_actor_role text;
  v_adminzero_id uuid;
  v_effective uuid;
begin
  v_actor := auth.uid();
  if v_actor is null then
    raise exception 'UNAUTHORIZED';
  end if;

  if p_from is null or p_to is null or p_from > p_to then
    raise exception 'INVALID_RANGE';
  end if;

  select u.role::text
    into v_actor_role
  from public.users u
  where u.id = v_actor;

  if v_actor_role is distinct from 'admin' then
    raise exception 'FORBIDDEN';
  end if;

  select u.id
    into v_adminzero_id
  from public.users u
  where u.username = 'adminzero'
    and u.role = 'admin'
  limit 1;

  v_effective := coalesce(v_adminzero_id, v_actor);

  return query
  with fee_ticket as (
    select coalesce(sum(t.amount), 0) as amount
    from public.transactions t
    where t.user_id = v_effective
      and t.type = 'fee_admin'
      and t.source_kind = 'ticket_commission'
      and t.created_at >= p_from
      and t.created_at <= p_to
  ),
  fee_tournament as (
    select coalesce(sum(s.admin_amount), 0) as amount
    from public.tournament_commission_snapshots s
    where (s.admin_id = v_effective or s.admin_id is null)
      and s.created_at >= p_from
      and s.created_at <= p_to
  ),
  base_ticket as (
    select coalesce(sum(c.commission_base), 0) as total
    from public.commissions_log c
    where c.created_at >= p_from
      and c.created_at <= p_to
  ),
  base_tournament as (
    select coalesce(sum(s.commission_base), 0) as total
    from public.tournament_commission_snapshots s
    where (s.admin_id = v_effective or s.admin_id is null)
      and s.created_at >= p_from
      and s.created_at <= p_to
  )
  select
    v_effective as effective_user_id,
    fee_ticket.amount + fee_tournament.amount as amount,
    base_ticket.total + base_tournament.total as total,
    fee_tournament.amount as tournament_amount,
    base_tournament.total as tournament_total
  from fee_ticket, fee_tournament, base_ticket, base_tournament;
end;
$$;


--
-- Name: fn_dashboard_admin_tournament_guarantee_summary(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."fn_dashboard_admin_tournament_guarantee_summary"() RETURNS TABLE("effective_user_id" "uuid", "day_amount" numeric, "week_amount" numeric, "month_amount" numeric)
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_actor uuid;
  v_actor_role text;
  v_adminzero_id uuid;
  v_effective uuid;
begin
  v_actor := auth.uid();
  if v_actor is null then
    raise exception 'UNAUTHORIZED';
  end if;

  select u.role::text
    into v_actor_role
  from public.users u
  where u.id = v_actor;

  if v_actor_role is distinct from 'admin' then
    raise exception 'FORBIDDEN';
  end if;

  select u.id
    into v_adminzero_id
  from public.users u
  where u.username = 'adminzero'
    and u.role = 'admin'
  limit 1;

  v_effective := coalesce(v_adminzero_id, v_actor);

  return query
  with b as (
    select now() as n
  ),
  prizes_day as (
    select t.source_ref as tournament_id, coalesce(sum(t.amount), 0) as prize_amount
    from public.transactions t
    cross join b
    where t.source_kind = 'tournament_prize'
      and t.type = 'win'
      and t.created_at >= date_trunc('day', b.n)
    group by t.source_ref
  ),
  pools_day as (
    select s.tournament_id::text as tournament_id, coalesce(sum(s.amount_to_pool), 0) as pool_amount
    from public.tournament_commission_snapshots s
    join prizes_day p on p.tournament_id = s.tournament_id::text
    group by s.tournament_id::text
  ),
  agg_day as (
    select coalesce(sum(greatest(p.prize_amount - coalesce(pd.pool_amount, 0), 0)), 0) as amount
    from prizes_day p
    left join pools_day pd on pd.tournament_id = p.tournament_id
  ),
  prizes_week as (
    select t.source_ref as tournament_id, coalesce(sum(t.amount), 0) as prize_amount
    from public.transactions t
    cross join b
    where t.source_kind = 'tournament_prize'
      and t.type = 'win'
      and t.created_at >= date_trunc('week', b.n)
    group by t.source_ref
  ),
  pools_week as (
    select s.tournament_id::text as tournament_id, coalesce(sum(s.amount_to_pool), 0) as pool_amount
    from public.tournament_commission_snapshots s
    join prizes_week p on p.tournament_id = s.tournament_id::text
    group by s.tournament_id::text
  ),
  agg_week as (
    select coalesce(sum(greatest(p.prize_amount - coalesce(pw.pool_amount, 0), 0)), 0) as amount
    from prizes_week p
    left join pools_week pw on pw.tournament_id = p.tournament_id
  ),
  prizes_month as (
    select t.source_ref as tournament_id, coalesce(sum(t.amount), 0) as prize_amount
    from public.transactions t
    cross join b
    where t.source_kind = 'tournament_prize'
      and t.type = 'win'
      and t.created_at >= date_trunc('month', b.n)
    group by t.source_ref
  ),
  pools_month as (
    select s.tournament_id::text as tournament_id, coalesce(sum(s.amount_to_pool), 0) as pool_amount
    from public.tournament_commission_snapshots s
    join prizes_month p on p.tournament_id = s.tournament_id::text
    group by s.tournament_id::text
  ),
  agg_month as (
    select coalesce(sum(greatest(p.prize_amount - coalesce(pm.pool_amount, 0), 0)), 0) as amount
    from prizes_month p
    left join pools_month pm on pm.tournament_id = p.tournament_id
  )
  select
    v_effective as effective_user_id,
    agg_day.amount as day_amount,
    agg_week.amount as week_amount,
    agg_month.amount as month_amount
  from agg_day, agg_week, agg_month;
end;
$$;


--
-- Name: fn_dashboard_admin_tournament_guarantee_summary_range(timestamp with time zone, timestamp with time zone); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."fn_dashboard_admin_tournament_guarantee_summary_range"("p_from" timestamp with time zone, "p_to" timestamp with time zone) RETURNS TABLE("effective_user_id" "uuid", "amount" numeric)
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_actor uuid;
  v_actor_role text;
  v_adminzero_id uuid;
  v_effective uuid;
begin
  v_actor := auth.uid();
  if v_actor is null then
    raise exception 'UNAUTHORIZED';
  end if;

  if p_from is null or p_to is null or p_from > p_to then
    raise exception 'INVALID_RANGE';
  end if;

  select u.role::text
    into v_actor_role
  from public.users u
  where u.id = v_actor;

  if v_actor_role is distinct from 'admin' then
    raise exception 'FORBIDDEN';
  end if;

  select u.id
    into v_adminzero_id
  from public.users u
  where u.username = 'adminzero'
    and u.role = 'admin'
  limit 1;

  v_effective := coalesce(v_adminzero_id, v_actor);

  return query
  with prizes as (
    select t.source_ref as tournament_id, coalesce(sum(t.amount), 0) as prize_amount
    from public.transactions t
    where t.source_kind = 'tournament_prize'
      and t.type = 'win'
      and t.created_at >= p_from
      and t.created_at <= p_to
    group by t.source_ref
  ),
  pools as (
    select s.tournament_id::text as tournament_id, coalesce(sum(s.amount_to_pool), 0) as pool_amount
    from public.tournament_commission_snapshots s
    join prizes p on p.tournament_id = s.tournament_id::text
    group by s.tournament_id::text
  ),
  agg as (
    select coalesce(sum(greatest(p.prize_amount - coalesce(po.pool_amount, 0), 0)), 0) as amount
    from prizes p
    left join pools po on po.tournament_id = p.tournament_id
  )
  select
    v_effective as effective_user_id,
    agg.amount as amount
  from agg;
end;
$$;


--
-- Name: fn_deposit_create_intent("uuid", "text", "text", numeric, "text", timestamp with time zone, "text", "jsonb", "text", "uuid", "text"); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."fn_deposit_create_intent"("p_user_id" "uuid", "p_channel" "text", "p_provider" "text", "p_amount_expected" numeric, "p_currency" "text", "p_expires_at" timestamp with time zone, "p_destination_ref" "text" DEFAULT NULL::"text", "p_metadata" "jsonb" DEFAULT '{}'::"jsonb", "p_created_by" "text" DEFAULT 'system'::"text", "p_created_by_actor_id" "uuid" DEFAULT NULL::"uuid", "p_provider_intent_ref" "text" DEFAULT NULL::"text") RETURNS "uuid"
    LANGUAGE "sql" SECURITY DEFINER
    SET "search_path" TO 'deposit', 'public'
    AS $$
  SELECT deposit.fn_create_intent(
    p_user_id, p_channel, p_provider, p_amount_expected, p_currency, p_expires_at,
    p_destination_ref, p_metadata, p_created_by, p_created_by_actor_id, p_provider_intent_ref
  );
$$;


--
-- Name: fn_deposit_get_intent_status("uuid"); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."fn_deposit_get_intent_status"("p_intent_id" "uuid") RETURNS "jsonb"
    LANGUAGE "sql" SECURITY DEFINER
    SET "search_path" TO 'deposit', 'public'
    AS $$ SELECT deposit.fn_get_intent_status(p_intent_id); $$;


--
-- Name: fn_deposit_post_credit("uuid"); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."fn_deposit_post_credit"("p_intent_id" "uuid") RETURNS "jsonb"
    LANGUAGE "sql" SECURITY DEFINER
    SET "search_path" TO 'deposit', 'public'
    AS $$ SELECT deposit.fn_post_credit(p_intent_id); $$;


--
-- Name: fn_deposit_recon(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."fn_deposit_recon"() RETURNS "jsonb"
    LANGUAGE "sql" SECURITY DEFINER
    SET "search_path" TO 'deposit', 'public'
    AS $$ SELECT deposit.fn_recon_deposit(); $$;


--
-- Name: fn_dev_panel_dev_player_finance_summary("text", "text"); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."fn_dev_panel_dev_player_finance_summary"("p_period" "text", "p_timezone" "text" DEFAULT 'Asia/Tehran'::"text") RETURNS "jsonb"
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
DECLARE
  v_from timestamptz;
  v_to timestamptz := now();
  v_tz text := COALESCE(NULLIF(trim(p_timezone), ''), 'Asia/Tehran');
  v_cards bigint := 0;
  v_purchase numeric := 0;
  v_win numeric := 0;
  v_commission numeric := 0;
  v_loss numeric := 0;
  v_dev_count bigint := 0;
BEGIN
  IF p_period NOT IN ('day', 'week', 'month') THEN
    RAISE EXCEPTION 'invalid period: %', p_period;
  END IF;

  IF p_period = 'day' THEN
    v_from := (date_trunc('day', now() AT TIME ZONE v_tz) AT TIME ZONE v_tz);
  ELSIF p_period = 'week' THEN
    v_from := v_to - interval '7 days';
  ELSE
    v_from := (date_trunc('month', now() AT TIME ZONE v_tz) AT TIME ZONE v_tz);
  END IF;

  SELECT COUNT(DISTINCT dpc.user_id)
    INTO v_dev_count
  FROM public.dev_player_configs dpc;

  SELECT
    COUNT(*)::bigint,
    COALESCE(SUM(tk.price), 0)
  INTO v_cards, v_purchase
  FROM public.tickets tk
  INNER JOIN public.dev_player_configs dpc ON dpc.user_id = tk.player_user_id
  WHERE tk.reservation_status IN ('consumed', 'confirmed')
    AND tk.created_at >= v_from
    AND tk.created_at < v_to;

  SELECT COALESCE(SUM(t.amount), 0)
    INTO v_win
  FROM public.transactions t
  INNER JOIN public.dev_player_configs dpc ON dpc.user_id = t.user_id
  WHERE t.type = 'win'::public.transaction_type
    AND t.created_at >= v_from
    AND t.created_at < v_to;

  SELECT COALESCE(SUM(cl.commission_base), 0)
    INTO v_commission
  FROM public.commissions_log cl
  INNER JOIN public.dev_player_configs dpc ON dpc.user_id = cl.player_id
  WHERE cl.created_at >= v_from
    AND cl.created_at < v_to;

  v_loss := GREATEST(v_purchase - v_win, 0);

  RETURN jsonb_build_object(
    'period', p_period,
    'timezone', v_tz,
    'from', v_from,
    'to', v_to,
    'dev_player_count', v_dev_count,
    'cards_purchased', v_cards,
    'total_purchase_amount', v_purchase,
    'total_win_amount', v_win,
    'total_commission_amount', v_commission,
    'total_loss_amount', v_loss,
    'currency', 'IRR'
  );
END;
$$;


--
-- Name: fn_ding_aggregate_dryrun_on_draw_processed(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."fn_ding_aggregate_dryrun_on_draw_processed"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
declare
  v_ding_per_card int;
begin
  if not (tg_op = 'UPDATE' and old.processed_at is null and new.processed_at is not null) then
    return new;
  end if;

  select coalesce(r.ding_per_number, rt.ding_per_number, 1)::int
    into v_ding_per_card
  from public.rooms r
  join public.room_templates rt on rt.id = r.room_template_id
  where r.id = new.room_id;

  with per_user as (
    select
      t.player_user_id as user_id,
      count(*)::int as marked_cards_per_draw_quantity
    from public.tickets t
    join public.card_numbers cn
      on cn.pool_card_id = t.pool_card_id
     and cn.value = new.number
    where t.room_id = new.room_id
      and t.cancelled_at is null
      and t.reservation_status in ('reserved','consumed')
    group by t.player_user_id
  ),
  inc as (
    select
      user_id,
      marked_cards_per_draw_quantity,
      (marked_cards_per_draw_quantity * v_ding_per_card)::int as delta
    from per_user
    where marked_cards_per_draw_quantity > 0
  )
  insert into public.ding_transactions
    (user_id, room_id, ticket_id, draw_id, drawn_number, amount, description, created_at)
  select
    i.user_id,
    new.room_id,
    null::uuid,
    new.id,
    new.number,
    i.delta,
    format('[DRYRUN] Agg ding for draw %s number %s on %s card(s) x %s',
           new.id, new.number, i.marked_cards_per_draw_quantity, v_ding_per_card),
    now()
  from inc i
  on conflict do nothing;  -- ✅ اینجا درست شد (بدون target)

  return new;
end;
$$;


--
-- Name: fn_draw_schedule_jitter_ms("uuid"); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."fn_draw_schedule_jitter_ms"("p_room_id" "uuid") RETURNS integer
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_stable integer;
  v_random integer;
BEGIN
  v_stable := (abs(hashtext(p_room_id::text)) % 601) - 300;
  v_random := floor(random() * 201)::integer - 100;
  RETURN v_stable + v_random;
END;
$$;


--
-- Name: FUNCTION "fn_draw_schedule_jitter_ms"("p_room_id" "uuid"); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION "public"."fn_draw_schedule_jitter_ms"("p_room_id" "uuid") IS 'Returns draw schedule jitter in ms: per-room stable [-300,+300] plus random [-100,+100].';


--
-- Name: fn_evaluate_room_after_draw("uuid", integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."fn_evaluate_room_after_draw"("p_room_id" "uuid", "p_draw_number" integer) RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'game_finance', 'game_core'
    AS $$
DECLARE
  v_full_winner_count integer;
  v_first_line_draw integer;
BEGIN
  SELECT first_line_draw_number
    INTO v_first_line_draw
  FROM public.rooms
  WHERE id = p_room_id
  FOR UPDATE;

  WITH ticket_analysis AS (
    SELECT 
      t.id AS ticket_id,
      t.player_user_id AS user_id,
      COUNT(DISTINCT cn.value) AS total_cells,
      COUNT(DISTINCT CASE WHEN m.value IS NOT NULL THEN cn.value END) AS marked_cells,
      COUNT(DISTINCT CASE WHEN cn.row_no = 1 AND m.value IS NOT NULL THEN cn.value END) AS row1_marked,
      COUNT(DISTINCT CASE WHEN cn.row_no = 2 AND m.value IS NOT NULL THEN cn.value END) AS row2_marked,
      COUNT(DISTINCT CASE WHEN cn.row_no = 3 AND m.value IS NOT NULL THEN cn.value END) AS row3_marked,
      COUNT(DISTINCT CASE WHEN cn.row_no = 1 THEN cn.value END) AS row1_total,
      COUNT(DISTINCT CASE WHEN cn.row_no = 2 THEN cn.value END) AS row2_total,
      COUNT(DISTINCT CASE WHEN cn.row_no = 3 THEN cn.value END) AS row3_total
    FROM tickets t
    INNER JOIN card_numbers cn ON cn.pool_card_id = t.pool_card_id
    LEFT JOIN marks m ON m.ticket_id = t.id AND m.value = cn.value
    WHERE t.room_id = p_room_id
      AND t.reservation_status IN ('reserved','confirmed','consumed')
    GROUP BY t.id, t.player_user_id
  ),
  line_candidates AS (
    SELECT ticket_id, user_id
    FROM ticket_analysis ta
    WHERE (
      ta.row1_marked = ta.row1_total OR
      ta.row2_marked = ta.row2_total OR
      ta.row3_marked = ta.row3_total
    )
    AND NOT EXISTS (
      SELECT 1 FROM results r
      WHERE r.ticket_id = ta.ticket_id
        AND r.win_type = 'line'
    )
  ),
  full_candidates AS (
    SELECT ticket_id, user_id
    FROM ticket_analysis ta
    WHERE ta.marked_cells = ta.total_cells
      AND NOT EXISTS (
        SELECT 1 FROM results r
        WHERE r.ticket_id = ta.ticket_id
          AND r.win_type = 'full'
      )
  ),
  winners AS (
    SELECT ticket_id, user_id, 'line'::text AS win_type
    FROM line_candidates
    WHERE v_first_line_draw IS NULL OR v_first_line_draw = p_draw_number
    UNION ALL
    SELECT ticket_id, user_id, 'full'::text AS win_type
    FROM full_candidates
  )
  INSERT INTO results (room_id, user_id, ticket_id, win_type, reward_amount, draw_number)
  SELECT 
    p_room_id,
    user_id,
    ticket_id,
    win_type,
    0,
    p_draw_number
  FROM winners
  ON CONFLICT DO NOTHING;

  IF v_first_line_draw IS NULL THEN
    IF EXISTS (
      SELECT 1 FROM results r
      WHERE r.room_id = p_room_id
        AND r.win_type = 'line'
        AND r.draw_number = p_draw_number
    ) THEN
      UPDATE rooms
         SET first_line_draw_number = p_draw_number
       WHERE id = p_room_id
         AND first_line_draw_number IS NULL;
    END IF;
  END IF;

  SELECT COUNT(*)
    INTO v_full_winner_count
  FROM results
  WHERE room_id = p_room_id
    AND win_type = 'full'
    AND draw_number = p_draw_number;

  IF v_full_winner_count > 0 THEN
    UPDATE rooms
       SET status = 'settling'::room_status,
           updated_at = NOW()
     WHERE id = p_room_id
       AND status <> 'finished'::room_status
       AND status <> 'settling'::room_status;

    PERFORM game_finance.fn_finish_room_and_settle(p_room_id);
  END IF;
END;
$$;


--
-- Name: fn_finish_room_and_settle("uuid", "uuid"); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."fn_finish_room_and_settle"("p_room" "uuid", "p_admin_user" "uuid" DEFAULT NULL::"uuid") RETURNS "void"
    LANGUAGE "sql" SECURITY DEFINER
    SET "search_path" TO 'public', 'game_finance', 'game_core'
    AS $$
  SELECT game_finance.fn_finish_room_and_settle(p_room, p_admin_user);
$$;


--
-- Name: fn_generate_card_pool(integer, "uuid", "text"); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."fn_generate_card_pool"("p_card_count" integer DEFAULT 10000, "p_created_by" "uuid" DEFAULT NULL::"uuid", "p_prng_version" "text" DEFAULT 'v1'::"text") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
BEGIN
  RETURN game_core.fn_generate_card_pool(
    p_card_count := p_card_count,
    p_created_by := p_created_by,
    p_prng_version := p_prng_version
  );
END;
$$;


--
-- Name: FUNCTION "fn_generate_card_pool"("p_card_count" integer, "p_created_by" "uuid", "p_prng_version" "text"); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION "public"."fn_generate_card_pool"("p_card_count" integer, "p_created_by" "uuid", "p_prng_version" "text") IS 'Wrapper function to call game_core.fn_generate_card_pool from public schema for RPC access';


--
-- Name: fn_generate_room_code(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."fn_generate_room_code"() RETURNS "text"
    LANGUAGE "sql" STABLE
    AS $$SELECT upper(substr(encode(extensions.gen_random_bytes(4), 'hex'), 1, 6));$$;


--
-- Name: fn_heartbeat_log(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."fn_heartbeat_log"() RETURNS "void"
    LANGUAGE "plpgsql"
    AS $$
begin
  insert into public.heartbeat_log(created_at) values (now());
end;
$$;


--
-- Name: fn_heartbeat_tick(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."fn_heartbeat_tick"() RETURNS "void"
    LANGUAGE "plpgsql"
    AS $$
begin
  -- مدیریت روم‌های در حالت waiting → live/playing
  perform game_core.fn_manage_waiting_rooms(50, false);

  -- مدیریت روم‌های در حال بازی / تولید draw و job
  perform game_core.fn_manage_room_live_actions();
end;
$$;


--
-- Name: fn_janitor_repair_unsettled_finished(integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."fn_janitor_repair_unsettled_finished"("p_limit" integer DEFAULT 20) RETURNS TABLE("room_id" "uuid")
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  RETURN QUERY SELECT * FROM game_core.fn_janitor_repair_unsettled_finished(p_limit);
END;
$$;


--
-- Name: fn_join_or_create_room("uuid", integer, "text"); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."fn_join_or_create_room"("p_template_id" "uuid", "p_card_count" integer, "p_password" "text" DEFAULT NULL::"text") RETURNS TABLE("room_id" "uuid", "starts_at" timestamp with time zone, "ticket_ids" "uuid"[])
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
  v_template_status public.room_template_status;
  v_global_registration_locked boolean := false;

  v_user_id      uuid;
  v_user_role    text;
  v_user_status  text;
  v_parent_id    uuid;

  v_agent_id     uuid;
  v_super_id     uuid;
  v_agent_status text;
  v_super_status text;
  v_parent_role  text;
  v_parent_parent_id uuid;
BEGIN
  -- 0) کاربر فعلی (player)
  BEGIN
    v_user_id := auth.uid();
  EXCEPTION
    WHEN others THEN
      v_user_id := NULL;
  END;

  IF v_user_id IS NOT NULL THEN
    SELECT role, status, parent_id
      INTO v_user_role, v_user_status, v_parent_id
    FROM public.users
    WHERE id = v_user_id;

    IF FOUND AND v_user_role = 'player' THEN
      IF v_user_status = 'suspended' THEN
        RAISE EXCEPTION 'player account suspended';
      END IF;

      SELECT agent_id, super_id
        INTO v_agent_id, v_super_id
      FROM public.player_affiliation
      WHERE user_id = v_user_id;

      IF NOT FOUND THEN
        IF v_parent_id IS NOT NULL THEN
          SELECT role, parent_id
            INTO v_parent_role, v_parent_parent_id
          FROM public.users
          WHERE id = v_parent_id;

          IF FOUND THEN
            IF v_parent_role = 'agent' THEN
              v_agent_id := v_parent_id;
              IF v_parent_parent_id IS NOT NULL THEN
                SELECT id
                  INTO v_super_id
                FROM public.users
                WHERE id = v_parent_parent_id
                  AND role = 'super';
              END IF;
            ELSIF v_parent_role = 'super' THEN
              v_super_id := v_parent_id;
            END IF;
          END IF;
        END IF;
      END IF;

      IF v_agent_id IS NOT NULL THEN
        SELECT status
          INTO v_agent_status
        FROM public.users
        WHERE id = v_agent_id;

        IF FOUND AND v_agent_status = 'suspended' THEN
          RAISE EXCEPTION 'agent account suspended';
        END IF;
      END IF;

      IF v_super_id IS NOT NULL THEN
        SELECT status
          INTO v_super_status
        FROM public.users
        WHERE id = v_super_id;

        IF FOUND AND v_super_status = 'suspended' THEN
          RAISE EXCEPTION 'super account suspended';
        END IF;
      END IF;
    END IF;
  END IF;

  -- 1) قفل سراسری ثبت‌نام
  SELECT global_registration_locked
    INTO v_global_registration_locked
  FROM public.app_runtime_flags
  WHERE id = true;

  IF COALESCE(v_global_registration_locked, false) THEN
    RAISE EXCEPTION 'global registration locked';
  END IF;

  -- 2) وضعیت تمپلیت
  SELECT status
    INTO v_template_status
  FROM public.room_templates
  WHERE id = p_template_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'room template not found: %', p_template_id;
  END IF;

  IF v_template_status = 'inactive' THEN
    RAISE EXCEPTION 'room template is inactive';
  END IF;

  -- 3) فراخوانی شیم پایه
  RETURN QUERY
  SELECT base_result.room_id, base_result.starts_at, base_result.ticket_ids
  FROM public.fn_join_or_create_room_base(p_template_id, p_card_count, p_password)
       AS base_result;
END;
$$;


--
-- Name: fn_join_or_create_room_base("uuid", integer, "text"); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."fn_join_or_create_room_base"("p_template_id" "uuid", "p_card_count" integer, "p_password" "text") RETURNS TABLE("room_id" "uuid", "starts_at" timestamp with time zone, "ticket_ids" "uuid"[])
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
BEGIN
  RETURN QUERY
  SELECT core_result.room_id, core_result.starts_at, core_result.ticket_ids
  FROM game_core.fn_join_or_create_room_core(p_template_id, p_card_count, p_password)
       AS core_result;
END;
$$;


--
-- Name: fn_leaderboard_weekly(timestamp with time zone, timestamp with time zone); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."fn_leaderboard_weekly"("p_from" timestamp with time zone, "p_to" timestamp with time zone) RETURNS TABLE("player_id" "uuid", "player_name" "text", "display_name" "text", "avatar_url" "text", "total_wins" numeric, "card_count" bigint)
    LANGUAGE "sql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  WITH normal_rooms AS (
    SELECT r.id
    FROM public.rooms r
    JOIN public.room_templates rt ON rt.id = r.room_template_id
    WHERE rt.room_type = 'normal'
  ),
  wins AS (
    SELECT r.user_id, SUM(COALESCE(r.reward_amount, 0)) AS total_wins
    FROM public.results r
    WHERE r.created_at >= p_from
      AND r.created_at <= p_to
      AND r.room_id IN (SELECT id FROM normal_rooms)
    GROUP BY r.user_id
  ),
  cards AS (
    SELECT t.player_user_id AS user_id, COUNT(*)::bigint AS card_count
    FROM public.tickets t
    WHERE t.created_at >= p_from
      AND t.created_at <= p_to
      AND t.reservation_status IN ('confirmed','consumed')
      AND t.room_id IN (SELECT id FROM normal_rooms)
    GROUP BY t.player_user_id
  ),
  ids AS (
    SELECT user_id FROM wins
    UNION
    SELECT user_id FROM cards
  )
  SELECT
    u.id AS player_id,
    u.username AS player_name,
    up.nickname AS display_name,
    up.avatar_url AS avatar_url,
    COALESCE(w.total_wins, 0) AS total_wins,
    COALESCE(c.card_count, 0) AS card_count
  FROM ids
  JOIN public.users u ON u.id = ids.user_id
  LEFT JOIN public.user_profiles up ON up.user_id = u.id
  LEFT JOIN wins w ON w.user_id = ids.user_id
  LEFT JOIN cards c ON c.user_id = ids.user_id
  WHERE u.role = 'player';
$$;


--
-- Name: fn_maintain_heartbeat_log_partitions(integer, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."fn_maintain_heartbeat_log_partitions"("p_keep_days" integer DEFAULT 2, "p_future_days" integer DEFAULT 7) RETURNS "void"
    LANGUAGE "plpgsql"
    AS $$
DECLARE
  d date;
  v_cutoff date := current_date - p_keep_days;
  r record;
  v_part_date date;
BEGIN
  -- Create partitions for upcoming days
  FOR i IN 1..p_future_days LOOP
    d := current_date + i;
    EXECUTE format(
      'CREATE TABLE IF NOT EXISTS public.heartbeat_log_%s PARTITION OF public.heartbeat_log FOR VALUES FROM (%L) TO (%L);',
      to_char(d,'YYYYMMDD'),
      d::timestamptz,
      (d + 1)::timestamptz
    );
  END LOOP;

  -- Drop partitions older than retention
  FOR r IN
    SELECT n.nspname, c.relname
    FROM pg_inherits i
    JOIN pg_class c ON c.oid = i.inhrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE i.inhparent = 'public.heartbeat_log'::regclass
      AND c.relname LIKE 'heartbeat_log_%'
      AND c.relname <> 'heartbeat_log_default'
  LOOP
    v_part_date := to_date(substring(r.relname from 'heartbeat_log_(\d{8})'), 'YYYYMMDD');
    IF v_part_date IS NOT NULL AND v_part_date < v_cutoff THEN
      EXECUTE format('DROP TABLE IF EXISTS %I.%I', r.nspname, r.relname);
    END IF;
  END LOOP;

  -- Cleanup default partition (legacy rows before partitioning)
  DELETE FROM public.heartbeat_log_default
  WHERE created_at < (now() - make_interval(days => p_keep_days));
END;
$$;


--
-- Name: fn_my_active_rooms("uuid"); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."fn_my_active_rooms"("p_user_id" "uuid" DEFAULT NULL::"uuid") RETURNS TABLE("room_id" "uuid", "room_code" "text", "status" "public"."room_status", "card_price" numeric, "currency" "text", "card_count" bigint, "prize" numeric, "room_type" "text")
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_user uuid;
BEGIN
  IF auth.role() = 'service_role' THEN
    IF p_user_id IS NULL THEN
      RAISE EXCEPTION 'p_user_id required for service role';
    END IF;
    v_user := p_user_id;
  ELSE
    v_user := auth.uid();
    IF v_user IS NULL THEN
      RAISE EXCEPTION 'unauthenticated';
    END IF;
    IF p_user_id IS NOT NULL AND p_user_id <> v_user THEN
      RAISE EXCEPTION 'forbidden';
    END IF;
  END IF;

  RETURN QUERY
  SELECT
    r.id AS room_id,
    r.room_code,
    r.status,
    r.card_price,
    r.currency,
    COUNT(*)::bigint AS card_count,
    (COUNT(*)::numeric * COALESCE(r.card_price, 0)) AS prize,
    COALESCE(rt.room_type, 'normal')::text AS room_type
  FROM public.tickets t
  JOIN public.rooms r ON r.id = t.room_id
  LEFT JOIN public.room_templates rt ON rt.id = r.room_template_id
  WHERE t.player_user_id = v_user
    AND t.reservation_status IN ('reserved', 'confirmed', 'consumed')
    AND r.status IN ('waiting', 'playing', 'live', 'settling')
  GROUP BY r.id, r.room_code, r.status, r.card_price, r.currency, rt.room_type
  ORDER BY r.status;
END;
$$;


--
-- Name: fn_payout_room_if_full("uuid"); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."fn_payout_room_if_full"("p_room_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
BEGIN
  PERFORM game_finance.fn_finish_room_and_settle(p_room_id);
END;
$$;


--
-- Name: dev_room_schedules; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."dev_room_schedules" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "room_template_id" "uuid" NOT NULL,
    "ticket_count" integer NOT NULL,
    "scheduled_at" timestamp with time zone NOT NULL,
    "status" "public"."dev_schedule_status" DEFAULT 'draft'::"public"."dev_schedule_status" NOT NULL,
    "created_by" "uuid" NOT NULL,
    "approved_by" "uuid",
    "approved_at" timestamp with time zone,
    "processed_at" timestamp with time zone,
    "result_room_id" "uuid",
    "result_ticket_ids" "uuid"[],
    "last_error" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "bot_room_schedules_ticket_count_check" CHECK (("ticket_count" > 0))
);


--
-- Name: fn_pick_dev_room_schedules(integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."fn_pick_dev_room_schedules"("p_limit" integer DEFAULT 10) RETURNS SETOF "public"."dev_room_schedules"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
  job public.dev_room_schedules%rowtype;
BEGIN
  FOR job IN
    SELECT *
    FROM public.dev_room_schedules
    WHERE status = 'approved'::dev_schedule_status
      AND scheduled_at <= now()
    ORDER BY scheduled_at ASC
    FOR UPDATE SKIP LOCKED
    LIMIT p_limit
  LOOP
    UPDATE public.dev_room_schedules
    SET status = 'processing',
        updated_at = now()
    WHERE id = job.id;

    RETURN NEXT job;
  END LOOP;
END;
$$;


--
-- Name: fn_ping_presence(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."fn_ping_presence"() RETURNS "void"
    LANGUAGE "sql" SECURITY DEFINER
    AS $$
  update public.users
  set last_seen_at = now()
  where id = auth.uid();
$$;


--
-- Name: fn_player_game_stats("uuid", timestamp with time zone, timestamp with time zone); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."fn_player_game_stats"("p_user_id" "uuid", "p_from" timestamp with time zone, "p_to" timestamp with time zone) RETURNS TABLE("total_cards_purchased" bigint, "total_purchase_amount" numeric, "line_wins_count" bigint, "full_wins_count" bigint, "win_rate" numeric, "average_cards_per_game" numeric)
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_user uuid;
BEGIN
  IF auth.role() = 'service_role' THEN
    IF p_user_id IS NULL THEN
      RAISE EXCEPTION 'p_user_id required for service role';
    END IF;
    v_user := p_user_id;
  ELSE
    v_user := auth.uid();
    IF v_user IS NULL THEN
      RAISE EXCEPTION 'unauthenticated';
    END IF;
    IF p_user_id IS NOT NULL AND p_user_id <> v_user THEN
      RAISE EXCEPTION 'forbidden';
    END IF;
  END IF;

  RETURN QUERY
  WITH normal_rooms AS (
    SELECT r.id
    FROM public.rooms r
    JOIN public.room_templates rt ON rt.id = r.room_template_id
    WHERE rt.room_type = 'normal'
  ),
  tickets AS (
    SELECT t.room_id, t.price
    FROM public.tickets t
    WHERE t.player_user_id = v_user
      AND t.reservation_status IN ('confirmed', 'consumed')
      AND t.created_at >= p_from
      AND t.created_at <= p_to
      AND t.room_id IN (SELECT id FROM normal_rooms)
  ),
  ticket_stats AS (
    SELECT
      COUNT(*)::bigint AS total_cards,
      COALESCE(SUM(t.price), 0) AS total_price,
      COUNT(DISTINCT t.room_id)::bigint AS rooms_count
    FROM tickets t
  ),
  purchase_tx AS (
    SELECT
      COALESCE(SUM(tr.amount), 0) AS total_amount
    FROM public.transactions tr
    WHERE tr.user_id = v_user
      AND tr.type IN ('join', 'bet')
      AND tr.created_at >= p_from
      AND tr.created_at <= p_to
      AND tr.room_id IN (SELECT id FROM normal_rooms)
  ),
  results AS (
    SELECT
      COALESCE(SUM(CASE WHEN r.win_type = 'line' THEN 1 ELSE 0 END), 0)::bigint AS line_wins,
      COALESCE(SUM(CASE WHEN r.win_type = 'full' THEN 1 ELSE 0 END), 0)::bigint AS full_wins
    FROM public.results r
    WHERE r.user_id = v_user
      AND r.created_at >= p_from
      AND r.created_at <= p_to
      AND r.room_id IN (SELECT id FROM normal_rooms)
  )
  SELECT
    ts.total_cards AS total_cards_purchased,
    CASE
      WHEN ts.total_price > 0 THEN ts.total_price
      ELSE pt.total_amount
    END AS total_purchase_amount,
    rs.line_wins AS line_wins_count,
    rs.full_wins AS full_wins_count,
    CASE
      WHEN ts.total_cards > 0
        THEN ((rs.line_wins + rs.full_wins)::numeric / ts.total_cards) * 100
      ELSE 0
    END AS win_rate,
    CASE
      WHEN ts.rooms_count > 0
        THEN (ts.total_cards::numeric / ts.rooms_count)
      ELSE 0
    END AS average_cards_per_game
  FROM ticket_stats ts
  CROSS JOIN purchase_tx pt
  CROSS JOIN results rs;
END;
$$;


--
-- Name: fn_player_purchase_history("uuid", timestamp with time zone, timestamp with time zone); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."fn_player_purchase_history"("p_user_id" "uuid", "p_from" timestamp with time zone, "p_to" timestamp with time zone) RETURNS TABLE("room_id" "uuid", "room_code" "text", "room_title" "text", "purchase_amount" numeric, "card_count" integer, "last_created_at" timestamp with time zone, "transaction_id" "uuid")
    LANGUAGE "sql" STABLE
    AS $$
  select
    t.room_id,
    r.room_code,
    r.title as room_title,
    coalesce(tx.amount, r.card_price, r.price, 0) as purchase_amount,
    count(*)::int as card_count,
    max(t.created_at) as last_created_at,
    t.transaction_id
  from public.tickets t
  join public.rooms r on r.id = t.room_id
  join public.room_templates rt on rt.id = r.room_template_id
  left join public.transactions tx
    on tx.id = t.transaction_id
   and tx.type = 'bet'
   and tx.user_id = p_user_id
  where t.player_user_id = p_user_id
    and t.reservation_status in ('confirmed','consumed')
    and t.created_at >= p_from
    and t.created_at <= p_to
    and rt.room_type = 'normal'
  group by t.room_id, r.room_code, r.title, tx.amount, t.transaction_id, r.card_price, r.price;
$$;


--
-- Name: fn_player_stats("uuid", timestamp with time zone); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."fn_player_stats"("p_user_id" "uuid", "p_date" timestamp with time zone DEFAULT "now"()) RETURNS TABLE("period_type" "text", "total_winnings" numeric, "total_purchases" numeric, "card_count" bigint, "win_count" bigint, "purchase_count" bigint, "tournament_winnings" numeric, "line_wins_count" bigint, "full_wins_count" bigint)
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  WITH normal_rooms AS (
    SELECT r.id
    FROM public.rooms r
    JOIN public.room_templates rt ON rt.id = r.room_template_id
    WHERE rt.room_type = 'normal'
  ),
  tournament_rooms AS (
    SELECT r.id
    FROM public.rooms r
    JOIN public.room_templates rt ON rt.id = r.room_template_id
    WHERE rt.room_type = 'tournament'
  ),
  daily_wins AS (
    SELECT 
      COALESCE(SUM(r.reward_amount), 0) AS total_winnings,
      COUNT(*)::bigint AS win_count,
      COALESCE(SUM(CASE WHEN r.win_type = 'line' THEN 1 ELSE 0 END), 0)::bigint AS line_wins_count,
      COALESCE(SUM(CASE WHEN r.win_type = 'full' THEN 1 ELSE 0 END), 0)::bigint AS full_wins_count
    FROM public.results r
    WHERE r.user_id = p_user_id
      AND r.paid_at IS NOT NULL
      AND r.created_at >= DATE_TRUNC('day', p_date AT TIME ZONE 'UTC') AT TIME ZONE 'UTC'
      AND r.created_at < (DATE_TRUNC('day', p_date AT TIME ZONE 'UTC') + INTERVAL '1 day') AT TIME ZONE 'UTC'
      AND r.room_id IN (SELECT id FROM normal_rooms)
  ),
  daily_tournament_wins AS (
    SELECT COALESCE(SUM(r.reward_amount), 0) AS tournament_winnings
    FROM public.results r
    WHERE r.user_id = p_user_id
      AND r.paid_at IS NOT NULL
      AND r.created_at >= DATE_TRUNC('day', p_date AT TIME ZONE 'UTC') AT TIME ZONE 'UTC'
      AND r.created_at < (DATE_TRUNC('day', p_date AT TIME ZONE 'UTC') + INTERVAL '1 day') AT TIME ZONE 'UTC'
      AND r.room_id IN (SELECT id FROM tournament_rooms)
  ),
  daily_purchases AS (
    SELECT 
      COALESCE(SUM(r.card_price), 0) AS total_purchases,
      COUNT(DISTINCT t.transaction_id)::bigint AS purchase_count,
      COUNT(*)::bigint AS card_count
    FROM public.tickets t
    JOIN public.rooms r ON r.id = t.room_id
    WHERE t.player_user_id = p_user_id
      AND t.created_at >= DATE_TRUNC('day', p_date AT TIME ZONE 'UTC') AT TIME ZONE 'UTC'
      AND t.created_at < (DATE_TRUNC('day', p_date AT TIME ZONE 'UTC') + INTERVAL '1 day') AT TIME ZONE 'UTC'
      AND t.reservation_status IN ('confirmed', 'consumed')
      AND t.room_id IN (SELECT id FROM normal_rooms)
  ),
  weekly_wins AS (
    SELECT 
      COALESCE(SUM(r.reward_amount), 0) AS total_winnings,
      COUNT(*)::bigint AS win_count,
      COALESCE(SUM(CASE WHEN r.win_type = 'line' THEN 1 ELSE 0 END), 0)::bigint AS line_wins_count,
      COALESCE(SUM(CASE WHEN r.win_type = 'full' THEN 1 ELSE 0 END), 0)::bigint AS full_wins_count
    FROM public.results r
    WHERE r.user_id = p_user_id
      AND r.paid_at IS NOT NULL
      AND r.created_at >= (DATE_TRUNC('day', p_date AT TIME ZONE 'UTC') - INTERVAL '6 days') AT TIME ZONE 'UTC'
      AND r.created_at < (DATE_TRUNC('day', p_date AT TIME ZONE 'UTC') + INTERVAL '1 day') AT TIME ZONE 'UTC'
      AND r.room_id IN (SELECT id FROM normal_rooms)
  ),
  weekly_tournament_wins AS (
    SELECT COALESCE(SUM(r.reward_amount), 0) AS tournament_winnings
    FROM public.results r
    WHERE r.user_id = p_user_id
      AND r.paid_at IS NOT NULL
      AND r.created_at >= (DATE_TRUNC('day', p_date AT TIME ZONE 'UTC') - INTERVAL '6 days') AT TIME ZONE 'UTC'
      AND r.created_at < (DATE_TRUNC('day', p_date AT TIME ZONE 'UTC') + INTERVAL '1 day') AT TIME ZONE 'UTC'
      AND r.room_id IN (SELECT id FROM tournament_rooms)
  ),
  weekly_purchases AS (
    SELECT 
      COALESCE(SUM(r.card_price), 0) AS total_purchases,
      COUNT(DISTINCT t.transaction_id)::bigint AS purchase_count,
      COUNT(*)::bigint AS card_count
    FROM public.tickets t
    JOIN public.rooms r ON r.id = t.room_id
    WHERE t.player_user_id = p_user_id
      AND t.created_at >= (DATE_TRUNC('day', p_date AT TIME ZONE 'UTC') - INTERVAL '6 days') AT TIME ZONE 'UTC'
      AND t.created_at < (DATE_TRUNC('day', p_date AT TIME ZONE 'UTC') + INTERVAL '1 day') AT TIME ZONE 'UTC'
      AND t.reservation_status IN ('confirmed', 'consumed')
      AND t.room_id IN (SELECT id FROM normal_rooms)
  ),
  monthly_wins AS (
    SELECT 
      COALESCE(SUM(r.reward_amount), 0) AS total_winnings,
      COUNT(*)::bigint AS win_count,
      COALESCE(SUM(CASE WHEN r.win_type = 'line' THEN 1 ELSE 0 END), 0)::bigint AS line_wins_count,
      COALESCE(SUM(CASE WHEN r.win_type = 'full' THEN 1 ELSE 0 END), 0)::bigint AS full_wins_count
    FROM public.results r
    WHERE r.user_id = p_user_id
      AND r.paid_at IS NOT NULL
      AND r.created_at >= DATE_TRUNC('month', p_date AT TIME ZONE 'UTC') AT TIME ZONE 'UTC'
      AND r.created_at < (DATE_TRUNC('month', p_date AT TIME ZONE 'UTC') + INTERVAL '1 month') AT TIME ZONE 'UTC'
      AND r.room_id IN (SELECT id FROM normal_rooms)
  ),
  monthly_tournament_wins AS (
    SELECT COALESCE(SUM(r.reward_amount), 0) AS tournament_winnings
    FROM public.results r
    WHERE r.user_id = p_user_id
      AND r.paid_at IS NOT NULL
      AND r.created_at >= DATE_TRUNC('month', p_date AT TIME ZONE 'UTC') AT TIME ZONE 'UTC'
      AND r.created_at < (DATE_TRUNC('month', p_date AT TIME ZONE 'UTC') + INTERVAL '1 month') AT TIME ZONE 'UTC'
      AND r.room_id IN (SELECT id FROM tournament_rooms)
  ),
  monthly_purchases AS (
    SELECT 
      COALESCE(SUM(r.card_price), 0) AS total_purchases,
      COUNT(DISTINCT t.transaction_id)::bigint AS purchase_count,
      COUNT(*)::bigint AS card_count
    FROM public.tickets t
    JOIN public.rooms r ON r.id = t.room_id
    WHERE t.player_user_id = p_user_id
      AND t.created_at >= DATE_TRUNC('month', p_date AT TIME ZONE 'UTC') AT TIME ZONE 'UTC'
      AND t.created_at < (DATE_TRUNC('month', p_date AT TIME ZONE 'UTC') + INTERVAL '1 month') AT TIME ZONE 'UTC'
      AND t.reservation_status IN ('confirmed', 'consumed')
      AND t.room_id IN (SELECT id FROM normal_rooms)
  )
  SELECT 
    'daily'::text AS period_type,
    dw.total_winnings,
    dp.total_purchases,
    dp.card_count,
    dw.win_count,
    dp.purchase_count,
    dwt.tournament_winnings,
    dw.line_wins_count,
    dw.full_wins_count
  FROM daily_wins dw
  CROSS JOIN daily_purchases dp
  CROSS JOIN daily_tournament_wins dwt
  UNION ALL
  SELECT 
    'weekly'::text AS period_type,
    ww.total_winnings,
    wp.total_purchases,
    wp.card_count,
    ww.win_count,
    wp.purchase_count,
    wwt.tournament_winnings,
    ww.line_wins_count,
    ww.full_wins_count
  FROM weekly_wins ww
  CROSS JOIN weekly_purchases wp
  CROSS JOIN weekly_tournament_wins wwt
  UNION ALL
  SELECT 
    'monthly'::text AS period_type,
    mw.total_winnings,
    mp.total_purchases,
    mp.card_count,
    mw.win_count,
    mp.purchase_count,
    mwt.tournament_winnings,
    mw.line_wins_count,
    mw.full_wins_count
  FROM monthly_wins mw
  CROSS JOIN monthly_purchases mp
  CROSS JOIN monthly_tournament_wins mwt;
$$;


--
-- Name: fn_process_draw_jobs_batch(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."fn_process_draw_jobs_batch"() RETURNS "void"
    LANGUAGE "plpgsql"
    AS $$
declare
  job record;
begin
  -- 1) گرفتن batch از jobها
  for job in
    select *
    from game_core.rpc_pick_draw_jobs()
  loop
    begin
      -- 2) اعمال مارک‌ها
      perform public.rpc_apply_marks_for_draw(
        job.room_id,
        job.draw_number
      );

      -- 3) ارزیابی پس از قرعه
      perform public.fn_evaluate_room_after_draw(
        job.room_id,
        job.draw_number
      );

      -- 4) بستن job در صورت موفقیت
      update public.draw_jobs
      set status = 'done',
          updated_at = now()
      where id = job.id;
    exception
      when others then
        -- در صورت خطا: برگرداندن به صف با attempts + 1
        update public.draw_jobs
        set status   = 'queued',
            attempts = coalesce(job.attempts, 0) + 1,
            updated_at = now()
        where id = job.id;
    end;
  end loop;
end;
$$;


--
-- Name: fn_process_draw_jobs_batch_worker(integer, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."fn_process_draw_jobs_batch_worker"("p_worker_id" integer, "p_total_workers" integer) RETURNS "void"
    LANGUAGE "plpgsql"
    AS $$
DECLARE
  job record;
BEGIN
  FOR job IN
    SELECT *
    FROM game_core.rpc_pick_draw_jobs(
      p_limit => 100,
      p_worker_id => p_worker_id,
      p_total_workers => p_total_workers
    )
  LOOP
    BEGIN
      PERFORM public.rpc_apply_marks_for_draw(
        job.room_id,
        job.draw_number
      );

      PERFORM public.fn_evaluate_room_after_draw(
        job.room_id,
        job.draw_number
      );

      UPDATE public.draw_jobs
      SET status = 'done',
          updated_at = now()
      WHERE id = job.id;

      -- پس از اینکه این job با موفقیت done شد، بررسی می‌کنیم
      -- آیا این آخرین job مربوط به این draw است یا نه.
      PERFORM 1
      FROM public.draw_jobs
      WHERE room_id = job.room_id
        AND draw_number = job.draw_number
        AND status <> 'done'
      LIMIT 1;

      IF NOT FOUND THEN
        -- یعنی دیگر هیچ job فعالی مربوط به این draw باقی نمانده
        -- بنابراین draw کاملاً پردازش شده و می‌توانیم processed_at را ست کنیم
        UPDATE public.draws
        SET processed_at = now()
        WHERE room_id = job.room_id
          AND number   = job.draw_number
          AND processed_at IS NULL;
      END IF;
    EXCEPTION
      WHEN OTHERS THEN
        UPDATE public.draw_jobs
        SET status   = 'queued',
            attempts = COALESCE(job.attempts, 0) + 1,
            updated_at = now()
        WHERE id = job.id;
        
        RAISE WARNING 'Error processing job %: %', job.id, SQLERRM;
    END;
  END LOOP;
END;
$$;


--
-- Name: fn_recon_money_conservation(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."fn_recon_money_conservation"() RETURNS "jsonb"
    LANGUAGE "sql" SECURITY DEFINER
    SET "search_path" TO 'public', 'game_finance'
    AS $$
  SELECT game_finance.fn_recon_money_conservation();
$$;


--
-- Name: fn_recon_run_and_store(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."fn_recon_run_and_store"() RETURNS "jsonb"
    LANGUAGE "sql" SECURITY DEFINER
    SET "search_path" TO 'public', 'game_finance'
    AS $$
  SELECT game_finance.fn_recon_run_and_store();
$$;


--
-- Name: fn_recon_wallet_ledger(integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."fn_recon_wallet_ledger"("p_limit" integer DEFAULT 500) RETURNS "jsonb"
    LANGUAGE "sql" SECURITY DEFINER
    SET "search_path" TO 'public', 'game_finance'
    AS $$
  SELECT game_finance.fn_recon_wallet_ledger(p_limit);
$$;


--
-- Name: fn_resolve_player_agent_id("uuid"); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."fn_resolve_player_agent_id"("p_player_id" "uuid") RETURNS "uuid"
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_agent_id uuid;
begin
  select pa.agent_id
    into v_agent_id
  from public.player_affiliation pa
  where pa.user_id = p_player_id
  limit 1;

  if v_agent_id is not null then
    return v_agent_id;
  end if;

  select u.parent_id
    into v_agent_id
  from public.users u
  where u.id = p_player_id
    and u.role = 'player'
  limit 1;

  return v_agent_id;
end;
$$;


--
-- Name: fn_rooms_by_ids("uuid"[], "uuid"[]); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."fn_rooms_by_ids"("p_room_ids" "uuid"[], "p_template_ids" "uuid"[]) RETURNS TABLE("id" "uuid", "title" "text", "room_code" "text", "price" numeric, "card_price" numeric, "room_template_id" "uuid")
    LANGUAGE "sql" STABLE
    AS $$
  select r.id, r.title, r.room_code, r.price, r.card_price, r.room_template_id
  from public.rooms r
  where r.id = any(p_room_ids)
    and r.room_template_id = any(p_template_ids);
$$;


--
-- Name: fn_system_join_or_create_room("uuid", "uuid", integer, "text"); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."fn_system_join_or_create_room"("p_user_id" "uuid", "p_template_id" "uuid", "p_card_count" integer, "p_password" "text" DEFAULT NULL::"text") RETURNS TABLE("room_id" "uuid", "starts_at" timestamp with time zone, "ticket_ids" "uuid"[])
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'game_core', 'pg_temp'
    AS $$
BEGIN
  RETURN QUERY
  SELECT *
  FROM game_core.fn_system_join_or_create_room(
    p_user_id,
    p_template_id,
    p_card_count,
    p_password
  );
END;
$$;


--
-- Name: fn_tick_due_tournaments(integer, bigint, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."fn_tick_due_tournaments"("p_limit" integer DEFAULT 50, "p_seed" bigint DEFAULT NULL::bigint, "p_batch_tables" integer DEFAULT NULL::integer) RETURNS integer
    LANGUAGE "sql" SECURITY DEFINER
    SET "search_path" TO 'public', 'tournament'
    AS $$
  SELECT tournament.fn_tick_due_tournaments(p_limit, p_seed, p_batch_tables);
$$;


--
-- Name: fn_tick_tournament("uuid", bigint, integer[]); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."fn_tick_tournament"("p_tournament_id" "uuid", "p_seed" bigint DEFAULT NULL::bigint, "p_batch_tables" integer[] DEFAULT NULL::integer[]) RETURNS "void"
    LANGUAGE "sql" SECURITY DEFINER
    SET "search_path" TO 'public', 'tournament'
    AS $$
  SELECT tournament.fn_tick_tournament(p_tournament_id, p_seed, p_batch_tables);
$$;


--
-- Name: fn_tournament_entry_upsert("uuid", "uuid", integer, numeric, "public"."tournament_entry_status"); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."fn_tournament_entry_upsert"("p_tournament_id" "uuid", "p_user_id" "uuid", "p_qty" integer, "p_amount" numeric, "p_status" "public"."tournament_entry_status" DEFAULT 'created'::"public"."tournament_entry_status") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'game_finance'
    AS $$
DECLARE
  v_entry_id uuid;
  v_existing_status tournament_entry_status;
  v_now timestamptz := now();
BEGIN
  -- Try to get existing entry
  SELECT id, status
    INTO v_entry_id, v_existing_status
  FROM public.tournament_entries
  WHERE tournament_id = p_tournament_id
    AND user_id = p_user_id
  FOR UPDATE;
  
  IF v_entry_id IS NOT NULL THEN
    -- Update existing entry
    UPDATE public.tournament_entries
    SET status = p_status,
        tickets_count =
          CASE
            WHEN v_existing_status = 'cancelled'::tournament_entry_status
              THEN p_qty
            ELSE tickets_count + p_qty
          END,
        amount =
          CASE
            WHEN v_existing_status = 'cancelled'::tournament_entry_status
              THEN p_amount
            ELSE amount + p_amount
          END
    WHERE id = v_entry_id;
  ELSE
    -- Insert new entry
    INSERT INTO public.tournament_entries (
      id,
      tournament_id,
      user_id,
      status,
      tickets_count,
      amount,
      created_at
    )
    VALUES (
      gen_random_uuid(),
      p_tournament_id,
      p_user_id,
      p_status,
      p_qty,
      p_amount,
      v_now
    )
    RETURNING id INTO v_entry_id;
  END IF;
  
  RETURN v_entry_id;
END;
$$;


--
-- Name: fn_tournament_wallet_capture("uuid", "uuid", numeric, "text"); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."fn_tournament_wallet_capture"("p_tournament_id" "uuid", "p_entry_id" "uuid", "p_amount" numeric, "p_currency" "text") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
BEGIN
  RETURN tournament.fn_wallet_capture_join(p_tournament_id, p_entry_id, p_amount, p_currency);
END;
$$;


--
-- Name: fn_tournament_wallet_hold("uuid", integer, "text", "uuid"); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."fn_tournament_wallet_hold"("p_tournament_id" "uuid", "p_qty" integer, "p_currency" "text", "p_entry_id" "uuid" DEFAULT NULL::"uuid") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'game_finance'
    AS $$
DECLARE
  v_user        uuid := auth.uid();

  v_status      public.tournament_status;
  v_price       numeric;
  v_amount      numeric;
  v_amount_int  bigint;
  v_t_currency  text;
  v_entry_currency text;
  v_is_ding     boolean := false;

  v_wallet      uuid;
  v_free        numeric;
  v_locked      numeric;
  v_tx          uuid;

  v_ding_balance bigint;
  v_ding_locked  bigint;

  v_entry_id    uuid;

  v_now         timestamptz := now();
BEGIN
  -- auth
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'unauthenticated';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.app_runtime_flags arf
    WHERE arf.id = true
      AND COALESCE(arf.global_registration_locked, false)
  ) THEN
    RAISE EXCEPTION 'global registration locked';
  END IF;

  -- input
  IF p_qty IS NULL OR p_qty < 1 THEN
    RAISE EXCEPTION 'qty must be >= 1';
  END IF;

  IF p_currency IS NULL OR length(p_currency) = 0 THEN
    RAISE EXCEPTION 'currency is required';
  END IF;

  -- tournament snapshot
  SELECT
    t.status,
    t.ticket_price,
    t.currency,
    upper(coalesce(nullif(t.meta->>'entry_currency',''), t.currency, 'IRR'))
    INTO v_status, v_price, v_t_currency, v_entry_currency
  FROM public.tournaments t
  WHERE t.id = p_tournament_id;

  IF v_status IS NULL THEN
    RAISE EXCEPTION 'tournament not found: %', p_tournament_id;
  END IF;

  IF v_status <> 'registration_open'::public.tournament_status THEN
    RAISE EXCEPTION 'purchase only allowed while registration is open';
  END IF;

  IF v_price IS NOT NULL AND v_price < 0 THEN
    RAISE EXCEPTION 'invalid tournament ticket_price';
  END IF;

  IF v_entry_currency IS NULL THEN
    v_entry_currency := upper(coalesce(v_t_currency, 'IRR'));
  END IF;

  v_is_ding := (v_entry_currency = 'DING');

  -- enforce entry currency
  IF upper(p_currency) <> v_entry_currency THEN
    RAISE EXCEPTION 'currency mismatch: entry=% request=%', v_entry_currency, p_currency;
  END IF;

  IF v_is_ding THEN
    IF (SELECT COALESCE(guaranteed_prize, 0) FROM public.tournaments WHERE id = p_tournament_id) <= 0 THEN
      RAISE EXCEPTION 'ding tournaments require guaranteed_prize';
    END IF;
  END IF;

  v_amount := v_price * p_qty;
  v_amount_int := v_amount::bigint;
  IF v_is_ding AND v_amount_int::numeric <> v_amount THEN
    RAISE EXCEPTION 'ding amount must be integer';
  END IF;

  /* create/update entry */
  IF p_entry_id IS NULL THEN
    -- Use helper function for INSERT
    SELECT public.fn_tournament_entry_upsert(
      p_tournament_id := p_tournament_id,
      p_user_id := v_user,
      p_qty := p_qty,
      p_amount := v_amount,
      p_status := 'created'::public.tournament_entry_status
    ) INTO v_entry_id;
  ELSE
    UPDATE public.tournament_entries e
       SET status = 'created'::public.tournament_entry_status,
           tickets_count =
             CASE
               WHEN e.status = 'cancelled'::public.tournament_entry_status
                 THEN p_qty
               ELSE e.tickets_count + p_qty
             END,
           amount =
             CASE
               WHEN e.status = 'cancelled'::public.tournament_entry_status
                 THEN v_amount
               ELSE e.amount + v_amount
             END
     WHERE e.id = p_entry_id
       AND e.tournament_id = p_tournament_id
       AND e.user_id = v_user
     RETURNING e.id INTO v_entry_id;

    IF v_entry_id IS NULL THEN
      RAISE EXCEPTION 'invalid entry_id for this user/tournament';
    END IF;
  END IF;

  IF v_amount > 0 THEN
  IF v_is_ding THEN
    SELECT balance, locked_amount
      INTO v_ding_balance, v_ding_locked
    FROM public.ding_balances
    WHERE user_id = v_user
    FOR UPDATE;

    IF v_ding_balance IS NULL THEN
      RAISE EXCEPTION 'ding balance not found for user %', v_user;
    END IF;

    IF v_ding_balance < v_amount_int THEN
      RAISE EXCEPTION 'insufficient ding balance';
    END IF;

    UPDATE public.ding_balances
       SET balance = balance - v_amount_int,
           locked_amount = locked_amount + v_amount_int,
           updated_at = v_now
     WHERE user_id = v_user;

    v_tx := NULL;
  ELSE
    -- lock wallet row and get both balance and locked_amount
    SELECT w.id, w.balance, w.locked_amount
      INTO v_wallet, v_free, v_locked
    FROM public.wallets w
    WHERE w.user_id = v_user
      AND w.currency = p_currency
    FOR UPDATE;

    IF v_wallet IS NULL THEN
      RAISE EXCEPTION 'wallet not found for user %', v_user;
    END IF;

    -- Calculate available balance: balance - locked_amount
    v_free := COALESCE(v_free, 0) - COALESCE(v_locked, 0);

    IF v_free < v_amount THEN
      RAISE EXCEPTION 'insufficient balance (have %, need %)', v_free, v_amount;
    END IF;

    SELECT game_finance.fn_wallet_apply_delta(
             p_user_id          := v_user,
             p_currency         := p_currency,
             p_amount_delta     := -v_amount,
             p_transaction_type := 'join_hold',
             p_source_kind      := 'tournament_join',
             p_source_ref       := p_tournament_id::text,
             p_description      := 'hold for tournament join',
             p_meta             := jsonb_build_object(
                                     'tournament_id', p_tournament_id,
                                     'entry_id', v_entry_id,
                                     'qty', p_qty,
                                     'price', v_price
                                   ),
             p_allow_negative   := false
           )
      INTO v_tx;

    UPDATE public.wallets
       SET locked_amount = locked_amount + v_amount,
           updated_at    = v_now
     WHERE id = v_wallet;
  END IF;

  INSERT INTO public.tournament_locks (
    id,
    tournament_id,
    entry_id,
    owner_user_id,
    wallet_id,
    amount,
    lock_kind,
    status,
    idempotency_key,
    meta,
    created_at,
    updated_at
  )
  VALUES (
    gen_random_uuid(),
    p_tournament_id,
    v_entry_id,
    v_user,
    v_wallet,
    v_amount,
    'entry',
    'held',
    'entry_hold:' || v_entry_id::text,
    jsonb_build_object(
      'currency', v_entry_currency,
      'qty', p_qty,
      'price', v_price,
      'tx_id', v_tx
    ),
    v_now,
    v_now
  )
  ON CONFLICT (tournament_id, idempotency_key) WHERE idempotency_key IS NOT NULL DO UPDATE SET status = 'held', amount = CASE WHEN public.tournament_locks.status = 'released' THEN EXCLUDED.amount ELSE public.tournament_locks.amount + EXCLUDED.amount END, wallet_id = COALESCE(EXCLUDED.wallet_id, public.tournament_locks.wallet_id), entry_id = COALESCE(EXCLUDED.entry_id, public.tournament_locks.entry_id), updated_at = EXCLUDED.updated_at, meta = COALESCE(public.tournament_locks.meta, '{}'::jsonb) || COALESCE(EXCLUDED.meta, '{}'::jsonb);

  END IF;
  RETURN v_entry_id;
END;
$$;


--
-- Name: fn_tournament_wallet_release("uuid", "text", "uuid"); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."fn_tournament_wallet_release"("p_tournament_id" "uuid", "p_currency" "text", "p_entry_id" "uuid" DEFAULT NULL::"uuid") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'game_finance'
    AS $$
DECLARE
  v_user        uuid := auth.uid();
  v_status      public.tournament_status;
  v_price       numeric;
  v_entry_currency text;
  v_is_ding     boolean := false;

  v_wallet      uuid;
  v_locked      numeric;

  v_lock_id     uuid;
  v_lock_amount numeric;
  v_lock_wallet uuid;
  v_lock_entry  uuid;
  v_lock_key    text;

  v_ding_balance bigint;
  v_ding_locked bigint;

  v_tx          uuid;
  v_now         timestamptz := now();
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'unauthenticated';
  END IF;

  IF p_currency IS NULL OR length(p_currency) = 0 THEN
    RAISE EXCEPTION 'currency is required';
  END IF;

  SELECT t.status, t.ticket_price
    INTO v_status, v_price
  FROM public.tournaments t
  WHERE t.id = p_tournament_id;

  IF v_status IS NULL THEN
    RAISE EXCEPTION 'tournament not found: %', p_tournament_id;
  END IF;

  IF v_status <> 'registration_open'::public.tournament_status THEN
    RAISE EXCEPTION 'cancellation only allowed while registration is open';
  END IF;

  IF v_price IS NULL OR v_price < 0 THEN
    RAISE EXCEPTION 'invalid tournament ticket_price';
  END IF;

  SELECT upper(coalesce(nullif(t.meta->>'entry_currency',''), t.currency, 'IRR'))
    INTO v_entry_currency
  FROM public.tournaments t
  WHERE t.id = p_tournament_id;

  IF v_entry_currency IS NULL THEN
    v_entry_currency := 'IRR';
  END IF;

  v_is_ding := (v_entry_currency = 'DING');

  IF upper(p_currency) <> v_entry_currency THEN
    RAISE EXCEPTION 'currency mismatch: entry=% request=%', v_entry_currency, p_currency;
  END IF;

  -- Free tournament: only cancel entry, no lock release.
  IF v_price = 0 THEN
    IF p_entry_id IS NOT NULL THEN
      SELECT e.id
        INTO v_lock_entry
      FROM public.tournament_entries e
      WHERE e.id = p_entry_id
        AND e.tournament_id = p_tournament_id
        AND e.user_id = v_user;
    ELSE
      SELECT e.id
        INTO v_lock_entry
      FROM public.tournament_entries e
      WHERE e.tournament_id = p_tournament_id
        AND e.user_id = v_user
      ORDER BY e.created_at DESC
      LIMIT 1;
    END IF;

    IF v_lock_entry IS NULL THEN
      RAISE EXCEPTION
        'tournament entry not found for user %, tournament %',
        v_user, p_tournament_id;
    END IF;

    UPDATE public.tournament_entries e
       SET status = 'cancelled'::public.tournament_entry_status
     WHERE e.id = v_lock_entry
       AND e.tournament_id = p_tournament_id
       AND e.user_id = v_user;

    RETURN NULL;
  END IF;

  -- find lock
  IF p_entry_id IS NOT NULL THEN
    v_lock_key := 'entry_hold:' || p_entry_id::text;

    SELECT l.id, l.amount, l.wallet_id, l.entry_id, l.idempotency_key
      INTO v_lock_id, v_lock_amount, v_lock_wallet, v_lock_entry, v_lock_key
    FROM public.tournament_locks l
    WHERE l.tournament_id   = p_tournament_id
      AND l.lock_kind       = 'entry'
      AND l.status          = 'held'
      AND l.owner_user_id   = v_user
      AND l.idempotency_key = v_lock_key
      AND (l.meta->>'currency') = v_entry_currency
    FOR UPDATE;
  ELSE
    WITH c AS (
      SELECT l.*
      FROM public.tournament_locks l
      WHERE l.tournament_id   = p_tournament_id
        AND l.lock_kind       = 'entry'
        AND l.status          = 'held'
        AND l.owner_user_id   = v_user
        AND (l.meta->>'currency') = v_entry_currency
      ORDER BY l.created_at DESC
      LIMIT 2
    )
    SELECT (SELECT id FROM c LIMIT 1),
           (SELECT amount FROM c LIMIT 1),
           (SELECT wallet_id FROM c LIMIT 1),
           (SELECT entry_id FROM c LIMIT 1),
           (SELECT idempotency_key FROM c LIMIT 1)
      INTO v_lock_id, v_lock_amount, v_lock_wallet, v_lock_entry, v_lock_key;

    IF (SELECT count(*) FROM c) = 0 THEN
      RAISE EXCEPTION
        'tournament lock not found (held) for user %, tournament %, entry <NULL>',
        v_user, p_tournament_id;
    ELSIF (SELECT count(*) FROM c) > 1 THEN
      RAISE EXCEPTION
        'ambiguous held locks for user %, tournament %; entry_id required',
        v_user, p_tournament_id;
    END IF;

    IF v_lock_entry IS NULL AND v_lock_key LIKE 'entry_hold:%' THEN
      v_lock_entry := NULLIF(split_part(v_lock_key, ':', 2), '')::uuid;
    END IF;
  END IF;

  IF v_lock_id IS NULL THEN
    RAISE EXCEPTION
      'tournament lock not found (held) for user %, tournament %, entry %',
      v_user, p_tournament_id, p_entry_id;
  END IF;

  IF v_lock_amount IS NULL OR v_lock_amount <= 0 THEN
    RAISE EXCEPTION 'lock amount is invalid: %', v_lock_amount;
  END IF;

  IF v_is_ding THEN
    SELECT balance, locked_amount
      INTO v_ding_balance, v_ding_locked
    FROM public.ding_balances
    WHERE user_id = v_user
    FOR UPDATE;

    IF v_ding_balance IS NULL THEN
      RAISE EXCEPTION 'ding balance not found for user %', v_user;
    END IF;

    IF v_ding_locked < v_lock_amount THEN
      RAISE EXCEPTION 'insufficient locked ding balance';
    END IF;

    UPDATE public.ding_balances
       SET balance = balance + v_lock_amount::bigint,
           locked_amount = locked_amount - v_lock_amount::bigint,
           updated_at = v_now
     WHERE user_id = v_user;

    v_tx := v_lock_id;
  ELSE
    SELECT w.id, w.locked_amount
      INTO v_wallet, v_locked
    FROM public.wallets w
    WHERE w.user_id = v_user
      AND w.currency = p_currency
    FOR UPDATE;

    IF v_wallet IS NULL THEN
      RAISE EXCEPTION 'wallet not found for user %', v_user;
    END IF;

    IF v_locked < v_lock_amount THEN
      RAISE EXCEPTION 'insufficient locked balance (have %, need %)', v_locked, v_lock_amount;
    END IF;

    SELECT game_finance.fn_wallet_apply_delta(
             p_user_id          := v_user,
             p_currency         := p_currency,
             p_amount_delta     := v_lock_amount,
             p_transaction_type := 'join_refund',
             p_source_kind      := 'tournament_join',
             p_source_ref       := p_tournament_id::text,
             p_description      := 'release tournament join hold',
             p_meta             := jsonb_build_object(
                                     'tournament_id', p_tournament_id,
                                     'entry_id', v_lock_entry,
                                     'lock_id', v_lock_id,
                                     'idempotency_key', v_lock_key
                                   ),
             p_allow_negative   := false
           )
      INTO v_tx;

    UPDATE public.wallets
       SET locked_amount = locked_amount - v_lock_amount,
           updated_at    = v_now
     WHERE id = v_wallet;
  END IF;

  UPDATE public.tournament_locks
     SET status     = 'released',
         amount     = 0,
         entry_id   = COALESCE(entry_id, v_lock_entry),
         wallet_id  = COALESCE(wallet_id, v_wallet),
         updated_at = v_now,
         meta       = COALESCE(meta,'{}'::jsonb) || jsonb_build_object('release_tx_id', v_tx)
   WHERE id = v_lock_id;

  IF v_lock_entry IS NOT NULL THEN
    UPDATE public.tournament_entries e
       SET status = 'cancelled'::public.tournament_entry_status
     WHERE e.id = v_lock_entry
       AND e.tournament_id = p_tournament_id
       AND e.user_id = v_user;
  END IF;

  RETURN v_tx;
END;
$$;


--
-- Name: fn_try_mark_template_inactive_if_drained("uuid"); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."fn_try_mark_template_inactive_if_drained"("p_template_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
  v_status public.room_template_status;
  v_active_rooms_count integer;
BEGIN
  IF p_template_id IS NULL THEN
    RETURN;
  END IF;

  SELECT status
  INTO v_status
  FROM public.room_templates
  WHERE id = p_template_id;

  -- اگر تمپلیت پیدا نشد یا در حالت draining نیست، کاری نکن
  IF NOT FOUND OR v_status IS DISTINCT FROM 'draining' THEN
    RETURN;
  END IF;

  -- شمارش روم‌های منتظر/در حال بازی برای این تمپلیت
  SELECT COUNT(*)
  INTO v_active_rooms_count
  FROM public.rooms
  WHERE room_template_id = p_template_id
    AND status IN ('waiting', 'playing');

  -- اگر هیچ رومی در حال استفاده نبود، تمپلیت را inactive کن
  IF v_active_rooms_count = 0 THEN
    UPDATE public.room_templates
    SET status = 'inactive'
    WHERE id = p_template_id
      AND status = 'draining';
  END IF;
END;
$$;


--
-- Name: fn_wallet_apply_delta("uuid", "text", numeric, "public"."transaction_type", "text", "text", "text", "jsonb", boolean, "text"); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."fn_wallet_apply_delta"("p_user_id" "uuid", "p_currency" "text", "p_amount_delta" numeric, "p_transaction_type" "public"."transaction_type", "p_source_kind" "text", "p_source_ref" "text" DEFAULT NULL::"text", "p_description" "text" DEFAULT NULL::"text", "p_meta" "jsonb" DEFAULT '{}'::"jsonb", "p_allow_negative" boolean DEFAULT false, "p_idempotency_key" "text" DEFAULT NULL::"text") RETURNS "uuid"
    LANGUAGE "sql" SECURITY DEFINER
    SET "search_path" TO 'public', 'game_finance'
    AS $$
  SELECT game_finance.fn_wallet_apply_delta(
    p_user_id, p_currency, p_amount_delta, p_transaction_type, p_source_kind,
    p_source_ref, p_description, p_meta, p_allow_negative, p_idempotency_key
  );
$$;


--
-- Name: fn_wallet_transfer_panel("uuid", "text", bigint, "text", "text"); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."fn_wallet_transfer_panel"("p_target_id" "uuid", "p_currency" "text", "p_amount" bigint, "p_direction" "text", "p_description" "text" DEFAULT NULL::"text") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
begin
  return public.fn_wallet_transfer_panel_bulk(array[p_target_id], p_currency, p_amount, p_direction, p_description);
end;
$$;


--
-- Name: fn_wallet_transfer_panel("uuid", bigint, "text", "text", "text", "jsonb"); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."fn_wallet_transfer_panel"("p_target_id" "uuid", "p_amount" bigint, "p_action" "text", "p_client_request_id" "text", "p_description" "text" DEFAULT NULL::"text", "p_meta" "jsonb" DEFAULT '{}'::"jsonb") RETURNS TABLE("transfer_id" "uuid", "actor_id" "uuid", "from_user_id" "uuid", "to_user_id" "uuid", "replayed" boolean)
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_actor        uuid := auth.uid();
  v_actor_role   public.users.role%type;
  v_target_role  public.users.role%type;
  v_from_user_id uuid;
  v_to_user_id   uuid;
  v_transfer_id  uuid := gen_random_uuid();
  rec record;
  v_from_wallet_id uuid;
  v_to_wallet_id   uuid;
  v_from_before bigint;
  v_to_before   bigint;
  v_from_after  bigint;
  v_to_after    bigint;
  v_desc_out text;
  v_desc_in  text;
  v_req text;
  v_payload_hash text;
  v_existing public.wallet_transfer_idempotency%ROWTYPE;
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'UNAUTHORIZED';
  END IF;

  v_req := NULLIF(btrim(COALESCE(p_client_request_id, '')), '');
  IF v_req IS NULL THEN
    RAISE EXCEPTION 'client_request_id_required';
  END IF;

  IF p_amount IS NULL OR p_amount <= 0 THEN
    RAISE EXCEPTION 'amount must be > 0';
  END IF;

  IF p_target_id IS NULL THEN
    RAISE EXCEPTION 'target_id is required';
  END IF;

  IF v_actor = p_target_id THEN
    RAISE EXCEPTION 'cannot transfer to self';
  END IF;

  v_payload_hash := md5(
    p_target_id::text || '|' || p_amount::text || '|' || lower(p_action)
  );

  PERFORM pg_advisory_xact_lock(
    hashtextextended(v_actor::text || ':' || v_req, 0)
  );

  SELECT i.id, i.actor_id, i.client_request_id, i.payload_hash, i.transfer_id,
         i.target_id, i.amount, i.action, i.from_user_id, i.to_user_id, i.created_at
    INTO v_existing
  FROM public.wallet_transfer_idempotency i
  WHERE i.actor_id = v_actor AND i.client_request_id = v_req;

  IF FOUND THEN
    IF v_existing.payload_hash IS DISTINCT FROM v_payload_hash THEN
      RAISE EXCEPTION 'idempotency_payload_mismatch'
        USING ERRCODE = '22023';
    END IF;
    RETURN QUERY
      SELECT v_existing.transfer_id, v_actor, v_existing.from_user_id,
             v_existing.to_user_id, true;
    RETURN;
  END IF;

  SELECT u.role INTO v_actor_role FROM public.users u WHERE u.id = v_actor;
  IF v_actor_role IS NULL THEN RAISE EXCEPTION 'FORBIDDEN'; END IF;
  IF v_actor_role NOT IN ('admin','super','agent') THEN RAISE EXCEPTION 'FORBIDDEN'; END IF;

  SELECT u.role INTO v_target_role FROM public.users u WHERE u.id = p_target_id;
  IF v_target_role IS NULL THEN RAISE EXCEPTION 'target_not_found'; END IF;

  IF v_actor_role = 'admin' THEN
    NULL;
  ELSIF v_actor_role = 'super' THEN
    IF v_target_role = 'agent' THEN
      IF NOT EXISTS (
        SELECT 1 FROM public.users a
        WHERE a.id = p_target_id AND a.role = 'agent' AND a.parent_id = v_actor
      ) THEN RAISE EXCEPTION 'FORBIDDEN'; END IF;
    ELSIF v_target_role = 'player' THEN
      IF NOT EXISTS (
        SELECT 1 FROM public.player_affiliation pa
        WHERE pa.user_id = p_target_id AND pa.super_id = v_actor
      ) AND NOT EXISTS (
        SELECT 1 FROM public.users p
        WHERE p.id = p_target_id AND p.role = 'player' AND p.parent_id = v_actor
      ) THEN RAISE EXCEPTION 'FORBIDDEN'; END IF;
    ELSE
      RAISE EXCEPTION 'FORBIDDEN';
    END IF;
  ELSIF v_actor_role = 'agent' THEN
    IF v_target_role = 'player' THEN
      IF NOT EXISTS (
        SELECT 1 FROM public.player_affiliation pa
        WHERE pa.user_id = p_target_id AND pa.agent_id = v_actor
      ) AND NOT EXISTS (
        SELECT 1 FROM public.users p
        WHERE p.id = p_target_id AND p.role = 'player' AND p.parent_id = v_actor
      ) THEN RAISE EXCEPTION 'FORBIDDEN'; END IF;
    ELSIF v_target_role = 'agent' THEN
      IF NOT EXISTS (
        SELECT 1 FROM public.users a
        WHERE a.id = p_target_id AND a.role = 'agent' AND a.parent_id = v_actor
      ) THEN RAISE EXCEPTION 'FORBIDDEN'; END IF;
    ELSE
      RAISE EXCEPTION 'FORBIDDEN';
    END IF;
  END IF;

  IF lower(p_action) = 'deposit' THEN
    v_from_user_id := v_actor;
    v_to_user_id := p_target_id;
  ELSIF lower(p_action) = 'withdraw' THEN
    v_from_user_id := p_target_id;
    v_to_user_id := v_actor;
  ELSE
    RAISE EXCEPTION 'invalid_action';
  END IF;

  INSERT INTO public.wallets (user_id, currency, balance, locked_amount, created_at, updated_at)
  VALUES (v_from_user_id, 'IRR', 0, 0, now(), now())
  ON CONFLICT (user_id) DO NOTHING;

  INSERT INTO public.wallets (user_id, currency, balance, locked_amount, created_at, updated_at)
  VALUES (v_to_user_id, 'IRR', 0, 0, now(), now())
  ON CONFLICT (user_id) DO NOTHING;

  FOR rec IN
    SELECT id, user_id, balance, currency
    FROM public.wallets
    WHERE user_id IN (v_from_user_id, v_to_user_id)
    ORDER BY id
    FOR UPDATE
  LOOP
    IF rec.currency <> 'IRR' THEN
      RAISE EXCEPTION 'wallet currency mismatch for user %', rec.user_id;
    END IF;
    IF rec.user_id = v_from_user_id THEN
      v_from_wallet_id := rec.id;
      v_from_before := rec.balance;
    ELSIF rec.user_id = v_to_user_id THEN
      v_to_wallet_id := rec.id;
      v_to_before := rec.balance;
    END IF;
  END LOOP;

  IF v_from_wallet_id IS NULL OR v_to_wallet_id IS NULL THEN
    RAISE EXCEPTION 'wallet_not_found';
  END IF;

  v_from_after := v_from_before - p_amount;
  IF v_from_after < 0 THEN
    RAISE EXCEPTION 'insufficient_funds';
  END IF;
  v_to_after := v_to_before + p_amount;

  UPDATE public.wallets SET balance = v_from_after, updated_at = now()
  WHERE id = v_from_wallet_id;
  UPDATE public.wallets SET balance = v_to_after, updated_at = now()
  WHERE id = v_to_wallet_id;

  v_desc_out := coalesce(p_description, 'panel transfer');
  v_desc_in  := coalesce(p_description, 'panel transfer');

  INSERT INTO public.transactions (
    id, wallet_id, user_id, type, status, amount, currency, description,
    balance_before, balance_after, source_kind, source_ref, meta, created_at
  ) VALUES (
    gen_random_uuid(), v_from_wallet_id, v_from_user_id,
    'transfer_out'::public.transaction_type, 'completed'::public.transaction_status,
    p_amount, 'IRR', v_desc_out, v_from_before, v_from_after,
    'admin_panel_transfer', v_transfer_id::text,
    jsonb_build_object(
      'transfer_id', v_transfer_id, 'actor_id', v_actor,
      'target_id', p_target_id, 'action', lower(p_action),
      'client_request_id', v_req
    ) || coalesce(p_meta, '{}'::jsonb),
    now()
  );

  INSERT INTO public.transactions (
    id, wallet_id, user_id, type, status, amount, currency, description,
    balance_before, balance_after, source_kind, source_ref, meta, created_at
  ) VALUES (
    gen_random_uuid(), v_to_wallet_id, v_to_user_id,
    'transfer_in'::public.transaction_type, 'completed'::public.transaction_status,
    p_amount, 'IRR', v_desc_in, v_to_before, v_to_after,
    'admin_panel_transfer', v_transfer_id::text,
    jsonb_build_object(
      'transfer_id', v_transfer_id, 'actor_id', v_actor,
      'target_id', p_target_id, 'action', lower(p_action),
      'client_request_id', v_req
    ) || coalesce(p_meta, '{}'::jsonb),
    now()
  );

  INSERT INTO public.wallet_transfer_idempotency (
    actor_id, client_request_id, payload_hash, transfer_id, target_id,
    amount, action, from_user_id, to_user_id
  ) VALUES (
    v_actor, v_req, v_payload_hash, v_transfer_id, p_target_id,
    p_amount, lower(p_action), v_from_user_id, v_to_user_id
  );

  RETURN QUERY
    SELECT v_transfer_id, v_actor, v_from_user_id, v_to_user_id, false;
END;
$$;


--
-- Name: fn_wallet_transfer_panel_bulk("uuid"[], "text", bigint, "text", "text"); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."fn_wallet_transfer_panel_bulk"("p_target_ids" "uuid"[], "p_currency" "text", "p_amount" bigint, "p_direction" "text", "p_description" "text" DEFAULT NULL::"text") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
declare
  v_actor uuid := auth.uid();
  v_actor_role text;

  v_unique_targets uuid[];
  v_user_ids uuid[];

  v_wallet record;
  v_wallet_map jsonb := '{}'::jsonb; -- user_id -> { wallet_id, balance, currency }

  v_target_id uuid;
  v_target_role text;

  v_group_id uuid := gen_random_uuid();
  v_transfer_id uuid;

  v_from_user uuid;
  v_to_user uuid;
  v_from_wallet_id uuid;
  v_to_wallet_id uuid;
  v_from_balance bigint;
  v_to_balance bigint;

  v_desc text;
begin
  if v_actor is null then
    raise exception 'UNAUTHORIZED';
  end if;

  if p_currency is null or p_currency <> 'IRR' then
    raise exception 'unsupported_currency';
  end if;

  if p_amount is null or p_amount <= 0 then
    raise exception 'invalid_amount';
  end if;

  if p_target_ids is null or array_length(p_target_ids, 1) is null then
    raise exception 'no_targets';
  end if;

  if p_direction not in ('to_target', 'from_target') then
    raise exception 'invalid_direction';
  end if;

  -- Deduplicate targets; drop NULL and actor
  select array_agg(distinct t)
    into v_unique_targets
  from unnest(p_target_ids) t
  where t is not null and t <> v_actor;

  if v_unique_targets is null or array_length(v_unique_targets, 1) is null then
    raise exception 'no_valid_targets';
  end if;

  select u.role::text into v_actor_role
  from public.users u
  where u.id = v_actor;

  if v_actor_role is null then
    raise exception 'actor_not_found';
  end if;

  if v_actor_role not in ('admin', 'super', 'agent') then
    raise exception 'permission_denied';
  end if;

  v_desc := coalesce(p_description, 'admin panel transfer');

  -- Authorization checks (hierarchy) per target, enforced in DB.
  foreach v_target_id in array v_unique_targets loop
    select u.role::text into v_target_role
    from public.users u
    where u.id = v_target_id;

    if v_target_role is null then
      raise exception 'target_not_found';
    end if;

    if v_target_role not in ('player', 'agent', 'super') then
      raise exception 'invalid_target_role';
    end if;

    if v_actor_role = 'admin' then
      -- admin can transfer with any non-admin user
      null;

    elsif v_actor_role = 'super' then
      if v_target_role = 'agent' then
        if not exists (
          select 1
          from public.users a
          where a.id = v_target_id
            and a.role = 'agent'
            and a.parent_id = v_actor
        ) then
          raise exception 'permission_denied';
        end if;

      elsif v_target_role = 'player' then
        if not (
          -- preferred: player_affiliation
          exists (
            select 1
            from public.player_affiliation pa
            where pa.user_id = v_target_id
              and pa.super_id = v_actor
          )
          -- fallback: direct parent
          or exists (
            select 1
            from public.users p
            where p.id = v_target_id
              and p.role = 'player'
              and p.parent_id = v_actor
          )
          -- fallback: under an agent of this super
          or exists (
            select 1
            from public.users p
            where p.id = v_target_id
              and p.role = 'player'
              and p.parent_id in (
                select a.id
                from public.users a
                where a.role = 'agent'
                  and a.parent_id = v_actor
              )
          )
        ) then
          raise exception 'permission_denied';
        end if;

      else
        -- super cannot transfer with another super
        raise exception 'permission_denied';
      end if;

    elsif v_actor_role = 'agent' then
      if v_target_role <> 'player' then
        raise exception 'permission_denied';
      end if;

      if not (
        exists (
          select 1
          from public.player_affiliation pa
          where pa.user_id = v_target_id
            and pa.agent_id = v_actor
        )
        or exists (
          select 1
          from public.users p
          where p.id = v_target_id
            and p.role = 'player'
            and p.parent_id = v_actor
        )
      ) then
        raise exception 'permission_denied';
      end if;
    end if;
  end loop;

  -- Ensure wallets exist for actor + all targets
  v_user_ids := array_append(v_unique_targets, v_actor);

  insert into public.wallets (user_id, currency, balance, locked_amount, created_at, updated_at)
  select uid, p_currency, 0, 0, now(), now()
  from unnest(v_user_ids) uid
  where not exists (select 1 from public.wallets w where w.user_id = uid)
  on conflict (user_id) do nothing;

  -- Lock all wallets deterministically by wallet_id (id) to prevent deadlocks.
  for v_wallet in
    select id, user_id, balance, currency
    from public.wallets
    where user_id = any(v_user_ids)
    order by id
    for update
  loop
    if v_wallet.currency is distinct from p_currency then
      raise exception 'wallet_currency_mismatch';
    end if;

    v_wallet_map := v_wallet_map || jsonb_build_object(
      v_wallet.user_id::text,
      jsonb_build_object(
        'wallet_id', v_wallet.id::text,
        'balance', v_wallet.balance,
        'currency', v_wallet.currency
      )
    );
  end loop;

  -- Execute transfers, each with its own transfer_id, plus a shared group_id.
  foreach v_target_id in array v_unique_targets loop
    v_transfer_id := gen_random_uuid();

    if p_direction = 'to_target' then
      v_from_user := v_actor;
      v_to_user := v_target_id;
    else
      v_from_user := v_target_id;
      v_to_user := v_actor;
    end if;

    v_from_wallet_id := (v_wallet_map->(v_from_user::text)->>'wallet_id')::uuid;
    v_to_wallet_id := (v_wallet_map->(v_to_user::text)->>'wallet_id')::uuid;

    v_from_balance := coalesce((v_wallet_map->(v_from_user::text)->>'balance')::bigint, 0);
    v_to_balance := coalesce((v_wallet_map->(v_to_user::text)->>'balance')::bigint, 0);

    if v_from_balance < p_amount then
      raise exception 'insufficient_funds';
    end if;

    -- Pairwise wallet updates (always two-sided)
    update public.wallets
      set balance = balance - p_amount,
          updated_at = now()
      where id = v_from_wallet_id;

    update public.wallets
      set balance = balance + p_amount,
          updated_at = now()
      where id = v_to_wallet_id;

    -- Update local balance map for next iterations
    v_wallet_map := jsonb_set(v_wallet_map, array[v_from_user::text, 'balance'], to_jsonb(v_from_balance - p_amount), true);
    v_wallet_map := jsonb_set(v_wallet_map, array[v_to_user::text, 'balance'], to_jsonb(v_to_balance + p_amount), true);

    -- Ledger rows: transfer_out (from) and transfer_in (to), linked by transfer_id
    insert into public.transactions (
      id,
      wallet_id,
      user_id,
      type,
      status,
      amount,
      currency,
      description,
      balance_before,
      balance_after,
      meta,
      created_at,
      source_kind,
      source_ref
    ) values (
      gen_random_uuid(),
      v_from_wallet_id,
      v_from_user,
      'transfer_out'::public.transaction_type,
      'completed'::public.transaction_status,
      p_amount::numeric,
      p_currency,
      v_desc,
      v_from_balance::numeric,
      (v_from_balance - p_amount)::numeric,
      jsonb_build_object(
        'group_id', v_group_id,
        'transfer_id', v_transfer_id,
        'actor_id', v_actor,
        'counterparty_user_id', v_to_user,
        'direction', p_direction
      ),
      now(),
      'admin_panel_transfer',
      v_transfer_id::text
    );

    insert into public.transactions (
      id,
      wallet_id,
      user_id,
      type,
      status,
      amount,
      currency,
      description,
      balance_before,
      balance_after,
      meta,
      created_at,
      source_kind,
      source_ref
    ) values (
      gen_random_uuid(),
      v_to_wallet_id,
      v_to_user,
      'transfer_in'::public.transaction_type,
      'completed'::public.transaction_status,
      p_amount::numeric,
      p_currency,
      v_desc,
      v_to_balance::numeric,
      (v_to_balance + p_amount)::numeric,
      jsonb_build_object(
        'group_id', v_group_id,
        'transfer_id', v_transfer_id,
        'actor_id', v_actor,
        'counterparty_user_id', v_from_user,
        'direction', p_direction
      ),
      now(),
      'admin_panel_transfer',
      v_transfer_id::text
    );
  end loop;

  return v_group_id;
end;
$$;


--
-- Name: fn_withdrawal_actor_can_review("uuid", "uuid"); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."fn_withdrawal_actor_can_review"("p_actor_id" "uuid", "p_player_id" "uuid") RETURNS boolean
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_actor_role public.users.role%type;
  v_player_role public.users.role%type;
begin
  if p_actor_id is null or p_player_id is null then
    return false;
  end if;

  select u.role into v_actor_role from public.users u where u.id = p_actor_id;
  select u.role into v_player_role from public.users u where u.id = p_player_id;

  if v_actor_role is null or v_player_role is null then
    return false;
  end if;

  if v_actor_role = 'admin' then
    return true;
  end if;

  if v_player_role <> 'player' then
    return false;
  end if;

  if v_actor_role = 'super' then
    return exists (
      select 1
      from public.player_affiliation pa
      where pa.user_id = p_player_id
        and pa.super_id = p_actor_id
    )
    or exists (
      select 1
      from public.users p
      where p.id = p_player_id
        and p.role = 'player'
        and p.parent_id = p_actor_id
    )
    or exists (
      select 1
      from public.users p
      join public.users a on a.id = p.parent_id
      where p.id = p_player_id
        and a.parent_id = p_actor_id
        and a.role = 'agent'
    );
  end if;

  if v_actor_role = 'agent' then
    return exists (
      select 1
      from public.player_affiliation pa
      where pa.user_id = p_player_id
        and pa.agent_id = p_actor_id
    )
    or exists (
      select 1
      from public.users p
      where p.id = p_player_id
        and p.role = 'player'
        and p.parent_id = p_actor_id
    );
  end if;

  return false;
end;
$$;


--
-- Name: fn_withdrawal_actor_can_review_crypto("uuid"); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."fn_withdrawal_actor_can_review_crypto"("p_actor_id" "uuid") RETURNS boolean
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_actor_role public.users.role%type;
begin
  if p_actor_id is null then
    return false;
  end if;
  select u.role into v_actor_role from public.users u where u.id = p_actor_id;
  return v_actor_role = 'admin';
end;
$$;


--
-- Name: fn_withdrawal_capture("uuid", bigint, "uuid"); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."fn_withdrawal_capture"("p_user_id" "uuid", "p_amount" bigint, "p_request_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'game_finance'
    AS $$
declare
  v_wallet_id uuid;
  v_locked numeric;
begin
  if p_amount <= 0 then
    raise exception 'amount must be positive';
  end if;

  select id, locked_amount
    into v_wallet_id, v_locked
  from public.wallets
  where user_id = p_user_id
    and currency = 'IRR'
  for update;

  if v_wallet_id is null then
    raise exception 'wallet not found for user %', p_user_id;
  end if;

  if v_locked < p_amount then
    raise exception 'insufficient locked amount for capture';
  end if;

  update public.wallets
     set locked_amount = locked_amount - p_amount,
         updated_at    = now()
   where id = v_wallet_id;
end;
$$;


--
-- Name: fn_withdrawal_hold("uuid", bigint, "uuid"); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."fn_withdrawal_hold"("p_user_id" "uuid", "p_amount" bigint, "p_request_id" "uuid") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'game_finance'
    AS $$
declare
  v_wallet_id uuid;
  v_free numeric;
  v_tx uuid;
begin
  if p_amount <= 0 then
    raise exception 'amount must be positive';
  end if;

  select id, balance
    into v_wallet_id, v_free
  from public.wallets
  where user_id = p_user_id
    and currency = 'IRR'
  for update;

  if v_wallet_id is null then
    raise exception 'wallet not found for user %', p_user_id;
  end if;

  if v_free < p_amount then
    raise exception 'insufficient_funds';
  end if;

  select game_finance.fn_wallet_apply_delta(
           p_user_id         := p_user_id,
           p_currency        := 'IRR',
           p_amount_delta    := -p_amount,
           p_transaction_type:= 'join_hold',
           p_source_kind     := 'withdrawal_request',
           p_source_ref      := p_request_id::text,
           p_description     := 'hold for withdrawal request',
           p_meta            := jsonb_build_object('withdrawal_request_id', p_request_id),
           p_allow_negative  := false,
           p_idempotency_key := 'withdrawal_hold:' || p_request_id::text
         )
    into v_tx;

  update public.wallets
     set locked_amount = locked_amount + p_amount,
         updated_at    = now()
   where id = v_wallet_id;

  return v_tx;
end;
$$;


--
-- Name: fn_withdrawal_release("uuid", bigint, "uuid"); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."fn_withdrawal_release"("p_user_id" "uuid", "p_amount" bigint, "p_request_id" "uuid") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'game_finance'
    AS $$
declare
  v_wallet_id uuid;
  v_locked numeric;
  v_tx uuid;
begin
  if p_amount <= 0 then
    raise exception 'amount must be positive';
  end if;

  select id, locked_amount
    into v_wallet_id, v_locked
  from public.wallets
  where user_id = p_user_id
    and currency = 'IRR'
  for update;

  if v_wallet_id is null then
    raise exception 'wallet not found for user %', p_user_id;
  end if;

  if v_locked < p_amount then
    raise exception 'insufficient locked amount';
  end if;

  select game_finance.fn_wallet_apply_delta(
           p_user_id         := p_user_id,
           p_currency        := 'IRR',
           p_amount_delta    := p_amount,
           p_transaction_type:= 'join_refund',
           p_source_kind     := 'withdrawal_request',
           p_source_ref      := p_request_id::text,
           p_description     := 'release withdrawal hold',
           p_meta            := jsonb_build_object('withdrawal_request_id', p_request_id),
           p_allow_negative  := false,
           p_idempotency_key := 'withdrawal_release:' || p_request_id::text
         )
    into v_tx;

  update public.wallets
     set locked_amount = locked_amount - p_amount,
         updated_at    = now()
   where id = v_wallet_id;

  return v_tx;
end;
$$;


--
-- Name: fn_withdrawal_request_approve("uuid", "uuid"); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."fn_withdrawal_request_approve"("p_request_id" "uuid", "p_actor_id" "uuid") RETURNS TABLE("request_id" "uuid", "status" "public"."withdrawal_request_status", "replayed" boolean)
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'game_finance'
    AS $$
declare v_req public.withdrawal_requests%rowtype;
begin
  if p_request_id is null or p_actor_id is null then raise exception 'request_id and actor_id required'; end if;
  select * into v_req from public.withdrawal_requests wr where wr.id = p_request_id for update;
  if not found then raise exception 'request_not_found'; end if;
  if coalesce(v_req.kind, 'rial') <> 'rial' then raise exception 'invalid_kind'; end if;
  if v_req.status = 'approved' then return query select v_req.id, v_req.status, true; return; end if;
  if v_req.status <> 'pending' then raise exception 'invalid_status'; end if;
  if not public.fn_withdrawal_actor_can_review(p_actor_id, v_req.player_id) then raise exception 'FORBIDDEN'; end if;
  perform public.fn_withdrawal_capture(v_req.player_id, v_req.amount, v_req.id);
  perform game_finance.fn_wallet_apply_delta(p_user_id := v_req.agent_id, p_currency := 'IRR', p_amount_delta := v_req.amount, p_transaction_type:= 'transfer_in', p_source_kind := 'withdrawal_request', p_source_ref := v_req.id::text, p_description := 'withdrawal request approved', p_meta := jsonb_build_object('withdrawal_request_id', v_req.id, 'player_id', v_req.player_id, 'actor_id', p_actor_id), p_allow_negative := false, p_idempotency_key := 'withdrawal_approve_credit:' || v_req.id::text);
  update public.withdrawal_requests set status = 'approved', reviewed_by = p_actor_id, reviewed_at = now(), updated_at = now() where id = v_req.id;
  return query select v_req.id, 'approved'::public.withdrawal_request_status, false;
end; $$;


--
-- Name: fn_withdrawal_request_approve_crypto("uuid", "uuid"); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."fn_withdrawal_request_approve_crypto"("p_request_id" "uuid", "p_actor_id" "uuid") RETURNS TABLE("request_id" "uuid", "status" "public"."withdrawal_request_status", "replayed" boolean)
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'game_finance'
    AS $$
declare
  v_req public.withdrawal_requests%rowtype;
begin
  if p_request_id is null or p_actor_id is null then
    raise exception 'request_id and actor_id required';
  end if;

  select *
    into v_req
  from public.withdrawal_requests wr
  where wr.id = p_request_id
  for update;

  if not found then
    raise exception 'request_not_found';
  end if;

  if v_req.kind <> 'crypto' then
    raise exception 'invalid_kind';
  end if;

  if v_req.status = 'approved' then
    return query select v_req.id, v_req.status, true;
    return;
  end if;

  if v_req.status <> 'pending' then
    raise exception 'invalid_status';
  end if;

  if not public.fn_withdrawal_actor_can_review_crypto(p_actor_id) then
    raise exception 'FORBIDDEN';
  end if;

  perform public.fn_withdrawal_capture(v_req.player_id, v_req.amount, v_req.id);

  perform game_finance.fn_wallet_apply_delta(
    p_user_id         := p_actor_id,
    p_currency        := 'IRR',
    p_amount_delta    := v_req.amount,
    p_transaction_type:= 'transfer_in',
    p_source_kind     := 'withdrawal_request',
    p_source_ref      := v_req.id::text,
    p_description     := 'crypto withdrawal request approved',
    p_meta            := jsonb_build_object(
                          'withdrawal_request_id', v_req.id,
                          'player_id', v_req.player_id,
                          'actor_id', p_actor_id,
                          'kind', 'crypto'
                        ),
    p_allow_negative  := false,
    p_idempotency_key := 'withdrawal_crypto_approve_credit:' || v_req.id::text
  );

  update public.withdrawal_requests
     set status = 'approved',
         reviewed_by = p_actor_id,
         reviewed_at = now(),
         updated_at = now()
   where id = v_req.id;

  return query
    select v_req.id, 'approved'::public.withdrawal_request_status, false;
end;
$$;


--
-- Name: fn_withdrawal_request_create("uuid", bigint, "text", "text", "text"); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."fn_withdrawal_request_create"("p_player_id" "uuid", "p_amount" bigint, "p_card_number" "text", "p_full_name" "text", "p_client_request_id" "text") RETURNS TABLE("request_id" "uuid", "status" "public"."withdrawal_request_status", "replayed" boolean)
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'game_finance'
    AS $$
declare v_agent_id uuid; v_request_id uuid; v_existing public.withdrawal_requests%rowtype; v_card text; v_name text;
begin
  if p_player_id is null then raise exception 'player_id required'; end if;
  if p_amount is null or p_amount <= 0 then raise exception 'amount must be > 0'; end if;
  if nullif(btrim(p_client_request_id), '') is null then raise exception 'client_request_id required'; end if;
  v_card := regexp_replace(coalesce(p_card_number, ''), '\D', '', 'g');
  if length(v_card) < 16 or length(v_card) > 19 then raise exception 'invalid_card_number'; end if;
  v_name := btrim(coalesce(p_full_name, ''));
  if length(v_name) < 3 or length(v_name) > 120 then raise exception 'invalid_full_name'; end if;
  select wr.* into v_existing from public.withdrawal_requests wr where wr.player_id = p_player_id and wr.client_request_id = p_client_request_id limit 1;
  if found then return query select v_existing.id, v_existing.status, true; return; end if;
  v_agent_id := public.fn_resolve_player_agent_id(p_player_id);
  if v_agent_id is null then raise exception 'no_agent_assigned'; end if;
  v_request_id := gen_random_uuid();
  perform public.fn_withdrawal_hold(p_player_id, p_amount, v_request_id);
  insert into public.withdrawal_requests (id, player_id, agent_id, amount, currency, card_number, full_name, status, client_request_id, kind)
  values (v_request_id, p_player_id, v_agent_id, p_amount, 'IRR', v_card, v_name, 'pending', p_client_request_id, 'rial');
  return query select v_request_id, 'pending'::public.withdrawal_request_status, false;
end; $$;


--
-- Name: fn_withdrawal_request_create_crypto("uuid", bigint, bigint, "text", "text", numeric, "text", "text"); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."fn_withdrawal_request_create_crypto"("p_player_id" "uuid", "p_locked_toman" bigint, "p_requested_toman" bigint, "p_network" "text", "p_crypto_symbol" "text", "p_crypto_amount" numeric, "p_wallet_address" "text", "p_client_request_id" "text") RETURNS TABLE("request_id" "uuid", "status" "public"."withdrawal_request_status", "replayed" boolean)
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'game_finance'
    AS $$
declare
  v_request_id uuid;
  v_existing public.withdrawal_requests%rowtype;
  v_address text;
  v_network text;
  v_symbol text;
begin
  if p_player_id is null then raise exception 'player_id required'; end if;
  if p_locked_toman is null or p_locked_toman <= 0 then raise exception 'amount must be > 0'; end if;
  if nullif(btrim(p_client_request_id), '') is null then raise exception 'client_request_id required'; end if;
  v_network := upper(btrim(coalesce(p_network, '')));
  if v_network not in ('BEP20', 'TRC20', 'TRX') then raise exception 'invalid_network'; end if;
  v_symbol := upper(btrim(coalesce(p_crypto_symbol, '')));
  if v_symbol not in ('USDT', 'TRX') then raise exception 'invalid_crypto_symbol'; end if;
  if p_crypto_amount is null or p_crypto_amount <= 0 then raise exception 'invalid_crypto_amount'; end if;
  v_address := btrim(coalesce(p_wallet_address, ''));
  if length(v_address) < 10 then raise exception 'invalid_wallet_address'; end if;
  select wr.* into v_existing from public.withdrawal_requests wr where wr.player_id = p_player_id and wr.client_request_id = p_client_request_id limit 1;
  if found then return query select v_existing.id, v_existing.status, true; return; end if;
  v_request_id := gen_random_uuid();
  perform public.fn_withdrawal_hold(p_player_id, p_locked_toman, v_request_id);
  insert into public.withdrawal_requests (id, player_id, agent_id, amount, currency, card_number, full_name, status, client_request_id, kind, network, crypto_symbol, crypto_amount, wallet_address, requested_toman)
  values (v_request_id, p_player_id, null, p_locked_toman, 'IRR', null, null, 'pending', p_client_request_id, 'crypto', v_network, v_symbol, p_crypto_amount, v_address, p_requested_toman);
  return query select v_request_id, 'pending'::public.withdrawal_request_status, false;
end;
$$;


--
-- Name: fn_withdrawal_request_reject("uuid", "uuid", "text"); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."fn_withdrawal_request_reject"("p_request_id" "uuid", "p_actor_id" "uuid", "p_reason" "text" DEFAULT NULL::"text") RETURNS TABLE("request_id" "uuid", "status" "public"."withdrawal_request_status", "replayed" boolean)
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'game_finance'
    AS $$
declare v_req public.withdrawal_requests%rowtype;
begin
  if p_request_id is null or p_actor_id is null then raise exception 'request_id and actor_id required'; end if;
  select * into v_req from public.withdrawal_requests wr where wr.id = p_request_id for update;
  if not found then raise exception 'request_not_found'; end if;
  if v_req.status = 'rejected' then return query select v_req.id, v_req.status, true; return; end if;
  if v_req.status <> 'pending' then raise exception 'invalid_status'; end if;
  if coalesce(v_req.kind, 'rial') = 'crypto' then
    if not public.fn_withdrawal_actor_can_review_crypto(p_actor_id) then raise exception 'FORBIDDEN'; end if;
  elsif not public.fn_withdrawal_actor_can_review(p_actor_id, v_req.player_id) then raise exception 'FORBIDDEN'; end if;
  perform public.fn_withdrawal_release(v_req.player_id, v_req.amount, v_req.id);
  update public.withdrawal_requests set status = 'rejected', reviewed_by = p_actor_id, reviewed_at = now(), reject_reason = nullif(btrim(coalesce(p_reason, '')), ''), updated_at = now() where id = v_req.id;
  return query select v_req.id, 'rejected'::public.withdrawal_request_status, false;
end; $$;


--
-- Name: get_daily_leaders(integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."get_daily_leaders"("limit_count" integer DEFAULT 5) RETURNS TABLE("user_id" "uuid", "wins" bigint, "total_rewards" numeric, "last_win" timestamp with time zone, "rank_position" bigint)
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
BEGIN
  RETURN QUERY
  WITH daily_wins AS (
    SELECT 
      r.user_id,
      COUNT(*) as wins,
      COALESCE(SUM(r.reward_amount), 0) as total_rewards,
      MAX(r.created_at) as last_win
    FROM results r
    WHERE r.created_at >= NOW() - INTERVAL '24 hours'
    GROUP BY r.user_id
  )
  SELECT 
    dw.user_id,
    dw.wins,
    dw.total_rewards,
    dw.last_win,
    ROW_NUMBER() OVER (ORDER BY dw.wins DESC, dw.total_rewards DESC, dw.last_win DESC) as rank_position
  FROM daily_wins dw
  ORDER BY dw.wins DESC, dw.total_rewards DESC, dw.last_win DESC
  LIMIT limit_count;
END;
$$;


--
-- Name: get_daily_leaders_by_date("date", integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."get_daily_leaders_by_date"("target_date" "date", "limit_count" integer DEFAULT 5) RETURNS TABLE("user_id" "uuid", "wins" bigint, "total_rewards" numeric, "last_win" timestamp with time zone, "rank_position" bigint)
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
BEGIN
  RETURN QUERY
  WITH daily_wins AS (
    SELECT 
      r.user_id,
      COUNT(*) as wins,
      COALESCE(SUM(r.reward_amount), 0) as total_rewards,
      MAX(r.created_at) as last_win
    FROM results r
    WHERE DATE(r.created_at) = target_date
    GROUP BY r.user_id
  )
  SELECT 
    dw.user_id,
    dw.wins,
    dw.total_rewards,
    dw.last_win,
    ROW_NUMBER() OVER (ORDER BY dw.wins DESC, dw.total_rewards DESC, dw.last_win DESC) as rank_position
  FROM daily_wins dw
  ORDER BY dw.wins DESC, dw.total_rewards DESC, dw.last_win DESC
  LIMIT limit_count;
END;
$$;


--
-- Name: get_total_balances_by_role(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."get_total_balances_by_role"() RETURNS TABLE("role" "text", "total_balance" numeric)
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
  v_actor_id uuid;
  v_actor_role text;
  v_target_user_ids uuid[];
  v_player_ids uuid[];
  v_agent_ids uuid[];
BEGIN
  -- گرفتن actor_id از auth
  v_actor_id := auth.uid();
  
  IF v_actor_id IS NULL THEN
    RAISE WARNING 'No authenticated user';
    RETURN;
  END IF;

  -- گرفتن نقش کاربر فعلی
  SELECT u.role INTO v_actor_role
  FROM public.users u
  WHERE u.id = v_actor_id;

  IF v_actor_role IS NULL THEN
    RAISE WARNING 'User role not found for user %', v_actor_id;
    RETURN;
  END IF;

  -- تعیین کاربران زیرمجموعه بر اساس نقش
  IF v_actor_role = 'admin' THEN
    -- admin: همه players و agents
    SELECT ARRAY_AGG(u.id) INTO v_target_user_ids
    FROM public.users u
    WHERE u.role IN ('player', 'agent');
  ELSIF v_actor_role = 'super' THEN
    -- super: players و agents زیر این super
    SELECT ARRAY_AGG(DISTINCT pa.user_id) INTO v_player_ids
    FROM public.player_affiliation pa
    WHERE pa.super_id = v_actor_id;
    
    SELECT ARRAY_AGG(DISTINCT pa.agent_id) INTO v_agent_ids
    FROM public.player_affiliation pa
    WHERE pa.super_id = v_actor_id
      AND pa.agent_id IS NOT NULL;
    
    -- ترکیب player_ids و agent_ids
    v_target_user_ids := COALESCE(v_player_ids, ARRAY[]::uuid[]) || COALESCE(v_agent_ids, ARRAY[]::uuid[]);
  ELSIF v_actor_role = 'agent' THEN
    -- agent: فقط players زیر این agent
    SELECT ARRAY_AGG(pa.user_id) INTO v_target_user_ids
    FROM public.player_affiliation pa
    WHERE pa.agent_id = v_actor_id;
  ELSE
    RAISE WARNING 'Invalid role: %', v_actor_role;
    RETURN;
  END IF;

  IF v_target_user_ids IS NULL OR array_length(v_target_user_ids, 1) IS NULL THEN
    RAISE WARNING 'No target users found for role %', v_actor_role;
    RETURN;
  END IF;

  -- برگرداندن مجموع موجودی‌ها بر اساس نقش
  RETURN QUERY
  SELECT 
    u.role::text,
    COALESCE(SUM(w.balance), 0) as total_balance
  FROM public.users u
  LEFT JOIN public.wallets w ON w.user_id = u.id AND w.currency = 'IRR'
  WHERE u.id = ANY(v_target_user_ids)
    AND u.role IN ('player', 'agent')
  GROUP BY u.role;
END;
$$;


--
-- Name: get_weekly_leaders(integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."get_weekly_leaders"("limit_count" integer DEFAULT 5) RETURNS TABLE("user_id" "uuid", "wins" bigint, "total_rewards" numeric, "last_win" timestamp with time zone, "rank_position" bigint)
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
BEGIN
  RETURN QUERY
  WITH weekly_wins AS (
    SELECT 
      r.user_id,
      COUNT(*) as wins,
      COALESCE(SUM(r.reward_amount), 0) as total_rewards,
      MAX(r.created_at) as last_win
    FROM results r
    WHERE r.created_at >= NOW() - INTERVAL '7 days'
    GROUP BY r.user_id
  )
  SELECT 
    ww.user_id,
    ww.wins,
    ww.total_rewards,
    ww.last_win,
    ROW_NUMBER() OVER (ORDER BY ww.wins DESC, ww.total_rewards DESC, ww.last_win DESC) as rank_position
  FROM weekly_wins ww
  ORDER BY ww.wins DESC, ww.total_rewards DESC, ww.last_win DESC
  LIMIT limit_count;
END;
$$;


--
-- Name: handle_new_user(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."handle_new_user"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
  v_username TEXT;
  v_referral_code TEXT;
  v_referrer_id UUID;
  v_referrer_role TEXT; -- متن ساده
  v_agent_id UUID;
  v_super_id UUID;
  v_metadata JSONB;
BEGIN
  -- شروع لاگ
  RAISE LOG 'handle_new_user شروع شد برای email: %', NEW.email;
  
  -- username از email
  v_username := REPLACE(NEW.email, '@dingmoney.org', '');
  RAISE LOG 'Username استخراج شد: %', v_username;
  
  -- metadata
  v_metadata := NEW.raw_user_meta_data;
  RAISE LOG 'Metadata: %', v_metadata::text;
  
  IF v_metadata IS NULL THEN
    RAISE EXCEPTION 'Metadata خالی است. referral_code الزامی است';
  END IF;
  
  v_referral_code := COALESCE(TRIM(v_metadata->>'referral_code'), '');
  RAISE LOG 'Referral code استخراج شد: %', v_referral_code;
  
  IF v_referral_code IS NULL OR v_referral_code = '' THEN
    RAISE EXCEPTION 'کد معرف الزامی است. همه کاربران باید با کد معرف ثبت‌نام کنند. Metadata: %', v_metadata::text;
  END IF;
  
  v_referral_code := UPPER(TRIM(v_referral_code));
  RAISE LOG 'Referral code نرمال‌سازی شد: %', v_referral_code;
  
  -- پیدا کردن referrer
  SELECT id, role::text INTO v_referrer_id, v_referrer_role
  FROM public.users
  WHERE referral_code IS NOT NULL
    AND UPPER(TRIM(referral_code)) = v_referral_code
    AND status = 'active'
  LIMIT 1;
  
  RAISE LOG 'Referrer جستجو شد. ID: %, Role: %', v_referrer_id, v_referrer_role;
  
  IF v_referrer_id IS NULL THEN
    RAISE EXCEPTION 'کد معرف معتبر نیست: %. لطفاً کد صحیح را وارد کنید', v_referral_code;
  END IF;
  
  IF v_referrer_role = 'player' THEN
    RAISE EXCEPTION 'کد معرف متعلق به player است. فقط agent، super یا admin می‌توانند معرف باشند';
  END IF;
  
  -- agent/super
  IF v_referrer_role = 'agent' THEN
    v_agent_id := v_referrer_id;
    BEGIN
      SELECT parent_id INTO v_super_id
      FROM public.users
      WHERE id = v_referrer_id AND parent_id IS NOT NULL;
    EXCEPTION WHEN OTHERS THEN
      v_super_id := NULL;
    END;
  ELSIF v_referrer_role = 'super' THEN
    v_super_id := v_referrer_id;
    v_agent_id := NULL;
  ELSIF v_referrer_role = 'admin' THEN
    v_agent_id := NULL;
    v_super_id := NULL;
  END IF;
  
  RAISE LOG 'Agent ID: %, Super ID: %', v_agent_id, v_super_id;
  
  -- INSERT در users بدون هیچ cast به user_role
  BEGIN
    INSERT INTO public.users (
      id, email, username, role, status, parent_id, referral_code, created_at
    ) VALUES (
      NEW.id,
      NEW.email,
      v_username,
      'player',          -- literal عادی، خود ستون آن را به enum تبدیل می‌کند
      'active',
      v_referrer_id,
      NULL,
      NOW()
    )
    ON CONFLICT (id) DO UPDATE
    SET
      role = COALESCE(users.role, 'player'),  -- اینجا هم فقط literal
      status = 'active',
      username = EXCLUDED.username,
      parent_id = COALESCE(EXCLUDED.parent_id, users.parent_id);
    
    RAISE LOG 'رکورد در users ایجاد شد';
  EXCEPTION WHEN OTHERS THEN
    RAISE EXCEPTION 'خطا در ایجاد کاربر (users): %', SQLERRM;
  END;
  
  -- player_affiliation
  BEGIN
    INSERT INTO public.player_affiliation (user_id, agent_id, super_id, created_at)
    VALUES (NEW.id, v_agent_id, v_super_id, NOW())
    ON CONFLICT (user_id) DO UPDATE
    SET agent_id = EXCLUDED.agent_id, super_id = EXCLUDED.super_id;
    RAISE LOG 'player_affiliation ایجاد شد';
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'خطا در ایجاد player_affiliation: %', SQLERRM;
  END;
  
  -- wallet
  BEGIN
    INSERT INTO public.wallets (user_id, balance, currency, created_at)
    VALUES (NEW.id, 0, 'IRR', NOW())
    ON CONFLICT DO NOTHING;
    RAISE LOG 'wallet ایجاد شد';
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'خطا در ایجاد wallet: %', SQLERRM;
  END;
  
  -- ding_balance
  BEGIN
    INSERT INTO public.ding_balances (user_id, balance, created_at)
    VALUES (NEW.id, 0, NOW())
    ON CONFLICT DO NOTHING;
    RAISE LOG 'ding_balance ایجاد شد';
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'خطا در ایجاد ding_balance: %', SQLERRM;
  END;
  
  -- user_profile
  BEGIN
    INSERT INTO public.user_profiles (user_id, language, created_at)
    VALUES (NEW.id, 'fa', NOW())
    ON CONFLICT DO NOTHING;
    RAISE LOG 'user_profile ایجاد شد';
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'خطا در ایجاد user_profile: %', SQLERRM;
  END;
  
  RAISE LOG 'handle_new_user با موفقیت تمام شد';
  RETURN NEW;
END;
$$;


--
-- Name: is_admin_active(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."is_admin_active"() RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    SET "row_security" TO 'off'
    AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_role public.user_role;
  v_status public.user_status;
BEGIN
  IF v_uid IS NULL THEN
    RETURN FALSE;
  END IF;

  SELECT role, status
  INTO v_role, v_status
  FROM public.users
  WHERE id = v_uid;

  RETURN v_role = 'admin'::public.user_role
     AND v_status = 'active'::public.user_status;
END;
$$;


--
-- Name: is_tournament_participant("uuid"); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."is_tournament_participant"("p_tournament_id" "uuid") RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    SET "row_security" TO 'off'
    AS $$
DECLARE
  v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN
    RETURN FALSE;
  END IF;

  RETURN EXISTS (
    SELECT 1
    FROM public.tournament_entries te
    JOIN public.tournaments t
      ON t.id = te.tournament_id
    WHERE te.tournament_id = p_tournament_id
      AND te.user_id = v_uid
      AND te.status = 'created'::public.tournament_entry_status
      AND t.status IN (
        'registration_open'::public.tournament_status,
        'running'::public.tournament_status,
        'settling'::public.tournament_status,
        'finished'::public.tournament_status
      )
  );
END;
$$;


--
-- Name: load_test_cleanup("text"); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."load_test_cleanup"("p_tag" "text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
DECLARE
  v_room_ids uuid[];
  v_deleted_rooms int;
BEGIN
  SELECT array_agg(id) INTO v_room_ids FROM public.rooms
  WHERE (meta->>'load_test')::boolean IS TRUE AND (p_tag IS NULL OR meta->>'load_test_tag' = p_tag);
  IF v_room_ids IS NULL OR array_length(v_room_ids, 1) IS NULL THEN
    RETURN jsonb_build_object('deleted_rooms', 0);
  END IF;
  DELETE FROM public.draw_jobs WHERE room_id = ANY(v_room_ids);
  DELETE FROM public.marks m USING public.tickets t WHERE m.ticket_id = t.id AND t.room_id = ANY(v_room_ids);
  DELETE FROM public.results WHERE room_id = ANY(v_room_ids);
  DELETE FROM public.draws WHERE room_id = ANY(v_room_ids);
  DELETE FROM public.tickets WHERE room_id = ANY(v_room_ids);
  DELETE FROM public.rooms WHERE id = ANY(v_room_ids);
  GET DIAGNOSTICS v_deleted_rooms = ROW_COUNT;
  RETURN jsonb_build_object('deleted_rooms', v_deleted_rooms, 'tag', p_tag);
END;
$$;


--
-- Name: load_test_seed_playing_rooms(integer, integer, integer, "text"); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."load_test_seed_playing_rooms"("p_room_count" integer DEFAULT 20, "p_tickets_per_room" integer DEFAULT 200, "p_draw_interval_sec" integer DEFAULT 3, "p_tag" "text" DEFAULT NULL::"text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'load_test', 'public', 'game_core', 'pg_temp'
    AS $$
DECLARE
  v_tag            text := coalesce(nullif(trim(p_tag), ''), 'loadtest-' || to_char(now(), 'YYYYMMDDHH24MISS'));
  v_template       public.room_templates%ROWTYPE;
  v_pool           uuid;
  v_user_ids       uuid[];
  v_user_count     int;
  v_available      int;
  v_room_id        uuid;
  v_seed           bytea;
  v_seed_hash      char(64);
  v_now            timestamptz := now();
  v_room_ids       uuid[] := '{}';
  v_i              int;
  v_u              int;
  r_card           record;
BEGIN
  IF current_setting('request.jwt.claims', true) IS NOT NULL THEN
    IF coalesce(current_setting('request.jwt.claims', true)::jsonb ->> 'role', '') <> 'service_role' THEN
      RAISE EXCEPTION 'load_test_seed_playing_rooms: service_role only';
    END IF;
  END IF;

  IF p_room_count < 1 OR p_tickets_per_room < 1 THEN
    RAISE EXCEPTION 'invalid room_count or tickets_per_room';
  END IF;

  SELECT * INTO v_template FROM public.room_templates WHERE status = 'active'::public.room_template_status ORDER BY created_at DESC LIMIT 1;
  IF NOT FOUND THEN RAISE EXCEPTION 'no active room template'; END IF;

  SELECT id INTO v_pool FROM public.card_pools WHERE is_active = true ORDER BY created_at DESC LIMIT 1;
  IF v_pool IS NULL THEN RAISE EXCEPTION 'no active card pool'; END IF;

  SELECT count(*)::int INTO v_available FROM public.card_pool_cards cpc WHERE cpc.pool_id = v_pool AND (v_template.room_type = 'tournament'::public.room_type OR cpc.card_no <= 200);
  IF v_available < p_tickets_per_room THEN
    RAISE EXCEPTION 'insufficient pool cards per room: need %, available % (room_type=%)', p_tickets_per_room, v_available, v_template.room_type;
  END IF;

  SELECT array_agg(sub.id ORDER BY sub.ord) INTO v_user_ids FROM (SELECT u.id, row_number() OVER (ORDER BY u.created_at) AS ord FROM public.users u LIMIT greatest(p_tickets_per_room, 20)) sub;
  v_user_count := coalesce(array_length(v_user_ids, 1), 0);
  IF v_user_count = 0 THEN RAISE EXCEPTION 'no users found for ticket assignment'; END IF;

  FOR v_i IN 1..p_room_count LOOP
    SELECT seed, seed_hash INTO v_seed, v_seed_hash FROM game_core.fn_generate_room_seed();
    v_room_id := gen_random_uuid();
    INSERT INTO public.rooms (id, room_template_id, status, card_price, price, currency, pool_id, min_players, max_cards_per_player, countdown_sec, starts_at, next_draw_at, room_seed, room_seed_hash, created_by, meta, created_at, updated_at)
    VALUES (v_room_id, v_template.id, 'playing'::public.room_status, v_template.price, v_template.price, v_template.currency, v_pool, 1, greatest(v_template.max_cards_per_player, p_tickets_per_room), coalesce(v_template.countdown_sec, 120), v_now - interval '5 minutes', v_now - make_interval(secs => p_draw_interval_sec), v_seed, v_seed_hash, v_user_ids[1 + ((v_i - 1) % v_user_count)], jsonb_build_object('load_test', true, 'load_test_tag', v_tag, 'draw_interval_sec', p_draw_interval_sec, 'source', 'load_test_seed'), v_now, v_now);
    v_u := 0;
    FOR r_card IN SELECT pool_card_id, card_no FROM load_test._pool_cards_for_room(v_pool, v_room_id, v_seed, v_template.room_type, p_tickets_per_room) LOOP
      v_u := v_u + 1;
      INSERT INTO public.tickets (id, room_id, player_user_id, pool_card_id, card_no, reservation_status, price, created_at, updated_at)
      VALUES (gen_random_uuid(), v_room_id, v_user_ids[1 + ((v_u - 1) % v_user_count)], r_card.pool_card_id, r_card.card_no, 'consumed'::public.reservation_status, v_template.price, v_now, v_now);
    END LOOP;
    IF v_u < p_tickets_per_room THEN RAISE EXCEPTION 'room % only received % tickets (expected %)', v_room_id, v_u, p_tickets_per_room; END IF;
    v_room_ids := array_append(v_room_ids, v_room_id);
  END LOOP;
  RETURN jsonb_build_object('tag', v_tag, 'room_ids', to_jsonb(v_room_ids), 'room_count', p_room_count, 'tickets_per_room', p_tickets_per_room, 'draw_interval_sec', p_draw_interval_sec, 'pool_id', v_pool, 'template_id', v_template.id, 'cards_per_room_capacity', v_available);
END;
$$;


--
-- Name: make_short_id_from_uuid("uuid"); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."make_short_id_from_uuid"("p_id" "uuid") RETURNS "text"
    LANGUAGE "plpgsql" IMMUTABLE
    AS $$
DECLARE
  s    text := p_id::text;
  hash bigint := 0;
  ch   text;
  code int;
  i    int;
BEGIN
  IF p_id IS NULL THEN
    RETURN NULL;
  END IF;

  FOR i IN 1..char_length(s) LOOP
    ch := substr(s, i, 1);
    code := ascii(ch);
    hash := (31 * hash + code) % 4294967296; -- شبیه overflow روی 32 بیت
  END LOOP;

  RETURN lpad((mod(hash, 10000000000))::text, 10, '0'); -- 10^10
END;
$$;


--
-- Name: rpc_apply_ding_credits_for_draw("uuid", integer, integer, "jsonb"); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."rpc_apply_ding_credits_for_draw"("p_room_id" "uuid", "p_draw_number" integer, "p_ding_per_card" integer, "p_credits" "jsonb" DEFAULT '[]'::"jsonb") RETURNS integer
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_draw public.draws%ROWTYPE;
  v_now timestamptz := now();
  v_credited integer := 0;
BEGIN
  SELECT *
    INTO v_draw
  FROM public.draws
  WHERE room_id = p_room_id
    AND number = p_draw_number
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN 0;
  END IF;

  IF v_draw.processed_at IS NULL OR v_draw.ding_aggregated_at IS NOT NULL THEN
    RETURN 0;
  END IF;

  IF jsonb_typeof(p_credits) = 'array' AND jsonb_array_length(p_credits) > 0 THEN
    WITH inc AS (
      SELECT
        (elem->>'user_id')::uuid AS user_id,
        (elem->>'amount')::numeric AS amount,
        COALESCE((elem->>'matched_cards')::integer, 0) AS matched_cards
      FROM jsonb_array_elements(p_credits) AS elem
      WHERE (elem->>'amount')::numeric > 0
    ),
    ins AS (
      INSERT INTO public.ding_transactions (
        user_id,
        room_id,
        ticket_id,
        draw_id,
        drawn_number,
        amount,
        description,
        created_at
      )
      SELECT
        i.user_id,
        p_room_id,
        NULL::uuid,
        v_draw.id,
        p_draw_number,
        i.amount,
        format(
          'Agg ding for draw %s number %s (%s cards x %s)',
          v_draw.id,
          p_draw_number,
          i.matched_cards,
          p_ding_per_card
        ),
        v_now
      FROM inc i
      ON CONFLICT DO NOTHING
      RETURNING user_id, amount
    )
    INSERT INTO public.ding_balances (user_id, balance, updated_at, created_at)
    SELECT
      user_id,
      sum(amount)::numeric,
      v_now,
      v_now
    FROM ins
    GROUP BY user_id
    ON CONFLICT (user_id) DO UPDATE
      SET balance = public.ding_balances.balance + excluded.balance,
          updated_at = v_now;

    SELECT count(DISTINCT user_id)::integer
      INTO v_credited
    FROM (
      SELECT (elem->>'user_id')::uuid AS user_id
      FROM jsonb_array_elements(p_credits) AS elem
      WHERE (elem->>'amount')::numeric > 0
    ) credited;
  END IF;

  UPDATE public.draws
     SET ding_aggregated_at = v_now
   WHERE id = v_draw.id
     AND ding_aggregated_at IS NULL;

  RETURN v_credited;
END;
$$;


--
-- Name: rpc_apply_marks_for_draw("uuid", integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."rpc_apply_marks_for_draw"("p_room_id" "uuid", "p_draw_number" integer) RETURNS "void"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  INSERT INTO marks (ticket_id, value, created_at)
  SELECT DISTINCT
    t.id,
    p_draw_number,
    NOW()
  FROM tickets t
  INNER JOIN card_numbers cn ON cn.pool_card_id = t.pool_card_id
  WHERE t.room_id = p_room_id
    AND t.reservation_status IN ('reserved','confirmed','consumed')
    AND cn.value = p_draw_number
    AND NOT EXISTS (
      SELECT 1 
      FROM marks m 
      WHERE m.ticket_id = t.id 
        AND m.value = p_draw_number
    );
END;
$$;


--
-- Name: rpc_backfill_missed_engine_ding("uuid"); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."rpc_backfill_missed_engine_ding"("p_room_id" "uuid" DEFAULT NULL::"uuid") RETURNS TABLE("out_room_id" "uuid", "draw_number" integer, "users_credited" integer)
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_draw record;
  v_ding_per_card integer;
  v_credits jsonb;
  v_credited integer;
BEGIN
  FOR v_draw IN
    SELECT
      d.room_id,
      d.number AS draw_number,
      COALESCE(r.ding_per_number, rt.ding_per_number, 1)::integer AS ding_per_card
    FROM public.draws d
    JOIN public.rooms r ON r.id = d.room_id
    LEFT JOIN public.room_templates rt ON rt.id = r.room_template_id
    WHERE d.processed_at IS NOT NULL
      AND d.ding_aggregated_at IS NULL
      AND (p_room_id IS NULL OR d.room_id = p_room_id)
    ORDER BY d.processed_at
  LOOP
    v_ding_per_card := GREATEST(v_draw.ding_per_card, 0);

    SELECT COALESCE(
      jsonb_agg(
        jsonb_build_object(
          'user_id', per_user.user_id,
          'amount', per_user.matched_cards * v_ding_per_card,
          'matched_cards', per_user.matched_cards
        )
      ),
      '[]'::jsonb
    )
      INTO v_credits
    FROM (
      SELECT
        t.player_user_id AS user_id,
        count(*)::integer AS matched_cards
      FROM public.marks m
      JOIN public.tickets t ON t.id = m.ticket_id
      WHERE t.room_id = v_draw.room_id
        AND t.cancelled_at IS NULL
        AND m.value = v_draw.draw_number
      GROUP BY t.player_user_id
      HAVING count(*) > 0
    ) per_user;

    IF jsonb_array_length(v_credits) = 0 THEN
      UPDATE public.draws d
         SET ding_aggregated_at = now()
       WHERE d.room_id = v_draw.room_id
         AND d.number = v_draw.draw_number
         AND d.ding_aggregated_at IS NULL;
      v_credited := 0;
    ELSE
      v_credited := public.rpc_apply_ding_credits_for_draw(
        v_draw.room_id,
        v_draw.draw_number,
        v_ding_per_card,
        v_credits
      );
    END IF;

    out_room_id := v_draw.room_id;
    draw_number := v_draw.draw_number;
    users_credited := v_credited;
    RETURN NEXT;
  END LOOP;
END;
$$;


--
-- Name: rpc_claim_game_room("uuid", "text", integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."rpc_claim_game_room"("p_room_id" "uuid", "p_owner_id" "text", "p_lease_seconds" integer DEFAULT 30) RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_room public.rooms%ROWTYPE;
  v_now timestamptz := clock_timestamp();
  v_lease integer := GREATEST(COALESCE(p_lease_seconds, 30), 1);
  v_new_epoch bigint;
BEGIN
  SELECT * INTO v_room
  FROM public.rooms
  WHERE id = p_room_id
  FOR UPDATE;

  IF NOT FOUND OR v_room.status IS DISTINCT FROM 'playing'::public.room_status THEN
    RETURN jsonb_build_object('claimed', false);
  END IF;

  IF v_room.engine_owner_id IS NOT NULL
     AND v_room.engine_owner_id <> p_owner_id
     AND v_room.engine_lease_until IS NOT NULL
     AND v_room.engine_lease_until > v_now THEN
    RETURN jsonb_build_object('claimed', false);
  END IF;

  v_new_epoch := COALESCE(v_room.engine_lease_epoch, 0);
  IF v_room.engine_owner_id IS DISTINCT FROM p_owner_id THEN
    v_new_epoch := v_new_epoch + 1;
  END IF;

  UPDATE public.rooms
     SET engine_owner_id    = p_owner_id,
         engine_lease_until = v_now + make_interval(secs => v_lease),
         engine_lease_epoch = v_new_epoch,
         engine_claimed_at  = CASE
                                WHEN engine_owner_id = p_owner_id THEN COALESCE(engine_claimed_at, v_now)
                                ELSE v_now
                              END,
         engine_loop_state  = 'owned',
         updated_at         = v_now
   WHERE id = p_room_id;

  RETURN jsonb_build_object('claimed', true, 'lease_epoch', v_new_epoch);
END;
$$;


--
-- Name: rpc_finalize_engine_draw_job(bigint, "uuid", integer, "jsonb", "jsonb", boolean, integer, "jsonb", integer, integer, timestamp with time zone, timestamp with time zone, timestamp with time zone, timestamp with time zone, timestamp with time zone, "text", bigint); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."rpc_finalize_engine_draw_job"("p_job_id" bigint, "p_room_id" "uuid", "p_draw_number" integer, "p_marks" "jsonb" DEFAULT '[]'::"jsonb", "p_results" "jsonb" DEFAULT '[]'::"jsonb", "p_set_first_line_draw_number" boolean DEFAULT false, "p_ding_per_card" integer DEFAULT 0, "p_credits" "jsonb" DEFAULT '[]'::"jsonb", "p_queue_wait_ms" integer DEFAULT NULL::integer, "p_processing_ms" integer DEFAULT NULL::integer, "p_drain_started_at" timestamp with time zone DEFAULT NULL::timestamp with time zone, "p_first_picked_at" timestamp with time zone DEFAULT NULL::timestamp with time zone, "p_handler_started_at" timestamp with time zone DEFAULT NULL::timestamp with time zone, "p_actor_evaluate_started_at" timestamp with time zone DEFAULT NULL::timestamp with time zone, "p_actor_finalize_started_at" timestamp with time zone DEFAULT NULL::timestamp with time zone, "p_owner_id" "text" DEFAULT NULL::"text", "p_lease_epoch" bigint DEFAULT NULL::bigint) RETURNS integer
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_now timestamptz := now();
  v_rpc_start timestamptz := clock_timestamp();
  v_finalize_ms integer;
  v_credited integer := 0;
  v_room public.rooms%ROWTYPE;
BEGIN
  IF p_owner_id IS NOT NULL AND p_lease_epoch IS NOT NULL THEN
    SELECT * INTO v_room
    FROM public.rooms
    WHERE id = p_room_id
    FOR UPDATE;

    IF NOT FOUND
       OR v_room.engine_owner_id IS DISTINCT FROM p_owner_id
       OR v_room.engine_lease_epoch IS DISTINCT FROM p_lease_epoch
       OR v_room.engine_lease_until IS NULL
       OR v_room.engine_lease_until <= clock_timestamp() THEN
      RETURN -1;
    END IF;
  END IF;

  IF jsonb_typeof(p_marks) = 'array' AND jsonb_array_length(p_marks) > 0 THEN
    INSERT INTO marks (ticket_id, value, created_at)
    SELECT
      (elem->>'ticket_id')::uuid,
      (elem->>'value')::integer,
      v_now
    FROM jsonb_array_elements(p_marks) AS elem
    ON CONFLICT (ticket_id, value) DO NOTHING;
  END IF;

  IF jsonb_typeof(p_results) = 'array' AND jsonb_array_length(p_results) > 0 THEN
    INSERT INTO results (room_id, user_id, ticket_id, win_type, draw_number, reward_amount)
    SELECT
      p_room_id,
      (elem->>'user_id')::uuid,
      (elem->>'ticket_id')::uuid,
      elem->>'win_type',
      p_draw_number,
      0
    FROM jsonb_array_elements(p_results) AS elem
    ON CONFLICT (ticket_id, win_type) DO NOTHING;
  END IF;

  IF p_set_first_line_draw_number THEN
    UPDATE rooms
    SET first_line_draw_number = p_draw_number,
        updated_at = v_now
    WHERE id = p_room_id
      AND first_line_draw_number IS NULL;
  END IF;

  UPDATE draw_jobs
  SET status = 'done',
      updated_at = v_now
  WHERE id = p_job_id;

  v_finalize_ms := GREATEST(
    0,
    ROUND(EXTRACT(EPOCH FROM (clock_timestamp() - v_rpc_start)) * 1000)::integer
  );

  PERFORM 1
  FROM draw_jobs
  WHERE room_id = p_room_id
    AND draw_number = p_draw_number
    AND status <> 'done'
  LIMIT 1;

  IF NOT FOUND THEN
    UPDATE draws
    SET processed_at = v_now,
        queue_wait_ms = p_queue_wait_ms,
        processing_ms = p_processing_ms,
        finalize_ms = v_finalize_ms,
        drain_started_at = p_drain_started_at,
        first_picked_at = p_first_picked_at,
        handler_started_at = p_handler_started_at,
        actor_evaluate_started_at = COALESCE(
          p_actor_evaluate_started_at,
          actor_evaluate_started_at
        ),
        actor_finalize_started_at = COALESCE(
          p_actor_finalize_started_at,
          actor_finalize_started_at
        )
    WHERE room_id = p_room_id
      AND number = p_draw_number
      AND processed_at IS NULL;
  END IF;

  v_credited := public.rpc_apply_ding_credits_for_draw(
    p_room_id,
    p_draw_number,
    p_ding_per_card,
    p_credits
  );

  RETURN v_credited;
END;
$$;


--
-- Name: rpc_find_claimable_playing_rooms(integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."rpc_find_claimable_playing_rooms"("p_limit" integer DEFAULT 100) RETURNS TABLE("room_id" "uuid", "next_draw_at" timestamp with time zone, "engine_owner_id" "text", "engine_lease_until" timestamp with time zone)
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  SELECT r.id, r.next_draw_at, r.engine_owner_id, r.engine_lease_until FROM public.rooms r WHERE r.status = 'playing'::public.room_status AND (r.engine_owner_id IS NULL OR r.engine_lease_until IS NULL OR r.engine_lease_until < now()) ORDER BY r.next_draw_at ASC NULLS FIRST LIMIT GREATEST(COALESCE(p_limit, 100), 1);
$$;


--
-- Name: rpc_has_earlier_unprocessed_draw("uuid", integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."rpc_has_earlier_unprocessed_draw"("p_room_id" "uuid", "p_draw_number" integer) RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  SELECT EXISTS (
    SELECT 1
    FROM draws earlier
    JOIN draws current
      ON current.room_id = earlier.room_id
     AND current.number = p_draw_number
    WHERE earlier.room_id = p_room_id
      AND earlier.processed_at IS NULL
      AND earlier.timestamp < current.timestamp
  );
$$;


--
-- Name: rpc_insert_draw_if_ready("uuid", integer, timestamp with time zone, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."rpc_insert_draw_if_ready"("p_room_id" "uuid", "p_number" integer, "p_now" timestamp with time zone, "p_draw_interval_sec" integer DEFAULT 3) RETURNS "text"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_room public.rooms%ROWTYPE;
  v_interval integer := GREATEST(COALESCE(p_draw_interval_sec, 3), 1);
  v_jitter_ms integer;
BEGIN
  SELECT *
    INTO v_room
  FROM public.rooms
  WHERE id = p_room_id
  FOR UPDATE;

  IF NOT FOUND OR v_room.status IS DISTINCT FROM 'playing'::public.room_status THEN
    RETURN 'not_playing';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.draws d
    WHERE d.room_id = p_room_id
      AND d.processed_at IS NULL
  ) THEN
    RETURN 'backpressure';
  END IF;

  BEGIN
    INSERT INTO public.draws (room_id, number, "timestamp", created_at)
    VALUES (p_room_id, p_number, p_now, p_now);
  EXCEPTION
    WHEN unique_violation THEN
      RETURN 'duplicate';
  END;

  v_jitter_ms := public.fn_draw_schedule_jitter_ms(p_room_id);

  UPDATE public.rooms
     SET next_draw_at = p_now
                      + make_interval(secs => v_interval)
                      + (v_jitter_ms * interval '1 millisecond'),
         updated_at = p_now
   WHERE id = p_room_id;

  RETURN 'inserted';
END;
$$;


--
-- Name: rpc_insert_draw_if_ready_owner_guard("uuid", integer, timestamp with time zone, "text", integer, timestamp with time zone, bigint); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."rpc_insert_draw_if_ready_owner_guard"("p_room_id" "uuid", "p_number" integer, "p_now" timestamp with time zone, "p_owner_id" "text", "p_draw_interval_sec" integer DEFAULT 3, "p_actor_due_at" timestamp with time zone DEFAULT NULL::timestamp with time zone, "p_lease_epoch" bigint DEFAULT NULL::bigint) RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_room public.rooms%ROWTYPE;
  v_interval integer := GREATEST(COALESCE(p_draw_interval_sec, 3), 1);
  v_jitter_ms integer;
  v_insert_started timestamptz := clock_timestamp();
  v_next_draw_at timestamptz;
  v_job_id bigint;
  v_now timestamptz := clock_timestamp();
BEGIN
  SELECT * INTO v_room
  FROM public.rooms
  WHERE id = p_room_id
  FOR UPDATE;

  IF NOT FOUND OR v_room.status IS DISTINCT FROM 'playing'::public.room_status THEN
    RETURN jsonb_build_object('outcome', 'not_playing');
  END IF;

  IF v_room.engine_owner_id IS DISTINCT FROM p_owner_id
     OR v_room.engine_lease_until IS NULL
     OR v_room.engine_lease_until <= v_now THEN
    RETURN jsonb_build_object('outcome', 'not_owner');
  END IF;

  IF p_lease_epoch IS NOT NULL
     AND v_room.engine_lease_epoch IS DISTINCT FROM p_lease_epoch THEN
    RETURN jsonb_build_object('outcome', 'not_owner');
  END IF;

  IF (SELECT COUNT(*) FROM public.draws d WHERE d.room_id = p_room_id) >= 90 THEN
    RETURN jsonb_build_object('outcome', 'exhausted');
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.draws d
    WHERE d.room_id = p_room_id AND d.processed_at IS NULL
  ) THEN
    RETURN jsonb_build_object('outcome', 'backpressure');
  END IF;

  BEGIN
    INSERT INTO public.draws (
      room_id, number, "timestamp", created_at,
      actor_due_at, actor_insert_started_at, actor_inserted_at
    )
    VALUES (
      p_room_id, p_number, p_now, p_now,
      p_actor_due_at, v_insert_started, clock_timestamp()
    );
  EXCEPTION
    WHEN unique_violation THEN
      RETURN jsonb_build_object('outcome', 'duplicate');
  END;

  v_jitter_ms := public.fn_draw_schedule_jitter_ms(p_room_id);
  v_next_draw_at := p_now
                  + make_interval(secs => v_interval)
                  + (v_jitter_ms * interval '1 millisecond');

  UPDATE public.draws
     SET actor_next_scheduled_at = v_next_draw_at
   WHERE room_id = p_room_id
     AND number = p_number;

  UPDATE public.rooms
     SET next_draw_at = v_next_draw_at,
         engine_lease_until = GREATEST(
           engine_lease_until,
           v_now + interval '30 seconds'
         ),
         updated_at = p_now
   WHERE id = p_room_id;

  SELECT j.id INTO v_job_id
  FROM public.draw_jobs j
  WHERE j.room_id = p_room_id
    AND j.draw_number = p_number
  ORDER BY j.id DESC
  LIMIT 1;

  RETURN jsonb_build_object(
    'outcome', 'inserted',
    'job_id', v_job_id,
    'next_draw_at', v_next_draw_at,
    'lease_epoch', v_room.engine_lease_epoch
  );
END;
$$;


--
-- Name: rpc_pick_draw_jobs(integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."rpc_pick_draw_jobs"("p_limit" integer DEFAULT 100) RETURNS TABLE("id" bigint, "room_id" "uuid", "draw_number" integer, "status" "text", "attempts" integer, "created_at" timestamp with time zone, "updated_at" timestamp with time zone)
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  RETURN QUERY
  WITH ranked AS (
    SELECT
      j.id,
      j.created_at,
      d.timestamp AS draw_ts,
      ROW_NUMBER() OVER (
        PARTITION BY j.room_id
        ORDER BY d.timestamp ASC, j.created_at ASC, j.id ASC
      ) AS round_num
    FROM public.draw_jobs j
    INNER JOIN public.draws d
      ON d.room_id = j.room_id
     AND d.number = j.draw_number
    WHERE j.status = 'queued'
  ),
  fair_candidates AS (
    SELECT ranked.id
    FROM ranked
    ORDER BY ranked.round_num ASC, ranked.created_at ASC, ranked.draw_ts ASC, ranked.id ASC
    LIMIT GREATEST(COALESCE(p_limit, 100), 1)
  )
  UPDATE public.draw_jobs dj
  SET
    status = 'processing',
    updated_at = NOW()
  WHERE dj.id IN (
    SELECT j.id
    FROM public.draw_jobs j
    INNER JOIN fair_candidates fc ON fc.id = j.id
    WHERE j.status = 'queued'
    FOR UPDATE OF j SKIP LOCKED
  )
  RETURNING
    dj.id,
    dj.room_id,
    dj.draw_number,
    dj.status,
    dj.attempts,
    dj.created_at,
    dj.updated_at;
END;
$$;


--
-- Name: FUNCTION "rpc_pick_draw_jobs"("p_limit" integer); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION "public"."rpc_pick_draw_jobs"("p_limit" integer) IS 'Claims queued draw_jobs (queued -> processing). Fair per-room round-robin: earliest draw per room first, rooms ordered by oldest job created_at.';


--
-- Name: rpc_register_player("text", "text"); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."rpc_register_player"("p_username" "text", "p_referral_code" "text") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_user_id        uuid := auth.uid();
  v_user_role      user_role := 'player'::user_role;
  v_referrer_id    uuid;
  v_referrer_role  user_role;
  v_agent_id       uuid;
  v_super_id       uuid;
  v_clean_refcode  text;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'user not authenticated';
  END IF;

  -- تمیز کردن کد معرف
  v_clean_refcode := COALESCE(TRIM(p_referral_code), '');

  IF v_clean_refcode = '' THEN
    RAISE EXCEPTION 'کد معرف الزامی است';
  END IF;

  -- پیدا کردن referrer
  SELECT id, role
    INTO v_referrer_id, v_referrer_role
  FROM public.users
  WHERE referral_code = UPPER(v_clean_refcode)
    AND status = 'active'
  LIMIT 1;

  IF v_referrer_id IS NULL THEN
    RAISE EXCEPTION 'کد معرف معتبر نیست: %', v_clean_refcode;
  END IF;

  IF v_referrer_role = 'player' THEN
    RAISE EXCEPTION 'کد معرف متعلق به player است';
  END IF;

  -- تعیین agent / super بر اساس نقش معرف
  IF v_referrer_role = 'agent' THEN
    v_agent_id := v_referrer_id;
    SELECT parent_id INTO v_super_id
    FROM public.users
    WHERE id = v_referrer_id;
  ELSIF v_referrer_role = 'super' THEN
    v_super_id := v_referrer_id;
    v_agent_id := NULL;
  ELSIF v_referrer_role = 'admin' THEN
    v_agent_id := NULL;
    v_super_id := NULL;
  END IF;

  -- آپدیت user به عنوان player با parent_id = referrer
  UPDATE public.users
  SET
    username      = COALESCE(p_username, username),
    role          = v_user_role,
    status        = 'active',
    parent_id     = v_referrer_id,
    referral_code = NULL,    -- پلیر خودش کد معرف نمی‌گیرد (اگر بعداً خواستی می‌تونی بدی)
    updated_at    = NOW()
  WHERE id = v_user_id;

  -- affiliation
  INSERT INTO public.player_affiliation (user_id, agent_id, super_id, created_at)
  VALUES (v_user_id, v_agent_id, v_super_id, NOW())
  ON CONFLICT (user_id) DO UPDATE
  SET agent_id = EXCLUDED.agent_id,
      super_id = EXCLUDED.super_id;

  -- wallet
  INSERT INTO public.wallets (user_id, balance, currency, created_at)
  VALUES (v_user_id, 0, 'IRR', NOW())
  ON CONFLICT (user_id) DO NOTHING;

  -- ding balance
  INSERT INTO public.ding_balances (user_id, balance, created_at)
  VALUES (v_user_id, 0, NOW())
  ON CONFLICT (user_id) DO NOTHING;

  -- profile
  INSERT INTO public.user_profiles (user_id, language, created_at)
  VALUES (v_user_id, 'fa', NOW())
  ON CONFLICT (user_id) DO NOTHING;
END;
$$;


--
-- Name: rpc_release_game_room("uuid", "text", bigint); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."rpc_release_game_room"("p_room_id" "uuid", "p_owner_id" "text", "p_lease_epoch" bigint DEFAULT NULL::bigint) RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_now timestamptz := clock_timestamp();
  v_updated integer;
BEGIN
  UPDATE public.rooms
     SET engine_owner_id    = NULL,
         engine_lease_until = NULL,
         engine_loop_state  = 'idle',
         updated_at         = v_now
   WHERE id = p_room_id
     AND engine_owner_id = p_owner_id
     AND (p_lease_epoch IS NULL OR engine_lease_epoch = p_lease_epoch);

  GET DIAGNOSTICS v_updated = ROW_COUNT;
  RETURN v_updated > 0;
END;
$$;


--
-- Name: rpc_renew_game_room_lease("uuid", "text", integer, bigint); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."rpc_renew_game_room_lease"("p_room_id" "uuid", "p_owner_id" "text", "p_lease_seconds" integer DEFAULT 30, "p_lease_epoch" bigint DEFAULT NULL::bigint) RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_now timestamptz := clock_timestamp();
  v_lease integer := GREATEST(COALESCE(p_lease_seconds, 30), 1);
  v_updated integer;
BEGIN
  UPDATE public.rooms
     SET engine_lease_until = v_now + make_interval(secs => v_lease),
         updated_at         = v_now
   WHERE id = p_room_id
     AND status = 'playing'::public.room_status
     AND engine_owner_id = p_owner_id
     AND (p_lease_epoch IS NULL OR engine_lease_epoch = p_lease_epoch);

  GET DIAGNOSTICS v_updated = ROW_COUNT;
  RETURN v_updated > 0;
END;
$$;


--
-- Name: rpc_requeue_failed_draw_jobs(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."rpc_requeue_failed_draw_jobs"() RETURNS integer
    LANGUAGE "sql" SECURITY DEFINER
    SET "search_path" TO 'public', 'game_core'
    AS $$
  SELECT game_core.fn_requeue_failed_draw_jobs();
$$;


--
-- Name: set_updated_at(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."set_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;


--
-- Name: set_user_profiles_updated_at(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."set_user_profiles_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
begin
  new.updated_at = now();
  return new;
end;
$$;


--
-- Name: test_active_cards_bypass_rls("uuid"); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."test_active_cards_bypass_rls"("p_room_id" "uuid") RETURNS TABLE("user_id" "uuid", "card_count" bigint)
    LANGUAGE "sql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  SELECT t.player_user_id, count(*)::bigint
  FROM public.tickets t
  WHERE t.room_id = p_room_id
    AND t.reservation_status IN ('reserved', 'confirmed', 'consumed')
  GROUP BY t.player_user_id;
$$;


--
-- Name: test_constraint_resolution(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."test_constraint_resolution"() RETURNS "text"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public', 'game_finance'
    AS $$
DECLARE
  v_constraint_exists boolean;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'tournament_entries_unique_per_user'
      AND conrelid = 'public.tournament_entries'::regclass
  ) INTO v_constraint_exists;
  
  IF v_constraint_exists THEN
    RETURN 'Constraint found';
  ELSE
    RETURN 'Constraint NOT found';
  END IF;
END;
$$;


--
-- Name: tg_user_profiles_lock_deposit_identity(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."tg_user_profiles_lock_deposit_identity"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  IF OLD.full_name IS NOT NULL
     AND NEW.full_name IS DISTINCT FROM OLD.full_name THEN
    RAISE EXCEPTION 'full_name is locked after first write'
      USING ERRCODE = 'check_violation';
  END IF;

  IF OLD.phone IS NOT NULL
     AND NEW.phone IS DISTINCT FROM OLD.phone THEN
    RAISE EXCEPTION 'phone is locked after first write'
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;


--
-- Name: trg_debug_rooms_status(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."trg_debug_rooms_status"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
begin
  insert into public.debug_room_status_log(room_id, op, old_status, new_status, auth_uid, meta)
  values (
    coalesce(new.id, old.id),
    tg_op,
    old.status::text,
    new.status::text,
    auth.uid(),
    jsonb_build_object(
      'old', to_jsonb(old),
      'new', to_jsonb(new)
    )
  );
  return new;
end;
$$;


--
-- Name: trg_rooms_status_template_draining(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."trg_rooms_status_template_draining"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
BEGIN
  -- فقط وقتی معنی‌دار است که روم از حالت waiting/playing به حالت دیگری برود
  IF TG_OP = 'UPDATE'
     AND OLD.status IN ('waiting', 'playing')
     AND NEW.status NOT IN ('waiting', 'playing') THEN
    PERFORM public.fn_try_mark_template_inactive_if_drained(NEW.room_template_id);
  END IF;

  RETURN NEW;
END;
$$;


--
-- Name: trg_sync_room_winners_from_results(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."trg_sync_room_winners_from_results"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  -- Only full wins advance tournaments
  IF NEW.win_type <> 'full' THEN
    RETURN NEW;
  END IF;

  -- Only rooms tied to tournaments should populate room_winners
  IF NOT EXISTS (
    SELECT 1
    FROM public.tournament_round_rooms trr
    WHERE trr.room_id = NEW.room_id
  ) THEN
    RETURN NEW;
  END IF;

  INSERT INTO public.room_winners (room_id, ticket_id, user_id, weight)
  VALUES (NEW.room_id, NEW.ticket_id, NEW.user_id, 1)
  ON CONFLICT (room_id, ticket_id) DO NOTHING;

  RETURN NEW;
END;
$$;


--
-- Name: update_admin_permissions_updated_at(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."update_admin_permissions_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;


--
-- Name: update_dev_player_configs_updated_at(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."update_dev_player_configs_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;


--
-- Name: update_dev_player_join_preset_template_limits_updated_at(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."update_dev_player_join_preset_template_limits_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;


--
-- Name: update_dev_player_join_presets_updated_at(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."update_dev_player_join_presets_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;


--
-- Name: update_dev_player_settings_updated_at(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."update_dev_player_settings_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;


--
-- Name: update_dev_player_template_room_limits_updated_at(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."update_dev_player_template_room_limits_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;


--
-- Name: update_ding_balance("uuid", numeric); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."update_ding_balance"("p_user_id" "uuid", "p_amount" numeric) RETURNS numeric
    LANGUAGE "plpgsql"
    AS $$
DECLARE
  v_new_balance NUMERIC;
BEGIN
  -- Insert or update balance
  INSERT INTO ding_balances (user_id, balance, updated_at)
  VALUES (p_user_id, p_amount, NOW())
  ON CONFLICT (user_id) 
  DO UPDATE SET 
    balance = ding_balances.balance + p_amount,
    updated_at = NOW()
  RETURNING balance INTO v_new_balance;
  
  RETURN v_new_balance;
END;
$$;


--
-- Name: update_entry_banners_updated_at(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."update_entry_banners_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;


--
-- Name: update_user_notes_updated_at(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."update_user_notes_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;


--
-- Name: _assert_registration_open("uuid"); Type: FUNCTION; Schema: tournament; Owner: -
--

CREATE FUNCTION "tournament"."_assert_registration_open"("p_tournament_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql"
    AS $$
DECLARE
  v_status public.tournament_status;
BEGIN
  SELECT status INTO v_status
  FROM public.tournaments
  WHERE id = p_tournament_id;

  IF v_status IS NULL THEN
    RAISE EXCEPTION 'TOURNAMENT_NOT_FOUND';
  END IF;

  IF v_status <> 'registration_open'::public.tournament_status THEN
    RAISE EXCEPTION 'REGISTRATION_NOT_OPEN';
  END IF;
END $$;


--
-- Name: _assert_status("uuid", "public"."tournament_status"[]); Type: FUNCTION; Schema: tournament; Owner: -
--

CREATE FUNCTION "tournament"."_assert_status"("p_tournament_id" "uuid", "p_allowed" "public"."tournament_status"[]) RETURNS "void"
    LANGUAGE "plpgsql"
    AS $$
DECLARE v_status public.tournament_status;
BEGIN
  SELECT status INTO v_status FROM public.tournaments WHERE id = p_tournament_id;
  IF v_status IS NULL THEN RAISE EXCEPTION 'TOURNAMENT_NOT_FOUND'; END IF;

  IF NOT (v_status = ANY (p_allowed)) THEN
    RAISE EXCEPTION 'BAD_TOURNAMENT_STATUS:%', v_status;
  END IF;
END $$;


--
-- Name: _assert_tournament_exists("uuid"); Type: FUNCTION; Schema: tournament; Owner: -
--

CREATE FUNCTION "tournament"."_assert_tournament_exists"("p_tournament_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.tournaments WHERE id = p_tournament_id) THEN
    RAISE EXCEPTION 'TOURNAMENT_NOT_FOUND';
  END IF;
END $$;


--
-- Name: tournament_entries; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."tournament_entries" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tournament_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "amount" numeric(10,2) NOT NULL,
    "status" "public"."tournament_entry_status" DEFAULT 'created'::"public"."tournament_entry_status" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "tickets_count" integer NOT NULL,
    "price_per_ticket" numeric DEFAULT 0 NOT NULL,
    CONSTRAINT "tournament_entries_tickets_count_check" CHECK (("tickets_count" >= 1)),
    CONSTRAINT "tournament_entries_tickets_count_positive" CHECK (("tickets_count" >= 1))
);


--
-- Name: buy_tickets("uuid", integer); Type: FUNCTION; Schema: tournament; Owner: -
--

CREATE FUNCTION "tournament"."buy_tickets"("p_tournament_id" "uuid", "p_delta" integer) RETURNS "public"."tournament_entries"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_ticket_price numeric(10,2);
  v_min int;
  v_max int;

  v_entry public.tournament_entries;
  v_new_count int;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'UNAUTHENTICATED';
  END IF;

  PERFORM tournament._assert_registration_open(p_tournament_id);

  SELECT ticket_price, min_tickets_per_player, max_tickets_per_player
  INTO v_ticket_price, v_min, v_max
  FROM public.tournaments
  WHERE id = p_tournament_id
  FOR UPDATE;

  IF v_ticket_price IS NULL THEN
    RAISE EXCEPTION 'TOURNAMENT_BAD_PRICING';
  END IF;

  -- lock (or create) the entry row
  SELECT * INTO v_entry
  FROM public.tournament_entries
  WHERE tournament_id = p_tournament_id AND user_id = v_uid
  FOR UPDATE;

  IF v_entry.id IS NULL THEN
    -- new registration
    v_new_count := GREATEST(v_min, 1) + p_delta;
    IF v_new_count < v_min THEN v_new_count := v_min; END IF;

    IF v_new_count > v_max THEN
      RAISE EXCEPTION 'MAX_TICKETS_EXCEEDED';
    END IF;

    INSERT INTO public.tournament_entries (tournament_id, user_id, tickets_count, amount, status, created_at)
    VALUES (
      p_tournament_id,
      v_uid,
      v_new_count,
      (v_new_count * v_ticket_price),
      'created'::public.tournament_entry_status,
      now()
    )
    RETURNING * INTO v_entry;

    RETURN v_entry;
  END IF;

  -- existing registration: update
  IF v_entry.status <> 'created'::public.tournament_entry_status THEN
    RAISE EXCEPTION 'ENTRY_NOT_ACTIVE';
  END IF;

  v_new_count := COALESCE(v_entry.tickets_count, 0) + p_delta;

  IF v_new_count < v_min THEN
    RAISE EXCEPTION 'MIN_TICKETS_NOT_MET';
  END IF;

  IF v_new_count > v_max THEN
    RAISE EXCEPTION 'MAX_TICKETS_EXCEEDED';
  END IF;

  UPDATE public.tournament_entries
  SET tickets_count = v_new_count,
      amount = (v_new_count * v_ticket_price)
  WHERE id = v_entry.id
  RETURNING * INTO v_entry;

  RETURN v_entry;
END $$;


--
-- Name: cancel_registration("uuid"); Type: FUNCTION; Schema: tournament; Owner: -
--

CREATE FUNCTION "tournament"."cancel_registration"("p_tournament_id" "uuid") RETURNS "public"."tournament_entries"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_entry public.tournament_entries;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'UNAUTHENTICATED';
  END IF;

  PERFORM tournament._assert_registration_open(p_tournament_id);

  UPDATE public.tournament_entries
  SET status = 'cancelled'::public.tournament_entry_status,
      tickets_count = 0,
      amount = 0
  WHERE tournament_id = p_tournament_id
    AND user_id = v_uid
    AND status = 'created'::public.tournament_entry_status
  RETURNING * INTO v_entry;

  IF v_entry.id IS NULL THEN
    RAISE EXCEPTION 'ENTRY_NOT_FOUND_OR_NOT_ACTIVE';
  END IF;

  RETURN v_entry;
END $$;


--
-- Name: capture_entry_locks("uuid"); Type: FUNCTION; Schema: tournament; Owner: -
--

CREATE FUNCTION "tournament"."capture_entry_locks"("p_tournament_id" "uuid") RETURNS integer
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
  v_count int;
BEGIN
  -- TODO: add your real admin check (platform-only)
  -- IF NOT public.is_admin(auth.uid()) THEN RAISE EXCEPTION 'FORBIDDEN'; END IF;

  -- usually: close registration -> running (or start)
  PERFORM tournament._assert_status(p_tournament_id, ARRAY['running'::public.tournament_status,'settling'::public.tournament_status]);

  UPDATE public.tournament_locks
  SET status = 'captured',
      captured_at = COALESCE(captured_at, now()),
      updated_at = now()
  WHERE tournament_id = p_tournament_id
    AND lock_kind = 'entry'
    AND status = 'held';

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END $$;


--
-- Name: close_registration("uuid"); Type: FUNCTION; Schema: tournament; Owner: -
--

CREATE FUNCTION "tournament"."close_registration"("p_tournament_id" "uuid") RETURNS "public"."tournaments"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
  v_row public.tournaments;
BEGIN
  -- TODO: replace with your real admin check

  UPDATE public.tournaments
  SET status = 'running'::public.tournament_status
  WHERE id = p_tournament_id
    AND status = 'registration_open'::public.tournament_status;

  SELECT * INTO v_row FROM public.tournaments WHERE id = p_tournament_id;

  IF v_row.id IS NULL THEN
    RAISE EXCEPTION 'TOURNAMENT_NOT_FOUND';
  END IF;

  RETURN v_row;
END $$;


--
-- Name: fn_admin_create_tournament("jsonb"); Type: FUNCTION; Schema: tournament; Owner: -
--

CREATE FUNCTION "tournament"."fn_admin_create_tournament"("p_payload" "jsonb") RETURNS "public"."tournaments"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'tournament', 'public', 'pg_temp'
    AS $$
DECLARE
  v_actor         uuid := auth.uid();
  v_actor_role    public.user_role;
  v_actor_status  public.user_status;
  v_now           timestamptz := now();
  v_row           public.tournaments%rowtype;
  v_status        public.tournament_status := coalesce(
                         nullif(p_payload->>'status','')::public.tournament_status,
                         'draft'::public.tournament_status
                       );
  v_final_winners int := nullif(p_payload->>'final_winners_count','')::int;
  v_min_players_for_guarantee int := nullif(p_payload->>'min_players_for_guarantee','')::int;
  v_min_players_to_start int := nullif(p_payload->>'min_players_to_start','')::int;
  v_registration_extend_minutes int := nullif(p_payload->>'registration_extend_minutes','')::int;
  v_entry_currency text := upper(coalesce(nullif(p_payload->>'entry_currency',''), p_payload->>'currency', 'IRR'));
  v_guaranteed numeric := nullif(p_payload->>'guaranteed_prize','')::numeric;
  v_meta jsonb;
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'UNAUTHORIZED';
  END IF;

  SELECT role, status
    INTO v_actor_role, v_actor_status
  FROM public.users
  WHERE id = v_actor;

  IF v_actor_role NOT IN ('admin','super') OR v_actor_status IS DISTINCT FROM 'active' THEN
    RAISE EXCEPTION 'FORBIDDEN';
  END IF;

  IF v_status NOT IN ('draft','registration_open') THEN
    RAISE EXCEPTION 'invalid initial status';
  END IF;

  IF v_final_winners IS NOT NULL AND (v_final_winners < 1 OR v_final_winners > 4) THEN
    RAISE EXCEPTION 'final_winners_count must be between 1 and 4';
  END IF;

  IF v_min_players_for_guarantee IS NOT NULL AND v_min_players_for_guarantee < 1 THEN
    RAISE EXCEPTION 'min_players_for_guarantee must be >= 1';
  END IF;

  IF v_min_players_to_start IS NOT NULL AND v_min_players_to_start < 3 THEN
    RAISE EXCEPTION 'min_players_to_start must be >= 3';
  END IF;

  IF v_registration_extend_minutes IS NOT NULL
     AND (v_registration_extend_minutes < 1 OR v_registration_extend_minutes > 10080) THEN
    RAISE EXCEPTION 'registration_extend_minutes must be between 1 and 10080';
  END IF;

  IF v_entry_currency NOT IN ('IRR','DING') THEN
    RAISE EXCEPTION 'entry_currency must be IRR or DING';
  END IF;

  IF v_entry_currency = 'DING' AND (v_guaranteed IS NULL OR v_guaranteed <= 0) THEN
    RAISE EXCEPTION 'ding tournaments require guaranteed_prize';
  END IF;

  v_meta := jsonb_strip_nulls(jsonb_build_object(
    'final_winners_count', v_final_winners,
    'min_players_for_guarantee', v_min_players_for_guarantee,
    'min_players_to_start', coalesce(v_min_players_to_start, 3),
    'registration_extend_minutes', coalesce(v_registration_extend_minutes, 60),
    'entry_currency', v_entry_currency
  ));

  INSERT INTO public.tournaments(
    title, status, start_at, currency, ticket_price,
    min_tickets_per_player, max_tickets_per_player,
    table_size_mode, table_size_fixed, table_size_min, table_size_max,
    remainder_policy, commission_rate, guaranteed_prize, meta, created_at, updated_at
  )
  VALUES (
    p_payload->>'title',
    v_status,
    nullif(p_payload->>'start_at','')::timestamptz,
    coalesce(p_payload->>'currency','IRR'),
    nullif(p_payload->>'ticket_price','')::numeric,
    nullif(p_payload->>'min_tickets_per_player','')::int,
    nullif(p_payload->>'max_tickets_per_player','')::int,
    coalesce(nullif(p_payload->>'table_size_mode','')::public.tournament_table_size_mode, 'fixed'),
    nullif(p_payload->>'table_size_fixed','')::int,
    nullif(p_payload->>'table_size_min','')::int,
    nullif(p_payload->>'table_size_max','')::int,
    coalesce(nullif(p_payload->>'remainder_policy','')::public.tournament_remainder_policy, 'adaptive_tables'),
    nullif(p_payload->>'commission_rate','')::numeric,
    v_guaranteed,
    CASE WHEN v_meta = '{}'::jsonb THEN NULL ELSE v_meta END,
    v_now,
    v_now
  )
  RETURNING * INTO v_row;

  RETURN v_row;
END;
$$;


--
-- Name: fn_admin_delete_tournament("uuid"); Type: FUNCTION; Schema: tournament; Owner: -
--

CREATE FUNCTION "tournament"."fn_admin_delete_tournament"("p_tournament_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'tournament', 'public', 'pg_temp'
    AS $$
DECLARE
  v_actor         uuid := auth.uid();
  v_actor_role    public.user_role;
  v_actor_status  public.user_status;
  v_status        public.tournament_status;
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'UNAUTHORIZED';
  END IF;

  SELECT role, status
    INTO v_actor_role, v_actor_status
  FROM public.users
  WHERE id = v_actor;

  IF v_actor_role NOT IN ('admin','super') OR v_actor_status IS DISTINCT FROM 'active' THEN
    RAISE EXCEPTION 'FORBIDDEN';
  END IF;

  SELECT status
    INTO v_status
  FROM public.tournaments
  WHERE id = p_tournament_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'tournament_not_found';
  END IF;

  IF v_status <> 'cancelled' THEN
    RAISE EXCEPTION 'only cancelled tournaments can be deleted';
  END IF;

  DELETE FROM public.tournaments
  WHERE id = p_tournament_id;
END;
$$;


--
-- Name: fn_admin_refund_cancelled_tournament("uuid"); Type: FUNCTION; Schema: tournament; Owner: -
--

CREATE FUNCTION "tournament"."fn_admin_refund_cancelled_tournament"("p_tournament_id" "uuid") RETURNS integer
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'tournament', 'game_finance'
    AS $$
declare
  v_actor uuid := auth.uid();
  v_actor_role public.user_role;
  v_actor_status public.user_status;

  v_count int := 0;

  r record;
  v_wallet_id uuid;
  v_wallet_currency text;
  v_tx uuid;

  v_idem text;
begin
  -- 1) AuthZ: فقط admin/super فعال
  if v_actor is null then
    raise exception 'UNAUTHORIZED';
  end if;

  select role, status
    into v_actor_role, v_actor_status
  from public.users
  where id = v_actor;

  if v_actor_role not in ('admin','super')
     or v_actor_status is distinct from 'active' then
    raise exception 'FORBIDDEN';
  end if;

  -- 2) این عملیات منطقی‌اش وقتی tournament cancelled است (یا در مسیر لغو)
  perform tournament._assert_status(
    p_tournament_id,
    array[
      'cancelled'::public.tournament_status,
      'registration_open'::public.tournament_status
    ]
  );

  -- 3) روی همه‌ی lockهای held حلقه می‌زنیم
  for r in
    select
      l.id            as lock_id,
      l.entry_id      as entry_id,
      l.owner_user_id as user_id,
      l.wallet_id     as wallet_id,
      l.amount        as amount
    from public.tournament_locks l
    where l.tournament_id = p_tournament_id
      and l.lock_kind = 'entry'
      and l.status = 'held'
      and (l.idempotency_key is null or l.idempotency_key not like 'admin_cancel_refund:%')
    for update skip locked
  loop
    -- idempotency key per lock (unique index covers tournament_id + idempotency_key)
    v_idem := 'admin_cancel_refund:' || r.lock_id::text;

    -- 3.1) پیدا کردن wallet + currency
    if r.wallet_id is not null then
      select w.id, w.currency
        into v_wallet_id, v_wallet_currency
      from public.wallets w
      where w.id = r.wallet_id
      for update;
    else
      -- اگر wallet_id ندارید، از owner_user_id یک کیف پول پیدا می‌کنیم.
      -- اگر چند-ارزی هستید و meta currency ندارید، اینجا اولین کیف پول کاربر انتخاب می‌شود.
      select w.id, w.currency
        into v_wallet_id, v_wallet_currency
      from public.wallets w
      where w.user_id = r.user_id
      order by w.created_at
      limit 1
      for update;
    end if;

    if v_wallet_id is null then
      raise exception 'wallet not found for user % (lock %)', r.user_id, r.lock_id;
    end if;

    -- 3.2) ledger refund (+amount)
    select game_finance.fn_wallet_apply_delta(
      p_user_id          := r.user_id,
      p_currency         := v_wallet_currency,
      p_amount_delta     := r.amount,
      p_transaction_type := 'join_refund',
      p_source_kind      := 'tournament_join',
      p_source_ref       := p_tournament_id::text,
      p_description      := 'admin refund after tournament cancelled',
      p_meta             := jsonb_build_object(
                              'tournament_id', p_tournament_id,
                              'entry_id', r.entry_id,
                              'lock_id', r.lock_id,
                              'actor', v_actor,
                              'idempotency_key', v_idem
                            ),
      p_allow_negative   := false
    ) into v_tx;

    -- 3.3) کاهش locked_amount (محافظت: منفی نشود)
    update public.wallets w
       set locked_amount = w.locked_amount - r.amount,
           updated_at = now()
     where w.id = v_wallet_id
       and w.locked_amount >= r.amount;

    if not found then
      raise exception 'insufficient locked_amount for wallet % (need %, lock %)',
        v_wallet_id, r.amount, r.lock_id;
    end if;

    -- 3.4) آزاد کردن خود lock + ثبت idempotency_key
    update public.tournament_locks
       set status = 'released',
           released_at = coalesce(released_at, now()),
           updated_at = now(),
           idempotency_key = v_idem,
           meta = meta || jsonb_build_object(
                   'admin_refund_tx', v_tx,
                   'admin_refunded_at', now(),
                   'admin_actor', v_actor
                 )
     where id = r.lock_id;

    v_count := v_count + 1;
  end loop;

  -- 4) وضعیت entryها را cancelled کن (اگر هنوز created هستند)
  update public.tournament_entries e
     set status = 'cancelled'::public.tournament_entry_status
   where e.tournament_id = p_tournament_id
     and e.status = 'created'::public.tournament_entry_status;

  return v_count;
end;
$$;


--
-- Name: fn_admin_set_tournament_status("uuid", "public"."tournament_status"); Type: FUNCTION; Schema: tournament; Owner: -
--

CREATE FUNCTION "tournament"."fn_admin_set_tournament_status"("p_tournament_id" "uuid", "p_status" "public"."tournament_status") RETURNS "public"."tournaments"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
  v_actor         uuid := auth.uid();
  v_actor_role    public.user_role;
  v_actor_status  public.user_status;
  v_row           public.tournaments%ROWTYPE;
  v_prev_status   public.tournament_status;
  v_now           timestamptz := now();
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'UNAUTHORIZED';
  END IF;

  SELECT role, status
    INTO v_actor_role, v_actor_status
  FROM public.users
  WHERE id = v_actor;

  IF v_actor_role NOT IN ('admin','super') OR v_actor_status IS DISTINCT FROM 'active' THEN
    RAISE EXCEPTION 'FORBIDDEN';
  END IF;

  SELECT *
    INTO v_row
  FROM public.tournaments
  WHERE id = p_tournament_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'tournament_not_found';
  END IF;

  IF p_status IS NULL THEN
    RAISE EXCEPTION 'status is required';
  END IF;

  -- نگه داشتن وضعیت قبلی برای تشخیص transition
  v_prev_status := v_row.status;

  -- Allowed transitions:
  -- draft -> registration_open | cancelled
  -- registration_open -> cancelled
  IF v_row.status = 'draft' AND p_status IN ('registration_open','cancelled') THEN
    NULL;
  ELSIF v_row.status = 'registration_open' AND p_status = 'cancelled' THEN
    NULL;
  ELSE
    RAISE EXCEPTION 'invalid status transition from % to %', v_row.status, p_status;
  END IF;

  UPDATE public.tournaments t
     SET status     = p_status,
         updated_at = v_now
   WHERE t.id = p_tournament_id
   RETURNING * INTO v_row;

  -- ✅ الحاق: اگر از registration_open به cancelled رفتیم، پول‌های لاک‌شده را دسته‌جمعی آزاد کن
  IF v_prev_status = 'registration_open'::public.tournament_status
     AND v_row.status = 'cancelled'::public.tournament_status THEN
    PERFORM tournament.fn_admin_refund_cancelled_tournament(p_tournament_id);
  END IF;

  RETURN v_row;
END;
$$;


--
-- Name: fn_admin_update_tournament("uuid", "jsonb"); Type: FUNCTION; Schema: tournament; Owner: -
--

CREATE FUNCTION "tournament"."fn_admin_update_tournament"("p_tournament_id" "uuid", "p_patch" "jsonb") RETURNS "public"."tournaments"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'tournament', 'public', 'pg_temp'
    AS $$
DECLARE
  v_actor         uuid := auth.uid();
  v_actor_role    public.user_role;
  v_actor_status  public.user_status;
  v_row           public.tournaments%rowtype;
  v_now           timestamptz := now();
  v_allowed_keys  text[] := array[
    'title','start_at','currency','ticket_price','min_tickets_per_player',
    'max_tickets_per_player','table_size_mode','table_size_fixed','table_size_min',
    'table_size_max','remainder_policy','guaranteed_prize','commission_rate','meta'
  ];
  v_bad_keys      text[];
  v_min_players_for_guarantee int;
  v_min_players_to_start int;
  v_registration_extend_minutes int;
  v_entry_currency text;
  v_next_guaranteed numeric;
BEGIN
  p_patch := coalesce(p_patch, '{}'::jsonb);

  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'UNAUTHORIZED';
  END IF;

  SELECT role, status
    INTO v_actor_role, v_actor_status
  FROM public.users
  WHERE id = v_actor;

  IF v_actor_role NOT IN ('admin','super') OR v_actor_status IS DISTINCT FROM 'active' THEN
    RAISE EXCEPTION 'FORBIDDEN';
  END IF;

  IF p_tournament_id IS NULL THEN
    RAISE EXCEPTION 'tournament_id is required';
  END IF;

  SELECT * INTO v_row FROM public.tournaments WHERE id = p_tournament_id FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'tournament_not_found';
  END IF;

  IF v_row.status IN ('running','settling','finished') THEN
    RAISE EXCEPTION 'tournament is locked';
  END IF;

  v_bad_keys := (
    SELECT array_agg(k)
    FROM jsonb_object_keys(p_patch) AS k
    WHERE k <> ALL (v_allowed_keys)
  );
  IF v_bad_keys IS NOT NULL THEN
    RAISE EXCEPTION 'unsupported keys: %', v_bad_keys;
  END IF;

  IF p_patch ? 'status' THEN
    RAISE EXCEPTION 'status cannot be changed via this RPC';
  END IF;

  IF p_patch ? 'meta' THEN
    v_min_players_for_guarantee := nullif(p_patch->'meta'->>'min_players_for_guarantee','')::int;
    IF v_min_players_for_guarantee IS NOT NULL AND v_min_players_for_guarantee < 1 THEN
      RAISE EXCEPTION 'min_players_for_guarantee must be >= 1';
    END IF;

    v_min_players_to_start := nullif(p_patch->'meta'->>'min_players_to_start','')::int;
    IF v_min_players_to_start IS NOT NULL AND v_min_players_to_start < 3 THEN
      RAISE EXCEPTION 'min_players_to_start must be >= 3';
    END IF;

    v_registration_extend_minutes := nullif(p_patch->'meta'->>'registration_extend_minutes','')::int;
    IF v_registration_extend_minutes IS NOT NULL
       AND (v_registration_extend_minutes < 1 OR v_registration_extend_minutes > 10080) THEN
      RAISE EXCEPTION 'registration_extend_minutes must be between 1 and 10080';
    END IF;
  END IF;

  v_entry_currency := upper(coalesce(
    nullif(p_patch->'meta'->>'entry_currency',''),
    v_row.meta->>'entry_currency',
    v_row.currency,
    'IRR'
  ));

  IF v_entry_currency NOT IN ('IRR','DING') THEN
    RAISE EXCEPTION 'entry_currency must be IRR or DING';
  END IF;

  v_next_guaranteed := coalesce(nullif(p_patch->>'guaranteed_prize','')::numeric, v_row.guaranteed_prize);
  IF v_entry_currency = 'DING' AND (v_next_guaranteed IS NULL OR v_next_guaranteed <= 0) THEN
    RAISE EXCEPTION 'ding tournaments require guaranteed_prize';
  END IF;

  UPDATE public.tournaments t
     SET title                   = coalesce(p_patch->>'title', t.title),
         start_at                = coalesce((p_patch->>'start_at')::timestamptz, t.start_at),
         currency                = coalesce(p_patch->>'currency', t.currency),
         ticket_price            = coalesce(nullif(p_patch->>'ticket_price','')::numeric, t.ticket_price),
         min_tickets_per_player  = coalesce(nullif(p_patch->>'min_tickets_per_player','')::int, t.min_tickets_per_player),
         max_tickets_per_player  = coalesce(nullif(p_patch->>'max_tickets_per_player','')::int, t.max_tickets_per_player),
         table_size_mode         = coalesce(
                                    nullif(p_patch->>'table_size_mode','')::public.tournament_table_size_mode,
                                    t.table_size_mode
                                  ),
         table_size_fixed        = coalesce(nullif(p_patch->>'table_size_fixed','')::int, t.table_size_fixed),
         table_size_min          = coalesce(nullif(p_patch->>'table_size_min','')::int, t.table_size_min),
         table_size_max          = coalesce(nullif(p_patch->>'table_size_max','')::int, t.table_size_max),
         remainder_policy        = coalesce(
                                    nullif(p_patch->>'remainder_policy','')::public.tournament_remainder_policy,
                                    t.remainder_policy
                                  ),
         commission_rate         = coalesce(nullif(p_patch->>'commission_rate','')::numeric, t.commission_rate),
         guaranteed_prize        = v_next_guaranteed,
         meta                    = CASE
                                    WHEN p_patch ? 'meta' THEN coalesce(t.meta, '{}'::jsonb) || coalesce(p_patch->'meta','{}'::jsonb)
                                    ELSE t.meta
                                  END,
         updated_at              = v_now
   WHERE t.id = p_tournament_id
   RETURNING * INTO v_row;

  RETURN v_row;
END;
$$;


--
-- Name: fn_assign_templates_for_round("uuid", integer, integer[]); Type: FUNCTION; Schema: tournament; Owner: -
--

CREATE FUNCTION "tournament"."fn_assign_templates_for_round"("p_tournament_id" "uuid", "p_round_no" integer, "p_batch_tables" integer[] DEFAULT NULL::integer[]) RETURNS "void"
    LANGUAGE "plpgsql"
    AS $$
DECLARE
  v_trr record;
  v_template_id uuid;
  v_template_password text;
BEGIN
  FOR v_trr IN
    SELECT id, table_no
    FROM public.tournament_round_rooms
    WHERE tournament_id = p_tournament_id
      AND round_no = p_round_no
      AND room_template_id IS NULL
      AND (p_batch_tables IS NULL OR table_no = ANY(p_batch_tables))
    ORDER BY table_no
    FOR UPDATE SKIP LOCKED
  LOOP
    -- تامین تمپلیت (reuse اگر آزاد هست، create اگر نیست)
    SELECT t.template_id, t.template_password
      INTO v_template_id, v_template_password
    FROM tournament.fn_create_or_get_table_template(
      p_tournament_id,
      p_round_no,
      v_trr.table_no
    ) AS t;

    -- محافظ نهایی
    IF v_template_id IS NULL THEN
      RAISE EXCEPTION
        'template provisioning failed (tournament=%, round=%, table_no=%)',
        p_tournament_id, p_round_no, v_trr.table_no;
    END IF;

    -- اگر fn_create_or_get_table_template قبلاً ست نکرده باشد (محافظ مضاعف)
    UPDATE public.tournament_round_rooms
       SET room_template_id = v_template_id,
           meta = COALESCE(meta,'{}'::jsonb) ||
                 jsonb_build_object(
                   'template_assigned_at', now(),
                   'template_id', v_template_id
                 )
     WHERE id = v_trr.id
       AND room_template_id IS NULL;
  END LOOP;

  RETURN;
END;
$$;


--
-- Name: fn_burn_ding_locks("uuid"); Type: FUNCTION; Schema: tournament; Owner: -
--

CREATE FUNCTION "tournament"."fn_burn_ding_locks"("p_tournament_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'tournament', 'public', 'pg_temp'
    AS $$
DECLARE
  r_lock record;
  v_now timestamptz := now();
  v_locked bigint;
BEGIN
  FOR r_lock IN
    SELECT id, owner_user_id, amount
    FROM public.tournament_locks
    WHERE tournament_id = p_tournament_id
      AND lock_kind = 'entry'
      AND status = 'held'
      AND (meta->>'currency') = 'DING'
    FOR UPDATE
  LOOP
    SELECT locked_amount
      INTO v_locked
    FROM public.ding_balances
    WHERE user_id = r_lock.owner_user_id
    FOR UPDATE;

    IF v_locked IS NULL OR v_locked < r_lock.amount THEN
      RAISE EXCEPTION 'insufficient locked ding balance for user %', r_lock.owner_user_id;
    END IF;

    UPDATE public.ding_balances
       SET locked_amount = locked_amount - r_lock.amount::bigint,
           updated_at = v_now
     WHERE user_id = r_lock.owner_user_id;

    UPDATE public.tournament_locks
       SET status = 'captured',
           amount = 0,
           captured_at = v_now,
           updated_at = v_now,
           meta = COALESCE(meta,'{}'::jsonb) || jsonb_build_object('burned_at', v_now)
     WHERE id = r_lock.id;
  END LOOP;

  RETURN;
END;
$$;


--
-- Name: fn_calc_commission("uuid", "uuid", numeric); Type: FUNCTION; Schema: tournament; Owner: -
--

CREATE FUNCTION "tournament"."fn_calc_commission"("p_tournament_id" "uuid", "p_user_id" "uuid", "p_gross" numeric) RETURNS TABLE("commission_rate" numeric, "agent_id" "uuid", "super_id" "uuid", "agent_rate" numeric, "super_rate" numeric, "agent_amount" numeric, "super_amount" numeric, "admin_amount" numeric, "amount_to_pool" numeric)
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
  v_rate numeric := 0;
  v_agent uuid;
  v_super uuid;
  v_agent_rate numeric := 0;
  v_super_rate numeric := 0;

  v_total_comm numeric := 0;
  v_agent_amt numeric := 0;
  v_super_amt numeric := 0;
  v_admin_amt numeric := 0;
  v_to_pool numeric := 0;
BEGIN
  IF p_gross IS NULL OR p_gross < 0 THEN
    RAISE EXCEPTION 'gross must be >= 0';
  END IF;

  SELECT COALESCE((t.meta->>'commission_rate')::numeric, 0)
    INTO v_rate
  FROM public.tournaments t
  WHERE t.id = p_tournament_id;

  v_rate := GREATEST(LEAST(v_rate, 1), 0);

  SELECT vpc.agent_id, vpc.super_id, COALESCE(vpc.agent_rate,0), COALESCE(vpc.super_rate,0)
    INTO v_agent, v_super, v_agent_rate, v_super_rate
  FROM public.vw_player_commission vpc
  WHERE vpc.player_id = p_user_id;

  v_total_comm := CEIL(p_gross * v_rate);

  v_agent_amt := COALESCE(CEIL(v_total_comm * v_agent_rate), 0);
  v_super_amt := COALESCE(CEIL(v_total_comm * v_super_rate), 0);
  v_admin_amt := GREATEST(v_total_comm - v_agent_amt - v_super_amt, 0);

  v_to_pool := GREATEST(p_gross - v_total_comm, 0);

  RETURN QUERY
  SELECT v_rate, v_agent, v_super, v_agent_rate, v_super_rate,
         v_agent_amt, v_super_amt, v_admin_amt, v_to_pool;
END;
$$;


--
-- Name: fn_capture_entry_locks("uuid"); Type: FUNCTION; Schema: tournament; Owner: -
--

CREATE FUNCTION "tournament"."fn_capture_entry_locks"("p_tournament_id" "uuid") RETURNS integer
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'tournament', 'public', 'pg_temp'
    AS $$
DECLARE
  r_lock record;
  v_now timestamptz := now();
  v_currency text;
  v_wallet_id uuid;
  v_locked numeric;
  v_count int := 0;
  v_captured_amount numeric;
BEGIN
  FOR r_lock IN
    SELECT l.id, l.owner_user_id, l.amount, l.wallet_id, l.entry_id, l.meta
    FROM public.tournament_locks l
    WHERE l.tournament_id = p_tournament_id
      AND l.lock_kind = 'entry'
      AND l.status = 'held'
      AND upper(coalesce(l.meta->>'currency', 'IRR')) <> 'DING'
    FOR UPDATE
  LOOP
    v_currency := upper(coalesce(r_lock.meta->>'currency', 'IRR'));
    v_captured_amount := COALESCE(r_lock.amount, 0);

    IF r_lock.amount IS NULL OR r_lock.amount <= 0 THEN
      UPDATE public.tournament_locks
         SET status = 'captured',
             amount = 0,
             captured_at = v_now,
             updated_at = v_now,
             meta = COALESCE(meta, '{}'::jsonb) || jsonb_build_object(
               'captured_at', v_now,
               'capture_note', 'zero_or_null_amount_lock',
               'captured_amount', COALESCE(
                 NULLIF(meta->>'captured_amount', '')::numeric,
                 0
               )
             )
       WHERE id = r_lock.id
         AND status = 'held';
      CONTINUE;
    END IF;

    IF r_lock.wallet_id IS NOT NULL THEN
      SELECT w.id, w.locked_amount INTO v_wallet_id, v_locked
      FROM public.wallets w
      WHERE w.id = r_lock.wallet_id
      FOR UPDATE;
    ELSE
      SELECT w.id, w.locked_amount INTO v_wallet_id, v_locked
      FROM public.wallets w
      WHERE w.user_id = r_lock.owner_user_id
        AND w.currency = v_currency
      FOR UPDATE;
    END IF;

    IF v_wallet_id IS NULL THEN
      RAISE EXCEPTION 'wallet not found for lock %, user %, currency %', r_lock.id, r_lock.owner_user_id, v_currency;
    END IF;

    IF COALESCE(v_locked, 0) < r_lock.amount THEN
      RAISE EXCEPTION 'insufficient locked_amount to capture lock %, have %, need %', r_lock.id, v_locked, r_lock.amount;
    END IF;

    UPDATE public.wallets
       SET locked_amount = locked_amount - r_lock.amount,
           updated_at = v_now
     WHERE id = v_wallet_id;

    UPDATE public.tournament_locks
       SET status = 'captured',
           amount = 0,
           wallet_id = v_wallet_id,
           captured_at = v_now,
           updated_at = v_now,
           meta = COALESCE(meta, '{}'::jsonb) || jsonb_build_object(
             'captured_at', v_now,
             'captured_amount', COALESCE(
               NULLIF(meta->>'captured_amount', '')::numeric,
               v_captured_amount
             )
           )
     WHERE id = r_lock.id
       AND status = 'held';

    v_count := v_count + 1;
  END LOOP;

  RETURN v_count;
END;
$$;


--
-- Name: fn_commission_payout("uuid", "uuid"); Type: FUNCTION; Schema: tournament; Owner: -
--

CREATE FUNCTION "tournament"."fn_commission_payout"("p_tournament_id" "uuid", "p_entry_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'tournament', 'public'
    AS $$
DECLARE
  v_snap public.tournament_commission_snapshots%ROWTYPE;
  v_admin_id uuid;
BEGIN
  SELECT * INTO v_snap
  FROM public.tournament_commission_snapshots
  WHERE tournament_id = p_tournament_id
    AND entry_id = p_entry_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'commission snapshot not found';
  END IF;

  IF v_snap.admin_id IS NULL THEN
    SELECT id INTO v_admin_id
    FROM public.users
    WHERE username = 'adminzero'
      AND role = 'admin'
    LIMIT 1;

    IF v_admin_id IS NULL THEN
      RAISE EXCEPTION 'adminzero user not found';
    END IF;
  ELSE
    v_admin_id := v_snap.admin_id;
  END IF;

  DELETE FROM public.tournament_commission_payouts
   WHERE tournament_id = p_tournament_id
     AND entry_id = p_entry_id;

  IF v_snap.admin_amount > 0 AND v_admin_id IS NOT NULL THEN
    INSERT INTO public.tournament_commission_payouts(
      tournament_id, entry_id, beneficiary_user_id, role, amount, currency, status, created_at
    ) VALUES (
      p_tournament_id, p_entry_id, v_admin_id, 'admin', v_snap.admin_amount, v_snap.currency, 'pending', now()
    );
  END IF;

  IF v_snap.agent_amount > 0 AND v_snap.agent_id IS NOT NULL THEN
    INSERT INTO public.tournament_commission_payouts(
      tournament_id, entry_id, beneficiary_user_id, role, amount, currency, status, created_at
    ) VALUES (
      p_tournament_id, p_entry_id, v_snap.agent_id, 'agent', v_snap.agent_amount, v_snap.currency, 'pending', now()
    );
  END IF;

  IF v_snap.super_amount > 0 AND v_snap.super_id IS NOT NULL THEN
    INSERT INTO public.tournament_commission_payouts(
      tournament_id, entry_id, beneficiary_user_id, role, amount, currency, status, created_at
    ) VALUES (
      p_tournament_id, p_entry_id, v_snap.super_id, 'super', v_snap.super_amount, v_snap.currency, 'pending', now()
    );
  END IF;
END;
$$;


--
-- Name: fn_commission_snapshot("uuid", "uuid"); Type: FUNCTION; Schema: tournament; Owner: -
--

CREATE FUNCTION "tournament"."fn_commission_snapshot"("p_tournament_id" "uuid", "p_entry_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'tournament', 'public'
    AS $$
BEGIN
  PERFORM tournament.fn_commission_snapshot_entry(p_tournament_id, p_entry_id);
END;
$$;


--
-- Name: fn_commission_snapshot_entry("uuid", "uuid"); Type: FUNCTION; Schema: tournament; Owner: -
--

CREATE FUNCTION "tournament"."fn_commission_snapshot_entry"("p_tournament_id" "uuid", "p_entry_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'tournament', 'public', 'pg_temp'
    AS $$
DECLARE
  v_entry              record;
  v_t                  record;
  v_gross              numeric := 0;
  v_rate               numeric := 0;
  v_total_comm         numeric := 0;
  v_agent              uuid;
  v_super              uuid;
  v_admin              uuid;
  v_agent_rate         numeric := 0;
  v_super_rate         numeric := 0;
  v_agent_amount       numeric := 0;
  v_super_amount       numeric := 0;
  v_admin_amount       numeric := 0;
  v_amount_to_pool     numeric := 0;
BEGIN
  SELECT te.id, te.user_id, te.tickets_count, te.status
    INTO v_entry
  FROM public.tournament_entries te
  WHERE te.id = p_entry_id
    AND te.tournament_id = p_tournament_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'entry not found (tournament_id=%, entry_id=%)', p_tournament_id, p_entry_id;
  END IF;

  IF v_entry.status = 'cancelled'::public.tournament_entry_status THEN
    DELETE FROM public.tournament_commission_snapshots
    WHERE tournament_id = p_tournament_id
      AND entry_id      = p_entry_id;
    RETURN;
  END IF;

  SELECT t.id, t.ticket_price, t.currency, t.commission_rate, t.created_by
    INTO v_t
  FROM public.tournaments t
  WHERE t.id = p_tournament_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'tournament not found: %', p_tournament_id;
  END IF;

  v_admin := v_t.created_by;

  v_rate := COALESCE(v_t.commission_rate, 0);
  IF v_rate > 1 THEN
    v_rate := v_rate / 100.0;
  END IF;

  v_gross := COALESCE(v_entry.tickets_count, 0) * COALESCE(v_t.ticket_price, 0);

  SELECT pa.agent_id, pa.super_id
    INTO v_agent, v_super
  FROM public.player_affiliation pa
  WHERE pa.user_id = v_entry.user_id;

  IF v_agent IS NOT NULL THEN
    SELECT COALESCE(uc.agent_commission, 0)
      INTO v_agent_rate
    FROM public.user_commissions uc
    WHERE uc.user_id = v_agent;

    IF v_agent_rate > 1 THEN
      v_agent_rate := v_agent_rate / 100.0;
    END IF;
  END IF;

  IF v_super IS NOT NULL THEN
    SELECT COALESCE(uc.super_commission, 0)
      INTO v_super_rate
    FROM public.user_commissions uc
    WHERE uc.user_id = v_super;

    IF v_super_rate > 1 THEN
      v_super_rate := v_super_rate / 100.0;
    END IF;
  END IF;

  v_total_comm := CEIL(v_gross * GREATEST(v_rate, 0));

  v_agent_amount := LEAST(
    v_total_comm,
    COALESCE(CEIL(v_total_comm * GREATEST(v_agent_rate, 0)), 0)
  );

  v_super_amount := LEAST(
    GREATEST(v_total_comm - v_agent_amount, 0),
    COALESCE(
      CEIL(v_total_comm * GREATEST(v_super_rate - v_agent_rate, 0)),
      0
    )
  );

  v_admin_amount := GREATEST(v_total_comm - v_agent_amount - v_super_amount, 0);
  v_amount_to_pool := GREATEST(v_gross - v_total_comm, 0);

  INSERT INTO public.tournament_commission_snapshots(
    tournament_id, entry_id, user_id,
    agent_id, super_id, admin_id,
    gross_amount,
    commission_rate,
    commission_base,
    agent_rate, super_rate,
    agent_amount, super_amount, admin_amount,
    amount_to_pool,
    currency,
    commission_model
  ) VALUES (
    p_tournament_id, p_entry_id, v_entry.user_id,
    v_agent, v_super, v_admin,
    v_gross,
    v_rate,
    v_total_comm,
    v_agent_rate, v_super_rate,
    v_agent_amount, v_super_amount, v_admin_amount,
    v_amount_to_pool,
    COALESCE(v_t.currency, 'IRR'),
    'tournament_entry'
  )
  ON CONFLICT (tournament_id, entry_id) DO UPDATE
    SET user_id         = EXCLUDED.user_id,
        agent_id        = EXCLUDED.agent_id,
        super_id        = EXCLUDED.super_id,
        admin_id        = EXCLUDED.admin_id,
        gross_amount    = EXCLUDED.gross_amount,
        commission_rate = EXCLUDED.commission_rate,
        commission_base = EXCLUDED.commission_base,
        agent_rate      = EXCLUDED.agent_rate,
        super_rate      = EXCLUDED.super_rate,
        agent_amount    = EXCLUDED.agent_amount,
        super_amount    = EXCLUDED.super_amount,
        admin_amount    = EXCLUDED.admin_amount,
        amount_to_pool  = EXCLUDED.amount_to_pool,
        currency        = EXCLUDED.currency,
        commission_model= EXCLUDED.commission_model,
        created_at      = now();

  PERFORM tournament.fn_touch_commission_snapshot_at(p_tournament_id);
END;
$$;


--
-- Name: fn_create_or_get_table_template("uuid", integer, integer); Type: FUNCTION; Schema: tournament; Owner: -
--

CREATE FUNCTION "tournament"."fn_create_or_get_table_template"("p_tournament_id" "uuid", "p_round_no" integer, "p_table_no" integer) RETURNS TABLE("template_id" "uuid", "template_password" "text")
    LANGUAGE "plpgsql"
    AS $$
DECLARE
  v_trr_id uuid;
  v_meta jsonb;
  v_target_players int;

  v_existing_template_id uuid;
  v_existing_password text;

  v_template_id uuid;
  v_template_price numeric;
  v_password text;
  v_min_players int;

  v_room_type public.room_type := 'tournament'::public.room_type;
BEGIN
  SELECT id, meta, room_template_id, target_players
    INTO v_trr_id, v_meta, v_existing_template_id, v_target_players
  FROM public.tournament_round_rooms
  WHERE tournament_id = p_tournament_id
    AND round_no = p_round_no
    AND table_no = p_table_no
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION
      'tournament_round_room not found (tid=%, round=%, table=%)',
      p_tournament_id, p_round_no, p_table_no;
  END IF;

  IF v_existing_template_id IS NOT NULL THEN
    v_existing_password := NULLIF(COALESCE(v_meta->>'template_password', ''), '');
    template_id := v_existing_template_id;
    template_password := v_existing_password;
    RETURN NEXT;
    RETURN;
  END IF;

  v_min_players := GREATEST(COALESCE(v_target_players, 2), 2);

  v_password := md5(clock_timestamp()::text || ':' || random()::text || ':' || p_tournament_id::text);

  BEGIN
    v_template_id := tournament.fn_pick_free_room_template(v_room_type);
  EXCEPTION
    WHEN OTHERS THEN
      v_template_id := NULL;
  END;

  IF v_template_id IS NOT NULL THEN
    SELECT price
      INTO v_template_price
    FROM public.room_templates
    WHERE id = v_template_id;

    IF v_template_price IS DISTINCT FROM 0 THEN
      v_template_id := NULL;
    END IF;
  END IF;

  IF v_template_id IS NULL THEN
    INSERT INTO public.room_templates(
      status,
      room_type,
      price,
      currency,
      min_players,
      countdown_sec,
      max_cards_per_player,
      scheduled_start_time,
      password,
      created_at,
      updated_at
    )
    VALUES (
      'active'::public.room_template_status,
      v_room_type,
      0,
      'IRR',
      v_min_players,
      30,
      999999,
      NULL,
      v_password,
      now(),
      now()
    )
    RETURNING id INTO v_template_id;
  END IF;

  UPDATE public.tournament_round_rooms
     SET room_template_id = v_template_id,
         meta = COALESCE(meta, '{}'::jsonb) ||
               jsonb_build_object(
                 'template_assigned_at', now(),
                 'template_id', v_template_id,
                 'template_password', v_password,
                 'room_type', v_room_type,
                 'table_min', v_min_players
               )
   WHERE id = v_trr_id
     AND room_template_id IS NULL;

  template_id := v_template_id;
  template_password := v_password;
  RETURN NEXT;
  RETURN;
END;
$$;


--
-- Name: fn_create_rooms_for_round("uuid", integer, "uuid"); Type: FUNCTION; Schema: tournament; Owner: -
--

CREATE FUNCTION "tournament"."fn_create_rooms_for_round"("p_tournament_id" "uuid", "p_round_no" integer, "p_force_pool_id" "uuid" DEFAULT NULL::"uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
  v_t              public.tournaments%ROWTYPE;
  v_pool_id        uuid;
  v_now            timestamptz := now();

  v_trr            RECORD;   -- tournament_round_rooms row
  v_game_room_id   uuid;

  v_total_cards    int;
BEGIN
  -- lock tournament row (prevents concurrent changes)
  SELECT * INTO v_t
  FROM public.tournaments
  WHERE id = p_tournament_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'tournament % not found', p_tournament_id;
  END IF;

  -- pick pool_id
  IF p_force_pool_id IS NOT NULL THEN
    v_pool_id := p_force_pool_id;
  ELSE
    SELECT cp.id INTO v_pool_id
    FROM public.card_pools cp
    WHERE cp.is_active = true
    ORDER BY cp.updated_at DESC NULLS LAST, cp.created_at DESC
    LIMIT 1;

    IF v_pool_id IS NULL THEN
      RAISE EXCEPTION 'No active card_pool found (public.card_pools.is_active=true)';
    END IF;
  END IF;

  -- iterate over round tables that don't have a game room yet
  FOR v_trr IN
    SELECT trr.id,
           trr.table_no,
           trr.room_id
    FROM public.tournament_round_rooms trr
    WHERE trr.tournament_id = p_tournament_id
      AND trr.round_no      = p_round_no
      AND trr.room_id IS NULL
    ORDER BY trr.table_no
    FOR UPDATE SKIP LOCKED
  LOOP
    -- how many cards needed in this table?
    SELECT COALESCE(SUM(tra.cards_count), 0)::int
      INTO v_total_cards
    FROM public.tournament_round_assignments tra
    WHERE tra.tournament_id = p_tournament_id
      AND tra.round_no      = p_round_no
      AND tra.room_id       = v_trr.id;

    IF v_total_cards <= 0 THEN
      RAISE NOTICE 'Skipping table %, no assignments/cards_count', v_trr.table_no;
      CONTINUE;
    END IF;

    -- create a public.rooms row for this tournament table
    INSERT INTO public.rooms (
      title,
      status,
      created_by,
      card_price,
      currency,
      max_cards_per_player,
      min_players,
      max_players,
      starts_at,
      pool_id,
      meta,
      created_at,
      updated_at
    )
    SELECT
      format('%s | T:%s | R:%s | Table:%s', v_t.title, p_tournament_id, p_round_no, v_trr.table_no) as title,
      'waiting'::public.room_status,
      v_t.created_by,
      COALESCE(v_t.ticket_price, 0),
      COALESCE(v_t.currency, 'IRR'),
      COALESCE(v_t.max_tickets_per_player, 1),
      GREATEST(2, LEAST(v_total_cards, COALESCE(v_t.table_size_max, 12))),     -- conservative
      GREATEST(2, LEAST(v_total_cards, COALESCE(v_t.table_size_max, 12))),     -- conservative
      v_now,
      v_pool_id,
      jsonb_build_object(
        'kind','tournament_round_room',
        'tournament_id', p_tournament_id,
        'round_no', p_round_no,
        'table_no', v_trr.table_no,
        'generated_at', v_now
      ),
      v_now,
      v_now
    RETURNING id INTO v_game_room_id;

    -- bind it back to tournament_round_rooms
    UPDATE public.tournament_round_rooms
    SET room_id = v_game_room_id,
        status  = 'created'::public.tournament_round_room_status,
        meta    = COALESCE(meta,'{}'::jsonb) || jsonb_build_object('room_created_at', v_now)
    WHERE id = v_trr.id;

    -- allocate pool cards + insert tickets
    -- We need v_total_cards unique pool_card_id for this room.
    WITH picked_cards AS (
      SELECT cpc.id AS pool_card_id,
             ROW_NUMBER() OVER (ORDER BY random()) AS rn
      FROM public.card_pool_cards cpc
      WHERE cpc.pool_id = v_pool_id
      ORDER BY random()
      LIMIT v_total_cards
    ),
    expanded_assignments AS (
      -- expand each player into N rows (N = cards_count)
      SELECT tra.user_id,
             generate_series(1, tra.cards_count) AS k
      FROM public.tournament_round_assignments tra
      WHERE tra.tournament_id = p_tournament_id
        AND tra.round_no      = p_round_no
        AND tra.room_id       = v_trr.id
    ),
    ordered_expanded AS (
      SELECT ea.user_id,
             ROW_NUMBER() OVER (ORDER BY ea.user_id::text, ea.k) AS rn
      FROM expanded_assignments ea
    )
    INSERT INTO public.tickets (
      room_id,
      player_user_id,
      pool_card_id,
      card_no,
      reservation_status,
      price,
      created_at,
      updated_at
    )
    SELECT
      v_game_room_id,
      oe.user_id,
      pc.pool_card_id,
      pc.rn::smallint,
      'confirmed'::public.reservation_status,
      COALESCE(v_t.ticket_price, 0),
      v_now,
      v_now
    FROM ordered_expanded oe
    JOIN picked_cards pc USING (rn);

    RAISE NOTICE 'Created game room % for tournament %, round %, table %, tickets=%',
      v_game_room_id, p_tournament_id, p_round_no, v_trr.table_no, v_total_cards;
  END LOOP;
END;
$$;


--
-- Name: fn_join_table("uuid", integer, integer, "uuid", integer); Type: FUNCTION; Schema: tournament; Owner: -
--

CREATE FUNCTION "tournament"."fn_join_table"("p_tournament_id" "uuid", "p_round_no" integer, "p_table_no" integer, "p_user_id" "uuid", "p_card_count" integer) RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$DECLARE
  v_trr_id uuid;
  v_template_id uuid;
  v_room_id uuid;
BEGIN
  -- پیدا کردن میز
  SELECT id, room_template_id
  INTO v_trr_id, v_template_id
  FROM public.tournament_round_rooms
  WHERE tournament_id = p_tournament_id
    AND round_no = p_round_no
    AND table_no = p_table_no
  FOR UPDATE;

  -- پلیر واقعاً assignment دارد؟
  PERFORM 1
  FROM public.tournament_round_assignments
  WHERE tournament_id = p_tournament_id
    AND round_no = p_round_no
    AND trr_id = v_trr_id
    AND user_id = p_user_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'player not assigned to this table';
  END IF;

  -- اگر تمپلیت نداریم، یکی آزاد بردار
  IF v_template_id IS NULL THEN
    SELECT id INTO v_template_id
    FROM public.room_templates rt
    WHERE rt.status = 'active'
      AND rt.room_type = 'tournament'
      AND NOT EXISTS (
        SELECT 1 FROM public.rooms r
        WHERE r.room_template_id = rt.id
          AND r.status = 'waiting'
      )
    ORDER BY random()
    LIMIT 1;

    UPDATE public.tournament_round_rooms
      SET room_template_id = v_template_id
    WHERE id = v_trr_id;
  END IF;

  -- impersonation
  PERFORM set_config('request.jwt.claim.sub', p_user_id::text, true);
  PERFORM set_config('request.jwt.claim.role', 'authenticated', true);

  -- ورود واقعی به بازی
  SELECT room_id INTO v_room_id
  FROM public.fn_join_or_create_room(
    v_template_id,
    p_card_count
  );

  -- bind room_id اگر اولین پلیر است
  UPDATE public.tournament_round_rooms
    SET room_id = v_room_id
  WHERE id = v_trr_id
    AND room_id IS NULL;

  -- سینک seated_players
  UPDATE public.tournament_round_rooms
  SET seated_players = (
    SELECT COUNT(DISTINCT player_user_id)
    FROM public.tickets
    WHERE room_id = v_room_id
  )
  WHERE id = v_trr_id;

  RETURN v_room_id;
END;$$;


--
-- Name: fn_manage_tournament_cycle("uuid", bigint); Type: FUNCTION; Schema: tournament; Owner: -
--

CREATE FUNCTION "tournament"."fn_manage_tournament_cycle"("p_tournament_id" "uuid", "p_seed" bigint) RETURNS "void"
    LANGUAGE "plpgsql"
    AS $$DECLARE
  v_t                 public.tournaments%ROWTYPE;

  v_curr_round        int;
  v_next_round        int;

  v_table_mode        public.tournament_table_size_mode;
  v_table_fixed       int;
  v_table_min         int;
  v_table_max         int;

  v_count_players     int;
  v_tables_needed     int;

  v_sizes             int[];
  v_now               timestamptz := now();

  v_trr_ids           uuid[];   -- ids of tournament_round_rooms in order
  v_idx               int := 1;
  v_i                 int;
  r_entry             record;
  v_entry_currency    text;
BEGIN
  DROP TABLE IF EXISTS pg_temp._tp_participants;
  DROP TABLE IF EXISTS pg_temp._tp_ordered;

  SELECT * INTO v_t
  FROM public.tournaments
  WHERE id = p_tournament_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'tournament not found: %', p_tournament_id;
  END IF;

  IF v_t.status <> 'running' THEN
    RETURN;
  END IF;

  v_entry_currency := upper(coalesce(nullif(v_t.meta->>'entry_currency',''), v_t.currency, 'IRR'));

  SELECT COALESCE(MAX(round_no), 0)
    INTO v_curr_round
  FROM public.tournament_round_rooms
  WHERE tournament_id = p_tournament_id;

  v_next_round := v_curr_round + 1;

  IF EXISTS (
    SELECT 1 FROM public.tournament_round_rooms
    WHERE tournament_id = p_tournament_id AND round_no = v_next_round
  ) THEN
    RETURN;
  END IF;

  IF v_curr_round > 0 AND EXISTS (
    SELECT 1 FROM public.tournament_round_rooms
    WHERE tournament_id = p_tournament_id
      AND round_no = v_curr_round
      AND status <> 'finished'
  ) THEN
    RETURN;
  END IF;

  v_table_mode  := COALESCE(v_t.table_size_mode, 'range');
  v_table_fixed := COALESCE(v_t.table_size_fixed, 0);
  v_table_min   := COALESCE(v_t.table_size_min, 8);
  v_table_max   := COALESCE(v_t.table_size_max, 12);

  IF v_table_mode = 'fixed' THEN
    v_table_min := v_table_fixed;
    v_table_max := v_table_fixed;
  END IF;

  CREATE TEMP TABLE _tp_participants(
    user_id uuid PRIMARY KEY,
    cards_count int NOT NULL
  ) ON COMMIT DROP;

  IF v_curr_round = 0 THEN
    INSERT INTO _tp_participants(user_id, cards_count)
    SELECT te.user_id, GREATEST(COALESCE(te.tickets_count, 1), 1)
    FROM public.tournament_entries te
    WHERE te.tournament_id = p_tournament_id
      AND te.status = 'created';
  ELSE
    INSERT INTO _tp_participants(user_id, cards_count)
    SELECT rw.user_id, GREATEST(COALESCE(te.tickets_count, 1), 1)
    FROM public.tournament_round_rooms trr
    JOIN public.room_winners rw ON rw.room_id = trr.room_id
    JOIN public.tournament_entries te
      ON te.tournament_id = p_tournament_id
     AND te.user_id = rw.user_id
    WHERE trr.tournament_id = p_tournament_id
      AND trr.round_no = v_curr_round
    GROUP BY rw.user_id, te.tickets_count;
  END IF;

  SELECT COUNT(*) INTO v_count_players FROM _tp_participants;

  IF v_curr_round > 0 AND v_count_players <= 1 THEN
    UPDATE public.tournaments
       SET status = 'finished'::public.tournament_status,
           updated_at = v_now
     WHERE id = p_tournament_id;

    PERFORM tournament.fn_payout_tournament(p_tournament_id);

    IF v_entry_currency <> 'DING' THEN
      FOR r_entry IN
        SELECT entry_id
        FROM public.tournament_commission_snapshots
        WHERE tournament_id = p_tournament_id
      LOOP
        PERFORM tournament.fn_commission_payout(p_tournament_id, r_entry.entry_id);
      END LOOP;

      PERFORM tournament.fn_settle_commission_payouts(p_tournament_id);
      PERFORM tournament.fn_capture_entry_locks(p_tournament_id);
    ELSE
      PERFORM tournament.fn_burn_ding_locks(p_tournament_id);
    END IF;

    -- P3_1_MARK_ENTRIES_SETTLED
    UPDATE public.tournament_entries
       SET status = 'settled'::public.tournament_entry_status
     WHERE tournament_id = p_tournament_id
       AND status = 'created'::public.tournament_entry_status;

    RETURN;
  END IF;

  IF v_count_players = 0 THEN
    RETURN;
  END IF;

  v_tables_needed := CEIL(v_count_players::numeric / v_table_max);
  IF v_tables_needed < 1 THEN v_tables_needed := 1; END IF;

  v_sizes := ARRAY[]::int[];
  DECLARE
    v_base int := v_count_players / v_tables_needed;
    v_rem  int := v_count_players % v_tables_needed;
  BEGIN
    FOR v_i IN 1..v_tables_needed LOOP
      v_sizes := v_sizes || (v_base + CASE WHEN v_i <= v_rem THEN 1 ELSE 0 END);
    END LOOP;
  END;

  v_trr_ids := ARRAY[]::uuid[];

  FOR v_i IN 1..array_length(v_sizes,1) LOOP
    DECLARE v_trr_id uuid;
    BEGIN
      INSERT INTO public.tournament_round_rooms(
        id, tournament_id, round_no, table_no,
        room_id, status, target_players, seated_players,
        meta, created_at
      ) VALUES (
        gen_random_uuid(), p_tournament_id, v_next_round, v_i,
        NULL, 'created', v_sizes[v_i], 0,
        jsonb_build_object(
          'generated_at', v_now,
          'seed', p_seed,
          'table_min', v_table_min,
          'table_max', v_table_max
        ),
        v_now
      )
      RETURNING id INTO v_trr_id;

      v_trr_ids := array_append(v_trr_ids, v_trr_id);
    END;
  END LOOP;

  CREATE TEMP TABLE _tp_ordered(
    rn int PRIMARY KEY,
    user_id uuid,
    cards_count int
  ) ON COMMIT DROP;

  INSERT INTO _tp_ordered(rn, user_id, cards_count)
  SELECT
    ROW_NUMBER() OVER (
      ORDER BY
      CASE
       WHEN p_seed IS NULL THEN random()::text
       ELSE md5(p_seed::text || ':' || p_tournament_id::text || ':' || p.user_id::text)
       END
    ),
    p.user_id,
    p.cards_count
  FROM _tp_participants p;

  v_idx := 1;
  FOR v_i IN 1..array_length(v_sizes,1) LOOP
    INSERT INTO public.tournament_round_assignments(
      tournament_id,
      round_no,
      trr_id,
      user_id,
      seed,
      created_at,
      cards_count
    )
    SELECT
      p_tournament_id,
      v_next_round,
      v_trr_ids[v_i],
      o.user_id,
      p_seed,
      v_now,
      o.cards_count
    FROM _tp_ordered o
    WHERE o.rn BETWEEN v_idx AND (v_idx + v_sizes[v_i] - 1);

    v_idx := v_idx + v_sizes[v_i];
  END LOOP;

  UPDATE public.tournaments
  SET updated_at = v_now
  WHERE id = p_tournament_id;

  RETURN;
END;$$;


--
-- Name: fn_payout_tournament("uuid"); Type: FUNCTION; Schema: tournament; Owner: -
--

CREATE FUNCTION "tournament"."fn_payout_tournament"("p_tournament_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'tournament', 'public', 'pg_temp'
    AS $$
DECLARE
  v_t               public.tournaments%rowtype;
  v_pool            numeric := 0;
  v_entries_total   numeric := 0;
  v_pool_from_comm  numeric := 0;
  v_pool_base       numeric := 0;
  v_last_round      int;
  v_rules_count     int;
  v_winners_count   int;
  v_currency        text;
  v_now             timestamptz := now();
  v_entries_players int := 0;
  v_min_players_for_guarantee int;
  v_effective_guarantee numeric := 0;
  v_entry_currency text;

  r_winner record;
  r_rule   record;
  r_pay    record;
  v_amount numeric;
BEGIN
  SELECT * INTO v_t
  FROM public.tournaments
  WHERE id = p_tournament_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'tournament not found: %', p_tournament_id;
  END IF;

  v_currency := COALESCE(v_t.currency, 'IRR');
  v_entry_currency := upper(coalesce(nullif(v_t.meta->>'entry_currency',''), v_t.currency, 'IRR'));

  SELECT COALESCE(sum(amount), 0)
    INTO v_entries_total
  FROM public.tournament_entries
  WHERE tournament_id = p_tournament_id
    AND status IN ('created', 'settled');

  SELECT count(distinct user_id)
    INTO v_entries_players
  FROM public.tournament_entries
  WHERE tournament_id = p_tournament_id
    AND status IN ('created', 'settled');

  v_min_players_for_guarantee := nullif(v_t.meta->>'min_players_for_guarantee','')::int;

  IF COALESCE(v_t.ticket_price, 0) > 0
     AND v_min_players_for_guarantee IS NOT NULL AND v_min_players_for_guarantee > 0
     AND v_entries_players < v_min_players_for_guarantee THEN
    v_effective_guarantee := 0;
  ELSE
    v_effective_guarantee := COALESCE(v_t.guaranteed_prize, 0);
  END IF;

  SELECT COALESCE(sum(amount_to_pool), 0)
    INTO v_pool_from_comm
  FROM public.tournament_commission_snapshots
  WHERE tournament_id = p_tournament_id;

  IF v_entry_currency = 'DING' THEN
    v_entries_total := 0;
    v_pool_from_comm := 0;
  END IF;

  v_pool_base := COALESCE(NULLIF(v_pool_from_comm, 0), v_entries_total);
  v_pool := GREATEST(COALESCE(v_effective_guarantee, 0), v_pool_base);

  SELECT COALESCE(max(round_no), 0)
    INTO v_last_round
  FROM public.tournament_round_rooms
  WHERE tournament_id = p_tournament_id;

  IF v_last_round = 0 THEN
    RAISE EXCEPTION 'no rounds found for tournament %', p_tournament_id;
  END IF;

  SELECT count(*) INTO v_winners_count
  FROM (
    SELECT rw.user_id
    FROM public.tournament_round_rooms trr
    JOIN public.room_winners rw ON rw.room_id = trr.room_id
    WHERE trr.tournament_id = p_tournament_id
      AND trr.round_no = v_last_round
    GROUP BY rw.user_id
  ) w;

  IF v_winners_count = 0 THEN
    RAISE EXCEPTION 'no winners found for tournament %', p_tournament_id;
  END IF;

  SELECT count(*) INTO v_rules_count
  FROM public.tournament_prize_rules
  WHERE tournament_id = p_tournament_id;

  IF NOT EXISTS (
    SELECT 1 FROM public.tournament_payouts WHERE tournament_id = p_tournament_id
  ) THEN
    IF v_rules_count = 0 THEN
      INSERT INTO public.tournament_payouts(
        tournament_id, user_id, rank, amount, status, created_at
      )
      SELECT p_tournament_id, w.user_id, 1, v_pool, 'pending', v_now
      FROM (
        SELECT rw.user_id, sum(rw.weight) as score
        FROM public.tournament_round_rooms trr
        JOIN public.room_winners rw ON rw.room_id = trr.room_id
        WHERE trr.tournament_id = p_tournament_id
          AND trr.round_no = v_last_round
        GROUP BY rw.user_id
        ORDER BY score desc, rw.user_id
        LIMIT 1
      ) w;
    ELSE
      FOR r_rule IN
        SELECT rank, payout_type, payout_value
        FROM public.tournament_prize_rules
        WHERE tournament_id = p_tournament_id
        ORDER BY rank
      LOOP
        FOR r_winner IN
          SELECT user_id
          FROM (
            SELECT rw.user_id, sum(rw.weight) as score
            FROM public.tournament_round_rooms trr
            JOIN public.room_winners rw ON rw.room_id = trr.room_id
            WHERE trr.tournament_id = p_tournament_id
              AND trr.round_no = v_last_round
            GROUP BY rw.user_id
          ) s
          ORDER BY score desc, user_id
          OFFSET (r_rule.rank - 1)
          LIMIT 1
        LOOP
          IF r_rule.payout_type = 'percent' THEN
            v_amount := v_pool * CASE
              WHEN r_rule.payout_value > 1 THEN r_rule.payout_value / 100
              ELSE r_rule.payout_value
            END;
          ELSE
            v_amount := r_rule.payout_value;
          END IF;

          INSERT INTO public.tournament_payouts(
            tournament_id, user_id, rank, amount, status, created_at
          ) VALUES (
            p_tournament_id, r_winner.user_id, r_rule.rank, v_amount, 'pending', v_now
          )
          ON CONFLICT DO NOTHING;
        END LOOP;
      END LOOP;
    END IF;
  END IF;

  FOR r_pay IN
    SELECT id, user_id, amount
    FROM public.tournament_payouts
    WHERE tournament_id = p_tournament_id
      AND status = 'pending'
    FOR UPDATE
  LOOP
    PERFORM game_finance.fn_wallet_apply_delta(
      p_user_id := r_pay.user_id,
      p_currency := v_currency,
      p_amount_delta := r_pay.amount,
      p_transaction_type := 'win',
      p_source_kind := 'tournament_prize',
      p_source_ref := p_tournament_id::text,
      p_description := 'tournament prize payout',
      p_meta := jsonb_build_object('tournament_id', p_tournament_id, 'payout_id', r_pay.id),
      p_allow_negative := false
    );

    UPDATE public.tournament_payouts
       SET status = 'paid',
           paid_at = v_now
     WHERE id = r_pay.id;
  END LOOP;

  RETURN;
END;
$$;


--
-- Name: fn_pick_admin_user("uuid"); Type: FUNCTION; Schema: tournament; Owner: -
--

CREATE FUNCTION "tournament"."fn_pick_admin_user"("p_admin_user" "uuid" DEFAULT NULL::"uuid") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE v_admin uuid;
BEGIN
  IF p_admin_user IS NOT NULL THEN
    SELECT u.id INTO v_admin
    FROM public.users u
    WHERE u.id = p_admin_user
      AND u.role = 'admin'
      AND (u.status IS NULL OR u.status = 'active'::public.user_status)
    LIMIT 1;
  END IF;

  IF v_admin IS NULL THEN
    SELECT u.id INTO v_admin
    FROM public.users u
    WHERE u.role = 'admin'
      AND u.admin_sub_role IS NULL
      AND (u.status IS NULL OR u.status = 'active'::public.user_status)
    ORDER BY u.created_at
    LIMIT 1;
  END IF;

  IF v_admin IS NULL THEN
    SELECT u.id INTO v_admin
    FROM public.users u
    WHERE u.role = 'admin'
      AND (u.status IS NULL OR u.status = 'active'::public.user_status)
    ORDER BY u.created_at
    LIMIT 1;
  END IF;

  IF v_admin IS NULL THEN
    RAISE EXCEPTION 'no admin user available';
  END IF;

  RETURN v_admin;
END;
$$;


--
-- Name: fn_seat_players_for_round("uuid", integer, integer); Type: FUNCTION; Schema: tournament; Owner: -
--

CREATE FUNCTION "tournament"."fn_seat_players_for_round"("p_tournament_id" "uuid", "p_round_no" integer, "p_batch_tables" integer DEFAULT 50) RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$DECLARE
  v_now timestamptz := now();

  r_trr RECORD;
  r_ass RECORD;

  v_template_id uuid;
  v_password text;

  v_room_id uuid;
  v_starts_at timestamptz;
  v_ticket_ids uuid[];

  v_waiting_room_id uuid;

  v_target int;
  v_seated int;

  v_existing_cards int;
  v_need_cards int;

  -- preserve caller context
  v_prev_sub  text := current_setting('request.jwt.claim.sub', true);
  v_prev_role text := current_setting('request.jwt.claim.role', true);
BEGIN
  -- lock tournament row to avoid concurrent orchestrators stepping on each other
  PERFORM 1
  FROM public.tournaments t
  WHERE t.id = p_tournament_id
  FOR UPDATE;

  RAISE NOTICE '[seat] start tournament=% round=% batch=% prev_sub=% prev_role=% auth.uid=% auth.role=%',
    p_tournament_id, p_round_no, p_batch_tables, v_prev_sub, v_prev_role, auth.uid(), auth.role();

  -- process each table in this round that still needs seating
  FOR r_trr IN
    SELECT trr.*
    FROM public.tournament_round_rooms trr
    WHERE trr.tournament_id = p_tournament_id
      AND trr.round_no = p_round_no
      AND (COALESCE(trr.target_players, 0) > COALESCE(trr.seated_players, 0) OR trr.room_id IS NULL)
    ORDER BY trr.table_no
    LIMIT p_batch_tables
    FOR UPDATE SKIP LOCKED
  LOOP
    v_target := COALESCE(r_trr.target_players, 0);
    v_seated := COALESCE(r_trr.seated_players, 0);

    RAISE NOTICE '[seat] TRR table_no=% trr_id=% real_room_id=% target=% seated=%',
      r_trr.table_no, r_trr.id, r_trr.room_id, v_target, v_seated;

    -- ensure per-table template (channel isolation)
    SELECT t.template_id, t.template_password
      INTO v_template_id, v_password
    FROM tournament.fn_create_or_get_table_template(p_tournament_id, p_round_no, r_trr.table_no) t;

    RAISE NOTICE '[seat] table_no=% template_id=% has_password=%',
      r_trr.table_no, v_template_id, (v_password IS NOT NULL);

    -- find current waiting room for this template (if any)
    SELECT r.id
      INTO v_waiting_room_id
    FROM public.rooms r
    WHERE r.room_template_id = v_template_id
      AND r.status = 'waiting'
    ORDER BY r.created_at ASC
    LIMIT 1;

    RAISE NOTICE '[seat] existing waiting room for template=% => %',
      v_template_id, v_waiting_room_id;

    -- IMPORTANT DEBUG: how many assignments match this table?
    RAISE NOTICE '[seat] assignments matched for trr_id=% => %',
      r_trr.id,
      (SELECT COUNT(*)
       FROM public.tournament_round_assignments tra
       WHERE tra.tournament_id = p_tournament_id
         AND tra.round_no = p_round_no
         AND tra.room_id = r_trr.id);

    -- iterate assignments belonging to THIS table (remember: assignments.room_id = trr.id is virtual)
    FOR r_ass IN
      SELECT tra.user_id, COALESCE(tra.cards_count, 1) AS cards_count
      FROM public.tournament_round_assignments tra
      WHERE tra.tournament_id = p_tournament_id
        AND tra.round_no = p_round_no
        AND tra.room_id = r_trr.id
      ORDER BY tra.user_id
    LOOP
      EXIT WHEN (v_target > 0 AND v_seated >= v_target);

      RAISE NOTICE '[seat] considering user=% cards_count=% (target=% seated=%)',
        r_ass.user_id, r_ass.cards_count, v_target, v_seated;

      -- If we already have a waiting room, check how many cards this user already has there
      v_existing_cards := 0;
      IF v_waiting_room_id IS NOT NULL THEN
        SELECT COUNT(*)
          INTO v_existing_cards
        FROM public.tickets t
        WHERE t.room_id = v_waiting_room_id
          AND t.player_user_id = r_ass.user_id
          AND t.reservation_status IN ('reserved','confirmed','consumed');
      END IF;

      v_need_cards := GREATEST(r_ass.cards_count - v_existing_cards, 0);

      RAISE NOTICE '[seat] user=% existing_cards=% need_cards=% waiting_room_id=%',
        r_ass.user_id, v_existing_cards, v_need_cards, v_waiting_room_id;

      -- already fully seated for this room
      IF v_need_cards = 0 THEN
        RAISE NOTICE '[seat] user=% already has enough cards; skip', r_ass.user_id;
        CONTINUE;
      END IF;

      -- impersonate this player so auth.uid() inside join fn equals r_ass.user_id
      PERFORM set_config('request.jwt.claim.sub', r_ass.user_id::text, true);
      PERFORM set_config('request.jwt.claim.role', 'authenticated', true);

      RAISE NOTICE '[seat] impersonated user=% auth.uid now=% auth.role now=%',
        r_ass.user_id, auth.uid(), auth.role();

      -- call EXISTING join function (do NOT create rooms manually)
      BEGIN
        SELECT x.room_id, x.starts_at, x.ticket_ids
          INTO v_room_id, v_starts_at, v_ticket_ids
        FROM public.fn_join_or_create_room_base(v_template_id, v_need_cards, v_password) AS x;

        RAISE NOTICE '[seat] join ok user=% -> room_id=% starts_at=% tickets=%',
          r_ass.user_id, v_room_id, v_starts_at, COALESCE(array_length(v_ticket_ids, 1), 0);

      EXCEPTION WHEN others THEN
        -- This is the money line for debugging: you will SEE the real reason
        RAISE NOTICE '[seat] join FAILED user=% template=% need_cards=% has_password=% err=%',
          r_ass.user_id, v_template_id, v_need_cards, (v_password IS NOT NULL), SQLERRM;
        -- keep going to seat the rest
        CONTINUE;
      END;

      -- after first join, lock onto the actual room id
      IF v_waiting_room_id IS NULL THEN
        v_waiting_room_id := v_room_id;
        RAISE NOTICE '[seat] locked waiting_room_id=%', v_waiting_room_id;
      END IF;

      -- write room_id back to trr once (room_id is REAL public.rooms.id)
      IF r_trr.room_id IS NULL THEN
        UPDATE public.tournament_round_rooms
           SET room_id = v_room_id,
               updated_at = v_now
         WHERE id = r_trr.id;

        r_trr.room_id := v_room_id;

        RAISE NOTICE '[seat] updated TRR real room_id=%', v_room_id;
      END IF;

      -- increment seated players (distinct users) when they get their first cards in this table-room
      v_seated := v_seated + 1;

      UPDATE public.tournament_round_rooms
         SET seated_players = v_seated,
             updated_at = v_now
       WHERE id = r_trr.id;

      RAISE NOTICE '[seat] seated_players incremented => % (target=%)', v_seated, v_target;

      -- refresh capacity guard
      EXIT WHEN (v_target > 0 AND v_seated >= v_target);
    END LOOP;

    -- final reconciliation: count distinct players actually in room and clamp
    IF r_trr.room_id IS NOT NULL THEN
      SELECT COUNT(DISTINCT t.player_user_id)
        INTO v_seated
      FROM public.tickets t
      WHERE t.room_id = r_trr.room_id
        AND t.reservation_status IN ('reserved','confirmed','consumed');

      UPDATE public.tournament_round_rooms
         SET seated_players = CASE
                               WHEN v_target > 0 THEN LEAST(v_seated, v_target)
                               ELSE v_seated
                             END,
             updated_at = v_now
       WHERE id = r_trr.id;

      RAISE NOTICE '[seat] reconciled seated_players=% for room_id=%', v_seated, r_trr.room_id;
    ELSE
      RAISE NOTICE '[seat] TRR has no real room_id yet (no successful joins?) trr_id=%', r_trr.id;
    END IF;
  END LOOP;

  -- restore jwt claims
  PERFORM set_config('request.jwt.claim.sub', COALESCE(v_prev_sub,''), true);
  PERFORM set_config('request.jwt.claim.role', COALESCE(v_prev_role,''), true);

  RAISE NOTICE '[seat] done tournament=% round=%', p_tournament_id, p_round_no;
  RETURN;

EXCEPTION
  WHEN others THEN
    -- try to restore claims on error too
    PERFORM set_config('request.jwt.claim.sub', COALESCE(v_prev_sub,''), true);
    PERFORM set_config('request.jwt.claim.role', COALESCE(v_prev_role,''), true);
    RAISE;
END;$$;


--
-- Name: fn_seat_table_players("uuid", integer, integer); Type: FUNCTION; Schema: tournament; Owner: -
--

CREATE FUNCTION "tournament"."fn_seat_table_players"("p_tournament_id" "uuid", "p_round_no" integer, "p_table_no" integer) RETURNS "void"
    LANGUAGE "plpgsql"
    AS $$
DECLARE
  v_trr         public.tournament_round_rooms%rowtype;

  v_template_id uuid;
  v_room_id     uuid;
  v_password    text := NULL;

  r_assign      record;

  v_ctx         text;
  v_detail      text;
  v_hint        text;
BEGIN
  -- 1) Lock فقط روی میز/راند (نه کل تورنومنت)
  BEGIN
    SELECT *
      INTO v_trr
    FROM public.tournament_round_rooms trr
    WHERE trr.tournament_id = p_tournament_id
      AND trr.round_no      = p_round_no
      AND trr.table_no      = p_table_no
    FOR UPDATE NOWAIT;

  EXCEPTION
    WHEN lock_not_available THEN
      -- یک tick دیگر دوباره تلاش می‌کند
      RETURN;
  END;

  IF NOT FOUND THEN
    RETURN;
  END IF;

  v_template_id := v_trr.room_template_id;

  -- Template هنوز assign نشده → فعلاً seat نکن
  IF v_template_id IS NULL THEN
    RETURN;
  END IF;

  -- 2) قبل از join واقعی: cards_count هر پلیر را قطعی کن (از entries)
  UPDATE public.tournament_round_assignments a
     SET cards_count = GREATEST(COALESCE(e.tickets_count, 1), 1)
  FROM public.tournament_entries e
  WHERE a.tournament_id = p_tournament_id
    AND a.round_no      = p_round_no
    AND e.tournament_id = a.tournament_id
    AND e.user_id       = a.user_id
    AND a.trr_id        = v_trr.id;

  -- 3) guardrail: اگر جایی cards_count هنوز null است حداقل 1
  UPDATE public.tournament_round_assignments a
     SET cards_count = GREATEST(COALESCE(a.cards_count, 1), 1)
  WHERE a.tournament_id = p_tournament_id
    AND a.round_no      = p_round_no
    AND a.trr_id        = v_trr.id
    AND a.cards_count IS NULL;

  -- 4) Join واقعی برای تک‌تک پلیرهای این میز (سیستمی)
  v_room_id := v_trr.room_id;

  FOR r_assign IN
    SELECT a.user_id, a.cards_count
    FROM public.tournament_round_assignments a
    WHERE a.tournament_id = p_tournament_id
      AND a.round_no      = p_round_no
      AND a.trr_id        = v_trr.id
    ORDER BY a.user_id
  LOOP
    -- idempotency: اگر این کاربر قبلاً کارت‌هایش را در این روم گرفته، دوباره join نکن
    IF v_trr.room_id IS NOT NULL THEN
      IF (
        SELECT COUNT(*)
        FROM public.tickets t
        WHERE t.room_id = v_trr.room_id
          AND t.player_user_id = r_assign.user_id
          AND t.reservation_status IN ('reserved','confirmed','consumed')
      ) >= r_assign.cards_count THEN
        CONTINUE;
      END IF;
    END IF;

    BEGIN
      -- این تابع باید SECURITY DEFINER + service_role only باشد
      SELECT j.room_id
        INTO v_room_id
      FROM game_core.fn_system_join_or_create_room(
        p_user_id     := r_assign.user_id,
        p_template_id := v_template_id,
        p_card_count  := r_assign.cards_count,
        p_password    := v_password
      ) AS j
      LIMIT 1;

    EXCEPTION WHEN others THEN
      GET STACKED DIAGNOSTICS
        v_ctx    = PG_EXCEPTION_CONTEXT,
        v_detail = PG_EXCEPTION_DETAIL,
        v_hint   = PG_EXCEPTION_HINT;

      INSERT INTO tournament.tournament_tick_log(tournament_id, stage, sqlstate, message, context)
      VALUES (
        p_tournament_id,
        'fn_seat_table_players:system_join',
        SQLSTATE,
        SQLERRM
          || COALESCE(' | detail=' || v_detail, '')
          || COALESCE(' | hint='   || v_hint, ''),
        v_ctx
      );

      -- Fail fast: اگر join یکی شکست بخورد، همین میز را fail می‌کنیم
      RAISE;
    END;

    IF v_room_id IS NULL THEN
      RAISE EXCEPTION
        'system_join returned null room_id (tournament %, round %, table %, user %)',
        p_tournament_id, p_round_no, p_table_no, r_assign.user_id;
    END IF;

    -- اولین join که انجام شد، room_id را روی trr ثبت کن (اگر قبلاً ثبت نشده)
    IF v_trr.room_id IS NULL THEN
      UPDATE public.tournament_round_rooms
         SET room_id    = v_room_id,
             status     = 'running'::public.tournament_round_room_status,
             updated_at = now(),
             meta = COALESCE(meta, '{}'::jsonb) || jsonb_build_object(
               'room_created_at', now(),
               'room_id', v_room_id
             )
       WHERE id = v_trr.id;

      v_trr.room_id := v_room_id;
    END IF;
  END LOOP;

  -- 5) اتصال assignmentها به room (truth برای UI/دیباگ)
  IF v_trr.room_id IS NOT NULL THEN
    UPDATE public.tournament_round_assignments a
       SET room_id      = v_trr.room_id,
           game_room_id = v_trr.room_id
     WHERE a.tournament_id = p_tournament_id
       AND a.round_no      = p_round_no
       AND a.trr_id        = v_trr.id;
  END IF;

  RETURN;
END;
$$;


--
-- Name: fn_settle_commission_payouts("uuid"); Type: FUNCTION; Schema: tournament; Owner: -
--

CREATE FUNCTION "tournament"."fn_settle_commission_payouts"("p_tournament_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'tournament', 'public', 'pg_temp'
    AS $$
DECLARE
  r_pay record;
  v_now timestamptz := now();
BEGIN
  FOR r_pay IN
    SELECT id, beneficiary_user_id, amount, currency
    FROM public.tournament_commission_payouts
    WHERE tournament_id = p_tournament_id
      AND status = 'pending'
      AND amount > 0
      AND role IN ('admin', 'agent', 'super')
    FOR UPDATE SKIP LOCKED
  LOOP
    PERFORM game_finance.fn_wallet_apply_delta(
      p_user_id := r_pay.beneficiary_user_id,
      p_currency := r_pay.currency,
      p_amount_delta := r_pay.amount,
      p_transaction_type := 'win',
      p_source_kind := 'tournament_commission',
      p_source_ref := p_tournament_id::text,
      p_description := 'tournament commission payout',
      p_meta := jsonb_build_object('tournament_id', p_tournament_id, 'payout_id', r_pay.id),
      p_allow_negative := false
    );

    UPDATE public.tournament_commission_payouts
       SET status = 'paid',
           paid_at = v_now
     WHERE id = r_pay.id;
  END LOOP;

  RETURN;
END;
$$;


--
-- Name: fn_tick_due_tournaments(integer, bigint, integer); Type: FUNCTION; Schema: tournament; Owner: -
--

CREATE FUNCTION "tournament"."fn_tick_due_tournaments"("p_limit" integer DEFAULT 50, "p_seed" bigint DEFAULT NULL::bigint, "p_batch_tables" integer DEFAULT NULL::integer) RETURNS integer
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'tournament', 'public', 'pg_temp'
    AS $$
DECLARE
  r record;
  v_count int := 0;
  v_entries_players int;
  v_min_players int;
  v_extend_minutes int;
  v_ctx    text;
  v_detail text;
  v_hint   text;
BEGIN
  FOR r IN
    SELECT
      t.id,
      t.status,
      GREATEST(COALESCE(NULLIF(t.meta->>'min_players_to_start','')::int, 3), 3) AS min_players_to_start,
      LEAST(
        GREATEST(COALESCE(NULLIF(t.meta->>'registration_extend_minutes','')::int, 60), 1),
        10080
      ) AS registration_extend_minutes
    FROM public.tournaments t
    WHERE
      (t.status = 'registration_open'::public.tournament_status
       AND t.start_at IS NOT NULL
       AND t.start_at <= now())
      OR
      (t.status = 'running'::public.tournament_status)
    ORDER BY t.start_at NULLS LAST, t.created_at
    LIMIT p_limit
  LOOP
    BEGIN
      IF r.status = 'registration_open'::public.tournament_status THEN
        v_min_players := COALESCE(r.min_players_to_start, 3);
        v_extend_minutes := COALESCE(r.registration_extend_minutes, 60);

        SELECT count(DISTINCT te.user_id)
          INTO v_entries_players
        FROM public.tournament_entries te
        WHERE te.tournament_id = r.id
          AND te.status = 'created';

        IF COALESCE(v_entries_players, 0) < v_min_players THEN
          UPDATE public.tournaments
             SET start_at = now() + make_interval(mins => v_extend_minutes),
                 updated_at = now()
           WHERE id = r.id
             AND status = 'registration_open'::public.tournament_status;
          CONTINUE;
        END IF;
      END IF;

      PERFORM tournament.fn_tick_tournament(
        p_tournament_id := r.id,
        p_seed          := p_seed::bigint,
        p_batch_tables  := CASE
                             WHEN p_batch_tables IS NULL THEN NULL::integer[]
                             ELSE ARRAY[p_batch_tables::integer]
                           END
      );

      v_count := v_count + 1;

    EXCEPTION
      WHEN lock_not_available THEN
        CONTINUE;

      WHEN others THEN
        GET STACKED DIAGNOSTICS
          v_ctx    = PG_EXCEPTION_CONTEXT,
          v_detail = PG_EXCEPTION_DETAIL,
          v_hint   = PG_EXCEPTION_HINT;

        INSERT INTO tournament.tournament_tick_log(tournament_id, stage, sqlstate, message, context)
        VALUES (
          r.id,
          'fn_tick_tournament',
          SQLSTATE,
          SQLERRM
            || COALESCE(' | detail=' || v_detail, '')
            || COALESCE(' | hint='   || v_hint, ''),
          v_ctx
        );

        CONTINUE;
    END;
  END LOOP;

  RETURN v_count;
END;
$$;


--
-- Name: fn_tick_tournament("uuid", bigint, integer[]); Type: FUNCTION; Schema: tournament; Owner: -
--

CREATE FUNCTION "tournament"."fn_tick_tournament"("p_tournament_id" "uuid", "p_seed" bigint DEFAULT NULL::bigint, "p_batch_tables" integer[] DEFAULT NULL::integer[]) RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'tournament', 'public', 'pg_temp'
    AS $$
declare
  v_now timestamptz := now();
  v_t   public.tournaments%rowtype;

  v_curr_round int;
  v_last_round_finished boolean;
  v_has_rounds boolean;

  v_table_no integer;
  v_entries_count int := 0;
begin
  -- 1) قفل کردن تورنومنت (برای جلوگیری از اجرای همزمان)
  select *
    into v_t
  from public.tournaments
  where id = p_tournament_id
  for update nowait;

  if not found then
    raise exception 'tournament not found: %', p_tournament_id;
  end if;

  -- 2) شرط شروع: registration_open → running وقتی start_at رسیده
  if v_t.status = 'registration_open'::public.tournament_status then
    if v_t.start_at is null or v_t.start_at <= v_now then
      select count(*)
        into v_entries_count
      from public.tournament_entries
      where tournament_id = p_tournament_id
        and status = 'created';

      if v_entries_count = 0 then
        update public.tournaments
           set start_at  = v_now + interval '1 hour',
               updated_at = v_now
         where id = p_tournament_id;
        return;
      end if;

      update public.tournaments
         set status     = 'running'::public.tournament_status,
             updated_at = v_now
       where id = p_tournament_id;

      v_t.status := 'running'::public.tournament_status;
    else
      return;
    end if;
  end if;

  -- فقط تورنومنت‌های running را ادامه می‌دهیم
  if v_t.status <> 'running'::public.tournament_status then
    return;
  end if;

  -- 3) همگام‌سازی وضعیت round_rooms با وضعیت room واقعی (best-effort)
  update public.tournament_round_rooms trr
     set status = case
                   when r.status = 'finished'
                     then 'finished'::public.tournament_round_room_status
                   when r.status in ('playing','live','settling')
                     then 'running'::public.tournament_round_room_status
                   when r.status = 'waiting'
                     then trr.status
                   else trr.status
                  end
  from public.rooms r
  where trr.tournament_id = p_tournament_id
    and trr.room_id is not null
    and trr.room_id = r.id;

  -- 4) اگر هنوز هیچ راندی ساخته نشده، راند ۱ را بساز
  select coalesce(max(round_no), 0)
    into v_curr_round
  from public.tournament_round_rooms
  where tournament_id = p_tournament_id;

  v_has_rounds := (v_curr_round > 0);

  if not v_has_rounds then
    perform tournament.fn_manage_tournament_cycle(p_tournament_id, p_seed);

    select coalesce(max(round_no), 0)
      into v_curr_round
    from public.tournament_round_rooms
    where tournament_id = p_tournament_id;
  end if;

  if v_curr_round = 0 then
    return;
  end if;

  -- 5a) تخصیص تمپلیت برای میزهای این راند (batch-aware)
  perform tournament.fn_assign_templates_for_round(
    p_tournament_id := p_tournament_id,
    p_round_no      := v_curr_round,
    p_batch_tables  := p_batch_tables
  );

  -- 5b) نشاندن بازیکن‌ها: batch-aware ولی با امضای واقعی seat_table_players(table_no)
  for v_table_no in
    select trr.table_no
    from public.tournament_round_rooms trr
    where trr.tournament_id = p_tournament_id
      and trr.round_no      = v_curr_round
      and (p_batch_tables is null or trr.table_no = any(p_batch_tables))
    order by trr.table_no
  loop
    perform tournament.fn_seat_table_players(
      p_tournament_id := p_tournament_id,
      p_round_no      := v_curr_round,
      p_table_no      := v_table_no
    );
  end loop;

  -- 5c) اگر روم‌ها waiting هستند و starts_at ندارند، شروع را زمان‌بندی کن
  update public.rooms r
     set starts_at = v_now + make_interval(secs => r.countdown_sec),
         updated_at = v_now
    from public.tournament_round_rooms trr
   where trr.tournament_id = p_tournament_id
     and trr.round_no      = v_curr_round
     and trr.room_id       = r.id
     and r.status          = 'waiting'::public.room_status
     and r.starts_at is null;

  -- 6) پایان راند: فقط میزهایی را تمام‌شده حساب می‌کنیم که room ساخته‌اند
  select not exists (
           select 1
           from public.tournament_round_rooms trr
           join public.rooms r on r.id = trr.room_id
           where trr.tournament_id = p_tournament_id
             and trr.round_no      = v_curr_round
             and trr.room_id is not null
             and r.status <> 'finished'
         )
    into v_last_round_finished;

  if v_last_round_finished then
    perform tournament.fn_manage_tournament_cycle(p_tournament_id, p_seed);
  end if;

  return;
end;
$$;


--
-- Name: fn_tick_tournament_batch("uuid", "text", integer[]); Type: FUNCTION; Schema: tournament; Owner: -
--

CREATE FUNCTION "tournament"."fn_tick_tournament_batch"("p_tournament_id" "uuid", "p_seed" "text" DEFAULT NULL::"text", "p_batch_tables" integer[] DEFAULT NULL::integer[]) RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
declare
  v_now timestamptz := now();
  v_t   public.tournaments%rowtype;

  v_curr_round int;
  v_last_round_finished boolean;
  v_has_rounds boolean;
begin
  -- 1) قفل کردن تورنومنت (برای جلوگیری از اجرای همزمان)
  select *
    into v_t
  from public.tournaments
  where id = p_tournament_id
  for update nowait;

  if not found then
    raise exception 'tournament not found: %', p_tournament_id;
  end if;

  -- 2) شرط شروع: registration_open → running وقتی start_at رسیده
  if v_t.status = 'registration_open'::public.tournament_status then
    if v_t.start_at is null or v_t.start_at <= v_now then
      update public.tournaments
         set status     = 'running'::public.tournament_status,
             updated_at = v_now
       where id = p_tournament_id;

      v_t.status := 'running'::public.tournament_status;
    else
      -- هنوز زمانش نرسیده
      return;
    end if;
  end if;

  -- فقط تورنومنت‌های running را ادامه می‌دهیم
  if v_t.status <> 'running'::public.tournament_status then
    return;
  end if;

  -- 3) همگام‌سازی وضعیت round_rooms با وضعیت room واقعی (best-effort)
  -- در معماری جدید ممکن است trr.room_id هنوز null باشد (کاملاً طبیعی)
  update public.tournament_round_rooms trr
     set status = case
                   when r.status = 'finished'
                     then 'finished'::public.tournament_round_room_status
                   when r.status in ('playing','live','settling')
                     then 'running'::public.tournament_round_room_status
                   when r.status = 'waiting'
                     then trr.status  -- یا اگر دوست داری: 'created' / 'seating'
                   else trr.status
                  end
  from public.rooms r
  where trr.tournament_id = p_tournament_id
    and trr.room_id is not null
    and trr.room_id = r.id;

  -- 4) اگر هنوز هیچ راندی ساخته نشده، راند ۱ را بساز
  select coalesce(max(round_no), 0)
    into v_curr_round
  from public.tournament_round_rooms
  where tournament_id = p_tournament_id;

  v_has_rounds := (v_curr_round > 0);

  if not v_has_rounds then
    -- ساخت راند ۱ و assignments (idempotent)
    perform tournament.fn_manage_tournament_cycle(p_tournament_id, p_seed);

    select coalesce(max(round_no), 0)
      into v_curr_round
    from public.tournament_round_rooms
    where tournament_id = p_tournament_id;
  end if;

  if v_curr_round = 0 then
    -- مثلاً هیچ ثبت‌نامی وجود ندارد
    return;
  end if;

  /*
    5) معماری جدید (Template-first / Room-late)
    5a) اول به هر table تمپلیت بده (یا تایید کن که دارد) - idempotent
    5b) سپس بازیکن‌ها را به میزها "push" کن با استفاده از fn_join_or_create_room
        (این کار داخل fn_seat_table_players انجام می‌شود)
  */

  -- 5a) تخصیص/انتخاب تمپلیت برای میزهای این راند
  perform tournament.fn_assign_templates_for_round(
    p_tournament_id := p_tournament_id,
    p_round_no      := v_curr_round,
    p_batch_tables  := p_batch_tables
  );

  -- 5b) نشاندن بازیکن‌ها (این تابع باید خودش join_or_create_room را صدا بزند)
  perform tournament.fn_seat_table_players(
    p_tournament_id := p_tournament_id,
    p_round_no      := v_curr_round,
    p_batch_tables  := p_batch_tables
  );

  /*
    6) پایان راند:
    نسخه‌ی safe و ساده:
    فقط میزهایی را "بازی‌شده" حساب می‌کنیم که room ساخته‌اند.
    (اگر سیاست no-show/cancel داری، بعداً این شرط را کامل‌تر می‌کنیم)
  */
  select not exists (
           select 1
           from public.tournament_round_rooms trr
           join public.rooms r on r.id = trr.room_id
           where trr.tournament_id = p_tournament_id
             and trr.round_no      = v_curr_round
             and trr.room_id is not null
             and r.status <> 'finished'
         )
    into v_last_round_finished;

  if v_last_round_finished then
    -- winners → next round rooms + assignments (idempotent)
    perform tournament.fn_manage_tournament_cycle(p_tournament_id, p_seed);
  end if;

  return;
end;
$$;


--
-- Name: fn_touch_commission_snapshot_at("uuid"); Type: FUNCTION; Schema: tournament; Owner: -
--

CREATE FUNCTION "tournament"."fn_touch_commission_snapshot_at"("p_tournament_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'tournament', 'public', 'pg_temp'
    AS $$
BEGIN
  UPDATE public.tournaments
     SET commission_snapshot_at = COALESCE(commission_snapshot_at, now())
   WHERE id = p_tournament_id
     AND commission_snapshot_at IS NULL
     AND EXISTS (
       SELECT 1
       FROM public.tournament_commission_snapshots s
       WHERE s.tournament_id = p_tournament_id
     );
END;
$$;


--
-- Name: fn_wallet_capture_join("uuid", "uuid", numeric, "text"); Type: FUNCTION; Schema: tournament; Owner: -
--

CREATE FUNCTION "tournament"."fn_wallet_capture_join"("p_tournament_id" "uuid", "p_entry_id" "uuid", "p_amount" numeric, "p_currency" "text") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'tournament', 'public', 'game_finance'
    AS $$
DECLARE
  v_user uuid;
  v_wallet uuid;
  v_locked numeric;
  v_tx uuid;
BEGIN
  v_user := auth.uid();
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'unauthenticated';
  END IF;
  IF p_amount <= 0 THEN
    RAISE EXCEPTION 'amount must be positive';
  END IF;

  SELECT id, locked_amount
    INTO v_wallet, v_locked
  FROM public.wallets
  WHERE user_id = v_user
    AND currency = p_currency
  FOR UPDATE;

  IF v_wallet IS NULL THEN
    RAISE EXCEPTION 'wallet not found for user %', v_user;
  END IF;
  IF v_locked < p_amount THEN
    RAISE EXCEPTION 'insufficient locked balance';
  END IF;

  SELECT game_finance.fn_wallet_apply_delta(
           p_user_id          := v_user,
           p_currency         := p_currency,
           p_amount_delta     := 0, -- only log capture; locked move handled below
           p_transaction_type := 'join_capture',
           p_source_kind      := 'tournament_join',
           p_source_ref       := p_tournament_id::text,
           p_description      := 'capture tournament join',
           p_meta             := jsonb_build_object(
                                   'tournament_id', p_tournament_id,
                                   'entry_id', p_entry_id
                                 ),
           p_allow_negative   := false
         )
    INTO v_tx;

  UPDATE public.wallets
     SET locked_amount = locked_amount - p_amount,
         updated_at    = now()
   WHERE id = v_wallet;

  RETURN v_tx;
END;
$$;


--
-- Name: get_my_registration("uuid"); Type: FUNCTION; Schema: tournament; Owner: -
--

CREATE FUNCTION "tournament"."get_my_registration"("p_tournament_id" "uuid") RETURNS "public"."tournament_entries"
    LANGUAGE "sql" SECURITY DEFINER
    AS $$
  SELECT *
  FROM public.tournament_entries
  WHERE tournament_id = p_tournament_id
    AND user_id = auth.uid()
  LIMIT 1;
$$;


--
-- Name: open_registration("uuid"); Type: FUNCTION; Schema: tournament; Owner: -
--

CREATE FUNCTION "tournament"."open_registration"("p_tournament_id" "uuid") RETURNS "public"."tournaments"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
  v_row public.tournaments;
BEGIN
  -- TODO: replace with your real admin check (examples):
  -- IF NOT public.is_admin(auth.uid()) THEN RAISE EXCEPTION 'FORBIDDEN'; END IF;

  UPDATE public.tournaments
  SET status = 'registration_open'::public.tournament_status
  WHERE id = p_tournament_id
    AND status IN ('draft'::public.tournament_status);

  SELECT * INTO v_row FROM public.tournaments WHERE id = p_tournament_id;

  IF v_row.id IS NULL THEN
    RAISE EXCEPTION 'TOURNAMENT_NOT_FOUND';
  END IF;

  RETURN v_row;
END $$;


--
-- Name: release_entry_locks("uuid"); Type: FUNCTION; Schema: tournament; Owner: -
--

CREATE FUNCTION "tournament"."release_entry_locks"("p_tournament_id" "uuid") RETURNS integer
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
  v_count int;
BEGIN
  -- TODO: add your real admin check (platform-only)

  PERFORM tournament._assert_status(p_tournament_id, ARRAY['cancelled'::public.tournament_status,'draft'::public.tournament_status,'registration_open'::public.tournament_status]);

  UPDATE public.tournament_locks
  SET status = 'released',
      released_at = COALESCE(released_at, now()),
      updated_at = now()
  WHERE tournament_id = p_tournament_id
    AND lock_kind = 'entry'
    AND status = 'held';

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END $$;


--
-- Name: tournament_locks; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."tournament_locks" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tournament_id" "uuid" NOT NULL,
    "entry_id" "uuid",
    "owner_user_id" "uuid" NOT NULL,
    "wallet_id" "uuid",
    "lock_kind" "text" NOT NULL,
    "status" "text" NOT NULL,
    "amount" numeric(14,2) NOT NULL,
    "idempotency_key" "text",
    "meta" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "released_at" timestamp with time zone,
    "captured_at" timestamp with time zone,
    CONSTRAINT "tournament_locks_amount_check" CHECK (("amount" >= (0)::numeric)),
    CONSTRAINT "tournament_locks_lock_kind_check" CHECK (("lock_kind" = ANY (ARRAY['entry'::"text", 'guarantee'::"text", 'sponsor_topup'::"text"]))),
    CONSTRAINT "tournament_locks_status_check" CHECK (("status" = ANY (ARRAY['held'::"text", 'captured'::"text", 'released'::"text"])))
);


--
-- Name: sync_my_entry_lock("uuid"); Type: FUNCTION; Schema: tournament; Owner: -
--

CREATE FUNCTION "tournament"."sync_my_entry_lock"("p_tournament_id" "uuid") RETURNS "public"."tournament_locks"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_entry public.tournament_entries;
  v_lock public.tournament_locks;
  v_key text;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'UNAUTHENTICATED'; END IF;

  PERFORM tournament._assert_status(p_tournament_id, ARRAY['registration_open'::public.tournament_status]);

  SELECT * INTO v_entry
  FROM public.tournament_entries
  WHERE tournament_id = p_tournament_id
    AND user_id = v_uid
    AND status = 'created'::public.tournament_entry_status
  FOR UPDATE;

  IF v_entry.id IS NULL THEN
    RAISE EXCEPTION 'ENTRY_NOT_FOUND_OR_NOT_ACTIVE';
  END IF;

  v_key := 'entry:' || v_entry.id::text;

  -- lock row
  SELECT * INTO v_lock
  FROM public.tournament_locks
  WHERE tournament_id = p_tournament_id
    AND idempotency_key = v_key
  FOR UPDATE;

  IF v_lock.id IS NULL THEN
    INSERT INTO public.tournament_locks (
      tournament_id, entry_id, owner_user_id,
      lock_kind, status, amount,
      idempotency_key, meta, created_at, updated_at
    )
    VALUES (
      p_tournament_id, v_entry.id, v_uid,
      'entry', 'held', v_entry.amount,
      v_key, jsonb_build_object('source','sync_my_entry_lock'), now(), now()
    )
    RETURNING * INTO v_lock;
  ELSE
    -- Only HELD locks are mutable
    IF v_lock.status <> 'held' THEN
      RAISE EXCEPTION 'LOCK_NOT_MUTABLE';
    END IF;

    UPDATE public.tournament_locks
    SET amount = v_entry.amount,
        updated_at = now()
    WHERE id = v_lock.id
    RETURNING * INTO v_lock;
  END IF;

  RETURN v_lock;
END $$;


--
-- Name: trg_guard_tournament_entry_mutations(); Type: FUNCTION; Schema: tournament; Owner: -
--

CREATE FUNCTION "tournament"."trg_guard_tournament_entry_mutations"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'tournament', 'public', 'pg_temp'
    AS $$
DECLARE
  v_status public.tournament_status;
BEGIN
  SELECT t.status
    INTO v_status
  FROM public.tournaments t
  WHERE t.id = COALESCE(NEW.tournament_id, OLD.tournament_id);

  IF NOT FOUND THEN
    RAISE EXCEPTION 'tournament not found for entry';
  END IF;

  IF TG_OP = 'UPDATE'
     AND v_status IN ('settling'::public.tournament_status, 'finished'::public.tournament_status)
     AND OLD.status = 'created'::public.tournament_entry_status
     AND NEW.status = 'settled'::public.tournament_entry_status
     AND NEW.tournament_id IS NOT DISTINCT FROM OLD.tournament_id
     AND NEW.user_id IS NOT DISTINCT FROM OLD.user_id
     AND NEW.amount IS NOT DISTINCT FROM OLD.amount
     AND NEW.tickets_count IS NOT DISTINCT FROM OLD.tickets_count
     AND NEW.price_per_ticket IS NOT DISTINCT FROM OLD.price_per_ticket
  THEN
    RETURN NEW;
  END IF;

  IF v_status IN ('running'::public.tournament_status, 'settling'::public.tournament_status, 'finished'::public.tournament_status) THEN
    RAISE EXCEPTION 'tournament is locked; entries cannot be changed (status=%)', v_status;
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$;


--
-- Name: trg_on_entry_cancel_cleanup(); Type: FUNCTION; Schema: tournament; Owner: -
--

CREATE FUNCTION "tournament"."trg_on_entry_cancel_cleanup"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'tournament', 'public', 'pg_temp'
    AS $$
BEGIN
  -- فقط وقتی وضعیت واقعاً تغییر کرده و به cancelled رسیده
  IF TG_OP = 'UPDATE'
     AND NEW.status IS DISTINCT FROM OLD.status
     AND NEW.status = 'cancelled' THEN

    DELETE FROM public.tournament_commission_snapshots s
     WHERE s.tournament_id = NEW.tournament_id
       AND s.entry_id      = NEW.id;

    -- اگر جدول lock هم دارید، اینجا آزادش کنید (اختیاری)
    -- DELETE FROM public.tournament_locks l
    --  WHERE l.tournament_id = NEW.tournament_id
    --    AND l.entry_id      = NEW.id;

  END IF;

  RETURN NEW;
END;
$$;


--
-- Name: trg_te_commission_snapshot(); Type: FUNCTION; Schema: tournament; Owner: -
--

CREATE FUNCTION "tournament"."trg_te_commission_snapshot"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'tournament', 'public', 'pg_temp'
    AS $$
BEGIN
  -- فقط وقتی entry واقعی است
  IF TG_OP = 'INSERT' THEN
    PERFORM tournament.fn_commission_snapshot_entry(NEW.tournament_id, NEW.id);
    RETURN NEW;
  END IF;

  -- اگر tickets_count یا status عوض شد دوباره محاسبه کن
  IF TG_OP = 'UPDATE' THEN
    IF (NEW.tickets_count IS DISTINCT FROM OLD.tickets_count)
       OR (NEW.status IS DISTINCT FROM OLD.status) THEN
      PERFORM tournament.fn_commission_snapshot_entry(NEW.tournament_id, NEW.id);
    END IF;
    RETURN NEW;
  END IF;

  RETURN NEW;
END;
$$;


--
-- Name: trg_tournament_entries_snapshot_bd(); Type: FUNCTION; Schema: tournament; Owner: -
--

CREATE FUNCTION "tournament"."trg_tournament_entries_snapshot_bd"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'tournament', 'public', 'pg_temp'
    AS $$
BEGIN
  DELETE FROM public.tournament_commission_snapshots
  WHERE tournament_id = OLD.tournament_id
    AND entry_id      = OLD.id;

  RETURN OLD;
END;
$$;


--
-- Name: attempts; Type: TABLE; Schema: deposit; Owner: -
--

CREATE TABLE "deposit"."attempts" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "intent_id" "uuid" NOT NULL,
    "provider" "text" NOT NULL,
    "external_event_id" "text" NOT NULL,
    "observed_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "payload_hash" "text" NOT NULL,
    "payload_ref" "text",
    "headers_meta" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "parse_status" "deposit"."attempt_parse_status" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);

ALTER TABLE ONLY "deposit"."attempts" FORCE ROW LEVEL SECURITY;


--
-- Name: credits; Type: TABLE; Schema: deposit; Owner: -
--

CREATE TABLE "deposit"."credits" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "intent_id" "uuid" NOT NULL,
    "verification_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "amount" numeric NOT NULL,
    "currency" "text" NOT NULL,
    "idempotency_key" "text" NOT NULL,
    "ledger_tx_id" "uuid",
    "status" "deposit"."credit_status" DEFAULT 'pending'::"deposit"."credit_status" NOT NULL,
    "posted_at" timestamp with time zone,
    "error" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "credits_amount_check" CHECK (("amount" > (0)::numeric))
);

ALTER TABLE ONLY "deposit"."credits" FORCE ROW LEVEL SECURITY;


--
-- Name: crypto_derivation_state; Type: TABLE; Schema: deposit; Owner: -
--

CREATE TABLE "deposit"."crypto_derivation_state" (
    "id" boolean DEFAULT true NOT NULL,
    "last_derivation_index" integer DEFAULT '-1'::integer NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "crypto_derivation_state_id_check" CHECK (("id" = true)),
    CONSTRAINT "crypto_derivation_state_last_derivation_index_check" CHECK (("last_derivation_index" >= '-1'::integer)),
    CONSTRAINT "crypto_derivation_state_singleton" CHECK (("id" = true))
);


--
-- Name: crypto_rate_tiers; Type: TABLE; Schema: deposit; Owner: -
--

CREATE TABLE "deposit"."crypto_rate_tiers" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "network" "text" NOT NULL,
    "min_usd" numeric(18,6) NOT NULL,
    "max_usd" numeric(18,6) NOT NULL,
    "multiplier" numeric(12,6) NOT NULL,
    "bonus_percent" numeric(8,4) DEFAULT 0 NOT NULL,
    "sort_order" integer DEFAULT 0 NOT NULL,
    "is_active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "crypto_rate_tiers_bonus_percent_check" CHECK ((("bonus_percent" >= (0)::numeric) AND ("bonus_percent" <= (100)::numeric))),
    CONSTRAINT "crypto_rate_tiers_check" CHECK (("max_usd" > "min_usd")),
    CONSTRAINT "crypto_rate_tiers_min_usd_check" CHECK (("min_usd" >= (0)::numeric)),
    CONSTRAINT "crypto_rate_tiers_multiplier_check" CHECK ((("multiplier" > (0)::numeric) AND ("multiplier" <= (10)::numeric))),
    CONSTRAINT "crypto_rate_tiers_network_check" CHECK (("network" = ANY (ARRAY['BEP20'::"text", 'TRC20'::"text", 'TRX'::"text"])))
);


--
-- Name: TABLE "crypto_rate_tiers"; Type: COMMENT; Schema: deposit; Owner: -
--

COMMENT ON TABLE "deposit"."crypto_rate_tiers" IS 'Admin tiered multipliers / bonuses for crypto deposit invoice (BEP20, TRC20, TRX)';


--
-- Name: crypto_transactions; Type: TABLE; Schema: deposit; Owner: -
--

CREATE TABLE "deposit"."crypto_transactions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "network" "deposit"."crypto_tx_network" NOT NULL,
    "currency" "text" NOT NULL,
    "tx_hash" "text" NOT NULL,
    "from_address" "text",
    "to_address" "text" NOT NULL,
    "crypto_amount" numeric(36,18) NOT NULL,
    "toman_amount" numeric(18,2) NOT NULL,
    "status" "deposit"."crypto_tx_status" DEFAULT 'PENDING'::"deposit"."crypto_tx_status" NOT NULL,
    "confirmations" integer,
    "price_source" "text",
    "price_lock_used" boolean DEFAULT false NOT NULL,
    "wallet_tx_id" "uuid",
    "meta" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "observed_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "confirmed_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "event_index" integer DEFAULT 0 NOT NULL,
    CONSTRAINT "crypto_transactions_crypto_amount_check" CHECK (("crypto_amount" > (0)::numeric)),
    CONSTRAINT "crypto_transactions_currency_check" CHECK (("currency" = ANY (ARRAY['USDT'::"text", 'BNB'::"text", 'TRX'::"text", 'TRC10'::"text"]))),
    CONSTRAINT "crypto_transactions_toman_amount_check" CHECK (("toman_amount" >= (0)::numeric))
);


--
-- Name: COLUMN "crypto_transactions"."event_index"; Type: COMMENT; Schema: deposit; Owner: -
--

COMMENT ON COLUMN "deposit"."crypto_transactions"."event_index" IS 'On-chain event identity within tx: TRON event_index / BEP20 logIndex; native transfers use 0';


--
-- Name: crypto_xpub_settings; Type: TABLE; Schema: deposit; Owner: -
--

CREATE TABLE "deposit"."crypto_xpub_settings" (
    "id" boolean DEFAULT true NOT NULL,
    "bep20_xpub" "text",
    "trc20_xpub" "text",
    "updated_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "bep20_confirmations" integer DEFAULT 12 NOT NULL,
    "tron_confirmations" integer DEFAULT 1 NOT NULL,
    CONSTRAINT "crypto_xpub_settings_bep20_confirmations_check" CHECK ((("bep20_confirmations" >= 1) AND ("bep20_confirmations" <= 256))),
    CONSTRAINT "crypto_xpub_settings_id_check" CHECK (("id" = true)),
    CONSTRAINT "crypto_xpub_settings_singleton" CHECK (("id" = true)),
    CONSTRAINT "crypto_xpub_settings_tron_confirmations_check" CHECK ((("tron_confirmations" >= 1) AND ("tron_confirmations" <= 256)))
);


--
-- Name: COLUMN "crypto_xpub_settings"."bep20_confirmations"; Type: COMMENT; Schema: deposit; Owner: -
--

COMMENT ON COLUMN "deposit"."crypto_xpub_settings"."bep20_confirmations" IS 'Min BSC confirmations before crypto deposit is CONFIRMED (default 12)';


--
-- Name: COLUMN "crypto_xpub_settings"."tron_confirmations"; Type: COMMENT; Schema: deposit; Owner: -
--

COMMENT ON COLUMN "deposit"."crypto_xpub_settings"."tron_confirmations" IS 'Min Tron confirmations before crypto deposit is CONFIRMED (default 1)';


--
-- Name: events; Type: TABLE; Schema: deposit; Owner: -
--

CREATE TABLE "deposit"."events" (
    "id" bigint NOT NULL,
    "intent_id" "uuid",
    "event_type" "text" NOT NULL,
    "actor" "text" NOT NULL,
    "payload" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "events_actor_check" CHECK (("actor" = ANY (ARRAY['system'::"text", 'user'::"text", 'admin'::"text", 'adapter'::"text", 'test'::"text"])))
);

ALTER TABLE ONLY "deposit"."events" FORCE ROW LEVEL SECURITY;


--
-- Name: events_id_seq; Type: SEQUENCE; Schema: deposit; Owner: -
--

CREATE SEQUENCE "deposit"."events_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: events_id_seq; Type: SEQUENCE OWNED BY; Schema: deposit; Owner: -
--

ALTER SEQUENCE "deposit"."events_id_seq" OWNED BY "deposit"."events"."id";


--
-- Name: recon_reports; Type: TABLE; Schema: deposit; Owner: -
--

CREATE TABLE "deposit"."recon_reports" (
    "id" bigint NOT NULL,
    "status" "text" NOT NULL,
    "summary" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "details" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "recon_reports_status_check" CHECK (("status" = ANY (ARRAY['ok'::"text", 'drift'::"text", 'error'::"text"])))
);

ALTER TABLE ONLY "deposit"."recon_reports" FORCE ROW LEVEL SECURITY;


--
-- Name: recon_reports_id_seq; Type: SEQUENCE; Schema: deposit; Owner: -
--

CREATE SEQUENCE "deposit"."recon_reports_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: recon_reports_id_seq; Type: SEQUENCE OWNED BY; Schema: deposit; Owner: -
--

ALTER SEQUENCE "deposit"."recon_reports_id_seq" OWNED BY "deposit"."recon_reports"."id";


--
-- Name: user_crypto_addresses; Type: TABLE; Schema: deposit; Owner: -
--

CREATE TABLE "deposit"."user_crypto_addresses" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "derivation_index" integer NOT NULL,
    "bep20_address" "text" NOT NULL,
    "trc20_address" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


--
-- Name: verifications; Type: TABLE; Schema: deposit; Owner: -
--

CREATE TABLE "deposit"."verifications" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "intent_id" "uuid" NOT NULL,
    "attempt_id" "uuid",
    "provider" "text" NOT NULL,
    "result" "deposit"."verification_result" NOT NULL,
    "failure_code" "text",
    "evidence" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "external_payment_id" "text",
    "amount_observed" numeric,
    "currency_observed" "text",
    "confirmations" integer,
    "verified_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "verifier_version" "text" DEFAULT 'p6.5'::"text" NOT NULL
);

ALTER TABLE ONLY "deposit"."verifications" FORCE ROW LEVEL SECURITY;


--
-- Name: rooms; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."rooms" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "room_code" "text" DEFAULT "public"."fn_generate_room_code"() NOT NULL,
    "title" "text",
    "status" "public"."room_status" DEFAULT 'waiting'::"public"."room_status" NOT NULL,
    "created_by" "uuid",
    "card_price" numeric(10,2) DEFAULT 0 NOT NULL,
    "currency" "text" DEFAULT 'IRR'::"text" NOT NULL,
    "max_cards_per_player" integer DEFAULT 10 NOT NULL,
    "max_players" integer,
    "starts_at" timestamp with time zone,
    "ends_at" timestamp with time zone,
    "seed" "text",
    "meta" "jsonb",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "pool_id" "uuid",
    "commission_rate" numeric,
    "next_draw_at" timestamp with time zone,
    "room_template_id" "uuid",
    "price" numeric,
    "min_players" integer,
    "countdown_sec" integer,
    "prize_paid_at" timestamp with time zone,
    "line_reward_percentage" numeric,
    "full_reward_percentage" numeric,
    "password" "text",
    "scheduled_start_time" time without time zone,
    "ding_per_number" numeric,
    "room_seed" "bytea",
    "room_seed_hash" character(64),
    "seed_revealed_at" timestamp with time zone,
    "admin_action" "jsonb" DEFAULT '{}'::"jsonb",
    "line_prize_pool" numeric DEFAULT 0 NOT NULL,
    "full_prize_pool" numeric DEFAULT 0 NOT NULL,
    "cancelled_at" timestamp with time zone,
    "cancelled_by" "uuid",
    "cancelled_reason" "text",
    "first_line_draw_number" integer,
    "engine_owner_id" "text",
    "engine_lease_until" timestamp with time zone,
    "engine_claimed_at" timestamp with time zone,
    "engine_loop_state" "text" DEFAULT 'idle'::"text" NOT NULL,
    "last_draw_processed_at" timestamp with time zone,
    "waiting_started_at" timestamp with time zone,
    "engine_lease_epoch" bigint DEFAULT 0 NOT NULL,
    CONSTRAINT "room_pool_required_chk" CHECK ((("status" <> ALL (ARRAY['waiting'::"public"."room_status", 'playing'::"public"."room_status", 'settling'::"public"."room_status"])) OR ("pool_id" IS NOT NULL))),
    CONSTRAINT "rooms_commission_rate_check" CHECK ((("commission_rate" IS NULL) OR (("commission_rate" >= (0)::numeric) AND ("commission_rate" <= (1)::numeric)))),
    CONSTRAINT "rooms_ding_per_number_check" CHECK ((("ding_per_number" IS NULL) OR ("ding_per_number" >= (0)::numeric))),
    CONSTRAINT "rooms_full_reward_percentage_check" CHECK ((("full_reward_percentage" IS NULL) OR (("full_reward_percentage" >= (0)::numeric) AND ("full_reward_percentage" <= (1)::numeric)))),
    CONSTRAINT "rooms_line_reward_percentage_check" CHECK ((("line_reward_percentage" IS NULL) OR (("line_reward_percentage" >= (0)::numeric) AND ("line_reward_percentage" <= (1)::numeric))))
);

ALTER TABLE ONLY "public"."rooms" REPLICA IDENTITY FULL;


--
-- Name: COLUMN "rooms"."line_reward_percentage"; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN "public"."rooms"."line_reward_percentage" IS 'درصد جایزه برای برنده خط - override برای Room خاص (اختیاری)';


--
-- Name: COLUMN "rooms"."full_reward_percentage"; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN "public"."rooms"."full_reward_percentage" IS 'درصد جایزه برای برنده پر - override برای Room خاص (اختیاری)';


--
-- Name: COLUMN "rooms"."password"; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN "public"."rooms"."password" IS 'پسورد Room (برای Room های VIP)';


--
-- Name: COLUMN "rooms"."scheduled_start_time"; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN "public"."rooms"."scheduled_start_time" IS 'زمان شروع برنامه‌ریزی‌شده Room (override برای Room خاص)';


--
-- Name: COLUMN "rooms"."ding_per_number"; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN "public"."rooms"."ding_per_number" IS 'تعداد Ding به ازای هر عدد قرعه‌کشی شده (override برای Room خاص - اگر null باشد از template استفاده می‌شود)';


--
-- Name: COLUMN "rooms"."line_prize_pool"; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN "public"."rooms"."line_prize_pool" IS 'خزانه‌ی خالص جایزه‌ی line برای روم؛ توسط موتور مالی پر و خالی می‌شود';


--
-- Name: COLUMN "rooms"."full_prize_pool"; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN "public"."rooms"."full_prize_pool" IS 'خزانه‌ی خالص جایزه‌ی full برای روم؛ توسط موتور مالی پر و خالی می‌شود';


--
-- Name: COLUMN "rooms"."engine_lease_epoch"; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN "public"."rooms"."engine_lease_epoch" IS 'Increments when engine_owner_id changes; fences stale actor finalize/insert.';


--
-- Name: rooms_settling_lag; Type: VIEW; Schema: monitor; Owner: -
--

CREATE VIEW "monitor"."rooms_settling_lag" AS
 SELECT "id" AS "room_id",
    "status",
    "updated_at",
    (EXTRACT(epoch FROM ("now"() - "updated_at")))::bigint AS "lag_seconds",
    "line_prize_pool",
    "full_prize_pool"
   FROM "public"."rooms" "r"
  WHERE ("status" = 'settling'::"public"."room_status");


--
-- Name: wallet_hold_consistency; Type: VIEW; Schema: monitor; Owner: -
--

CREATE VIEW "monitor"."wallet_hold_consistency" AS
SELECT
    NULL::"uuid" AS "room_id",
    NULL::"public"."room_status" AS "status",
    NULL::numeric AS "reserved_value",
    NULL::numeric AS "locked_snapshot",
    NULL::bigint AS "pending_tickets";


--
-- Name: engine_registry; Type: TABLE; Schema: platform; Owner: -
--

CREATE TABLE "platform"."engine_registry" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "game_id" "uuid" NOT NULL,
    "code" "text" NOT NULL,
    "display_name" "text" NOT NULL,
    "status" "text" DEFAULT 'inactive'::"text" NOT NULL,
    "version" "text",
    "environment" "text",
    "last_health_at" timestamp with time zone,
    "metadata" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "engine_registry_code_format" CHECK (("code" ~ '^[a-z][a-z0-9_-]*$'::"text")),
    CONSTRAINT "engine_registry_status_check" CHECK (("status" = ANY (ARRAY['active'::"text", 'inactive'::"text"])))
);

ALTER TABLE ONLY "platform"."engine_registry" FORCE ROW LEVEL SECURITY;


--
-- Name: TABLE "engine_registry"; Type: COMMENT; Schema: platform; Owner: -
--

COMMENT ON TABLE "platform"."engine_registry" IS 'Deployed engine instances that may claim/advance platform.game_sessions.';


--
-- Name: game_sessions; Type: TABLE; Schema: platform; Owner: -
--

CREATE TABLE "platform"."game_sessions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "game_id" "uuid" NOT NULL,
    "engine_id" "uuid" NOT NULL,
    "template_id" "uuid",
    "tournament_match_id" "uuid",
    "status" "text" DEFAULT 'created'::"text" NOT NULL,
    "capacity" integer,
    "participant_count" integer DEFAULT 0 NOT NULL,
    "entry_fee" numeric(18,2),
    "currency" "text",
    "lease_owner" "text",
    "lease_epoch" bigint DEFAULT 0 NOT NULL,
    "lease_expires_at" timestamp with time zone,
    "correlation_key" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "started_at" timestamp with time zone,
    "finished_at" timestamp with time zone,
    "settled_at" timestamp with time zone,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "game_sessions_capacity_check" CHECK ((("capacity" IS NULL) OR ("capacity" > 0))),
    CONSTRAINT "game_sessions_entry_fee_check" CHECK ((("entry_fee" IS NULL) OR ("entry_fee" >= (0)::numeric))),
    CONSTRAINT "game_sessions_participant_count_check" CHECK (("participant_count" >= 0)),
    CONSTRAINT "game_sessions_status_check" CHECK (("status" = ANY (ARRAY['created'::"text", 'waiting'::"text", 'claimed'::"text", 'running'::"text", 'finished'::"text", 'settled'::"text", 'archived'::"text", 'cancelled'::"text", 'failed'::"text"])))
);

ALTER TABLE ONLY "platform"."game_sessions" FORCE ROW LEVEL SECURITY;


--
-- Name: TABLE "game_sessions"; Type: COMMENT; Schema: platform; Owner: -
--

COMMENT ON TABLE "platform"."game_sessions" IS 'Engine-agnostic playable session shell. Lifecycle + money shell only; no game rules.';


--
-- Name: COLUMN "game_sessions"."template_id"; Type: COMMENT; Schema: platform; Owner: -
--

COMMENT ON COLUMN "platform"."game_sessions"."template_id" IS 'Reserved for future platform.game_templates; no FK in P5.2.';


--
-- Name: COLUMN "game_sessions"."tournament_match_id"; Type: COMMENT; Schema: platform; Owner: -
--

COMMENT ON COLUMN "platform"."game_sessions"."tournament_match_id" IS 'Reserved for future tournament match FK; no FK in P5.2.';


--
-- Name: games; Type: TABLE; Schema: platform; Owner: -
--

CREATE TABLE "platform"."games" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "code" "text" NOT NULL,
    "name" "text" NOT NULL,
    "status" "text" DEFAULT 'enabled'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "games_code_format" CHECK (("code" ~ '^[a-z][a-z0-9_]*$'::"text")),
    CONSTRAINT "games_status_check" CHECK (("status" = ANY (ARRAY['enabled'::"text", 'disabled'::"text"])))
);

ALTER TABLE ONLY "platform"."games" FORCE ROW LEVEL SECURITY;


--
-- Name: TABLE "games"; Type: COMMENT; Schema: platform; Owner: -
--

COMMENT ON TABLE "platform"."games" IS 'Product game catalog (bingo, backgammon, …). No rule columns.';


--
-- Name: session_events; Type: TABLE; Schema: platform; Owner: -
--

CREATE TABLE "platform"."session_events" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "session_id" "uuid" NOT NULL,
    "seq" bigint NOT NULL,
    "event_type" "text" NOT NULL,
    "actor" "text",
    "payload" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "session_events_seq_check" CHECK (("seq" >= 0)),
    CONSTRAINT "session_events_type_format" CHECK ((("char_length"("event_type") >= 1) AND ("char_length"("event_type") <= 128)))
);

ALTER TABLE ONLY "platform"."session_events" FORCE ROW LEVEL SECURITY;


--
-- Name: TABLE "session_events"; Type: COMMENT; Schema: platform; Owner: -
--

COMMENT ON TABLE "platform"."session_events" IS 'Append-only Platform-visible session events. Not financial source of truth.';


--
-- Name: session_participants; Type: TABLE; Schema: platform; Owner: -
--

CREATE TABLE "platform"."session_participants" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "session_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "seat_no" integer,
    "status" "text" DEFAULT 'joined'::"text" NOT NULL,
    "hold_ref" "text",
    "joined_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "left_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "ticket_count" integer DEFAULT 0 NOT NULL,
    "ticket_count_all" integer DEFAULT 0 NOT NULL,
    "amount_total" numeric(18,2) DEFAULT 0 NOT NULL,
    "amount_gross" numeric(18,2) DEFAULT 0 NOT NULL,
    "source_updated_at" timestamp with time zone,
    "mirror_meta" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    CONSTRAINT "session_participants_seat_no_check" CHECK ((("seat_no" IS NULL) OR ("seat_no" >= 0))),
    CONSTRAINT "session_participants_status_check" CHECK (("status" = ANY (ARRAY['joined'::"text", 'active'::"text", 'left'::"text", 'forfeit'::"text"])))
);

ALTER TABLE ONLY "platform"."session_participants" FORCE ROW LEVEL SECURITY;


--
-- Name: TABLE "session_participants"; Type: COMMENT; Schema: platform; Owner: -
--

COMMENT ON TABLE "platform"."session_participants" IS 'Platform membership + economic hold refs. No engine seat semantics beyond opaque seat_no.';


--
-- Name: session_settlement; Type: TABLE; Schema: platform; Owner: -
--

CREATE TABLE "platform"."session_settlement" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "session_id" "uuid" NOT NULL,
    "settlement_key" "text" NOT NULL,
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "currency" "text",
    "gross_in" numeric(18,2),
    "gross_out" numeric(18,2),
    "fee_total" numeric(18,2),
    "lines" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "ledger_refs" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "error_message" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "applied_at" timestamp with time zone,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "session_settlement_status_check" CHECK (("status" = ANY (ARRAY['pending'::"text", 'applied'::"text", 'failed'::"text", 'cancelled'::"text"])))
);

ALTER TABLE ONLY "platform"."session_settlement" FORCE ROW LEVEL SECURITY;


--
-- Name: TABLE "session_settlement"; Type: COMMENT; Schema: platform; Owner: -
--

COMMENT ON TABLE "platform"."session_settlement" IS 'Settlement intent/completion envelope. Wallet mutation remains Platform finance RPCs (unchanged in P5.2).';


--
-- Name: session_state; Type: TABLE; Schema: platform; Owner: -
--

CREATE TABLE "platform"."session_state" (
    "session_id" "uuid" NOT NULL,
    "state_version" bigint DEFAULT 0 NOT NULL,
    "engine_state_ref" "text",
    "needs_settle" boolean DEFAULT false NOT NULL,
    "metadata" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "session_state_state_version_check" CHECK (("state_version" >= 0))
);

ALTER TABLE ONLY "platform"."session_state" FORCE ROW LEVEL SECURITY;


--
-- Name: TABLE "session_state"; Type: COMMENT; Schema: platform; Owner: -
--

COMMENT ON TABLE "platform"."session_state" IS 'Thin Platform envelope (version/flags/pointer). Authoritative play state lives in engine schemas.';


--
-- Name: shadow_mirror_log; Type: TABLE; Schema: platform; Owner: -
--

CREATE TABLE "platform"."shadow_mirror_log" (
    "id" bigint NOT NULL,
    "room_id" "uuid" NOT NULL,
    "session_id" "uuid" NOT NULL,
    "lifecycle" "text",
    "result" "text" NOT NULL,
    "retry_count" integer DEFAULT 0 NOT NULL,
    "duration_ms" numeric(12,3),
    "detail" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);

ALTER TABLE ONLY "platform"."shadow_mirror_log" FORCE ROW LEVEL SECURITY;


--
-- Name: shadow_mirror_log_id_seq; Type: SEQUENCE; Schema: platform; Owner: -
--

CREATE SEQUENCE "platform"."shadow_mirror_log_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: shadow_mirror_log_id_seq; Type: SEQUENCE OWNED BY; Schema: platform; Owner: -
--

ALTER SEQUENCE "platform"."shadow_mirror_log_id_seq" OWNED BY "platform"."shadow_mirror_log"."id";


--
-- Name: shadow_outbox; Type: TABLE; Schema: platform; Owner: -
--

CREATE TABLE "platform"."shadow_outbox" (
    "id" bigint NOT NULL,
    "room_id" "uuid" NOT NULL,
    "enqueued_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "next_attempt_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "retry_count" integer DEFAULT 0 NOT NULL,
    "max_retries" integer DEFAULT 25 NOT NULL,
    "last_error" "text",
    "processed_at" timestamp with time zone,
    "dead_lettered_at" timestamp with time zone,
    CONSTRAINT "shadow_outbox_max_retries_check" CHECK (("max_retries" > 0)),
    CONSTRAINT "shadow_outbox_retry_count_check" CHECK (("retry_count" >= 0))
);

ALTER TABLE ONLY "platform"."shadow_outbox" FORCE ROW LEVEL SECURITY;


--
-- Name: shadow_outbox_id_seq; Type: SEQUENCE; Schema: platform; Owner: -
--

CREATE SEQUENCE "platform"."shadow_outbox_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: shadow_outbox_id_seq; Type: SEQUENCE OWNED BY; Schema: platform; Owner: -
--

ALTER SEQUENCE "platform"."shadow_outbox_id_seq" OWNED BY "platform"."shadow_outbox"."id";


--
-- Name: admin_audit_log; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."admin_audit_log" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "admin_id" "uuid" NOT NULL,
    "action" "text" NOT NULL,
    "target_table" "text" NOT NULL,
    "target_id" "text",
    "payload" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "ip_address" "text",
    "user_agent" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


--
-- Name: TABLE "admin_audit_log"; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE "public"."admin_audit_log" IS 'جدول ثبت عملیات حساس ادمین - برای audit trail و traceability';


--
-- Name: COLUMN "admin_audit_log"."id"; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN "public"."admin_audit_log"."id" IS 'شناسه یکتا رکورد';


--
-- Name: COLUMN "admin_audit_log"."admin_id"; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN "public"."admin_audit_log"."admin_id" IS 'شناسه ادمینی که عملیات را انجام داده است';


--
-- Name: COLUMN "admin_audit_log"."action"; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN "public"."admin_audit_log"."action" IS 'نوع عملیات (مثلاً: change_user_role, toggle_suspension, set_commission, ...)';


--
-- Name: COLUMN "admin_audit_log"."target_table"; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN "public"."admin_audit_log"."target_table" IS 'نام جدول هدف (مثلاً: users, room_templates, user_commissions, ...)';


--
-- Name: COLUMN "admin_audit_log"."target_id"; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN "public"."admin_audit_log"."target_id" IS 'شناسه رکورد هدف (مثلاً: user_id, template_id, ...)';


--
-- Name: COLUMN "admin_audit_log"."payload"; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN "public"."admin_audit_log"."payload" IS 'داده‌های اضافی عملیات (JSONB) - شامل مقادیر قبل/بعد، پارامترها، و غیره';


--
-- Name: COLUMN "admin_audit_log"."ip_address"; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN "public"."admin_audit_log"."ip_address" IS 'آدرس IP ادمین (برای security tracking)';


--
-- Name: COLUMN "admin_audit_log"."user_agent"; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN "public"."admin_audit_log"."user_agent" IS 'User agent ادمین (برای security tracking)';


--
-- Name: COLUMN "admin_audit_log"."created_at"; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN "public"."admin_audit_log"."created_at" IS 'زمان انجام عملیات';


--
-- Name: admin_permissions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."admin_permissions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "admin_id" "uuid" NOT NULL,
    "permission_key" "text" NOT NULL,
    "granted" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


--
-- Name: TABLE "admin_permissions"; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE "public"."admin_permissions" IS 'Stores granular access permissions for admin users';


--
-- Name: COLUMN "admin_permissions"."admin_id"; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN "public"."admin_permissions"."admin_id" IS 'Reference to the admin user';


--
-- Name: COLUMN "admin_permissions"."permission_key"; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN "public"."admin_permissions"."permission_key" IS 'Key of the permission (e.g., rooms, users, transactions, entry_banner, admins)';


--
-- Name: COLUMN "admin_permissions"."granted"; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN "public"."admin_permissions"."granted" IS 'Whether the permission is granted (true) or denied (false)';


--
-- Name: app_runtime_flags; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."app_runtime_flags" (
    "id" boolean DEFAULT true NOT NULL,
    "global_registration_locked" boolean DEFAULT false NOT NULL,
    "global_registration_locked_at" timestamp with time zone,
    "global_registration_locked_by" "uuid",
    "global_registration_lock_reason" "text",
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "app_runtime_flags_id_check" CHECK (("id" = true))
);


--
-- Name: card_definition_masks; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."card_definition_masks" (
    "pool_card_id" bigint NOT NULL,
    "line1_mask" integer NOT NULL,
    "line2_mask" integer NOT NULL,
    "line3_mask" integer NOT NULL,
    "full_mask" integer NOT NULL,
    "cell_count" smallint DEFAULT 15 NOT NULL,
    "computed_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "card_definition_masks_cell_count_check" CHECK ((("cell_count" > 0) AND ("cell_count" <= 15)))
);


--
-- Name: TABLE "card_definition_masks"; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE "public"."card_definition_masks" IS 'Precomputed 15-bit win masks per global card template. Shared across all rooms.';


--
-- Name: card_number_index; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."card_number_index" (
    "value" smallint NOT NULL,
    "pool_card_id" bigint NOT NULL,
    "bit_position" smallint NOT NULL,
    CONSTRAINT "card_number_index_bit_position_check" CHECK ((("bit_position" >= 0) AND ("bit_position" <= 14))),
    CONSTRAINT "card_number_index_value_check" CHECK ((("value" >= 1) AND ("value" <= 90)))
);


--
-- Name: TABLE "card_number_index"; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE "public"."card_number_index" IS 'Global reverse lookup: which cards contain a given bingo number and at which bit position.';


--
-- Name: card_numbers; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."card_numbers" (
    "pool_card_id" bigint NOT NULL,
    "row_no" smallint NOT NULL,
    "col_no" smallint NOT NULL,
    "value" integer NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "bit_position" smallint,
    CONSTRAINT "card_numbers_bit_position_range" CHECK ((("bit_position" IS NULL) OR (("bit_position" >= 0) AND ("bit_position" <= 14)))),
    CONSTRAINT "cn_col_chk" CHECK ((("col_no" >= 1) AND ("col_no" <= 9))),
    CONSTRAINT "cn_row_chk" CHECK ((("row_no" >= 1) AND ("row_no" <= 3))),
    CONSTRAINT "cn_val_chk" CHECK ((("value" >= 1) AND ("value" <= 90)))
);


--
-- Name: card_pool_cards; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."card_pool_cards" (
    "id" bigint NOT NULL,
    "pool_id" "uuid" NOT NULL,
    "card_no" integer NOT NULL,
    "card_data" "jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


--
-- Name: card_pool_cards_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE "public"."card_pool_cards_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: card_pool_cards_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE "public"."card_pool_cards_id_seq" OWNED BY "public"."card_pool_cards"."id";


--
-- Name: card_pools; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."card_pools" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "version" integer NOT NULL,
    "is_active" boolean DEFAULT false NOT NULL,
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "pool_seed" "bytea",
    "commit_hash" "text",
    "prng_version" "text" DEFAULT 'v1'::"text",
    "card_count" integer DEFAULT 0 NOT NULL,
    "is_building" boolean DEFAULT false NOT NULL,
    "cards_built" integer DEFAULT 0 NOT NULL
);


--
-- Name: card_pools_version_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE "public"."card_pools" ALTER COLUMN "version" ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME "public"."card_pools_version_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: commissions_log; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."commissions_log" (
    "id" bigint NOT NULL,
    "ticket_id" "uuid" NOT NULL,
    "room_id" "uuid" NOT NULL,
    "player_id" "uuid" NOT NULL,
    "agent_id" "uuid",
    "super_id" "uuid",
    "gross_amount" numeric NOT NULL,
    "commission_rate" numeric NOT NULL,
    "commission_base" numeric NOT NULL,
    "agent_rate" numeric DEFAULT 0 NOT NULL,
    "super_rate" numeric DEFAULT 0 NOT NULL,
    "agent_amount" numeric DEFAULT 0 NOT NULL,
    "super_amount" numeric DEFAULT 0 NOT NULL,
    "admin_amount" numeric DEFAULT 0 NOT NULL,
    "currency" "text" DEFAULT 'IRR'::"text",
    "source" "text" DEFAULT 'ticket_purchase'::"text" NOT NULL,
    "notes" "jsonb",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "distributed_at" timestamp with time zone,
    "amount_to_pool" numeric DEFAULT 0 NOT NULL,
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    CONSTRAINT "chk_amounts_sum" CHECK (("abs"(((("agent_amount" + "super_amount") + "admin_amount") - "commission_base")) <= 0.01)),
    CONSTRAINT "chk_nonneg_amounts" CHECK ((("agent_amount" >= (0)::numeric) AND ("super_amount" >= (0)::numeric) AND ("admin_amount" >= (0)::numeric))),
    CONSTRAINT "chk_rates_sum" CHECK ((("agent_rate" >= (0)::numeric) AND ("super_rate" >= (0)::numeric) AND ("agent_rate" <= (1)::numeric) AND ("super_rate" <= (1)::numeric))),
    CONSTRAINT "commissions_log_commission_rate_check" CHECK ((("commission_rate" >= (0)::numeric) AND ("commission_rate" <= (1)::numeric))),
    CONSTRAINT "commissions_rates_range" CHECK ((("commission_rate" >= (0)::numeric) AND ("commission_rate" <= (1)::numeric) AND (COALESCE("agent_rate", (0)::numeric) >= (0)::numeric) AND (COALESCE("agent_rate", (0)::numeric) <= (1)::numeric) AND (COALESCE("super_rate", (0)::numeric) >= (0)::numeric) AND (COALESCE("super_rate", (0)::numeric) <= (1)::numeric))),
    CONSTRAINT "commissions_sum_match" CHECK ((((COALESCE("agent_amount", (0)::numeric) + COALESCE("super_amount", (0)::numeric)) + COALESCE("admin_amount", (0)::numeric)) = "commission_base"))
);


--
-- Name: commissions_log_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE "public"."commissions_log_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: commissions_log_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE "public"."commissions_log_id_seq" OWNED BY "public"."commissions_log"."id";


--
-- Name: debug_room_status_log; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."debug_room_status_log" (
    "id" bigint NOT NULL,
    "at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "room_id" "uuid",
    "op" "text" NOT NULL,
    "old_status" "text",
    "new_status" "text",
    "db_user" "text" DEFAULT CURRENT_USER NOT NULL,
    "auth_uid" "uuid",
    "app_name" "text" DEFAULT "current_setting"('application_name'::"text", true),
    "client_addr" "inet" DEFAULT "inet_client_addr"(),
    "meta" "jsonb"
);


--
-- Name: debug_room_status_log_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE "public"."debug_room_status_log_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: debug_room_status_log_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE "public"."debug_room_status_log_id_seq" OWNED BY "public"."debug_room_status_log"."id";


--
-- Name: dev_player_configs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."dev_player_configs" (
    "user_id" "uuid" NOT NULL,
    "is_enabled" boolean DEFAULT false NOT NULL,
    "play_windows" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "min_room_price" numeric,
    "max_room_price" numeric,
    "max_ticket_count" integer DEFAULT 1 NOT NULL,
    "created_by" "uuid",
    "updated_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "bot_player_configs_max_ticket_count_check" CHECK (("max_ticket_count" > 0)),
    CONSTRAINT "bot_player_configs_price_range_check" CHECK ((("min_room_price" IS NULL) OR ("max_room_price" IS NULL) OR ("min_room_price" <= "max_room_price")))
);


--
-- Name: TABLE "dev_player_configs"; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE "public"."dev_player_configs" IS 'Per-user dev player behavior for Dev Panel: play windows, room price bounds, max tickets.';


--
-- Name: COLUMN "dev_player_configs"."is_enabled"; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN "public"."dev_player_configs"."is_enabled" IS 'When true, user is treated as an active dev player.';


--
-- Name: COLUMN "dev_player_configs"."play_windows"; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN "public"."dev_player_configs"."play_windows" IS 'JSON array of {start,end} HH:MM strings in local app timezone.';


--
-- Name: dev_player_join_preset_template_limits; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."dev_player_join_preset_template_limits" (
    "preset_id" "uuid" NOT NULL,
    "template_id" "uuid" NOT NULL,
    "min_active_rooms" integer,
    "max_active_rooms" integer,
    "join_interval_seconds" integer,
    "max_joins_per_tick" integer,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "min_normal_players_per_room" integer,
    "max_dev_players_per_room" integer,
    "quick_fill_enabled" boolean DEFAULT false NOT NULL,
    CONSTRAINT "dev_player_join_preset_template_limits_has_value_check" CHECK ((("min_active_rooms" IS NOT NULL) OR ("max_active_rooms" IS NOT NULL) OR ("join_interval_seconds" IS NOT NULL) OR ("max_joins_per_tick" IS NOT NULL) OR ("min_normal_players_per_room" IS NOT NULL) OR ("max_dev_players_per_room" IS NOT NULL) OR ("quick_fill_enabled" = true))),
    CONSTRAINT "dev_player_join_preset_template_limits_join_interval_check" CHECK ((("join_interval_seconds" IS NULL) OR (("join_interval_seconds" >= 5) AND ("join_interval_seconds" <= 7200)))),
    CONSTRAINT "dev_player_join_preset_template_limits_max_check" CHECK ((("max_active_rooms" IS NULL) OR ("max_active_rooms" >= 0))),
    CONSTRAINT "dev_player_join_preset_template_limits_max_dev_check" CHECK ((("max_dev_players_per_room" IS NULL) OR ("max_dev_players_per_room" >= 0))),
    CONSTRAINT "dev_player_join_preset_template_limits_max_joins_check" CHECK ((("max_joins_per_tick" IS NULL) OR (("max_joins_per_tick" >= 1) AND ("max_joins_per_tick" <= 100)))),
    CONSTRAINT "dev_player_join_preset_template_limits_min_check" CHECK ((("min_active_rooms" IS NULL) OR ("min_active_rooms" >= 0))),
    CONSTRAINT "dev_player_join_preset_template_limits_min_normal_check" CHECK ((("min_normal_players_per_room" IS NULL) OR ("min_normal_players_per_room" >= 0))),
    CONSTRAINT "dev_player_join_preset_template_limits_range_check" CHECK ((("min_active_rooms" IS NULL) OR ("max_active_rooms" IS NULL) OR ("min_active_rooms" <= "max_active_rooms")))
);


--
-- Name: COLUMN "dev_player_join_preset_template_limits"."join_interval_seconds"; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN "public"."dev_player_join_preset_template_limits"."join_interval_seconds" IS 'Minimum seconds between dev player schedule inserts for this template.';


--
-- Name: COLUMN "dev_player_join_preset_template_limits"."max_joins_per_tick"; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN "public"."dev_player_join_preset_template_limits"."max_joins_per_tick" IS 'Max dev-player joins per template during each work phase (before scheduler pause).';


--
-- Name: COLUMN "dev_player_join_preset_template_limits"."min_normal_players_per_room"; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN "public"."dev_player_join_preset_template_limits"."min_normal_players_per_room" IS 'Require at least this many non-dev players in the join-target waiting room before dev players may join.';


--
-- Name: COLUMN "dev_player_join_preset_template_limits"."max_dev_players_per_room"; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN "public"."dev_player_join_preset_template_limits"."max_dev_players_per_room" IS 'Maximum enabled dev players allowed in the oldest waiting room (join target).';


--
-- Name: COLUMN "dev_player_join_preset_template_limits"."quick_fill_enabled"; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN "public"."dev_player_join_preset_template_limits"."quick_fill_enabled" IS 'Per-template quick fill mode (Dev Panel). Engine behavior wired separately.';


--
-- Name: dev_player_join_presets; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."dev_player_join_presets" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "template_room_limit_enabled_ids" "uuid"[] DEFAULT '{}'::"uuid"[] NOT NULL,
    "min_wallet_balance" numeric DEFAULT 0 NOT NULL,
    "exclude_vip" boolean DEFAULT true NOT NULL,
    "exclude_tournament" boolean DEFAULT true NOT NULL,
    "auto_approve_schedules" boolean DEFAULT true NOT NULL,
    "updated_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "play_windows" "jsonb" DEFAULT '[{"end": "22:00", "start": "10:00"}]'::"jsonb" NOT NULL,
    CONSTRAINT "dev_player_join_presets_min_wallet_balance_check" CHECK (("min_wallet_balance" >= (0)::numeric)),
    CONSTRAINT "dev_player_join_presets_name_check" CHECK (("length"(TRIM(BOTH FROM "name")) > 0))
);


--
-- Name: COLUMN "dev_player_join_presets"."play_windows"; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN "public"."dev_player_join_presets"."play_windows" IS 'Daily time windows when this join preset is active (same format as dev_player_configs.play_windows).';


--
-- Name: dev_player_settings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."dev_player_settings" (
    "id" boolean DEFAULT true NOT NULL,
    "system_enabled" boolean DEFAULT false NOT NULL,
    "scheduler_enabled" boolean DEFAULT false NOT NULL,
    "timezone" "text" DEFAULT 'Asia/Tehran'::"text" NOT NULL,
    "default_play_windows" "jsonb" DEFAULT '[{"end": "22:00", "start": "10:00"}]'::"jsonb" NOT NULL,
    "default_min_room_price" numeric,
    "default_max_room_price" numeric,
    "default_max_ticket_count" integer DEFAULT 2 NOT NULL,
    "min_wallet_balance" numeric DEFAULT 0 NOT NULL,
    "template_selection_mode" "text" DEFAULT 'any_in_price_range'::"text" NOT NULL,
    "template_whitelist_ids" "uuid"[] DEFAULT '{}'::"uuid"[] NOT NULL,
    "exclude_vip" boolean DEFAULT true NOT NULL,
    "exclude_tournament" boolean DEFAULT true NOT NULL,
    "auto_approve_schedules" boolean DEFAULT true NOT NULL,
    "updated_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "selection_min_room_price" numeric,
    "selection_max_room_price" numeric,
    "template_room_limit_enabled_ids" "uuid"[] DEFAULT '{}'::"uuid"[] NOT NULL,
    "active_join_preset_id" "uuid",
    "scheduler_tick_interval_seconds" integer DEFAULT 60 NOT NULL,
    "scheduler_pause_after_seconds" integer,
    "scheduler_pause_duration_seconds" integer,
    "scheduler_cycle_phase" "text" DEFAULT 'work'::"text" NOT NULL,
    "scheduler_cycle_phase_ends_at" timestamp with time zone,
    "scheduler_next_join_at_by_template" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "processor_tick_interval_seconds" integer DEFAULT 60 NOT NULL,
    "scheduler_joins_in_work_cycle_by_template" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "scheduler_behavior_state" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    CONSTRAINT "dev_player_settings_default_max_ticket_count_check" CHECK ((("default_max_ticket_count" > 0) AND ("default_max_ticket_count" <= 50))),
    CONSTRAINT "dev_player_settings_default_price_range_check" CHECK ((("default_min_room_price" IS NULL) OR ("default_max_room_price" IS NULL) OR ("default_min_room_price" <= "default_max_room_price"))),
    CONSTRAINT "dev_player_settings_id_check" CHECK (("id" = true)),
    CONSTRAINT "dev_player_settings_min_wallet_balance_check" CHECK (("min_wallet_balance" >= (0)::numeric)),
    CONSTRAINT "dev_player_settings_processor_tick_interval_check" CHECK ((("processor_tick_interval_seconds" >= 5) AND ("processor_tick_interval_seconds" <= 3600))),
    CONSTRAINT "dev_player_settings_scheduler_cycle_phase_check" CHECK (("scheduler_cycle_phase" = ANY (ARRAY['work'::"text", 'pause'::"text"]))),
    CONSTRAINT "dev_player_settings_scheduler_pause_after_check" CHECK ((("scheduler_pause_after_seconds" IS NULL) OR (("scheduler_pause_after_seconds" >= 5) AND ("scheduler_pause_after_seconds" <= 86400)))),
    CONSTRAINT "dev_player_settings_scheduler_pause_duration_check" CHECK ((("scheduler_pause_duration_seconds" IS NULL) OR (("scheduler_pause_duration_seconds" >= 5) AND ("scheduler_pause_duration_seconds" <= 86400)))),
    CONSTRAINT "dev_player_settings_scheduler_pause_pair_check" CHECK (((("scheduler_pause_after_seconds" IS NULL) AND ("scheduler_pause_duration_seconds" IS NULL)) OR (("scheduler_pause_after_seconds" IS NOT NULL) AND ("scheduler_pause_duration_seconds" IS NOT NULL)))),
    CONSTRAINT "dev_player_settings_scheduler_tick_interval_check" CHECK ((("scheduler_tick_interval_seconds" >= 5) AND ("scheduler_tick_interval_seconds" <= 3600))),
    CONSTRAINT "dev_player_settings_selection_price_range_check" CHECK ((("selection_min_room_price" IS NULL) OR ("selection_max_room_price" IS NULL) OR ("selection_min_room_price" <= "selection_max_room_price"))),
    CONSTRAINT "dev_player_settings_singleton" CHECK (("id" = true)),
    CONSTRAINT "dev_player_settings_template_selection_mode_check" CHECK (("template_selection_mode" = ANY (ARRAY['any_in_price_range'::"text", 'cheapest'::"text", 'random'::"text", 'whitelist'::"text"])))
);


--
-- Name: TABLE "dev_player_settings"; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE "public"."dev_player_settings" IS 'Singleton global settings for Dev Player automation (Dev Panel → Settings).';


--
-- Name: COLUMN "dev_player_settings"."selection_min_room_price"; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN "public"."dev_player_settings"."selection_min_room_price" IS 'Min room template price when template_selection_mode = any_in_price_range.';


--
-- Name: COLUMN "dev_player_settings"."selection_max_room_price"; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN "public"."dev_player_settings"."selection_max_room_price" IS 'Max room template price when template_selection_mode = any_in_price_range.';


--
-- Name: COLUMN "dev_player_settings"."template_room_limit_enabled_ids"; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN "public"."dev_player_settings"."template_room_limit_enabled_ids" IS 'Templates included in dev player active-room limit checks (Dev Panel checkbox list).';


--
-- Name: COLUMN "dev_player_settings"."scheduler_tick_interval_seconds"; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN "public"."dev_player_settings"."scheduler_tick_interval_seconds" IS 'How often game-engine dev-player-scheduler runs a tick (seconds).';


--
-- Name: COLUMN "dev_player_settings"."scheduler_pause_after_seconds"; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN "public"."dev_player_settings"."scheduler_pause_after_seconds" IS 'Active scheduler window length (seconds) before each cyclical pause.';


--
-- Name: COLUMN "dev_player_settings"."scheduler_pause_duration_seconds"; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN "public"."dev_player_settings"."scheduler_pause_duration_seconds" IS 'Scheduler pause length (seconds) after each active window.';


--
-- Name: COLUMN "dev_player_settings"."scheduler_cycle_phase"; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN "public"."dev_player_settings"."scheduler_cycle_phase" IS 'Current random scheduler cycle phase: work or pause.';


--
-- Name: COLUMN "dev_player_settings"."scheduler_cycle_phase_ends_at"; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN "public"."dev_player_settings"."scheduler_cycle_phase_ends_at" IS 'UTC timestamp when the current work/pause phase ends and the next phase begins.';


--
-- Name: COLUMN "dev_player_settings"."scheduler_next_join_at_by_template"; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN "public"."dev_player_settings"."scheduler_next_join_at_by_template" IS 'Map of template_id -> ISO timestamp: earliest allowed next dev player join for that template.';


--
-- Name: COLUMN "dev_player_settings"."processor_tick_interval_seconds"; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN "public"."dev_player_settings"."processor_tick_interval_seconds" IS 'How often game-engine dev-player-processor picks and runs dev_room_schedules (seconds).';


--
-- Name: COLUMN "dev_player_settings"."scheduler_joins_in_work_cycle_by_template"; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN "public"."dev_player_settings"."scheduler_joins_in_work_cycle_by_template" IS 'Map of template_id -> join schedules created in the current work phase (resets when work phase starts).';


--
-- Name: COLUMN "dev_player_settings"."scheduler_behavior_state"; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN "public"."dev_player_settings"."scheduler_behavior_state" IS 'Counter-based scheduler v1: cycleStartedAt, cycleEndsAt, per-template mode/counters (not full action plans).';


--
-- Name: dev_player_template_room_limits; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."dev_player_template_room_limits" (
    "template_id" "uuid" NOT NULL,
    "min_active_rooms" integer,
    "max_active_rooms" integer,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "join_interval_minutes" integer,
    "max_joins_per_tick" integer,
    CONSTRAINT "dev_player_template_room_limits_has_value_check" CHECK ((("min_active_rooms" IS NOT NULL) OR ("max_active_rooms" IS NOT NULL) OR ("join_interval_minutes" IS NOT NULL) OR ("max_joins_per_tick" IS NOT NULL))),
    CONSTRAINT "dev_player_template_room_limits_join_interval_check" CHECK ((("join_interval_minutes" IS NULL) OR (("join_interval_minutes" >= 1) AND ("join_interval_minutes" <= 120)))),
    CONSTRAINT "dev_player_template_room_limits_max_check" CHECK ((("max_active_rooms" IS NULL) OR ("max_active_rooms" >= 0))),
    CONSTRAINT "dev_player_template_room_limits_max_joins_check" CHECK ((("max_joins_per_tick" IS NULL) OR (("max_joins_per_tick" >= 1) AND ("max_joins_per_tick" <= 100)))),
    CONSTRAINT "dev_player_template_room_limits_min_check" CHECK ((("min_active_rooms" IS NULL) OR ("min_active_rooms" >= 0))),
    CONSTRAINT "dev_player_template_room_limits_range_check" CHECK ((("min_active_rooms" IS NULL) OR ("max_active_rooms" IS NULL) OR ("min_active_rooms" <= "max_active_rooms")))
);


--
-- Name: TABLE "dev_player_template_room_limits"; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE "public"."dev_player_template_room_limits" IS 'Per-template min/max active room (waiting/playing) window before dev players may join.';


--
-- Name: ding_balances; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."ding_balances" (
    "user_id" "uuid" NOT NULL,
    "balance" bigint DEFAULT 0,
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "created_at" timestamp with time zone DEFAULT "now"(),
    "locked_amount" bigint DEFAULT 0 NOT NULL,
    CONSTRAINT "ding_balances_balance_check" CHECK ((("balance")::numeric >= (0)::numeric))
);


--
-- Name: ding_transactions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."ding_transactions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "room_id" "uuid",
    "ticket_id" "uuid",
    "draw_id" "uuid",
    "drawn_number" integer NOT NULL,
    "amount" numeric NOT NULL,
    "description" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "ding_transactions_amount_check" CHECK (("amount" > (0)::numeric)),
    CONSTRAINT "ding_transactions_drawn_number_check" CHECK ((("drawn_number" >= 1) AND ("drawn_number" <= 90)))
);


--
-- Name: draw_jobs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."draw_jobs" (
    "id" bigint NOT NULL,
    "room_id" "uuid" NOT NULL,
    "draw_number" integer NOT NULL,
    "status" "text" DEFAULT 'queued'::"text" NOT NULL,
    "attempts" integer DEFAULT 0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


--
-- Name: draw_jobs_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE "public"."draw_jobs_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: draw_jobs_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE "public"."draw_jobs_id_seq" OWNED BY "public"."draw_jobs"."id";


--
-- Name: draws; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."draws" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "room_id" "uuid" NOT NULL,
    "number" integer NOT NULL,
    "timestamp" timestamp with time zone DEFAULT "now"() NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "processed_at" timestamp with time zone,
    "ding_processed_at" timestamp with time zone,
    "ding_aggregated_at" timestamp with time zone,
    "queue_wait_ms" integer,
    "processing_ms" integer,
    "finalize_ms" integer,
    "drain_started_at" timestamp with time zone,
    "drain_ended_at" timestamp with time zone,
    "drain_duration_ms" integer,
    "first_picked_at" timestamp with time zone,
    "handler_started_at" timestamp with time zone,
    "actor_due_at" timestamp with time zone,
    "actor_insert_started_at" timestamp with time zone,
    "actor_inserted_at" timestamp with time zone,
    "actor_evaluate_started_at" timestamp with time zone,
    "actor_finalize_started_at" timestamp with time zone,
    "actor_next_scheduled_at" timestamp with time zone,
    CONSTRAINT "draws_number_check" CHECK ((("number" >= 1) AND ("number" <= 90)))
);

ALTER TABLE ONLY "public"."draws" REPLICA IDENTITY FULL;


--
-- Name: COLUMN "draws"."queue_wait_ms"; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN "public"."draws"."queue_wait_ms" IS 'Ms from draw_jobs.created_at until engine handler started (global queue + batch scheduling).';


--
-- Name: COLUMN "draws"."processing_ms"; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN "public"."draws"."processing_ms" IS 'Ms from handler start through evaluate/ding prep (load, defer gate, reconcile, bitmask).';


--
-- Name: COLUMN "draws"."finalize_ms"; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN "public"."draws"."finalize_ms" IS 'Ms for rpc_finalize_engine_draw_job server execution (marks, results, ding, processed_at).';


--
-- Name: COLUMN "draws"."drain_started_at"; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN "public"."draws"."drain_started_at" IS 'When the draw-processor drain() tick that picked this job started.';


--
-- Name: COLUMN "draws"."drain_ended_at"; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN "public"."draws"."drain_ended_at" IS 'When that drain() tick finished (set for all draws in the same drain cycle).';


--
-- Name: COLUMN "draws"."drain_duration_ms"; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN "public"."draws"."drain_duration_ms" IS 'Wall ms of the drain() tick (drain_ended_at - drain_started_at).';


--
-- Name: COLUMN "draws"."first_picked_at"; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN "public"."draws"."first_picked_at" IS 'When rpc_pick_draw_jobs claimed this job (queued -> processing).';


--
-- Name: COLUMN "draws"."handler_started_at"; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN "public"."draws"."handler_started_at" IS 'When the engine job handler began (queue_wait_ms anchor end).';


--
-- Name: entry_banners; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."entry_banners" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "title" "text" NOT NULL,
    "content_type" "text" NOT NULL,
    "text_content" "text",
    "image_url" "text",
    "image_size" integer,
    "image_width" integer,
    "image_height" integer,
    "start_date" timestamp with time zone,
    "end_date" timestamp with time zone,
    "target_audience" "text"[] DEFAULT ARRAY[]::"text"[],
    "require_confirmation" boolean DEFAULT false,
    "confirmation_text" "text",
    "is_active" boolean DEFAULT true,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "created_by" "uuid",
    CONSTRAINT "entry_banners_content_type_check" CHECK (("content_type" = ANY (ARRAY['text'::"text", 'image'::"text"])))
);


--
-- Name: TABLE "entry_banners"; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE "public"."entry_banners" IS 'Stores entry banners that are shown to users on login';


--
-- Name: COLUMN "entry_banners"."content_type"; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN "public"."entry_banners"."content_type" IS 'Type of content: text or image';


--
-- Name: COLUMN "entry_banners"."text_content"; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN "public"."entry_banners"."text_content" IS 'Text content if content_type is text';


--
-- Name: COLUMN "entry_banners"."image_url"; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN "public"."entry_banners"."image_url" IS 'URL of image if content_type is image';


--
-- Name: COLUMN "entry_banners"."image_size"; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN "public"."entry_banners"."image_size" IS 'Size of image in bytes (max 1MB)';


--
-- Name: COLUMN "entry_banners"."image_width"; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN "public"."entry_banners"."image_width" IS 'Width of image in pixels (max 1000)';


--
-- Name: COLUMN "entry_banners"."image_height"; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN "public"."entry_banners"."image_height" IS 'Height of image in pixels (max 1300)';


--
-- Name: COLUMN "entry_banners"."target_audience"; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN "public"."entry_banners"."target_audience" IS 'Array of roles that should see this banner';


--
-- Name: COLUMN "entry_banners"."require_confirmation"; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN "public"."entry_banners"."require_confirmation" IS 'Whether user must check a confirmation to close banner';


--
-- Name: COLUMN "entry_banners"."confirmation_text"; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN "public"."entry_banners"."confirmation_text" IS 'Text that user must check to close banner';


--
-- Name: finance_recon_reports; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."finance_recon_reports" (
    "id" bigint NOT NULL,
    "kind" "text" NOT NULL,
    "status" "text" NOT NULL,
    "summary" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "details" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "finance_recon_reports_kind_check" CHECK (("kind" = ANY (ARRAY['wallet_ledger'::"text", 'money_conservation'::"text", 'combined'::"text"]))),
    CONSTRAINT "finance_recon_reports_status_check" CHECK (("status" = ANY (ARRAY['ok'::"text", 'drift'::"text", 'error'::"text"])))
);

ALTER TABLE ONLY "public"."finance_recon_reports" FORCE ROW LEVEL SECURITY;


--
-- Name: finance_recon_reports_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE "public"."finance_recon_reports_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: finance_recon_reports_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE "public"."finance_recon_reports_id_seq" OWNED BY "public"."finance_recon_reports"."id";


--
-- Name: heartbeat_log; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."heartbeat_log" (
    "id" bigint NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
)
PARTITION BY RANGE ("created_at");


--
-- Name: heartbeat_log_default; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."heartbeat_log_default" (
    "id" bigint NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


--
-- Name: heartbeat_log_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE "public"."heartbeat_log_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: heartbeat_log_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE "public"."heartbeat_log_id_seq" OWNED BY "public"."heartbeat_log_default"."id";


--
-- Name: heartbeat_log_20260808; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."heartbeat_log_20260808" (
    "id" bigint DEFAULT "nextval"('"public"."heartbeat_log_id_seq"'::"regclass") NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


--
-- Name: heartbeat_log_20260809; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."heartbeat_log_20260809" (
    "id" bigint DEFAULT "nextval"('"public"."heartbeat_log_id_seq"'::"regclass") NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


--
-- Name: heartbeat_log_20260810; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."heartbeat_log_20260810" (
    "id" bigint DEFAULT "nextval"('"public"."heartbeat_log_id_seq"'::"regclass") NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


--
-- Name: heartbeat_log_20260811; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."heartbeat_log_20260811" (
    "id" bigint DEFAULT "nextval"('"public"."heartbeat_log_id_seq"'::"regclass") NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


--
-- Name: heartbeat_log_20260812; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."heartbeat_log_20260812" (
    "id" bigint DEFAULT "nextval"('"public"."heartbeat_log_id_seq"'::"regclass") NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


--
-- Name: heartbeat_log_20260813; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."heartbeat_log_20260813" (
    "id" bigint DEFAULT "nextval"('"public"."heartbeat_log_id_seq"'::"regclass") NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


--
-- Name: heartbeat_log_20260814; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."heartbeat_log_20260814" (
    "id" bigint DEFAULT "nextval"('"public"."heartbeat_log_id_seq"'::"regclass") NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


--
-- Name: heartbeat_log_20260815; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."heartbeat_log_20260815" (
    "id" bigint DEFAULT "nextval"('"public"."heartbeat_log_id_seq"'::"regclass") NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


--
-- Name: heartbeat_log_20260816; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."heartbeat_log_20260816" (
    "id" bigint DEFAULT "nextval"('"public"."heartbeat_log_id_seq"'::"regclass") NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


--
-- Name: heartbeat_log_20260817; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."heartbeat_log_20260817" (
    "id" bigint DEFAULT "nextval"('"public"."heartbeat_log_id_seq"'::"regclass") NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


--
-- Name: invitation_links; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."invitation_links" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "code" "text" NOT NULL,
    "inviter_id" "uuid" NOT NULL,
    "inviter_role" "public"."user_role" NOT NULL,
    "internal_name" "text",
    "internal_note" "text",
    "is_active" boolean DEFAULT true NOT NULL,
    "max_uses" integer,
    "current_uses" integer DEFAULT 0 NOT NULL,
    "expires_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "invitation_links_current_uses_check" CHECK (("current_uses" >= 0)),
    CONSTRAINT "invitation_links_inviter_role_check" CHECK (("inviter_role" = ANY (ARRAY['admin'::"public"."user_role", 'agent'::"public"."user_role", 'super'::"public"."user_role"])))
);


--
-- Name: TABLE "invitation_links"; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE "public"."invitation_links" IS 'جدول لینک‌های دعوت یکتا برای ثبت‌نام player ها';


--
-- Name: COLUMN "invitation_links"."code"; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN "public"."invitation_links"."code" IS 'کد یکتای 6-8 کاراکتری که در URL استفاده می‌شود';


--
-- Name: COLUMN "invitation_links"."inviter_role"; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN "public"."invitation_links"."inviter_role" IS 'نقش دعوت‌کننده: admin, agent, یا super';


--
-- Name: kyc_submissions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."kyc_submissions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "kyc_code" "text" NOT NULL,
    "declaration_text" "text" NOT NULL,
    "image_data" "bytea",
    "image_mime_type" "text" DEFAULT 'image/jpeg'::"text" NOT NULL,
    "image_byte_size" integer NOT NULL,
    "quality_checks" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "status" "text" DEFAULT 'pending_review'::"text" NOT NULL,
    "client_request_id" "text" NOT NULL,
    "rejection_reason" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "reviewed_at" timestamp with time zone,
    "reviewed_by" "uuid",
    "rejection_reason_code" "text",
    "player_result_seen_at" timestamp with time zone,
    "image_purged_at" timestamp with time zone,
    CONSTRAINT "kyc_submissions_image_size_check" CHECK ((("image_byte_size" IS NULL) OR (("image_byte_size" >= 0) AND ("image_byte_size" <= 3145728)))),
    CONSTRAINT "kyc_submissions_rejection_reason_code_check" CHECK ((("rejection_reason_code" IS NULL) OR ("rejection_reason_code" = ANY (ARRAY['blurry'::"text", 'cards_unreadable'::"text", 'wrong_text'::"text", 'invalid_kyc_code'::"text"])))),
    CONSTRAINT "kyc_submissions_status_check" CHECK (("status" = ANY (ARRAY['pending_review'::"text", 'approved'::"text", 'rejected'::"text", 'expired'::"text"])))
);


--
-- Name: TABLE "kyc_submissions"; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE "public"."kyc_submissions" IS 'Player KYC selfie+document submissions. Images stored temporarily unencrypted for manual review.';


--
-- Name: COLUMN "kyc_submissions"."player_result_seen_at"; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN "public"."kyc_submissions"."player_result_seen_at" IS 'Set when the player dismisses the entry popup for this review result.';


--
-- Name: COLUMN "kyc_submissions"."image_purged_at"; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN "public"."kyc_submissions"."image_purged_at" IS 'When image_data was cleared after admin approve; submission history remains.';


--
-- Name: marks; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."marks" (
    "ticket_id" "uuid" NOT NULL,
    "value" integer NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


--
-- Name: player_affiliation; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."player_affiliation" (
    "user_id" "uuid" NOT NULL,
    "agent_id" "uuid",
    "super_id" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "chk_affiliation_loop" CHECK (((("agent_id" IS NULL) OR ("user_id" <> "agent_id")) AND (("super_id" IS NULL) OR ("user_id" <> "super_id")) AND (("agent_id" IS NULL) OR ("super_id" IS NULL) OR ("agent_id" <> "super_id"))))
);


--
-- Name: player_signups; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."player_signups" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "invitation_link_id" "uuid" NOT NULL,
    "player_id" "uuid" NOT NULL,
    "signed_up_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


--
-- Name: TABLE "player_signups"; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE "public"."player_signups" IS 'لاگ ثبت‌نام‌های انجام شده از طریق لینک‌های دعوت';


--
-- Name: results; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."results" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "room_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "ticket_id" "uuid" NOT NULL,
    "win_type" "text" NOT NULL,
    "reward_amount" numeric(12,2) DEFAULT 0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "draw_number" integer,
    "paid_at" timestamp with time zone,
    CONSTRAINT "results_win_type_check" CHECK (("win_type" = ANY (ARRAY['line'::"text", 'full'::"text"])))
);


--
-- Name: COLUMN "results"."draw_number"; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN "public"."results"."draw_number" IS 'شماره Draw که در آن برنده شده است - برای شناسایی برندگان همزمان';


--
-- Name: room_templates; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."room_templates" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "price" numeric NOT NULL,
    "currency" "text" DEFAULT 'IRR'::"text" NOT NULL,
    "min_players" integer DEFAULT 2 NOT NULL,
    "countdown_sec" integer DEFAULT 120 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "line_reward_percentage" numeric DEFAULT 0.5,
    "full_reward_percentage" numeric DEFAULT 0.8,
    "vip" boolean DEFAULT false,
    "password" "text",
    "repeatable" boolean DEFAULT false,
    "scheduled_start_time" time without time zone,
    "ding_per_number" numeric DEFAULT 1,
    "room_type" "public"."room_type" DEFAULT 'normal'::"public"."room_type" NOT NULL,
    "commission_rate" numeric DEFAULT 0,
    "max_cards_per_player" integer DEFAULT 10,
    "name" "text" DEFAULT ''::"text" NOT NULL,
    "status" "public"."room_template_status" DEFAULT 'active'::"public"."room_template_status" NOT NULL,
    "draw_interval_sec" integer DEFAULT 3 NOT NULL,
    "waiting_timeout_seconds" integer DEFAULT 120 NOT NULL,
    "max_players" integer,
    CONSTRAINT "room_templates_countdown_sec_check" CHECK (("countdown_sec" >= 10)),
    CONSTRAINT "room_templates_ding_per_number_check" CHECK (("ding_per_number" >= (0)::numeric)),
    CONSTRAINT "room_templates_draw_interval_sec_check" CHECK ((("draw_interval_sec" >= 1) AND ("draw_interval_sec" <= 600))),
    CONSTRAINT "room_templates_full_reward_percentage_check" CHECK ((("full_reward_percentage" >= (0)::numeric) AND ("full_reward_percentage" <= (1)::numeric))),
    CONSTRAINT "room_templates_line_reward_percentage_check" CHECK ((("line_reward_percentage" >= (0)::numeric) AND ("line_reward_percentage" <= (1)::numeric))),
    CONSTRAINT "room_templates_max_players_check" CHECK ((("max_players" IS NULL) OR ("max_players" >= 1))),
    CONSTRAINT "room_templates_min_players_check" CHECK (("min_players" >= 2)),
    CONSTRAINT "room_templates_price_check" CHECK ((("price" > (0)::numeric) OR (("room_type" = 'tournament'::"public"."room_type") AND ("price" = (0)::numeric)))),
    CONSTRAINT "room_templates_waiting_timeout_seconds_check" CHECK (("waiting_timeout_seconds" >= 10))
);


--
-- Name: COLUMN "room_templates"."line_reward_percentage"; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN "public"."room_templates"."line_reward_percentage" IS 'درصد جایزه برای برنده خط (line win) - پیش‌فرض: 0.5 (50%)';


--
-- Name: COLUMN "room_templates"."full_reward_percentage"; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN "public"."room_templates"."full_reward_percentage" IS 'درصد جایزه برای برنده پر (full card win) - پیش‌فرض: 0.8 (80%)';


--
-- Name: COLUMN "room_templates"."vip"; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN "public"."room_templates"."vip" IS 'آیا Room VIP است یا خیر';


--
-- Name: COLUMN "room_templates"."password"; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN "public"."room_templates"."password" IS 'پسورد Room VIP';


--
-- Name: COLUMN "room_templates"."repeatable"; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN "public"."room_templates"."repeatable" IS 'آیا Room با همان پسورد قابل ساخت مجدد است یا خیر';


--
-- Name: COLUMN "room_templates"."scheduled_start_time"; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN "public"."room_templates"."scheduled_start_time" IS 'زمان شروع برنامه‌ریزی‌شده Room (مثلاً 14:30:00) - اگر null باشد، Room با رسیدن به min_players شروع می‌شود';


--
-- Name: COLUMN "room_templates"."ding_per_number"; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN "public"."room_templates"."ding_per_number" IS 'تعداد Ding به ازای هر عدد قرعه‌کشی شده که روی کارت بازیکن باشد';


--
-- Name: COLUMN "room_templates"."draw_interval_sec"; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN "public"."room_templates"."draw_interval_sec" IS 'فاصله بین دو قرعه (بر حسب ثانیه) برای روم‌هایی که از این template ساخته می‌شوند؛ پیش‌فرض ۳ ثانیه';


--
-- Name: room_winners; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."room_winners" (
    "room_id" "uuid" NOT NULL,
    "ticket_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "weight" numeric DEFAULT 1 NOT NULL
);


--
-- Name: tickets; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."tickets" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "room_id" "uuid" NOT NULL,
    "player_user_id" "uuid" NOT NULL,
    "pool_card_id" bigint NOT NULL,
    "card_no" smallint NOT NULL,
    "reservation_status" "public"."reservation_status" DEFAULT 'held'::"public"."reservation_status" NOT NULL,
    "transaction_id" "uuid",
    "expires_at" timestamp with time zone,
    "claimed_bingo_at" timestamp with time zone,
    "is_verified_win" boolean DEFAULT false NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "price" numeric(10,2) NOT NULL,
    "cancelled_at" timestamp with time zone
);


--
-- Name: tournament_commission_log; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."tournament_commission_log" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tournament_id" "uuid" NOT NULL,
    "entry_id" "uuid" NOT NULL,
    "beneficiary_user_id" "uuid" NOT NULL,
    "role" "text" NOT NULL,
    "amount" numeric(14,2) NOT NULL,
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "meta" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "paid_at" timestamp with time zone,
    CONSTRAINT "tournament_commission_payouts_amount_check" CHECK (("amount" >= (0)::numeric)),
    CONSTRAINT "tournament_commission_payouts_role_check" CHECK (("role" = ANY (ARRAY['agent'::"text", 'super'::"text", 'admin'::"text", 'platform'::"text"]))),
    CONSTRAINT "tournament_commission_payouts_status_check" CHECK (("status" = ANY (ARRAY['pending'::"text", 'paid'::"text", 'failed'::"text"])))
);


--
-- Name: tournament_commission_payouts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."tournament_commission_payouts" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tournament_id" "uuid" NOT NULL,
    "entry_id" "uuid" NOT NULL,
    "beneficiary_user_id" "uuid" NOT NULL,
    "role" "text" NOT NULL,
    "amount" numeric NOT NULL,
    "currency" "text" DEFAULT 'IRR'::"text" NOT NULL,
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "meta" "jsonb",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "paid_at" timestamp with time zone
);


--
-- Name: tournament_commission_snapshots; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."tournament_commission_snapshots" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tournament_id" "uuid" NOT NULL,
    "entry_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "agent_id" "uuid",
    "super_id" "uuid",
    "admin_id" "uuid",
    "gross_amount" numeric DEFAULT 0 NOT NULL,
    "commission_rate" numeric,
    "commission_base" numeric,
    "agent_rate" numeric,
    "super_rate" numeric,
    "agent_amount" numeric DEFAULT 0 NOT NULL,
    "super_amount" numeric DEFAULT 0 NOT NULL,
    "admin_amount" numeric DEFAULT 0 NOT NULL,
    "amount_to_pool" numeric DEFAULT 0 NOT NULL,
    "currency" "text" DEFAULT 'IRR'::"text" NOT NULL,
    "commission_model" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


--
-- Name: tournament_payouts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."tournament_payouts" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tournament_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "rank" integer NOT NULL,
    "amount" numeric(14,2) NOT NULL,
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "meta" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "paid_at" timestamp with time zone,
    CONSTRAINT "tournament_payouts_amount_check" CHECK (("amount" >= (0)::numeric)),
    CONSTRAINT "tournament_payouts_rank_check" CHECK (("rank" >= 1)),
    CONSTRAINT "tournament_payouts_status_check" CHECK (("status" = ANY (ARRAY['pending'::"text", 'paid'::"text", 'failed'::"text"])))
);


--
-- Name: tournament_prize_rules; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."tournament_prize_rules" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tournament_id" "uuid" NOT NULL,
    "rank" integer NOT NULL,
    "payout_type" "text" NOT NULL,
    "payout_value" numeric(14,2) NOT NULL,
    "meta" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "tournament_prize_rules_payout_type_check" CHECK (("payout_type" = ANY (ARRAY['percent'::"text", 'fixed'::"text"]))),
    CONSTRAINT "tournament_prize_rules_payout_value_check" CHECK (("payout_value" >= (0)::numeric)),
    CONSTRAINT "tournament_prize_rules_rank_check" CHECK (("rank" >= 1))
);


--
-- Name: tournament_round_assignments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."tournament_round_assignments" (
    "tournament_id" "uuid" NOT NULL,
    "round_no" integer NOT NULL,
    "room_id" "uuid",
    "user_id" "uuid" NOT NULL,
    "seed" integer,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "cards_count" integer NOT NULL,
    "trr_id" "uuid",
    "game_room_id" "uuid",
    CONSTRAINT "tournament_round_assignments_round_no_check" CHECK (("round_no" >= 1)),
    CONSTRAINT "tra_cards_count_check" CHECK (("cards_count" >= 1))
);


--
-- Name: tournament_round_rooms; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."tournament_round_rooms" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tournament_id" "uuid" NOT NULL,
    "round_no" integer NOT NULL,
    "table_no" integer NOT NULL,
    "room_id" "uuid",
    "status" "public"."tournament_round_room_status" DEFAULT 'created'::"public"."tournament_round_room_status" NOT NULL,
    "meta" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "target_players" integer DEFAULT 0 NOT NULL,
    "seated_players" integer DEFAULT 0 NOT NULL,
    "room_template_id" "uuid",
    "updated_at" timestamp with time zone,
    CONSTRAINT "tournament_round_rooms_round_no_check" CHECK (("round_no" >= 1)),
    CONSTRAINT "tournament_round_rooms_table_no_check" CHECK (("table_no" >= 1)),
    CONSTRAINT "trr_seated_le_target" CHECK (("seated_players" <= "target_players")),
    CONSTRAINT "trr_seated_players_nonneg" CHECK (("seated_players" >= 0)),
    CONSTRAINT "trr_target_players_nonneg" CHECK (("target_players" >= 0))
);


--
-- Name: transactions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."transactions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "wallet_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "type" "public"."transaction_type" NOT NULL,
    "status" "public"."transaction_status" DEFAULT 'completed'::"public"."transaction_status" NOT NULL,
    "amount" numeric(14,2) NOT NULL,
    "currency" "text" DEFAULT 'IRR'::"text" NOT NULL,
    "description" "text",
    "related_room" "uuid",
    "balance_before" numeric(14,2),
    "balance_after" numeric(14,2),
    "meta" "jsonb",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "source_kind" "text",
    "source_ticket_id" "uuid",
    "source_room_id" "uuid",
    "source_ref" "text",
    "idempotency_key" "text",
    "ticket_id" "uuid",
    "room_id" "uuid",
    CONSTRAINT "chk_tx_commission_ticket" CHECK ((("source_kind" IS DISTINCT FROM 'commission'::"text") OR ("source_ticket_id" IS NOT NULL))),
    CONSTRAINT "chk_tx_prize_room" CHECK ((("source_kind" IS DISTINCT FROM 'prize_room_payout'::"text") OR ("source_room_id" IS NOT NULL)))
);


--
-- Name: user_commissions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."user_commissions" (
    "user_id" "uuid" NOT NULL,
    "agent_commission" numeric,
    "super_commission" numeric,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "user_commissions_agent_check" CHECK ((("agent_commission" IS NULL) OR (("agent_commission" >= (0)::numeric) AND ("agent_commission" <= (1)::numeric)))),
    CONSTRAINT "user_commissions_super_check" CHECK ((("super_commission" IS NULL) OR (("super_commission" >= (0)::numeric) AND ("super_commission" <= (1)::numeric))))
);


--
-- Name: user_notes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."user_notes" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "author_id" "uuid" NOT NULL,
    "note" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "user_notes_note_check" CHECK (("char_length"("note") <= 150))
);


--
-- Name: TABLE "user_notes"; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE "public"."user_notes" IS 'یادداشت‌های شخصی که admin/agent/super در مورد کاربران زیرمجموعه خود می‌نویسند (حداکثر 150 کاراکتر)';


--
-- Name: COLUMN "user_notes"."user_id"; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN "public"."user_notes"."user_id" IS 'کاربری که یادداشت درباره اوست';


--
-- Name: COLUMN "user_notes"."author_id"; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN "public"."user_notes"."author_id" IS 'کسی که یادداشت را نوشته (admin/agent/super)';


--
-- Name: COLUMN "user_notes"."note"; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN "public"."user_notes"."note" IS 'متن یادداشت (حداکثر 150 کاراکتر)';


--
-- Name: user_profiles; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."user_profiles" (
    "user_id" "uuid" NOT NULL,
    "nickname" "text",
    "avatar_url" "text",
    "country" "text",
    "language" "text" DEFAULT 'fa'::"text",
    "metadata" "jsonb",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "full_name" "text",
    "phone" "text",
    CONSTRAINT "user_profiles_full_name_len_chk" CHECK ((("full_name" IS NULL) OR (("char_length"("btrim"("full_name")) >= 3) AND ("char_length"("btrim"("full_name")) <= 120)))),
    CONSTRAINT "user_profiles_phone_format_chk" CHECK ((("phone" IS NULL) OR ("phone" ~ '^09[0-9]{9}$'::"text")))
);


--
-- Name: COLUMN "user_profiles"."full_name"; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN "public"."user_profiles"."full_name" IS 'Player full name (نام و نام خانوادگی) for fiat deposit / HamiPay. First-write locked.';


--
-- Name: COLUMN "user_profiles"."phone"; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN "public"."user_profiles"."phone" IS 'Player mobile for fiat deposit / HamiPay (09xxxxxxxxx). First-write locked.';


--
-- Name: user_profiles_old_backup; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."user_profiles_old_backup" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "username" "text",
    "nickname" "text",
    "email" "text",
    "role" "public"."user_role" NOT NULL,
    "parent_id" "uuid",
    "status" "public"."user_status" DEFAULT 'active'::"public"."user_status" NOT NULL,
    "balance" numeric(12,2) DEFAULT 0 NOT NULL,
    "must_change_password" boolean DEFAULT false NOT NULL,
    "avatar_url" "text",
    "country" "text",
    "language" "text" DEFAULT 'fa'::"text",
    "metadata" "jsonb",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "last_login_at" timestamp with time zone,
    "agent_commission" numeric,
    "super_commission" numeric,
    CONSTRAINT "chk_commission_by_role" CHECK (((("role" = 'agent'::"public"."user_role") AND ("agent_commission" IS NOT NULL) AND ("super_commission" IS NULL)) OR (("role" = 'super'::"public"."user_role") AND ("super_commission" IS NOT NULL) AND ("agent_commission" IS NULL)) OR (("role" = ANY (ARRAY['player'::"public"."user_role", 'admin'::"public"."user_role"])) AND ("agent_commission" IS NULL) AND ("super_commission" IS NULL)))),
    CONSTRAINT "user_profiles_agent_commission_check" CHECK ((("agent_commission" IS NULL) OR (("agent_commission" >= (0)::numeric) AND ("agent_commission" <= (1)::numeric)))),
    CONSTRAINT "user_profiles_super_commission_check" CHECK ((("super_commission" IS NULL) OR (("super_commission" >= (0)::numeric) AND ("super_commission" <= (1)::numeric))))
);


--
-- Name: users; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."users" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "username" "text",
    "email" "text",
    "must_change_password" boolean DEFAULT false NOT NULL,
    "role" "public"."user_role" DEFAULT 'player'::"public"."user_role" NOT NULL,
    "status" "public"."user_status" DEFAULT 'active'::"public"."user_status" NOT NULL,
    "parent_id" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "last_login_at" timestamp with time zone,
    "referral_code" "text",
    "admin_sub_role" "public"."admin_sub_role",
    "last_seen_at" timestamp with time zone,
    "kyc_verified" boolean DEFAULT false NOT NULL
);


--
-- Name: COLUMN "users"."referral_code"; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN "public"."users"."referral_code" IS 'کد معرف یکتا برای هر کاربر (agent, super, یا player)';


--
-- Name: COLUMN "users"."admin_sub_role"; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN "public"."users"."admin_sub_role" IS 'Sub-role for admin users: null/manager (full admin), finance, support, room, dev_panel';


--
-- Name: COLUMN "users"."kyc_verified"; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN "public"."users"."kyc_verified" IS 'True when player has an approved KYC submission; drives verified badge in UI.';


--
-- Name: user_profiles_view; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW "public"."user_profiles_view" AS
 SELECT "u"."id",
    "u"."username",
    "u"."email",
    "u"."must_change_password",
    "u"."role",
    "u"."status",
    "u"."parent_id",
    "u"."created_at",
    "u"."updated_at",
    "u"."last_login_at",
    "up"."nickname",
    "up"."avatar_url",
    "up"."country",
    "up"."language",
    "up"."metadata",
    "uc"."agent_commission",
    "uc"."super_commission"
   FROM (("public"."users" "u"
     LEFT JOIN "public"."user_profiles" "up" ON (("u"."id" = "up"."user_id")))
     LEFT JOIN "public"."user_commissions" "uc" ON (("u"."id" = "uc"."user_id")));


--
-- Name: VIEW "user_profiles_view"; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON VIEW "public"."user_profiles_view" IS 'Backward compatibility view that joins users, user_profiles_new, and user_commissions. 
Use this during migration period. Eventually update code to use the separate tables directly.';


--
-- Name: v_active_pool; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW "public"."v_active_pool" AS
 SELECT "id",
    "version",
    "is_active",
    "created_by",
    "created_at"
   FROM "public"."card_pools"
  WHERE ("is_active" = true)
  ORDER BY "created_at" DESC
 LIMIT 1;


--
-- Name: v_card_hits; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW "public"."v_card_hits" AS
 SELECT "t"."id" AS "ticket_id",
    "count"("m"."value") AS "hits"
   FROM ("public"."tickets" "t"
     LEFT JOIN "public"."marks" "m" ON (("m"."ticket_id" = "t"."id")))
  GROUP BY "t"."id";


--
-- Name: v_draw_latency_recent; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW "public"."v_draw_latency_recent" AS
 SELECT "d"."room_id",
    "r"."room_code",
    "d"."number" AS "draw_number",
    "d"."created_at",
    "d"."processed_at",
    "d"."queue_wait_ms",
    "d"."processing_ms",
    "d"."finalize_ms",
    GREATEST(0, ("round"((EXTRACT(epoch FROM ("d"."processed_at" - "d"."created_at")) * (1000)::numeric)))::integer) AS "total_latency_ms"
   FROM ("public"."draws" "d"
     JOIN "public"."rooms" "r" ON (("r"."id" = "d"."room_id")))
  WHERE (("d"."processed_at" IS NOT NULL) AND ("d"."created_at" > ("now"() - '24:00:00'::interval)));


--
-- Name: v_draw_latency_slo; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW "public"."v_draw_latency_slo" AS
 SELECT ("count"(*))::integer AS "draws_last_hour",
    ("round"("avg"("total_latency_ms")))::integer AS "avg_latency_ms",
    ("percentile_cont"((0.5)::double precision) WITHIN GROUP (ORDER BY (("total_latency_ms")::double precision)))::integer AS "p50_latency_ms",
    ("percentile_cont"((0.95)::double precision) WITHIN GROUP (ORDER BY (("total_latency_ms")::double precision)))::integer AS "p95_latency_ms",
    ("percentile_cont"((0.99)::double precision) WITHIN GROUP (ORDER BY (("total_latency_ms")::double precision)))::integer AS "p99_latency_ms",
    "max"("total_latency_ms") AS "max_latency_ms",
    ("count"(*) FILTER (WHERE ("total_latency_ms" > 3000)))::integer AS "over_3s",
    ("count"(*) FILTER (WHERE ("total_latency_ms" > 5000)))::integer AS "over_5s"
   FROM "public"."v_draw_latency_recent"
  WHERE ("created_at" > ("now"() - '01:00:00'::interval));


--
-- Name: v_draw_latency_slo_by_mode; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW "public"."v_draw_latency_slo_by_mode" AS
 WITH "recent" AS (
         SELECT
                CASE
                    WHEN ("d"."actor_inserted_at" IS NOT NULL) THEN 'actor'::"text"
                    ELSE 'queue'::"text"
                END AS "loop_mode",
            GREATEST(0, ("round"((EXTRACT(epoch FROM ("d"."processed_at" - "d"."created_at")) * (1000)::numeric)))::integer) AS "total_latency_ms"
           FROM "public"."draws" "d"
          WHERE (("d"."processed_at" IS NOT NULL) AND ("d"."created_at" > ("now"() - '01:00:00'::interval)))
        )
 SELECT "loop_mode",
    ("count"(*))::integer AS "draws",
    ("round"("avg"("total_latency_ms")))::integer AS "avg_latency_ms",
    ("percentile_cont"((0.5)::double precision) WITHIN GROUP (ORDER BY (("total_latency_ms")::double precision)))::integer AS "p50_latency_ms",
    ("percentile_cont"((0.95)::double precision) WITHIN GROUP (ORDER BY (("total_latency_ms")::double precision)))::integer AS "p95_latency_ms",
    ("percentile_cont"((0.99)::double precision) WITHIN GROUP (ORDER BY (("total_latency_ms")::double precision)))::integer AS "p99_latency_ms",
    "max"("total_latency_ms") AS "max_latency_ms",
    ("count"(*) FILTER (WHERE ("total_latency_ms" > 3000)))::integer AS "over_3s"
   FROM "recent"
  GROUP BY "loop_mode";


--
-- Name: v_engine_loop_health; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW "public"."v_engine_loop_health" AS
 SELECT (( SELECT "count"(*) AS "count"
           FROM "public"."rooms"
          WHERE ("rooms"."status" = 'playing'::"public"."room_status")))::integer AS "active_playing_rooms",
    (( SELECT "count"(*) AS "count"
           FROM "public"."draws"
          WHERE ("draws"."processed_at" IS NULL)))::integer AS "unprocessed_draws",
    (( SELECT "count"(*) AS "count"
           FROM "public"."draw_jobs"
          WHERE ("draw_jobs"."status" = 'queued'::"text")))::integer AS "queued_jobs",
    (( SELECT "count"(*) AS "count"
           FROM "public"."draw_jobs"
          WHERE ("draw_jobs"."status" = 'processing'::"text")))::integer AS "processing_jobs",
    (( SELECT "count"(*) AS "count"
           FROM "public"."rooms"
          WHERE ("rooms"."status" = 'settling'::"public"."room_status")))::integer AS "rooms_settling",
    ( SELECT COALESCE(("round"(EXTRACT(epoch FROM ("now"() - "min"("r"."updated_at")))))::integer, 0) AS "coalesce"
           FROM "public"."rooms" "r"
          WHERE ("r"."status" = 'settling'::"public"."room_status")) AS "oldest_settling_age_sec";


--
-- Name: v_lobby_active_players; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW "public"."v_lobby_active_players" AS
 SELECT ("count"(DISTINCT "player_user_id"))::integer AS "active_players"
   FROM "public"."tickets"
  WHERE (("reservation_status" = 'reserved'::"public"."reservation_status") AND (("expires_at" IS NULL) OR ("expires_at" > "now"())) AND ("claimed_bingo_at" IS NULL));


--
-- Name: v_lobby_online_players; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW "public"."v_lobby_online_players" AS
 SELECT ("count"(*))::integer AS "online_players"
   FROM "public"."users"
  WHERE (("last_seen_at" > ("now"() - '00:02:00'::interval)) AND ("status" = 'active'::"public"."user_status"));


--
-- Name: v_row_hits; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW "public"."v_row_hits" AS
 SELECT "t"."id" AS "ticket_id",
    "cn"."row_no",
    "count"("m"."value") AS "hits"
   FROM ((("public"."tickets" "t"
     JOIN "public"."card_pool_cards" "c" ON (("c"."id" = "t"."pool_card_id")))
     JOIN "public"."card_numbers" "cn" ON (("cn"."pool_card_id" = "c"."id")))
     LEFT JOIN "public"."marks" "m" ON ((("m"."ticket_id" = "t"."id") AND ("m"."value" = "cn"."value"))))
  GROUP BY "t"."id", "cn"."row_no";


--
-- Name: vw_finance_base; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW "public"."vw_finance_base" AS
 SELECT "t"."id",
    "t"."user_id",
    "up"."role" AS "user_role",
    "t"."amount",
    "t"."currency",
    "t"."type",
    "t"."status",
    "t"."related_room",
    "t"."created_at"
   FROM ("public"."transactions" "t"
     JOIN "public"."user_profiles_old_backup" "up" ON (("up"."id" = "t"."user_id")))
  WHERE ("t"."status" = 'completed'::"public"."transaction_status");


--
-- Name: vw_finance_earnings_by_role; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW "public"."vw_finance_earnings_by_role" AS
 SELECT "date_trunc"('day'::"text", "created_at") AS "report_date",
    "user_role",
    "sum"("amount") AS "total_earning"
   FROM "public"."vw_finance_base" "b"
  WHERE ("type" = ANY (ARRAY['fee_admin'::"public"."transaction_type", 'fee_agent'::"public"."transaction_type", 'fee_super'::"public"."transaction_type"]))
  GROUP BY ("date_trunc"('day'::"text", "created_at")), "user_role"
  ORDER BY ("date_trunc"('day'::"text", "created_at")) DESC, "user_role";


--
-- Name: vw_finance_gmv; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW "public"."vw_finance_gmv" AS
 SELECT "date_trunc"('day'::"text", "created_at") AS "report_date",
    "sum"(
        CASE
            WHEN ("type" = ANY (ARRAY['withdraw'::"public"."transaction_type", 'fee_admin'::"public"."transaction_type", 'fee_agent'::"public"."transaction_type", 'fee_super'::"public"."transaction_type"])) THEN "amount"
            ELSE (0)::numeric
        END) AS "total_outflow",
    "sum"(
        CASE
            WHEN ("type" = ANY (ARRAY['deposit'::"public"."transaction_type", 'win'::"public"."transaction_type", 'refund'::"public"."transaction_type"])) THEN "amount"
            ELSE (0)::numeric
        END) AS "total_inflow",
    "sum"(
        CASE
            WHEN ("type" = ANY (ARRAY['fee_admin'::"public"."transaction_type", 'fee_agent'::"public"."transaction_type", 'fee_super'::"public"."transaction_type"])) THEN "amount"
            ELSE (0)::numeric
        END) AS "commissions_total",
    "sum"(
        CASE
            WHEN ("type" = 'win'::"public"."transaction_type") THEN "amount"
            ELSE (0)::numeric
        END) AS "prize_payout_total",
    "sum"(
        CASE
            WHEN ("type" = 'deposit'::"public"."transaction_type") THEN "amount"
            ELSE (0)::numeric
        END) AS "user_deposits",
    "sum"(
        CASE
            WHEN ("type" = 'withdraw'::"public"."transaction_type") THEN "amount"
            ELSE (0)::numeric
        END) AS "user_withdrawals"
   FROM "public"."vw_finance_base" "b"
  GROUP BY ("date_trunc"('day'::"text", "created_at"))
  ORDER BY ("date_trunc"('day'::"text", "created_at")) DESC;


--
-- Name: vw_finance_profit_summary; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW "public"."vw_finance_profit_summary" AS
 SELECT "r"."id" AS "room_id",
    "sum"(
        CASE
            WHEN ("b"."type" = ANY (ARRAY['fee_admin'::"public"."transaction_type", 'fee_agent'::"public"."transaction_type", 'fee_super'::"public"."transaction_type"])) THEN "b"."amount"
            ELSE (0)::numeric
        END) AS "total_commission",
    "sum"(
        CASE
            WHEN ("b"."type" = 'win'::"public"."transaction_type") THEN "b"."amount"
            ELSE (0)::numeric
        END) AS "total_payout",
    ("sum"(
        CASE
            WHEN ("b"."type" = ANY (ARRAY['fee_admin'::"public"."transaction_type", 'fee_agent'::"public"."transaction_type", 'fee_super'::"public"."transaction_type"])) THEN "b"."amount"
            ELSE (0)::numeric
        END) - "sum"(
        CASE
            WHEN ("b"."type" = 'win'::"public"."transaction_type") THEN "b"."amount"
            ELSE (0)::numeric
        END)) AS "gross_profit"
   FROM ("public"."rooms" "r"
     LEFT JOIN "public"."vw_finance_base" "b" ON (("b"."related_room" = "r"."id")))
  GROUP BY "r"."id"
  ORDER BY ("sum"(
        CASE
            WHEN ("b"."type" = ANY (ARRAY['fee_admin'::"public"."transaction_type", 'fee_agent'::"public"."transaction_type", 'fee_super'::"public"."transaction_type"])) THEN "b"."amount"
            ELSE (0)::numeric
        END) - "sum"(
        CASE
            WHEN ("b"."type" = 'win'::"public"."transaction_type") THEN "b"."amount"
            ELSE (0)::numeric
        END)) DESC NULLS LAST;


--
-- Name: vw_player_commission; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW "public"."vw_player_commission" AS
 WITH "agent_of_player" AS (
         SELECT "p"."id" AS "player_id",
            "a"."id" AS "agent_id",
            "a"."agent_commission"
           FROM ("public"."user_profiles_old_backup" "p"
             JOIN "public"."user_profiles_old_backup" "a" ON (("a"."id" = "p"."parent_id")))
          WHERE (("p"."role" = 'player'::"public"."user_role") AND ("a"."role" = 'agent'::"public"."user_role"))
        ), "super_of_agent" AS (
         SELECT "a"."id" AS "agent_id",
            "s"."id" AS "super_id",
            "s"."super_commission"
           FROM ("public"."user_profiles_old_backup" "a"
             JOIN "public"."user_profiles_old_backup" "s" ON (("s"."id" = "a"."parent_id")))
          WHERE (("a"."role" = 'agent'::"public"."user_role") AND ("s"."role" = 'super'::"public"."user_role"))
        )
 SELECT "ap"."player_id",
    "ap"."agent_id",
    "ap"."agent_commission" AS "agent_rate",
    "sa"."super_id",
    "sa"."super_commission" AS "super_rate"
   FROM ("agent_of_player" "ap"
     LEFT JOIN "super_of_agent" "sa" ON (("sa"."agent_id" = "ap"."agent_id")));


--
-- Name: wallet_transfer_idempotency; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."wallet_transfer_idempotency" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "actor_id" "uuid" NOT NULL,
    "client_request_id" "text" NOT NULL,
    "payload_hash" "text" NOT NULL,
    "transfer_id" "uuid" NOT NULL,
    "target_id" "uuid" NOT NULL,
    "amount" bigint NOT NULL,
    "action" "text" NOT NULL,
    "from_user_id" "uuid" NOT NULL,
    "to_user_id" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "wallet_transfer_idempotency_action_check" CHECK (("lower"("action") = ANY (ARRAY['deposit'::"text", 'withdraw'::"text"]))),
    CONSTRAINT "wallet_transfer_idempotency_amount_check" CHECK (("amount" > 0))
);

ALTER TABLE ONLY "public"."wallet_transfer_idempotency" FORCE ROW LEVEL SECURITY;


--
-- Name: TABLE "wallet_transfer_idempotency"; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE "public"."wallet_transfer_idempotency" IS 'P6.4: panel transfer exactly-once by (actor_id, client_request_id).';


--
-- Name: wallets; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."wallets" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "balance" bigint DEFAULT 0 NOT NULL,
    "currency" "text" DEFAULT 'IRR'::"text" NOT NULL,
    "locked_amount" numeric(14,2) DEFAULT 0 NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "wallets_locked_amount_nonneg" CHECK (("locked_amount" >= (0)::numeric))
);


--
-- Name: withdrawal_requests; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."withdrawal_requests" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "player_id" "uuid" NOT NULL,
    "agent_id" "uuid",
    "amount" bigint NOT NULL,
    "currency" "text" DEFAULT 'IRR'::"text" NOT NULL,
    "card_number" "text",
    "full_name" "text",
    "status" "public"."withdrawal_request_status" DEFAULT 'pending'::"public"."withdrawal_request_status" NOT NULL,
    "client_request_id" "text" NOT NULL,
    "reviewed_by" "uuid",
    "reviewed_at" timestamp with time zone,
    "reject_reason" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "kind" "text" DEFAULT 'rial'::"text" NOT NULL,
    "network" "text",
    "crypto_symbol" "text",
    "crypto_amount" numeric,
    "wallet_address" "text",
    "requested_toman" bigint,
    CONSTRAINT "withdrawal_requests_amount_check" CHECK (("amount" > 0)),
    CONSTRAINT "withdrawal_requests_kind_check" CHECK (("kind" = ANY (ARRAY['rial'::"text", 'crypto'::"text"])))
);


--
-- Name: template_reservations; Type: TABLE; Schema: tournament; Owner: -
--

CREATE TABLE "tournament"."template_reservations" (
    "template_id" "uuid" NOT NULL,
    "trr_id" "uuid" NOT NULL,
    "tournament_id" "uuid" NOT NULL,
    "round_no" integer NOT NULL,
    "table_no" integer NOT NULL,
    "reserved_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "expires_at" timestamp with time zone NOT NULL
);


--
-- Name: tournament_tick_log; Type: TABLE; Schema: tournament; Owner: -
--

CREATE TABLE "tournament"."tournament_tick_log" (
    "id" bigint NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "tournament_id" "uuid",
    "stage" "text",
    "sqlstate" "text",
    "message" "text",
    "context" "text"
);


--
-- Name: tournament_tick_log_id_seq; Type: SEQUENCE; Schema: tournament; Owner: -
--

CREATE SEQUENCE "tournament"."tournament_tick_log_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: tournament_tick_log_id_seq; Type: SEQUENCE OWNED BY; Schema: tournament; Owner: -
--

ALTER SEQUENCE "tournament"."tournament_tick_log_id_seq" OWNED BY "tournament"."tournament_tick_log"."id";


--
-- Name: heartbeat_log_20260808; Type: TABLE ATTACH; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."heartbeat_log" ATTACH PARTITION "public"."heartbeat_log_20260808" FOR VALUES FROM ('2026-08-08 00:00:00+00') TO ('2026-08-09 00:00:00+00');


--
-- Name: heartbeat_log_20260809; Type: TABLE ATTACH; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."heartbeat_log" ATTACH PARTITION "public"."heartbeat_log_20260809" FOR VALUES FROM ('2026-08-09 00:00:00+00') TO ('2026-08-10 00:00:00+00');


--
-- Name: heartbeat_log_20260810; Type: TABLE ATTACH; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."heartbeat_log" ATTACH PARTITION "public"."heartbeat_log_20260810" FOR VALUES FROM ('2026-08-10 00:00:00+00') TO ('2026-08-11 00:00:00+00');


--
-- Name: heartbeat_log_20260811; Type: TABLE ATTACH; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."heartbeat_log" ATTACH PARTITION "public"."heartbeat_log_20260811" FOR VALUES FROM ('2026-08-11 00:00:00+00') TO ('2026-08-12 00:00:00+00');


--
-- Name: heartbeat_log_20260812; Type: TABLE ATTACH; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."heartbeat_log" ATTACH PARTITION "public"."heartbeat_log_20260812" FOR VALUES FROM ('2026-08-12 00:00:00+00') TO ('2026-08-13 00:00:00+00');


--
-- Name: heartbeat_log_20260813; Type: TABLE ATTACH; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."heartbeat_log" ATTACH PARTITION "public"."heartbeat_log_20260813" FOR VALUES FROM ('2026-08-13 00:00:00+00') TO ('2026-08-14 00:00:00+00');


--
-- Name: heartbeat_log_20260814; Type: TABLE ATTACH; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."heartbeat_log" ATTACH PARTITION "public"."heartbeat_log_20260814" FOR VALUES FROM ('2026-08-14 00:00:00+00') TO ('2026-08-15 00:00:00+00');


--
-- Name: heartbeat_log_20260815; Type: TABLE ATTACH; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."heartbeat_log" ATTACH PARTITION "public"."heartbeat_log_20260815" FOR VALUES FROM ('2026-08-15 00:00:00+00') TO ('2026-08-16 00:00:00+00');


--
-- Name: heartbeat_log_20260816; Type: TABLE ATTACH; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."heartbeat_log" ATTACH PARTITION "public"."heartbeat_log_20260816" FOR VALUES FROM ('2026-08-16 00:00:00+00') TO ('2026-08-17 00:00:00+00');


--
-- Name: heartbeat_log_20260817; Type: TABLE ATTACH; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."heartbeat_log" ATTACH PARTITION "public"."heartbeat_log_20260817" FOR VALUES FROM ('2026-08-17 00:00:00+00') TO ('2026-08-18 00:00:00+00');


--
-- Name: heartbeat_log_default; Type: TABLE ATTACH; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."heartbeat_log" ATTACH PARTITION "public"."heartbeat_log_default" DEFAULT;


--
-- Name: events id; Type: DEFAULT; Schema: deposit; Owner: -
--

ALTER TABLE ONLY "deposit"."events" ALTER COLUMN "id" SET DEFAULT "nextval"('"deposit"."events_id_seq"'::"regclass");


--
-- Name: recon_reports id; Type: DEFAULT; Schema: deposit; Owner: -
--

ALTER TABLE ONLY "deposit"."recon_reports" ALTER COLUMN "id" SET DEFAULT "nextval"('"deposit"."recon_reports_id_seq"'::"regclass");


--
-- Name: shadow_mirror_log id; Type: DEFAULT; Schema: platform; Owner: -
--

ALTER TABLE ONLY "platform"."shadow_mirror_log" ALTER COLUMN "id" SET DEFAULT "nextval"('"platform"."shadow_mirror_log_id_seq"'::"regclass");


--
-- Name: shadow_outbox id; Type: DEFAULT; Schema: platform; Owner: -
--

ALTER TABLE ONLY "platform"."shadow_outbox" ALTER COLUMN "id" SET DEFAULT "nextval"('"platform"."shadow_outbox_id_seq"'::"regclass");


--
-- Name: card_pool_cards id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."card_pool_cards" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."card_pool_cards_id_seq"'::"regclass");


--
-- Name: commissions_log id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."commissions_log" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."commissions_log_id_seq"'::"regclass");


--
-- Name: debug_room_status_log id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."debug_room_status_log" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."debug_room_status_log_id_seq"'::"regclass");


--
-- Name: draw_jobs id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."draw_jobs" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."draw_jobs_id_seq"'::"regclass");


--
-- Name: finance_recon_reports id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."finance_recon_reports" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."finance_recon_reports_id_seq"'::"regclass");


--
-- Name: heartbeat_log id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."heartbeat_log" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."heartbeat_log_id_seq"'::"regclass");


--
-- Name: heartbeat_log_default id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."heartbeat_log_default" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."heartbeat_log_id_seq"'::"regclass");


--
-- Name: tournament_tick_log id; Type: DEFAULT; Schema: tournament; Owner: -
--

ALTER TABLE ONLY "tournament"."tournament_tick_log" ALTER COLUMN "id" SET DEFAULT "nextval"('"tournament"."tournament_tick_log_id_seq"'::"regclass");


--
-- Name: attempts attempts_pkey; Type: CONSTRAINT; Schema: deposit; Owner: -
--

ALTER TABLE ONLY "deposit"."attempts"
    ADD CONSTRAINT "attempts_pkey" PRIMARY KEY ("id");


--
-- Name: credits credits_pkey; Type: CONSTRAINT; Schema: deposit; Owner: -
--

ALTER TABLE ONLY "deposit"."credits"
    ADD CONSTRAINT "credits_pkey" PRIMARY KEY ("id");


--
-- Name: crypto_derivation_state crypto_derivation_state_pkey; Type: CONSTRAINT; Schema: deposit; Owner: -
--

ALTER TABLE ONLY "deposit"."crypto_derivation_state"
    ADD CONSTRAINT "crypto_derivation_state_pkey" PRIMARY KEY ("id");


--
-- Name: crypto_rate_tiers crypto_rate_tiers_pkey; Type: CONSTRAINT; Schema: deposit; Owner: -
--

ALTER TABLE ONLY "deposit"."crypto_rate_tiers"
    ADD CONSTRAINT "crypto_rate_tiers_pkey" PRIMARY KEY ("id");


--
-- Name: crypto_transactions crypto_transactions_network_tx_event_unique; Type: CONSTRAINT; Schema: deposit; Owner: -
--

ALTER TABLE ONLY "deposit"."crypto_transactions"
    ADD CONSTRAINT "crypto_transactions_network_tx_event_unique" UNIQUE ("network", "tx_hash", "event_index");


--
-- Name: crypto_transactions crypto_transactions_pkey; Type: CONSTRAINT; Schema: deposit; Owner: -
--

ALTER TABLE ONLY "deposit"."crypto_transactions"
    ADD CONSTRAINT "crypto_transactions_pkey" PRIMARY KEY ("id");


--
-- Name: crypto_xpub_settings crypto_xpub_settings_pkey; Type: CONSTRAINT; Schema: deposit; Owner: -
--

ALTER TABLE ONLY "deposit"."crypto_xpub_settings"
    ADD CONSTRAINT "crypto_xpub_settings_pkey" PRIMARY KEY ("id");


--
-- Name: attempts deposit_attempts_provider_event_uidx; Type: CONSTRAINT; Schema: deposit; Owner: -
--

ALTER TABLE ONLY "deposit"."attempts"
    ADD CONSTRAINT "deposit_attempts_provider_event_uidx" UNIQUE ("provider", "external_event_id");


--
-- Name: credits deposit_credits_idempotency_uidx; Type: CONSTRAINT; Schema: deposit; Owner: -
--

ALTER TABLE ONLY "deposit"."credits"
    ADD CONSTRAINT "deposit_credits_idempotency_uidx" UNIQUE ("idempotency_key");


--
-- Name: credits deposit_credits_intent_uidx; Type: CONSTRAINT; Schema: deposit; Owner: -
--

ALTER TABLE ONLY "deposit"."credits"
    ADD CONSTRAINT "deposit_credits_intent_uidx" UNIQUE ("intent_id");


--
-- Name: credits deposit_credits_ledger_tx_uidx; Type: CONSTRAINT; Schema: deposit; Owner: -
--

ALTER TABLE ONLY "deposit"."credits"
    ADD CONSTRAINT "deposit_credits_ledger_tx_uidx" UNIQUE ("ledger_tx_id");


--
-- Name: events events_pkey; Type: CONSTRAINT; Schema: deposit; Owner: -
--

ALTER TABLE ONLY "deposit"."events"
    ADD CONSTRAINT "events_pkey" PRIMARY KEY ("id");


--
-- Name: intents intents_pkey; Type: CONSTRAINT; Schema: deposit; Owner: -
--

ALTER TABLE ONLY "deposit"."intents"
    ADD CONSTRAINT "intents_pkey" PRIMARY KEY ("id");


--
-- Name: recon_reports recon_reports_pkey; Type: CONSTRAINT; Schema: deposit; Owner: -
--

ALTER TABLE ONLY "deposit"."recon_reports"
    ADD CONSTRAINT "recon_reports_pkey" PRIMARY KEY ("id");


--
-- Name: user_crypto_addresses user_crypto_addresses_bep20_address_key; Type: CONSTRAINT; Schema: deposit; Owner: -
--

ALTER TABLE ONLY "deposit"."user_crypto_addresses"
    ADD CONSTRAINT "user_crypto_addresses_bep20_address_key" UNIQUE ("bep20_address");


--
-- Name: user_crypto_addresses user_crypto_addresses_derivation_index_key; Type: CONSTRAINT; Schema: deposit; Owner: -
--

ALTER TABLE ONLY "deposit"."user_crypto_addresses"
    ADD CONSTRAINT "user_crypto_addresses_derivation_index_key" UNIQUE ("derivation_index");


--
-- Name: user_crypto_addresses user_crypto_addresses_pkey; Type: CONSTRAINT; Schema: deposit; Owner: -
--

ALTER TABLE ONLY "deposit"."user_crypto_addresses"
    ADD CONSTRAINT "user_crypto_addresses_pkey" PRIMARY KEY ("id");


--
-- Name: user_crypto_addresses user_crypto_addresses_trc20_address_key; Type: CONSTRAINT; Schema: deposit; Owner: -
--

ALTER TABLE ONLY "deposit"."user_crypto_addresses"
    ADD CONSTRAINT "user_crypto_addresses_trc20_address_key" UNIQUE ("trc20_address");


--
-- Name: user_crypto_addresses user_crypto_addresses_user_id_key; Type: CONSTRAINT; Schema: deposit; Owner: -
--

ALTER TABLE ONLY "deposit"."user_crypto_addresses"
    ADD CONSTRAINT "user_crypto_addresses_user_id_key" UNIQUE ("user_id");


--
-- Name: verifications verifications_pkey; Type: CONSTRAINT; Schema: deposit; Owner: -
--

ALTER TABLE ONLY "deposit"."verifications"
    ADD CONSTRAINT "verifications_pkey" PRIMARY KEY ("id");


--
-- Name: engine_registry engine_registry_code_unique; Type: CONSTRAINT; Schema: platform; Owner: -
--

ALTER TABLE ONLY "platform"."engine_registry"
    ADD CONSTRAINT "engine_registry_code_unique" UNIQUE ("code");


--
-- Name: engine_registry engine_registry_pkey; Type: CONSTRAINT; Schema: platform; Owner: -
--

ALTER TABLE ONLY "platform"."engine_registry"
    ADD CONSTRAINT "engine_registry_pkey" PRIMARY KEY ("id");


--
-- Name: game_sessions game_sessions_correlation_key_unique; Type: CONSTRAINT; Schema: platform; Owner: -
--

ALTER TABLE ONLY "platform"."game_sessions"
    ADD CONSTRAINT "game_sessions_correlation_key_unique" UNIQUE ("correlation_key");


--
-- Name: game_sessions game_sessions_pkey; Type: CONSTRAINT; Schema: platform; Owner: -
--

ALTER TABLE ONLY "platform"."game_sessions"
    ADD CONSTRAINT "game_sessions_pkey" PRIMARY KEY ("id");


--
-- Name: games games_code_unique; Type: CONSTRAINT; Schema: platform; Owner: -
--

ALTER TABLE ONLY "platform"."games"
    ADD CONSTRAINT "games_code_unique" UNIQUE ("code");


--
-- Name: games games_pkey; Type: CONSTRAINT; Schema: platform; Owner: -
--

ALTER TABLE ONLY "platform"."games"
    ADD CONSTRAINT "games_pkey" PRIMARY KEY ("id");


--
-- Name: session_events session_events_pkey; Type: CONSTRAINT; Schema: platform; Owner: -
--

ALTER TABLE ONLY "platform"."session_events"
    ADD CONSTRAINT "session_events_pkey" PRIMARY KEY ("id");


--
-- Name: session_events session_events_session_seq_unique; Type: CONSTRAINT; Schema: platform; Owner: -
--

ALTER TABLE ONLY "platform"."session_events"
    ADD CONSTRAINT "session_events_session_seq_unique" UNIQUE ("session_id", "seq");


--
-- Name: session_participants session_participants_pkey; Type: CONSTRAINT; Schema: platform; Owner: -
--

ALTER TABLE ONLY "platform"."session_participants"
    ADD CONSTRAINT "session_participants_pkey" PRIMARY KEY ("id");


--
-- Name: session_participants session_participants_session_user_unique; Type: CONSTRAINT; Schema: platform; Owner: -
--

ALTER TABLE ONLY "platform"."session_participants"
    ADD CONSTRAINT "session_participants_session_user_unique" UNIQUE ("session_id", "user_id");


--
-- Name: session_settlement session_settlement_pkey; Type: CONSTRAINT; Schema: platform; Owner: -
--

ALTER TABLE ONLY "platform"."session_settlement"
    ADD CONSTRAINT "session_settlement_pkey" PRIMARY KEY ("id");


--
-- Name: session_settlement session_settlement_session_key_unique; Type: CONSTRAINT; Schema: platform; Owner: -
--

ALTER TABLE ONLY "platform"."session_settlement"
    ADD CONSTRAINT "session_settlement_session_key_unique" UNIQUE ("session_id", "settlement_key");


--
-- Name: session_state session_state_pkey; Type: CONSTRAINT; Schema: platform; Owner: -
--

ALTER TABLE ONLY "platform"."session_state"
    ADD CONSTRAINT "session_state_pkey" PRIMARY KEY ("session_id");


--
-- Name: shadow_mirror_log shadow_mirror_log_pkey; Type: CONSTRAINT; Schema: platform; Owner: -
--

ALTER TABLE ONLY "platform"."shadow_mirror_log"
    ADD CONSTRAINT "shadow_mirror_log_pkey" PRIMARY KEY ("id");


--
-- Name: shadow_outbox shadow_outbox_pkey; Type: CONSTRAINT; Schema: platform; Owner: -
--

ALTER TABLE ONLY "platform"."shadow_outbox"
    ADD CONSTRAINT "shadow_outbox_pkey" PRIMARY KEY ("id");


--
-- Name: admin_audit_log admin_audit_log_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."admin_audit_log"
    ADD CONSTRAINT "admin_audit_log_pkey" PRIMARY KEY ("id");


--
-- Name: admin_permissions admin_permissions_admin_id_permission_key_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."admin_permissions"
    ADD CONSTRAINT "admin_permissions_admin_id_permission_key_key" UNIQUE ("admin_id", "permission_key");


--
-- Name: admin_permissions admin_permissions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."admin_permissions"
    ADD CONSTRAINT "admin_permissions_pkey" PRIMARY KEY ("id");


--
-- Name: app_runtime_flags app_runtime_flags_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."app_runtime_flags"
    ADD CONSTRAINT "app_runtime_flags_pkey" PRIMARY KEY ("id");


--
-- Name: dev_player_configs bot_player_configs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."dev_player_configs"
    ADD CONSTRAINT "bot_player_configs_pkey" PRIMARY KEY ("user_id");


--
-- Name: dev_room_schedules bot_room_schedules_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."dev_room_schedules"
    ADD CONSTRAINT "bot_room_schedules_pkey" PRIMARY KEY ("id");


--
-- Name: card_definition_masks card_definition_masks_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."card_definition_masks"
    ADD CONSTRAINT "card_definition_masks_pkey" PRIMARY KEY ("pool_card_id");


--
-- Name: card_number_index card_number_index_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."card_number_index"
    ADD CONSTRAINT "card_number_index_pkey" PRIMARY KEY ("value", "pool_card_id");


--
-- Name: card_numbers card_numbers_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."card_numbers"
    ADD CONSTRAINT "card_numbers_pkey" PRIMARY KEY ("pool_card_id", "row_no", "col_no");


--
-- Name: card_pool_cards card_pool_cards_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."card_pool_cards"
    ADD CONSTRAINT "card_pool_cards_pkey" PRIMARY KEY ("id");


--
-- Name: card_pool_cards card_pool_cards_pool_id_card_no_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."card_pool_cards"
    ADD CONSTRAINT "card_pool_cards_pool_id_card_no_key" UNIQUE ("pool_id", "card_no");


--
-- Name: card_pools card_pools_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."card_pools"
    ADD CONSTRAINT "card_pools_pkey" PRIMARY KEY ("id");


--
-- Name: card_pools card_pools_version_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."card_pools"
    ADD CONSTRAINT "card_pools_version_key" UNIQUE ("version");


--
-- Name: commissions_log commissions_log_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."commissions_log"
    ADD CONSTRAINT "commissions_log_pkey" PRIMARY KEY ("id");


--
-- Name: commissions_log commissions_log_ticket_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."commissions_log"
    ADD CONSTRAINT "commissions_log_ticket_id_key" UNIQUE ("ticket_id");


--
-- Name: debug_room_status_log debug_room_status_log_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."debug_room_status_log"
    ADD CONSTRAINT "debug_room_status_log_pkey" PRIMARY KEY ("id");


--
-- Name: dev_player_join_preset_template_limits dev_player_join_preset_template_limits_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."dev_player_join_preset_template_limits"
    ADD CONSTRAINT "dev_player_join_preset_template_limits_pkey" PRIMARY KEY ("preset_id", "template_id");


--
-- Name: dev_player_join_presets dev_player_join_presets_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."dev_player_join_presets"
    ADD CONSTRAINT "dev_player_join_presets_pkey" PRIMARY KEY ("id");


--
-- Name: dev_player_settings dev_player_settings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."dev_player_settings"
    ADD CONSTRAINT "dev_player_settings_pkey" PRIMARY KEY ("id");


--
-- Name: dev_player_template_room_limits dev_player_template_room_limits_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."dev_player_template_room_limits"
    ADD CONSTRAINT "dev_player_template_room_limits_pkey" PRIMARY KEY ("template_id");


--
-- Name: ding_balances ding_balances_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."ding_balances"
    ADD CONSTRAINT "ding_balances_pkey" PRIMARY KEY ("user_id");


--
-- Name: ding_transactions ding_transactions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."ding_transactions"
    ADD CONSTRAINT "ding_transactions_pkey" PRIMARY KEY ("id");


--
-- Name: draw_jobs draw_jobs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."draw_jobs"
    ADD CONSTRAINT "draw_jobs_pkey" PRIMARY KEY ("id");


--
-- Name: draw_jobs draw_jobs_room_draw_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."draw_jobs"
    ADD CONSTRAINT "draw_jobs_room_draw_unique" UNIQUE ("room_id", "draw_number");


--
-- Name: draws draws_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."draws"
    ADD CONSTRAINT "draws_pkey" PRIMARY KEY ("id");


--
-- Name: draws draws_room_number_uniq; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."draws"
    ADD CONSTRAINT "draws_room_number_uniq" UNIQUE ("room_id", "number");


--
-- Name: entry_banners entry_banners_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."entry_banners"
    ADD CONSTRAINT "entry_banners_pkey" PRIMARY KEY ("id");


--
-- Name: finance_recon_reports finance_recon_reports_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."finance_recon_reports"
    ADD CONSTRAINT "finance_recon_reports_pkey" PRIMARY KEY ("id");


--
-- Name: heartbeat_log_default heartbeat_log_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."heartbeat_log_default"
    ADD CONSTRAINT "heartbeat_log_pkey" PRIMARY KEY ("id");


--
-- Name: invitation_links invitation_links_code_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."invitation_links"
    ADD CONSTRAINT "invitation_links_code_key" UNIQUE ("code");


--
-- Name: invitation_links invitation_links_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."invitation_links"
    ADD CONSTRAINT "invitation_links_pkey" PRIMARY KEY ("id");


--
-- Name: kyc_submissions kyc_submissions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."kyc_submissions"
    ADD CONSTRAINT "kyc_submissions_pkey" PRIMARY KEY ("id");


--
-- Name: kyc_submissions kyc_submissions_user_client_request_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."kyc_submissions"
    ADD CONSTRAINT "kyc_submissions_user_client_request_unique" UNIQUE ("user_id", "client_request_id");


--
-- Name: marks marks_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."marks"
    ADD CONSTRAINT "marks_pkey" PRIMARY KEY ("ticket_id", "value");


--
-- Name: player_affiliation player_affiliation_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."player_affiliation"
    ADD CONSTRAINT "player_affiliation_pkey" PRIMARY KEY ("user_id");


--
-- Name: player_signups player_signups_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."player_signups"
    ADD CONSTRAINT "player_signups_pkey" PRIMARY KEY ("id");


--
-- Name: results results_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."results"
    ADD CONSTRAINT "results_pkey" PRIMARY KEY ("id");


--
-- Name: room_templates room_templates_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."room_templates"
    ADD CONSTRAINT "room_templates_pkey" PRIMARY KEY ("id");


--
-- Name: room_winners room_winners_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."room_winners"
    ADD CONSTRAINT "room_winners_pkey" PRIMARY KEY ("room_id", "ticket_id");


--
-- Name: rooms rooms_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."rooms"
    ADD CONSTRAINT "rooms_pkey" PRIMARY KEY ("id");


--
-- Name: rooms rooms_room_code_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."rooms"
    ADD CONSTRAINT "rooms_room_code_key" UNIQUE ("room_code");


--
-- Name: tickets tickets_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."tickets"
    ADD CONSTRAINT "tickets_pkey" PRIMARY KEY ("id");


--
-- Name: tickets tickets_room_pool_card_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."tickets"
    ADD CONSTRAINT "tickets_room_pool_card_unique" UNIQUE ("room_id", "pool_card_id");


--
-- Name: tournament_commission_log tournament_commission_payouts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."tournament_commission_log"
    ADD CONSTRAINT "tournament_commission_payouts_pkey" PRIMARY KEY ("id");


--
-- Name: tournament_commission_payouts tournament_commission_payouts_pkey1; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."tournament_commission_payouts"
    ADD CONSTRAINT "tournament_commission_payouts_pkey1" PRIMARY KEY ("id");


--
-- Name: tournament_commission_snapshots tournament_commission_snapshots_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."tournament_commission_snapshots"
    ADD CONSTRAINT "tournament_commission_snapshots_pkey" PRIMARY KEY ("id");


--
-- Name: tournament_entries tournament_entries_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."tournament_entries"
    ADD CONSTRAINT "tournament_entries_pkey" PRIMARY KEY ("id");


--
-- Name: tournament_entries tournament_entries_unique_per_user; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."tournament_entries"
    ADD CONSTRAINT "tournament_entries_unique_per_user" UNIQUE ("tournament_id", "user_id");


--
-- Name: tournament_locks tournament_locks_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."tournament_locks"
    ADD CONSTRAINT "tournament_locks_pkey" PRIMARY KEY ("id");


--
-- Name: tournament_payouts tournament_payouts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."tournament_payouts"
    ADD CONSTRAINT "tournament_payouts_pkey" PRIMARY KEY ("id");


--
-- Name: tournament_payouts tournament_payouts_unique_rank_user; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."tournament_payouts"
    ADD CONSTRAINT "tournament_payouts_unique_rank_user" UNIQUE ("tournament_id", "user_id");


--
-- Name: tournament_prize_rules tournament_prize_rules_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."tournament_prize_rules"
    ADD CONSTRAINT "tournament_prize_rules_pkey" PRIMARY KEY ("id");


--
-- Name: tournament_prize_rules tournament_prize_rules_unique_rank; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."tournament_prize_rules"
    ADD CONSTRAINT "tournament_prize_rules_unique_rank" UNIQUE ("tournament_id", "rank");


--
-- Name: tournament_round_assignments tournament_round_assignments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."tournament_round_assignments"
    ADD CONSTRAINT "tournament_round_assignments_pkey" PRIMARY KEY ("tournament_id", "round_no", "user_id");


--
-- Name: tournament_round_rooms tournament_round_rooms_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."tournament_round_rooms"
    ADD CONSTRAINT "tournament_round_rooms_pkey" PRIMARY KEY ("id");


--
-- Name: tournament_round_rooms tournament_round_rooms_unique_table; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."tournament_round_rooms"
    ADD CONSTRAINT "tournament_round_rooms_unique_table" UNIQUE ("tournament_id", "round_no", "table_no");


--
-- Name: tournaments tournaments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."tournaments"
    ADD CONSTRAINT "tournaments_pkey" PRIMARY KEY ("id");


--
-- Name: transactions transactions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."transactions"
    ADD CONSTRAINT "transactions_pkey" PRIMARY KEY ("id");


--
-- Name: draws uniq_room_number; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."draws"
    ADD CONSTRAINT "uniq_room_number" UNIQUE ("room_id", "number");


--
-- Name: player_signups unique_player_signup; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."player_signups"
    ADD CONSTRAINT "unique_player_signup" UNIQUE ("player_id");


--
-- Name: player_affiliation uq_player_affiliation; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."player_affiliation"
    ADD CONSTRAINT "uq_player_affiliation" UNIQUE ("user_id");


--
-- Name: tickets uq_ticket_room_cardno; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."tickets"
    ADD CONSTRAINT "uq_ticket_room_cardno" UNIQUE ("room_id", "card_no");


--
-- Name: tickets uq_ticket_room_poolcard; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."tickets"
    ADD CONSTRAINT "uq_ticket_room_poolcard" UNIQUE ("room_id", "pool_card_id");


--
-- Name: tournament_commission_snapshots uq_tournament_commission_snap; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."tournament_commission_snapshots"
    ADD CONSTRAINT "uq_tournament_commission_snap" UNIQUE ("tournament_id", "entry_id");


--
-- Name: user_commissions user_commissions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."user_commissions"
    ADD CONSTRAINT "user_commissions_pkey" PRIMARY KEY ("user_id");


--
-- Name: user_notes user_notes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."user_notes"
    ADD CONSTRAINT "user_notes_pkey" PRIMARY KEY ("id");


--
-- Name: user_notes user_notes_user_id_author_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."user_notes"
    ADD CONSTRAINT "user_notes_user_id_author_id_key" UNIQUE ("user_id", "author_id");


--
-- Name: user_profiles_old_backup user_profiles_email_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."user_profiles_old_backup"
    ADD CONSTRAINT "user_profiles_email_key" UNIQUE ("email");


--
-- Name: user_profiles user_profiles_new_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."user_profiles"
    ADD CONSTRAINT "user_profiles_new_pkey" PRIMARY KEY ("user_id");


--
-- Name: user_profiles_old_backup user_profiles_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."user_profiles_old_backup"
    ADD CONSTRAINT "user_profiles_pkey" PRIMARY KEY ("id");


--
-- Name: user_profiles_old_backup user_profiles_username_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."user_profiles_old_backup"
    ADD CONSTRAINT "user_profiles_username_key" UNIQUE ("username");


--
-- Name: users users_email_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."users"
    ADD CONSTRAINT "users_email_key" UNIQUE ("email");


--
-- Name: users users_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."users"
    ADD CONSTRAINT "users_pkey" PRIMARY KEY ("id");


--
-- Name: users users_referral_code_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."users"
    ADD CONSTRAINT "users_referral_code_key" UNIQUE ("referral_code");


--
-- Name: users users_username_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."users"
    ADD CONSTRAINT "users_username_key" UNIQUE ("username");


--
-- Name: wallet_transfer_idempotency wallet_transfer_idempotency_actor_req_uidx; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."wallet_transfer_idempotency"
    ADD CONSTRAINT "wallet_transfer_idempotency_actor_req_uidx" UNIQUE ("actor_id", "client_request_id");


--
-- Name: wallet_transfer_idempotency wallet_transfer_idempotency_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."wallet_transfer_idempotency"
    ADD CONSTRAINT "wallet_transfer_idempotency_pkey" PRIMARY KEY ("id");


--
-- Name: wallets wallets_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."wallets"
    ADD CONSTRAINT "wallets_pkey" PRIMARY KEY ("id");


--
-- Name: wallets wallets_user_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."wallets"
    ADD CONSTRAINT "wallets_user_id_key" UNIQUE ("user_id");


--
-- Name: withdrawal_requests withdrawal_requests_client_request_id_uniq; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."withdrawal_requests"
    ADD CONSTRAINT "withdrawal_requests_client_request_id_uniq" UNIQUE ("player_id", "client_request_id");


--
-- Name: withdrawal_requests withdrawal_requests_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."withdrawal_requests"
    ADD CONSTRAINT "withdrawal_requests_pkey" PRIMARY KEY ("id");


--
-- Name: template_reservations template_reservations_pkey; Type: CONSTRAINT; Schema: tournament; Owner: -
--

ALTER TABLE ONLY "tournament"."template_reservations"
    ADD CONSTRAINT "template_reservations_pkey" PRIMARY KEY ("template_id");


--
-- Name: tournament_tick_log tournament_tick_log_pkey; Type: CONSTRAINT; Schema: tournament; Owner: -
--

ALTER TABLE ONLY "tournament"."tournament_tick_log"
    ADD CONSTRAINT "tournament_tick_log_pkey" PRIMARY KEY ("id");


--
-- Name: crypto_rate_tiers_network_active_idx; Type: INDEX; Schema: deposit; Owner: -
--

CREATE INDEX "crypto_rate_tiers_network_active_idx" ON "deposit"."crypto_rate_tiers" USING "btree" ("network", "is_active", "min_usd");


--
-- Name: crypto_transactions_status_idx; Type: INDEX; Schema: deposit; Owner: -
--

CREATE INDEX "crypto_transactions_status_idx" ON "deposit"."crypto_transactions" USING "btree" ("status") WHERE ("status" = 'PENDING'::"deposit"."crypto_tx_status");


--
-- Name: crypto_transactions_to_address_idx; Type: INDEX; Schema: deposit; Owner: -
--

CREATE INDEX "crypto_transactions_to_address_idx" ON "deposit"."crypto_transactions" USING "btree" ("to_address");


--
-- Name: crypto_transactions_user_id_idx; Type: INDEX; Schema: deposit; Owner: -
--

CREATE INDEX "crypto_transactions_user_id_idx" ON "deposit"."crypto_transactions" USING "btree" ("user_id", "created_at" DESC);


--
-- Name: deposit_attempts_intent_id_idx; Type: INDEX; Schema: deposit; Owner: -
--

CREATE INDEX "deposit_attempts_intent_id_idx" ON "deposit"."attempts" USING "btree" ("intent_id");


--
-- Name: deposit_events_created_at_idx; Type: INDEX; Schema: deposit; Owner: -
--

CREATE INDEX "deposit_events_created_at_idx" ON "deposit"."events" USING "btree" ("created_at" DESC);


--
-- Name: deposit_events_intent_id_idx; Type: INDEX; Schema: deposit; Owner: -
--

CREATE INDEX "deposit_events_intent_id_idx" ON "deposit"."events" USING "btree" ("intent_id");


--
-- Name: deposit_intents_expires_at_idx; Type: INDEX; Schema: deposit; Owner: -
--

CREATE INDEX "deposit_intents_expires_at_idx" ON "deposit"."intents" USING "btree" ("expires_at");


--
-- Name: deposit_intents_provider_ref_uidx; Type: INDEX; Schema: deposit; Owner: -
--

CREATE UNIQUE INDEX "deposit_intents_provider_ref_uidx" ON "deposit"."intents" USING "btree" ("provider", "provider_intent_ref") WHERE ("provider_intent_ref" IS NOT NULL);


--
-- Name: deposit_intents_status_idx; Type: INDEX; Schema: deposit; Owner: -
--

CREATE INDEX "deposit_intents_status_idx" ON "deposit"."intents" USING "btree" ("status");


--
-- Name: deposit_intents_user_id_idx; Type: INDEX; Schema: deposit; Owner: -
--

CREATE INDEX "deposit_intents_user_id_idx" ON "deposit"."intents" USING "btree" ("user_id");


--
-- Name: deposit_verifications_intent_id_idx; Type: INDEX; Schema: deposit; Owner: -
--

CREATE INDEX "deposit_verifications_intent_id_idx" ON "deposit"."verifications" USING "btree" ("intent_id");


--
-- Name: deposit_verifications_pass_intent_uidx; Type: INDEX; Schema: deposit; Owner: -
--

CREATE UNIQUE INDEX "deposit_verifications_pass_intent_uidx" ON "deposit"."verifications" USING "btree" ("intent_id") WHERE ("result" = 'pass'::"deposit"."verification_result");


--
-- Name: deposit_verifications_pass_payment_uidx; Type: INDEX; Schema: deposit; Owner: -
--

CREATE UNIQUE INDEX "deposit_verifications_pass_payment_uidx" ON "deposit"."verifications" USING "btree" ("provider", "external_payment_id") WHERE (("result" = 'pass'::"deposit"."verification_result") AND ("external_payment_id" IS NOT NULL));


--
-- Name: user_crypto_addresses_user_id_idx; Type: INDEX; Schema: deposit; Owner: -
--

CREATE INDEX "user_crypto_addresses_user_id_idx" ON "deposit"."user_crypto_addresses" USING "btree" ("user_id");


--
-- Name: engine_registry_game_id_idx; Type: INDEX; Schema: platform; Owner: -
--

CREATE INDEX "engine_registry_game_id_idx" ON "platform"."engine_registry" USING "btree" ("game_id");


--
-- Name: engine_registry_status_idx; Type: INDEX; Schema: platform; Owner: -
--

CREATE INDEX "engine_registry_status_idx" ON "platform"."engine_registry" USING "btree" ("status");


--
-- Name: game_sessions_created_at_idx; Type: INDEX; Schema: platform; Owner: -
--

CREATE INDEX "game_sessions_created_at_idx" ON "platform"."game_sessions" USING "btree" ("created_at" DESC);


--
-- Name: game_sessions_engine_id_idx; Type: INDEX; Schema: platform; Owner: -
--

CREATE INDEX "game_sessions_engine_id_idx" ON "platform"."game_sessions" USING "btree" ("engine_id");


--
-- Name: game_sessions_game_id_idx; Type: INDEX; Schema: platform; Owner: -
--

CREATE INDEX "game_sessions_game_id_idx" ON "platform"."game_sessions" USING "btree" ("game_id");


--
-- Name: game_sessions_status_idx; Type: INDEX; Schema: platform; Owner: -
--

CREATE INDEX "game_sessions_status_idx" ON "platform"."game_sessions" USING "btree" ("status");


--
-- Name: games_status_idx; Type: INDEX; Schema: platform; Owner: -
--

CREATE INDEX "games_status_idx" ON "platform"."games" USING "btree" ("status");


--
-- Name: session_events_created_at_idx; Type: INDEX; Schema: platform; Owner: -
--

CREATE INDEX "session_events_created_at_idx" ON "platform"."session_events" USING "btree" ("created_at" DESC);


--
-- Name: session_events_session_id_idx; Type: INDEX; Schema: platform; Owner: -
--

CREATE INDEX "session_events_session_id_idx" ON "platform"."session_events" USING "btree" ("session_id");


--
-- Name: session_participants_session_id_idx; Type: INDEX; Schema: platform; Owner: -
--

CREATE INDEX "session_participants_session_id_idx" ON "platform"."session_participants" USING "btree" ("session_id");


--
-- Name: session_participants_status_idx; Type: INDEX; Schema: platform; Owner: -
--

CREATE INDEX "session_participants_status_idx" ON "platform"."session_participants" USING "btree" ("status");


--
-- Name: session_participants_user_id_idx; Type: INDEX; Schema: platform; Owner: -
--

CREATE INDEX "session_participants_user_id_idx" ON "platform"."session_participants" USING "btree" ("user_id");


--
-- Name: session_settlement_session_id_idx; Type: INDEX; Schema: platform; Owner: -
--

CREATE INDEX "session_settlement_session_id_idx" ON "platform"."session_settlement" USING "btree" ("session_id");


--
-- Name: session_settlement_status_idx; Type: INDEX; Schema: platform; Owner: -
--

CREATE INDEX "session_settlement_status_idx" ON "platform"."session_settlement" USING "btree" ("status");


--
-- Name: shadow_mirror_log_created_at_idx; Type: INDEX; Schema: platform; Owner: -
--

CREATE INDEX "shadow_mirror_log_created_at_idx" ON "platform"."shadow_mirror_log" USING "btree" ("created_at" DESC);


--
-- Name: shadow_mirror_log_room_id_idx; Type: INDEX; Schema: platform; Owner: -
--

CREATE INDEX "shadow_mirror_log_room_id_idx" ON "platform"."shadow_mirror_log" USING "btree" ("room_id", "created_at" DESC);


--
-- Name: shadow_outbox_pending_idx; Type: INDEX; Schema: platform; Owner: -
--

CREATE INDEX "shadow_outbox_pending_idx" ON "platform"."shadow_outbox" USING "btree" ("next_attempt_at", "id") WHERE (("processed_at" IS NULL) AND ("dead_lettered_at" IS NULL));


--
-- Name: shadow_outbox_room_pending_idx; Type: INDEX; Schema: platform; Owner: -
--

CREATE INDEX "shadow_outbox_room_pending_idx" ON "platform"."shadow_outbox" USING "btree" ("room_id") WHERE (("processed_at" IS NULL) AND ("dead_lettered_at" IS NULL));


--
-- Name: finance_recon_reports_created_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "finance_recon_reports_created_idx" ON "public"."finance_recon_reports" USING "btree" ("created_at" DESC);


--
-- Name: idx_admin_audit_log_action; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_admin_audit_log_action" ON "public"."admin_audit_log" USING "btree" ("action");


--
-- Name: idx_admin_audit_log_admin_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_admin_audit_log_admin_id" ON "public"."admin_audit_log" USING "btree" ("admin_id");


--
-- Name: idx_admin_audit_log_created_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_admin_audit_log_created_at" ON "public"."admin_audit_log" USING "btree" ("created_at" DESC);


--
-- Name: idx_admin_audit_log_target; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_admin_audit_log_target" ON "public"."admin_audit_log" USING "btree" ("target_table", "target_id");


--
-- Name: idx_admin_permissions_admin_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_admin_permissions_admin_id" ON "public"."admin_permissions" USING "btree" ("admin_id");


--
-- Name: idx_admin_permissions_key; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_admin_permissions_key" ON "public"."admin_permissions" USING "btree" ("permission_key");


--
-- Name: idx_aff_agent; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_aff_agent" ON "public"."player_affiliation" USING "btree" ("agent_id");


--
-- Name: idx_aff_super; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_aff_super" ON "public"."player_affiliation" USING "btree" ("super_id");


--
-- Name: idx_card_number_index_value; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_card_number_index_value" ON "public"."card_number_index" USING "btree" ("value");


--
-- Name: idx_card_numbers_pool; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_card_numbers_pool" ON "public"."card_numbers" USING "btree" ("pool_card_id");


--
-- Name: idx_card_numbers_pool_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_card_numbers_pool_id" ON "public"."card_numbers" USING "btree" ("pool_card_id");


--
-- Name: idx_card_numbers_pool_row_value; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_card_numbers_pool_row_value" ON "public"."card_numbers" USING "btree" ("pool_card_id", "row_no", "value");


--
-- Name: idx_card_numbers_pool_value; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_card_numbers_pool_value" ON "public"."card_numbers" USING "btree" ("pool_card_id", "value");


--
-- Name: idx_card_numbers_value; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_card_numbers_value" ON "public"."card_numbers" USING "btree" ("value");


--
-- Name: idx_card_pools_active; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_card_pools_active" ON "public"."card_pools" USING "btree" ("is_active");


--
-- Name: idx_commissions_log_agent; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_commissions_log_agent" ON "public"."commissions_log" USING "btree" ("agent_id");


--
-- Name: idx_commissions_log_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_commissions_log_created" ON "public"."commissions_log" USING "btree" ("created_at");


--
-- Name: idx_commissions_log_created_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_commissions_log_created_at" ON "public"."commissions_log" USING "btree" ("created_at");


--
-- Name: idx_commissions_log_player; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_commissions_log_player" ON "public"."commissions_log" USING "btree" ("player_id");


--
-- Name: idx_commissions_log_room; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_commissions_log_room" ON "public"."commissions_log" USING "btree" ("room_id");


--
-- Name: idx_commissions_log_super; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_commissions_log_super" ON "public"."commissions_log" USING "btree" ("super_id");


--
-- Name: idx_dev_player_configs_enabled; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_dev_player_configs_enabled" ON "public"."dev_player_configs" USING "btree" ("is_enabled") WHERE ("is_enabled" = true);


--
-- Name: idx_dev_room_schedules_status_time; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_dev_room_schedules_status_time" ON "public"."dev_room_schedules" USING "btree" ("status", "scheduled_at");


--
-- Name: idx_dev_room_schedules_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_dev_room_schedules_user" ON "public"."dev_room_schedules" USING "btree" ("user_id");


--
-- Name: idx_ding_transactions_created_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_ding_transactions_created_at" ON "public"."ding_transactions" USING "btree" ("created_at");


--
-- Name: idx_ding_transactions_draw_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_ding_transactions_draw_id" ON "public"."ding_transactions" USING "btree" ("draw_id");


--
-- Name: idx_ding_transactions_room_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_ding_transactions_room_id" ON "public"."ding_transactions" USING "btree" ("room_id");


--
-- Name: idx_ding_transactions_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_ding_transactions_user_id" ON "public"."ding_transactions" USING "btree" ("user_id");


--
-- Name: idx_draw_jobs_queued_created_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_draw_jobs_queued_created_at" ON "public"."draw_jobs" USING "btree" ("created_at") WHERE ("status" = 'queued'::"text");


--
-- Name: idx_draw_jobs_room_draw_uniq; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "idx_draw_jobs_room_draw_uniq" ON "public"."draw_jobs" USING "btree" ("room_id", "draw_number");


--
-- Name: idx_draw_jobs_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_draw_jobs_status" ON "public"."draw_jobs" USING "btree" ("status");


--
-- Name: idx_draws_room_created_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_draws_room_created_at" ON "public"."draws" USING "btree" ("room_id", "created_at");


--
-- Name: idx_draws_room_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_draws_room_id" ON "public"."draws" USING "btree" ("room_id");


--
-- Name: idx_draws_room_number; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_draws_room_number" ON "public"."draws" USING "btree" ("room_id", "number");


--
-- Name: idx_draws_room_processed; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_draws_room_processed" ON "public"."draws" USING "btree" ("room_id", "created_at") WHERE ("processed_at" IS NULL);


--
-- Name: idx_draws_room_processed_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_draws_room_processed_at" ON "public"."draws" USING "btree" ("room_id", "processed_at");


--
-- Name: idx_draws_room_time; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_draws_room_time" ON "public"."draws" USING "btree" ("room_id", "created_at");


--
-- Name: idx_entry_banners_active; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_entry_banners_active" ON "public"."entry_banners" USING "btree" ("is_active");


--
-- Name: idx_entry_banners_created_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_entry_banners_created_at" ON "public"."entry_banners" USING "btree" ("created_at" DESC);


--
-- Name: idx_entry_banners_dates; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_entry_banners_dates" ON "public"."entry_banners" USING "btree" ("start_date", "end_date");


--
-- Name: idx_invitation_links_code_active; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_invitation_links_code_active" ON "public"."invitation_links" USING "btree" ("code") WHERE ("is_active" = true);


--
-- Name: idx_invitation_links_inviter; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_invitation_links_inviter" ON "public"."invitation_links" USING "btree" ("inviter_id");


--
-- Name: idx_invitation_links_inviter_active; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_invitation_links_inviter_active" ON "public"."invitation_links" USING "btree" ("inviter_id", "is_active") WHERE ("is_active" = true);


--
-- Name: idx_marks_ticket; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_marks_ticket" ON "public"."marks" USING "btree" ("ticket_id", "value");


--
-- Name: idx_marks_ticket_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_marks_ticket_id" ON "public"."marks" USING "btree" ("ticket_id");


--
-- Name: idx_marks_ticket_value; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_marks_ticket_value" ON "public"."marks" USING "btree" ("ticket_id", "value");


--
-- Name: idx_player_signups_date; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_player_signups_date" ON "public"."player_signups" USING "btree" ("signed_up_at");


--
-- Name: idx_player_signups_link; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_player_signups_link" ON "public"."player_signups" USING "btree" ("invitation_link_id");


--
-- Name: idx_player_signups_player; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_player_signups_player" ON "public"."player_signups" USING "btree" ("player_id");


--
-- Name: idx_results_created_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_results_created_at" ON "public"."results" USING "btree" ("created_at");


--
-- Name: idx_results_created_at_room_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_results_created_at_room_id" ON "public"."results" USING "btree" ("created_at", "room_id");


--
-- Name: idx_results_draw_number; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_results_draw_number" ON "public"."results" USING "btree" ("room_id", "draw_number", "win_type");


--
-- Name: idx_results_room; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_results_room" ON "public"."results" USING "btree" ("room_id");


--
-- Name: idx_results_room_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_results_room_id" ON "public"."results" USING "btree" ("room_id");


--
-- Name: idx_results_room_id_created_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_results_room_id_created_at" ON "public"."results" USING "btree" ("room_id", "created_at");


--
-- Name: idx_results_room_win_draw; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_results_room_win_draw" ON "public"."results" USING "btree" ("room_id", "win_type", "draw_number");


--
-- Name: idx_results_ticket_draw; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_results_ticket_draw" ON "public"."results" USING "btree" ("ticket_id", "draw_number");


--
-- Name: idx_results_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_results_user" ON "public"."results" USING "btree" ("user_id");


--
-- Name: idx_results_user_id_created_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_results_user_id_created_at" ON "public"."results" USING "btree" ("user_id", "created_at");


--
-- Name: idx_room_templates_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_room_templates_status" ON "public"."room_templates" USING "btree" ("status");


--
-- Name: idx_rooms_created_by; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_rooms_created_by" ON "public"."rooms" USING "btree" ("created_by");


--
-- Name: idx_rooms_engine_claimable; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_rooms_engine_claimable" ON "public"."rooms" USING "btree" ("engine_lease_until", "next_draw_at") WHERE ("status" = 'playing'::"public"."room_status");


--
-- Name: idx_rooms_pool_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_rooms_pool_id" ON "public"."rooms" USING "btree" ("pool_id");


--
-- Name: idx_rooms_poolid; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_rooms_poolid" ON "public"."rooms" USING "btree" ("pool_id");


--
-- Name: idx_rooms_scheduled_start_time; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_rooms_scheduled_start_time" ON "public"."rooms" USING "btree" ("scheduled_start_time", "status") WHERE (("scheduled_start_time" IS NOT NULL) AND ("status" = 'waiting'::"public"."room_status"));


--
-- Name: idx_rooms_starts; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_rooms_starts" ON "public"."rooms" USING "btree" ("starts_at");


--
-- Name: idx_rooms_starts_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_rooms_starts_at" ON "public"."rooms" USING "btree" ("starts_at");


--
-- Name: idx_rooms_startsat_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_rooms_startsat_status" ON "public"."rooms" USING "btree" ("starts_at", "status");


--
-- Name: idx_rooms_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_rooms_status" ON "public"."rooms" USING "btree" ("status");


--
-- Name: idx_rooms_status_nextdraw; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_rooms_status_nextdraw" ON "public"."rooms" USING "btree" ("status", "next_draw_at");


--
-- Name: idx_rooms_status_price; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_rooms_status_price" ON "public"."rooms" USING "btree" ("status", "card_price");


--
-- Name: idx_rooms_template_password; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_rooms_template_password" ON "public"."rooms" USING "btree" ("room_template_id", "password") WHERE ("password" IS NOT NULL);


--
-- Name: idx_tcp_tournament; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_tcp_tournament" ON "public"."tournament_commission_log" USING "btree" ("tournament_id");


--
-- Name: idx_tickets_expires_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_tickets_expires_at" ON "public"."tickets" USING "btree" ("expires_at");


--
-- Name: idx_tickets_player; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_tickets_player" ON "public"."tickets" USING "btree" ("player_user_id");


--
-- Name: idx_tickets_player_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_tickets_player_user_id" ON "public"."tickets" USING "btree" ("player_user_id");


--
-- Name: idx_tickets_pool_card_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_tickets_pool_card_id" ON "public"."tickets" USING "btree" ("pool_card_id");


--
-- Name: idx_tickets_reservation_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_tickets_reservation_status" ON "public"."tickets" USING "btree" ("reservation_status");


--
-- Name: idx_tickets_room; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_tickets_room" ON "public"."tickets" USING "btree" ("room_id");


--
-- Name: idx_tickets_room_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_tickets_room_id" ON "public"."tickets" USING "btree" ("room_id");


--
-- Name: idx_tickets_room_player; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_tickets_room_player" ON "public"."tickets" USING "btree" ("room_id", "player_user_id");


--
-- Name: idx_tickets_room_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_tickets_room_status" ON "public"."tickets" USING "btree" ("room_id", "reservation_status") WHERE ("reservation_status" = 'confirmed'::"public"."reservation_status");


--
-- Name: idx_tickets_room_status_player; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_tickets_room_status_player" ON "public"."tickets" USING "btree" ("room_id", "reservation_status", "player_user_id");


--
-- Name: idx_tickets_room_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_tickets_room_user" ON "public"."tickets" USING "btree" ("room_id", "player_user_id");


--
-- Name: idx_tickets_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_tickets_status" ON "public"."tickets" USING "btree" ("reservation_status");


--
-- Name: idx_tournament_commission_payouts_ref; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_tournament_commission_payouts_ref" ON "public"."tournament_commission_payouts" USING "btree" ("tournament_id", "entry_id", "beneficiary_user_id", "role");


--
-- Name: idx_tournament_entries_tournament_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_tournament_entries_tournament_user" ON "public"."tournament_entries" USING "btree" ("tournament_id", "user_id");


--
-- Name: idx_tournament_locks_entry; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_tournament_locks_entry" ON "public"."tournament_locks" USING "btree" ("entry_id");


--
-- Name: idx_tournament_locks_tournament; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_tournament_locks_tournament" ON "public"."tournament_locks" USING "btree" ("tournament_id");


--
-- Name: idx_tournament_payouts_tournament; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_tournament_payouts_tournament" ON "public"."tournament_payouts" USING "btree" ("tournament_id");


--
-- Name: idx_tournament_prize_rules_tournament; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_tournament_prize_rules_tournament" ON "public"."tournament_prize_rules" USING "btree" ("tournament_id");


--
-- Name: idx_tournaments_start_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_tournaments_start_at" ON "public"."tournaments" USING "btree" ("start_at");


--
-- Name: idx_tournaments_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_tournaments_status" ON "public"."tournaments" USING "btree" ("status");


--
-- Name: idx_tra_game_room_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_tra_game_room_id" ON "public"."tournament_round_assignments" USING "btree" ("tournament_id", "round_no", "game_room_id");


--
-- Name: idx_tra_room; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_tra_room" ON "public"."tournament_round_assignments" USING "btree" ("room_id");


--
-- Name: idx_tra_room_cards; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_tra_room_cards" ON "public"."tournament_round_assignments" USING "btree" ("room_id", "cards_count");


--
-- Name: idx_tra_tournament_round; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_tra_tournament_round" ON "public"."tournament_round_assignments" USING "btree" ("tournament_id", "round_no");


--
-- Name: idx_tra_trr_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_tra_trr_id" ON "public"."tournament_round_assignments" USING "btree" ("tournament_id", "round_no", "trr_id");


--
-- Name: idx_transactions_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_transactions_created" ON "public"."transactions" USING "btree" ("created_at");


--
-- Name: idx_transactions_related_room; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_transactions_related_room" ON "public"."transactions" USING "btree" ("related_room");


--
-- Name: idx_transactions_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_transactions_status" ON "public"."transactions" USING "btree" ("status");


--
-- Name: idx_transactions_type; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_transactions_type" ON "public"."transactions" USING "btree" ("type");


--
-- Name: idx_transactions_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_transactions_user" ON "public"."transactions" USING "btree" ("user_id");


--
-- Name: idx_transactions_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_transactions_user_id" ON "public"."transactions" USING "btree" ("user_id");


--
-- Name: idx_transactions_wallet; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_transactions_wallet" ON "public"."transactions" USING "btree" ("wallet_id");


--
-- Name: idx_transactions_wallet_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_transactions_wallet_id" ON "public"."transactions" USING "btree" ("wallet_id");


--
-- Name: idx_trr_room_template; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_trr_room_template" ON "public"."tournament_round_rooms" USING "btree" ("tournament_id", "round_no", "room_template_id");


--
-- Name: idx_trr_template; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_trr_template" ON "public"."tournament_round_rooms" USING "btree" ("tournament_id", "round_no", "room_template_id");


--
-- Name: idx_trr_tournament_round; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_trr_tournament_round" ON "public"."tournament_round_rooms" USING "btree" ("tournament_id", "round_no");


--
-- Name: idx_trr_tournament_round_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_trr_tournament_round_status" ON "public"."tournament_round_rooms" USING "btree" ("tournament_id", "round_no", "status");


--
-- Name: idx_tx_user_time; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_tx_user_time" ON "public"."transactions" USING "btree" ("user_id", "created_at" DESC);


--
-- Name: idx_user_commissions_agent; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_user_commissions_agent" ON "public"."user_commissions" USING "btree" ("agent_commission");


--
-- Name: idx_user_commissions_super; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_user_commissions_super" ON "public"."user_commissions" USING "btree" ("super_commission");


--
-- Name: idx_user_notes_author_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_user_notes_author_id" ON "public"."user_notes" USING "btree" ("author_id");


--
-- Name: idx_user_notes_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_user_notes_user_id" ON "public"."user_notes" USING "btree" ("user_id");


--
-- Name: idx_user_profiles_agent_comm; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_user_profiles_agent_comm" ON "public"."user_profiles_old_backup" USING "btree" ("agent_commission");


--
-- Name: idx_user_profiles_balance; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_user_profiles_balance" ON "public"."user_profiles_old_backup" USING "btree" ("balance");


--
-- Name: idx_user_profiles_created_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_user_profiles_created_at" ON "public"."user_profiles_old_backup" USING "btree" ("created_at");


--
-- Name: idx_user_profiles_email; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_user_profiles_email" ON "public"."user_profiles_old_backup" USING "btree" ("email");


--
-- Name: idx_user_profiles_parent; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_user_profiles_parent" ON "public"."user_profiles_old_backup" USING "btree" ("parent_id");


--
-- Name: idx_user_profiles_role; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_user_profiles_role" ON "public"."user_profiles_old_backup" USING "btree" ("role");


--
-- Name: idx_user_profiles_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_user_profiles_status" ON "public"."user_profiles_old_backup" USING "btree" ("status");


--
-- Name: idx_user_profiles_super_comm; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_user_profiles_super_comm" ON "public"."user_profiles_old_backup" USING "btree" ("super_commission");


--
-- Name: idx_user_profiles_username; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_user_profiles_username" ON "public"."user_profiles_old_backup" USING "btree" ("username");


--
-- Name: idx_users_created_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_users_created_at" ON "public"."users" USING "btree" ("created_at");


--
-- Name: idx_users_email; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_users_email" ON "public"."users" USING "btree" ("email") WHERE ("email" IS NOT NULL);


--
-- Name: idx_users_last_seen_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_users_last_seen_at" ON "public"."users" USING "btree" ("last_seen_at" DESC);


--
-- Name: idx_users_parent; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_users_parent" ON "public"."users" USING "btree" ("parent_id");


--
-- Name: idx_users_referral_code; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_users_referral_code" ON "public"."users" USING "btree" ("referral_code");


--
-- Name: idx_users_role; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_users_role" ON "public"."users" USING "btree" ("role");


--
-- Name: idx_users_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_users_status" ON "public"."users" USING "btree" ("status");


--
-- Name: idx_users_username; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_users_username" ON "public"."users" USING "btree" ("username") WHERE ("username" IS NOT NULL);


--
-- Name: idx_wallets_balance; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_wallets_balance" ON "public"."wallets" USING "btree" ("balance");


--
-- Name: idx_wallets_currency; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_wallets_currency" ON "public"."wallets" USING "btree" ("currency");


--
-- Name: idx_wallets_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_wallets_user" ON "public"."wallets" USING "btree" ("user_id");


--
-- Name: idx_wallets_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_wallets_user_id" ON "public"."wallets" USING "btree" ("user_id");


--
-- Name: ix_cards_created_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "ix_cards_created_at" ON "public"."card_pool_cards" USING "btree" ("created_at");


--
-- Name: ix_room_winners_room; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "ix_room_winners_room" ON "public"."room_winners" USING "btree" ("room_id");


--
-- Name: ix_room_winners_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "ix_room_winners_user" ON "public"."room_winners" USING "btree" ("user_id");


--
-- Name: ix_rooms_prize_paid; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "ix_rooms_prize_paid" ON "public"."rooms" USING "btree" ("prize_paid_at");


--
-- Name: ix_rooms_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "ix_rooms_status" ON "public"."rooms" USING "btree" ("status");


--
-- Name: ix_rooms_status_starts; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "ix_rooms_status_starts" ON "public"."rooms" USING "btree" ("status", "starts_at");


--
-- Name: ix_rooms_template; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "ix_rooms_template" ON "public"."rooms" USING "btree" ("room_template_id");


--
-- Name: ix_tickets_room_consumed; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "ix_tickets_room_consumed" ON "public"."tickets" USING "btree" ("room_id") WHERE ("reservation_status" = 'consumed'::"public"."reservation_status");


--
-- Name: ix_tickets_room_status_player; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "ix_tickets_room_status_player" ON "public"."tickets" USING "btree" ("room_id", "reservation_status", "player_user_id");


--
-- Name: ix_transactions_room; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "ix_transactions_room" ON "public"."transactions" USING "btree" ("room_id");


--
-- Name: ix_transactions_room_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "ix_transactions_room_id" ON "public"."transactions" USING "btree" ("room_id");


--
-- Name: ix_transactions_ticket; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "ix_transactions_ticket" ON "public"."transactions" USING "btree" ("ticket_id");


--
-- Name: ix_transactions_ticket_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "ix_transactions_ticket_id" ON "public"."transactions" USING "btree" ("ticket_id");


--
-- Name: ix_transactions_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "ix_transactions_user_id" ON "public"."transactions" USING "btree" ("user_id");


--
-- Name: ix_transactions_wallet; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "ix_transactions_wallet" ON "public"."transactions" USING "btree" ("wallet_id");


--
-- Name: ix_transactions_wallet_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "ix_transactions_wallet_id" ON "public"."transactions" USING "btree" ("wallet_id");


--
-- Name: ix_tx_created_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "ix_tx_created_at" ON "public"."transactions" USING "btree" ("created_at");


--
-- Name: ix_tx_room; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "ix_tx_room" ON "public"."transactions" USING "btree" ("room_id");


--
-- Name: ix_tx_source_room; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "ix_tx_source_room" ON "public"."transactions" USING "btree" ("source_room_id");


--
-- Name: ix_tx_source_ticket; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "ix_tx_source_ticket" ON "public"."transactions" USING "btree" ("source_ticket_id");


--
-- Name: ix_tx_ticket; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "ix_tx_ticket" ON "public"."transactions" USING "btree" ("ticket_id");


--
-- Name: ix_tx_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "ix_tx_user" ON "public"."transactions" USING "btree" ("user_id");


--
-- Name: ix_tx_wallet; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "ix_tx_wallet" ON "public"."transactions" USING "btree" ("wallet_id");


--
-- Name: ix_wallets_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "ix_wallets_id" ON "public"."wallets" USING "btree" ("id");


--
-- Name: ix_wallets_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "ix_wallets_user_id" ON "public"."wallets" USING "btree" ("user_id");


--
-- Name: kyc_submissions_one_pending_per_user; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "kyc_submissions_one_pending_per_user" ON "public"."kyc_submissions" USING "btree" ("user_id") WHERE ("status" = 'pending_review'::"text");


--
-- Name: kyc_submissions_pending_review_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "kyc_submissions_pending_review_idx" ON "public"."kyc_submissions" USING "btree" ("created_at") WHERE ("status" = 'pending_review'::"text");


--
-- Name: kyc_submissions_status_created_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "kyc_submissions_status_created_at_idx" ON "public"."kyc_submissions" USING "btree" ("status", "created_at" DESC);


--
-- Name: kyc_submissions_unseen_result_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "kyc_submissions_unseen_result_idx" ON "public"."kyc_submissions" USING "btree" ("user_id", "updated_at" DESC) WHERE (("status" = ANY (ARRAY['approved'::"text", 'rejected'::"text"])) AND ("player_result_seen_at" IS NULL));


--
-- Name: kyc_submissions_user_id_created_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "kyc_submissions_user_id_created_at_idx" ON "public"."kyc_submissions" USING "btree" ("user_id", "created_at" DESC);


--
-- Name: one_active_pool; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "one_active_pool" ON "public"."card_pools" USING "btree" ("is_active") WHERE ("is_active" = true);


--
-- Name: uniq_pool_cardno; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "uniq_pool_cardno" ON "public"."card_pool_cards" USING "btree" ("pool_id", "card_no");


--
-- Name: uniq_room_card; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "uniq_room_card" ON "public"."tickets" USING "btree" ("room_id", "pool_card_id");


--
-- Name: uniq_room_code; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "uniq_room_code" ON "public"."rooms" USING "btree" ("room_code");


--
-- Name: uq_pool_cardno; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "uq_pool_cardno" ON "public"."card_pool_cards" USING "btree" ("pool_id", "card_no");


--
-- Name: uq_tcp_idempotent; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "uq_tcp_idempotent" ON "public"."tournament_commission_log" USING "btree" ("tournament_id", "entry_id", "beneficiary_user_id", "role");


--
-- Name: uq_tournament_locks_idempotency; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "uq_tournament_locks_idempotency" ON "public"."tournament_locks" USING "btree" ("tournament_id", "idempotency_key") WHERE ("idempotency_key" IS NOT NULL);


--
-- Name: ux_commissions_log_ticket; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "ux_commissions_log_ticket" ON "public"."commissions_log" USING "btree" ("ticket_id");


--
-- Name: ux_ding_tx_agg_once; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "ux_ding_tx_agg_once" ON "public"."ding_transactions" USING "btree" ("room_id", "draw_id", "user_id") WHERE ("ticket_id" IS NULL);


--
-- Name: ux_ding_tx_agg_room_draw_user; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "ux_ding_tx_agg_room_draw_user" ON "public"."ding_transactions" USING "btree" ("room_id", "draw_id", "user_id") WHERE (("draw_id" IS NOT NULL) AND ("ticket_id" IS NULL));


--
-- Name: ux_ding_tx_agg_user_draw; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "ux_ding_tx_agg_user_draw" ON "public"."ding_transactions" USING "btree" ("user_id", "draw_id") WHERE (("ticket_id" IS NULL) AND ("draw_id" IS NOT NULL));


--
-- Name: ux_ding_tx_agg_user_room_draw; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "ux_ding_tx_agg_user_room_draw" ON "public"."ding_transactions" USING "btree" ("user_id", "room_id", "draw_id") WHERE (("draw_id" IS NOT NULL) AND ("ticket_id" IS NULL));


--
-- Name: ux_results_ticket_win_type; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "ux_results_ticket_win_type" ON "public"."results" USING "btree" ("ticket_id", "win_type");


--
-- Name: ux_room_prize_paid_once; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "ux_room_prize_paid_once" ON "public"."rooms" USING "btree" ("id") WHERE ("prize_paid_at" IS NOT NULL);


--
-- Name: ux_room_templates_price_currency_normal; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "ux_room_templates_price_currency_normal" ON "public"."room_templates" USING "btree" ("price", "currency") WHERE ("room_type" = 'normal'::"public"."room_type");


--
-- Name: ux_tx_commission_once; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "ux_tx_commission_once" ON "public"."transactions" USING "btree" ("source_kind", "source_ticket_id") WHERE ("source_kind" = 'commission'::"text");


--
-- Name: ux_tx_idempotency; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "ux_tx_idempotency" ON "public"."transactions" USING "btree" ("idempotency_key") WHERE ("idempotency_key" IS NOT NULL);


--
-- Name: INDEX "ux_tx_idempotency"; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON INDEX "public"."ux_tx_idempotency" IS 'P6.4: exactly-once ledger rows for non-null idempotency_key (fn_wallet_apply_delta)';


--
-- Name: ux_tx_prize_room_once; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "ux_tx_prize_room_once" ON "public"."transactions" USING "btree" ("source_kind", "source_room_id") WHERE ("source_kind" = 'prize_room_payout'::"text");


--
-- Name: ux_waiting_room_per_template; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "ux_waiting_room_per_template" ON "public"."rooms" USING "btree" ("room_template_id") WHERE ("status" = 'waiting'::"public"."room_status");


--
-- Name: wallet_transfer_idempotency_transfer_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "wallet_transfer_idempotency_transfer_id_idx" ON "public"."wallet_transfer_idempotency" USING "btree" ("transfer_id");


--
-- Name: withdrawal_requests_agent_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "withdrawal_requests_agent_status_idx" ON "public"."withdrawal_requests" USING "btree" ("agent_id", "status", "created_at" DESC);


--
-- Name: withdrawal_requests_kind_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "withdrawal_requests_kind_status_idx" ON "public"."withdrawal_requests" USING "btree" ("kind", "status", "created_at" DESC);


--
-- Name: withdrawal_requests_player_created_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "withdrawal_requests_player_created_idx" ON "public"."withdrawal_requests" USING "btree" ("player_id", "created_at" DESC);


--
-- Name: idx_template_reservations_expires; Type: INDEX; Schema: tournament; Owner: -
--

CREATE INDEX "idx_template_reservations_expires" ON "tournament"."template_reservations" USING "btree" ("expires_at");


--
-- Name: wallet_hold_consistency _RETURN; Type: RULE; Schema: monitor; Owner: -
--

CREATE OR REPLACE VIEW "monitor"."wallet_hold_consistency" AS
 SELECT "r"."id" AS "room_id",
    "r"."status",
    "sum"("t"."price") FILTER (WHERE ("t"."reservation_status" = ANY (ARRAY['reserved'::"public"."reservation_status", 'confirmed'::"public"."reservation_status"]))) AS "reserved_value",
    ( SELECT COALESCE("sum"("w"."locked_amount"), (0)::numeric) AS "coalesce"
           FROM "public"."wallets" "w"
          WHERE (("w"."currency" = "r"."currency") AND ("w"."user_id" IN ( SELECT DISTINCT "t2"."player_user_id"
                   FROM "public"."tickets" "t2"
                  WHERE (("t2"."room_id" = "r"."id") AND ("t2"."reservation_status" = ANY (ARRAY['reserved'::"public"."reservation_status", 'confirmed'::"public"."reservation_status"]))))))) AS "locked_snapshot",
    "count"(*) FILTER (WHERE ("t"."reservation_status" = ANY (ARRAY['reserved'::"public"."reservation_status", 'confirmed'::"public"."reservation_status"]))) AS "pending_tickets"
   FROM ("public"."rooms" "r"
     LEFT JOIN "public"."tickets" "t" ON (("t"."room_id" = "r"."id")))
  GROUP BY "r"."id", "r"."status";


--
-- Name: attempts deposit_attempts_no_update; Type: TRIGGER; Schema: deposit; Owner: -
--

CREATE TRIGGER "deposit_attempts_no_update" BEFORE DELETE OR UPDATE ON "deposit"."attempts" FOR EACH ROW EXECUTE FUNCTION "deposit"."trg_forbid_mutation"();


--
-- Name: credits deposit_credits_guard; Type: TRIGGER; Schema: deposit; Owner: -
--

CREATE TRIGGER "deposit_credits_guard" BEFORE DELETE OR UPDATE ON "deposit"."credits" FOR EACH ROW EXECUTE FUNCTION "deposit"."trg_credits_guard"();


--
-- Name: events deposit_events_no_update; Type: TRIGGER; Schema: deposit; Owner: -
--

CREATE TRIGGER "deposit_events_no_update" BEFORE DELETE OR UPDATE ON "deposit"."events" FOR EACH ROW EXECUTE FUNCTION "deposit"."trg_forbid_mutation"();


--
-- Name: intents deposit_intents_immutable_core; Type: TRIGGER; Schema: deposit; Owner: -
--

CREATE TRIGGER "deposit_intents_immutable_core" BEFORE UPDATE ON "deposit"."intents" FOR EACH ROW EXECUTE FUNCTION "deposit"."trg_intents_immutable_core"();


--
-- Name: verifications deposit_verifications_no_update; Type: TRIGGER; Schema: deposit; Owner: -
--

CREATE TRIGGER "deposit_verifications_no_update" BEFORE DELETE OR UPDATE ON "deposit"."verifications" FOR EACH ROW EXECUTE FUNCTION "deposit"."trg_forbid_mutation"();


--
-- Name: crypto_rate_tiers trg_crypto_rate_tiers_updated_at; Type: TRIGGER; Schema: deposit; Owner: -
--

CREATE TRIGGER "trg_crypto_rate_tiers_updated_at" BEFORE UPDATE ON "deposit"."crypto_rate_tiers" FOR EACH ROW EXECUTE FUNCTION "deposit"."tg_crypto_rate_tiers_updated_at"();


--
-- Name: crypto_transactions trg_crypto_transactions_updated_at; Type: TRIGGER; Schema: deposit; Owner: -
--

CREATE TRIGGER "trg_crypto_transactions_updated_at" BEFORE UPDATE ON "deposit"."crypto_transactions" FOR EACH ROW EXECUTE FUNCTION "deposit"."tg_crypto_transactions_updated_at"();


--
-- Name: game_sessions trg_game_sessions_assert_engine_game; Type: TRIGGER; Schema: platform; Owner: -
--

CREATE TRIGGER "trg_game_sessions_assert_engine_game" BEFORE INSERT OR UPDATE OF "game_id", "engine_id" ON "platform"."game_sessions" FOR EACH ROW EXECUTE FUNCTION "platform"."fn_assert_session_engine_game"();


--
-- Name: tournament_entries tournament_entries_snapshot_bd; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "tournament_entries_snapshot_bd" BEFORE DELETE ON "public"."tournament_entries" FOR EACH ROW EXECUTE FUNCTION "tournament"."trg_tournament_entries_snapshot_bd"();


--
-- Name: draws trg_after_draw_enqueue; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "trg_after_draw_enqueue" AFTER INSERT ON "public"."draws" FOR EACH ROW EXECUTE FUNCTION "game_core"."trg_after_draw_enqueue"();


--
-- Name: draws trg_aggregate_ding_on_processed_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "trg_aggregate_ding_on_processed_at" AFTER UPDATE OF "processed_at" ON "public"."draws" FOR EACH ROW WHEN ((("old"."processed_at" IS NULL) AND ("new"."processed_at" IS NOT NULL) AND ("new"."ding_aggregated_at" IS NULL))) EXECUTE FUNCTION "public"."fn_aggregate_ding_for_processed_draw"();

ALTER TABLE "public"."draws" DISABLE TRIGGER "trg_aggregate_ding_on_processed_at";


--
-- Name: rooms trg_debug_rooms_status; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "trg_debug_rooms_status" AFTER INSERT OR UPDATE OF "status" ON "public"."rooms" FOR EACH ROW EXECUTE FUNCTION "public"."trg_debug_rooms_status"();


--
-- Name: dev_player_configs trg_dev_player_configs_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "trg_dev_player_configs_updated_at" BEFORE UPDATE ON "public"."dev_player_configs" FOR EACH ROW EXECUTE FUNCTION "public"."update_dev_player_configs_updated_at"();


--
-- Name: dev_player_join_preset_template_limits trg_dev_player_join_preset_template_limits_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "trg_dev_player_join_preset_template_limits_updated_at" BEFORE UPDATE ON "public"."dev_player_join_preset_template_limits" FOR EACH ROW EXECUTE FUNCTION "public"."update_dev_player_join_preset_template_limits_updated_at"();


--
-- Name: dev_player_join_presets trg_dev_player_join_presets_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "trg_dev_player_join_presets_updated_at" BEFORE UPDATE ON "public"."dev_player_join_presets" FOR EACH ROW EXECUTE FUNCTION "public"."update_dev_player_join_presets_updated_at"();


--
-- Name: dev_player_settings trg_dev_player_settings_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "trg_dev_player_settings_updated_at" BEFORE UPDATE ON "public"."dev_player_settings" FOR EACH ROW EXECUTE FUNCTION "public"."update_dev_player_settings_updated_at"();


--
-- Name: dev_player_template_room_limits trg_dev_player_template_room_limits_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "trg_dev_player_template_room_limits_updated_at" BEFORE UPDATE ON "public"."dev_player_template_room_limits" FOR EACH ROW EXECUTE FUNCTION "public"."update_dev_player_template_room_limits_updated_at"();


--
-- Name: draws trg_ding_aggregate_dryrun_on_processed_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "trg_ding_aggregate_dryrun_on_processed_at" AFTER UPDATE OF "processed_at" ON "public"."draws" FOR EACH ROW WHEN ((("old"."processed_at" IS NULL) AND ("new"."processed_at" IS NOT NULL))) EXECUTE FUNCTION "public"."fn_ding_aggregate_dryrun_on_draw_processed"();

ALTER TABLE "public"."draws" DISABLE TRIGGER "trg_ding_aggregate_dryrun_on_processed_at";


--
-- Name: tournament_entries trg_entry_cancel_cleanup; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "trg_entry_cancel_cleanup" AFTER UPDATE OF "status" ON "public"."tournament_entries" FOR EACH ROW WHEN (("new"."status" = 'cancelled'::"public"."tournament_entry_status")) EXECUTE FUNCTION "tournament"."trg_on_entry_cancel_cleanup"();


--
-- Name: tournament_entries trg_guard_entry_mutations; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "trg_guard_entry_mutations" BEFORE DELETE OR UPDATE ON "public"."tournament_entries" FOR EACH ROW EXECUTE FUNCTION "tournament"."trg_guard_tournament_entry_mutations"();


--
-- Name: commissions_log trg_lock_commission_snapshot; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "trg_lock_commission_snapshot" BEFORE UPDATE ON "public"."commissions_log" FOR EACH ROW EXECUTE FUNCTION "game_finance"."fn_lock_commission_snapshot"();


--
-- Name: rooms trg_rooms_after_live; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "trg_rooms_after_live" AFTER UPDATE ON "public"."rooms" FOR EACH ROW WHEN ((("new"."status" = ANY (ARRAY['playing'::"public"."room_status", 'settling'::"public"."room_status"])) AND ("old"."status" IS DISTINCT FROM "new"."status"))) EXECUTE FUNCTION "game_finance"."trg_rooms_after_live"();


--
-- Name: rooms trg_rooms_platform_shadow; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "trg_rooms_platform_shadow" AFTER INSERT OR UPDATE OF "status", "engine_owner_id", "engine_lease_until", "engine_lease_epoch", "card_price" ON "public"."rooms" FOR EACH ROW EXECUTE FUNCTION "platform"."trg_rooms_platform_shadow"();


--
-- Name: TRIGGER "trg_rooms_platform_shadow" ON "rooms"; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TRIGGER "trg_rooms_platform_shadow" ON "public"."rooms" IS 'P5.4 shadow enqueue only; must not affect Bingo/wallet/settle.';


--
-- Name: rooms trg_rooms_stamp_waiting_started_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "trg_rooms_stamp_waiting_started_at" BEFORE INSERT OR UPDATE OF "status", "waiting_started_at" ON "public"."rooms" FOR EACH ROW EXECUTE FUNCTION "game_core"."trg_rooms_stamp_waiting_started_at"();


--
-- Name: rooms trg_rooms_status_template_draining; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "trg_rooms_status_template_draining" AFTER UPDATE OF "status" ON "public"."rooms" FOR EACH ROW EXECUTE FUNCTION "public"."trg_rooms_status_template_draining"();


--
-- Name: card_pool_cards trg_set_updated_at_card_pool_cards; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "trg_set_updated_at_card_pool_cards" BEFORE UPDATE ON "public"."card_pool_cards" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();


--
-- Name: card_pools trg_set_updated_at_card_pools; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "trg_set_updated_at_card_pools" BEFORE UPDATE ON "public"."card_pools" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();


--
-- Name: invitation_links trg_set_updated_at_invitation_links; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "trg_set_updated_at_invitation_links" BEFORE UPDATE ON "public"."invitation_links" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();


--
-- Name: rooms trg_set_updated_at_rooms; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "trg_set_updated_at_rooms" BEFORE UPDATE ON "public"."rooms" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();


--
-- Name: tickets trg_set_updated_at_tickets; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "trg_set_updated_at_tickets" BEFORE UPDATE ON "public"."tickets" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();


--
-- Name: tournament_round_rooms trg_set_updated_at_tournament_round_rooms; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "trg_set_updated_at_tournament_round_rooms" BEFORE UPDATE ON "public"."tournament_round_rooms" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();


--
-- Name: transactions trg_set_updated_at_transactions; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "trg_set_updated_at_transactions" BEFORE UPDATE ON "public"."transactions" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();


--
-- Name: user_commissions trg_set_updated_at_user_commissions; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "trg_set_updated_at_user_commissions" BEFORE UPDATE ON "public"."user_commissions" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();


--
-- Name: user_profiles_old_backup trg_set_updated_at_user_profiles; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "trg_set_updated_at_user_profiles" BEFORE UPDATE ON "public"."user_profiles_old_backup" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();


--
-- Name: user_profiles trg_set_updated_at_user_profiles_new; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "trg_set_updated_at_user_profiles_new" BEFORE UPDATE ON "public"."user_profiles" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();


--
-- Name: users trg_set_updated_at_users; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "trg_set_updated_at_users" BEFORE UPDATE ON "public"."users" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();


--
-- Name: wallets trg_set_updated_at_wallets; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "trg_set_updated_at_wallets" BEFORE UPDATE ON "public"."wallets" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();


--
-- Name: card_pool_cards trg_sync_card_numbers; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "trg_sync_card_numbers" AFTER INSERT OR UPDATE OF "card_data" ON "public"."card_pool_cards" FOR EACH ROW EXECUTE FUNCTION "game_pool"."fn_sync_card_numbers"();


--
-- Name: users trg_sync_player_affiliation_from_users; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "trg_sync_player_affiliation_from_users" AFTER INSERT OR UPDATE OF "role", "parent_id" ON "public"."users" FOR EACH ROW EXECUTE FUNCTION "game_core"."fn_trg_sync_player_affiliation_from_users"();


--
-- Name: results trg_sync_room_winners_from_results; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "trg_sync_room_winners_from_results" AFTER INSERT ON "public"."results" FOR EACH ROW EXECUTE FUNCTION "public"."trg_sync_room_winners_from_results"();


--
-- Name: tickets trg_tickets_after_paid; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "trg_tickets_after_paid" AFTER UPDATE ON "public"."tickets" FOR EACH ROW WHEN (("new"."reservation_status" = 'consumed'::"public"."reservation_status")) EXECUTE FUNCTION "game_finance"."trg_tickets_after_paid"();


--
-- Name: tickets trg_tickets_platform_shadow; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "trg_tickets_platform_shadow" AFTER INSERT OR DELETE OR UPDATE OF "reservation_status", "cancelled_at", "price", "player_user_id", "room_id", "transaction_id" ON "public"."tickets" FOR EACH ROW EXECUTE FUNCTION "platform"."trg_tickets_platform_shadow"();


--
-- Name: TRIGGER "trg_tickets_platform_shadow" ON "tickets"; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TRIGGER "trg_tickets_platform_shadow" ON "public"."tickets" IS 'P5.7 participant shadow enqueue only; must not affect Bingo/wallet/settle.';


--
-- Name: tournament_entries trg_tournament_entries_commission_snapshot; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "trg_tournament_entries_commission_snapshot" AFTER INSERT OR UPDATE OF "tickets_count", "status" ON "public"."tournament_entries" FOR EACH ROW EXECUTE FUNCTION "tournament"."trg_te_commission_snapshot"();


--
-- Name: tournaments trg_tournaments_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "trg_tournaments_updated_at" BEFORE UPDATE ON "public"."tournaments" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();


--
-- Name: user_profiles trg_user_profiles_lock_deposit_identity; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "trg_user_profiles_lock_deposit_identity" BEFORE UPDATE ON "public"."user_profiles" FOR EACH ROW EXECUTE FUNCTION "public"."tg_user_profiles_lock_deposit_identity"();


--
-- Name: player_affiliation trg_validate_affiliation_roles; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "trg_validate_affiliation_roles" BEFORE INSERT OR UPDATE ON "public"."player_affiliation" FOR EACH ROW EXECUTE FUNCTION "game_core"."fn_validate_affiliation_roles"();


--
-- Name: admin_permissions update_admin_permissions_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "update_admin_permissions_updated_at" BEFORE UPDATE ON "public"."admin_permissions" FOR EACH ROW EXECUTE FUNCTION "public"."update_admin_permissions_updated_at"();


--
-- Name: entry_banners update_entry_banners_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "update_entry_banners_updated_at" BEFORE UPDATE ON "public"."entry_banners" FOR EACH ROW EXECUTE FUNCTION "public"."update_entry_banners_updated_at"();


--
-- Name: user_notes update_user_notes_updated_at_trigger; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "update_user_notes_updated_at_trigger" BEFORE UPDATE ON "public"."user_notes" FOR EACH ROW EXECUTE FUNCTION "public"."update_user_notes_updated_at"();


--
-- Name: attempts attempts_intent_id_fkey; Type: FK CONSTRAINT; Schema: deposit; Owner: -
--

ALTER TABLE ONLY "deposit"."attempts"
    ADD CONSTRAINT "attempts_intent_id_fkey" FOREIGN KEY ("intent_id") REFERENCES "deposit"."intents"("id");


--
-- Name: credits credits_intent_id_fkey; Type: FK CONSTRAINT; Schema: deposit; Owner: -
--

ALTER TABLE ONLY "deposit"."credits"
    ADD CONSTRAINT "credits_intent_id_fkey" FOREIGN KEY ("intent_id") REFERENCES "deposit"."intents"("id");


--
-- Name: credits credits_user_id_fkey; Type: FK CONSTRAINT; Schema: deposit; Owner: -
--

ALTER TABLE ONLY "deposit"."credits"
    ADD CONSTRAINT "credits_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id");


--
-- Name: credits credits_verification_id_fkey; Type: FK CONSTRAINT; Schema: deposit; Owner: -
--

ALTER TABLE ONLY "deposit"."credits"
    ADD CONSTRAINT "credits_verification_id_fkey" FOREIGN KEY ("verification_id") REFERENCES "deposit"."verifications"("id");


--
-- Name: crypto_transactions crypto_transactions_user_id_fkey; Type: FK CONSTRAINT; Schema: deposit; Owner: -
--

ALTER TABLE ONLY "deposit"."crypto_transactions"
    ADD CONSTRAINT "crypto_transactions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE;


--
-- Name: crypto_xpub_settings crypto_xpub_settings_updated_by_fkey; Type: FK CONSTRAINT; Schema: deposit; Owner: -
--

ALTER TABLE ONLY "deposit"."crypto_xpub_settings"
    ADD CONSTRAINT "crypto_xpub_settings_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id");


--
-- Name: events events_intent_id_fkey; Type: FK CONSTRAINT; Schema: deposit; Owner: -
--

ALTER TABLE ONLY "deposit"."events"
    ADD CONSTRAINT "events_intent_id_fkey" FOREIGN KEY ("intent_id") REFERENCES "deposit"."intents"("id");


--
-- Name: intents intents_user_id_fkey; Type: FK CONSTRAINT; Schema: deposit; Owner: -
--

ALTER TABLE ONLY "deposit"."intents"
    ADD CONSTRAINT "intents_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id");


--
-- Name: user_crypto_addresses user_crypto_addresses_user_id_fkey; Type: FK CONSTRAINT; Schema: deposit; Owner: -
--

ALTER TABLE ONLY "deposit"."user_crypto_addresses"
    ADD CONSTRAINT "user_crypto_addresses_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE;


--
-- Name: verifications verifications_attempt_id_fkey; Type: FK CONSTRAINT; Schema: deposit; Owner: -
--

ALTER TABLE ONLY "deposit"."verifications"
    ADD CONSTRAINT "verifications_attempt_id_fkey" FOREIGN KEY ("attempt_id") REFERENCES "deposit"."attempts"("id");


--
-- Name: verifications verifications_intent_id_fkey; Type: FK CONSTRAINT; Schema: deposit; Owner: -
--

ALTER TABLE ONLY "deposit"."verifications"
    ADD CONSTRAINT "verifications_intent_id_fkey" FOREIGN KEY ("intent_id") REFERENCES "deposit"."intents"("id");


--
-- Name: engine_registry engine_registry_game_id_fkey; Type: FK CONSTRAINT; Schema: platform; Owner: -
--

ALTER TABLE ONLY "platform"."engine_registry"
    ADD CONSTRAINT "engine_registry_game_id_fkey" FOREIGN KEY ("game_id") REFERENCES "platform"."games"("id");


--
-- Name: game_sessions game_sessions_engine_id_fkey; Type: FK CONSTRAINT; Schema: platform; Owner: -
--

ALTER TABLE ONLY "platform"."game_sessions"
    ADD CONSTRAINT "game_sessions_engine_id_fkey" FOREIGN KEY ("engine_id") REFERENCES "platform"."engine_registry"("id");


--
-- Name: game_sessions game_sessions_game_id_fkey; Type: FK CONSTRAINT; Schema: platform; Owner: -
--

ALTER TABLE ONLY "platform"."game_sessions"
    ADD CONSTRAINT "game_sessions_game_id_fkey" FOREIGN KEY ("game_id") REFERENCES "platform"."games"("id");


--
-- Name: session_events session_events_session_id_fkey; Type: FK CONSTRAINT; Schema: platform; Owner: -
--

ALTER TABLE ONLY "platform"."session_events"
    ADD CONSTRAINT "session_events_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "platform"."game_sessions"("id") ON DELETE CASCADE;


--
-- Name: session_participants session_participants_session_id_fkey; Type: FK CONSTRAINT; Schema: platform; Owner: -
--

ALTER TABLE ONLY "platform"."session_participants"
    ADD CONSTRAINT "session_participants_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "platform"."game_sessions"("id") ON DELETE CASCADE;


--
-- Name: session_participants session_participants_user_id_fkey; Type: FK CONSTRAINT; Schema: platform; Owner: -
--

ALTER TABLE ONLY "platform"."session_participants"
    ADD CONSTRAINT "session_participants_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id");


--
-- Name: session_settlement session_settlement_session_id_fkey; Type: FK CONSTRAINT; Schema: platform; Owner: -
--

ALTER TABLE ONLY "platform"."session_settlement"
    ADD CONSTRAINT "session_settlement_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "platform"."game_sessions"("id") ON DELETE CASCADE;


--
-- Name: session_state session_state_session_id_fkey; Type: FK CONSTRAINT; Schema: platform; Owner: -
--

ALTER TABLE ONLY "platform"."session_state"
    ADD CONSTRAINT "session_state_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "platform"."game_sessions"("id") ON DELETE CASCADE;


--
-- Name: admin_permissions admin_permissions_admin_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."admin_permissions"
    ADD CONSTRAINT "admin_permissions_admin_id_fkey" FOREIGN KEY ("admin_id") REFERENCES "public"."users"("id") ON DELETE CASCADE;


--
-- Name: app_runtime_flags app_runtime_flags_global_registration_locked_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."app_runtime_flags"
    ADD CONSTRAINT "app_runtime_flags_global_registration_locked_by_fkey" FOREIGN KEY ("global_registration_locked_by") REFERENCES "public"."users"("id") ON DELETE SET NULL;


--
-- Name: dev_player_configs bot_player_configs_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."dev_player_configs"
    ADD CONSTRAINT "bot_player_configs_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id");


--
-- Name: dev_player_configs bot_player_configs_updated_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."dev_player_configs"
    ADD CONSTRAINT "bot_player_configs_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id");


--
-- Name: dev_player_configs bot_player_configs_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."dev_player_configs"
    ADD CONSTRAINT "bot_player_configs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE;


--
-- Name: dev_room_schedules bot_room_schedules_approved_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."dev_room_schedules"
    ADD CONSTRAINT "bot_room_schedules_approved_by_fkey" FOREIGN KEY ("approved_by") REFERENCES "public"."users"("id");


--
-- Name: dev_room_schedules bot_room_schedules_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."dev_room_schedules"
    ADD CONSTRAINT "bot_room_schedules_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id");


--
-- Name: dev_room_schedules bot_room_schedules_result_room_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."dev_room_schedules"
    ADD CONSTRAINT "bot_room_schedules_result_room_id_fkey" FOREIGN KEY ("result_room_id") REFERENCES "public"."rooms"("id");


--
-- Name: dev_room_schedules bot_room_schedules_room_template_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."dev_room_schedules"
    ADD CONSTRAINT "bot_room_schedules_room_template_id_fkey" FOREIGN KEY ("room_template_id") REFERENCES "public"."room_templates"("id");


--
-- Name: dev_room_schedules bot_room_schedules_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."dev_room_schedules"
    ADD CONSTRAINT "bot_room_schedules_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id");


--
-- Name: card_definition_masks card_definition_masks_pool_card_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."card_definition_masks"
    ADD CONSTRAINT "card_definition_masks_pool_card_id_fkey" FOREIGN KEY ("pool_card_id") REFERENCES "public"."card_pool_cards"("id") ON DELETE CASCADE;


--
-- Name: card_number_index card_number_index_pool_card_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."card_number_index"
    ADD CONSTRAINT "card_number_index_pool_card_id_fkey" FOREIGN KEY ("pool_card_id") REFERENCES "public"."card_pool_cards"("id") ON DELETE CASCADE;


--
-- Name: card_pool_cards card_pool_cards_pool_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."card_pool_cards"
    ADD CONSTRAINT "card_pool_cards_pool_id_fkey" FOREIGN KEY ("pool_id") REFERENCES "public"."card_pools"("id") ON DELETE CASCADE;


--
-- Name: card_pools card_pools_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."card_pools"
    ADD CONSTRAINT "card_pools_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE SET NULL;


--
-- Name: commissions_log cl_agent_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."commissions_log"
    ADD CONSTRAINT "cl_agent_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."users"("id");


--
-- Name: commissions_log cl_player_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."commissions_log"
    ADD CONSTRAINT "cl_player_fk" FOREIGN KEY ("player_id") REFERENCES "public"."users"("id");


--
-- Name: commissions_log cl_room_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."commissions_log"
    ADD CONSTRAINT "cl_room_fk" FOREIGN KEY ("room_id") REFERENCES "public"."rooms"("id");


--
-- Name: commissions_log cl_super_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."commissions_log"
    ADD CONSTRAINT "cl_super_fk" FOREIGN KEY ("super_id") REFERENCES "public"."users"("id");


--
-- Name: commissions_log cl_ticket_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."commissions_log"
    ADD CONSTRAINT "cl_ticket_fk" FOREIGN KEY ("ticket_id") REFERENCES "public"."tickets"("id") ON DELETE CASCADE;


--
-- Name: dev_player_join_preset_template_limits dev_player_join_preset_template_limits_preset_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."dev_player_join_preset_template_limits"
    ADD CONSTRAINT "dev_player_join_preset_template_limits_preset_id_fkey" FOREIGN KEY ("preset_id") REFERENCES "public"."dev_player_join_presets"("id") ON DELETE CASCADE;


--
-- Name: dev_player_join_preset_template_limits dev_player_join_preset_template_limits_template_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."dev_player_join_preset_template_limits"
    ADD CONSTRAINT "dev_player_join_preset_template_limits_template_id_fkey" FOREIGN KEY ("template_id") REFERENCES "public"."room_templates"("id") ON DELETE CASCADE;


--
-- Name: dev_player_join_presets dev_player_join_presets_updated_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."dev_player_join_presets"
    ADD CONSTRAINT "dev_player_join_presets_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id");


--
-- Name: dev_player_settings dev_player_settings_active_join_preset_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."dev_player_settings"
    ADD CONSTRAINT "dev_player_settings_active_join_preset_id_fkey" FOREIGN KEY ("active_join_preset_id") REFERENCES "public"."dev_player_join_presets"("id") ON DELETE SET NULL;


--
-- Name: dev_player_settings dev_player_settings_updated_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."dev_player_settings"
    ADD CONSTRAINT "dev_player_settings_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id");


--
-- Name: dev_player_template_room_limits dev_player_template_room_limits_template_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."dev_player_template_room_limits"
    ADD CONSTRAINT "dev_player_template_room_limits_template_id_fkey" FOREIGN KEY ("template_id") REFERENCES "public"."room_templates"("id") ON DELETE CASCADE;


--
-- Name: ding_balances ding_balances_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."ding_balances"
    ADD CONSTRAINT "ding_balances_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE;


--
-- Name: ding_transactions ding_transactions_draw_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."ding_transactions"
    ADD CONSTRAINT "ding_transactions_draw_id_fkey" FOREIGN KEY ("draw_id") REFERENCES "public"."draws"("id") ON DELETE SET NULL;


--
-- Name: ding_transactions ding_transactions_room_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."ding_transactions"
    ADD CONSTRAINT "ding_transactions_room_id_fkey" FOREIGN KEY ("room_id") REFERENCES "public"."rooms"("id") ON DELETE SET NULL;


--
-- Name: ding_transactions ding_transactions_ticket_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."ding_transactions"
    ADD CONSTRAINT "ding_transactions_ticket_id_fkey" FOREIGN KEY ("ticket_id") REFERENCES "public"."tickets"("id") ON DELETE SET NULL;


--
-- Name: ding_transactions ding_transactions_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."ding_transactions"
    ADD CONSTRAINT "ding_transactions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE;


--
-- Name: draws draws_room_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."draws"
    ADD CONSTRAINT "draws_room_id_fkey" FOREIGN KEY ("room_id") REFERENCES "public"."rooms"("id") ON DELETE CASCADE;


--
-- Name: entry_banners entry_banners_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."entry_banners"
    ADD CONSTRAINT "entry_banners_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE SET NULL;


--
-- Name: admin_audit_log fk_admin_audit_log_admin_id; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."admin_audit_log"
    ADD CONSTRAINT "fk_admin_audit_log_admin_id" FOREIGN KEY ("admin_id") REFERENCES "public"."users"("id") ON DELETE SET NULL;


--
-- Name: rooms fk_rooms_pool; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."rooms"
    ADD CONSTRAINT "fk_rooms_pool" FOREIGN KEY ("pool_id") REFERENCES "public"."card_pools"("id") ON DELETE RESTRICT;


--
-- Name: rooms fk_rooms_room_templates; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."rooms"
    ADD CONSTRAINT "fk_rooms_room_templates" FOREIGN KEY ("room_template_id") REFERENCES "public"."room_templates"("id") ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: invitation_links invitation_links_inviter_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."invitation_links"
    ADD CONSTRAINT "invitation_links_inviter_id_fkey" FOREIGN KEY ("inviter_id") REFERENCES "public"."users"("id") ON DELETE CASCADE;


--
-- Name: kyc_submissions kyc_submissions_reviewed_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."kyc_submissions"
    ADD CONSTRAINT "kyc_submissions_reviewed_by_fkey" FOREIGN KEY ("reviewed_by") REFERENCES "public"."users"("id") ON DELETE SET NULL;


--
-- Name: kyc_submissions kyc_submissions_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."kyc_submissions"
    ADD CONSTRAINT "kyc_submissions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE;


--
-- Name: marks marks_ticket_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."marks"
    ADD CONSTRAINT "marks_ticket_fk" FOREIGN KEY ("ticket_id") REFERENCES "public"."tickets"("id") ON DELETE CASCADE;


--
-- Name: player_affiliation player_affiliation_agent_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."player_affiliation"
    ADD CONSTRAINT "player_affiliation_agent_id_fkey" FOREIGN KEY ("agent_id") REFERENCES "public"."users"("id") ON DELETE SET NULL;


--
-- Name: player_affiliation player_affiliation_super_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."player_affiliation"
    ADD CONSTRAINT "player_affiliation_super_id_fkey" FOREIGN KEY ("super_id") REFERENCES "public"."users"("id") ON DELETE SET NULL;


--
-- Name: player_affiliation player_affiliation_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."player_affiliation"
    ADD CONSTRAINT "player_affiliation_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE;


--
-- Name: player_signups player_signups_invitation_link_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."player_signups"
    ADD CONSTRAINT "player_signups_invitation_link_id_fkey" FOREIGN KEY ("invitation_link_id") REFERENCES "public"."invitation_links"("id") ON DELETE CASCADE;


--
-- Name: player_signups player_signups_player_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."player_signups"
    ADD CONSTRAINT "player_signups_player_id_fkey" FOREIGN KEY ("player_id") REFERENCES "public"."users"("id") ON DELETE CASCADE;


--
-- Name: results results_room_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."results"
    ADD CONSTRAINT "results_room_id_fkey" FOREIGN KEY ("room_id") REFERENCES "public"."rooms"("id") ON DELETE CASCADE;


--
-- Name: results results_ticket_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."results"
    ADD CONSTRAINT "results_ticket_id_fkey" FOREIGN KEY ("ticket_id") REFERENCES "public"."tickets"("id") ON DELETE CASCADE;


--
-- Name: results results_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."results"
    ADD CONSTRAINT "results_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE;


--
-- Name: rooms rooms_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."rooms"
    ADD CONSTRAINT "rooms_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE SET NULL;


--
-- Name: rooms rooms_room_template_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."rooms"
    ADD CONSTRAINT "rooms_room_template_id_fkey" FOREIGN KEY ("room_template_id") REFERENCES "public"."room_templates"("id");


--
-- Name: tournament_commission_log tcp_beneficiary_user_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."tournament_commission_log"
    ADD CONSTRAINT "tcp_beneficiary_user_fkey" FOREIGN KEY ("beneficiary_user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE;


--
-- Name: tournament_commission_log tcp_entry_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."tournament_commission_log"
    ADD CONSTRAINT "tcp_entry_fkey" FOREIGN KEY ("entry_id") REFERENCES "public"."tournament_entries"("id") ON DELETE CASCADE;


--
-- Name: tournament_commission_log tcp_tournament_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."tournament_commission_log"
    ADD CONSTRAINT "tcp_tournament_fkey" FOREIGN KEY ("tournament_id") REFERENCES "public"."tournaments"("id") ON DELETE CASCADE;


--
-- Name: tickets tickets_player_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."tickets"
    ADD CONSTRAINT "tickets_player_user_id_fkey" FOREIGN KEY ("player_user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE;


--
-- Name: tickets tickets_pool_card_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."tickets"
    ADD CONSTRAINT "tickets_pool_card_id_fkey" FOREIGN KEY ("pool_card_id") REFERENCES "public"."card_pool_cards"("id") ON DELETE RESTRICT;


--
-- Name: tickets tickets_room_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."tickets"
    ADD CONSTRAINT "tickets_room_id_fkey" FOREIGN KEY ("room_id") REFERENCES "public"."rooms"("id") ON DELETE CASCADE;


--
-- Name: tickets tickets_transaction_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."tickets"
    ADD CONSTRAINT "tickets_transaction_id_fkey" FOREIGN KEY ("transaction_id") REFERENCES "public"."transactions"("id") ON DELETE SET NULL;


--
-- Name: tournament_entries tournament_entries_tournament_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."tournament_entries"
    ADD CONSTRAINT "tournament_entries_tournament_fkey" FOREIGN KEY ("tournament_id") REFERENCES "public"."tournaments"("id") ON DELETE CASCADE;


--
-- Name: tournament_entries tournament_entries_user_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."tournament_entries"
    ADD CONSTRAINT "tournament_entries_user_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE;


--
-- Name: tournament_locks tournament_locks_entry_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."tournament_locks"
    ADD CONSTRAINT "tournament_locks_entry_fkey" FOREIGN KEY ("entry_id") REFERENCES "public"."tournament_entries"("id") ON DELETE SET NULL;


--
-- Name: tournament_locks tournament_locks_owner_user_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."tournament_locks"
    ADD CONSTRAINT "tournament_locks_owner_user_fkey" FOREIGN KEY ("owner_user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE;


--
-- Name: tournament_locks tournament_locks_tournament_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."tournament_locks"
    ADD CONSTRAINT "tournament_locks_tournament_fkey" FOREIGN KEY ("tournament_id") REFERENCES "public"."tournaments"("id") ON DELETE CASCADE;


--
-- Name: tournament_locks tournament_locks_wallet_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."tournament_locks"
    ADD CONSTRAINT "tournament_locks_wallet_fkey" FOREIGN KEY ("wallet_id") REFERENCES "public"."wallets"("id") ON DELETE SET NULL;


--
-- Name: tournament_payouts tournament_payouts_tournament_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."tournament_payouts"
    ADD CONSTRAINT "tournament_payouts_tournament_fkey" FOREIGN KEY ("tournament_id") REFERENCES "public"."tournaments"("id") ON DELETE CASCADE;


--
-- Name: tournament_payouts tournament_payouts_user_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."tournament_payouts"
    ADD CONSTRAINT "tournament_payouts_user_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE;


--
-- Name: tournament_prize_rules tournament_prize_rules_tournament_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."tournament_prize_rules"
    ADD CONSTRAINT "tournament_prize_rules_tournament_fkey" FOREIGN KEY ("tournament_id") REFERENCES "public"."tournaments"("id") ON DELETE CASCADE;


--
-- Name: tournament_round_assignments tournament_round_assignments_tournament_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."tournament_round_assignments"
    ADD CONSTRAINT "tournament_round_assignments_tournament_fkey" FOREIGN KEY ("tournament_id") REFERENCES "public"."tournaments"("id") ON DELETE CASCADE;


--
-- Name: tournament_round_assignments tournament_round_assignments_user_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."tournament_round_assignments"
    ADD CONSTRAINT "tournament_round_assignments_user_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE;


--
-- Name: tournament_round_rooms tournament_round_rooms_room_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."tournament_round_rooms"
    ADD CONSTRAINT "tournament_round_rooms_room_fkey" FOREIGN KEY ("room_id") REFERENCES "public"."rooms"("id") ON DELETE SET NULL;


--
-- Name: tournament_round_rooms tournament_round_rooms_tournament_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."tournament_round_rooms"
    ADD CONSTRAINT "tournament_round_rooms_tournament_fkey" FOREIGN KEY ("tournament_id") REFERENCES "public"."tournaments"("id") ON DELETE CASCADE;


--
-- Name: tournaments tournaments_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."tournaments"
    ADD CONSTRAINT "tournaments_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE SET NULL;


--
-- Name: tournaments tournaments_room_template_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."tournaments"
    ADD CONSTRAINT "tournaments_room_template_fkey" FOREIGN KEY ("room_template_id") REFERENCES "public"."room_templates"("id") ON DELETE SET NULL;


--
-- Name: transactions transactions_related_room_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."transactions"
    ADD CONSTRAINT "transactions_related_room_fkey" FOREIGN KEY ("related_room") REFERENCES "public"."rooms"("id") ON DELETE SET NULL;


--
-- Name: transactions transactions_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."transactions"
    ADD CONSTRAINT "transactions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE;


--
-- Name: transactions transactions_wallet_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."transactions"
    ADD CONSTRAINT "transactions_wallet_id_fkey" FOREIGN KEY ("wallet_id") REFERENCES "public"."wallets"("id") ON DELETE CASCADE;


--
-- Name: user_commissions user_commissions_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."user_commissions"
    ADD CONSTRAINT "user_commissions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE;


--
-- Name: user_notes user_notes_author_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."user_notes"
    ADD CONSTRAINT "user_notes_author_id_fkey" FOREIGN KEY ("author_id") REFERENCES "public"."users"("id") ON DELETE CASCADE;


--
-- Name: user_notes user_notes_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."user_notes"
    ADD CONSTRAINT "user_notes_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE;


--
-- Name: user_profiles user_profiles_new_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."user_profiles"
    ADD CONSTRAINT "user_profiles_new_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE;


--
-- Name: user_profiles_old_backup user_profiles_parent_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."user_profiles_old_backup"
    ADD CONSTRAINT "user_profiles_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "public"."user_profiles_old_backup"("id") ON DELETE SET NULL;


--
-- Name: users users_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."users"
    ADD CONSTRAINT "users_id_fkey" FOREIGN KEY ("id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;


--
-- Name: users users_parent_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."users"
    ADD CONSTRAINT "users_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "public"."users"("id") ON DELETE SET NULL;


--
-- Name: wallet_transfer_idempotency wallet_transfer_idempotency_actor_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."wallet_transfer_idempotency"
    ADD CONSTRAINT "wallet_transfer_idempotency_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "public"."users"("id");


--
-- Name: wallets wallets_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."wallets"
    ADD CONSTRAINT "wallets_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE;


--
-- Name: withdrawal_requests withdrawal_requests_agent_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."withdrawal_requests"
    ADD CONSTRAINT "withdrawal_requests_agent_id_fkey" FOREIGN KEY ("agent_id") REFERENCES "public"."users"("id") ON DELETE RESTRICT;


--
-- Name: withdrawal_requests withdrawal_requests_player_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."withdrawal_requests"
    ADD CONSTRAINT "withdrawal_requests_player_id_fkey" FOREIGN KEY ("player_id") REFERENCES "public"."users"("id") ON DELETE RESTRICT;


--
-- Name: withdrawal_requests withdrawal_requests_reviewed_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."withdrawal_requests"
    ADD CONSTRAINT "withdrawal_requests_reviewed_by_fkey" FOREIGN KEY ("reviewed_by") REFERENCES "public"."users"("id") ON DELETE SET NULL;


--
-- Name: attempts; Type: ROW SECURITY; Schema: deposit; Owner: -
--

ALTER TABLE "deposit"."attempts" ENABLE ROW LEVEL SECURITY;

--
-- Name: credits; Type: ROW SECURITY; Schema: deposit; Owner: -
--

ALTER TABLE "deposit"."credits" ENABLE ROW LEVEL SECURITY;

--
-- Name: crypto_derivation_state; Type: ROW SECURITY; Schema: deposit; Owner: -
--

ALTER TABLE "deposit"."crypto_derivation_state" ENABLE ROW LEVEL SECURITY;

--
-- Name: crypto_rate_tiers; Type: ROW SECURITY; Schema: deposit; Owner: -
--

ALTER TABLE "deposit"."crypto_rate_tiers" ENABLE ROW LEVEL SECURITY;

--
-- Name: crypto_transactions; Type: ROW SECURITY; Schema: deposit; Owner: -
--

ALTER TABLE "deposit"."crypto_transactions" ENABLE ROW LEVEL SECURITY;

--
-- Name: crypto_xpub_settings; Type: ROW SECURITY; Schema: deposit; Owner: -
--

ALTER TABLE "deposit"."crypto_xpub_settings" ENABLE ROW LEVEL SECURITY;

--
-- Name: events; Type: ROW SECURITY; Schema: deposit; Owner: -
--

ALTER TABLE "deposit"."events" ENABLE ROW LEVEL SECURITY;

--
-- Name: intents; Type: ROW SECURITY; Schema: deposit; Owner: -
--

ALTER TABLE "deposit"."intents" ENABLE ROW LEVEL SECURITY;

--
-- Name: recon_reports; Type: ROW SECURITY; Schema: deposit; Owner: -
--

ALTER TABLE "deposit"."recon_reports" ENABLE ROW LEVEL SECURITY;

--
-- Name: user_crypto_addresses; Type: ROW SECURITY; Schema: deposit; Owner: -
--

ALTER TABLE "deposit"."user_crypto_addresses" ENABLE ROW LEVEL SECURITY;

--
-- Name: verifications; Type: ROW SECURITY; Schema: deposit; Owner: -
--

ALTER TABLE "deposit"."verifications" ENABLE ROW LEVEL SECURITY;

--
-- Name: engine_registry; Type: ROW SECURITY; Schema: platform; Owner: -
--

ALTER TABLE "platform"."engine_registry" ENABLE ROW LEVEL SECURITY;

--
-- Name: game_sessions; Type: ROW SECURITY; Schema: platform; Owner: -
--

ALTER TABLE "platform"."game_sessions" ENABLE ROW LEVEL SECURITY;

--
-- Name: games; Type: ROW SECURITY; Schema: platform; Owner: -
--

ALTER TABLE "platform"."games" ENABLE ROW LEVEL SECURITY;

--
-- Name: engine_registry platform_engine_registry_service_all; Type: POLICY; Schema: platform; Owner: -
--

CREATE POLICY "platform_engine_registry_service_all" ON "platform"."engine_registry" TO "service_role" USING (true) WITH CHECK (true);


--
-- Name: game_sessions platform_game_sessions_service_all; Type: POLICY; Schema: platform; Owner: -
--

CREATE POLICY "platform_game_sessions_service_all" ON "platform"."game_sessions" TO "service_role" USING (true) WITH CHECK (true);


--
-- Name: games platform_games_service_all; Type: POLICY; Schema: platform; Owner: -
--

CREATE POLICY "platform_games_service_all" ON "platform"."games" TO "service_role" USING (true) WITH CHECK (true);


--
-- Name: session_events platform_session_events_service_all; Type: POLICY; Schema: platform; Owner: -
--

CREATE POLICY "platform_session_events_service_all" ON "platform"."session_events" TO "service_role" USING (true) WITH CHECK (true);


--
-- Name: session_participants platform_session_participants_service_all; Type: POLICY; Schema: platform; Owner: -
--

CREATE POLICY "platform_session_participants_service_all" ON "platform"."session_participants" TO "service_role" USING (true) WITH CHECK (true);


--
-- Name: session_settlement platform_session_settlement_service_all; Type: POLICY; Schema: platform; Owner: -
--

CREATE POLICY "platform_session_settlement_service_all" ON "platform"."session_settlement" TO "service_role" USING (true) WITH CHECK (true);


--
-- Name: session_state platform_session_state_service_all; Type: POLICY; Schema: platform; Owner: -
--

CREATE POLICY "platform_session_state_service_all" ON "platform"."session_state" TO "service_role" USING (true) WITH CHECK (true);


--
-- Name: shadow_mirror_log platform_shadow_mirror_log_service_all; Type: POLICY; Schema: platform; Owner: -
--

CREATE POLICY "platform_shadow_mirror_log_service_all" ON "platform"."shadow_mirror_log" TO "service_role" USING (true) WITH CHECK (true);


--
-- Name: shadow_outbox platform_shadow_outbox_service_all; Type: POLICY; Schema: platform; Owner: -
--

CREATE POLICY "platform_shadow_outbox_service_all" ON "platform"."shadow_outbox" TO "service_role" USING (true) WITH CHECK (true);


--
-- Name: session_events; Type: ROW SECURITY; Schema: platform; Owner: -
--

ALTER TABLE "platform"."session_events" ENABLE ROW LEVEL SECURITY;

--
-- Name: session_participants; Type: ROW SECURITY; Schema: platform; Owner: -
--

ALTER TABLE "platform"."session_participants" ENABLE ROW LEVEL SECURITY;

--
-- Name: session_settlement; Type: ROW SECURITY; Schema: platform; Owner: -
--

ALTER TABLE "platform"."session_settlement" ENABLE ROW LEVEL SECURITY;

--
-- Name: session_state; Type: ROW SECURITY; Schema: platform; Owner: -
--

ALTER TABLE "platform"."session_state" ENABLE ROW LEVEL SECURITY;

--
-- Name: shadow_mirror_log; Type: ROW SECURITY; Schema: platform; Owner: -
--

ALTER TABLE "platform"."shadow_mirror_log" ENABLE ROW LEVEL SECURITY;

--
-- Name: shadow_outbox; Type: ROW SECURITY; Schema: platform; Owner: -
--

ALTER TABLE "platform"."shadow_outbox" ENABLE ROW LEVEL SECURITY;

--
-- Name: ding_balances Users can receive realtime ding balance updates; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can receive realtime ding balance updates" ON "public"."ding_balances" FOR UPDATE USING (("auth"."uid"() = "user_id"));


--
-- Name: users Users can update own referral_code; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can update own referral_code" ON "public"."users" FOR UPDATE TO "authenticated" USING ((("auth"."uid"() = "id") AND ("role" = ANY (ARRAY['admin'::"public"."user_role", 'agent'::"public"."user_role", 'super'::"public"."user_role"])))) WITH CHECK ((("auth"."uid"() = "id") AND ("role" = ANY (ARRAY['admin'::"public"."user_role", 'agent'::"public"."user_role", 'super'::"public"."user_role"])) AND (("referral_code" IS NULL) OR ("referral_code" ~ '^[A-Z0-9]{3,8}$'::"text"))));


--
-- Name: ding_balances Users can view their own ding balance; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view their own ding balance" ON "public"."ding_balances" FOR SELECT USING (("auth"."uid"() = "user_id"));


--
-- Name: ding_transactions Users can view their own ding transactions; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view their own ding transactions" ON "public"."ding_transactions" FOR SELECT USING (("auth"."uid"() = "user_id"));


--
-- Name: admin_audit_log; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."admin_audit_log" ENABLE ROW LEVEL SECURITY;

--
-- Name: admin_audit_log admin_can_view_audit_log; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "admin_can_view_audit_log" ON "public"."admin_audit_log" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."users"
  WHERE (("users"."id" = "auth"."uid"()) AND ("users"."role" = 'admin'::"public"."user_role")))));


--
-- Name: admin_permissions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."admin_permissions" ENABLE ROW LEVEL SECURITY;

--
-- Name: admin_permissions admins_can_view_all_permissions; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "admins_can_view_all_permissions" ON "public"."admin_permissions" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."users"
  WHERE (("users"."id" = "auth"."uid"()) AND ("users"."role" = 'admin'::"public"."user_role") AND ("users"."status" = 'active'::"public"."user_status")))));


--
-- Name: entry_banners admins_can_view_banners; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "admins_can_view_banners" ON "public"."entry_banners" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."users"
  WHERE (("users"."id" = "auth"."uid"()) AND ("users"."role" = 'admin'::"public"."user_role") AND ("users"."status" = 'active'::"public"."user_status")))));


--
-- Name: entry_banners all_users_can_view_active_banners; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "all_users_can_view_active_banners" ON "public"."entry_banners" FOR SELECT USING ((("is_active" = true) AND ("auth"."uid"() IS NOT NULL)));


--
-- Name: transactions allow_service_insert_transactions; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "allow_service_insert_transactions" ON "public"."transactions" FOR INSERT TO "service_role" WITH CHECK (true);


--
-- Name: wallets allow_service_update_wallets; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "allow_service_update_wallets" ON "public"."wallets" FOR UPDATE TO "service_role" USING (true) WITH CHECK (true);


--
-- Name: invitation_links anyone_validate_codes; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "anyone_validate_codes" ON "public"."invitation_links" FOR SELECT USING (true);


--
-- Name: POLICY "anyone_validate_codes" ON "invitation_links"; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON POLICY "anyone_validate_codes" ON "public"."invitation_links" IS 'اجازه خواندن کدها برای validate (فقط خواندن، نه اطلاعات کامل)';


--
-- Name: app_runtime_flags; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."app_runtime_flags" ENABLE ROW LEVEL SECURITY;

--
-- Name: card_definition_masks; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."card_definition_masks" ENABLE ROW LEVEL SECURITY;

--
-- Name: card_number_index; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."card_number_index" ENABLE ROW LEVEL SECURITY;

--
-- Name: card_numbers; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."card_numbers" ENABLE ROW LEVEL SECURITY;

--
-- Name: card_numbers card_numbers_delete_admin; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "card_numbers_delete_admin" ON "public"."card_numbers" FOR DELETE USING ("public"."is_admin_active"());


--
-- Name: card_numbers card_numbers_insert_admin; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "card_numbers_insert_admin" ON "public"."card_numbers" FOR INSERT WITH CHECK ("public"."is_admin_active"());


--
-- Name: card_numbers card_numbers_select_admin; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "card_numbers_select_admin" ON "public"."card_numbers" FOR SELECT USING ("public"."is_admin_active"());


--
-- Name: card_numbers card_numbers_update_admin; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "card_numbers_update_admin" ON "public"."card_numbers" FOR UPDATE USING ("public"."is_admin_active"()) WITH CHECK ("public"."is_admin_active"());


--
-- Name: card_pool_cards; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."card_pool_cards" ENABLE ROW LEVEL SECURITY;

--
-- Name: card_pool_cards card_pool_cards_delete_admin; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "card_pool_cards_delete_admin" ON "public"."card_pool_cards" FOR DELETE USING ("public"."is_admin_active"());


--
-- Name: card_pool_cards card_pool_cards_insert_admin; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "card_pool_cards_insert_admin" ON "public"."card_pool_cards" FOR INSERT WITH CHECK ("public"."is_admin_active"());


--
-- Name: card_pool_cards card_pool_cards_select_admin; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "card_pool_cards_select_admin" ON "public"."card_pool_cards" FOR SELECT USING ("public"."is_admin_active"());


--
-- Name: card_pool_cards card_pool_cards_update_admin; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "card_pool_cards_update_admin" ON "public"."card_pool_cards" FOR UPDATE USING ("public"."is_admin_active"()) WITH CHECK ("public"."is_admin_active"());


--
-- Name: card_pools; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."card_pools" ENABLE ROW LEVEL SECURITY;

--
-- Name: card_pools card_pools_delete_admin; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "card_pools_delete_admin" ON "public"."card_pools" FOR DELETE USING ("public"."is_admin_active"());


--
-- Name: card_pools card_pools_insert_admin; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "card_pools_insert_admin" ON "public"."card_pools" FOR INSERT WITH CHECK ("public"."is_admin_active"());


--
-- Name: card_pools card_pools_select_admin; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "card_pools_select_admin" ON "public"."card_pools" FOR SELECT USING ("public"."is_admin_active"());


--
-- Name: card_pools card_pools_update_admin; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "card_pools_update_admin" ON "public"."card_pools" FOR UPDATE USING ("public"."is_admin_active"()) WITH CHECK ("public"."is_admin_active"());


--
-- Name: commissions_log; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."commissions_log" ENABLE ROW LEVEL SECURITY;

--
-- Name: commissions_log commissions_log_admin_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "commissions_log_admin_read" ON "public"."commissions_log" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."users" "u"
  WHERE (("u"."id" = "auth"."uid"()) AND ("u"."role" = 'admin'::"public"."user_role")))));


--
-- Name: commissions_log commissions_log_agent_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "commissions_log_agent_read" ON "public"."commissions_log" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."users" "u"
  WHERE (("u"."id" = "auth"."uid"()) AND ("u"."role" = 'agent'::"public"."user_role") AND ("commissions_log"."agent_id" = "u"."id")))));


--
-- Name: commissions_log commissions_log_super_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "commissions_log_super_read" ON "public"."commissions_log" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."users" "u"
  WHERE (("u"."id" = "auth"."uid"()) AND ("u"."role" = 'super'::"public"."user_role") AND ("commissions_log"."super_id" = "u"."id")))));


--
-- Name: debug_room_status_log; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."debug_room_status_log" ENABLE ROW LEVEL SECURITY;

--
-- Name: dev_player_configs; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."dev_player_configs" ENABLE ROW LEVEL SECURITY;

--
-- Name: dev_player_join_preset_template_limits; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."dev_player_join_preset_template_limits" ENABLE ROW LEVEL SECURITY;

--
-- Name: dev_player_join_presets; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."dev_player_join_presets" ENABLE ROW LEVEL SECURITY;

--
-- Name: dev_player_settings; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."dev_player_settings" ENABLE ROW LEVEL SECURITY;

--
-- Name: dev_player_template_room_limits; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."dev_player_template_room_limits" ENABLE ROW LEVEL SECURITY;

--
-- Name: dev_room_schedules; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."dev_room_schedules" ENABLE ROW LEVEL SECURITY;

--
-- Name: ding_balances; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."ding_balances" ENABLE ROW LEVEL SECURITY;

--
-- Name: ding_transactions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."ding_transactions" ENABLE ROW LEVEL SECURITY;

--
-- Name: draw_jobs; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."draw_jobs" ENABLE ROW LEVEL SECURITY;

--
-- Name: draw_jobs draw_jobs_delete_service; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "draw_jobs_delete_service" ON "public"."draw_jobs" FOR DELETE TO "service_role" USING (true);


--
-- Name: draw_jobs draw_jobs_insert_service; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "draw_jobs_insert_service" ON "public"."draw_jobs" FOR INSERT TO "service_role" WITH CHECK (true);


--
-- Name: draw_jobs draw_jobs_select_admin; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "draw_jobs_select_admin" ON "public"."draw_jobs" FOR SELECT USING ("public"."is_admin_active"());


--
-- Name: draw_jobs draw_jobs_update_service; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "draw_jobs_update_service" ON "public"."draw_jobs" FOR UPDATE TO "service_role" USING (true) WITH CHECK (true);


--
-- Name: draws; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."draws" ENABLE ROW LEVEL SECURITY;

--
-- Name: draws draws_read_public; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "draws_read_public" ON "public"."draws" FOR SELECT USING (true);


--
-- Name: entry_banners; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."entry_banners" ENABLE ROW LEVEL SECURITY;

--
-- Name: finance_recon_reports; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."finance_recon_reports" ENABLE ROW LEVEL SECURITY;

--
-- Name: heartbeat_log; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."heartbeat_log" ENABLE ROW LEVEL SECURITY;

--
-- Name: heartbeat_log_default; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."heartbeat_log_default" ENABLE ROW LEVEL SECURITY;

--
-- Name: heartbeat_log heartbeat_log_delete_service; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "heartbeat_log_delete_service" ON "public"."heartbeat_log" FOR DELETE TO "service_role" USING (true);


--
-- Name: heartbeat_log heartbeat_log_insert_service; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "heartbeat_log_insert_service" ON "public"."heartbeat_log" FOR INSERT TO "service_role" WITH CHECK (true);


--
-- Name: heartbeat_log heartbeat_log_select_admin; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "heartbeat_log_select_admin" ON "public"."heartbeat_log" FOR SELECT USING ("public"."is_admin_active"());


--
-- Name: heartbeat_log heartbeat_log_update_service; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "heartbeat_log_update_service" ON "public"."heartbeat_log" FOR UPDATE TO "service_role" USING (true) WITH CHECK (true);


--
-- Name: invitation_links; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."invitation_links" ENABLE ROW LEVEL SECURITY;

--
-- Name: invitation_links inviters_create_own_links; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "inviters_create_own_links" ON "public"."invitation_links" FOR INSERT WITH CHECK ((("inviter_id" = "auth"."uid"()) AND (( SELECT "users"."role"
   FROM "public"."users"
  WHERE ("users"."id" = "auth"."uid"())) = ANY (ARRAY['admin'::"public"."user_role", 'agent'::"public"."user_role", 'super'::"public"."user_role"]))));


--
-- Name: invitation_links inviters_update_own_links; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "inviters_update_own_links" ON "public"."invitation_links" FOR UPDATE USING ((("inviter_id" = "auth"."uid"()) OR (( SELECT "users"."role"
   FROM "public"."users"
  WHERE ("users"."id" = "auth"."uid"())) = 'admin'::"public"."user_role")));


--
-- Name: invitation_links inviters_view_own_links; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "inviters_view_own_links" ON "public"."invitation_links" FOR SELECT USING ((("inviter_id" = "auth"."uid"()) OR (( SELECT "users"."role"
   FROM "public"."users"
  WHERE ("users"."id" = "auth"."uid"())) = 'admin'::"public"."user_role")));


--
-- Name: kyc_submissions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."kyc_submissions" ENABLE ROW LEVEL SECURITY;

--
-- Name: entry_banners manager_admins_can_modify_banners; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "manager_admins_can_modify_banners" ON "public"."entry_banners" USING ((EXISTS ( SELECT 1
   FROM "public"."users"
  WHERE (("users"."id" = "auth"."uid"()) AND ("users"."role" = 'admin'::"public"."user_role") AND ("users"."admin_sub_role" IS NULL) AND ("users"."status" = 'active'::"public"."user_status")))));


--
-- Name: admin_permissions manager_admins_can_modify_permissions; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "manager_admins_can_modify_permissions" ON "public"."admin_permissions" USING ((EXISTS ( SELECT 1
   FROM "public"."users"
  WHERE (("users"."id" = "auth"."uid"()) AND ("users"."role" = 'admin'::"public"."user_role") AND ("users"."admin_sub_role" IS NULL) AND ("users"."status" = 'active'::"public"."user_status")))));


--
-- Name: marks; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."marks" ENABLE ROW LEVEL SECURITY;

--
-- Name: marks marks_delete_service; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "marks_delete_service" ON "public"."marks" FOR DELETE TO "service_role" USING (true);


--
-- Name: marks marks_insert_service; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "marks_insert_service" ON "public"."marks" FOR INSERT TO "service_role" WITH CHECK (true);


--
-- Name: marks marks_select_admin; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "marks_select_admin" ON "public"."marks" FOR SELECT USING ("public"."is_admin_active"());


--
-- Name: marks marks_update_service; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "marks_update_service" ON "public"."marks" FOR UPDATE TO "service_role" USING (true) WITH CHECK (true);


--
-- Name: player_affiliation; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."player_affiliation" ENABLE ROW LEVEL SECURITY;

--
-- Name: player_affiliation player_affiliation_delete_service; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "player_affiliation_delete_service" ON "public"."player_affiliation" FOR DELETE TO "service_role" USING (true);


--
-- Name: player_affiliation player_affiliation_insert_service; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "player_affiliation_insert_service" ON "public"."player_affiliation" FOR INSERT TO "service_role" WITH CHECK (true);


--
-- Name: player_affiliation player_affiliation_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "player_affiliation_select" ON "public"."player_affiliation" FOR SELECT USING (("public"."can_read_user"("user_id") OR ("agent_id" = "auth"."uid"()) OR ("super_id" = "auth"."uid"())));


--
-- Name: player_affiliation player_affiliation_update_service; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "player_affiliation_update_service" ON "public"."player_affiliation" FOR UPDATE TO "service_role" USING (true) WITH CHECK (true);


--
-- Name: player_signups; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."player_signups" ENABLE ROW LEVEL SECURITY;

--
-- Name: player_signups players_view_own_signup; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "players_view_own_signup" ON "public"."player_signups" FOR SELECT USING (("player_id" = "auth"."uid"()));


--
-- Name: results; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."results" ENABLE ROW LEVEL SECURITY;

--
-- Name: results results_admin_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "results_admin_read" ON "public"."results" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."users" "u"
  WHERE (("u"."id" = "auth"."uid"()) AND ("u"."role" = 'admin'::"public"."user_role")))));


--
-- Name: results results_agent_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "results_agent_read" ON "public"."results" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM ("public"."users" "u"
     JOIN "public"."users" "player" ON ((("player"."parent_id" = "u"."id") AND ("player"."role" = 'player'::"public"."user_role"))))
  WHERE (("u"."id" = "auth"."uid"()) AND ("u"."role" = 'agent'::"public"."user_role") AND ("player"."id" = "results"."user_id")))));


--
-- Name: results results_player_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "results_player_read" ON "public"."results" FOR SELECT USING (("user_id" = "auth"."uid"()));


--
-- Name: results results_room_member_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "results_room_member_read" ON "public"."results" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."tickets" "t"
  WHERE (("t"."room_id" = "results"."room_id") AND ("t"."player_user_id" = "auth"."uid"()) AND ("t"."reservation_status" = ANY (ARRAY['reserved'::"public"."reservation_status", 'confirmed'::"public"."reservation_status", 'consumed'::"public"."reservation_status"]))))));


--
-- Name: results results_super_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "results_super_read" ON "public"."results" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."users" "u"
  WHERE (("u"."id" = "auth"."uid"()) AND ("u"."role" = 'super'::"public"."user_role") AND ((EXISTS ( SELECT 1
           FROM "public"."users" "player"
          WHERE (("player"."parent_id" = "u"."id") AND ("player"."role" = 'player'::"public"."user_role") AND ("player"."id" = "results"."user_id")))) OR (EXISTS ( SELECT 1
           FROM ("public"."users" "agent"
             JOIN "public"."users" "player" ON ((("player"."parent_id" = "agent"."id") AND ("player"."role" = 'player'::"public"."user_role"))))
          WHERE (("agent"."parent_id" = "u"."id") AND ("agent"."role" = 'agent'::"public"."user_role") AND ("player"."id" = "results"."user_id")))))))));


--
-- Name: room_templates; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."room_templates" ENABLE ROW LEVEL SECURITY;

--
-- Name: room_templates room_templates_delete_admin; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "room_templates_delete_admin" ON "public"."room_templates" FOR DELETE USING ("public"."is_admin_active"());


--
-- Name: room_templates room_templates_insert_admin; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "room_templates_insert_admin" ON "public"."room_templates" FOR INSERT WITH CHECK ("public"."is_admin_active"());


--
-- Name: room_templates room_templates_select_admin; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "room_templates_select_admin" ON "public"."room_templates" FOR SELECT USING ("public"."is_admin_active"());


--
-- Name: room_templates room_templates_select_authenticated; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "room_templates_select_authenticated" ON "public"."room_templates" FOR SELECT TO "authenticated" USING (("status" <> 'inactive'::"public"."room_template_status"));


--
-- Name: room_templates room_templates_update_admin; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "room_templates_update_admin" ON "public"."room_templates" FOR UPDATE USING ("public"."is_admin_active"()) WITH CHECK ("public"."is_admin_active"());


--
-- Name: room_winners; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."room_winners" ENABLE ROW LEVEL SECURITY;

--
-- Name: room_winners room_winners_delete_service; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "room_winners_delete_service" ON "public"."room_winners" FOR DELETE TO "service_role" USING (true);


--
-- Name: room_winners room_winners_insert_service; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "room_winners_insert_service" ON "public"."room_winners" FOR INSERT TO "service_role" WITH CHECK (true);


--
-- Name: room_winners room_winners_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "room_winners_select" ON "public"."room_winners" FOR SELECT USING ((("user_id" = "auth"."uid"()) OR "public"."is_admin_active"()));


--
-- Name: room_winners room_winners_update_service; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "room_winners_update_service" ON "public"."room_winners" FOR UPDATE TO "service_role" USING (true) WITH CHECK (true);


--
-- Name: rooms; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."rooms" ENABLE ROW LEVEL SECURITY;

--
-- Name: rooms rooms_read_public; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "rooms_read_public" ON "public"."rooms" FOR SELECT USING (true);


--
-- Name: player_signups system_insert_signups; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "system_insert_signups" ON "public"."player_signups" FOR INSERT WITH CHECK (true);


--
-- Name: tickets; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."tickets" ENABLE ROW LEVEL SECURITY;

--
-- Name: tickets tickets_owner_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "tickets_owner_read" ON "public"."tickets" FOR SELECT USING (("player_user_id" = "auth"."uid"()));


--
-- Name: tickets tickets_public_read_waiting; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "tickets_public_read_waiting" ON "public"."tickets" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."rooms" "r"
  WHERE (("r"."id" = "tickets"."room_id") AND ("r"."status" = ANY (ARRAY['waiting'::"public"."room_status", 'cancelled'::"public"."room_status"]))))));


--
-- Name: tournament_commission_log; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."tournament_commission_log" ENABLE ROW LEVEL SECURITY;

--
-- Name: tournament_commission_log tournament_commission_log_delete_service; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "tournament_commission_log_delete_service" ON "public"."tournament_commission_log" FOR DELETE TO "service_role" USING (true);


--
-- Name: tournament_commission_log tournament_commission_log_insert_service; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "tournament_commission_log_insert_service" ON "public"."tournament_commission_log" FOR INSERT TO "service_role" WITH CHECK (true);


--
-- Name: tournament_commission_log tournament_commission_log_select_admin; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "tournament_commission_log_select_admin" ON "public"."tournament_commission_log" FOR SELECT USING ("public"."is_admin_active"());


--
-- Name: tournament_commission_log tournament_commission_log_select_beneficiary; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "tournament_commission_log_select_beneficiary" ON "public"."tournament_commission_log" FOR SELECT USING (("beneficiary_user_id" = "auth"."uid"()));


--
-- Name: tournament_commission_log tournament_commission_log_update_service; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "tournament_commission_log_update_service" ON "public"."tournament_commission_log" FOR UPDATE TO "service_role" USING (true) WITH CHECK (true);


--
-- Name: tournament_commission_payouts; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."tournament_commission_payouts" ENABLE ROW LEVEL SECURITY;

--
-- Name: tournament_commission_payouts tournament_commission_payouts_delete_service; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "tournament_commission_payouts_delete_service" ON "public"."tournament_commission_payouts" FOR DELETE TO "service_role" USING (true);


--
-- Name: tournament_commission_payouts tournament_commission_payouts_insert_service; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "tournament_commission_payouts_insert_service" ON "public"."tournament_commission_payouts" FOR INSERT TO "service_role" WITH CHECK (true);


--
-- Name: tournament_commission_payouts tournament_commission_payouts_select_admin; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "tournament_commission_payouts_select_admin" ON "public"."tournament_commission_payouts" FOR SELECT USING ("public"."is_admin_active"());


--
-- Name: tournament_commission_payouts tournament_commission_payouts_select_beneficiary; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "tournament_commission_payouts_select_beneficiary" ON "public"."tournament_commission_payouts" FOR SELECT USING (("beneficiary_user_id" = "auth"."uid"()));


--
-- Name: tournament_commission_payouts tournament_commission_payouts_update_service; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "tournament_commission_payouts_update_service" ON "public"."tournament_commission_payouts" FOR UPDATE TO "service_role" USING (true) WITH CHECK (true);


--
-- Name: tournament_commission_snapshots; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."tournament_commission_snapshots" ENABLE ROW LEVEL SECURITY;

--
-- Name: tournament_commission_snapshots tournament_commission_snapshots_delete_service; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "tournament_commission_snapshots_delete_service" ON "public"."tournament_commission_snapshots" FOR DELETE TO "service_role" USING (true);


--
-- Name: tournament_commission_snapshots tournament_commission_snapshots_insert_service; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "tournament_commission_snapshots_insert_service" ON "public"."tournament_commission_snapshots" FOR INSERT TO "service_role" WITH CHECK (true);


--
-- Name: tournament_commission_snapshots tournament_commission_snapshots_select_admin; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "tournament_commission_snapshots_select_admin" ON "public"."tournament_commission_snapshots" FOR SELECT USING ("public"."is_admin_active"());


--
-- Name: tournament_commission_snapshots tournament_commission_snapshots_select_user; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "tournament_commission_snapshots_select_user" ON "public"."tournament_commission_snapshots" FOR SELECT USING (("user_id" = "auth"."uid"()));


--
-- Name: tournament_commission_snapshots tournament_commission_snapshots_update_service; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "tournament_commission_snapshots_update_service" ON "public"."tournament_commission_snapshots" FOR UPDATE TO "service_role" USING (true) WITH CHECK (true);


--
-- Name: tournament_entries; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."tournament_entries" ENABLE ROW LEVEL SECURITY;

--
-- Name: tournament_entries tournament_entries_delete_service; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "tournament_entries_delete_service" ON "public"."tournament_entries" FOR DELETE TO "service_role" USING (true);


--
-- Name: tournament_entries tournament_entries_insert_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "tournament_entries_insert_own" ON "public"."tournament_entries" FOR INSERT WITH CHECK ((("user_id" = "auth"."uid"()) AND (EXISTS ( SELECT 1
   FROM "public"."tournaments" "t"
  WHERE (("t"."id" = "tournament_entries"."tournament_id") AND ("t"."status" = 'registration_open'::"public"."tournament_status"))))));


--
-- Name: tournament_entries tournament_entries_insert_service; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "tournament_entries_insert_service" ON "public"."tournament_entries" FOR INSERT TO "service_role" WITH CHECK (true);


--
-- Name: tournament_entries tournament_entries_select_admin; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "tournament_entries_select_admin" ON "public"."tournament_entries" FOR SELECT USING ("public"."is_admin_active"());


--
-- Name: tournament_entries tournament_entries_select_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "tournament_entries_select_own" ON "public"."tournament_entries" FOR SELECT USING (("user_id" = "auth"."uid"()));


--
-- Name: tournament_entries tournament_entries_select_public_active; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "tournament_entries_select_public_active" ON "public"."tournament_entries" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."tournaments" "t"
  WHERE (("t"."id" = "tournament_entries"."tournament_id") AND ("t"."status" = ANY (ARRAY['registration_open'::"public"."tournament_status", 'running'::"public"."tournament_status", 'settling'::"public"."tournament_status", 'finished'::"public"."tournament_status"]))))));


--
-- Name: tournament_entries tournament_entries_update_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "tournament_entries_update_own" ON "public"."tournament_entries" FOR UPDATE USING ((("user_id" = "auth"."uid"()) AND (EXISTS ( SELECT 1
   FROM "public"."tournaments" "t"
  WHERE (("t"."id" = "tournament_entries"."tournament_id") AND ("t"."status" = 'registration_open'::"public"."tournament_status")))))) WITH CHECK ((("user_id" = "auth"."uid"()) AND (EXISTS ( SELECT 1
   FROM "public"."tournaments" "t"
  WHERE (("t"."id" = "tournament_entries"."tournament_id") AND ("t"."status" = 'registration_open'::"public"."tournament_status"))))));


--
-- Name: tournament_entries tournament_entries_update_service; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "tournament_entries_update_service" ON "public"."tournament_entries" FOR UPDATE TO "service_role" USING (true) WITH CHECK (true);


--
-- Name: tournament_locks; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."tournament_locks" ENABLE ROW LEVEL SECURITY;

--
-- Name: tournament_locks tournament_locks_delete_service; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "tournament_locks_delete_service" ON "public"."tournament_locks" FOR DELETE TO "service_role" USING (true);


--
-- Name: tournament_locks tournament_locks_insert_service; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "tournament_locks_insert_service" ON "public"."tournament_locks" FOR INSERT TO "service_role" WITH CHECK (true);


--
-- Name: tournament_locks tournament_locks_select_admin; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "tournament_locks_select_admin" ON "public"."tournament_locks" FOR SELECT USING ("public"."is_admin_active"());


--
-- Name: tournament_locks tournament_locks_select_owner; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "tournament_locks_select_owner" ON "public"."tournament_locks" FOR SELECT USING (("owner_user_id" = "auth"."uid"()));


--
-- Name: tournament_locks tournament_locks_update_service; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "tournament_locks_update_service" ON "public"."tournament_locks" FOR UPDATE TO "service_role" USING (true) WITH CHECK (true);


--
-- Name: tournament_payouts; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."tournament_payouts" ENABLE ROW LEVEL SECURITY;

--
-- Name: tournament_payouts tournament_payouts_delete_service; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "tournament_payouts_delete_service" ON "public"."tournament_payouts" FOR DELETE TO "service_role" USING (true);


--
-- Name: tournament_payouts tournament_payouts_insert_service; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "tournament_payouts_insert_service" ON "public"."tournament_payouts" FOR INSERT TO "service_role" WITH CHECK (true);


--
-- Name: tournament_payouts tournament_payouts_select_admin; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "tournament_payouts_select_admin" ON "public"."tournament_payouts" FOR SELECT USING ("public"."is_admin_active"());


--
-- Name: tournament_payouts tournament_payouts_select_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "tournament_payouts_select_own" ON "public"."tournament_payouts" FOR SELECT USING (("user_id" = "auth"."uid"()));


--
-- Name: tournament_payouts tournament_payouts_select_public_finished; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "tournament_payouts_select_public_finished" ON "public"."tournament_payouts" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."tournaments" "t"
  WHERE (("t"."id" = "tournament_payouts"."tournament_id") AND ("t"."status" = ANY (ARRAY['settling'::"public"."tournament_status", 'finished'::"public"."tournament_status"]))))));


--
-- Name: tournament_payouts tournament_payouts_update_service; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "tournament_payouts_update_service" ON "public"."tournament_payouts" FOR UPDATE TO "service_role" USING (true) WITH CHECK (true);


--
-- Name: tournament_prize_rules; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."tournament_prize_rules" ENABLE ROW LEVEL SECURITY;

--
-- Name: tournament_prize_rules tournament_prize_rules_delete_admin; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "tournament_prize_rules_delete_admin" ON "public"."tournament_prize_rules" FOR DELETE USING ("public"."is_admin_active"());


--
-- Name: tournament_prize_rules tournament_prize_rules_insert_admin; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "tournament_prize_rules_insert_admin" ON "public"."tournament_prize_rules" FOR INSERT WITH CHECK ("public"."is_admin_active"());


--
-- Name: tournament_prize_rules tournament_prize_rules_select_admin; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "tournament_prize_rules_select_admin" ON "public"."tournament_prize_rules" FOR SELECT USING ("public"."is_admin_active"());


--
-- Name: tournament_prize_rules tournament_prize_rules_select_authenticated; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "tournament_prize_rules_select_authenticated" ON "public"."tournament_prize_rules" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."tournaments" "t"
  WHERE (("t"."id" = "tournament_prize_rules"."tournament_id") AND ("t"."status" = ANY (ARRAY['registration_open'::"public"."tournament_status", 'running'::"public"."tournament_status", 'settling'::"public"."tournament_status", 'finished'::"public"."tournament_status"]))))));


--
-- Name: tournament_prize_rules tournament_prize_rules_update_admin; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "tournament_prize_rules_update_admin" ON "public"."tournament_prize_rules" FOR UPDATE USING ("public"."is_admin_active"()) WITH CHECK ("public"."is_admin_active"());


--
-- Name: tournament_round_assignments; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."tournament_round_assignments" ENABLE ROW LEVEL SECURITY;

--
-- Name: tournament_round_assignments tournament_round_assignments_delete_service; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "tournament_round_assignments_delete_service" ON "public"."tournament_round_assignments" FOR DELETE TO "service_role" USING (true);


--
-- Name: tournament_round_assignments tournament_round_assignments_insert_service; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "tournament_round_assignments_insert_service" ON "public"."tournament_round_assignments" FOR INSERT TO "service_role" WITH CHECK (true);


--
-- Name: tournament_round_assignments tournament_round_assignments_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "tournament_round_assignments_select" ON "public"."tournament_round_assignments" FOR SELECT USING (("public"."is_admin_active"() OR "public"."can_read_user"("user_id") OR "public"."is_tournament_participant"("tournament_id")));


--
-- Name: tournament_round_assignments tournament_round_assignments_update_service; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "tournament_round_assignments_update_service" ON "public"."tournament_round_assignments" FOR UPDATE TO "service_role" USING (true) WITH CHECK (true);


--
-- Name: tournament_round_rooms; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."tournament_round_rooms" ENABLE ROW LEVEL SECURITY;

--
-- Name: tournament_round_rooms tournament_round_rooms_delete_service; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "tournament_round_rooms_delete_service" ON "public"."tournament_round_rooms" FOR DELETE TO "service_role" USING (true);


--
-- Name: tournament_round_rooms tournament_round_rooms_insert_service; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "tournament_round_rooms_insert_service" ON "public"."tournament_round_rooms" FOR INSERT TO "service_role" WITH CHECK (true);


--
-- Name: tournament_round_rooms tournament_round_rooms_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "tournament_round_rooms_select" ON "public"."tournament_round_rooms" FOR SELECT USING (("public"."is_admin_active"() OR "public"."is_tournament_participant"("tournament_id")));


--
-- Name: tournament_round_rooms tournament_round_rooms_update_service; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "tournament_round_rooms_update_service" ON "public"."tournament_round_rooms" FOR UPDATE TO "service_role" USING (true) WITH CHECK (true);


--
-- Name: tournaments; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."tournaments" ENABLE ROW LEVEL SECURITY;

--
-- Name: tournaments tournaments_insert_admin; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "tournaments_insert_admin" ON "public"."tournaments" FOR INSERT WITH CHECK ((("auth"."uid"() IS NOT NULL) AND (EXISTS ( SELECT 1
   FROM "public"."users" "u"
  WHERE (("u"."id" = "auth"."uid"()) AND ("u"."role" = ANY (ARRAY['admin'::"public"."user_role", 'super'::"public"."user_role"])) AND ("u"."status" = 'active'::"public"."user_status"))))));


--
-- Name: tournaments tournaments_select_authenticated; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "tournaments_select_authenticated" ON "public"."tournaments" FOR SELECT USING ((("auth"."role"() = ANY (ARRAY['authenticated'::"text", 'service_role'::"text"])) AND (EXISTS ( SELECT 1
   FROM "public"."users" "u"
  WHERE (("u"."id" = "auth"."uid"()) AND ("u"."status" = 'active'::"public"."user_status"))))));


--
-- Name: transactions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."transactions" ENABLE ROW LEVEL SECURITY;

--
-- Name: transactions transactions_select_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "transactions_select_own" ON "public"."transactions" FOR SELECT USING (("user_id" = "auth"."uid"()));


--
-- Name: POLICY "transactions_select_own" ON "transactions"; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON POLICY "transactions_select_own" ON "public"."transactions" IS 'Player فقط می‌تواند تراکنش‌های خودش را بخواند';


--
-- Name: transactions tx_admin_agent_super_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "tx_admin_agent_super_read" ON "public"."transactions" FOR SELECT USING ((("user_id" = "auth"."uid"()) OR ((EXISTS ( SELECT 1
   FROM "public"."users" "u"
  WHERE (("u"."id" = "auth"."uid"()) AND ("u"."role" = 'admin'::"public"."user_role")))) AND (EXISTS ( SELECT 1
   FROM "public"."users" "target_user"
  WHERE (("target_user"."id" = "transactions"."user_id") AND ("target_user"."role" = ANY (ARRAY['player'::"public"."user_role", 'agent'::"public"."user_role", 'super'::"public"."user_role"])))))) OR (EXISTS ( SELECT 1
   FROM ("public"."users" "u"
     JOIN "public"."users" "player" ON ((("player"."parent_id" = "u"."id") AND ("player"."role" = 'player'::"public"."user_role"))))
  WHERE (("u"."id" = "auth"."uid"()) AND ("u"."role" = 'agent'::"public"."user_role") AND ("player"."id" = "transactions"."user_id")))) OR (EXISTS ( SELECT 1
   FROM "public"."users" "u"
  WHERE (("u"."id" = "auth"."uid"()) AND ("u"."role" = 'super'::"public"."user_role") AND ((EXISTS ( SELECT 1
           FROM "public"."users" "agent"
          WHERE (("agent"."parent_id" = "u"."id") AND ("agent"."role" = 'agent'::"public"."user_role") AND ("agent"."id" = "transactions"."user_id")))) OR (EXISTS ( SELECT 1
           FROM "public"."users" "player"
          WHERE (("player"."parent_id" = "u"."id") AND ("player"."role" = 'player'::"public"."user_role") AND ("player"."id" = "transactions"."user_id")))) OR (EXISTS ( SELECT 1
           FROM ("public"."users" "agent"
             JOIN "public"."users" "player" ON ((("player"."parent_id" = "agent"."id") AND ("player"."role" = 'player'::"public"."user_role"))))
          WHERE (("agent"."parent_id" = "u"."id") AND ("agent"."role" = 'agent'::"public"."user_role") AND ("player"."id" = "transactions"."user_id")))))))) OR (("source_ref" IS NOT NULL) AND (EXISTS ( SELECT 1
   FROM "public"."users" "u"
  WHERE (("u"."id" = "auth"."uid"()) AND ("u"."role" = 'admin'::"public"."user_role")))) AND (EXISTS ( SELECT 1
   FROM "public"."users" "source_user"
  WHERE ((("source_user"."id")::"text" = "transactions"."source_ref") AND ("source_user"."role" = ANY (ARRAY['player'::"public"."user_role", 'agent'::"public"."user_role", 'super'::"public"."user_role"])))))) OR (("source_ref" IS NOT NULL) AND (EXISTS ( SELECT 1
   FROM ("public"."users" "u"
     JOIN "public"."users" "player" ON ((("player"."parent_id" = "u"."id") AND ("player"."role" = 'player'::"public"."user_role"))))
  WHERE (("u"."id" = "auth"."uid"()) AND ("u"."role" = 'agent'::"public"."user_role") AND (("player"."id")::"text" = "transactions"."source_ref"))))) OR (("source_ref" IS NOT NULL) AND (EXISTS ( SELECT 1
   FROM "public"."users" "u"
  WHERE (("u"."id" = "auth"."uid"()) AND ("u"."role" = 'super'::"public"."user_role") AND ((EXISTS ( SELECT 1
           FROM "public"."users" "agent"
          WHERE (("agent"."parent_id" = "u"."id") AND ("agent"."role" = 'agent'::"public"."user_role") AND (("agent"."id")::"text" = "transactions"."source_ref")))) OR (EXISTS ( SELECT 1
           FROM "public"."users" "player"
          WHERE (("player"."parent_id" = "u"."id") AND ("player"."role" = 'player'::"public"."user_role") AND (("player"."id")::"text" = "transactions"."source_ref")))) OR (EXISTS ( SELECT 1
           FROM ("public"."users" "agent"
             JOIN "public"."users" "player" ON ((("player"."parent_id" = "agent"."id") AND ("player"."role" = 'player'::"public"."user_role"))))
          WHERE (("agent"."parent_id" = "u"."id") AND ("agent"."role" = 'agent'::"public"."user_role") AND (("player"."id")::"text" = "transactions"."source_ref"))))))))) OR (EXISTS ( SELECT 1
   FROM ("public"."users" "u"
     JOIN "public"."player_affiliation" "pa" ON (("pa"."user_id" = "transactions"."user_id")))
  WHERE (("u"."id" = "auth"."uid"()) AND ("u"."role" = 'agent'::"public"."user_role") AND ("pa"."agent_id" = "u"."id")))) OR (("source_ref" IS NOT NULL) AND (EXISTS ( SELECT 1
   FROM ("public"."users" "u"
     JOIN "public"."player_affiliation" "pa" ON ((("pa"."user_id")::"text" = "transactions"."source_ref")))
  WHERE (("u"."id" = "auth"."uid"()) AND ("u"."role" = 'agent'::"public"."user_role") AND ("pa"."agent_id" = "u"."id"))))) OR (EXISTS ( SELECT 1
   FROM ("public"."users" "u"
     JOIN "public"."player_affiliation" "pa" ON (((("pa"."user_id" = "transactions"."user_id") AND ("pa"."super_id" = "u"."id")) OR (("pa"."agent_id" = "transactions"."user_id") AND ("pa"."super_id" = "u"."id")))))
  WHERE (("u"."id" = "auth"."uid"()) AND ("u"."role" = 'super'::"public"."user_role")))) OR (("source_ref" IS NOT NULL) AND (EXISTS ( SELECT 1
   FROM ("public"."users" "u"
     JOIN "public"."player_affiliation" "pa" ON ((((("pa"."user_id")::"text" = "transactions"."source_ref") AND ("pa"."super_id" = "u"."id")) OR ((("pa"."agent_id")::"text" = "transactions"."source_ref") AND ("pa"."super_id" = "u"."id")))))
  WHERE (("u"."id" = "auth"."uid"()) AND ("u"."role" = 'super'::"public"."user_role")))))));


--
-- Name: transactions tx_owner_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "tx_owner_read" ON "public"."transactions" FOR SELECT USING (("user_id" = "auth"."uid"()));


--
-- Name: transactions tx_player_source_ref_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "tx_player_source_ref_read" ON "public"."transactions" FOR SELECT USING ((("source_ref" IS NOT NULL) AND ("source_ref" = ("auth"."uid"())::"text") AND ("source_kind" = 'manual_panel'::"text")));


--
-- Name: user_commissions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."user_commissions" ENABLE ROW LEVEL SECURITY;

--
-- Name: user_commissions user_commissions_delete_service; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "user_commissions_delete_service" ON "public"."user_commissions" FOR DELETE TO "service_role" USING (true);


--
-- Name: user_commissions user_commissions_insert_service; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "user_commissions_insert_service" ON "public"."user_commissions" FOR INSERT TO "service_role" WITH CHECK (true);


--
-- Name: user_commissions user_commissions_select_admin; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "user_commissions_select_admin" ON "public"."user_commissions" FOR SELECT USING ("public"."is_admin_active"());


--
-- Name: user_commissions user_commissions_select_agent; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "user_commissions_select_agent" ON "public"."user_commissions" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."player_affiliation" "pa"
  WHERE (("pa"."user_id" = "user_commissions"."user_id") AND ("pa"."agent_id" = "auth"."uid"())))));


--
-- Name: user_commissions user_commissions_select_owner; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "user_commissions_select_owner" ON "public"."user_commissions" FOR SELECT USING (("user_id" = "auth"."uid"()));


--
-- Name: user_commissions user_commissions_select_super; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "user_commissions_select_super" ON "public"."user_commissions" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."player_affiliation" "pa"
  WHERE (("pa"."user_id" = "user_commissions"."user_id") AND ("pa"."super_id" = "auth"."uid"())))));


--
-- Name: user_commissions user_commissions_update_service; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "user_commissions_update_service" ON "public"."user_commissions" FOR UPDATE TO "service_role" USING (true) WITH CHECK (true);


--
-- Name: user_notes; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."user_notes" ENABLE ROW LEVEL SECURITY;

--
-- Name: user_notes user_notes_admin_agent_super_read_write; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "user_notes_admin_agent_super_read_write" ON "public"."user_notes" USING ((("author_id" = "auth"."uid"()) OR (EXISTS ( SELECT 1
   FROM "public"."users"
  WHERE (("users"."id" = "auth"."uid"()) AND ("users"."role" = 'admin'::"public"."user_role")))) OR ((EXISTS ( SELECT 1
   FROM "public"."users" "u"
  WHERE (("u"."id" = "auth"."uid"()) AND ("u"."role" = ANY (ARRAY['agent'::"public"."user_role", 'super'::"public"."user_role"]))))) AND ((EXISTS ( SELECT 1
   FROM "public"."users" "target"
  WHERE (("target"."id" = "user_notes"."user_id") AND ("target"."parent_id" = "auth"."uid"())))) OR (EXISTS ( SELECT 1
   FROM "public"."player_affiliation" "pa"
  WHERE (("pa"."user_id" = "user_notes"."user_id") AND (("pa"."agent_id" = "auth"."uid"()) OR ("pa"."super_id" = "auth"."uid"())))))))));


--
-- Name: user_profiles; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."user_profiles" ENABLE ROW LEVEL SECURITY;

--
-- Name: user_profiles_old_backup; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."user_profiles_old_backup" ENABLE ROW LEVEL SECURITY;

--
-- Name: user_profiles_old_backup user_profiles_old_backup_delete_admin; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "user_profiles_old_backup_delete_admin" ON "public"."user_profiles_old_backup" FOR DELETE USING ("public"."is_admin_active"());


--
-- Name: user_profiles_old_backup user_profiles_old_backup_insert_admin; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "user_profiles_old_backup_insert_admin" ON "public"."user_profiles_old_backup" FOR INSERT WITH CHECK ("public"."is_admin_active"());


--
-- Name: user_profiles_old_backup user_profiles_old_backup_select_admin; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "user_profiles_old_backup_select_admin" ON "public"."user_profiles_old_backup" FOR SELECT USING ("public"."is_admin_active"());


--
-- Name: user_profiles_old_backup user_profiles_old_backup_update_admin; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "user_profiles_old_backup_update_admin" ON "public"."user_profiles_old_backup" FOR UPDATE USING ("public"."is_admin_active"()) WITH CHECK ("public"."is_admin_active"());


--
-- Name: users; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."users" ENABLE ROW LEVEL SECURITY;

--
-- Name: user_profiles users_can_insert_own_profile; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "users_can_insert_own_profile" ON "public"."user_profiles" FOR INSERT WITH CHECK (("user_id" = "auth"."uid"()));


--
-- Name: user_profiles users_can_read_own_profile; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "users_can_read_own_profile" ON "public"."user_profiles" FOR SELECT USING (("user_id" = "auth"."uid"()));


--
-- Name: user_profiles users_can_update_own_profile; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "users_can_update_own_profile" ON "public"."user_profiles" FOR UPDATE USING (("user_id" = "auth"."uid"())) WITH CHECK (("user_id" = "auth"."uid"()));


--
-- Name: users users_select_can_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "users_select_can_read" ON "public"."users" FOR SELECT USING ("public"."can_read_user"("id"));


--
-- Name: users users_select_referral_public; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "users_select_referral_public" ON "public"."users" FOR SELECT TO "authenticated", "anon" USING ((("referral_code" IS NOT NULL) AND ("status" = 'active'::"public"."user_status") AND ("role" = ANY (ARRAY['agent'::"public"."user_role", 'super'::"public"."user_role", 'admin'::"public"."user_role"]))));


--
-- Name: users users_select_tournament_participants; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "users_select_tournament_participants" ON "public"."users" FOR SELECT USING ("public"."can_read_user_in_tournament"("id"));


--
-- Name: wallet_transfer_idempotency; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."wallet_transfer_idempotency" ENABLE ROW LEVEL SECURITY;

--
-- Name: wallets; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."wallets" ENABLE ROW LEVEL SECURITY;

--
-- Name: wallets wallets_admin_agent_super_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "wallets_admin_agent_super_read" ON "public"."wallets" FOR SELECT USING ((("user_id" = "auth"."uid"()) OR (EXISTS ( SELECT 1
   FROM "public"."users" "u"
  WHERE (("u"."id" = "auth"."uid"()) AND ("u"."role" = 'admin'::"public"."user_role")))) OR (EXISTS ( SELECT 1
   FROM ("public"."users" "u"
     JOIN "public"."users" "player" ON ((("player"."parent_id" = "u"."id") AND ("player"."role" = 'player'::"public"."user_role"))))
  WHERE (("u"."id" = "auth"."uid"()) AND ("u"."role" = 'agent'::"public"."user_role") AND ("player"."id" = "wallets"."user_id")))) OR (EXISTS ( SELECT 1
   FROM "public"."users" "u"
  WHERE (("u"."id" = "auth"."uid"()) AND ("u"."role" = 'super'::"public"."user_role") AND ((EXISTS ( SELECT 1
           FROM "public"."users" "agent"
          WHERE (("agent"."parent_id" = "u"."id") AND ("agent"."role" = 'agent'::"public"."user_role") AND ("agent"."id" = "wallets"."user_id")))) OR (EXISTS ( SELECT 1
           FROM "public"."users" "player"
          WHERE (("player"."parent_id" = "u"."id") AND ("player"."role" = 'player'::"public"."user_role") AND ("player"."id" = "wallets"."user_id")))) OR (EXISTS ( SELECT 1
           FROM ("public"."users" "agent"
             JOIN "public"."users" "player" ON ((("player"."parent_id" = "agent"."id") AND ("player"."role" = 'player'::"public"."user_role"))))
          WHERE (("agent"."parent_id" = "u"."id") AND ("agent"."role" = 'agent'::"public"."user_role") AND ("player"."id" = "wallets"."user_id")))))))) OR (EXISTS ( SELECT 1
   FROM ("public"."users" "u"
     JOIN "public"."player_affiliation" "pa" ON (("pa"."user_id" = "wallets"."user_id")))
  WHERE (("u"."id" = "auth"."uid"()) AND ("u"."role" = 'agent'::"public"."user_role") AND ("pa"."agent_id" = "u"."id")))) OR (EXISTS ( SELECT 1
   FROM ("public"."users" "u"
     JOIN "public"."player_affiliation" "pa" ON (((("pa"."user_id" = "wallets"."user_id") AND ("pa"."super_id" = "u"."id")) OR (("pa"."agent_id" = "wallets"."user_id") AND ("pa"."super_id" = "u"."id")))))
  WHERE (("u"."id" = "auth"."uid"()) AND ("u"."role" = 'super'::"public"."user_role"))))));


--
-- Name: wallets wallets_owner_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "wallets_owner_read" ON "public"."wallets" FOR SELECT USING (("user_id" = "auth"."uid"()));


--
-- Name: wallets wallets_select_hierarchy; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "wallets_select_hierarchy" ON "public"."wallets" FOR SELECT TO "authenticated" USING ((("user_id" = "auth"."uid"()) OR (EXISTS ( SELECT 1
   FROM "public"."users" "actor"
  WHERE (("actor"."id" = "auth"."uid"()) AND (("actor"."role" = 'admin'::"public"."user_role") OR (("actor"."role" = 'super'::"public"."user_role") AND ((EXISTS ( SELECT 1
           FROM "public"."users" "target"
          WHERE (("target"."id" = "wallets"."user_id") AND ((("target"."role" = 'agent'::"public"."user_role") AND ("target"."parent_id" = "actor"."id")) OR (("target"."role" = 'player'::"public"."user_role") AND ("target"."parent_id" = "actor"."id")))))) OR (EXISTS ( SELECT 1
           FROM "public"."player_affiliation" "pa"
          WHERE (("pa"."user_id" = "wallets"."user_id") AND ("pa"."super_id" = "actor"."id")))))) OR (("actor"."role" = 'agent'::"public"."user_role") AND ((EXISTS ( SELECT 1
           FROM "public"."users" "target"
          WHERE (("target"."id" = "wallets"."user_id") AND ((("target"."role" = 'agent'::"public"."user_role") AND ("target"."parent_id" = "actor"."id")) OR (("target"."role" = 'player'::"public"."user_role") AND ("target"."parent_id" = "actor"."id")))))) OR (EXISTS ( SELECT 1
           FROM "public"."player_affiliation" "pa"
          WHERE (("pa"."user_id" = "wallets"."user_id") AND ("pa"."agent_id" = "actor"."id"))))))))))));


--
-- Name: POLICY "wallets_select_hierarchy" ON "wallets"; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON POLICY "wallets_select_hierarchy" ON "public"."wallets" IS 'Allow admin/super/agent to read wallets for permitted downline users.';


--
-- Name: wallets wallets_select_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "wallets_select_own" ON "public"."wallets" FOR SELECT USING (("user_id" = "auth"."uid"()));


--
-- Name: POLICY "wallets_select_own" ON "wallets"; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON POLICY "wallets_select_own" ON "public"."wallets" IS 'Player فقط می‌تواند wallet خودش را بخواند';


--
-- Name: template_reservations; Type: ROW SECURITY; Schema: tournament; Owner: -
--

ALTER TABLE "tournament"."template_reservations" ENABLE ROW LEVEL SECURITY;

--
-- Name: tournament_tick_log; Type: ROW SECURITY; Schema: tournament; Owner: -
--

ALTER TABLE "tournament"."tournament_tick_log" ENABLE ROW LEVEL SECURITY;

--
-- Name: SCHEMA "deposit"; Type: ACL; Schema: -; Owner: -
--

GRANT USAGE ON SCHEMA "deposit" TO "service_role";


--
-- Name: SCHEMA "game_core"; Type: ACL; Schema: -; Owner: -
--

GRANT USAGE ON SCHEMA "game_core" TO "service_role";


--
-- Name: SCHEMA "game_finance"; Type: ACL; Schema: -; Owner: -
--

GRANT USAGE ON SCHEMA "game_finance" TO "service_role";


--
-- Name: SCHEMA "platform"; Type: ACL; Schema: -; Owner: -
--

GRANT USAGE ON SCHEMA "platform" TO "service_role";


--
-- Name: SCHEMA "public"; Type: ACL; Schema: -; Owner: -
--

GRANT USAGE ON SCHEMA "public" TO "postgres";
GRANT USAGE ON SCHEMA "public" TO "anon";
GRANT USAGE ON SCHEMA "public" TO "authenticated";
GRANT USAGE ON SCHEMA "public" TO "service_role";


--
-- Name: SCHEMA "tournament"; Type: ACL; Schema: -; Owner: -
--

GRANT USAGE ON SCHEMA "tournament" TO "authenticated";
GRANT USAGE ON SCHEMA "tournament" TO "anon";


--
-- Name: TABLE "intents"; Type: ACL; Schema: deposit; Owner: -
--

GRANT ALL ON TABLE "deposit"."intents" TO "service_role";


--
-- Name: FUNCTION "fn_activate_intent"("p_intent_id" "uuid", "p_destination_ref" "text"); Type: ACL; Schema: deposit; Owner: -
--

REVOKE ALL ON FUNCTION "deposit"."fn_activate_intent"("p_intent_id" "uuid", "p_destination_ref" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "deposit"."fn_activate_intent"("p_intent_id" "uuid", "p_destination_ref" "text") TO "service_role";


--
-- Name: FUNCTION "fn_append_event"("p_intent_id" "uuid", "p_event_type" "text", "p_actor" "text", "p_payload" "jsonb"); Type: ACL; Schema: deposit; Owner: -
--

REVOKE ALL ON FUNCTION "deposit"."fn_append_event"("p_intent_id" "uuid", "p_event_type" "text", "p_actor" "text", "p_payload" "jsonb") FROM PUBLIC;
GRANT ALL ON FUNCTION "deposit"."fn_append_event"("p_intent_id" "uuid", "p_event_type" "text", "p_actor" "text", "p_payload" "jsonb") TO "service_role";


--
-- Name: FUNCTION "fn_assert_transition"("p_from" "deposit"."intent_status", "p_to" "deposit"."intent_status"); Type: ACL; Schema: deposit; Owner: -
--

REVOKE ALL ON FUNCTION "deposit"."fn_assert_transition"("p_from" "deposit"."intent_status", "p_to" "deposit"."intent_status") FROM PUBLIC;
GRANT ALL ON FUNCTION "deposit"."fn_assert_transition"("p_from" "deposit"."intent_status", "p_to" "deposit"."intent_status") TO "service_role";


--
-- Name: FUNCTION "fn_begin_verification"("p_intent_id" "uuid"); Type: ACL; Schema: deposit; Owner: -
--

REVOKE ALL ON FUNCTION "deposit"."fn_begin_verification"("p_intent_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "deposit"."fn_begin_verification"("p_intent_id" "uuid") TO "service_role";


--
-- Name: FUNCTION "fn_create_intent"("p_user_id" "uuid", "p_channel" "text", "p_provider" "text", "p_amount_expected" numeric, "p_currency" "text", "p_expires_at" timestamp with time zone, "p_destination_ref" "text", "p_metadata" "jsonb", "p_created_by" "text", "p_created_by_actor_id" "uuid", "p_provider_intent_ref" "text"); Type: ACL; Schema: deposit; Owner: -
--

REVOKE ALL ON FUNCTION "deposit"."fn_create_intent"("p_user_id" "uuid", "p_channel" "text", "p_provider" "text", "p_amount_expected" numeric, "p_currency" "text", "p_expires_at" timestamp with time zone, "p_destination_ref" "text", "p_metadata" "jsonb", "p_created_by" "text", "p_created_by_actor_id" "uuid", "p_provider_intent_ref" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "deposit"."fn_create_intent"("p_user_id" "uuid", "p_channel" "text", "p_provider" "text", "p_amount_expected" numeric, "p_currency" "text", "p_expires_at" timestamp with time zone, "p_destination_ref" "text", "p_metadata" "jsonb", "p_created_by" "text", "p_created_by_actor_id" "uuid", "p_provider_intent_ref" "text") TO "service_role";


--
-- Name: FUNCTION "fn_expire_intent"("p_intent_id" "uuid"); Type: ACL; Schema: deposit; Owner: -
--

REVOKE ALL ON FUNCTION "deposit"."fn_expire_intent"("p_intent_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "deposit"."fn_expire_intent"("p_intent_id" "uuid") TO "service_role";


--
-- Name: FUNCTION "fn_fail_verification"("p_intent_id" "uuid", "p_attempt_id" "uuid", "p_provider" "text", "p_failure_code" "text", "p_evidence" "jsonb", "p_terminal" boolean); Type: ACL; Schema: deposit; Owner: -
--

REVOKE ALL ON FUNCTION "deposit"."fn_fail_verification"("p_intent_id" "uuid", "p_attempt_id" "uuid", "p_provider" "text", "p_failure_code" "text", "p_evidence" "jsonb", "p_terminal" boolean) FROM PUBLIC;
GRANT ALL ON FUNCTION "deposit"."fn_fail_verification"("p_intent_id" "uuid", "p_attempt_id" "uuid", "p_provider" "text", "p_failure_code" "text", "p_evidence" "jsonb", "p_terminal" boolean) TO "service_role";


--
-- Name: FUNCTION "fn_get_intent_status"("p_intent_id" "uuid"); Type: ACL; Schema: deposit; Owner: -
--

REVOKE ALL ON FUNCTION "deposit"."fn_get_intent_status"("p_intent_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "deposit"."fn_get_intent_status"("p_intent_id" "uuid") TO "service_role";


--
-- Name: FUNCTION "fn_mark_create_failed"("p_intent_id" "uuid", "p_error" "text"); Type: ACL; Schema: deposit; Owner: -
--

REVOKE ALL ON FUNCTION "deposit"."fn_mark_create_failed"("p_intent_id" "uuid", "p_error" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "deposit"."fn_mark_create_failed"("p_intent_id" "uuid", "p_error" "text") TO "service_role";


--
-- Name: FUNCTION "fn_pass_verification"("p_intent_id" "uuid", "p_attempt_id" "uuid", "p_provider" "text", "p_external_payment_id" "text", "p_amount_observed" numeric, "p_currency_observed" "text", "p_evidence" "jsonb", "p_confirmations" integer, "p_destination_observed" "text"); Type: ACL; Schema: deposit; Owner: -
--

REVOKE ALL ON FUNCTION "deposit"."fn_pass_verification"("p_intent_id" "uuid", "p_attempt_id" "uuid", "p_provider" "text", "p_external_payment_id" "text", "p_amount_observed" numeric, "p_currency_observed" "text", "p_evidence" "jsonb", "p_confirmations" integer, "p_destination_observed" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "deposit"."fn_pass_verification"("p_intent_id" "uuid", "p_attempt_id" "uuid", "p_provider" "text", "p_external_payment_id" "text", "p_amount_observed" numeric, "p_currency_observed" "text", "p_evidence" "jsonb", "p_confirmations" integer, "p_destination_observed" "text") TO "service_role";


--
-- Name: FUNCTION "fn_post_credit"("p_intent_id" "uuid"); Type: ACL; Schema: deposit; Owner: -
--

REVOKE ALL ON FUNCTION "deposit"."fn_post_credit"("p_intent_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "deposit"."fn_post_credit"("p_intent_id" "uuid") TO "service_role";


--
-- Name: FUNCTION "fn_recon_deposit"(); Type: ACL; Schema: deposit; Owner: -
--

REVOKE ALL ON FUNCTION "deposit"."fn_recon_deposit"() FROM PUBLIC;
GRANT ALL ON FUNCTION "deposit"."fn_recon_deposit"() TO "service_role";


--
-- Name: FUNCTION "fn_record_attempt"("p_intent_id" "uuid", "p_provider" "text", "p_external_event_id" "text", "p_payload_hash" "text", "p_parse_status" "deposit"."attempt_parse_status", "p_payload_ref" "text", "p_headers_meta" "jsonb", "p_observed_at" timestamp with time zone); Type: ACL; Schema: deposit; Owner: -
--

REVOKE ALL ON FUNCTION "deposit"."fn_record_attempt"("p_intent_id" "uuid", "p_provider" "text", "p_external_event_id" "text", "p_payload_hash" "text", "p_parse_status" "deposit"."attempt_parse_status", "p_payload_ref" "text", "p_headers_meta" "jsonb", "p_observed_at" timestamp with time zone) FROM PUBLIC;
GRANT ALL ON FUNCTION "deposit"."fn_record_attempt"("p_intent_id" "uuid", "p_provider" "text", "p_external_event_id" "text", "p_payload_hash" "text", "p_parse_status" "deposit"."attempt_parse_status", "p_payload_ref" "text", "p_headers_meta" "jsonb", "p_observed_at" timestamp with time zone) TO "service_role";


--
-- Name: FUNCTION "trg_credits_guard"(); Type: ACL; Schema: deposit; Owner: -
--

REVOKE ALL ON FUNCTION "deposit"."trg_credits_guard"() FROM PUBLIC;
GRANT ALL ON FUNCTION "deposit"."trg_credits_guard"() TO "service_role";


--
-- Name: FUNCTION "trg_forbid_mutation"(); Type: ACL; Schema: deposit; Owner: -
--

REVOKE ALL ON FUNCTION "deposit"."trg_forbid_mutation"() FROM PUBLIC;
GRANT ALL ON FUNCTION "deposit"."trg_forbid_mutation"() TO "service_role";


--
-- Name: FUNCTION "trg_intents_immutable_core"(); Type: ACL; Schema: deposit; Owner: -
--

REVOKE ALL ON FUNCTION "deposit"."trg_intents_immutable_core"() FROM PUBLIC;
GRANT ALL ON FUNCTION "deposit"."trg_intents_immutable_core"() TO "service_role";


--
-- Name: FUNCTION "api_get_room_state"("p_room_id" "uuid"); Type: ACL; Schema: game_core; Owner: -
--

GRANT ALL ON FUNCTION "game_core"."api_get_room_state"("p_room_id" "uuid") TO "service_role";


--
-- Name: FUNCTION "fn_cancel_waiting_room_single"("p_room" "uuid", "p_actor" "uuid", "p_reason" "text", "p_require_single_player" boolean, "p_now" timestamp with time zone); Type: ACL; Schema: game_core; Owner: -
--

GRANT ALL ON FUNCTION "game_core"."fn_cancel_waiting_room_single"("p_room" "uuid", "p_actor" "uuid", "p_reason" "text", "p_require_single_player" boolean, "p_now" timestamp with time zone) TO "service_role";


--
-- Name: FUNCTION "fn_cancel_waiting_rooms"("p_room" "uuid", "p_by_admin" boolean); Type: ACL; Schema: game_core; Owner: -
--

GRANT ALL ON FUNCTION "game_core"."fn_cancel_waiting_rooms"("p_room" "uuid", "p_by_admin" boolean) TO "anon";
GRANT ALL ON FUNCTION "game_core"."fn_cancel_waiting_rooms"("p_room" "uuid", "p_by_admin" boolean) TO "authenticated";
GRANT ALL ON FUNCTION "game_core"."fn_cancel_waiting_rooms"("p_room" "uuid", "p_by_admin" boolean) TO "service_role";


--
-- Name: FUNCTION "fn_cancel_waiting_rooms"("p_room" "uuid", "p_by_admin" boolean, "p_requester" "uuid"); Type: ACL; Schema: game_core; Owner: -
--

GRANT ALL ON FUNCTION "game_core"."fn_cancel_waiting_rooms"("p_room" "uuid", "p_by_admin" boolean, "p_requester" "uuid") TO "service_role";


--
-- Name: FUNCTION "fn_confirm_win"("p_room_id" "uuid", "p_ticket_id" "uuid", "p_type" "text"); Type: ACL; Schema: game_core; Owner: -
--

REVOKE ALL ON FUNCTION "game_core"."fn_confirm_win"("p_room_id" "uuid", "p_ticket_id" "uuid", "p_type" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "game_core"."fn_confirm_win"("p_room_id" "uuid", "p_ticket_id" "uuid", "p_type" "text") TO "service_role";


--
-- Name: FUNCTION "fn_evaluate_room_after_draw"("p_room" "uuid", "p_draw" integer); Type: ACL; Schema: game_core; Owner: -
--

REVOKE ALL ON FUNCTION "game_core"."fn_evaluate_room_after_draw"("p_room" "uuid", "p_draw" integer) FROM PUBLIC;
GRANT ALL ON FUNCTION "game_core"."fn_evaluate_room_after_draw"("p_room" "uuid", "p_draw" integer) TO "service_role";


--
-- Name: FUNCTION "fn_generate_card_pool"("p_card_count" integer, "p_created_by" "uuid", "p_prng_version" "text"); Type: ACL; Schema: game_core; Owner: -
--

GRANT ALL ON FUNCTION "game_core"."fn_generate_card_pool"("p_card_count" integer, "p_created_by" "uuid", "p_prng_version" "text") TO "service_role";


--
-- Name: FUNCTION "fn_generate_card_pool_step"("p_batch_size" integer); Type: ACL; Schema: game_core; Owner: -
--

GRANT ALL ON FUNCTION "game_core"."fn_generate_card_pool_step"("p_batch_size" integer) TO "service_role";


--
-- Name: FUNCTION "fn_generate_room_seed"(); Type: ACL; Schema: game_core; Owner: -
--

GRANT ALL ON FUNCTION "game_core"."fn_generate_room_seed"() TO "service_role";


--
-- Name: FUNCTION "fn_janitor_repair_unsettled_finished"("p_limit" integer); Type: ACL; Schema: game_core; Owner: -
--

REVOKE ALL ON FUNCTION "game_core"."fn_janitor_repair_unsettled_finished"("p_limit" integer) FROM PUBLIC;
GRANT ALL ON FUNCTION "game_core"."fn_janitor_repair_unsettled_finished"("p_limit" integer) TO "service_role";


--
-- Name: FUNCTION "fn_janitor_sweep"(); Type: ACL; Schema: game_core; Owner: -
--

GRANT ALL ON FUNCTION "game_core"."fn_janitor_sweep"() TO "service_role";


--
-- Name: FUNCTION "fn_join_or_create_room_base"("p_template_id" "uuid", "p_card_count" integer, "p_password" "text"); Type: ACL; Schema: game_core; Owner: -
--

GRANT ALL ON FUNCTION "game_core"."fn_join_or_create_room_base"("p_template_id" "uuid", "p_card_count" integer, "p_password" "text") TO "service_role";


--
-- Name: FUNCTION "fn_join_or_create_room_core"("p_template_id" "uuid", "p_card_count" integer, "p_password" "text"); Type: ACL; Schema: game_core; Owner: -
--

GRANT ALL ON FUNCTION "game_core"."fn_join_or_create_room_core"("p_template_id" "uuid", "p_card_count" integer, "p_password" "text") TO "service_role";


--
-- Name: FUNCTION "fn_manage_room_live_actions"(); Type: ACL; Schema: game_core; Owner: -
--

REVOKE ALL ON FUNCTION "game_core"."fn_manage_room_live_actions"() FROM PUBLIC;
GRANT ALL ON FUNCTION "game_core"."fn_manage_room_live_actions"() TO "service_role";


--
-- Name: FUNCTION "fn_manage_waiting_rooms"("p_limit" integer, "p_capture" boolean); Type: ACL; Schema: game_core; Owner: -
--

REVOKE ALL ON FUNCTION "game_core"."fn_manage_waiting_rooms"("p_limit" integer, "p_capture" boolean) FROM PUBLIC;
GRANT ALL ON FUNCTION "game_core"."fn_manage_waiting_rooms"("p_limit" integer, "p_capture" boolean) TO "service_role";


--
-- Name: FUNCTION "fn_payout_room"("p_room" "uuid"); Type: ACL; Schema: game_core; Owner: -
--

REVOKE ALL ON FUNCTION "game_core"."fn_payout_room"("p_room" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "game_core"."fn_payout_room"("p_room" "uuid") TO "service_role";


--
-- Name: FUNCTION "fn_requeue_failed_draw_jobs"(); Type: ACL; Schema: game_core; Owner: -
--

GRANT ALL ON FUNCTION "game_core"."fn_requeue_failed_draw_jobs"() TO "service_role";


--
-- Name: FUNCTION "fn_stamp_orphan_draws_on_terminal_rooms"(); Type: ACL; Schema: game_core; Owner: -
--

GRANT ALL ON FUNCTION "game_core"."fn_stamp_orphan_draws_on_terminal_rooms"() TO "service_role";


--
-- Name: FUNCTION "fn_sync_player_affiliation_for_user"("p_user_id" "uuid"); Type: ACL; Schema: game_core; Owner: -
--

GRANT ALL ON FUNCTION "game_core"."fn_sync_player_affiliation_for_user"("p_user_id" "uuid") TO "service_role";


--
-- Name: FUNCTION "fn_system_join_or_create_room"("p_user_id" "uuid", "p_template_id" "uuid", "p_card_count" integer, "p_password" "text"); Type: ACL; Schema: game_core; Owner: -
--

GRANT ALL ON FUNCTION "game_core"."fn_system_join_or_create_room"("p_user_id" "uuid", "p_template_id" "uuid", "p_card_count" integer, "p_password" "text") TO "service_role";


--
-- Name: FUNCTION "fn_trg_sync_player_affiliation_from_users"(); Type: ACL; Schema: game_core; Owner: -
--

GRANT ALL ON FUNCTION "game_core"."fn_trg_sync_player_affiliation_from_users"() TO "service_role";


--
-- Name: FUNCTION "fn_validate_affiliation_roles"(); Type: ACL; Schema: game_core; Owner: -
--

GRANT ALL ON FUNCTION "game_core"."fn_validate_affiliation_roles"() TO "service_role";


--
-- Name: FUNCTION "rpc_apply_marks_for_draw"("p_room_id" "uuid", "p_draw_number" integer); Type: ACL; Schema: game_core; Owner: -
--

REVOKE ALL ON FUNCTION "game_core"."rpc_apply_marks_for_draw"("p_room_id" "uuid", "p_draw_number" integer) FROM PUBLIC;
GRANT ALL ON FUNCTION "game_core"."rpc_apply_marks_for_draw"("p_room_id" "uuid", "p_draw_number" integer) TO "service_role";


--
-- Name: FUNCTION "rpc_get_active_rooms"("p_only_status" "public"."room_status"[], "p_price_min" numeric, "p_price_max" numeric); Type: ACL; Schema: game_core; Owner: -
--

GRANT ALL ON FUNCTION "game_core"."rpc_get_active_rooms"("p_only_status" "public"."room_status"[], "p_price_min" numeric, "p_price_max" numeric) TO "anon";
GRANT ALL ON FUNCTION "game_core"."rpc_get_active_rooms"("p_only_status" "public"."room_status"[], "p_price_min" numeric, "p_price_max" numeric) TO "authenticated";
GRANT ALL ON FUNCTION "game_core"."rpc_get_active_rooms"("p_only_status" "public"."room_status"[], "p_price_min" numeric, "p_price_max" numeric) TO "service_role";


--
-- Name: FUNCTION "rpc_get_lobby_price_summary"("p_only_status" "public"."room_status"[]); Type: ACL; Schema: game_core; Owner: -
--

GRANT ALL ON FUNCTION "game_core"."rpc_get_lobby_price_summary"("p_only_status" "public"."room_status"[]) TO "service_role";


--
-- Name: FUNCTION "rpc_get_room_seed_hash"("p_room_id" "uuid"); Type: ACL; Schema: game_core; Owner: -
--

GRANT ALL ON FUNCTION "game_core"."rpc_get_room_seed_hash"("p_room_id" "uuid") TO "service_role";


--
-- Name: FUNCTION "rpc_pick_draw_jobs"("p_limit" integer); Type: ACL; Schema: game_core; Owner: -
--

REVOKE ALL ON FUNCTION "game_core"."rpc_pick_draw_jobs"("p_limit" integer) FROM PUBLIC;
GRANT ALL ON FUNCTION "game_core"."rpc_pick_draw_jobs"("p_limit" integer) TO "service_role";


--
-- Name: FUNCTION "rpc_pick_draw_jobs"("p_limit" integer, "p_worker_id" integer, "p_total_workers" integer); Type: ACL; Schema: game_core; Owner: -
--

REVOKE ALL ON FUNCTION "game_core"."rpc_pick_draw_jobs"("p_limit" integer, "p_worker_id" integer, "p_total_workers" integer) FROM PUBLIC;
GRANT ALL ON FUNCTION "game_core"."rpc_pick_draw_jobs"("p_limit" integer, "p_worker_id" integer, "p_total_workers" integer) TO "service_role";


--
-- Name: FUNCTION "rpc_reveal_room_seed"("p_room_id" "uuid", OUT "room_id" "uuid", OUT "room_seed" "bytea", OUT "room_seed_hash" character, OUT "status" "public"."room_status"); Type: ACL; Schema: game_core; Owner: -
--

GRANT ALL ON FUNCTION "game_core"."rpc_reveal_room_seed"("p_room_id" "uuid", OUT "room_id" "uuid", OUT "room_seed" "bytea", OUT "room_seed_hash" character, OUT "status" "public"."room_status") TO "service_role";


--
-- Name: FUNCTION "set_rooms_updated_at"(); Type: ACL; Schema: game_core; Owner: -
--

GRANT ALL ON FUNCTION "game_core"."set_rooms_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "game_core"."set_rooms_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "game_core"."set_rooms_updated_at"() TO "service_role";


--
-- Name: FUNCTION "signup_player_with_code"("p_invitation_code" "text", "p_username" "text", "p_nickname" "text", "p_country" "text", "p_language" "text"); Type: ACL; Schema: game_core; Owner: -
--

GRANT ALL ON FUNCTION "game_core"."signup_player_with_code"("p_invitation_code" "text", "p_username" "text", "p_nickname" "text", "p_country" "text", "p_language" "text") TO "service_role";


--
-- Name: FUNCTION "trg_after_draw_enqueue"(); Type: ACL; Schema: game_core; Owner: -
--

GRANT ALL ON FUNCTION "game_core"."trg_after_draw_enqueue"() TO "anon";
GRANT ALL ON FUNCTION "game_core"."trg_after_draw_enqueue"() TO "authenticated";
GRANT ALL ON FUNCTION "game_core"."trg_after_draw_enqueue"() TO "service_role";


--
-- Name: FUNCTION "validate_invitation_code"("p_code" "text"); Type: ACL; Schema: game_core; Owner: -
--

GRANT ALL ON FUNCTION "game_core"."validate_invitation_code"("p_code" "text") TO "service_role";


--
-- Name: FUNCTION "fn_consume_room_tickets"("p_room" "uuid"); Type: ACL; Schema: game_finance; Owner: -
--

GRANT ALL ON FUNCTION "game_finance"."fn_consume_room_tickets"("p_room" "uuid") TO "service_role";


--
-- Name: FUNCTION "fn_distribute_ticket_commission"("p_ticket" "uuid", "p_admin_user" "uuid"); Type: ACL; Schema: game_finance; Owner: -
--

REVOKE ALL ON FUNCTION "game_finance"."fn_distribute_ticket_commission"("p_ticket" "uuid", "p_admin_user" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "game_finance"."fn_distribute_ticket_commission"("p_ticket" "uuid", "p_admin_user" "uuid") TO "service_role";


--
-- Name: FUNCTION "fn_finish_room_and_settle"("p_room" "uuid", "p_admin_user" "uuid"); Type: ACL; Schema: game_finance; Owner: -
--

REVOKE ALL ON FUNCTION "game_finance"."fn_finish_room_and_settle"("p_room" "uuid", "p_admin_user" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "game_finance"."fn_finish_room_and_settle"("p_room" "uuid", "p_admin_user" "uuid") TO "service_role";


--
-- Name: FUNCTION "fn_ledger_signed_amount"("p_type" "public"."transaction_type", "p_amount" numeric); Type: ACL; Schema: game_finance; Owner: -
--

REVOKE ALL ON FUNCTION "game_finance"."fn_ledger_signed_amount"("p_type" "public"."transaction_type", "p_amount" numeric) FROM PUBLIC;


--
-- Name: FUNCTION "fn_lock_commission_snapshot"(); Type: ACL; Schema: game_finance; Owner: -
--

GRANT ALL ON FUNCTION "game_finance"."fn_lock_commission_snapshot"() TO "service_role";


--
-- Name: FUNCTION "fn_payout_room_prize"("p_room" "uuid"); Type: ACL; Schema: game_finance; Owner: -
--

REVOKE ALL ON FUNCTION "game_finance"."fn_payout_room_prize"("p_room" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "game_finance"."fn_payout_room_prize"("p_room" "uuid") TO "service_role";


--
-- Name: FUNCTION "fn_payout_winners"("p_room" "uuid"); Type: ACL; Schema: game_finance; Owner: -
--

REVOKE ALL ON FUNCTION "game_finance"."fn_payout_winners"("p_room" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "game_finance"."fn_payout_winners"("p_room" "uuid") TO "service_role";


--
-- Name: FUNCTION "fn_recon_money_conservation"(); Type: ACL; Schema: game_finance; Owner: -
--

REVOKE ALL ON FUNCTION "game_finance"."fn_recon_money_conservation"() FROM PUBLIC;
GRANT ALL ON FUNCTION "game_finance"."fn_recon_money_conservation"() TO "service_role";


--
-- Name: FUNCTION "fn_recon_run_and_store"(); Type: ACL; Schema: game_finance; Owner: -
--

REVOKE ALL ON FUNCTION "game_finance"."fn_recon_run_and_store"() FROM PUBLIC;
GRANT ALL ON FUNCTION "game_finance"."fn_recon_run_and_store"() TO "service_role";


--
-- Name: FUNCTION "fn_recon_wallet_ledger"("p_limit" integer); Type: ACL; Schema: game_finance; Owner: -
--

REVOKE ALL ON FUNCTION "game_finance"."fn_recon_wallet_ledger"("p_limit" integer) FROM PUBLIC;
GRANT ALL ON FUNCTION "game_finance"."fn_recon_wallet_ledger"("p_limit" integer) TO "service_role";


--
-- Name: FUNCTION "fn_record_ticket_commission"("p_ticket" "uuid"); Type: ACL; Schema: game_finance; Owner: -
--

REVOKE ALL ON FUNCTION "game_finance"."fn_record_ticket_commission"("p_ticket" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "game_finance"."fn_record_ticket_commission"("p_ticket" "uuid") TO "service_role";


--
-- Name: FUNCTION "fn_wallet_add"("p_user" "uuid", "p_amount" numeric, "p_currency" "text", "p_desc" "text", "p_type" "public"."transaction_type", "p_room" "uuid"); Type: ACL; Schema: game_finance; Owner: -
--

GRANT ALL ON FUNCTION "game_finance"."fn_wallet_add"("p_user" "uuid", "p_amount" numeric, "p_currency" "text", "p_desc" "text", "p_type" "public"."transaction_type", "p_room" "uuid") TO "anon";
GRANT ALL ON FUNCTION "game_finance"."fn_wallet_add"("p_user" "uuid", "p_amount" numeric, "p_currency" "text", "p_desc" "text", "p_type" "public"."transaction_type", "p_room" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "game_finance"."fn_wallet_add"("p_user" "uuid", "p_amount" numeric, "p_currency" "text", "p_desc" "text", "p_type" "public"."transaction_type", "p_room" "uuid") TO "service_role";


--
-- Name: FUNCTION "fn_wallet_apply_delta"("p_user_id" "uuid", "p_currency" "text", "p_amount_delta" numeric, "p_transaction_type" "public"."transaction_type", "p_source_kind" "text", "p_source_ref" "text", "p_description" "text", "p_meta" "jsonb", "p_allow_negative" boolean, "p_idempotency_key" "text"); Type: ACL; Schema: game_finance; Owner: -
--

REVOKE ALL ON FUNCTION "game_finance"."fn_wallet_apply_delta"("p_user_id" "uuid", "p_currency" "text", "p_amount_delta" numeric, "p_transaction_type" "public"."transaction_type", "p_source_kind" "text", "p_source_ref" "text", "p_description" "text", "p_meta" "jsonb", "p_allow_negative" boolean, "p_idempotency_key" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "game_finance"."fn_wallet_apply_delta"("p_user_id" "uuid", "p_currency" "text", "p_amount_delta" numeric, "p_transaction_type" "public"."transaction_type", "p_source_kind" "text", "p_source_ref" "text", "p_description" "text", "p_meta" "jsonb", "p_allow_negative" boolean, "p_idempotency_key" "text") TO "service_role";


--
-- Name: FUNCTION "fn_wallet_capture"("p_user" "uuid", "p_amount" numeric, "p_currency" "text", "p_room" "uuid"); Type: ACL; Schema: game_finance; Owner: -
--

GRANT ALL ON FUNCTION "game_finance"."fn_wallet_capture"("p_user" "uuid", "p_amount" numeric, "p_currency" "text", "p_room" "uuid") TO "service_role";


--
-- Name: FUNCTION "fn_wallet_capture_and_distribute"("p_room" "uuid"); Type: ACL; Schema: game_finance; Owner: -
--

GRANT ALL ON FUNCTION "game_finance"."fn_wallet_capture_and_distribute"("p_room" "uuid") TO "service_role";


--
-- Name: FUNCTION "fn_wallet_capture_join"("p_user" "uuid", "p_amount" numeric, "p_currency" "text", "p_room" "uuid", "p_ticket" "uuid"); Type: ACL; Schema: game_finance; Owner: -
--

GRANT ALL ON FUNCTION "game_finance"."fn_wallet_capture_join"("p_user" "uuid", "p_amount" numeric, "p_currency" "text", "p_room" "uuid", "p_ticket" "uuid") TO "service_role";


--
-- Name: FUNCTION "fn_wallet_deposit"("p_user" "uuid", "p_amount" numeric, "p_currency" "text", "p_desc" "text"); Type: ACL; Schema: game_finance; Owner: -
--

GRANT ALL ON FUNCTION "game_finance"."fn_wallet_deposit"("p_user" "uuid", "p_amount" numeric, "p_currency" "text", "p_desc" "text") TO "service_role";


--
-- Name: FUNCTION "fn_wallet_hold_join"("p_user" "uuid", "p_amount" numeric, "p_currency" "text", "p_room" "uuid"); Type: ACL; Schema: game_finance; Owner: -
--

GRANT ALL ON FUNCTION "game_finance"."fn_wallet_hold_join"("p_user" "uuid", "p_amount" numeric, "p_currency" "text", "p_room" "uuid") TO "service_role";


--
-- Name: FUNCTION "fn_wallet_hold_join"("p_user" "uuid", "p_amount" numeric, "p_currency" "text", "p_room" "uuid", "p_ticket" "uuid"); Type: ACL; Schema: game_finance; Owner: -
--

GRANT ALL ON FUNCTION "game_finance"."fn_wallet_hold_join"("p_user" "uuid", "p_amount" numeric, "p_currency" "text", "p_room" "uuid", "p_ticket" "uuid") TO "service_role";


--
-- Name: FUNCTION "fn_wallet_release"("p_user" "uuid", "p_amount" numeric, "p_currency" "text", "p_room" "uuid"); Type: ACL; Schema: game_finance; Owner: -
--

GRANT ALL ON FUNCTION "game_finance"."fn_wallet_release"("p_user" "uuid", "p_amount" numeric, "p_currency" "text", "p_room" "uuid") TO "service_role";


--
-- Name: FUNCTION "fn_wallet_release_join"("p_ticket" "uuid"); Type: ACL; Schema: game_finance; Owner: -
--

GRANT ALL ON FUNCTION "game_finance"."fn_wallet_release_join"("p_ticket" "uuid") TO "service_role";


--
-- Name: FUNCTION "fn_wallet_release_join"("p_user" "uuid", "p_amount" numeric, "p_currency" "text", "p_room" "uuid"); Type: ACL; Schema: game_finance; Owner: -
--

GRANT ALL ON FUNCTION "game_finance"."fn_wallet_release_join"("p_user" "uuid", "p_amount" numeric, "p_currency" "text", "p_room" "uuid") TO "service_role";


--
-- Name: FUNCTION "fn_wallet_release_join"("p_user" "uuid", "p_amount" numeric, "p_currency" "text", "p_room" "uuid", "p_ticket" "uuid"); Type: ACL; Schema: game_finance; Owner: -
--

GRANT ALL ON FUNCTION "game_finance"."fn_wallet_release_join"("p_user" "uuid", "p_amount" numeric, "p_currency" "text", "p_room" "uuid", "p_ticket" "uuid") TO "service_role";


--
-- Name: FUNCTION "fn_wallet_subtract"("p_user" "uuid", "p_amount" numeric, "p_currency" "text", "p_desc" "text", "p_type" "public"."transaction_type", "p_room" "uuid"); Type: ACL; Schema: game_finance; Owner: -
--

GRANT ALL ON FUNCTION "game_finance"."fn_wallet_subtract"("p_user" "uuid", "p_amount" numeric, "p_currency" "text", "p_desc" "text", "p_type" "public"."transaction_type", "p_room" "uuid") TO "service_role";


--
-- Name: FUNCTION "fn_wallet_summary"("p_user" "uuid", "p_currency" "text", "p_since" timestamp with time zone, "p_room" "uuid"); Type: ACL; Schema: game_finance; Owner: -
--

GRANT ALL ON FUNCTION "game_finance"."fn_wallet_summary"("p_user" "uuid", "p_currency" "text", "p_since" timestamp with time zone, "p_room" "uuid") TO "service_role";


--
-- Name: FUNCTION "fn_wallet_withdraw"("p_user" "uuid", "p_amount" numeric, "p_currency" "text", "p_desc" "text"); Type: ACL; Schema: game_finance; Owner: -
--

GRANT ALL ON FUNCTION "game_finance"."fn_wallet_withdraw"("p_user" "uuid", "p_amount" numeric, "p_currency" "text", "p_desc" "text") TO "service_role";


--
-- Name: FUNCTION "set_wallets_updated_at"(); Type: ACL; Schema: game_finance; Owner: -
--

GRANT ALL ON FUNCTION "game_finance"."set_wallets_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "game_finance"."set_wallets_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "game_finance"."set_wallets_updated_at"() TO "service_role";


--
-- Name: FUNCTION "trg_rooms_after_live"(); Type: ACL; Schema: game_finance; Owner: -
--

GRANT ALL ON FUNCTION "game_finance"."trg_rooms_after_live"() TO "service_role";


--
-- Name: FUNCTION "trg_tickets_after_paid"(); Type: ACL; Schema: game_finance; Owner: -
--

GRANT ALL ON FUNCTION "game_finance"."trg_tickets_after_paid"() TO "service_role";


--
-- Name: FUNCTION "activate_card_pool"("p_id" "uuid"); Type: ACL; Schema: game_pool; Owner: -
--

GRANT ALL ON FUNCTION "game_pool"."activate_card_pool"("p_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "game_pool"."activate_card_pool"("p_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "game_pool"."activate_card_pool"("p_id" "uuid") TO "service_role";


--
-- Name: FUNCTION "fn_retain_last_n_pools"("p_keep" integer); Type: ACL; Schema: game_pool; Owner: -
--

GRANT ALL ON FUNCTION "game_pool"."fn_retain_last_n_pools"("p_keep" integer) TO "anon";
GRANT ALL ON FUNCTION "game_pool"."fn_retain_last_n_pools"("p_keep" integer) TO "authenticated";
GRANT ALL ON FUNCTION "game_pool"."fn_retain_last_n_pools"("p_keep" integer) TO "service_role";


--
-- Name: FUNCTION "fn_sync_card_numbers"(); Type: ACL; Schema: game_pool; Owner: -
--

GRANT ALL ON FUNCTION "game_pool"."fn_sync_card_numbers"() TO "anon";
GRANT ALL ON FUNCTION "game_pool"."fn_sync_card_numbers"() TO "authenticated";
GRANT ALL ON FUNCTION "game_pool"."fn_sync_card_numbers"() TO "service_role";


--
-- Name: FUNCTION "generate_card_pool_housie"("p_created_by" "uuid"); Type: ACL; Schema: game_pool; Owner: -
--

GRANT ALL ON FUNCTION "game_pool"."generate_card_pool_housie"("p_created_by" "uuid") TO "anon";
GRANT ALL ON FUNCTION "game_pool"."generate_card_pool_housie"("p_created_by" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "game_pool"."generate_card_pool_housie"("p_created_by" "uuid") TO "service_role";


--
-- Name: FUNCTION "fn_assert_session_engine_game"(); Type: ACL; Schema: platform; Owner: -
--

REVOKE ALL ON FUNCTION "platform"."fn_assert_session_engine_game"() FROM PUBLIC;
GRANT ALL ON FUNCTION "platform"."fn_assert_session_engine_game"() TO "service_role";


--
-- Name: FUNCTION "fn_shadow_bingo_ids"(OUT "game_id" "uuid", OUT "engine_id" "uuid"); Type: ACL; Schema: platform; Owner: -
--

REVOKE ALL ON FUNCTION "platform"."fn_shadow_bingo_ids"(OUT "game_id" "uuid", OUT "engine_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "platform"."fn_shadow_bingo_ids"(OUT "game_id" "uuid", OUT "engine_id" "uuid") TO "service_role";


--
-- Name: FUNCTION "fn_shadow_drain"("p_limit" integer); Type: ACL; Schema: platform; Owner: -
--

REVOKE ALL ON FUNCTION "platform"."fn_shadow_drain"("p_limit" integer) FROM PUBLIC;
GRANT ALL ON FUNCTION "platform"."fn_shadow_drain"("p_limit" integer) TO "service_role";


--
-- Name: FUNCTION "fn_shadow_enqueue"("p_room_id" "uuid"); Type: ACL; Schema: platform; Owner: -
--

REVOKE ALL ON FUNCTION "platform"."fn_shadow_enqueue"("p_room_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "platform"."fn_shadow_enqueue"("p_room_id" "uuid") TO "service_role";


--
-- Name: FUNCTION "fn_shadow_map_lifecycle"("p_status" "text", "p_lease_owner" "text"); Type: ACL; Schema: platform; Owner: -
--

REVOKE ALL ON FUNCTION "platform"."fn_shadow_map_lifecycle"("p_status" "text", "p_lease_owner" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "platform"."fn_shadow_map_lifecycle"("p_status" "text", "p_lease_owner" "text") TO "service_role";


--
-- Name: FUNCTION "fn_shadow_map_participant_status"("p_active_tickets" integer, "p_has_held" boolean, "p_has_live" boolean); Type: ACL; Schema: platform; Owner: -
--

REVOKE ALL ON FUNCTION "platform"."fn_shadow_map_participant_status"("p_active_tickets" integer, "p_has_held" boolean, "p_has_live" boolean) FROM PUBLIC;
GRANT ALL ON FUNCTION "platform"."fn_shadow_map_participant_status"("p_active_tickets" integer, "p_has_held" boolean, "p_has_live" boolean) TO "service_role";


--
-- Name: FUNCTION "fn_shadow_mirror_participants"("p_room_id" "uuid", "p_retry_count" integer); Type: ACL; Schema: platform; Owner: -
--

REVOKE ALL ON FUNCTION "platform"."fn_shadow_mirror_participants"("p_room_id" "uuid", "p_retry_count" integer) FROM PUBLIC;
GRANT ALL ON FUNCTION "platform"."fn_shadow_mirror_participants"("p_room_id" "uuid", "p_retry_count" integer) TO "service_role";


--
-- Name: FUNCTION "fn_shadow_mirror_room"("p_room_id" "uuid", "p_retry_count" integer); Type: ACL; Schema: platform; Owner: -
--

REVOKE ALL ON FUNCTION "platform"."fn_shadow_mirror_room"("p_room_id" "uuid", "p_retry_count" integer) FROM PUBLIC;
GRANT ALL ON FUNCTION "platform"."fn_shadow_mirror_room"("p_room_id" "uuid", "p_retry_count" integer) TO "service_role";


--
-- Name: FUNCTION "fn_shadow_participant_recon_report"(); Type: ACL; Schema: platform; Owner: -
--

REVOKE ALL ON FUNCTION "platform"."fn_shadow_participant_recon_report"() FROM PUBLIC;
GRANT ALL ON FUNCTION "platform"."fn_shadow_participant_recon_report"() TO "service_role";


--
-- Name: FUNCTION "fn_shadow_reconcile"("p_limit" integer); Type: ACL; Schema: platform; Owner: -
--

REVOKE ALL ON FUNCTION "platform"."fn_shadow_reconcile"("p_limit" integer) FROM PUBLIC;
GRANT ALL ON FUNCTION "platform"."fn_shadow_reconcile"("p_limit" integer) TO "service_role";


--
-- Name: FUNCTION "trg_rooms_platform_shadow"(); Type: ACL; Schema: platform; Owner: -
--

REVOKE ALL ON FUNCTION "platform"."trg_rooms_platform_shadow"() FROM PUBLIC;


--
-- Name: FUNCTION "trg_tickets_platform_shadow"(); Type: ACL; Schema: platform; Owner: -
--

REVOKE ALL ON FUNCTION "platform"."trg_tickets_platform_shadow"() FROM PUBLIC;


--
-- Name: FUNCTION "can_read_user"("target_user_id" "uuid"); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION "public"."can_read_user"("target_user_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."can_read_user"("target_user_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."can_read_user"("target_user_id" "uuid") TO "service_role";


--
-- Name: FUNCTION "can_read_user_in_tournament"("target_user_id" "uuid"); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION "public"."can_read_user_in_tournament"("target_user_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."can_read_user_in_tournament"("target_user_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."can_read_user_in_tournament"("target_user_id" "uuid") TO "service_role";


--
-- Name: FUNCTION "debug_runtime_context"("p_room_id" "uuid"); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION "public"."debug_runtime_context"("p_room_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."debug_runtime_context"("p_room_id" "uuid") TO "service_role";


--
-- Name: FUNCTION "debug_ticket_counts"("p_room_id" "uuid"); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION "public"."debug_ticket_counts"("p_room_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."debug_ticket_counts"("p_room_id" "uuid") TO "service_role";


--
-- Name: FUNCTION "distribute_ding_on_draw"(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION "public"."distribute_ding_on_draw"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."distribute_ding_on_draw"() TO "service_role";


--
-- Name: FUNCTION "fn_adjust_referral_wallet"("p_target_user" "uuid", "p_amount" numeric, "p_currency" "text", "p_type" "public"."transaction_type", "p_description" "text"); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION "public"."fn_adjust_referral_wallet"("p_target_user" "uuid", "p_amount" numeric, "p_currency" "text", "p_type" "public"."transaction_type", "p_description" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."fn_adjust_referral_wallet"("p_target_user" "uuid", "p_amount" numeric, "p_currency" "text", "p_type" "public"."transaction_type", "p_description" "text") TO "service_role";


--
-- Name: FUNCTION "fn_adjust_wallet_manual"("p_target_user" "uuid", "p_amount" numeric, "p_currency" "text", "p_type" "public"."transaction_type", "p_description" "text"); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION "public"."fn_adjust_wallet_manual"("p_target_user" "uuid", "p_amount" numeric, "p_currency" "text", "p_type" "public"."transaction_type", "p_description" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."fn_adjust_wallet_manual"("p_target_user" "uuid", "p_amount" numeric, "p_currency" "text", "p_type" "public"."transaction_type", "p_description" "text") TO "service_role";


--
-- Name: TABLE "tournaments"; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE "public"."tournaments" TO "anon";
GRANT ALL ON TABLE "public"."tournaments" TO "authenticated";
GRANT ALL ON TABLE "public"."tournaments" TO "service_role";


--
-- Name: FUNCTION "fn_admin_create_tournament"("p_payload" "jsonb"); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION "public"."fn_admin_create_tournament"("p_payload" "jsonb") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."fn_admin_create_tournament"("p_payload" "jsonb") TO "authenticated";
GRANT ALL ON FUNCTION "public"."fn_admin_create_tournament"("p_payload" "jsonb") TO "service_role";


--
-- Name: FUNCTION "fn_admin_delete_tournament"("p_tournament_id" "uuid"); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION "public"."fn_admin_delete_tournament"("p_tournament_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."fn_admin_delete_tournament"("p_tournament_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."fn_admin_delete_tournament"("p_tournament_id" "uuid") TO "service_role";


--
-- Name: FUNCTION "fn_admin_games_report"("p_from" timestamp with time zone, "p_to" timestamp with time zone, "p_limit" integer, "p_offset" integer); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION "public"."fn_admin_games_report"("p_from" timestamp with time zone, "p_to" timestamp with time zone, "p_limit" integer, "p_offset" integer) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."fn_admin_games_report"("p_from" timestamp with time zone, "p_to" timestamp with time zone, "p_limit" integer, "p_offset" integer) TO "service_role";


--
-- Name: FUNCTION "fn_admin_set_tournament_status"("p_tournament_id" "uuid", "p_status" "public"."tournament_status"); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION "public"."fn_admin_set_tournament_status"("p_tournament_id" "uuid", "p_status" "public"."tournament_status") TO "anon";
GRANT ALL ON FUNCTION "public"."fn_admin_set_tournament_status"("p_tournament_id" "uuid", "p_status" "public"."tournament_status") TO "authenticated";
GRANT ALL ON FUNCTION "public"."fn_admin_set_tournament_status"("p_tournament_id" "uuid", "p_status" "public"."tournament_status") TO "service_role";


--
-- Name: FUNCTION "fn_admin_update_tournament"("p_tournament_id" "uuid", "p_patch" "jsonb"); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION "public"."fn_admin_update_tournament"("p_tournament_id" "uuid", "p_patch" "jsonb") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."fn_admin_update_tournament"("p_tournament_id" "uuid", "p_patch" "jsonb") TO "authenticated";
GRANT ALL ON FUNCTION "public"."fn_admin_update_tournament"("p_tournament_id" "uuid", "p_patch" "jsonb") TO "service_role";


--
-- Name: FUNCTION "fn_aggregate_ding_for_processed_draw"(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION "public"."fn_aggregate_ding_for_processed_draw"() TO "anon";
GRANT ALL ON FUNCTION "public"."fn_aggregate_ding_for_processed_draw"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."fn_aggregate_ding_for_processed_draw"() TO "service_role";


--
-- Name: FUNCTION "fn_backfill_card_bitmask_definitions"(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION "public"."fn_backfill_card_bitmask_definitions"() TO "anon";
GRANT ALL ON FUNCTION "public"."fn_backfill_card_bitmask_definitions"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."fn_backfill_card_bitmask_definitions"() TO "service_role";


--
-- Name: FUNCTION "fn_cancel_waiting_room"("p_room" "uuid", "p_by_admin" boolean); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION "public"."fn_cancel_waiting_room"("p_room" "uuid", "p_by_admin" boolean) TO "anon";
GRANT ALL ON FUNCTION "public"."fn_cancel_waiting_room"("p_room" "uuid", "p_by_admin" boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."fn_cancel_waiting_room"("p_room" "uuid", "p_by_admin" boolean) TO "service_role";


--
-- Name: FUNCTION "fn_cancel_waiting_room"("p_room" "uuid", "p_by_admin" boolean, "p_user" "uuid"); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION "public"."fn_cancel_waiting_room"("p_room" "uuid", "p_by_admin" boolean, "p_user" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."fn_cancel_waiting_room"("p_room" "uuid", "p_by_admin" boolean, "p_user" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."fn_cancel_waiting_room"("p_room" "uuid", "p_by_admin" boolean, "p_user" "uuid") TO "service_role";


--
-- Name: FUNCTION "fn_cleanup_retention"(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION "public"."fn_cleanup_retention"() TO "anon";
GRANT ALL ON FUNCTION "public"."fn_cleanup_retention"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."fn_cleanup_retention"() TO "service_role";


--
-- Name: FUNCTION "fn_dashboard_admin_commission_summary"(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION "public"."fn_dashboard_admin_commission_summary"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."fn_dashboard_admin_commission_summary"() TO "anon";
GRANT ALL ON FUNCTION "public"."fn_dashboard_admin_commission_summary"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."fn_dashboard_admin_commission_summary"() TO "service_role";


--
-- Name: FUNCTION "fn_dashboard_admin_commission_summary_range"("p_from" timestamp with time zone, "p_to" timestamp with time zone); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION "public"."fn_dashboard_admin_commission_summary_range"("p_from" timestamp with time zone, "p_to" timestamp with time zone) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."fn_dashboard_admin_commission_summary_range"("p_from" timestamp with time zone, "p_to" timestamp with time zone) TO "anon";
GRANT ALL ON FUNCTION "public"."fn_dashboard_admin_commission_summary_range"("p_from" timestamp with time zone, "p_to" timestamp with time zone) TO "authenticated";
GRANT ALL ON FUNCTION "public"."fn_dashboard_admin_commission_summary_range"("p_from" timestamp with time zone, "p_to" timestamp with time zone) TO "service_role";


--
-- Name: FUNCTION "fn_dashboard_admin_tournament_guarantee_summary"(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION "public"."fn_dashboard_admin_tournament_guarantee_summary"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."fn_dashboard_admin_tournament_guarantee_summary"() TO "anon";
GRANT ALL ON FUNCTION "public"."fn_dashboard_admin_tournament_guarantee_summary"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."fn_dashboard_admin_tournament_guarantee_summary"() TO "service_role";


--
-- Name: FUNCTION "fn_dashboard_admin_tournament_guarantee_summary_range"("p_from" timestamp with time zone, "p_to" timestamp with time zone); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION "public"."fn_dashboard_admin_tournament_guarantee_summary_range"("p_from" timestamp with time zone, "p_to" timestamp with time zone) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."fn_dashboard_admin_tournament_guarantee_summary_range"("p_from" timestamp with time zone, "p_to" timestamp with time zone) TO "anon";
GRANT ALL ON FUNCTION "public"."fn_dashboard_admin_tournament_guarantee_summary_range"("p_from" timestamp with time zone, "p_to" timestamp with time zone) TO "authenticated";
GRANT ALL ON FUNCTION "public"."fn_dashboard_admin_tournament_guarantee_summary_range"("p_from" timestamp with time zone, "p_to" timestamp with time zone) TO "service_role";


--
-- Name: FUNCTION "fn_deposit_create_intent"("p_user_id" "uuid", "p_channel" "text", "p_provider" "text", "p_amount_expected" numeric, "p_currency" "text", "p_expires_at" timestamp with time zone, "p_destination_ref" "text", "p_metadata" "jsonb", "p_created_by" "text", "p_created_by_actor_id" "uuid", "p_provider_intent_ref" "text"); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION "public"."fn_deposit_create_intent"("p_user_id" "uuid", "p_channel" "text", "p_provider" "text", "p_amount_expected" numeric, "p_currency" "text", "p_expires_at" timestamp with time zone, "p_destination_ref" "text", "p_metadata" "jsonb", "p_created_by" "text", "p_created_by_actor_id" "uuid", "p_provider_intent_ref" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."fn_deposit_create_intent"("p_user_id" "uuid", "p_channel" "text", "p_provider" "text", "p_amount_expected" numeric, "p_currency" "text", "p_expires_at" timestamp with time zone, "p_destination_ref" "text", "p_metadata" "jsonb", "p_created_by" "text", "p_created_by_actor_id" "uuid", "p_provider_intent_ref" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."fn_deposit_create_intent"("p_user_id" "uuid", "p_channel" "text", "p_provider" "text", "p_amount_expected" numeric, "p_currency" "text", "p_expires_at" timestamp with time zone, "p_destination_ref" "text", "p_metadata" "jsonb", "p_created_by" "text", "p_created_by_actor_id" "uuid", "p_provider_intent_ref" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."fn_deposit_create_intent"("p_user_id" "uuid", "p_channel" "text", "p_provider" "text", "p_amount_expected" numeric, "p_currency" "text", "p_expires_at" timestamp with time zone, "p_destination_ref" "text", "p_metadata" "jsonb", "p_created_by" "text", "p_created_by_actor_id" "uuid", "p_provider_intent_ref" "text") TO "service_role";


--
-- Name: FUNCTION "fn_deposit_get_intent_status"("p_intent_id" "uuid"); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION "public"."fn_deposit_get_intent_status"("p_intent_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."fn_deposit_get_intent_status"("p_intent_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."fn_deposit_get_intent_status"("p_intent_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."fn_deposit_get_intent_status"("p_intent_id" "uuid") TO "service_role";


--
-- Name: FUNCTION "fn_deposit_post_credit"("p_intent_id" "uuid"); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION "public"."fn_deposit_post_credit"("p_intent_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."fn_deposit_post_credit"("p_intent_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."fn_deposit_post_credit"("p_intent_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."fn_deposit_post_credit"("p_intent_id" "uuid") TO "service_role";


--
-- Name: FUNCTION "fn_deposit_recon"(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION "public"."fn_deposit_recon"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."fn_deposit_recon"() TO "anon";
GRANT ALL ON FUNCTION "public"."fn_deposit_recon"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."fn_deposit_recon"() TO "service_role";


--
-- Name: FUNCTION "fn_dev_panel_dev_player_finance_summary"("p_period" "text", "p_timezone" "text"); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION "public"."fn_dev_panel_dev_player_finance_summary"("p_period" "text", "p_timezone" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."fn_dev_panel_dev_player_finance_summary"("p_period" "text", "p_timezone" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."fn_dev_panel_dev_player_finance_summary"("p_period" "text", "p_timezone" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."fn_dev_panel_dev_player_finance_summary"("p_period" "text", "p_timezone" "text") TO "service_role";


--
-- Name: FUNCTION "fn_ding_aggregate_dryrun_on_draw_processed"(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION "public"."fn_ding_aggregate_dryrun_on_draw_processed"() TO "anon";
GRANT ALL ON FUNCTION "public"."fn_ding_aggregate_dryrun_on_draw_processed"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."fn_ding_aggregate_dryrun_on_draw_processed"() TO "service_role";


--
-- Name: FUNCTION "fn_draw_schedule_jitter_ms"("p_room_id" "uuid"); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION "public"."fn_draw_schedule_jitter_ms"("p_room_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."fn_draw_schedule_jitter_ms"("p_room_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."fn_draw_schedule_jitter_ms"("p_room_id" "uuid") TO "service_role";


--
-- Name: FUNCTION "fn_evaluate_room_after_draw"("p_room_id" "uuid", "p_draw_number" integer); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION "public"."fn_evaluate_room_after_draw"("p_room_id" "uuid", "p_draw_number" integer) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."fn_evaluate_room_after_draw"("p_room_id" "uuid", "p_draw_number" integer) TO "service_role";


--
-- Name: FUNCTION "fn_finish_room_and_settle"("p_room" "uuid", "p_admin_user" "uuid"); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION "public"."fn_finish_room_and_settle"("p_room" "uuid", "p_admin_user" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."fn_finish_room_and_settle"("p_room" "uuid", "p_admin_user" "uuid") TO "service_role";


--
-- Name: FUNCTION "fn_generate_card_pool"("p_card_count" integer, "p_created_by" "uuid", "p_prng_version" "text"); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION "public"."fn_generate_card_pool"("p_card_count" integer, "p_created_by" "uuid", "p_prng_version" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."fn_generate_card_pool"("p_card_count" integer, "p_created_by" "uuid", "p_prng_version" "text") TO "service_role";


--
-- Name: FUNCTION "fn_generate_room_code"(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION "public"."fn_generate_room_code"() TO "anon";
GRANT ALL ON FUNCTION "public"."fn_generate_room_code"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."fn_generate_room_code"() TO "service_role";


--
-- Name: FUNCTION "fn_heartbeat_log"(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION "public"."fn_heartbeat_log"() TO "anon";
GRANT ALL ON FUNCTION "public"."fn_heartbeat_log"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."fn_heartbeat_log"() TO "service_role";


--
-- Name: FUNCTION "fn_heartbeat_tick"(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION "public"."fn_heartbeat_tick"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."fn_heartbeat_tick"() TO "service_role";


--
-- Name: FUNCTION "fn_janitor_repair_unsettled_finished"("p_limit" integer); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION "public"."fn_janitor_repair_unsettled_finished"("p_limit" integer) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."fn_janitor_repair_unsettled_finished"("p_limit" integer) TO "service_role";


--
-- Name: FUNCTION "fn_join_or_create_room"("p_template_id" "uuid", "p_card_count" integer, "p_password" "text"); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION "public"."fn_join_or_create_room"("p_template_id" "uuid", "p_card_count" integer, "p_password" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."fn_join_or_create_room"("p_template_id" "uuid", "p_card_count" integer, "p_password" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."fn_join_or_create_room"("p_template_id" "uuid", "p_card_count" integer, "p_password" "text") TO "service_role";


--
-- Name: FUNCTION "fn_join_or_create_room_base"("p_template_id" "uuid", "p_card_count" integer, "p_password" "text"); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION "public"."fn_join_or_create_room_base"("p_template_id" "uuid", "p_card_count" integer, "p_password" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."fn_join_or_create_room_base"("p_template_id" "uuid", "p_card_count" integer, "p_password" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."fn_join_or_create_room_base"("p_template_id" "uuid", "p_card_count" integer, "p_password" "text") TO "service_role";


--
-- Name: FUNCTION "fn_leaderboard_weekly"("p_from" timestamp with time zone, "p_to" timestamp with time zone); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION "public"."fn_leaderboard_weekly"("p_from" timestamp with time zone, "p_to" timestamp with time zone) TO "anon";
GRANT ALL ON FUNCTION "public"."fn_leaderboard_weekly"("p_from" timestamp with time zone, "p_to" timestamp with time zone) TO "authenticated";
GRANT ALL ON FUNCTION "public"."fn_leaderboard_weekly"("p_from" timestamp with time zone, "p_to" timestamp with time zone) TO "service_role";


--
-- Name: FUNCTION "fn_maintain_heartbeat_log_partitions"("p_keep_days" integer, "p_future_days" integer); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION "public"."fn_maintain_heartbeat_log_partitions"("p_keep_days" integer, "p_future_days" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."fn_maintain_heartbeat_log_partitions"("p_keep_days" integer, "p_future_days" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."fn_maintain_heartbeat_log_partitions"("p_keep_days" integer, "p_future_days" integer) TO "service_role";


--
-- Name: FUNCTION "fn_my_active_rooms"("p_user_id" "uuid"); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION "public"."fn_my_active_rooms"("p_user_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."fn_my_active_rooms"("p_user_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."fn_my_active_rooms"("p_user_id" "uuid") TO "service_role";


--
-- Name: FUNCTION "fn_payout_room_if_full"("p_room_id" "uuid"); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION "public"."fn_payout_room_if_full"("p_room_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."fn_payout_room_if_full"("p_room_id" "uuid") TO "service_role";


--
-- Name: TABLE "dev_room_schedules"; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE "public"."dev_room_schedules" TO "anon";
GRANT ALL ON TABLE "public"."dev_room_schedules" TO "authenticated";
GRANT ALL ON TABLE "public"."dev_room_schedules" TO "service_role";


--
-- Name: FUNCTION "fn_pick_dev_room_schedules"("p_limit" integer); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION "public"."fn_pick_dev_room_schedules"("p_limit" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."fn_pick_dev_room_schedules"("p_limit" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."fn_pick_dev_room_schedules"("p_limit" integer) TO "service_role";


--
-- Name: FUNCTION "fn_ping_presence"(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION "public"."fn_ping_presence"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."fn_ping_presence"() TO "anon";
GRANT ALL ON FUNCTION "public"."fn_ping_presence"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."fn_ping_presence"() TO "service_role";


--
-- Name: FUNCTION "fn_player_game_stats"("p_user_id" "uuid", "p_from" timestamp with time zone, "p_to" timestamp with time zone); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION "public"."fn_player_game_stats"("p_user_id" "uuid", "p_from" timestamp with time zone, "p_to" timestamp with time zone) TO "anon";
GRANT ALL ON FUNCTION "public"."fn_player_game_stats"("p_user_id" "uuid", "p_from" timestamp with time zone, "p_to" timestamp with time zone) TO "authenticated";
GRANT ALL ON FUNCTION "public"."fn_player_game_stats"("p_user_id" "uuid", "p_from" timestamp with time zone, "p_to" timestamp with time zone) TO "service_role";


--
-- Name: FUNCTION "fn_player_purchase_history"("p_user_id" "uuid", "p_from" timestamp with time zone, "p_to" timestamp with time zone); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION "public"."fn_player_purchase_history"("p_user_id" "uuid", "p_from" timestamp with time zone, "p_to" timestamp with time zone) TO "anon";
GRANT ALL ON FUNCTION "public"."fn_player_purchase_history"("p_user_id" "uuid", "p_from" timestamp with time zone, "p_to" timestamp with time zone) TO "authenticated";
GRANT ALL ON FUNCTION "public"."fn_player_purchase_history"("p_user_id" "uuid", "p_from" timestamp with time zone, "p_to" timestamp with time zone) TO "service_role";


--
-- Name: FUNCTION "fn_player_stats"("p_user_id" "uuid", "p_date" timestamp with time zone); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION "public"."fn_player_stats"("p_user_id" "uuid", "p_date" timestamp with time zone) TO "anon";
GRANT ALL ON FUNCTION "public"."fn_player_stats"("p_user_id" "uuid", "p_date" timestamp with time zone) TO "authenticated";
GRANT ALL ON FUNCTION "public"."fn_player_stats"("p_user_id" "uuid", "p_date" timestamp with time zone) TO "service_role";


--
-- Name: FUNCTION "fn_process_draw_jobs_batch"(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION "public"."fn_process_draw_jobs_batch"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."fn_process_draw_jobs_batch"() TO "service_role";


--
-- Name: FUNCTION "fn_process_draw_jobs_batch_worker"("p_worker_id" integer, "p_total_workers" integer); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION "public"."fn_process_draw_jobs_batch_worker"("p_worker_id" integer, "p_total_workers" integer) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."fn_process_draw_jobs_batch_worker"("p_worker_id" integer, "p_total_workers" integer) TO "service_role";


--
-- Name: FUNCTION "fn_recon_money_conservation"(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION "public"."fn_recon_money_conservation"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."fn_recon_money_conservation"() TO "anon";
GRANT ALL ON FUNCTION "public"."fn_recon_money_conservation"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."fn_recon_money_conservation"() TO "service_role";


--
-- Name: FUNCTION "fn_recon_run_and_store"(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION "public"."fn_recon_run_and_store"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."fn_recon_run_and_store"() TO "anon";
GRANT ALL ON FUNCTION "public"."fn_recon_run_and_store"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."fn_recon_run_and_store"() TO "service_role";


--
-- Name: FUNCTION "fn_recon_wallet_ledger"("p_limit" integer); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION "public"."fn_recon_wallet_ledger"("p_limit" integer) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."fn_recon_wallet_ledger"("p_limit" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."fn_recon_wallet_ledger"("p_limit" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."fn_recon_wallet_ledger"("p_limit" integer) TO "service_role";


--
-- Name: FUNCTION "fn_resolve_player_agent_id"("p_player_id" "uuid"); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION "public"."fn_resolve_player_agent_id"("p_player_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."fn_resolve_player_agent_id"("p_player_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."fn_resolve_player_agent_id"("p_player_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."fn_resolve_player_agent_id"("p_player_id" "uuid") TO "service_role";


--
-- Name: FUNCTION "fn_rooms_by_ids"("p_room_ids" "uuid"[], "p_template_ids" "uuid"[]); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION "public"."fn_rooms_by_ids"("p_room_ids" "uuid"[], "p_template_ids" "uuid"[]) TO "anon";
GRANT ALL ON FUNCTION "public"."fn_rooms_by_ids"("p_room_ids" "uuid"[], "p_template_ids" "uuid"[]) TO "authenticated";
GRANT ALL ON FUNCTION "public"."fn_rooms_by_ids"("p_room_ids" "uuid"[], "p_template_ids" "uuid"[]) TO "service_role";


--
-- Name: FUNCTION "fn_system_join_or_create_room"("p_user_id" "uuid", "p_template_id" "uuid", "p_card_count" integer, "p_password" "text"); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION "public"."fn_system_join_or_create_room"("p_user_id" "uuid", "p_template_id" "uuid", "p_card_count" integer, "p_password" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."fn_system_join_or_create_room"("p_user_id" "uuid", "p_template_id" "uuid", "p_card_count" integer, "p_password" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."fn_system_join_or_create_room"("p_user_id" "uuid", "p_template_id" "uuid", "p_card_count" integer, "p_password" "text") TO "service_role";


--
-- Name: FUNCTION "fn_tick_due_tournaments"("p_limit" integer, "p_seed" bigint, "p_batch_tables" integer); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION "public"."fn_tick_due_tournaments"("p_limit" integer, "p_seed" bigint, "p_batch_tables" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."fn_tick_due_tournaments"("p_limit" integer, "p_seed" bigint, "p_batch_tables" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."fn_tick_due_tournaments"("p_limit" integer, "p_seed" bigint, "p_batch_tables" integer) TO "service_role";


--
-- Name: FUNCTION "fn_tick_tournament"("p_tournament_id" "uuid", "p_seed" bigint, "p_batch_tables" integer[]); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION "public"."fn_tick_tournament"("p_tournament_id" "uuid", "p_seed" bigint, "p_batch_tables" integer[]) TO "anon";
GRANT ALL ON FUNCTION "public"."fn_tick_tournament"("p_tournament_id" "uuid", "p_seed" bigint, "p_batch_tables" integer[]) TO "authenticated";
GRANT ALL ON FUNCTION "public"."fn_tick_tournament"("p_tournament_id" "uuid", "p_seed" bigint, "p_batch_tables" integer[]) TO "service_role";


--
-- Name: FUNCTION "fn_tournament_entry_upsert"("p_tournament_id" "uuid", "p_user_id" "uuid", "p_qty" integer, "p_amount" numeric, "p_status" "public"."tournament_entry_status"); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION "public"."fn_tournament_entry_upsert"("p_tournament_id" "uuid", "p_user_id" "uuid", "p_qty" integer, "p_amount" numeric, "p_status" "public"."tournament_entry_status") TO "anon";
GRANT ALL ON FUNCTION "public"."fn_tournament_entry_upsert"("p_tournament_id" "uuid", "p_user_id" "uuid", "p_qty" integer, "p_amount" numeric, "p_status" "public"."tournament_entry_status") TO "authenticated";
GRANT ALL ON FUNCTION "public"."fn_tournament_entry_upsert"("p_tournament_id" "uuid", "p_user_id" "uuid", "p_qty" integer, "p_amount" numeric, "p_status" "public"."tournament_entry_status") TO "service_role";


--
-- Name: FUNCTION "fn_tournament_wallet_capture"("p_tournament_id" "uuid", "p_entry_id" "uuid", "p_amount" numeric, "p_currency" "text"); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION "public"."fn_tournament_wallet_capture"("p_tournament_id" "uuid", "p_entry_id" "uuid", "p_amount" numeric, "p_currency" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."fn_tournament_wallet_capture"("p_tournament_id" "uuid", "p_entry_id" "uuid", "p_amount" numeric, "p_currency" "text") TO "service_role";


--
-- Name: FUNCTION "fn_tournament_wallet_hold"("p_tournament_id" "uuid", "p_qty" integer, "p_currency" "text", "p_entry_id" "uuid"); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION "public"."fn_tournament_wallet_hold"("p_tournament_id" "uuid", "p_qty" integer, "p_currency" "text", "p_entry_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."fn_tournament_wallet_hold"("p_tournament_id" "uuid", "p_qty" integer, "p_currency" "text", "p_entry_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."fn_tournament_wallet_hold"("p_tournament_id" "uuid", "p_qty" integer, "p_currency" "text", "p_entry_id" "uuid") TO "service_role";


--
-- Name: FUNCTION "fn_tournament_wallet_release"("p_tournament_id" "uuid", "p_currency" "text", "p_entry_id" "uuid"); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION "public"."fn_tournament_wallet_release"("p_tournament_id" "uuid", "p_currency" "text", "p_entry_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."fn_tournament_wallet_release"("p_tournament_id" "uuid", "p_currency" "text", "p_entry_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."fn_tournament_wallet_release"("p_tournament_id" "uuid", "p_currency" "text", "p_entry_id" "uuid") TO "service_role";


--
-- Name: FUNCTION "fn_try_mark_template_inactive_if_drained"("p_template_id" "uuid"); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION "public"."fn_try_mark_template_inactive_if_drained"("p_template_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."fn_try_mark_template_inactive_if_drained"("p_template_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."fn_try_mark_template_inactive_if_drained"("p_template_id" "uuid") TO "service_role";


--
-- Name: FUNCTION "fn_wallet_apply_delta"("p_user_id" "uuid", "p_currency" "text", "p_amount_delta" numeric, "p_transaction_type" "public"."transaction_type", "p_source_kind" "text", "p_source_ref" "text", "p_description" "text", "p_meta" "jsonb", "p_allow_negative" boolean, "p_idempotency_key" "text"); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION "public"."fn_wallet_apply_delta"("p_user_id" "uuid", "p_currency" "text", "p_amount_delta" numeric, "p_transaction_type" "public"."transaction_type", "p_source_kind" "text", "p_source_ref" "text", "p_description" "text", "p_meta" "jsonb", "p_allow_negative" boolean, "p_idempotency_key" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."fn_wallet_apply_delta"("p_user_id" "uuid", "p_currency" "text", "p_amount_delta" numeric, "p_transaction_type" "public"."transaction_type", "p_source_kind" "text", "p_source_ref" "text", "p_description" "text", "p_meta" "jsonb", "p_allow_negative" boolean, "p_idempotency_key" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."fn_wallet_apply_delta"("p_user_id" "uuid", "p_currency" "text", "p_amount_delta" numeric, "p_transaction_type" "public"."transaction_type", "p_source_kind" "text", "p_source_ref" "text", "p_description" "text", "p_meta" "jsonb", "p_allow_negative" boolean, "p_idempotency_key" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."fn_wallet_apply_delta"("p_user_id" "uuid", "p_currency" "text", "p_amount_delta" numeric, "p_transaction_type" "public"."transaction_type", "p_source_kind" "text", "p_source_ref" "text", "p_description" "text", "p_meta" "jsonb", "p_allow_negative" boolean, "p_idempotency_key" "text") TO "service_role";


--
-- Name: FUNCTION "fn_wallet_transfer_panel"("p_target_id" "uuid", "p_currency" "text", "p_amount" bigint, "p_direction" "text", "p_description" "text"); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION "public"."fn_wallet_transfer_panel"("p_target_id" "uuid", "p_currency" "text", "p_amount" bigint, "p_direction" "text", "p_description" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."fn_wallet_transfer_panel"("p_target_id" "uuid", "p_currency" "text", "p_amount" bigint, "p_direction" "text", "p_description" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."fn_wallet_transfer_panel"("p_target_id" "uuid", "p_currency" "text", "p_amount" bigint, "p_direction" "text", "p_description" "text") TO "service_role";


--
-- Name: FUNCTION "fn_wallet_transfer_panel"("p_target_id" "uuid", "p_amount" bigint, "p_action" "text", "p_client_request_id" "text", "p_description" "text", "p_meta" "jsonb"); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION "public"."fn_wallet_transfer_panel"("p_target_id" "uuid", "p_amount" bigint, "p_action" "text", "p_client_request_id" "text", "p_description" "text", "p_meta" "jsonb") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."fn_wallet_transfer_panel"("p_target_id" "uuid", "p_amount" bigint, "p_action" "text", "p_client_request_id" "text", "p_description" "text", "p_meta" "jsonb") TO "anon";
GRANT ALL ON FUNCTION "public"."fn_wallet_transfer_panel"("p_target_id" "uuid", "p_amount" bigint, "p_action" "text", "p_client_request_id" "text", "p_description" "text", "p_meta" "jsonb") TO "authenticated";
GRANT ALL ON FUNCTION "public"."fn_wallet_transfer_panel"("p_target_id" "uuid", "p_amount" bigint, "p_action" "text", "p_client_request_id" "text", "p_description" "text", "p_meta" "jsonb") TO "service_role";


--
-- Name: FUNCTION "fn_wallet_transfer_panel_bulk"("p_target_ids" "uuid"[], "p_currency" "text", "p_amount" bigint, "p_direction" "text", "p_description" "text"); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION "public"."fn_wallet_transfer_panel_bulk"("p_target_ids" "uuid"[], "p_currency" "text", "p_amount" bigint, "p_direction" "text", "p_description" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."fn_wallet_transfer_panel_bulk"("p_target_ids" "uuid"[], "p_currency" "text", "p_amount" bigint, "p_direction" "text", "p_description" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."fn_wallet_transfer_panel_bulk"("p_target_ids" "uuid"[], "p_currency" "text", "p_amount" bigint, "p_direction" "text", "p_description" "text") TO "service_role";


--
-- Name: FUNCTION "fn_withdrawal_actor_can_review"("p_actor_id" "uuid", "p_player_id" "uuid"); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION "public"."fn_withdrawal_actor_can_review"("p_actor_id" "uuid", "p_player_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."fn_withdrawal_actor_can_review"("p_actor_id" "uuid", "p_player_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."fn_withdrawal_actor_can_review"("p_actor_id" "uuid", "p_player_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."fn_withdrawal_actor_can_review"("p_actor_id" "uuid", "p_player_id" "uuid") TO "service_role";


--
-- Name: FUNCTION "fn_withdrawal_actor_can_review_crypto"("p_actor_id" "uuid"); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION "public"."fn_withdrawal_actor_can_review_crypto"("p_actor_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."fn_withdrawal_actor_can_review_crypto"("p_actor_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."fn_withdrawal_actor_can_review_crypto"("p_actor_id" "uuid") TO "service_role";


--
-- Name: FUNCTION "fn_withdrawal_capture"("p_user_id" "uuid", "p_amount" bigint, "p_request_id" "uuid"); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION "public"."fn_withdrawal_capture"("p_user_id" "uuid", "p_amount" bigint, "p_request_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."fn_withdrawal_capture"("p_user_id" "uuid", "p_amount" bigint, "p_request_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."fn_withdrawal_capture"("p_user_id" "uuid", "p_amount" bigint, "p_request_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."fn_withdrawal_capture"("p_user_id" "uuid", "p_amount" bigint, "p_request_id" "uuid") TO "service_role";


--
-- Name: FUNCTION "fn_withdrawal_hold"("p_user_id" "uuid", "p_amount" bigint, "p_request_id" "uuid"); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION "public"."fn_withdrawal_hold"("p_user_id" "uuid", "p_amount" bigint, "p_request_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."fn_withdrawal_hold"("p_user_id" "uuid", "p_amount" bigint, "p_request_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."fn_withdrawal_hold"("p_user_id" "uuid", "p_amount" bigint, "p_request_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."fn_withdrawal_hold"("p_user_id" "uuid", "p_amount" bigint, "p_request_id" "uuid") TO "service_role";


--
-- Name: FUNCTION "fn_withdrawal_release"("p_user_id" "uuid", "p_amount" bigint, "p_request_id" "uuid"); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION "public"."fn_withdrawal_release"("p_user_id" "uuid", "p_amount" bigint, "p_request_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."fn_withdrawal_release"("p_user_id" "uuid", "p_amount" bigint, "p_request_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."fn_withdrawal_release"("p_user_id" "uuid", "p_amount" bigint, "p_request_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."fn_withdrawal_release"("p_user_id" "uuid", "p_amount" bigint, "p_request_id" "uuid") TO "service_role";


--
-- Name: FUNCTION "fn_withdrawal_request_approve"("p_request_id" "uuid", "p_actor_id" "uuid"); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION "public"."fn_withdrawal_request_approve"("p_request_id" "uuid", "p_actor_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."fn_withdrawal_request_approve"("p_request_id" "uuid", "p_actor_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."fn_withdrawal_request_approve"("p_request_id" "uuid", "p_actor_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."fn_withdrawal_request_approve"("p_request_id" "uuid", "p_actor_id" "uuid") TO "service_role";


--
-- Name: FUNCTION "fn_withdrawal_request_approve_crypto"("p_request_id" "uuid", "p_actor_id" "uuid"); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION "public"."fn_withdrawal_request_approve_crypto"("p_request_id" "uuid", "p_actor_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."fn_withdrawal_request_approve_crypto"("p_request_id" "uuid", "p_actor_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."fn_withdrawal_request_approve_crypto"("p_request_id" "uuid", "p_actor_id" "uuid") TO "service_role";


--
-- Name: FUNCTION "fn_withdrawal_request_create"("p_player_id" "uuid", "p_amount" bigint, "p_card_number" "text", "p_full_name" "text", "p_client_request_id" "text"); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION "public"."fn_withdrawal_request_create"("p_player_id" "uuid", "p_amount" bigint, "p_card_number" "text", "p_full_name" "text", "p_client_request_id" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."fn_withdrawal_request_create"("p_player_id" "uuid", "p_amount" bigint, "p_card_number" "text", "p_full_name" "text", "p_client_request_id" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."fn_withdrawal_request_create"("p_player_id" "uuid", "p_amount" bigint, "p_card_number" "text", "p_full_name" "text", "p_client_request_id" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."fn_withdrawal_request_create"("p_player_id" "uuid", "p_amount" bigint, "p_card_number" "text", "p_full_name" "text", "p_client_request_id" "text") TO "service_role";


--
-- Name: FUNCTION "fn_withdrawal_request_create_crypto"("p_player_id" "uuid", "p_locked_toman" bigint, "p_requested_toman" bigint, "p_network" "text", "p_crypto_symbol" "text", "p_crypto_amount" numeric, "p_wallet_address" "text", "p_client_request_id" "text"); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION "public"."fn_withdrawal_request_create_crypto"("p_player_id" "uuid", "p_locked_toman" bigint, "p_requested_toman" bigint, "p_network" "text", "p_crypto_symbol" "text", "p_crypto_amount" numeric, "p_wallet_address" "text", "p_client_request_id" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."fn_withdrawal_request_create_crypto"("p_player_id" "uuid", "p_locked_toman" bigint, "p_requested_toman" bigint, "p_network" "text", "p_crypto_symbol" "text", "p_crypto_amount" numeric, "p_wallet_address" "text", "p_client_request_id" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."fn_withdrawal_request_create_crypto"("p_player_id" "uuid", "p_locked_toman" bigint, "p_requested_toman" bigint, "p_network" "text", "p_crypto_symbol" "text", "p_crypto_amount" numeric, "p_wallet_address" "text", "p_client_request_id" "text") TO "service_role";


--
-- Name: FUNCTION "fn_withdrawal_request_reject"("p_request_id" "uuid", "p_actor_id" "uuid", "p_reason" "text"); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION "public"."fn_withdrawal_request_reject"("p_request_id" "uuid", "p_actor_id" "uuid", "p_reason" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."fn_withdrawal_request_reject"("p_request_id" "uuid", "p_actor_id" "uuid", "p_reason" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."fn_withdrawal_request_reject"("p_request_id" "uuid", "p_actor_id" "uuid", "p_reason" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."fn_withdrawal_request_reject"("p_request_id" "uuid", "p_actor_id" "uuid", "p_reason" "text") TO "service_role";


--
-- Name: FUNCTION "get_daily_leaders"("limit_count" integer); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION "public"."get_daily_leaders"("limit_count" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."get_daily_leaders"("limit_count" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_daily_leaders"("limit_count" integer) TO "service_role";


--
-- Name: FUNCTION "get_daily_leaders_by_date"("target_date" "date", "limit_count" integer); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION "public"."get_daily_leaders_by_date"("target_date" "date", "limit_count" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."get_daily_leaders_by_date"("target_date" "date", "limit_count" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_daily_leaders_by_date"("target_date" "date", "limit_count" integer) TO "service_role";


--
-- Name: FUNCTION "get_total_balances_by_role"(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION "public"."get_total_balances_by_role"() TO "anon";
GRANT ALL ON FUNCTION "public"."get_total_balances_by_role"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_total_balances_by_role"() TO "service_role";


--
-- Name: FUNCTION "get_weekly_leaders"("limit_count" integer); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION "public"."get_weekly_leaders"("limit_count" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."get_weekly_leaders"("limit_count" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_weekly_leaders"("limit_count" integer) TO "service_role";


--
-- Name: FUNCTION "handle_new_user"(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "anon";
GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "service_role";


--
-- Name: FUNCTION "is_admin_active"(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION "public"."is_admin_active"() TO "anon";
GRANT ALL ON FUNCTION "public"."is_admin_active"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_admin_active"() TO "service_role";


--
-- Name: FUNCTION "is_tournament_participant"("p_tournament_id" "uuid"); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION "public"."is_tournament_participant"("p_tournament_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."is_tournament_participant"("p_tournament_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_tournament_participant"("p_tournament_id" "uuid") TO "service_role";


--
-- Name: FUNCTION "load_test_cleanup"("p_tag" "text"); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION "public"."load_test_cleanup"("p_tag" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."load_test_cleanup"("p_tag" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."load_test_cleanup"("p_tag" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."load_test_cleanup"("p_tag" "text") TO "service_role";


--
-- Name: FUNCTION "load_test_seed_playing_rooms"("p_room_count" integer, "p_tickets_per_room" integer, "p_draw_interval_sec" integer, "p_tag" "text"); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION "public"."load_test_seed_playing_rooms"("p_room_count" integer, "p_tickets_per_room" integer, "p_draw_interval_sec" integer, "p_tag" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."load_test_seed_playing_rooms"("p_room_count" integer, "p_tickets_per_room" integer, "p_draw_interval_sec" integer, "p_tag" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."load_test_seed_playing_rooms"("p_room_count" integer, "p_tickets_per_room" integer, "p_draw_interval_sec" integer, "p_tag" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."load_test_seed_playing_rooms"("p_room_count" integer, "p_tickets_per_room" integer, "p_draw_interval_sec" integer, "p_tag" "text") TO "service_role";


--
-- Name: FUNCTION "make_short_id_from_uuid"("p_id" "uuid"); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION "public"."make_short_id_from_uuid"("p_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."make_short_id_from_uuid"("p_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."make_short_id_from_uuid"("p_id" "uuid") TO "service_role";


--
-- Name: FUNCTION "rpc_apply_ding_credits_for_draw"("p_room_id" "uuid", "p_draw_number" integer, "p_ding_per_card" integer, "p_credits" "jsonb"); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION "public"."rpc_apply_ding_credits_for_draw"("p_room_id" "uuid", "p_draw_number" integer, "p_ding_per_card" integer, "p_credits" "jsonb") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."rpc_apply_ding_credits_for_draw"("p_room_id" "uuid", "p_draw_number" integer, "p_ding_per_card" integer, "p_credits" "jsonb") TO "service_role";


--
-- Name: FUNCTION "rpc_apply_marks_for_draw"("p_room_id" "uuid", "p_draw_number" integer); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION "public"."rpc_apply_marks_for_draw"("p_room_id" "uuid", "p_draw_number" integer) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."rpc_apply_marks_for_draw"("p_room_id" "uuid", "p_draw_number" integer) TO "service_role";


--
-- Name: FUNCTION "rpc_backfill_missed_engine_ding"("p_room_id" "uuid"); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION "public"."rpc_backfill_missed_engine_ding"("p_room_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."rpc_backfill_missed_engine_ding"("p_room_id" "uuid") TO "service_role";


--
-- Name: FUNCTION "rpc_claim_game_room"("p_room_id" "uuid", "p_owner_id" "text", "p_lease_seconds" integer); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION "public"."rpc_claim_game_room"("p_room_id" "uuid", "p_owner_id" "text", "p_lease_seconds" integer) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."rpc_claim_game_room"("p_room_id" "uuid", "p_owner_id" "text", "p_lease_seconds" integer) TO "service_role";


--
-- Name: FUNCTION "rpc_finalize_engine_draw_job"("p_job_id" bigint, "p_room_id" "uuid", "p_draw_number" integer, "p_marks" "jsonb", "p_results" "jsonb", "p_set_first_line_draw_number" boolean, "p_ding_per_card" integer, "p_credits" "jsonb", "p_queue_wait_ms" integer, "p_processing_ms" integer, "p_drain_started_at" timestamp with time zone, "p_first_picked_at" timestamp with time zone, "p_handler_started_at" timestamp with time zone, "p_actor_evaluate_started_at" timestamp with time zone, "p_actor_finalize_started_at" timestamp with time zone, "p_owner_id" "text", "p_lease_epoch" bigint); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION "public"."rpc_finalize_engine_draw_job"("p_job_id" bigint, "p_room_id" "uuid", "p_draw_number" integer, "p_marks" "jsonb", "p_results" "jsonb", "p_set_first_line_draw_number" boolean, "p_ding_per_card" integer, "p_credits" "jsonb", "p_queue_wait_ms" integer, "p_processing_ms" integer, "p_drain_started_at" timestamp with time zone, "p_first_picked_at" timestamp with time zone, "p_handler_started_at" timestamp with time zone, "p_actor_evaluate_started_at" timestamp with time zone, "p_actor_finalize_started_at" timestamp with time zone, "p_owner_id" "text", "p_lease_epoch" bigint) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."rpc_finalize_engine_draw_job"("p_job_id" bigint, "p_room_id" "uuid", "p_draw_number" integer, "p_marks" "jsonb", "p_results" "jsonb", "p_set_first_line_draw_number" boolean, "p_ding_per_card" integer, "p_credits" "jsonb", "p_queue_wait_ms" integer, "p_processing_ms" integer, "p_drain_started_at" timestamp with time zone, "p_first_picked_at" timestamp with time zone, "p_handler_started_at" timestamp with time zone, "p_actor_evaluate_started_at" timestamp with time zone, "p_actor_finalize_started_at" timestamp with time zone, "p_owner_id" "text", "p_lease_epoch" bigint) TO "service_role";


--
-- Name: FUNCTION "rpc_find_claimable_playing_rooms"("p_limit" integer); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION "public"."rpc_find_claimable_playing_rooms"("p_limit" integer) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."rpc_find_claimable_playing_rooms"("p_limit" integer) TO "service_role";


--
-- Name: FUNCTION "rpc_has_earlier_unprocessed_draw"("p_room_id" "uuid", "p_draw_number" integer); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION "public"."rpc_has_earlier_unprocessed_draw"("p_room_id" "uuid", "p_draw_number" integer) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."rpc_has_earlier_unprocessed_draw"("p_room_id" "uuid", "p_draw_number" integer) TO "service_role";


--
-- Name: FUNCTION "rpc_insert_draw_if_ready"("p_room_id" "uuid", "p_number" integer, "p_now" timestamp with time zone, "p_draw_interval_sec" integer); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION "public"."rpc_insert_draw_if_ready"("p_room_id" "uuid", "p_number" integer, "p_now" timestamp with time zone, "p_draw_interval_sec" integer) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."rpc_insert_draw_if_ready"("p_room_id" "uuid", "p_number" integer, "p_now" timestamp with time zone, "p_draw_interval_sec" integer) TO "service_role";


--
-- Name: FUNCTION "rpc_insert_draw_if_ready_owner_guard"("p_room_id" "uuid", "p_number" integer, "p_now" timestamp with time zone, "p_owner_id" "text", "p_draw_interval_sec" integer, "p_actor_due_at" timestamp with time zone, "p_lease_epoch" bigint); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION "public"."rpc_insert_draw_if_ready_owner_guard"("p_room_id" "uuid", "p_number" integer, "p_now" timestamp with time zone, "p_owner_id" "text", "p_draw_interval_sec" integer, "p_actor_due_at" timestamp with time zone, "p_lease_epoch" bigint) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."rpc_insert_draw_if_ready_owner_guard"("p_room_id" "uuid", "p_number" integer, "p_now" timestamp with time zone, "p_owner_id" "text", "p_draw_interval_sec" integer, "p_actor_due_at" timestamp with time zone, "p_lease_epoch" bigint) TO "service_role";


--
-- Name: FUNCTION "rpc_pick_draw_jobs"("p_limit" integer); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION "public"."rpc_pick_draw_jobs"("p_limit" integer) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."rpc_pick_draw_jobs"("p_limit" integer) TO "service_role";


--
-- Name: FUNCTION "rpc_register_player"("p_username" "text", "p_referral_code" "text"); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION "public"."rpc_register_player"("p_username" "text", "p_referral_code" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."rpc_register_player"("p_username" "text", "p_referral_code" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."rpc_register_player"("p_username" "text", "p_referral_code" "text") TO "service_role";


--
-- Name: FUNCTION "rpc_release_game_room"("p_room_id" "uuid", "p_owner_id" "text", "p_lease_epoch" bigint); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION "public"."rpc_release_game_room"("p_room_id" "uuid", "p_owner_id" "text", "p_lease_epoch" bigint) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."rpc_release_game_room"("p_room_id" "uuid", "p_owner_id" "text", "p_lease_epoch" bigint) TO "service_role";


--
-- Name: FUNCTION "rpc_renew_game_room_lease"("p_room_id" "uuid", "p_owner_id" "text", "p_lease_seconds" integer, "p_lease_epoch" bigint); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION "public"."rpc_renew_game_room_lease"("p_room_id" "uuid", "p_owner_id" "text", "p_lease_seconds" integer, "p_lease_epoch" bigint) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."rpc_renew_game_room_lease"("p_room_id" "uuid", "p_owner_id" "text", "p_lease_seconds" integer, "p_lease_epoch" bigint) TO "service_role";


--
-- Name: FUNCTION "rpc_requeue_failed_draw_jobs"(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION "public"."rpc_requeue_failed_draw_jobs"() TO "anon";
GRANT ALL ON FUNCTION "public"."rpc_requeue_failed_draw_jobs"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."rpc_requeue_failed_draw_jobs"() TO "service_role";


--
-- Name: FUNCTION "set_updated_at"(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION "public"."set_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."set_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."set_updated_at"() TO "service_role";


--
-- Name: FUNCTION "set_user_profiles_updated_at"(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION "public"."set_user_profiles_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."set_user_profiles_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."set_user_profiles_updated_at"() TO "service_role";


--
-- Name: FUNCTION "test_active_cards_bypass_rls"("p_room_id" "uuid"); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION "public"."test_active_cards_bypass_rls"("p_room_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."test_active_cards_bypass_rls"("p_room_id" "uuid") TO "service_role";


--
-- Name: FUNCTION "test_constraint_resolution"(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION "public"."test_constraint_resolution"() TO "anon";
GRANT ALL ON FUNCTION "public"."test_constraint_resolution"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."test_constraint_resolution"() TO "service_role";


--
-- Name: FUNCTION "tg_user_profiles_lock_deposit_identity"(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION "public"."tg_user_profiles_lock_deposit_identity"() TO "anon";
GRANT ALL ON FUNCTION "public"."tg_user_profiles_lock_deposit_identity"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."tg_user_profiles_lock_deposit_identity"() TO "service_role";


--
-- Name: FUNCTION "trg_debug_rooms_status"(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION "public"."trg_debug_rooms_status"() TO "anon";
GRANT ALL ON FUNCTION "public"."trg_debug_rooms_status"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."trg_debug_rooms_status"() TO "service_role";


--
-- Name: FUNCTION "trg_rooms_status_template_draining"(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION "public"."trg_rooms_status_template_draining"() TO "anon";
GRANT ALL ON FUNCTION "public"."trg_rooms_status_template_draining"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."trg_rooms_status_template_draining"() TO "service_role";


--
-- Name: FUNCTION "trg_sync_room_winners_from_results"(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION "public"."trg_sync_room_winners_from_results"() TO "anon";
GRANT ALL ON FUNCTION "public"."trg_sync_room_winners_from_results"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."trg_sync_room_winners_from_results"() TO "service_role";


--
-- Name: FUNCTION "update_admin_permissions_updated_at"(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION "public"."update_admin_permissions_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."update_admin_permissions_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_admin_permissions_updated_at"() TO "service_role";


--
-- Name: FUNCTION "update_dev_player_configs_updated_at"(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION "public"."update_dev_player_configs_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."update_dev_player_configs_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_dev_player_configs_updated_at"() TO "service_role";


--
-- Name: FUNCTION "update_dev_player_join_preset_template_limits_updated_at"(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION "public"."update_dev_player_join_preset_template_limits_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."update_dev_player_join_preset_template_limits_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_dev_player_join_preset_template_limits_updated_at"() TO "service_role";


--
-- Name: FUNCTION "update_dev_player_join_presets_updated_at"(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION "public"."update_dev_player_join_presets_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."update_dev_player_join_presets_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_dev_player_join_presets_updated_at"() TO "service_role";


--
-- Name: FUNCTION "update_dev_player_settings_updated_at"(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION "public"."update_dev_player_settings_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."update_dev_player_settings_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_dev_player_settings_updated_at"() TO "service_role";


--
-- Name: FUNCTION "update_dev_player_template_room_limits_updated_at"(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION "public"."update_dev_player_template_room_limits_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."update_dev_player_template_room_limits_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_dev_player_template_room_limits_updated_at"() TO "service_role";


--
-- Name: FUNCTION "update_ding_balance"("p_user_id" "uuid", "p_amount" numeric); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION "public"."update_ding_balance"("p_user_id" "uuid", "p_amount" numeric) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."update_ding_balance"("p_user_id" "uuid", "p_amount" numeric) TO "service_role";


--
-- Name: FUNCTION "update_entry_banners_updated_at"(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION "public"."update_entry_banners_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."update_entry_banners_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_entry_banners_updated_at"() TO "service_role";


--
-- Name: FUNCTION "update_user_notes_updated_at"(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION "public"."update_user_notes_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."update_user_notes_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_user_notes_updated_at"() TO "service_role";


--
-- Name: TABLE "tournament_entries"; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE "public"."tournament_entries" TO "anon";
GRANT ALL ON TABLE "public"."tournament_entries" TO "authenticated";
GRANT ALL ON TABLE "public"."tournament_entries" TO "service_role";


--
-- Name: FUNCTION "buy_tickets"("p_tournament_id" "uuid", "p_delta" integer); Type: ACL; Schema: tournament; Owner: -
--

GRANT ALL ON FUNCTION "tournament"."buy_tickets"("p_tournament_id" "uuid", "p_delta" integer) TO "authenticated";


--
-- Name: FUNCTION "cancel_registration"("p_tournament_id" "uuid"); Type: ACL; Schema: tournament; Owner: -
--

GRANT ALL ON FUNCTION "tournament"."cancel_registration"("p_tournament_id" "uuid") TO "authenticated";


--
-- Name: FUNCTION "capture_entry_locks"("p_tournament_id" "uuid"); Type: ACL; Schema: tournament; Owner: -
--

GRANT ALL ON FUNCTION "tournament"."capture_entry_locks"("p_tournament_id" "uuid") TO "authenticated";


--
-- Name: FUNCTION "close_registration"("p_tournament_id" "uuid"); Type: ACL; Schema: tournament; Owner: -
--

GRANT ALL ON FUNCTION "tournament"."close_registration"("p_tournament_id" "uuid") TO "authenticated";


--
-- Name: FUNCTION "fn_admin_create_tournament"("p_payload" "jsonb"); Type: ACL; Schema: tournament; Owner: -
--

GRANT ALL ON FUNCTION "tournament"."fn_admin_create_tournament"("p_payload" "jsonb") TO "authenticated";


--
-- Name: FUNCTION "fn_admin_delete_tournament"("p_tournament_id" "uuid"); Type: ACL; Schema: tournament; Owner: -
--

GRANT ALL ON FUNCTION "tournament"."fn_admin_delete_tournament"("p_tournament_id" "uuid") TO "authenticated";


--
-- Name: FUNCTION "fn_admin_set_tournament_status"("p_tournament_id" "uuid", "p_status" "public"."tournament_status"); Type: ACL; Schema: tournament; Owner: -
--

GRANT ALL ON FUNCTION "tournament"."fn_admin_set_tournament_status"("p_tournament_id" "uuid", "p_status" "public"."tournament_status") TO "authenticated";


--
-- Name: FUNCTION "fn_admin_update_tournament"("p_tournament_id" "uuid", "p_patch" "jsonb"); Type: ACL; Schema: tournament; Owner: -
--

GRANT ALL ON FUNCTION "tournament"."fn_admin_update_tournament"("p_tournament_id" "uuid", "p_patch" "jsonb") TO "authenticated";


--
-- Name: FUNCTION "get_my_registration"("p_tournament_id" "uuid"); Type: ACL; Schema: tournament; Owner: -
--

GRANT ALL ON FUNCTION "tournament"."get_my_registration"("p_tournament_id" "uuid") TO "authenticated";


--
-- Name: FUNCTION "open_registration"("p_tournament_id" "uuid"); Type: ACL; Schema: tournament; Owner: -
--

GRANT ALL ON FUNCTION "tournament"."open_registration"("p_tournament_id" "uuid") TO "authenticated";


--
-- Name: FUNCTION "release_entry_locks"("p_tournament_id" "uuid"); Type: ACL; Schema: tournament; Owner: -
--

GRANT ALL ON FUNCTION "tournament"."release_entry_locks"("p_tournament_id" "uuid") TO "authenticated";


--
-- Name: TABLE "tournament_locks"; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE "public"."tournament_locks" TO "anon";
GRANT ALL ON TABLE "public"."tournament_locks" TO "authenticated";
GRANT ALL ON TABLE "public"."tournament_locks" TO "service_role";


--
-- Name: FUNCTION "sync_my_entry_lock"("p_tournament_id" "uuid"); Type: ACL; Schema: tournament; Owner: -
--

GRANT ALL ON FUNCTION "tournament"."sync_my_entry_lock"("p_tournament_id" "uuid") TO "authenticated";


--
-- Name: TABLE "attempts"; Type: ACL; Schema: deposit; Owner: -
--

GRANT ALL ON TABLE "deposit"."attempts" TO "service_role";


--
-- Name: TABLE "credits"; Type: ACL; Schema: deposit; Owner: -
--

GRANT ALL ON TABLE "deposit"."credits" TO "service_role";


--
-- Name: TABLE "crypto_derivation_state"; Type: ACL; Schema: deposit; Owner: -
--

GRANT ALL ON TABLE "deposit"."crypto_derivation_state" TO "service_role";


--
-- Name: TABLE "crypto_rate_tiers"; Type: ACL; Schema: deposit; Owner: -
--

GRANT ALL ON TABLE "deposit"."crypto_rate_tiers" TO "service_role";


--
-- Name: TABLE "crypto_transactions"; Type: ACL; Schema: deposit; Owner: -
--

GRANT ALL ON TABLE "deposit"."crypto_transactions" TO "service_role";


--
-- Name: TABLE "crypto_xpub_settings"; Type: ACL; Schema: deposit; Owner: -
--

GRANT ALL ON TABLE "deposit"."crypto_xpub_settings" TO "service_role";


--
-- Name: TABLE "events"; Type: ACL; Schema: deposit; Owner: -
--

GRANT ALL ON TABLE "deposit"."events" TO "service_role";


--
-- Name: SEQUENCE "events_id_seq"; Type: ACL; Schema: deposit; Owner: -
--

GRANT SELECT,USAGE ON SEQUENCE "deposit"."events_id_seq" TO "service_role";


--
-- Name: TABLE "recon_reports"; Type: ACL; Schema: deposit; Owner: -
--

GRANT ALL ON TABLE "deposit"."recon_reports" TO "service_role";


--
-- Name: SEQUENCE "recon_reports_id_seq"; Type: ACL; Schema: deposit; Owner: -
--

GRANT SELECT,USAGE ON SEQUENCE "deposit"."recon_reports_id_seq" TO "service_role";


--
-- Name: TABLE "user_crypto_addresses"; Type: ACL; Schema: deposit; Owner: -
--

GRANT ALL ON TABLE "deposit"."user_crypto_addresses" TO "service_role";


--
-- Name: TABLE "verifications"; Type: ACL; Schema: deposit; Owner: -
--

GRANT ALL ON TABLE "deposit"."verifications" TO "service_role";


--
-- Name: TABLE "rooms"; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE "public"."rooms" TO "anon";
GRANT ALL ON TABLE "public"."rooms" TO "authenticated";
GRANT ALL ON TABLE "public"."rooms" TO "service_role";


--
-- Name: TABLE "engine_registry"; Type: ACL; Schema: platform; Owner: -
--

GRANT ALL ON TABLE "platform"."engine_registry" TO "service_role";


--
-- Name: TABLE "game_sessions"; Type: ACL; Schema: platform; Owner: -
--

GRANT ALL ON TABLE "platform"."game_sessions" TO "service_role";


--
-- Name: TABLE "games"; Type: ACL; Schema: platform; Owner: -
--

GRANT ALL ON TABLE "platform"."games" TO "service_role";


--
-- Name: TABLE "session_events"; Type: ACL; Schema: platform; Owner: -
--

GRANT ALL ON TABLE "platform"."session_events" TO "service_role";


--
-- Name: TABLE "session_participants"; Type: ACL; Schema: platform; Owner: -
--

GRANT ALL ON TABLE "platform"."session_participants" TO "service_role";


--
-- Name: TABLE "session_settlement"; Type: ACL; Schema: platform; Owner: -
--

GRANT ALL ON TABLE "platform"."session_settlement" TO "service_role";


--
-- Name: TABLE "session_state"; Type: ACL; Schema: platform; Owner: -
--

GRANT ALL ON TABLE "platform"."session_state" TO "service_role";


--
-- Name: TABLE "shadow_mirror_log"; Type: ACL; Schema: platform; Owner: -
--

GRANT ALL ON TABLE "platform"."shadow_mirror_log" TO "service_role";


--
-- Name: SEQUENCE "shadow_mirror_log_id_seq"; Type: ACL; Schema: platform; Owner: -
--

GRANT SELECT,USAGE ON SEQUENCE "platform"."shadow_mirror_log_id_seq" TO "service_role";


--
-- Name: TABLE "shadow_outbox"; Type: ACL; Schema: platform; Owner: -
--

GRANT ALL ON TABLE "platform"."shadow_outbox" TO "service_role";


--
-- Name: SEQUENCE "shadow_outbox_id_seq"; Type: ACL; Schema: platform; Owner: -
--

GRANT SELECT,USAGE ON SEQUENCE "platform"."shadow_outbox_id_seq" TO "service_role";


--
-- Name: TABLE "admin_audit_log"; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE "public"."admin_audit_log" TO "anon";
GRANT ALL ON TABLE "public"."admin_audit_log" TO "authenticated";
GRANT ALL ON TABLE "public"."admin_audit_log" TO "service_role";


--
-- Name: TABLE "admin_permissions"; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE "public"."admin_permissions" TO "anon";
GRANT ALL ON TABLE "public"."admin_permissions" TO "authenticated";
GRANT ALL ON TABLE "public"."admin_permissions" TO "service_role";


--
-- Name: TABLE "app_runtime_flags"; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE "public"."app_runtime_flags" TO "anon";
GRANT ALL ON TABLE "public"."app_runtime_flags" TO "authenticated";
GRANT ALL ON TABLE "public"."app_runtime_flags" TO "service_role";


--
-- Name: TABLE "card_definition_masks"; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE "public"."card_definition_masks" TO "service_role";


--
-- Name: TABLE "card_number_index"; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE "public"."card_number_index" TO "service_role";


--
-- Name: TABLE "card_numbers"; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE "public"."card_numbers" TO "anon";
GRANT ALL ON TABLE "public"."card_numbers" TO "authenticated";
GRANT ALL ON TABLE "public"."card_numbers" TO "service_role";


--
-- Name: TABLE "card_pool_cards"; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE "public"."card_pool_cards" TO "anon";
GRANT ALL ON TABLE "public"."card_pool_cards" TO "authenticated";
GRANT ALL ON TABLE "public"."card_pool_cards" TO "service_role";


--
-- Name: SEQUENCE "card_pool_cards_id_seq"; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON SEQUENCE "public"."card_pool_cards_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."card_pool_cards_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."card_pool_cards_id_seq" TO "service_role";


--
-- Name: TABLE "card_pools"; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE "public"."card_pools" TO "anon";
GRANT ALL ON TABLE "public"."card_pools" TO "authenticated";
GRANT ALL ON TABLE "public"."card_pools" TO "service_role";


--
-- Name: SEQUENCE "card_pools_version_seq"; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON SEQUENCE "public"."card_pools_version_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."card_pools_version_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."card_pools_version_seq" TO "service_role";


--
-- Name: TABLE "commissions_log"; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE "public"."commissions_log" TO "anon";
GRANT ALL ON TABLE "public"."commissions_log" TO "authenticated";
GRANT ALL ON TABLE "public"."commissions_log" TO "service_role";


--
-- Name: SEQUENCE "commissions_log_id_seq"; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON SEQUENCE "public"."commissions_log_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."commissions_log_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."commissions_log_id_seq" TO "service_role";


--
-- Name: TABLE "debug_room_status_log"; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE "public"."debug_room_status_log" TO "anon";
GRANT ALL ON TABLE "public"."debug_room_status_log" TO "authenticated";
GRANT ALL ON TABLE "public"."debug_room_status_log" TO "service_role";


--
-- Name: SEQUENCE "debug_room_status_log_id_seq"; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON SEQUENCE "public"."debug_room_status_log_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."debug_room_status_log_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."debug_room_status_log_id_seq" TO "service_role";


--
-- Name: TABLE "dev_player_configs"; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE "public"."dev_player_configs" TO "anon";
GRANT ALL ON TABLE "public"."dev_player_configs" TO "authenticated";
GRANT ALL ON TABLE "public"."dev_player_configs" TO "service_role";


--
-- Name: TABLE "dev_player_join_preset_template_limits"; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE "public"."dev_player_join_preset_template_limits" TO "anon";
GRANT ALL ON TABLE "public"."dev_player_join_preset_template_limits" TO "authenticated";
GRANT ALL ON TABLE "public"."dev_player_join_preset_template_limits" TO "service_role";


--
-- Name: TABLE "dev_player_join_presets"; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE "public"."dev_player_join_presets" TO "anon";
GRANT ALL ON TABLE "public"."dev_player_join_presets" TO "authenticated";
GRANT ALL ON TABLE "public"."dev_player_join_presets" TO "service_role";


--
-- Name: TABLE "dev_player_settings"; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE "public"."dev_player_settings" TO "anon";
GRANT ALL ON TABLE "public"."dev_player_settings" TO "authenticated";
GRANT ALL ON TABLE "public"."dev_player_settings" TO "service_role";


--
-- Name: TABLE "dev_player_template_room_limits"; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE "public"."dev_player_template_room_limits" TO "anon";
GRANT ALL ON TABLE "public"."dev_player_template_room_limits" TO "authenticated";
GRANT ALL ON TABLE "public"."dev_player_template_room_limits" TO "service_role";


--
-- Name: TABLE "ding_balances"; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE "public"."ding_balances" TO "anon";
GRANT ALL ON TABLE "public"."ding_balances" TO "authenticated";
GRANT ALL ON TABLE "public"."ding_balances" TO "service_role";


--
-- Name: TABLE "ding_transactions"; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE "public"."ding_transactions" TO "anon";
GRANT ALL ON TABLE "public"."ding_transactions" TO "authenticated";
GRANT ALL ON TABLE "public"."ding_transactions" TO "service_role";


--
-- Name: TABLE "draw_jobs"; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE "public"."draw_jobs" TO "anon";
GRANT ALL ON TABLE "public"."draw_jobs" TO "authenticated";
GRANT ALL ON TABLE "public"."draw_jobs" TO "service_role";


--
-- Name: SEQUENCE "draw_jobs_id_seq"; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON SEQUENCE "public"."draw_jobs_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."draw_jobs_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."draw_jobs_id_seq" TO "service_role";


--
-- Name: TABLE "draws"; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE "public"."draws" TO "anon";
GRANT ALL ON TABLE "public"."draws" TO "authenticated";
GRANT ALL ON TABLE "public"."draws" TO "service_role";


--
-- Name: TABLE "entry_banners"; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE "public"."entry_banners" TO "anon";
GRANT ALL ON TABLE "public"."entry_banners" TO "authenticated";
GRANT ALL ON TABLE "public"."entry_banners" TO "service_role";


--
-- Name: TABLE "finance_recon_reports"; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE "public"."finance_recon_reports" TO "service_role";


--
-- Name: SEQUENCE "finance_recon_reports_id_seq"; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON SEQUENCE "public"."finance_recon_reports_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."finance_recon_reports_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."finance_recon_reports_id_seq" TO "service_role";


--
-- Name: TABLE "heartbeat_log"; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE "public"."heartbeat_log" TO "anon";
GRANT ALL ON TABLE "public"."heartbeat_log" TO "authenticated";
GRANT ALL ON TABLE "public"."heartbeat_log" TO "service_role";


--
-- Name: TABLE "heartbeat_log_default"; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE "public"."heartbeat_log_default" TO "anon";
GRANT ALL ON TABLE "public"."heartbeat_log_default" TO "authenticated";
GRANT ALL ON TABLE "public"."heartbeat_log_default" TO "service_role";


--
-- Name: SEQUENCE "heartbeat_log_id_seq"; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON SEQUENCE "public"."heartbeat_log_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."heartbeat_log_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."heartbeat_log_id_seq" TO "service_role";


--
-- Name: TABLE "heartbeat_log_20260808"; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE "public"."heartbeat_log_20260808" TO "anon";
GRANT ALL ON TABLE "public"."heartbeat_log_20260808" TO "authenticated";
GRANT ALL ON TABLE "public"."heartbeat_log_20260808" TO "service_role";


--
-- Name: TABLE "heartbeat_log_20260809"; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE "public"."heartbeat_log_20260809" TO "anon";
GRANT ALL ON TABLE "public"."heartbeat_log_20260809" TO "authenticated";
GRANT ALL ON TABLE "public"."heartbeat_log_20260809" TO "service_role";


--
-- Name: TABLE "heartbeat_log_20260810"; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE "public"."heartbeat_log_20260810" TO "anon";
GRANT ALL ON TABLE "public"."heartbeat_log_20260810" TO "authenticated";
GRANT ALL ON TABLE "public"."heartbeat_log_20260810" TO "service_role";


--
-- Name: TABLE "heartbeat_log_20260811"; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE "public"."heartbeat_log_20260811" TO "anon";
GRANT ALL ON TABLE "public"."heartbeat_log_20260811" TO "authenticated";
GRANT ALL ON TABLE "public"."heartbeat_log_20260811" TO "service_role";


--
-- Name: TABLE "heartbeat_log_20260812"; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE "public"."heartbeat_log_20260812" TO "anon";
GRANT ALL ON TABLE "public"."heartbeat_log_20260812" TO "authenticated";
GRANT ALL ON TABLE "public"."heartbeat_log_20260812" TO "service_role";


--
-- Name: TABLE "heartbeat_log_20260813"; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE "public"."heartbeat_log_20260813" TO "anon";
GRANT ALL ON TABLE "public"."heartbeat_log_20260813" TO "authenticated";
GRANT ALL ON TABLE "public"."heartbeat_log_20260813" TO "service_role";


--
-- Name: TABLE "heartbeat_log_20260814"; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE "public"."heartbeat_log_20260814" TO "anon";
GRANT ALL ON TABLE "public"."heartbeat_log_20260814" TO "authenticated";
GRANT ALL ON TABLE "public"."heartbeat_log_20260814" TO "service_role";


--
-- Name: TABLE "heartbeat_log_20260815"; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE "public"."heartbeat_log_20260815" TO "anon";
GRANT ALL ON TABLE "public"."heartbeat_log_20260815" TO "authenticated";
GRANT ALL ON TABLE "public"."heartbeat_log_20260815" TO "service_role";


--
-- Name: TABLE "heartbeat_log_20260816"; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE "public"."heartbeat_log_20260816" TO "anon";
GRANT ALL ON TABLE "public"."heartbeat_log_20260816" TO "authenticated";
GRANT ALL ON TABLE "public"."heartbeat_log_20260816" TO "service_role";


--
-- Name: TABLE "heartbeat_log_20260817"; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE "public"."heartbeat_log_20260817" TO "anon";
GRANT ALL ON TABLE "public"."heartbeat_log_20260817" TO "authenticated";
GRANT ALL ON TABLE "public"."heartbeat_log_20260817" TO "service_role";


--
-- Name: TABLE "invitation_links"; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE "public"."invitation_links" TO "anon";
GRANT ALL ON TABLE "public"."invitation_links" TO "authenticated";
GRANT ALL ON TABLE "public"."invitation_links" TO "service_role";


--
-- Name: TABLE "kyc_submissions"; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE "public"."kyc_submissions" TO "service_role";


--
-- Name: TABLE "marks"; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE "public"."marks" TO "anon";
GRANT ALL ON TABLE "public"."marks" TO "authenticated";
GRANT ALL ON TABLE "public"."marks" TO "service_role";


--
-- Name: TABLE "player_affiliation"; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE "public"."player_affiliation" TO "anon";
GRANT ALL ON TABLE "public"."player_affiliation" TO "authenticated";
GRANT ALL ON TABLE "public"."player_affiliation" TO "service_role";


--
-- Name: TABLE "player_signups"; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE "public"."player_signups" TO "anon";
GRANT ALL ON TABLE "public"."player_signups" TO "authenticated";
GRANT ALL ON TABLE "public"."player_signups" TO "service_role";


--
-- Name: TABLE "results"; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE "public"."results" TO "anon";
GRANT ALL ON TABLE "public"."results" TO "authenticated";
GRANT ALL ON TABLE "public"."results" TO "service_role";


--
-- Name: TABLE "room_templates"; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE "public"."room_templates" TO "anon";
GRANT ALL ON TABLE "public"."room_templates" TO "authenticated";
GRANT ALL ON TABLE "public"."room_templates" TO "service_role";


--
-- Name: TABLE "room_winners"; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE "public"."room_winners" TO "anon";
GRANT ALL ON TABLE "public"."room_winners" TO "authenticated";
GRANT ALL ON TABLE "public"."room_winners" TO "service_role";


--
-- Name: TABLE "tickets"; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE "public"."tickets" TO "anon";
GRANT ALL ON TABLE "public"."tickets" TO "authenticated";
GRANT ALL ON TABLE "public"."tickets" TO "service_role";


--
-- Name: TABLE "tournament_commission_log"; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE "public"."tournament_commission_log" TO "anon";
GRANT ALL ON TABLE "public"."tournament_commission_log" TO "authenticated";
GRANT ALL ON TABLE "public"."tournament_commission_log" TO "service_role";


--
-- Name: TABLE "tournament_commission_payouts"; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE "public"."tournament_commission_payouts" TO "anon";
GRANT ALL ON TABLE "public"."tournament_commission_payouts" TO "authenticated";
GRANT ALL ON TABLE "public"."tournament_commission_payouts" TO "service_role";


--
-- Name: TABLE "tournament_commission_snapshots"; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE "public"."tournament_commission_snapshots" TO "anon";
GRANT ALL ON TABLE "public"."tournament_commission_snapshots" TO "authenticated";
GRANT ALL ON TABLE "public"."tournament_commission_snapshots" TO "service_role";


--
-- Name: TABLE "tournament_payouts"; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE "public"."tournament_payouts" TO "anon";
GRANT ALL ON TABLE "public"."tournament_payouts" TO "authenticated";
GRANT ALL ON TABLE "public"."tournament_payouts" TO "service_role";


--
-- Name: TABLE "tournament_prize_rules"; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE "public"."tournament_prize_rules" TO "anon";
GRANT ALL ON TABLE "public"."tournament_prize_rules" TO "authenticated";
GRANT ALL ON TABLE "public"."tournament_prize_rules" TO "service_role";


--
-- Name: TABLE "tournament_round_assignments"; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE "public"."tournament_round_assignments" TO "anon";
GRANT ALL ON TABLE "public"."tournament_round_assignments" TO "authenticated";
GRANT ALL ON TABLE "public"."tournament_round_assignments" TO "service_role";


--
-- Name: TABLE "tournament_round_rooms"; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE "public"."tournament_round_rooms" TO "anon";
GRANT ALL ON TABLE "public"."tournament_round_rooms" TO "authenticated";
GRANT ALL ON TABLE "public"."tournament_round_rooms" TO "service_role";


--
-- Name: TABLE "transactions"; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE "public"."transactions" TO "anon";
GRANT ALL ON TABLE "public"."transactions" TO "authenticated";
GRANT ALL ON TABLE "public"."transactions" TO "service_role";


--
-- Name: TABLE "user_commissions"; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE "public"."user_commissions" TO "anon";
GRANT ALL ON TABLE "public"."user_commissions" TO "authenticated";
GRANT ALL ON TABLE "public"."user_commissions" TO "service_role";


--
-- Name: TABLE "user_notes"; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE "public"."user_notes" TO "anon";
GRANT ALL ON TABLE "public"."user_notes" TO "authenticated";
GRANT ALL ON TABLE "public"."user_notes" TO "service_role";


--
-- Name: TABLE "user_profiles"; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE "public"."user_profiles" TO "anon";
GRANT ALL ON TABLE "public"."user_profiles" TO "authenticated";
GRANT ALL ON TABLE "public"."user_profiles" TO "service_role";


--
-- Name: TABLE "user_profiles_old_backup"; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE "public"."user_profiles_old_backup" TO "anon";
GRANT ALL ON TABLE "public"."user_profiles_old_backup" TO "authenticated";
GRANT ALL ON TABLE "public"."user_profiles_old_backup" TO "service_role";


--
-- Name: TABLE "users"; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE "public"."users" TO "anon";
GRANT ALL ON TABLE "public"."users" TO "authenticated";
GRANT ALL ON TABLE "public"."users" TO "service_role";


--
-- Name: TABLE "user_profiles_view"; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE "public"."user_profiles_view" TO "anon";
GRANT ALL ON TABLE "public"."user_profiles_view" TO "authenticated";
GRANT ALL ON TABLE "public"."user_profiles_view" TO "service_role";


--
-- Name: TABLE "v_active_pool"; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE "public"."v_active_pool" TO "anon";
GRANT ALL ON TABLE "public"."v_active_pool" TO "authenticated";
GRANT ALL ON TABLE "public"."v_active_pool" TO "service_role";


--
-- Name: TABLE "v_card_hits"; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE "public"."v_card_hits" TO "anon";
GRANT ALL ON TABLE "public"."v_card_hits" TO "authenticated";
GRANT ALL ON TABLE "public"."v_card_hits" TO "service_role";


--
-- Name: TABLE "v_draw_latency_recent"; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE "public"."v_draw_latency_recent" TO "anon";
GRANT ALL ON TABLE "public"."v_draw_latency_recent" TO "authenticated";
GRANT ALL ON TABLE "public"."v_draw_latency_recent" TO "service_role";


--
-- Name: TABLE "v_draw_latency_slo"; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE "public"."v_draw_latency_slo" TO "anon";
GRANT ALL ON TABLE "public"."v_draw_latency_slo" TO "authenticated";
GRANT ALL ON TABLE "public"."v_draw_latency_slo" TO "service_role";


--
-- Name: TABLE "v_draw_latency_slo_by_mode"; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE "public"."v_draw_latency_slo_by_mode" TO "anon";
GRANT ALL ON TABLE "public"."v_draw_latency_slo_by_mode" TO "authenticated";
GRANT ALL ON TABLE "public"."v_draw_latency_slo_by_mode" TO "service_role";


--
-- Name: TABLE "v_engine_loop_health"; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE "public"."v_engine_loop_health" TO "anon";
GRANT ALL ON TABLE "public"."v_engine_loop_health" TO "authenticated";
GRANT ALL ON TABLE "public"."v_engine_loop_health" TO "service_role";


--
-- Name: TABLE "v_lobby_active_players"; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE "public"."v_lobby_active_players" TO "anon";
GRANT ALL ON TABLE "public"."v_lobby_active_players" TO "authenticated";
GRANT ALL ON TABLE "public"."v_lobby_active_players" TO "service_role";


--
-- Name: TABLE "v_lobby_online_players"; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE "public"."v_lobby_online_players" TO "anon";
GRANT ALL ON TABLE "public"."v_lobby_online_players" TO "authenticated";
GRANT ALL ON TABLE "public"."v_lobby_online_players" TO "service_role";


--
-- Name: TABLE "v_row_hits"; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE "public"."v_row_hits" TO "anon";
GRANT ALL ON TABLE "public"."v_row_hits" TO "authenticated";
GRANT ALL ON TABLE "public"."v_row_hits" TO "service_role";


--
-- Name: TABLE "vw_finance_base"; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE "public"."vw_finance_base" TO "service_role";


--
-- Name: TABLE "vw_finance_earnings_by_role"; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE "public"."vw_finance_earnings_by_role" TO "anon";
GRANT ALL ON TABLE "public"."vw_finance_earnings_by_role" TO "authenticated";
GRANT ALL ON TABLE "public"."vw_finance_earnings_by_role" TO "service_role";


--
-- Name: TABLE "vw_finance_gmv"; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE "public"."vw_finance_gmv" TO "anon";
GRANT ALL ON TABLE "public"."vw_finance_gmv" TO "authenticated";
GRANT ALL ON TABLE "public"."vw_finance_gmv" TO "service_role";


--
-- Name: TABLE "vw_finance_profit_summary"; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE "public"."vw_finance_profit_summary" TO "anon";
GRANT ALL ON TABLE "public"."vw_finance_profit_summary" TO "authenticated";
GRANT ALL ON TABLE "public"."vw_finance_profit_summary" TO "service_role";


--
-- Name: TABLE "vw_player_commission"; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE "public"."vw_player_commission" TO "service_role";


--
-- Name: TABLE "wallet_transfer_idempotency"; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE "public"."wallet_transfer_idempotency" TO "service_role";


--
-- Name: TABLE "wallets"; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE "public"."wallets" TO "anon";
GRANT ALL ON TABLE "public"."wallets" TO "authenticated";
GRANT ALL ON TABLE "public"."wallets" TO "service_role";


--
-- Name: TABLE "withdrawal_requests"; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE "public"."withdrawal_requests" TO "anon";
GRANT ALL ON TABLE "public"."withdrawal_requests" TO "authenticated";
GRANT ALL ON TABLE "public"."withdrawal_requests" TO "service_role";


--
-- Name: DEFAULT PRIVILEGES FOR TABLES; Type: DEFAULT ACL; Schema: deposit; Owner: -
--

ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "deposit" GRANT ALL ON TABLES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "deposit" GRANT ALL ON TABLES TO "service_role";


--
-- Name: DEFAULT PRIVILEGES FOR TABLES; Type: DEFAULT ACL; Schema: platform; Owner: -
--

ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "platform" GRANT ALL ON TABLES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "platform" GRANT ALL ON TABLES TO "service_role";


--
-- Name: DEFAULT PRIVILEGES FOR SEQUENCES; Type: DEFAULT ACL; Schema: public; Owner: -
--

ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "service_role";


--
-- Name: DEFAULT PRIVILEGES FOR SEQUENCES; Type: DEFAULT ACL; Schema: public; Owner: -
--

ALTER DEFAULT PRIVILEGES FOR ROLE "supabase_admin" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "supabase_admin" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "supabase_admin" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "supabase_admin" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "service_role";


--
-- Name: DEFAULT PRIVILEGES FOR FUNCTIONS; Type: DEFAULT ACL; Schema: public; Owner: -
--

ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "service_role";


--
-- Name: DEFAULT PRIVILEGES FOR FUNCTIONS; Type: DEFAULT ACL; Schema: public; Owner: -
--

ALTER DEFAULT PRIVILEGES FOR ROLE "supabase_admin" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "supabase_admin" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "supabase_admin" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "supabase_admin" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "service_role";


--
-- Name: DEFAULT PRIVILEGES FOR TABLES; Type: DEFAULT ACL; Schema: public; Owner: -
--

ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "service_role";


--
-- Name: DEFAULT PRIVILEGES FOR TABLES; Type: DEFAULT ACL; Schema: public; Owner: -
--

ALTER DEFAULT PRIVILEGES FOR ROLE "supabase_admin" IN SCHEMA "public" GRANT ALL ON TABLES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "supabase_admin" IN SCHEMA "public" GRANT ALL ON TABLES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "supabase_admin" IN SCHEMA "public" GRANT ALL ON TABLES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "supabase_admin" IN SCHEMA "public" GRANT ALL ON TABLES TO "service_role";


--
-- PostgreSQL database dump complete
--

