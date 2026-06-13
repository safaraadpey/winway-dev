-- Phase 2: release an engine loop lease (graceful handoff / shutdown).
BEGIN;

CREATE OR REPLACE FUNCTION public.rpc_release_game_room(
  p_room_id uuid,
  p_owner_id text
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_now timestamptz := now();
  v_updated integer;
BEGIN
  UPDATE public.rooms
     SET engine_owner_id    = NULL,
         engine_lease_until = NULL,
         engine_loop_state  = 'idle',
         updated_at         = v_now
   WHERE id = p_room_id
     AND engine_owner_id = p_owner_id;

  GET DIAGNOSTICS v_updated = ROW_COUNT;
  RETURN v_updated > 0;
END;
$function$;

ALTER FUNCTION public.rpc_release_game_room(uuid, text) OWNER TO postgres;
GRANT EXECUTE ON FUNCTION public.rpc_release_game_room(uuid, text) TO service_role;

COMMIT;
