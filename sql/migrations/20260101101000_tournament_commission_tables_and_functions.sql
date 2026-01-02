-- Migration: tournament commission tables and functions
-- Date: 2026-01-01

BEGIN;

-- 1) Commission tables for tournaments
CREATE TABLE IF NOT EXISTS public.tournament_commission_snapshots (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tournament_id     uuid NOT NULL,
  entry_id          uuid NOT NULL,
  user_id           uuid NOT NULL,
  agent_id          uuid NULL,
  super_id          uuid NULL,
  admin_id          uuid NULL,
  gross_amount      numeric NOT NULL DEFAULT 0,
  commission_rate   numeric,
  commission_base   numeric,
  agent_rate        numeric,
  super_rate        numeric,
  agent_amount      numeric NOT NULL DEFAULT 0,
  super_amount      numeric NOT NULL DEFAULT 0,
  admin_amount      numeric NOT NULL DEFAULT 0,
  amount_to_pool    numeric NOT NULL DEFAULT 0,
  currency          text NOT NULL DEFAULT 'IRR',
  commission_model  text,
  created_at        timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_tournament_commission_snap UNIQUE (tournament_id, entry_id)
);

CREATE TABLE IF NOT EXISTS public.tournament_commission_payouts (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tournament_id        uuid NOT NULL,
  entry_id             uuid NOT NULL,
  beneficiary_user_id  uuid NOT NULL,
  role                 text NOT NULL, -- agent/super/admin/pool
  amount               numeric NOT NULL,
  currency             text NOT NULL DEFAULT 'IRR',
  status               text NOT NULL DEFAULT 'pending', -- pending/paid/cancelled
  meta                 jsonb,
  created_at           timestamptz NOT NULL DEFAULT now(),
  paid_at              timestamptz
);

CREATE INDEX IF NOT EXISTS idx_tournament_commission_payouts_ref
  ON public.tournament_commission_payouts (tournament_id, entry_id, beneficiary_user_id, role);

-- 2) Capture function for tournaments (wallet)
CREATE OR REPLACE FUNCTION tournament.fn_wallet_capture_join(
  p_tournament_id uuid,
  p_entry_id uuid,
  p_amount numeric,
  p_currency text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = tournament, public, game_finance
AS $function$
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
$function$;

-- Public wrapper for RPC compatibility
CREATE OR REPLACE FUNCTION public.fn_tournament_wallet_capture(
  p_tournament_id uuid,
  p_entry_id uuid,
  p_amount numeric,
  p_currency text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
BEGIN
  RETURN tournament.fn_wallet_capture_join(p_tournament_id, p_entry_id, p_amount, p_currency);
END;
$function$;

-- 3) Commission snapshot
CREATE OR REPLACE FUNCTION tournament.fn_commission_snapshot(
  p_tournament_id uuid,
  p_entry_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = tournament, public
AS $function$
DECLARE
  v_entry record;
  v_t record;
  v_gross numeric;
  v_rate numeric;
  v_agent_rate numeric := 0;
  v_super_rate numeric := 0;
  v_admin_rate numeric;
  v_agent_amount numeric := 0;
  v_super_amount numeric := 0;
  v_admin_amount numeric := 0;
  v_pool_amount numeric := 0;
BEGIN
  SELECT te.*, u.id as user_id
    INTO v_entry
  FROM public.tournament_entries te
  JOIN auth.users u ON u.id = te.user_id
  WHERE te.id = p_entry_id
    AND te.tournament_id = p_tournament_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'entry not found';
  END IF;

  SELECT * INTO v_t FROM public.tournaments WHERE id = p_tournament_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'tournament not found';
  END IF;

  v_rate := COALESCE(v_t.commission_rate, 0);
  v_admin_rate := v_rate;

  v_gross := COALESCE(v_entry.tickets_count, 0) * COALESCE(v_t.ticket_price, 0);
  v_admin_amount := v_gross * v_admin_rate / 100.0;
  v_pool_amount := v_gross - v_admin_amount;

  INSERT INTO public.tournament_commission_snapshots(
    tournament_id, entry_id, user_id, agent_id, super_id, admin_id,
    gross_amount, commission_rate, commission_base,
    agent_rate, super_rate, agent_amount, super_amount, admin_amount,
    amount_to_pool, currency, commission_model
  ) VALUES (
    p_tournament_id, p_entry_id, v_entry.user_id, v_entry.agent_id, v_entry.super_id, NULL,
    v_gross, v_rate, v_gross,
    v_agent_rate, v_super_rate, v_agent_amount, v_super_amount, v_admin_amount,
    v_pool_amount, COALESCE(v_t.currency, 'IRR'), v_t.commission_model
  )
  ON CONFLICT (tournament_id, entry_id) DO UPDATE
    SET gross_amount    = EXCLUDED.gross_amount,
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
END;
$function$;

-- 4) Commission payout records
CREATE OR REPLACE FUNCTION tournament.fn_commission_payout(
  p_tournament_id uuid,
  p_entry_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = tournament, public
AS $function$
DECLARE
  v_snap public.tournament_commission_snapshots%ROWTYPE;
BEGIN
  SELECT * INTO v_snap
  FROM public.tournament_commission_snapshots
  WHERE tournament_id = p_tournament_id
    AND entry_id = p_entry_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'commission snapshot not found';
  END IF;

  -- Remove existing payouts for idempotency
  DELETE FROM public.tournament_commission_payouts
   WHERE tournament_id = p_tournament_id
     AND entry_id = p_entry_id;

  -- pool
  IF v_snap.amount_to_pool > 0 THEN
    INSERT INTO public.tournament_commission_payouts(
      tournament_id, entry_id, beneficiary_user_id, role, amount, currency, status, created_at
    ) VALUES (
      p_tournament_id, p_entry_id, v_snap.user_id, 'pool', v_snap.amount_to_pool, v_snap.currency, 'pending', now()
    );
  END IF;

  -- admin
  IF v_snap.admin_amount > 0 AND v_snap.admin_id IS NOT NULL THEN
    INSERT INTO public.tournament_commission_payouts(
      tournament_id, entry_id, beneficiary_user_id, role, amount, currency, status, created_at
    ) VALUES (
      p_tournament_id, p_entry_id, v_snap.admin_id, 'admin', v_snap.admin_amount, v_snap.currency, 'pending', now()
    );
  END IF;

  -- agent
  IF v_snap.agent_amount > 0 AND v_snap.agent_id IS NOT NULL THEN
    INSERT INTO public.tournament_commission_payouts(
      tournament_id, entry_id, beneficiary_user_id, role, amount, currency, status, created_at
    ) VALUES (
      p_tournament_id, p_entry_id, v_snap.agent_id, 'agent', v_snap.agent_amount, v_snap.currency, 'pending', now()
    );
  END IF;

  -- super
  IF v_snap.super_amount > 0 AND v_snap.super_id IS NOT NULL THEN
    INSERT INTO public.tournament_commission_payouts(
      tournament_id, entry_id, beneficiary_user_id, role, amount, currency, status, created_at
    ) VALUES (
      p_tournament_id, p_entry_id, v_snap.super_id, 'super', v_snap.super_amount, v_snap.currency, 'pending', now()
    );
  END IF;
END;
$function$;

COMMIT;

