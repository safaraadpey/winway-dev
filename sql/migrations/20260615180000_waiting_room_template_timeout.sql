-- Template-based waiting room timeout (independent of starts_at / countdown extensions).
BEGIN;

-- ---------------------------------------------------------------------------
-- 1) Schema
-- ---------------------------------------------------------------------------
ALTER TABLE public.room_templates
  ADD COLUMN IF NOT EXISTS waiting_timeout_seconds integer;

UPDATE public.room_templates
   SET waiting_timeout_seconds = 120
 WHERE waiting_timeout_seconds IS NULL;

ALTER TABLE public.room_templates
  ALTER COLUMN waiting_timeout_seconds SET DEFAULT 120,
  ALTER COLUMN waiting_timeout_seconds SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'room_templates_waiting_timeout_seconds_check'
  ) THEN
    ALTER TABLE public.room_templates
      ADD CONSTRAINT room_templates_waiting_timeout_seconds_check
      CHECK (waiting_timeout_seconds >= 10);
  END IF;
END $$;

COMMENT ON COLUMN public.room_templates.waiting_timeout_seconds IS
  'Max seconds a waiting room may stay below min_players before janitor force-cancel.';

ALTER TABLE public.rooms
  ADD COLUMN IF NOT EXISTS waiting_started_at timestamptz;

COMMENT ON COLUMN public.rooms.waiting_started_at IS
  'Set once when the room first enters waiting; never reset by countdown extensions.';

-- Backfill existing waiting rooms so janitor can evaluate them immediately.
UPDATE public.rooms r
   SET waiting_started_at = COALESCE(r.waiting_started_at, r.created_at, now())
 WHERE r.status = 'waiting'::public.room_status
   AND r.waiting_started_at IS NULL;

-- ---------------------------------------------------------------------------
-- 2) Stamp waiting_started_at on first entry to waiting (all code paths)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION game_core.trg_rooms_stamp_waiting_started_at()
RETURNS trigger
LANGUAGE plpgsql
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

DROP TRIGGER IF EXISTS trg_rooms_stamp_waiting_started_at ON public.rooms;

CREATE TRIGGER trg_rooms_stamp_waiting_started_at
  BEFORE INSERT OR UPDATE OF status, waiting_started_at
  ON public.rooms
  FOR EACH ROW
  EXECUTE FUNCTION game_core.trg_rooms_stamp_waiting_started_at();

CREATE OR REPLACE FUNCTION game_core.fn_ensure_waiting_started_at(
  p_room uuid,
  p_now timestamptz DEFAULT now()
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public, game_core, game_finance
AS $$
BEGIN
  UPDATE public.rooms
     SET waiting_started_at = p_now
   WHERE id = p_room
     AND status = 'waiting'::public.room_status
     AND waiting_started_at IS NULL;
END;
$$;

ALTER FUNCTION game_core.fn_ensure_waiting_started_at(uuid, timestamptz) OWNER TO postgres;

-- ---------------------------------------------------------------------------
-- 3) System force-cancel (no auth.uid; allows starts_at in the past)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION game_core.fn_force_cancel_waiting_room(
  p_room uuid,
  p_reason text DEFAULT 'system_force_cancel',
  p_now timestamptz DEFAULT now()
) RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public, game_core, game_finance
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

ALTER FUNCTION game_core.fn_force_cancel_waiting_room(uuid, text, timestamptz) OWNER TO postgres;

COMMENT ON FUNCTION game_core.fn_force_cancel_waiting_room(uuid, text, timestamptz) IS
  'System/janitor waiting-room cancel: releases holds and cancels tickets without auth.uid().';

-- ---------------------------------------------------------------------------
-- 4) Janitor: template-based waiting timeout (not starts_at / updated_at)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION game_core.fn_janitor_sweep()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public, game_core, game_finance
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
  -- 1) Waiting rooms below min_players past template waiting_timeout_seconds
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

  -- 2) Stuck PLAYING rooms (unchanged)
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

  -- 3) Stuck SETTLING rooms (unchanged)
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

ALTER FUNCTION game_core.fn_janitor_sweep() OWNER TO postgres;

COMMENT ON FUNCTION game_core.fn_janitor_sweep() IS
  'Janitor sweep: waiting timeout (template-based), stuck playing/settling, draw hygiene.';

-- ---------------------------------------------------------------------------
-- 5) Join paths: stamp waiting_started_at once (trigger + explicit ensure)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION game_core.fn_join_or_create_room_core(
  p_template_id uuid,
  p_card_count integer,
  p_password text
)
RETURNS TABLE(room_id uuid, starts_at timestamp with time zone, ticket_ids uuid[])
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public, game_core, game_finance
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

      INSERT INTO public.rooms(
        id, room_template_id, status,
        card_price, currency, pool_id,
        starts_at, created_by, meta,
        min_players, countdown_sec, max_cards_per_player,
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
          'countdown_sec', v_cd
        ),
        v_min_players, v_cd, v_max_cards_pp,
        v_room_seed, v_room_seed_hash,
        v_now,
        v_now, v_now
      )
      RETURNING id, starts_at INTO v_room, v_starts_at;

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

  room_id := v_room;
  starts_at := v_starts_at;
  ticket_ids := v_ticket_ids;

  RETURN;
END;
$$;

ALTER FUNCTION game_core.fn_join_or_create_room_core(uuid, integer, text) OWNER TO postgres;

CREATE OR REPLACE FUNCTION game_core.fn_system_join_or_create_room(
  p_user_id uuid,
  p_template_id uuid,
  p_card_count integer,
  p_password text
)
RETURNS TABLE(room_id uuid, starts_at timestamp with time zone, ticket_ids uuid[])
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public, game_core, game_finance
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
  IF auth.role() <> 'service_role' THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  IF p_user_id IS NULL OR p_template_id IS NULL OR p_card_count IS NULL OR p_card_count < 1 THEN
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

      INSERT INTO public.rooms(
        id, room_template_id, status,
        card_price, currency, pool_id,
        starts_at, created_by, meta,
        min_players, countdown_sec, max_cards_per_player,
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
          'countdown_sec', v_cd
        ),
        v_min_players, v_cd, v_max_cards_pp,
        v_room_seed, v_room_seed_hash,
        v_now,
        v_now, v_now
      )
      RETURNING id, starts_at INTO v_room, v_starts_at;

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

  IF v_room_seed IS NULL THEN
    SELECT room_seed INTO v_room_seed
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

  room_id := v_room;
  starts_at := v_starts_at;
  ticket_ids := v_ticket_ids;
  RETURN QUERY SELECT room_id, starts_at, ticket_ids;
END;
$$;

ALTER FUNCTION game_core.fn_system_join_or_create_room(uuid, uuid, integer, text) OWNER TO postgres;

-- Legacy shim: keep single implementation in fn_join_or_create_room_core.
CREATE OR REPLACE FUNCTION game_core.fn_join_or_create_room_base(
  p_template_id uuid,
  p_card_count integer,
  p_password text
)
RETURNS TABLE(room_id uuid, starts_at timestamp with time zone, ticket_ids uuid[])
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public, game_core, game_finance
AS $$
BEGIN
  RETURN QUERY
  SELECT c.room_id, c.starts_at, c.ticket_ids
  FROM game_core.fn_join_or_create_room_core(p_template_id, p_card_count, p_password) AS c;
END;
$$;

ALTER FUNCTION game_core.fn_join_or_create_room_base(uuid, integer, text) OWNER TO postgres;

COMMIT;
