-- Scope serial room-started hook to the same room template as the started room.

BEGIN;

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
  v_template_id uuid;
BEGIN
  IF p_room IS NULL THEN
    RETURN;
  END IF;

  SELECT r.room_template_id
    INTO v_template_id
  FROM public.rooms r
  WHERE r.id = p_room
    AND r.status = 'playing'::public.room_status;

  IF v_template_id IS NULL THEN
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

COMMIT;
