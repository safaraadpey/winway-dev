-- Leo processor: at most one round_join per template_id per pick batch.

BEGIN;

CREATE OR REPLACE FUNCTION public.fn_pick_leo_execution_queue(p_limit integer DEFAULT 20)
RETURNS SETOF public.leo_execution_queue
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  WITH due AS (
    SELECT q.id, q.event_type, q.template_id, q.scheduled_at
      FROM public.leo_execution_queue q
     WHERE q.status = 'pending'
       AND q.scheduled_at <= now()
     ORDER BY q.scheduled_at ASC
     LIMIT GREATEST(p_limit * 10, 200)
       FOR UPDATE OF q SKIP LOCKED
  ),
  round_join_pick AS (
    SELECT DISTINCT ON (d.template_id) d.id
      FROM due d
     WHERE d.event_type = 'round_join'
       AND d.template_id IS NOT NULL
     ORDER BY d.template_id, d.scheduled_at ASC
  ),
  other_pick AS (
    SELECT d.id
      FROM due d
     WHERE d.event_type <> 'round_join'
        OR d.template_id IS NULL
     ORDER BY d.scheduled_at ASC
     LIMIT GREATEST(1, LEAST(p_limit, 200))
  ),
  picked AS (
    SELECT id FROM round_join_pick
    UNION
    SELECT id FROM other_pick
  )
  UPDATE public.leo_execution_queue q
     SET status = 'processing',
         updated_at = now()
    FROM picked p
   WHERE q.id = p.id
  RETURNING q.*;
END;
$$;

COMMIT;
