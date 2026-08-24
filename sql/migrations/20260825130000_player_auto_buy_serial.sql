-- Serial auto-buy: stay on the same game-room table chain (successor room on start, rejoin on finish).

BEGIN;

ALTER TABLE public.player_auto_buy_sessions
  ADD COLUMN IF NOT EXISTS serial_buy_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS anchor_room_id uuid REFERENCES public.rooms(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS serial_next_room_id uuid REFERENCES public.rooms(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.player_auto_buy_sessions.serial_buy_enabled IS
  'When true, queue rebuy in the serial successor of the anchor room when a game starts.';
COMMENT ON COLUMN public.player_auto_buy_sessions.anchor_room_id IS
  'Preferred game room / table the player started serial auto-buy from.';
COMMENT ON COLUMN public.player_auto_buy_sessions.serial_next_room_id IS
  'Waiting room pre-assigned when the anchor/current room starts playing; joined after settlement.';

-- Join a specific waiting room (used by auto-buy serial mode).
CREATE OR REPLACE FUNCTION game_core.fn_system_join_room(
  p_user_id uuid,
  p_room_id uuid,
  p_card_count integer,
  p_password text DEFAULT NULL
)
RETURNS TABLE(room_id uuid, starts_at timestamptz, ticket_ids uuid[])
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public, game_core, game_finance
AS $$
DECLARE
  v_room_seed      bytea;
  v_user           uuid := p_user_id;
  v_price          numeric;
  v_currency       text;
  v_min_players    int;
  v_cd             int;
  v_max_cards_pp   int;
  v_max_players    int;
  v_pool           uuid;
  v_room           uuid := p_room_id;
  v_template_id    uuid;
  v_room_type      public.room_type;
  v_required_password text;
  v_taken          int := 0;
  v_ticket_ids     uuid[] := '{}';
  v_ticket_id      uuid;
  r_card           record;
  v_now            timestamptz := now();
  v_starts_at      timestamptz;
  v_active_players int;
  v_user_in_room   boolean;
  v_room_status    public.room_status;
BEGIN
  IF auth.role() <> 'service_role' THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  IF p_user_id IS NULL OR p_room_id IS NULL OR p_card_count IS NULL OR p_card_count < 1 THEN
    RAISE EXCEPTION 'invalid input';
  END IF;

  SELECT r.room_template_id,
         r.status,
         r.card_price,
         r.currency,
         r.pool_id,
         r.room_seed,
         r.starts_at
    INTO v_template_id,
         v_room_status,
         v_price,
         v_currency,
         v_pool,
         v_room_seed,
         v_starts_at
  FROM public.rooms r
  WHERE r.id = v_room
  FOR UPDATE;

  IF v_template_id IS NULL THEN
    RAISE EXCEPTION 'room not found: %', p_room_id;
  END IF;

  IF v_room_status <> 'waiting'::public.room_status THEN
    RAISE EXCEPTION 'room is not waiting';
  END IF;

  SELECT GREATEST(COALESCE(min_players, 2), 2),
         COALESCE(countdown_sec, 120),
         COALESCE(max_cards_per_player, 999999),
         max_players,
         room_type,
         password
    INTO v_min_players,
         v_cd,
         v_max_cards_pp,
         v_max_players,
         v_room_type,
         v_required_password
  FROM public.room_templates
  WHERE id = v_template_id
    AND status = 'active'::public.room_template_status;

  IF v_room_type <> 'tournament'::public.room_type
     AND v_required_password IS NOT NULL
     AND (p_password IS NULL OR p_password <> v_required_password) THEN
    RAISE EXCEPTION 'invalid room password';
  END IF;

  IF v_pool IS NULL THEN
    SELECT id INTO v_pool
    FROM public.card_pools
    WHERE is_active = true
    ORDER BY created_at DESC
    LIMIT 1;
  END IF;

  IF v_pool IS NULL THEN
    RAISE EXCEPTION 'no active card pool';
  END IF;

  PERFORM game_core.fn_ensure_waiting_started_at(v_room, v_now);

  IF v_room_seed IS NULL THEN
    RAISE EXCEPTION 'room % has no room_seed', v_room;
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

CREATE OR REPLACE FUNCTION game_core.fn_auto_buy_get_or_create_serial_successor(
  p_source_room uuid
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public, game_core
AS $$
DECLARE
  v_source record;
  v_successor uuid;
  v_room_seed bytea;
  v_room_seed_hash char(64);
  v_now timestamptz := now();
  v_pool uuid;
BEGIN
  SELECT r.id,
         r.room_template_id,
         r.card_price,
         r.currency,
         r.min_players,
         r.max_players,
         r.countdown_sec,
         r.max_cards_per_player,
         r.meta,
         rt.room_type,
         rt.scheduled_start_time
    INTO v_source
  FROM public.rooms r
  JOIN public.room_templates rt ON rt.id = r.room_template_id
  WHERE r.id = p_source_room;

  IF v_source.id IS NULL THEN
    RETURN NULL;
  END IF;

  v_successor := NULLIF(v_source.meta->>'serial_successor_room_id', '')::uuid;

  IF v_successor IS NOT NULL THEN
    IF EXISTS (
      SELECT 1 FROM public.rooms r2
      WHERE r2.id = v_successor
        AND r2.status = 'waiting'::public.room_status
    ) THEN
      RETURN v_successor;
    END IF;
  END IF;

  SELECT id INTO v_pool
  FROM public.card_pools
  WHERE is_active = true
  ORDER BY created_at DESC
  LIMIT 1;

  IF v_pool IS NULL THEN
    RAISE EXCEPTION 'no active card pool';
  END IF;

  SELECT seed, seed_hash INTO v_room_seed, v_room_seed_hash
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
    v_source.room_template_id,
    'waiting'::public.room_status,
    v_source.card_price,
    v_source.currency,
    v_pool,
    NULL,
    NULL,
    jsonb_build_object(
      'source', 'serial_successor',
      'serial_from_room', p_source_room,
      'min_players', v_source.min_players,
      'max_players', v_source.max_players,
      'countdown_sec', v_source.countdown_sec
    ),
    v_source.min_players,
    v_source.max_players,
    v_source.countdown_sec,
    v_source.max_cards_per_player,
    v_room_seed,
    v_room_seed_hash,
    v_now,
    v_now,
    v_now
  )
  RETURNING ins.id INTO v_successor;

  UPDATE public.rooms
     SET meta = COALESCE(meta, '{}'::jsonb) || jsonb_build_object('serial_successor_room_id', v_successor),
         updated_at = v_now
   WHERE id = p_source_room;

  RETURN v_successor;
END;
$$;

CREATE OR REPLACE FUNCTION public.fn_auto_buy_on_room_started(p_room uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public, game_core
AS $$
DECLARE
  r_session record;
  v_next uuid;
BEGIN
  IF p_room IS NULL THEN
    RETURN;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.rooms r WHERE r.id = p_room AND r.status = 'playing'::public.room_status
  ) THEN
    RETURN;
  END IF;

  v_next := game_core.fn_auto_buy_get_or_create_serial_successor(p_room);

  IF v_next IS NULL THEN
    RETURN;
  END IF;

  FOR r_session IN
    SELECT s.*
    FROM public.player_auto_buy_sessions s
    WHERE s.status = 'running'::public.player_auto_buy_status
      AND s.serial_buy_enabled = true
      AND EXISTS (
        SELECT 1
        FROM public.tickets t
        WHERE t.room_id = p_room
          AND t.player_user_id = s.user_id
          AND t.reservation_status IN (
            'reserved'::public.reservation_status,
            'confirmed'::public.reservation_status,
            'consumed'::public.reservation_status
          )
      )
  LOOP
    UPDATE public.player_auto_buy_sessions
       SET serial_next_room_id = v_next,
           anchor_room_id = COALESCE(anchor_room_id, p_room),
           updated_at = now()
     WHERE id = r_session.id;

    RAISE NOTICE '[AutoBuy] serial queued session=% room=% next=%',
      r_session.id, p_room, v_next;
  END LOOP;
END;
$$;

CREATE OR REPLACE FUNCTION game_core.trg_auto_buy_on_room_started()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $$
BEGIN
  IF OLD.status = 'waiting'::public.room_status
     AND NEW.status = 'playing'::public.room_status THEN
    BEGIN
      PERFORM public.fn_auto_buy_on_room_started(NEW.id);
    EXCEPTION
      WHEN OTHERS THEN
        RAISE NOTICE '[AutoBuy] room_started trigger room=% err=%', NEW.id, SQLERRM;
    END;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_auto_buy_on_room_started ON public.rooms;
CREATE TRIGGER trg_auto_buy_on_room_started
  AFTER UPDATE OF status ON public.rooms
  FOR EACH ROW
  EXECUTE FUNCTION game_core.trg_auto_buy_on_room_started();

CREATE OR REPLACE FUNCTION game_core.fn_auto_buy_try_join(
  p_session_id uuid
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public, game_core, game_finance
AS $$
DECLARE
  v_session public.player_auto_buy_sessions%ROWTYPE;
  v_price numeric;
  v_join_cost numeric;
  v_room_id uuid;
  v_starts_at timestamptz;
  v_ticket_ids uuid[];
  v_target_room uuid;
  v_target_status public.room_status;
BEGIN
  SELECT * INTO v_session
  FROM public.player_auto_buy_sessions
  WHERE id = p_session_id
    AND status = 'running'::public.player_auto_buy_status
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  IF game_core.fn_auto_buy_user_has_active_tickets(v_session.user_id, v_session.template_id) THEN
    RETURN NULL;
  END IF;

  SELECT rt.price, rt.currency
    INTO v_price, v_session.currency
  FROM public.room_templates rt
  WHERE rt.id = v_session.template_id
    AND rt.status = 'active'::public.room_template_status;

  IF v_price IS NULL THEN
    PERFORM game_core.fn_auto_buy_finish_session(p_session_id, 'stopped'::public.player_auto_buy_status, 'template_inactive');
    RETURN NULL;
  END IF;

  v_join_cost := v_price * v_session.card_count;

  IF v_session.fund_remaining < v_join_cost THEN
    PERFORM game_core.fn_auto_buy_finish_session(p_session_id, 'fund_empty'::public.player_auto_buy_status, 'fund_empty');
    RETURN NULL;
  END IF;

  IF v_session.fund_remaining >= v_session.profit_target THEN
    PERFORM game_core.fn_auto_buy_finish_session(p_session_id, 'profit_hit'::public.player_auto_buy_status, 'profit_hit');
    RETURN NULL;
  END IF;

  v_target_room := NULL;

  IF v_session.serial_buy_enabled THEN
    IF v_session.serial_next_room_id IS NOT NULL THEN
      SELECT r.id, r.status
        INTO v_target_room, v_target_status
      FROM public.rooms r
      WHERE r.id = v_session.serial_next_room_id
        AND r.room_template_id = v_session.template_id;

      IF v_target_status IS DISTINCT FROM 'waiting'::public.room_status THEN
        v_target_room := NULL;
      END IF;
    END IF;

    IF v_target_room IS NULL AND v_session.anchor_room_id IS NOT NULL THEN
      SELECT r.id, r.status
        INTO v_target_room, v_target_status
      FROM public.rooms r
      WHERE r.id = v_session.anchor_room_id
        AND r.room_template_id = v_session.template_id;

      IF v_target_status IS DISTINCT FROM 'waiting'::public.room_status THEN
        v_target_room := NULL;
      END IF;
    END IF;
  END IF;

  PERFORM game_finance.fn_auto_buy_escrow_unwrap_for_join(
    v_session.user_id,
    v_join_cost,
    v_session.currency,
    v_session.id
  );

  BEGIN
    IF v_target_room IS NOT NULL THEN
      SELECT j.room_id, j.starts_at, j.ticket_ids
        INTO v_room_id, v_starts_at, v_ticket_ids
      FROM game_core.fn_system_join_room(
        v_session.user_id,
        v_target_room,
        v_session.card_count,
        NULL
      ) AS j
      LIMIT 1;
    ELSE
      SELECT j.room_id, j.starts_at, j.ticket_ids
        INTO v_room_id, v_starts_at, v_ticket_ids
      FROM game_core.fn_system_join_or_create_room(
        v_session.user_id,
        v_session.template_id,
        v_session.card_count,
        NULL
      ) AS j
      LIMIT 1;
    END IF;

    UPDATE public.player_auto_buy_sessions
       SET fund_remaining = fund_remaining - v_join_cost,
           last_room_id = v_room_id,
           anchor_room_id = CASE
             WHEN serial_buy_enabled THEN v_room_id
             ELSE anchor_room_id
           END,
           serial_next_room_id = NULL,
           updated_at = now()
     WHERE id = p_session_id;

    RETURN v_room_id;
  EXCEPTION
    WHEN OTHERS THEN
      PERFORM game_finance.fn_auto_buy_escrow_deposit(
        v_session.user_id,
        v_join_cost,
        v_session.currency,
        v_session.id,
        NULL
      );
      RAISE;
  END;
END;
$$;

DROP FUNCTION IF EXISTS public.fn_player_auto_buy_start(uuid, uuid, numeric, integer, numeric, text, boolean);

CREATE OR REPLACE FUNCTION public.fn_player_auto_buy_start(
  p_user_id uuid,
  p_template_id uuid,
  p_fund numeric,
  p_card_count integer,
  p_profit_target numeric,
  p_idempotency_key text DEFAULT NULL,
  p_skip_first_join boolean DEFAULT false,
  p_serial_buy boolean DEFAULT false,
  p_anchor_room_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public, game_core, game_finance
AS $$
DECLARE
  v_existing public.player_auto_buy_sessions%ROWTYPE;
  v_template record;
  v_session_id uuid;
  v_join_cost numeric;
  v_room_id uuid;
  v_key text;
  v_anchor uuid;
BEGIN
  IF p_user_id IS NULL OR p_template_id IS NULL THEN
    RAISE EXCEPTION 'invalid input';
  END IF;

  IF p_fund IS NULL OR p_fund <= 0 OR p_card_count IS NULL OR p_card_count < 1 THEN
    RAISE EXCEPTION 'invalid fund or card count';
  END IF;

  IF p_profit_target IS NULL OR p_profit_target <= p_fund THEN
    RAISE EXCEPTION 'profit target must exceed fund';
  END IF;

  v_key := NULLIF(btrim(COALESCE(p_idempotency_key, '')), '');
  IF v_key IS NOT NULL THEN
    SELECT * INTO v_existing
    FROM public.player_auto_buy_sessions
    WHERE idempotency_key = v_key;

    IF FOUND THEN
      RETURN jsonb_build_object(
        'session_id', v_existing.id,
        'status', v_existing.status,
        'fund_remaining', v_existing.fund_remaining,
        'profit_target', v_existing.profit_target,
        'card_count', v_existing.card_count,
        'last_room_id', v_existing.last_room_id,
        'serial_buy_enabled', v_existing.serial_buy_enabled,
        'anchor_room_id', v_existing.anchor_room_id,
        'serial_next_room_id', v_existing.serial_next_room_id
      );
    END IF;
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.player_auto_buy_sessions
    WHERE user_id = p_user_id
      AND template_id = p_template_id
      AND status = 'running'::public.player_auto_buy_status
  ) THEN
    RAISE EXCEPTION 'auto_buy session already running for template';
  END IF;

  SELECT rt.id, rt.price, rt.currency, rt.room_type, rt.password, rt.status, rt.max_cards_per_player
    INTO v_template
  FROM public.room_templates rt
  WHERE rt.id = p_template_id;

  IF v_template.id IS NULL OR v_template.status <> 'active'::public.room_template_status THEN
    RAISE EXCEPTION 'template not found or inactive';
  END IF;

  IF v_template.room_type = 'tournament'::public.room_type THEN
    RAISE EXCEPTION 'auto_buy not allowed for tournament rooms';
  END IF;

  IF v_template.password IS NOT NULL AND length(btrim(v_template.password)) > 0 THEN
    RAISE EXCEPTION 'auto_buy not allowed for password rooms';
  END IF;

  v_join_cost := v_template.price * p_card_count;
  IF p_fund < v_join_cost THEN
    RAISE EXCEPTION 'fund must cover at least one round';
  END IF;

  IF p_card_count > COALESCE(v_template.max_cards_per_player, 999999) THEN
    RAISE EXCEPTION 'max_cards_per_player exceeded';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.app_runtime_flags arf
    WHERE arf.id = true
      AND COALESCE(arf.global_registration_locked, false)
  ) THEN
    RAISE EXCEPTION 'global registration locked';
  END IF;

  v_anchor := NULL;
  IF p_serial_buy AND p_anchor_room_id IS NOT NULL THEN
    SELECT r.id INTO v_anchor
    FROM public.rooms r
    WHERE r.id = p_anchor_room_id
      AND r.room_template_id = p_template_id;

    IF v_anchor IS NULL THEN
      RAISE EXCEPTION 'anchor room not found for template';
    END IF;
  END IF;

  INSERT INTO public.player_auto_buy_sessions (
    user_id, template_id, card_count, fund_initial, profit_target,
    fund_remaining, currency, idempotency_key,
    serial_buy_enabled, anchor_room_id
  )
  VALUES (
    p_user_id, p_template_id, p_card_count, p_fund, p_profit_target,
    p_fund, v_template.currency, v_key,
    COALESCE(p_serial_buy, false), v_anchor
  )
  RETURNING id INTO v_session_id;

  PERFORM game_finance.fn_auto_buy_escrow_deposit(
    p_user_id,
    p_fund,
    v_template.currency,
    v_session_id,
    CASE WHEN v_key IS NOT NULL THEN v_key || ':escrow' ELSE NULL END
  );

  IF NOT p_skip_first_join
     AND NOT game_core.fn_auto_buy_user_has_active_tickets(p_user_id, p_template_id) THEN
    v_room_id := game_core.fn_auto_buy_try_join(v_session_id);
  END IF;

  SELECT * INTO v_existing FROM public.player_auto_buy_sessions WHERE id = v_session_id;

  RETURN jsonb_build_object(
    'session_id', v_existing.id,
    'status', v_existing.status,
    'fund_remaining', v_existing.fund_remaining,
    'profit_target', v_existing.profit_target,
    'card_count', v_existing.card_count,
    'fund_initial', v_existing.fund_initial,
    'last_room_id', v_existing.last_room_id,
    'serial_buy_enabled', v_existing.serial_buy_enabled,
    'anchor_room_id', v_existing.anchor_room_id,
    'serial_next_room_id', v_existing.serial_next_room_id
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.fn_player_auto_buy_snapshot(
  p_user_id uuid,
  p_template_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO public
AS $$
DECLARE
  v_session public.player_auto_buy_sessions%ROWTYPE;
BEGIN
  SELECT * INTO v_session
  FROM public.player_auto_buy_sessions s
  WHERE s.user_id = p_user_id
    AND (p_template_id IS NULL OR s.template_id = p_template_id)
  ORDER BY
    CASE WHEN s.status = 'running'::public.player_auto_buy_status THEN 0 ELSE 1 END,
    s.updated_at DESC
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('active', false);
  END IF;

  RETURN jsonb_build_object(
    'active', v_session.status = 'running'::public.player_auto_buy_status,
    'session_id', v_session.id,
    'template_id', v_session.template_id,
    'status', v_session.status,
    'card_count', v_session.card_count,
    'fund_initial', v_session.fund_initial,
    'fund_remaining', v_session.fund_remaining,
    'profit_target', v_session.profit_target,
    'last_room_id', v_session.last_room_id,
    'serial_buy_enabled', v_session.serial_buy_enabled,
    'anchor_room_id', v_session.anchor_room_id,
    'serial_next_room_id', v_session.serial_next_room_id,
    'stop_reason', v_session.stop_reason,
    'started_at', v_session.started_at,
    'stopped_at', v_session.stopped_at
  );
END;
$$;

REVOKE ALL ON FUNCTION game_core.fn_system_join_room(uuid, uuid, integer, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION game_core.fn_auto_buy_get_or_create_serial_successor(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.fn_auto_buy_on_room_started(uuid) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION game_core.fn_system_join_room(uuid, uuid, integer, text) TO postgres, service_role;
GRANT EXECUTE ON FUNCTION game_core.fn_auto_buy_get_or_create_serial_successor(uuid) TO postgres, service_role;
GRANT EXECUTE ON FUNCTION public.fn_auto_buy_on_room_started(uuid) TO postgres, service_role;

REVOKE ALL ON FUNCTION public.fn_player_auto_buy_start(uuid, uuid, numeric, integer, numeric, text, boolean, boolean, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fn_player_auto_buy_start(uuid, uuid, numeric, integer, numeric, text, boolean, boolean, uuid) TO postgres, service_role;

COMMIT;
