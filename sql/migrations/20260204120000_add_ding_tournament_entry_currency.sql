BEGIN;

-- Ding balances: add locked_amount for tournament holds
ALTER TABLE public.ding_balances
  ADD COLUMN IF NOT EXISTS locked_amount bigint NOT NULL DEFAULT 0;

UPDATE public.ding_balances
  SET locked_amount = 0
WHERE locked_amount IS NULL;

-- Admin create tournament: store entry_currency in meta + enforce Ding guarantee
CREATE OR REPLACE FUNCTION tournament.fn_admin_create_tournament(p_payload jsonb)
RETURNS tournaments
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'tournament', 'public', 'pg_temp'
AS $function$
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

  IF v_entry_currency NOT IN ('IRR','DING') THEN
    RAISE EXCEPTION 'entry_currency must be IRR or DING';
  END IF;

  IF v_entry_currency = 'DING' AND (v_guaranteed IS NULL OR v_guaranteed <= 0) THEN
    RAISE EXCEPTION 'ding tournaments require guaranteed_prize';
  END IF;

  v_meta := jsonb_strip_nulls(jsonb_build_object(
    'final_winners_count', v_final_winners,
    'min_players_for_guarantee', v_min_players_for_guarantee,
    'entry_currency', v_entry_currency
  ));

  INSERT INTO public.tournaments(
    title,
    status,
    start_at,
    currency,
    ticket_price,
    min_tickets_per_player,
    max_tickets_per_player,
    table_size_mode,
    table_size_fixed,
    table_size_min,
    table_size_max,
    remainder_policy,
    commission_rate,
    guaranteed_prize,
    meta,
    created_at,
    updated_at
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
$function$;

-- Admin update tournament: validate entry_currency + ding guarantee
CREATE OR REPLACE FUNCTION tournament.fn_admin_update_tournament(p_tournament_id uuid, p_patch jsonb)
RETURNS tournaments
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'tournament', 'public', 'pg_temp'
AS $function$
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

  SELECT *
    INTO v_row
  FROM public.tournaments
  WHERE id = p_tournament_id
  FOR UPDATE;

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
$function$;

-- Burn DING locks when tournament finishes
CREATE OR REPLACE FUNCTION tournament.fn_burn_ding_locks(p_tournament_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'tournament', 'public', 'pg_temp'
AS $function$
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
       SET status = 'burned',
           amount = 0,
           captured_at = v_now,
           updated_at = v_now,
           meta = COALESCE(meta,'{}'::jsonb) || jsonb_build_object('burned_at', v_now)
     WHERE id = r_lock.id;
  END LOOP;

  RETURN;
END;
$function$;

-- Tournament join hold: support DING entry currency
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
    -- lock wallet row
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
  ON CONFLICT (tournament_id, idempotency_key)
  WHERE (idempotency_key IS NOT NULL)
  DO UPDATE
    SET amount     = public.tournament_locks.amount + EXCLUDED.amount,
        wallet_id  = EXCLUDED.wallet_id,
        status     = 'held',
        updated_at = v_now,
        meta       = COALESCE(public.tournament_locks.meta,'{}'::jsonb)
                     || jsonb_build_object('last_tx_id', v_tx, 'last_add_amount', v_amount);

  RETURN v_tx;
END;
$function$;

-- Tournament join release: support DING entry currency
CREATE OR REPLACE FUNCTION public.fn_tournament_wallet_release(
  p_tournament_id uuid,
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

  SELECT t.status INTO v_status
  FROM public.tournaments t
  WHERE t.id = p_tournament_id;

  IF v_status IS NULL THEN
    RAISE EXCEPTION 'tournament not found: %', p_tournament_id;
  END IF;

  IF v_status <> 'registration_open'::public.tournament_status THEN
    RAISE EXCEPTION 'cancellation only allowed while registration is open';
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
$function$;

-- Commission snapshot: skip for DING tournaments
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
  v_entry_currency text;
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

  v_entry_currency := upper(coalesce(nullif(v_t.meta->>'entry_currency',''), v_t.currency, 'IRR'));
  IF v_entry_currency = 'DING' THEN
    RETURN;
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

-- Payout: ignore entry pool for DING tournaments
CREATE OR REPLACE FUNCTION tournament.fn_payout_tournament(p_tournament_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'tournament', 'public', 'pg_temp'
AS $function$
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
    AND status = 'created';

  SELECT count(distinct user_id)
    INTO v_entries_players
  FROM public.tournament_entries
  WHERE tournament_id = p_tournament_id
    AND status = 'created';

  v_min_players_for_guarantee := nullif(v_t.meta->>'min_players_for_guarantee','')::int;

  IF v_min_players_for_guarantee IS NOT NULL AND v_min_players_for_guarantee > 0
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
$function$;

-- Tournament lifecycle: burn DING locks on finish, skip commissions for DING
CREATE OR REPLACE FUNCTION tournament.fn_manage_tournament_cycle(p_tournament_id uuid, p_seed bigint)
RETURNS void
LANGUAGE plpgsql
AS $function$DECLARE
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
    ELSE
      PERFORM tournament.fn_burn_ding_locks(p_tournament_id);
    END IF;

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
END;$function$;

COMMIT;

