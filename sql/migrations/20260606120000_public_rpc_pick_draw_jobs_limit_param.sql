-- Allow game-engine to pass batch size into draw job pick (hybrid draw-processor).

DROP FUNCTION IF EXISTS public.rpc_pick_draw_jobs();

CREATE OR REPLACE FUNCTION public.rpc_pick_draw_jobs(p_limit integer DEFAULT 100)
RETURNS TABLE(
  id bigint,
  room_id uuid,
  draw_number integer,
  status text,
  attempts integer,
  created_at timestamptz,
  updated_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $$
BEGIN
  RETURN QUERY
  UPDATE public.draw_jobs dj
  SET
    status = 'processing',
    updated_at = NOW()
  WHERE dj.id IN (
    SELECT j.id
    FROM public.draw_jobs j
    WHERE j.status = 'queued'
    ORDER BY j.created_at ASC
    LIMIT GREATEST(p_limit, 1)
    FOR UPDATE SKIP LOCKED
  )
  RETURNING
    dj.id,
    dj.room_id,
    dj.draw_number,
    dj.status,
    dj.attempts,
    dj.created_at,
    dj.updated_at;
END;
$$;

GRANT EXECUTE ON FUNCTION public.rpc_pick_draw_jobs(integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.rpc_pick_draw_jobs(integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_pick_draw_jobs(integer) TO anon;
