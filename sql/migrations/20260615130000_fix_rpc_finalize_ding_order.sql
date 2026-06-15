-- Fix: rpc_apply_ding_credits_for_draw requires draws.processed_at IS NOT NULL.
-- Regressions in 20260612130100+ called ding BEFORE processed_at was set, so every
-- engine draw returned 0 credits and ding_aggregated_at stayed NULL.
-- Restore order from 20260611290000: stamp processed_at first, then apply ding.

BEGIN;

DROP FUNCTION IF EXISTS public.rpc_finalize_engine_draw_job(
  bigint, uuid, integer, jsonb, jsonb, boolean, integer, jsonb, integer, integer,
  timestamptz, timestamptz, timestamptz, timestamptz, timestamptz
);

CREATE OR REPLACE FUNCTION public.rpc_finalize_engine_draw_job(
  p_job_id bigint,
  p_room_id uuid,
  p_draw_number integer,
  p_marks jsonb DEFAULT '[]'::jsonb,
  p_results jsonb DEFAULT '[]'::jsonb,
  p_set_first_line_draw_number boolean DEFAULT false,
  p_ding_per_card integer DEFAULT 0,
  p_credits jsonb DEFAULT '[]'::jsonb,
  p_queue_wait_ms integer DEFAULT NULL,
  p_processing_ms integer DEFAULT NULL,
  p_drain_started_at timestamptz DEFAULT NULL,
  p_first_picked_at timestamptz DEFAULT NULL,
  p_handler_started_at timestamptz DEFAULT NULL,
  p_actor_evaluate_started_at timestamptz DEFAULT NULL,
  p_actor_finalize_started_at timestamptz DEFAULT NULL
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_now timestamptz := now();
  v_rpc_start timestamptz := clock_timestamp();
  v_finalize_ms integer;
  v_credited integer := 0;
BEGIN
  IF jsonb_typeof(p_marks) = 'array' AND jsonb_array_length(p_marks) > 0 THEN
    INSERT INTO marks (ticket_id, value, created_at)
    SELECT
      (elem->>'ticket_id')::uuid,
      (elem->>'value')::integer,
      v_now
    FROM jsonb_array_elements(p_marks) AS elem
    ON CONFLICT (ticket_id, value) DO NOTHING;
  END IF;

  IF jsonb_typeof(p_results) = 'array' AND jsonb_array_length(p_results) > 0 THEN
    INSERT INTO results (room_id, user_id, ticket_id, win_type, draw_number, reward_amount)
    SELECT
      p_room_id,
      (elem->>'user_id')::uuid,
      (elem->>'ticket_id')::uuid,
      elem->>'win_type',
      p_draw_number,
      0
    FROM jsonb_array_elements(p_results) AS elem
    ON CONFLICT (ticket_id, win_type) DO NOTHING;
  END IF;

  IF p_set_first_line_draw_number THEN
    UPDATE rooms
    SET first_line_draw_number = p_draw_number,
        updated_at = v_now
    WHERE id = p_room_id
      AND first_line_draw_number IS NULL;
  END IF;

  UPDATE draw_jobs
  SET status = 'done',
      updated_at = v_now
  WHERE id = p_job_id;

  v_finalize_ms := GREATEST(
    0,
    ROUND(EXTRACT(EPOCH FROM (clock_timestamp() - v_rpc_start)) * 1000)::integer
  );

  PERFORM 1
  FROM draw_jobs
  WHERE room_id = p_room_id
    AND draw_number = p_draw_number
    AND status <> 'done'
  LIMIT 1;

  IF NOT FOUND THEN
    UPDATE draws
    SET processed_at = v_now,
        queue_wait_ms = p_queue_wait_ms,
        processing_ms = p_processing_ms,
        finalize_ms = v_finalize_ms,
        drain_started_at = p_drain_started_at,
        first_picked_at = p_first_picked_at,
        handler_started_at = p_handler_started_at,
        actor_evaluate_started_at = COALESCE(
          p_actor_evaluate_started_at,
          actor_evaluate_started_at
        ),
        actor_finalize_started_at = COALESCE(
          p_actor_finalize_started_at,
          actor_finalize_started_at
        )
    WHERE room_id = p_room_id
      AND number = p_draw_number
      AND processed_at IS NULL;
  END IF;

  v_credited := public.rpc_apply_ding_credits_for_draw(
    p_room_id,
    p_draw_number,
    p_ding_per_card,
    p_credits
  );

  RETURN v_credited;
END;
$function$;

ALTER FUNCTION public.rpc_finalize_engine_draw_job(
  bigint, uuid, integer, jsonb, jsonb, boolean, integer, jsonb, integer, integer,
  timestamptz, timestamptz, timestamptz, timestamptz, timestamptz
) OWNER TO postgres;

GRANT EXECUTE ON FUNCTION public.rpc_finalize_engine_draw_job(
  bigint, uuid, integer, jsonb, jsonb, boolean, integer, jsonb, integer, integer,
  timestamptz, timestamptz, timestamptz, timestamptz, timestamptz
) TO service_role;

COMMIT;
