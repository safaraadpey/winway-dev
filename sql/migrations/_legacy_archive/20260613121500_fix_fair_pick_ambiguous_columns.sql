-- Fix ambiguous column references in fair pick ORDER BY (created_at, id).
BEGIN;

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
  WITH ranked AS (
    SELECT
      j.id,
      j.created_at,
      d.timestamp AS draw_ts,
      ROW_NUMBER() OVER (
        PARTITION BY j.room_id
        ORDER BY d.timestamp ASC, j.created_at ASC, j.id ASC
      ) AS round_num
    FROM public.draw_jobs j
    INNER JOIN public.draws d
      ON d.room_id = j.room_id
     AND d.number = j.draw_number
    WHERE j.status = 'queued'
  ),
  fair_candidates AS (
    SELECT ranked.id
    FROM ranked
    ORDER BY ranked.round_num ASC, ranked.created_at ASC, ranked.draw_ts ASC, ranked.id ASC
    LIMIT GREATEST(COALESCE(p_limit, 100), 1)
  )
  UPDATE public.draw_jobs dj
  SET
    status = 'processing',
    updated_at = NOW()
  WHERE dj.id IN (
    SELECT j.id
    FROM public.draw_jobs j
    INNER JOIN fair_candidates fc ON fc.id = j.id
    WHERE j.status = 'queued'
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

COMMIT;
