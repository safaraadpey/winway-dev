-- Serial auto-buy: join the successor waiting room when the current table starts,
-- even while the player still has tickets in the playing room.

BEGIN;

CREATE OR REPLACE FUNCTION game_core.fn_auto_buy_user_has_tickets_in_room(
  p_user_id uuid,
  p_room_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SET search_path TO public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.tickets t
    WHERE t.room_id = p_room_id
      AND t.player_user_id = p_user_id
      AND t.reservation_status IN (
        'reserved'::public.reservation_status,
        'confirmed'::public.reservation_status,
        'consumed'::public.reservation_status
      )
  );
$$;

CREATE OR REPLACE FUNCTION game_core.fn_auto_buy_serial_next_waiting(
  p_session public.player_auto_buy_sessions
)
RETURNS uuid
LANGUAGE plpgsql
STABLE
SET search_path TO public
AS $$
DECLARE
  v_room_id uuid;
  v_status public.room_status;
BEGIN
  IF NOT p_session.serial_buy_enabled OR p_session.serial_next_room_id IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT r.id, r.status
    INTO v_room_id, v_status
  FROM public.rooms r
  WHERE r.id = p_session.serial_next_room_id
    AND r.room_template_id = p_session.template_id;

  IF v_status = 'waiting'::public.room_status THEN
    RETURN v_room_id;
  END IF;

  RETURN NULL;
END;
$$;

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
  v_serial_next_waiting uuid;
  v_allow_while_active boolean := false;
BEGIN
  SELECT * INTO v_session
  FROM public.player_auto_buy_sessions
  WHERE id = p_session_id
    AND status = 'running'::public.player_auto_buy_status
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  v_serial_next_waiting := game_core.fn_auto_buy_serial_next_waiting(v_session);

  IF v_serial_next_waiting IS NOT NULL THEN
    IF game_core.fn_auto_buy_user_has_tickets_in_room(v_session.user_id, v_serial_next_waiting) THEN
      RETURN NULL;
    END IF;
    v_allow_while_active := true;
    v_target_room := v_serial_next_waiting;
  END IF;

  IF NOT v_allow_while_active
     AND game_core.fn_auto_buy_user_has_active_tickets(v_session.user_id, v_session.template_id) THEN
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

  IF v_target_room IS NULL AND v_session.serial_buy_enabled THEN
    IF v_session.anchor_room_id IS NOT NULL THEN
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
           serial_next_room_id = CASE
             WHEN serial_buy_enabled AND v_serial_next_waiting IS NOT NULL AND v_room_id = v_serial_next_waiting
               THEN NULL
             ELSE serial_next_room_id
           END,
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
      RAISE NOTICE '[AutoBuy] try_join session=% err=%', p_session_id, SQLERRM;
      RAISE;
  END;
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
  v_joined uuid;
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
    BEGIN
      UPDATE public.player_auto_buy_sessions
         SET serial_next_room_id = v_next,
             anchor_room_id = COALESCE(anchor_room_id, p_room),
             updated_at = now()
       WHERE id = r_session.id;

      v_joined := game_core.fn_auto_buy_try_join(r_session.id);

      RAISE NOTICE '[AutoBuy] serial room_started session=% room=% next=% joined=%',
        r_session.id, p_room, v_next, v_joined;
    EXCEPTION
      WHEN OTHERS THEN
        RAISE NOTICE '[AutoBuy] serial room_started session=% room=% err=%',
          r_session.id, p_room, SQLERRM;
    END;
  END LOOP;
END;
$$;

CREATE OR REPLACE FUNCTION public.fn_auto_buy_recover_due()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public, game_core
AS $$
DECLARE
  r_session record;
  v_count integer := 0;
  v_price numeric;
  v_join_cost numeric;
  v_serial_next uuid;
BEGIN
  FOR r_session IN
    SELECT s.*
    FROM public.player_auto_buy_sessions s
    WHERE s.status = 'running'::public.player_auto_buy_status
      AND (
        NOT game_core.fn_auto_buy_user_has_active_tickets(s.user_id, s.template_id)
        OR game_core.fn_auto_buy_serial_next_waiting(s) IS NOT NULL
      )
  LOOP
    BEGIN
      v_serial_next := game_core.fn_auto_buy_serial_next_waiting(r_session);
      IF v_serial_next IS NOT NULL
         AND game_core.fn_auto_buy_user_has_tickets_in_room(r_session.user_id, v_serial_next) THEN
        CONTINUE;
      END IF;

      SELECT price INTO v_price
      FROM public.room_templates
      WHERE id = r_session.template_id
        AND status = 'active'::public.room_template_status;

      IF v_price IS NULL THEN
        CONTINUE;
      END IF;

      v_join_cost := v_price * r_session.card_count;

      IF r_session.fund_remaining >= r_session.profit_target THEN
        PERFORM game_core.fn_auto_buy_finish_session(r_session.id, 'profit_hit'::public.player_auto_buy_status, 'profit_hit');
        v_count := v_count + 1;
        CONTINUE;
      END IF;

      IF r_session.fund_remaining < v_join_cost THEN
        PERFORM game_core.fn_auto_buy_finish_session(r_session.id, 'fund_empty'::public.player_auto_buy_status, 'fund_empty');
        v_count := v_count + 1;
        CONTINUE;
      END IF;

      IF game_core.fn_auto_buy_try_join(r_session.id) IS NOT NULL THEN
        v_count := v_count + 1;
      END IF;
    EXCEPTION
      WHEN OTHERS THEN
        RAISE NOTICE '[AutoBuy] recover_due session=% err=%', r_session.id, SQLERRM;
    END;
  END LOOP;

  RETURN v_count;
