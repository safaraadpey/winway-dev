-- Room-actor quick wins: owner-insert returns job_id + next_draw_at;
-- finalize stamps actor_evaluate/finalize timing columns.
BEGIN;

DROP FUNCTION IF EXISTS public.rpc_insert_draw_if_ready_owner_guard(
  uuid, integer, timestamptz, text, integer, timestamptz
);

CREATE OR REPLACE FUNCTION public.rpc_insert_draw_if_ready_owner_guard(
  p_room_id uuid,
  p_number integer,
  p_now timestamptz,
  p_owner_id text,
  p_draw_interval_sec integer DEFAULT 1,
  p_actor_due_at timestamptz DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_room public.rooms%ROWTYPE;
  v_interval integer := GREATEST(COALESCE(p_draw_interval_sec, 1), 1);
  v_jitter_ms integer;
  v_insert_started timestamptz := clock_timestamp();
  v_next_draw_at timestamptz;
  v_job_id bigint;
BEGIN
  SELECT * INTO v_room
  FROM public.rooms
  WHERE id = p_room_id
  FOR UPDATE;

  IF NOT FOUND OR v_room.status IS DISTINCT FROM 'playing'::public.room_status THEN
    RETURN jsonb_build_object('outcome', 'not_playing');
  END IF;

  IF v_room.engine_owner_id IS DISTINCT FROM p_owner_id
     OR v_room.engine_lease_until IS NULL
     OR v_room.engine_lease_until <= p_now THEN
    RETURN jsonb_build_object('outcome', 'not_owner');
  END IF;

  IF (SELECT COUNT(*) FROM public.draws d WHERE d.room_id = p_room_id) >= 90 THEN
    RETURN jsonb_build_object('outcome', 'exhausted');
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.draws d
    WHERE d.room_id = p_room_id AND d.processed_at IS NULL
  ) THEN
    RETURN jsonb_build_object('outcome', 'backpressure');
  END IF;

  BEGIN
    INSERT INTO public.draws (
      room_id, number, "timestamp", created_at,
      actor_due_at, actor_insert_started_at, actor_inserted_at
    )
    VALUES (
      p_room_id, p_number, p_now, p_now,
      p_actor_due_at, v_insert_started, clock_timestamp()
    );
  EXCEPTION
    WHEN unique_violation THEN
      RETURN jsonb_build_object('outcome', 'duplicate');
  END;

  v_jitter_ms := public.fn_draw_schedule_jitter_ms(p_room_id);
  v_next_draw_at := p_now
                  + make_interval(secs => v_interval)
                  + (v_jitter_ms * interval '1 millisecond');

  UPDATE public.draws
     SET actor_next_scheduled_at = v_next_draw_at
   WHERE room_id = p_room_id
     AND number = p_number;

  UPDATE public.rooms
     SET next_draw_at = v_next_draw_at,
         engine_lease_until = GREATEST(
           engine_lease_until,
           p_now + interval '30 seconds'
         ),
         updated_at = p_now
   WHERE id = p_room_id;

  SELECT j.id INTO v_job_id
  FROM public.draw_jobs j
  WHERE j.room_id = p_room_id
    AND j.draw_number = p_number
  ORDER BY j.id DESC
  LIMIT 1;

  RETURN jsonb_build_object(
    'outcome', 'inserted',
    'job_id', v_job_id,
    'next_draw_at', v_next_draw_at
  );
END;
$function$;

ALTER FUNCTION public.rpc_insert_draw_if_ready_owner_guard(
  uuid, integer, timestamptz, text, integer, timestamptz
) OWNER TO postgres;

GRANT EXECUTE ON FUNCTION public.rpc_insert_draw_if_ready_owner_guard(
  uuid, integer, timestamptz, text, integer, timestamptz
) TO service_role;

DROP FUNCTION IF EXISTS public.rpc_finalize_engine_draw_job(
  bigint, uuid, integer, jsonb, jsonb, boolean, integer, jsonb, integer, integer,
  timestamptz, timestamptz, timestamptz
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

  v_credited := public.rpc_apply_ding_credits_for_draw(
    p_room_id,
    p_draw_number,
    p_ding_per_card,
    p_credits
  );

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
