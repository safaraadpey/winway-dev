-- Fix draw ordering: use insert timestamp, not ball value (1-90).
BEGIN;

CREATE OR REPLACE FUNCTION public.rpc_has_earlier_unprocessed_draw(
  p_room_id uuid,
  p_draw_number integer
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM draws earlier
    JOIN draws current
      ON current.room_id = earlier.room_id
     AND current.number = p_draw_number
    WHERE earlier.room_id = p_room_id
      AND earlier.processed_at IS NULL
      AND earlier.timestamp < current.timestamp
  );
$$;

GRANT EXECUTE ON FUNCTION public.rpc_has_earlier_unprocessed_draw(uuid, integer)
  TO service_role;

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
    JOIN public.draws d
      ON d.room_id = j.room_id
     AND d.number = j.draw_number
    WHERE j.status = 'queued'
    ORDER BY d.timestamp ASC, j.created_at ASC
    LIMIT GREATEST(p_limit, 1)
    FOR UPDATE OF j SKIP LOCKED
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

COMMIT;
