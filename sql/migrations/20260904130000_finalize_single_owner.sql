-- Phase 2A: single finalize ownership for live actor-owned rooms.
-- Live-actor-owned = playing + engine_owner_id + unexpired engine_lease_until.
-- Only a matching owner_id + lease_epoch may finalize; pick excludes those jobs.

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
  p_actor_finalize_started_at timestamptz DEFAULT NULL,
  p_owner_id text DEFAULT NULL,
  p_lease_epoch bigint DEFAULT NULL
) RETURNS integer
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO public
    AS $$
DECLARE
  v_now timestamptz := now();
  v_rpc_start timestamptz := clock_timestamp();
  v_finalize_ms integer;
  v_credited integer := 0;
  v_room public.rooms%ROWTYPE;
  v_live_actor_owned boolean;
BEGIN
  SELECT * INTO v_room
  FROM public.rooms
  WHERE id = p_room_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN -1;
  END IF;

  v_live_actor_owned :=
    v_room.status = 'playing'::public.room_status
    AND v_room.engine_owner_id IS NOT NULL
    AND v_room.engine_lease_until IS NOT NULL
    AND v_room.engine_lease_until > clock_timestamp();

  IF v_live_actor_owned THEN
    IF p_owner_id IS NULL
       OR p_lease_epoch IS NULL
       OR v_room.engine_owner_id IS DISTINCT FROM p_owner_id
       OR v_room.engine_lease_epoch IS DISTINCT FROM p_lease_epoch THEN
      RETURN -1;
    END IF;
  END IF;

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
$$;

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
    LANGUAGE plpgsql SECURITY DEFINER
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
    INNER JOIN public.rooms r
      ON r.id = j.room_id
    WHERE j.status = 'queued'
      AND NOT (
        r.status = 'playing'::public.room_status
        AND r.engine_owner_id IS NOT NULL
        AND r.engine_lease_until IS NOT NULL
        AND r.engine_lease_until > clock_timestamp()
      )
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

COMMENT ON FUNCTION public.rpc_pick_draw_jobs(integer) IS
  'Claims queued draw_jobs (queued -> processing). Skips live actor-owned playing rooms (active lease). Fair per-room round-robin otherwise.';
