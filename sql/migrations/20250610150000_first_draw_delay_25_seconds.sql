-- Align first-draw grace with frontend load time: 25s after waiting countdown ends
-- before the scheduler inserts the first draw (engine TS port uses the same constant).

CREATE OR REPLACE FUNCTION game_core.fn_manage_waiting_rooms(
  p_limit integer DEFAULT 50,
  p_capture boolean DEFAULT false
)
RETURNS TABLE(
  room_id uuid,
  became_live_at timestamptz,
  paid_players integer
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
DECLARE
  r record;
  v_now timestamptz := now();
  v_active_players integer;
  v_draw_interval integer;
  v_first_draw_delay_sec integer := 25;
BEGIN
  FOR r IN
    SELECT
      rm.id,
      rm.min_players,
      rm.starts_at,
      rm.next_draw_at,
      COALESCE((rm.meta ->> 'draw_interval_sec')::int, 3) AS draw_interval_sec
    FROM public.rooms rm
    WHERE rm.status = 'waiting'
      AND rm.starts_at IS NOT NULL
      AND v_now >= rm.starts_at
      AND (
        SELECT COUNT(DISTINCT t.player_user_id)
        FROM public.tickets t
        WHERE t.room_id = rm.id
          AND t.reservation_status IN ('reserved','confirmed')
      ) >= COALESCE(rm.min_players, 1)
    ORDER BY rm.starts_at ASC
    LIMIT p_limit
  LOOP
    SELECT COUNT(DISTINCT t.player_user_id)
      INTO v_active_players
      FROM public.tickets t
      WHERE t.room_id = r.id
        AND t.reservation_status IN ('reserved','confirmed');

    v_draw_interval := GREATEST(COALESCE(r.draw_interval_sec, 3), 1);

    UPDATE public.rooms
       SET status       = 'playing',
           next_draw_at = v_now + make_interval(secs => v_first_draw_delay_sec),
           updated_at   = v_now
     WHERE id = r.id
       AND status = 'waiting';

    room_id        := r.id;
    became_live_at := v_now;
    paid_players   := COALESCE(v_active_players, 0);
    RETURN NEXT;
  END LOOP;

  FOR r IN
    SELECT
      rm.id,
      rm.countdown_sec
    FROM public.rooms rm
    WHERE rm.status = 'waiting'
      AND rm.starts_at IS NOT NULL
      AND v_now >= rm.starts_at
      AND (
        SELECT COUNT(DISTINCT t.player_user_id)
        FROM public.tickets t
        WHERE t.room_id = rm.id
          AND t.reservation_status IN ('reserved','confirmed')
      ) < COALESCE(rm.min_players, 1)
    ORDER BY rm.starts_at ASC
    LIMIT p_limit
  LOOP
    UPDATE public.rooms r2
       SET starts_at = v_now + make_interval(secs => COALESCE(r.countdown_sec, 120)),
           updated_at = v_now
     WHERE r2.id = r.id
       AND r2.status = 'waiting';
  END LOOP;

  IF p_capture THEN
    RAISE NOTICE 'wallet capture is disabled during Stage 1';
  END IF;

  RETURN;
END;
$function$;
