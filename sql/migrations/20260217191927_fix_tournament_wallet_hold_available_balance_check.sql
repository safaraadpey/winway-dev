-- Fix: Tournament wallet hold should check available balance (balance - locked_amount)
-- Issue: Player t001 had wallet balance 543695 but got error "insufficient balance (have -114495.00, need 2000.00)"
-- Root cause: Function was checking total balance instead of available balance
-- Date: 2026-02-17

CREATE OR REPLACE FUNCTION public.fn_tournament_wallet_hold(
  p_tournament_id uuid,
  p_qty integer,
  p_currency text,
  p_entry_id uuid DEFAULT NULL::uuid
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'game_finance'
AS $function$
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

  IF v_price IS NULL OR v_price <= 0 THEN
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
      v_user,
      'created'::public.tournament_entry_status,
      p_qty,
      v_amount,
      v_now
    )
    ON CONFLICT (tournament_id, user_id)
    DO UPDATE
      SET status = 'created'::public.tournament_entry_status,
          tickets_count =
            CASE
              WHEN public.tournament_entries.status = 'cancelled'::public.tournament_entry_status
                THEN EXCLUDED.tickets_count
              ELSE public.tournament_entries.tickets_count + EXCLUDED.tickets_count
            END,
          amount =
            CASE
              WHEN public.tournament_entries.status = 'cancelled'::public.tournament_entry_status
                THEN EXCLUDED.amount
              ELSE public.tournament_entries.amount + EXCLUDED.amount
            END
    RETURNING id INTO v_entry_id;

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
  ON CONFLICT (idempotency_key) DO NOTHING;

  RETURN v_entry_id;
END;
$function$;
