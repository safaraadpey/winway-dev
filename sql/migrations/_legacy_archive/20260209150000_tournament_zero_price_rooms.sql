BEGIN;

-- Tournament templates: ensure price=0 for tournament room templates.
CREATE OR REPLACE FUNCTION tournament.fn_create_or_get_table_template(
  p_tournament_id uuid,
  p_round_no integer,
  p_table_no integer
)
RETURNS TABLE(template_id uuid, template_password text)
LANGUAGE plpgsql
AS $function$
DECLARE
  v_trr_id uuid;
  v_meta jsonb;

  v_existing_template_id uuid;
  v_existing_password text;

  v_template_id uuid;
  v_template_price numeric;
  v_password text;

  v_room_type public.room_type := 'tournament'::public.room_type;
BEGIN
  -- 1) Lock row (idempotency + جلوگیری از race)
  SELECT id, meta, room_template_id
    INTO v_trr_id, v_meta, v_existing_template_id
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

  -- 2) اگر از قبل template ست شده، همان را برگردان
  IF v_existing_template_id IS NOT NULL THEN
    v_existing_password := NULLIF(COALESCE(v_meta->>'template_password',''), '');
    template_id := v_existing_template_id;
    template_password := v_existing_password;
    RETURN NEXT;
    RETURN;
  END IF;

  -- 3) پسورد داخلی (رندوم) - برای retry هم در meta ذخیره می‌شود
  v_password := md5(clock_timestamp()::text || ':' || random()::text || ':' || p_tournament_id::text);

  -- 4) اول تلاش: reuse یک template آزاد
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

    -- For tournament tables, only reuse templates with price=0
    IF v_template_price IS DISTINCT FROM 0 THEN
      v_template_id := NULL;
    END IF;
  END IF;

  -- 5) اگر پیدا نشد: یک template جدید بساز (price=0 برای تورنومنت)
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
      1,
      30,
      999999,
      NULL,
      v_password,
      now(),
      now()
    )
    RETURNING id INTO v_template_id;
  ELSE
    -- اگر reuse کردیم، password این میز را در meta نگه می‌داریم
    NULL;
  END IF;

  -- 6) template را روی trr ذخیره کن + password را در meta ثبت کن
  UPDATE public.tournament_round_rooms
     SET room_template_id = v_template_id,
         meta = COALESCE(meta,'{}'::jsonb) ||
               jsonb_build_object(
                 'template_assigned_at', now(),
                 'template_id', v_template_id,
                 'template_password', v_password,
                 'room_type', v_room_type
               )
   WHERE id = v_trr_id
     AND room_template_id IS NULL;

  template_id := v_template_id;
  template_password := v_password;
  RETURN NEXT;
  RETURN;
END;
$function$;

-- System join: skip wallet hold/commission for tournament templates with price=0.
CREATE OR REPLACE FUNCTION game_core.fn_system_join_or_create_room(
  p_user_id uuid,
  p_template_id uuid,
  p_card_count integer,
  p_password text
)
RETURNS TABLE(room_id uuid, starts_at timestamp with time zone, ticket_ids uuid[])
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'game_core', 'pg_temp'
AS $function$
DECLARE
  v_room_seed      bytea;
  v_room_seed_hash char(64);

  v_user           uuid := p_user_id;

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
  -- سخت‌گیرانه: فقط سیستم
  IF auth.role() <> 'service_role' THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  IF p_user_id IS NULL OR p_template_id IS NULL OR p_card_count IS NULL OR p_card_count < 1 THEN
    RAISE EXCEPTION 'invalid input';
  END IF;

  -- Template snapshot
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

  -- Pool active
  SELECT id
    INTO v_pool
  FROM public.card_pools
  WHERE is_active = true
  ORDER BY created_at DESC
  LIMIT 1;

  IF v_pool IS NULL THEN
    RAISE EXCEPTION 'no active card pool';
  END IF;

  -- Find existing waiting room for this template
  SELECT r.id, r.starts_at
    INTO v_room, v_starts_at
  FROM public.rooms r
  WHERE r.status = 'waiting'::public.room_status
    AND r.room_template_id = p_template_id
  ORDER BY r.created_at ASC
  LIMIT 1;

  -- Create room if needed (once)
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
        'waiting'::public.room_status,
        v_price, v_currency, v_pool,
        CASE
          WHEN v_room_type = 'tournament' AND v_sched_time IS NOT NULL
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
        WHERE r.status = 'waiting'::public.room_status
          AND r.room_template_id = p_template_id
        ORDER BY r.created_at ASC
        LIMIT 1;

        IF v_room IS NULL THEN
          RAISE EXCEPTION 'race detected but no waiting room found';
        END IF;
    END;
  END IF;

  -- Ensure room_seed available (for deterministic card order)
  IF v_room_seed IS NULL THEN
    SELECT room_seed INTO v_room_seed
    FROM public.rooms
    WHERE id = v_room;

    IF v_room_seed IS NULL THEN
      RAISE EXCEPTION 'room % has no room_seed', v_room;
    END IF;
  END IF;

  -- max cards per player guard
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

  -- Pick cards (deterministic by room_seed)
  FOR r_card IN
    SELECT c.id AS pool_card_id, c.card_no
      FROM public.card_pool_cards c
     WHERE c.pool_id = v_pool
       AND (v_room_type = 'tournament' OR c.card_no <= 200)
       AND NOT EXISTS (
         SELECT 1
           FROM public.tickets t
          WHERE t.pool_card_id = c.id
            AND t.room_id      = v_room
            AND t.reservation_status IN ('reserved','confirmed','consumed')
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
        p_user     := v_user,
        p_amount   := v_price,
        p_currency := v_currency,
        p_room     := v_room,
        p_ticket   := v_ticket_id
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

  -- starts_at update policy
  UPDATE public.rooms r
     SET starts_at = CASE
                       WHEN r.starts_at IS NOT NULL THEN r.starts_at
                       ELSE v_now + make_interval(secs => v_cd)
                     END,
         updated_at = v_now
   WHERE r.id = v_room
  RETURNING r.starts_at INTO v_starts_at;

  room_id    := v_room;
  starts_at  := v_starts_at;
  ticket_ids := v_ticket_ids;
  RETURN QUERY SELECT room_id, starts_at, ticket_ids;
END;
$function$;

-- Normal join: also skip wallet hold/commission if tournament template price=0.
CREATE OR REPLACE FUNCTION game_core.fn_join_or_create_room_base(
  p_template_id uuid,
  p_card_count integer,
  p_password text
)
RETURNS TABLE(room_id uuid, starts_at timestamp with time zone, ticket_ids uuid[])
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

    IF NOT (v_room_type = 'tournament'::public.room_type AND COALESCE(v_price, 0) = 0) THEN
      PERFORM game_finance.fn_wallet_hold_join(
        p_user    := v_user,
        p_amount  := v_price,
        p_currency:= v_currency,
        p_room    := v_room,
        p_ticket  := v_ticket_id
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
   WHERE r.id = v_room;

  room_id    := v_room;
  SELECT r.starts_at INTO starts_at FROM public.rooms r WHERE r.id = v_room;
  ticket_ids := v_ticket_ids;

  RETURN;
END;
$function$;

-- Wallet hold/release/capture: allow zero amount (no-op).
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
$function$;

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
$function$;

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
$function$;

COMMIT;

