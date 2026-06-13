-- Phase 2: claim a playing room's engine loop lease (single-owner guarantee).
BEGIN;

CREATE OR REPLACE FUNCTION public.rpc_claim_game_room(
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
  v_room public.rooms%ROWTYPE;
  v_now timestamptz := now();
  v_lease integer := GREATEST(COALESCE(p_lease_seconds, 30), 1);
BEGIN
  SELECT * INTO v_room
  FROM public.rooms
  WHERE id = p_room_id
  FOR UPDATE;

  IF NOT FOUND OR v_room.status IS DISTINCT FROM 'playing'::public.room_status THEN
    RETURN false;
  END IF;

  -- Claimable when unowned, already ours, or the previous lease expired.
  IF v_room.engine_owner_id IS NOT NULL
     AND v_room.engine_owner_id <> p_owner_id
     AND v_room.engine_lease_until IS NOT NULL
     AND v_room.engine_lease_until > v_now THEN
    RETURN false;
  END IF;

  UPDATE public.rooms
     SET engine_owner_id    = p_owner_id,
         engine_lease_until = v_now + make_interval(secs => v_lease),
         engine_claimed_at  = CASE
                                WHEN engine_owner_id = p_owner_id THEN COALESCE(engine_claimed_at, v_now)
                                ELSE v_now
                              END,
         engine_loop_state  = 'owned',
         updated_at         = v_now
   WHERE id = p_room_id;

  RETURN true;
END;
$function$;

ALTER FUNCTION public.rpc_claim_game_room(uuid, text, integer) OWNER TO postgres;
GRANT EXECUTE ON FUNCTION public.rpc_claim_game_room(uuid, text, integer) TO service_role;

COMMIT;
