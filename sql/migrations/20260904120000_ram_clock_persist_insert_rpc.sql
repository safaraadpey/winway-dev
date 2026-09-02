-- RAM Clock + Persist Recorder: owner-guard insert uses Clock timestamps (NOT NULL)
-- and allows up to p_max_unprocessed unprocessed draws before backpressure.

CREATE OR REPLACE FUNCTION public.rpc_insert_draw_if_ready_owner_guard(
  p_room_id uuid,
  p_number integer,
  p_now timestamptz,
  p_owner_id text,
  p_draw_interval_sec integer DEFAULT 3,
  p_actor_due_at timestamptz DEFAULT NULL,
  p_lease_epoch bigint DEFAULT NULL,
  p_next_draw_at timestamptz DEFAULT NULL,
  p_max_unprocessed integer DEFAULT 2
) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO public
    AS $$
DECLARE
  v_room public.rooms%ROWTYPE;
  v_insert_started timestamptz := clock_timestamp();
  v_job_id bigint;
  v_now timestamptz := clock_timestamp();
  v_unprocessed integer;
BEGIN
  IF p_now IS NULL THEN
    RAISE EXCEPTION 'rpc_insert_draw_if_ready_owner_guard: p_now is required';
  END IF;
  IF p_next_draw_at IS NULL THEN
    RAISE EXCEPTION 'rpc_insert_draw_if_ready_owner_guard: p_next_draw_at is required';
  END IF;

  SELECT * INTO v_room
  FROM public.rooms
  WHERE id = p_room_id
  FOR UPDATE;

  IF NOT FOUND OR v_room.status IS DISTINCT FROM 'playing'::public.room_status THEN
    RETURN jsonb_build_object('outcome', 'not_playing');
  END IF;

  IF v_room.engine_owner_id IS DISTINCT FROM p_owner_id
     OR v_room.engine_lease_until IS NULL
     OR v_room.engine_lease_until <= v_now THEN
    RETURN jsonb_build_object('outcome', 'not_owner');
  END IF;

  IF p_lease_epoch IS NOT NULL
     AND v_room.engine_lease_epoch IS DISTINCT FROM p_lease_epoch THEN
    RETURN jsonb_build_object('outcome', 'not_owner');
  END IF;

  IF (SELECT COUNT(*) FROM public.draws d WHERE d.room_id = p_room_id) >= 90 THEN
    RETURN jsonb_build_object('outcome', 'exhausted');
  END IF;

  SELECT COUNT(*)::integer INTO v_unprocessed
  FROM public.draws d
  WHERE d.room_id = p_room_id
    AND d.processed_at IS NULL;

  IF v_unprocessed >= GREATEST(COALESCE(p_max_unprocessed, 2), 1) THEN
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

  UPDATE public.draws
     SET actor_next_scheduled_at = p_next_draw_at
   WHERE room_id = p_room_id
     AND number = p_number;

  UPDATE public.rooms
     SET next_draw_at = p_next_draw_at,
         engine_lease_until = GREATEST(
           engine_lease_until,
           v_now + interval '30 seconds'
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
    'next_draw_at', p_next_draw_at,
    'lease_epoch', v_room.engine_lease_epoch
  );
END;
$$;

-- Drop legacy 7-arg overload (CREATE OR REPLACE adds a new signature, not replace).
DROP FUNCTION IF EXISTS public.rpc_insert_draw_if_ready_owner_guard(
  uuid,
  integer,
  timestamptz,
  text,
  integer,
  timestamptz,
  bigint
);
