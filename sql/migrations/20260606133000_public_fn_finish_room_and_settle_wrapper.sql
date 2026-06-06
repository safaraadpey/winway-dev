-- PostgREST wrapper: game-engine calls settlement via supabase.rpc as service_role.
-- Without this, PostgREST looks for public.fn_finish_room_and_settle and settlement never runs.

CREATE OR REPLACE FUNCTION public.fn_finish_room_and_settle(
  p_room uuid,
  p_admin_user uuid DEFAULT NULL
)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, game_finance, game_core
AS $$
  SELECT game_finance.fn_finish_room_and_settle(p_room, p_admin_user);
$$;

GRANT EXECUTE ON FUNCTION public.fn_finish_room_and_settle(uuid, uuid) TO service_role;
