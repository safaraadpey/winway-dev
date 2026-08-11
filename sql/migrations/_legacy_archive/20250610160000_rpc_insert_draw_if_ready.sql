-- Atomic room draw insert: lock room row, enforce backpressure, insert draw,
-- advance next_draw_at in one transaction (prevents dual-scheduler races).

CREATE OR REPLACE FUNCTION public.rpc_insert_draw_if_ready(
  p_room_id uuid,
  p_number integer,
  p_now timestamptz,
  p_draw_interval_sec integer DEFAULT 3
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_room public.rooms%ROWTYPE;
  v_interval integer := GREATEST(COALESCE(p_draw_interval_sec, 3), 1);
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

  UPDATE public.rooms
     SET next_draw_at = p_now + make_interval(secs => v_interval),
         updated_at = p_now
   WHERE id = p_room_id;

  RETURN 'inserted';
END;
$function$;

GRANT EXECUTE ON FUNCTION public.rpc_insert_draw_if_ready(
  uuid, integer, timestamptz, integer
) TO service_role;
