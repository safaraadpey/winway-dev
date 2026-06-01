-- Wrapper for game-engine hybrid draw-processor (Supabase RPC expects public schema).

CREATE OR REPLACE FUNCTION public.rpc_pick_draw_jobs()
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
    LIMIT 100
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

GRANT EXECUTE ON FUNCTION public.rpc_pick_draw_jobs() TO service_role;
GRANT EXECUTE ON FUNCTION public.rpc_pick_draw_jobs() TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_pick_draw_jobs() TO anon;
