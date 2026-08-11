-- Faster game pacing: 7s first-draw delay, 1s draw interval default.
BEGIN;

CREATE OR REPLACE FUNCTION public.rpc_insert_draw_if_ready(
  p_room_id uuid,
  p_number integer,
  p_now timestamptz,
  p_draw_interval_sec integer DEFAULT 1
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_room public.rooms%ROWTYPE;
  v_interval integer := GREATEST(COALESCE(p_draw_interval_sec, 1), 1);
  v_jitter_ms integer;
BEGIN
  SELECT *
    INTO v_room
  FROM public.rooms
  WHERE id = p_room_id
  FOR UPDATE;

  IF NOT FOUND OR v_room.status IS DISTINCT FROM 'playing'::public.room_status THEN
    RETURN 'not_playing';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.draws d
    WHERE d.room_id = p_room_id
      AND d.processed_at IS NULL
  ) THEN
    RETURN 'backpressure';
  END IF;

  BEGIN
    INSERT INTO public.draws (room_id, number, "timestamp", created_at)
    VALUES (p_room_id, p_number, p_now, p_now);
  EXCEPTION
    WHEN unique_violation THEN
      RETURN 'duplicate';
  END;

  v_jitter_ms := public.fn_draw_schedule_jitter_ms(p_room_id);

  UPDATE public.rooms
     SET next_draw_at = p_now
                      + make_interval(secs => v_interval)
                      + (v_jitter_ms * interval '1 millisecond'),
         updated_at = p_now
   WHERE id = p_room_id;

  RETURN 'inserted';
END;
$function$;

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
SET search_path = public, game_core
AS $function$
DECLARE
  r record;
  v_now timestamptz := now();
  v_active_players integer;
  v_draw_interval integer;
  v_first_draw_delay_sec integer := 7;
  v_jitter_ms integer;
BEGIN
  FOR r IN
    SELECT
      rm.id,
      rm.min_players,
      rm.starts_at,
      rm.next_draw_at,
      COALESCE((rm.meta ->> 'draw_interval_sec')::int, 1) AS draw_interval_sec
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

    v_draw_interval := GREATEST(COALESCE(r.draw_interval_sec, 1), 1);
    v_jitter_ms := public.fn_draw_schedule_jitter_ms(r.id);

    UPDATE public.rooms
       SET status       = 'playing',
           next_draw_at = v_now
                        + make_interval(secs => v_first_draw_delay_sec)
                        + (v_jitter_ms * interval '1 millisecond'),
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

UPDATE public.room_templates
   SET draw_interval_sec = 1
 WHERE draw_interval_sec IS DISTINCT FROM 1;

COMMIT;
