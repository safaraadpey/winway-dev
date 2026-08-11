BEGIN;

-- Drop existing function first to change return type
DROP FUNCTION IF EXISTS public.fn_my_active_rooms(uuid);

-- Recreate fn_my_active_rooms with room_type
CREATE FUNCTION public.fn_my_active_rooms(
  p_user_id uuid DEFAULT NULL
)
RETURNS TABLE(
  room_id uuid,
  room_code text,
  status public.room_status,
  card_price numeric,
  currency text,
  card_count bigint,
  prize numeric,
  room_type text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $function$
DECLARE
  v_user uuid;
BEGIN
  IF auth.role() = 'service_role' THEN
    IF p_user_id IS NULL THEN
      RAISE EXCEPTION 'p_user_id required for service role';
    END IF;
    v_user := p_user_id;
  ELSE
    v_user := auth.uid();
    IF v_user IS NULL THEN
      RAISE EXCEPTION 'unauthenticated';
    END IF;
    IF p_user_id IS NOT NULL AND p_user_id <> v_user THEN
      RAISE EXCEPTION 'forbidden';
    END IF;
  END IF;

  RETURN QUERY
  SELECT
    r.id AS room_id,
    r.room_code,
    r.status,
    r.card_price,
    r.currency,
    COUNT(*)::bigint AS card_count,
    (COUNT(*)::numeric * COALESCE(r.card_price, 0)) AS prize,
    COALESCE(rt.room_type, 'normal')::text AS room_type
  FROM public.tickets t
  JOIN public.rooms r ON r.id = t.room_id
  LEFT JOIN public.room_templates rt ON rt.id = r.room_template_id
  WHERE t.player_user_id = v_user
    AND t.reservation_status IN ('reserved', 'confirmed', 'consumed')
    AND r.status IN ('waiting', 'playing', 'live', 'settling')
  GROUP BY r.id, r.room_code, r.status, r.card_price, r.currency, rt.room_type
  ORDER BY r.status;
END;
$function$;

COMMIT;