END;
$$;

CREATE OR REPLACE FUNCTION public.fn_auto_buy_after_room_finished(p_room uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public, game_core, game_finance
AS $$
DECLARE
  v_template_id uuid;
  r_session record;
  v_lock_session_id uuid;
  v_prize numeric;
  v_price numeric;
  v_join_cost numeric;
BEGIN
  SELECT r.room_template_id INTO v_template_id
  FROM public.rooms r
  WHERE r.id = p_room;

  IF v_template_id IS NULL THEN
    RETURN;
  END IF;

  FOR r_session IN
    SELECT s.*
    FROM public.player_auto_buy_sessions s
    WHERE s.status = 'running'::public.player_auto_buy_status
      AND s.template_id = v_template_id
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
    BEGIN
      v_lock_session_id := NULL;
      INSERT INTO public.player_auto_buy_round_locks (session_id, finished_room_id)
      VALUES (r_session.id, p_room)
      ON CONFLICT DO NOTHING
      RETURNING session_id INTO v_lock_session_id;

      IF v_lock_session_id IS NULL THEN
        CONTINUE;
      END IF;

      SELECT COALESCE(SUM(t.amount), 0)
        INTO v_prize
      FROM public.transactions t
      WHERE t.user_id = r_session.user_id
        AND t.room_id = p_room
        AND t.type = 'win'::public.transaction_type
        AND t.status = 'completed'::public.transaction_status;

      IF v_prize > 0 THEN
        PERFORM game_finance.fn_auto_buy_escrow_wrap_prize(
          r_session.user_id,
          v_prize,
          r_session.currency,
          r_session.id,
          p_room
        );

        UPDATE public.player_auto_buy_sessions
           SET fund_remaining = fund_remaining + v_prize,
               last_finished_room_id = p_room,
               last_room_id = p_room,
               updated_at = now()
         WHERE id = r_session.id;
      ELSE
        UPDATE public.player_auto_buy_sessions
           SET last_finished_room_id = p_room,
               last_room_id = p_room,
               updated_at = now()
         WHERE id = r_session.id;
      END IF;

      SELECT fund_remaining, profit_target, card_count, template_id
        INTO r_session.fund_remaining, r_session.profit_target, r_session.card_count, r_session.template_id
      FROM public.player_auto_buy_sessions
      WHERE id = r_session.id;

      SELECT price INTO v_price
      FROM public.room_templates
      WHERE id = r_session.template_id;

      v_join_cost := COALESCE(v_price, 0) * r_session.card_count;

      IF r_session.fund_remaining >= r_session.profit_target THEN
        PERFORM game_core.fn_auto_buy_finish_session(r_session.id, 'profit_hit'::public.player_auto_buy_status, 'profit_hit');
        CONTINUE;
      END IF;

      IF r_session.fund_remaining < v_join_cost THEN
        PERFORM game_core.fn_auto_buy_finish_session(r_session.id, 'fund_empty'::public.player_auto_buy_status, 'fund_empty');
        CONTINUE;
      END IF;

      PERFORM game_core.fn_auto_buy_try_join(r_session.id);
    EXCEPTION
      WHEN OTHERS THEN
        RAISE NOTICE '[AutoBuy] after_room_finished session=% room=% err=%',
          r_session.id, p_room, SQLERRM;
    END;
  END LOOP;
END;
$$;

REVOKE ALL ON FUNCTION game_core.fn_auto_buy_user_has_tickets_in_room(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION game_core.fn_auto_buy_serial_next_waiting(public.player_auto_buy_sessions) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION game_core.fn_auto_buy_user_has_tickets_in_room(uuid, uuid) TO postgres, service_role;
GRANT EXECUTE ON FUNCTION game_core.fn_auto_buy_serial_next_waiting(public.player_auto_buy_sessions) TO postgres, service_role;

COMMIT;
