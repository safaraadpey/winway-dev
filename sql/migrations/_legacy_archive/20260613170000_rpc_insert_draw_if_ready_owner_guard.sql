-- Phase 4 (room-actor game loop): owner-guarded draw insert.
-- Like rpc_insert_draw_if_ready, but only the room's lease owner may insert,
-- and the actor_* timing columns + next_draw_at are stamped in one transaction.
BEGIN;

CREATE OR REPLACE FUNCTION public.rpc_insert_draw_if_ready_owner_guard(
  p_room_id uuid,
  p_number integer,
  p_now timestamptz,
  p_owner_id text,
  p_draw_interval_sec integer DEFAULT 1,
  p_actor_due_at timestamptz DEFAULT NULL
)
RETURNS text
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
BEGIN
  SELECT * INTO v_room
  FROM public.rooms
  WHERE id = p_room_id
  FOR UPDATE;

  IF NOT FOUND OR v_room.status IS DISTINCT FROM 'playing'::public.room_status THEN
    RETURN 'not_playing';
  END IF;

  -- Single-owner guarantee: caller must hold a live lease.
  IF v_room.engine_owner_id IS DISTINCT FROM p_owner_id
     OR v_room.engine_lease_until IS NULL
     OR v_room.engine_lease_until <= p_now THEN
    RETURN 'not_owner';
  END IF;

  -- All 90 balls drawn → nothing left to insert.
  IF (SELECT COUNT(*) FROM public.draws d WHERE d.room_id = p_room_id) >= 90 THEN
    RETURN 'exhausted';
  END IF;

  -- Backpressure: never insert ahead of an unprocessed draw (ordering safety).
  IF EXISTS (
    SELECT 1 FROM public.draws d
    WHERE d.room_id = p_room_id AND d.processed_at IS NULL
  ) THEN
    RETURN 'backpressure';
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
      RETURN 'duplicate';
  END;

  v_jitter_ms := public.fn_draw_schedule_jitter_ms(p_room_id);
  v_next_draw_at := p_now
                  + make_interval(secs => v_interval)
                  + (v_jitter_ms * interval '1 millisecond');

  UPDATE public.draws
     SET actor_next_scheduled_at = v_next_draw_at
   WHERE room_id = p_room_id
     AND number = p_number;

  -- Advance the clock AND renew the lease in the same transaction (keeps the
  -- actor owning the room without a separate renew round-trip).
  UPDATE public.rooms
     SET next_draw_at = v_next_draw_at,
         engine_lease_until = GREATEST(
           engine_lease_until,
           p_now + interval '30 seconds'
         ),
         updated_at = p_now
   WHERE id = p_room_id;

  RETURN 'inserted';
END;
$function$;

ALTER FUNCTION public.rpc_insert_draw_if_ready_owner_guard(
  uuid, integer, timestamptz, text, integer, timestamptz
) OWNER TO postgres;

GRANT EXECUTE ON FUNCTION public.rpc_insert_draw_if_ready_owner_guard(
  uuid, integer, timestamptz, text, integer, timestamptz
) TO service_role;

COMMIT;
