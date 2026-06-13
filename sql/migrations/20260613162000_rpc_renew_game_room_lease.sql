-- Phase 2: renew an existing engine loop lease (heartbeat from the owner).
BEGIN;

CREATE OR REPLACE FUNCTION public.rpc_renew_game_room_lease(
  p_room_id uuid,
  p_owner_id text,
  p_lease_seconds integer DEFAULT 30
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_now timestamptz := now();
  v_lease integer := GREATEST(COALESCE(p_lease_seconds, 30), 1);
  v_updated integer;
BEGIN
  UPDATE public.rooms
     SET engine_lease_until = v_now + make_interval(secs => v_lease),
         updated_at         = v_now
   WHERE id = p_room_id
     AND status = 'playing'::public.room_status
     AND engine_owner_id = p_owner_id;

  GET DIAGNOSTICS v_updated = ROW_COUNT;
  RETURN v_updated > 0;
END;
$function$;

ALTER FUNCTION public.rpc_renew_game_room_lease(uuid, text, integer) OWNER TO postgres;
GRANT EXECUTE ON FUNCTION public.rpc_renew_game_room_lease(uuid, text, integer) TO service_role;

COMMIT;
