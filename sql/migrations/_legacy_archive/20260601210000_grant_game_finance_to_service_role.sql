-- game-engine (hybrid) calls public.fn_evaluate_room_after_draw via PostgREST as service_role.
-- Without USAGE on game_finance, full-house settlement fails and the whole draw txn rolls back.

GRANT USAGE ON SCHEMA game_finance TO service_role;
GRANT USAGE ON SCHEMA game_core TO service_role;

GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA game_finance TO service_role;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA game_core TO service_role;

ALTER FUNCTION public.fn_evaluate_room_after_draw(uuid, integer) SECURITY DEFINER;
ALTER FUNCTION public.fn_evaluate_room_after_draw(uuid, integer)
  SET search_path = public, game_finance, game_core;
