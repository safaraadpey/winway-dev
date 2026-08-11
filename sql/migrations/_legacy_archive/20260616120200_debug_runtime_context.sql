-- Temporary observability: DB/runtime context for active_cards debugging.
BEGIN;

CREATE OR REPLACE FUNCTION public.debug_runtime_context(p_room_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  result jsonb;
BEGIN
  SELECT jsonb_build_object(
    'current_database', current_database(),
    'current_schema', current_schema(),
    'current_user', current_user,
    'session_user', session_user,
    'jwt_role', current_setting('request.jwt.claim.role', true),
    'jwt_sub', current_setting('request.jwt.claim.sub', true),
    'server_addr', inet_server_addr(),
    'server_port', inet_server_port(),
    'room_count', (
      SELECT count(*)
      FROM public.tickets
      WHERE room_id = p_room_id
        AND reservation_status IN ('reserved', 'confirmed', 'consumed')
    ),
    'room_rows', (
      SELECT jsonb_agg(jsonb_build_object(
        'id', id,
        'player_user_id', player_user_id,
        'reservation_status', reservation_status,
        'created_at', created_at
      ) ORDER BY created_at)
      FROM public.tickets
      WHERE room_id = p_room_id
        AND reservation_status IN ('reserved', 'confirmed', 'consumed')
    ),
    'total_tickets', (
      SELECT count(*)
      FROM public.tickets
    )
  )
  INTO result;

  RETURN result;
END;
$$;

ALTER FUNCTION public.debug_runtime_context(uuid) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.debug_runtime_context(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.debug_runtime_context(uuid) TO service_role;

COMMIT;
