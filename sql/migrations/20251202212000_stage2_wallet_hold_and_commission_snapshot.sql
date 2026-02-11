-- Migration: Stage 2 wallet hold & commission snapshot
-- Date: 2025-12-02

BEGIN;

-- Extend transaction_type enum with hold/refund/capture events
ALTER TYPE public.transaction_type ADD VALUE IF NOT EXISTS 'join_hold';
ALTER TYPE public.transaction_type ADD VALUE IF NOT EXISTS 'join_refund';
ALTER TYPE public.transaction_type ADD VALUE IF NOT EXISTS 'join_capture';

-- Add commission tracking columns
ALTER TABLE public.commissions_log
  ADD COLUMN IF NOT EXISTS amount_to_pool numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'pending';

UPDATE public.commissions_log
   SET amount_to_pool = GREATEST(gross_amount - COALESCE(agent_amount,0) - COALESCE(super_amount,0) - COALESCE(admin_amount,0), 0)
 WHERE amount_to_pool = 0;

UPDATE public.commissions_log
   SET status = CASE WHEN distributed_at IS NOT NULL THEN 'settled' ELSE 'pending' END;

-- Wallet hold using unified ledger
CREATE OR REPLACE FUNCTION game_finance.fn_wallet_hold_join(
  p_user uuid,
  p_amount numeric,
  p_currency text,
  p_room uuid,
  p_ticket uuid
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
DECLARE
  v_wallet uuid;
  v_free numeric;
  v_tx uuid;
BEGIN
  IF p_amount <= 0 THEN
    RAISE EXCEPTION 'amount must be positive';
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
$function$;

CREATE OR REPLACE FUNCTION game_finance.fn_wallet_hold_join(
  p_user uuid,
  p_amount numeric,
  p_currency text,
  p_room uuid
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
BEGIN
  RETURN game_finance.fn_wallet_hold_join(p_user, p_amount, p_currency, p_room, NULL);
END;
$function$;

-- Release hold
CREATE OR REPLACE FUNCTION game_finance.fn_wallet_release_join(
  p_user uuid,
  p_amount numeric,
  p_currency text,
  p_room uuid,
  p_ticket uuid
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
DECLARE
  v_wallet uuid;
  v_locked numeric;
  v_tx uuid;
BEGIN
  IF p_amount <= 0 THEN
    RAISE EXCEPTION 'amount must be positive';
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
$function$;

CREATE OR REPLACE FUNCTION game_finance.fn_wallet_release_join(
  p_user uuid,
  p_amount numeric,
  p_currency text,
  p_room uuid
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
BEGIN
  RETURN game_finance.fn_wallet_release_join(p_user, p_amount, p_currency, p_room, NULL);
END;
$function$;

CREATE OR REPLACE FUNCTION game_finance.fn_wallet_release_join(
  p_ticket uuid
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
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
$function$;

-- Capture only unlocks funds (balance already debited at hold time)
CREATE OR REPLACE FUNCTION game_finance.fn_wallet_capture_join(
  p_user uuid,
  p_amount numeric,
  p_currency text,
  p_room uuid,
  p_ticket uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
DECLARE
  v_wallet uuid;
  v_locked numeric;
BEGIN
  IF p_amount <= 0 THEN
    RAISE EXCEPTION 'amount must be positive';
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
$function$;

-- Wallet summary (available == balance)
CREATE OR REPLACE FUNCTION game_finance.fn_wallet_summary(
  p_user uuid,
  p_currency text DEFAULT NULL,
  p_since timestamptz DEFAULT NULL,
  p_room uuid DEFAULT NULL
)
RETURNS TABLE(
  user_id uuid,
  balance numeric,
  locked_amount numeric,
  available numeric,
  inflow_total numeric,
  outflow_total numeric,
  net_total numeric,
  sum_deposit numeric,
  sum_withdraw numeric,
  sum_join numeric,
  sum_bet numeric,
  sum_win numeric,
  sum_refund numeric,
  sum_adj numeric,
  sum_fee_admin numeric,
  sum_fee_agent numeric,
  sum_fee_super numeric,
  last_tx_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
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
$function$;

-- Withdraw uses current balance as free funds
CREATE OR REPLACE FUNCTION game_finance.fn_wallet_withdraw(
  p_user uuid,
  p_amount numeric,
  p_currency text,
  p_desc text DEFAULT 'withdraw'
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
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
$function$;

-- Commission snapshot at join time
CREATE OR REPLACE FUNCTION game_finance.fn_record_ticket_commission(p_ticket uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
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
  v_super_amount := COALESCE(
    CEIL(v_total_comm * GREATEST(v_super_rate - v_agent_rate, 0)),
    0
  );
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
$function$;

-- Disable auto-distribution trigger
CREATE OR REPLACE FUNCTION game_finance.trg_tickets_after_paid()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
BEGIN
  IF TG_OP = 'UPDATE'
     AND NEW.reservation_status = 'consumed'::reservation_status
     AND (OLD.reservation_status IS DISTINCT FROM 'consumed'::reservation_status) THEN
    RAISE LOG 'trg_tickets_after_paid skip distribution for ticket=%; handled during room settle', NEW.id;
  END IF;
  RETURN NEW;
END;
$function$;

-- Update join-or-create flow to invoke hold + commission snapshot
CREATE OR REPLACE FUNCTION game_core.fn_join_or_create_room_core(
  p_template_id uuid,
  p_card_count integer,
  p_password text
)
RETURNS TABLE(room_id uuid, starts_at timestamptz, ticket_ids uuid[])
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
DECLARE
  v_room_seed      bytea;
  v_room_seed_hash char(64);

  v_user           uuid := auth.uid();
  v_price          numeric;
  v_currency       text;
  v_min_players    int;
  v_cd             int;
  v_max_cards_pp   int;
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
BEGIN
  IF p_template_id IS NULL OR p_card_count IS NULL OR p_card_count < 1 THEN
    RAISE EXCEPTION 'invalid input';
  END IF;

  SELECT price,
         currency,
         COALESCE(min_players, 1),
         COALESCE(countdown_sec, 120),
         COALESCE(max_cards_per_player, 999999),
         room_type,
         scheduled_start_time,
         password
    INTO v_price,
         v_currency,
         v_min_players,
         v_cd,
         v_max_cards_pp,
         v_room_type,
         v_sched_time,
         v_required_password
  FROM public.room_templates
  WHERE id = p_template_id;

  IF v_price IS NULL THEN
    RAISE EXCEPTION 'room template not found: %', p_template_id;
  END IF;

  IF v_required_password IS NOT NULL
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
  WHERE r.status = 'waiting'
    AND r.room_template_id = p_template_id
  ORDER BY r.created_at ASC
  LIMIT 1;

  IF v_room IS NULL THEN
    BEGIN
      SELECT seed, seed_hash
        INTO v_room_seed, v_room_seed_hash
      FROM game_core.fn_generate_room_seed();

      INSERT INTO public.rooms AS r(
        id, room_template_id, status,
        card_price, currency, pool_id,
        starts_at, created_by, meta,
        min_players, countdown_sec, max_cards_per_player,
        room_seed, room_seed_hash,
        created_at, updated_at
      )
      VALUES (
        gen_random_uuid(),
        p_template_id,
        'waiting'::room_status,
        v_price, v_currency, v_pool,
        CASE
          WHEN v_room_type = 'tournament'
               AND v_sched_time IS NOT NULL
            THEN (v_now::date + v_sched_time)::timestamptz
          ELSE NULL
        END,
        v_user,
        jsonb_build_object(
          'source','template_snapshot',
          'min_players', v_min_players,
          'countdown_sec', v_cd
        ),
        v_min_players, v_cd, v_max_cards_pp,
        v_room_seed, v_room_seed_hash,
        v_now, v_now
      )
      RETURNING r.id, r.starts_at INTO v_room, v_starts_at;

    EXCEPTION
      WHEN unique_violation THEN
        SELECT r.id, r.starts_at
          INTO v_room, v_starts_at
        FROM public.rooms r
        WHERE r.status = 'waiting'
          AND r.room_template_id = p_template_id
        ORDER BY r.created_at ASC
        LIMIT 1;

        IF v_room IS NULL THEN
          RAISE EXCEPTION 'race detected but no waiting room found';
        END IF;
    END;
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

  IF (
      SELECT COUNT(*)
      FROM public.tickets t_count
      WHERE t_count.room_id = v_room
        AND t_count.player_user_id = v_user
        AND t_count.reservation_status IN ('reserved','confirmed','consumed')
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
            AND t.room_id      = v_room
            AND t.reservation_status IN ('reserved','confirmed','consumed')
       )
     ORDER BY digest(
       encode(v_room_seed, 'hex') || ':' || c.id::text,
       'sha256'
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

    PERFORM game_finance.fn_wallet_hold_join(
      p_user    := v_user,
      p_amount  := v_price,
      p_currency:= v_currency,
      p_room    := v_room,
      p_ticket  := v_ticket_id
    );

    PERFORM game_finance.fn_record_ticket_commission(v_ticket_id);

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

  room_id    := v_room;
  starts_at  := v_starts_at;
  ticket_ids := v_ticket_ids;

  RETURN;
END;
$function$;

CREATE OR REPLACE FUNCTION game_core.fn_join_or_create_room_base(
  p_template_id uuid,
  p_card_count integer,
  p_password text
)
RETURNS TABLE(room_id uuid, starts_at timestamptz, ticket_ids uuid[])
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
DECLARE
  v_room_seed      bytea;
  v_room_seed_hash char(64);

  v_user           uuid := auth.uid();
  v_price          numeric;
  v_currency       text;
  v_min_players    int;
  v_cd             int;
  v_max_cards_pp   int;
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
BEGIN
  IF p_template_id IS NULL OR p_card_count IS NULL OR p_card_count < 1 THEN
    RAISE EXCEPTION 'invalid input';
  END IF;

  SELECT price,
         currency,
         COALESCE(min_players, 1),
         COALESCE(countdown_sec, 120),
         COALESCE(max_cards_per_player, 999999),
         room_type,
         scheduled_start_time,
         password
    INTO v_price,
         v_currency,
         v_min_players,
         v_cd,
         v_max_cards_pp,
         v_room_type,
         v_sched_time,
         v_required_password
  FROM public.room_templates
  WHERE id = p_template_id;

  IF v_price IS NULL THEN
    RAISE EXCEPTION 'room template not found: %', p_template_id;
  END IF;

  IF v_required_password IS NOT NULL
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
    INTO v_room, starts_at
  FROM public.rooms r
  WHERE r.status = 'waiting'
    AND r.room_template_id = p_template_id
  ORDER BY r.created_at ASC
  LIMIT 1;

  IF v_room IS NULL THEN
    BEGIN
      SELECT seed, seed_hash
        INTO v_room_seed, v_room_seed_hash
      FROM game_core.fn_generate_room_seed();

      INSERT INTO public.rooms(
        id, room_template_id, status,
        card_price, currency, pool_id,
        starts_at, created_by, meta,
        min_players, countdown_sec, max_cards_per_player,
        room_seed, room_seed_hash,
        created_at, updated_at
      )
      VALUES (
        gen_random_uuid(),
        p_template_id,
        'waiting'::room_status,
        v_price, v_currency, v_pool,
        CASE
          WHEN v_room_type = 'tournament'
               AND v_sched_time IS NOT NULL
            THEN (v_now::date + v_sched_time)::timestamptz
          ELSE NULL
        END,
        v_user,
        jsonb_build_object(
          'source','template_snapshot',
          'min_players', v_min_players,
          'countdown_sec', v_cd
        ),
        v_min_players, v_cd, v_max_cards_pp,
        v_room_seed, v_room_seed_hash,
        v_now, v_now
      )
      RETURNING id, starts_at INTO v_room, starts_at;

    EXCEPTION
      WHEN unique_violation THEN
        SELECT r.id, r.starts_at
          INTO v_room, starts_at
        FROM public.rooms r
        WHERE r.status = 'waiting'
          AND r.room_template_id = p_template_id
        ORDER BY r.created_at ASC
        LIMIT 1;

        IF v_room IS NULL THEN
          RAISE EXCEPTION 'race detected but no waiting room found';
        END IF;
    END;
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

  IF (
      SELECT COUNT(*)
      FROM public.tickets t_count
      WHERE t_count.room_id = v_room
        AND t_count.player_user_id = v_user
        AND t_count.reservation_status IN ('reserved','confirmed','consumed')
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
            AND t.room_id      = v_room
            AND t.reservation_status IN ('reserved','confirmed','consumed')
       )
     ORDER BY digest(
       encode(v_room_seed, 'hex') || ':' || c.id::text,
       'sha256'
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

    PERFORM game_finance.fn_wallet_hold_join(
      p_user    := v_user,
      p_amount  := v_price,
      p_currency:= v_currency,
      p_room    := v_room,
      p_ticket  := v_ticket_id
    );

    PERFORM game_finance.fn_record_ticket_commission(v_ticket_id);

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
   WHERE r.id = v_room;

  room_id    := v_room;
  SELECT r.starts_at INTO starts_at FROM public.rooms r WHERE r.id = v_room;
  ticket_ids := v_ticket_ids;

  RETURN;
END;
$function$;

COMMIT;
