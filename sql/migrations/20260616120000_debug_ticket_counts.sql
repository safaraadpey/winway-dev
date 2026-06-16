-- Temporary observability: compare PostgREST .from("tickets") vs raw SQL counts per room.
BEGIN;

CREATE OR REPLACE FUNCTION public.debug_ticket_counts(p_room_id uuid)
RETURNS TABLE(player_user_id uuid, cards bigint)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT t.player_user_id, count(*)::bigint AS cards
  FROM public.tickets t
  WHERE t.room_id = p_room_id
    AND t.reservation_status IN ('reserved', 'confirmed', 'consumed')
  GROUP BY t.player_user_id;
$$;

ALTER FUNCTION public.debug_ticket_counts(uuid) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.debug_ticket_counts(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.debug_ticket_counts(uuid) TO service_role;

COMMIT;
