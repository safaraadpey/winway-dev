-- Migration: tournament wallet hold/release (mirror of room join hold/release)
-- Date: 2025-12-31

BEGIN;

-- Public wrapper so PostgREST/Supabase rpc can expose it (auth.uid() enforced)
CREATE OR REPLACE FUNCTION public.fn_tournament_wallet_hold(
  p_tournament_id uuid,
  p_amount numeric,
  p_currency text,
  p_entry_id uuid DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, game_finance
AS $function$
DECLARE
  v_user uuid;
  v_wallet uuid;
  v_free numeric;
  v_tx uuid;
BEGIN
  v_user := auth.uid();
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'unauthenticated';
  END IF;
  IF p_amount <= 0 THEN
    RAISE EXCEPTION 'amount must be positive';
  END IF;

  -- lock wallet row
  SELECT id, balance
    INTO v_wallet, v_free
  FROM public.wallets
  WHERE user_id = v_user
    AND currency = p_currency
  FOR UPDATE;

  IF v_wallet IS NULL THEN
    RAISE EXCEPTION 'wallet not found for user %', v_user;
  END IF;
  IF v_free < p_amount THEN
    RAISE EXCEPTION 'insufficient free balance';
  END IF;

  -- apply delta via unified ledger
  SELECT game_finance.fn_wallet_apply_delta(
           p_user_id          := v_user,
           p_currency         := p_currency,
           p_amount_delta     := -p_amount,
           p_transaction_type := 'join_hold',
           p_source_kind      := 'tournament_join',
           p_source_ref       := p_tournament_id::text,
           p_description      := 'hold for tournament join',
           p_meta             := jsonb_build_object(
                                   'tournament_id', p_tournament_id,
                                   'entry_id', p_entry_id
                                 ),
           p_allow_negative   := false
         )
    INTO v_tx;

  UPDATE public.wallets
     SET locked_amount = locked_amount + p_amount,
         updated_at    = now()
   WHERE id = v_wallet;

  RETURN v_tx;
END;
$function$;

CREATE OR REPLACE FUNCTION public.fn_tournament_wallet_release(
  p_tournament_id uuid,
  p_amount numeric,
  p_currency text,
  p_entry_id uuid DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, game_finance
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
           p_amount_delta     := p_amount,
           p_transaction_type := 'join_refund',
           p_source_kind      := 'tournament_join',
           p_source_ref       := p_tournament_id::text,
           p_description      := 'release tournament join hold',
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

COMMIT;

