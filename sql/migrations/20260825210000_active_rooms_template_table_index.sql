-- Active-game chips: show template table ordinal (500هزار/1).
-- template_table_index is 1-based among currently active rooms of the same template.

BEGIN;

DROP FUNCTION IF EXISTS public.fn_my_active_rooms(uuid);

CREATE FUNCTION public.fn_my_active_rooms(p_user_id uuid DEFAULT NULL)
RETURNS TABLE(
  room_id uuid,
  room_code text,
  status public.room_status,
  card_price numeric,
  currency text,
  card_count bigint,
  prize numeric,
  room_type text,
  template_id uuid,
  template_table_index integer
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
  WITH player_rooms AS (
    SELECT
      r.id AS room_id,
      r.room_code,
      r.status,
      r.card_price,
      r.currency,
      COUNT(*)::bigint AS card_count,
      (COUNT(*)::numeric * COALESCE(r.card_price, 0)) AS prize,
      COALESCE(rt.room_type, 'normal')::text AS room_type,
      r.room_template_id AS template_id,
      r.created_at
    FROM public.tickets t
    JOIN public.rooms r ON r.id = t.room_id
    LEFT JOIN public.room_templates rt ON rt.id = r.room_template_id
    WHERE t.player_user_id = v_user
      AND t.reservation_status IN ('reserved', 'confirmed', 'consumed')
      AND r.status IN ('waiting', 'playing', 'live', 'settling')
    GROUP BY
      r.id,
      r.room_code,
      r.status,
      r.card_price,
      r.currency,
      rt.room_type,
      r.room_template_id,
      r.created_at
  )
  SELECT
    pr.room_id,
    pr.room_code,
    pr.status,
    pr.card_price,
    pr.currency,
    pr.card_count,
    pr.prize,
    pr.room_type,
    pr.template_id,
    (
      SELECT COUNT(*)::integer
      FROM public.rooms sib
      WHERE sib.status IN ('waiting', 'playing', 'live', 'settling')
        AND sib.room_template_id IS NOT DISTINCT FROM pr.template_id
        AND (sib.created_at, sib.id) <= (pr.created_at, pr.room_id)
    ) AS template_table_index
  FROM player_rooms pr
  ORDER BY pr.status;
END;
$function$;

COMMENT ON FUNCTION public.fn_my_active_rooms(uuid) IS
  'Player active rooms snapshot. template_table_index is 1-based among live rooms of the same template.';

GRANT ALL ON FUNCTION public.fn_my_active_rooms(uuid) TO anon;
GRANT ALL ON FUNCTION public.fn_my_active_rooms(uuid) TO authenticated;
GRANT ALL ON FUNCTION public.fn_my_active_rooms(uuid) TO service_role;

COMMIT;
