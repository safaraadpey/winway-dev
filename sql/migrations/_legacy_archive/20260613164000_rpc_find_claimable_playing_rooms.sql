-- Phase 2: discovery — playing rooms with a free/expired lease, due first.
BEGIN;

CREATE OR REPLACE FUNCTION public.rpc_find_claimable_playing_rooms(
  p_limit integer DEFAULT 100
)
RETURNS TABLE(
  room_id uuid,
  next_draw_at timestamptz,
  engine_owner_id text,
  engine_lease_until timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $function$
  SELECT r.id, r.next_draw_at, r.engine_owner_id, r.engine_lease_until
  FROM public.rooms r
  WHERE r.status = 'playing'::public.room_status
    AND (r.engine_owner_id IS NULL OR r.engine_lease_until IS NULL OR r.engine_lease_until < now())
  ORDER BY r.next_draw_at ASC NULLS FIRST
  LIMIT GREATEST(COALESCE(p_limit, 100), 1);
$function$;

ALTER FUNCTION public.rpc_find_claimable_playing_rooms(integer) OWNER TO postgres;
GRANT EXECUTE ON FUNCTION public.rpc_find_claimable_playing_rooms(integer) TO service_role;

COMMIT;
