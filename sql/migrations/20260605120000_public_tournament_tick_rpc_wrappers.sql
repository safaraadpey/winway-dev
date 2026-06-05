-- PostgREST wrappers for game-engine tournament-orchestrator (service_role RPC).

CREATE OR REPLACE FUNCTION public.fn_tick_due_tournaments(
  p_limit integer DEFAULT 50,
  p_seed bigint DEFAULT NULL,
  p_batch_tables integer DEFAULT NULL
)
RETURNS integer
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, tournament
AS $$
  SELECT tournament.fn_tick_due_tournaments(p_limit, p_seed, p_batch_tables);
$$;

CREATE OR REPLACE FUNCTION public.fn_tick_tournament(
  p_tournament_id uuid,
  p_seed bigint DEFAULT NULL,
  p_batch_tables integer[] DEFAULT NULL
)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, tournament
AS $$
  SELECT tournament.fn_tick_tournament(p_tournament_id, p_seed, p_batch_tables);
$$;

GRANT EXECUTE ON FUNCTION public.fn_tick_due_tournaments(integer, bigint, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.fn_tick_tournament(uuid, bigint, integer[]) TO service_role;
