-- Temporary production diagnostics for waiting-room lifecycle.
-- Remove after investigation: grep for [waitingRoomScheduler] and [waitingRoomJanitor].

BEGIN;

CREATE OR REPLACE FUNCTION game_core.fn_force_cancel_waiting_room(
  p_room uuid,
  p_reason text DEFAULT 'system_force_cancel',
  p_now timestamptz DEFAULT now()
) RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public, game_core, game_finance
AS $$
DECLARE
  v_room record;
  v_ticket record;
  v_ticket_count integer := 0;
  v_player_count integer := 0;
  v_min_players integer;
  v_timeout_sec integer;
  c_cancelable constant public.reservation_status[] := ARRAY[
    'held'::public.reservation_status,
    'reserved'::public.reservation_status,
    'confirmed'::public.reservation_status
  ];
BEGIN
  IF p_room IS NULL THEN
    RAISE EXCEPTION 'room id is required';
  END IF;

  SELECT r.*,
         COALESCE(rt.waiting_timeout_seconds, 120) AS waiting_timeout_seconds
    INTO v_room
  FROM public.rooms r
  LEFT JOIN public.room_templates rt ON rt.id = r.room_template_id
  WHERE r.id = p_room
  FOR UPDATE OF r;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'room % not found', p_room;
  END IF;

  IF v_room.status = 'cancelled'::public.room_status THEN
    RETURN 0;
  END IF;

  IF v_room.status <> 'waiting'::public.room_status THEN
    RAISE EXCEPTION 'room % is not cancellable (status=%)', p_room, v_room.status;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.tickets
    WHERE room_id = p_room
      AND reservation_status = 'consumed'::public.reservation_status
  ) THEN
    RAISE EXCEPTION 'room % is already live (consumed tickets exist)', p_room;
  END IF;

  SELECT COUNT(DISTINCT t.player_user_id)
    INTO v_player_count
  FROM public.tickets t
  WHERE t.room_id = p_room
    AND t.reservation_status IN ('reserved', 'confirmed');

  v_min_players := COALESCE(
    v_room.min_players,
    (v_room.meta->>'min_players')::int,
    2
  );
  v_timeout_sec := GREATEST(COALESCE(v_room.waiting_timeout_seconds, 120), 10);

  RAISE LOG '[waitingRoomJanitor] %',
    json_build_object(
      'roomId', p_room,
      'waiting_started_at', v_room.waiting_started_at,
      'waiting_timeout_seconds', v_timeout_sec,
      'active_players', v_player_count,
      'min_players', v_min_players,
      'action', 'cancel',
      'reason', p_reason
    )::text;

  FOR v_ticket IN
    SELECT id
    FROM public.tickets
    WHERE room_id = p_room
      AND reservation_status = ANY(c_cancelable)
    FOR UPDATE
  LOOP
    BEGIN
      PERFORM game_finance.fn_wallet_release_join(v_ticket.id);
    EXCEPTION
      WHEN OTHERS THEN
        RAISE LOG 'force_cancel: wallet release failed ticket % room %: %',
          v_ticket.id, p_room, SQLERRM;
    END;
    v_ticket_count := v_ticket_count + 1;
  END LOOP;

  UPDATE public.tickets
     SET reservation_status = 'cancelled'::public.reservation_status,
         cancelled_at = p_now,
         updated_at = p_now
   WHERE room_id = p_room
     AND reservation_status = ANY(c_cancelable);

  UPDATE public.rooms
     SET status = 'cancelled'::public.room_status,
         starts_at = NULL,
         ends_at = COALESCE(ends_at, p_now),
         cancelled_at = p_now,
         cancelled_by = NULL,
         cancelled_reason = p_reason,
         updated_at = p_now
   WHERE id = p_room;

  RAISE LOG 'force_cancel: room % cancelled (% tickets) reason=%',
    p_room, v_ticket_count, p_reason;

  RETURN 1;
END;
$$;

ALTER FUNCTION game_core.fn_force_cancel_waiting_room(uuid, text, timestamptz) OWNER TO postgres;

CREATE OR REPLACE FUNCTION game_core.fn_janitor_sweep()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public, game_core, game_finance
AS $$
DECLARE
  v_room record;
  v_now timestamptz := now();
  v_consumed_count integer;
  v_ticket record;
  v_cancelled integer;
  v_player_count integer;
  v_min_players integer;
  v_timeout_sec integer;
  c_cancelable constant public.reservation_status[] := ARRAY[
    'held'::public.reservation_status,
    'reserved'::public.reservation_status,
    'confirmed'::public.reservation_status
  ];
BEGIN
  -- 1) Waiting rooms below min_players past template waiting_timeout_seconds
  FOR v_room IN
    SELECT r.id,
           r.min_players,
           r.meta,
           r.waiting_started_at,
           r.created_at,
           COALESCE(rt.waiting_timeout_seconds, 120) AS waiting_timeout_seconds
    FROM public.rooms r
    LEFT JOIN public.room_templates rt ON rt.id = r.room_template_id
    WHERE r.status = 'waiting'::public.room_status
      AND COALESCE(r.waiting_started_at, r.created_at) IS NOT NULL
    FOR UPDATE OF r SKIP LOCKED
  LOOP
    SELECT COUNT(DISTINCT t.player_user_id)
      INTO v_player_count
    FROM public.tickets t
    WHERE t.room_id = v_room.id
      AND t.reservation_status IN ('reserved', 'confirmed');

    v_min_players := COALESCE(
      v_room.min_players,
      (v_room.meta->>'min_players')::int,
      2
    );
    v_timeout_sec := GREATEST(COALESCE(v_room.waiting_timeout_seconds, 120), 10);

    IF v_player_count < v_min_players
       AND v_now - COALESCE(v_room.waiting_started_at, v_room.created_at, v_now)
           > make_interval(secs => v_timeout_sec) THEN
      BEGIN
        v_cancelled := game_core.fn_force_cancel_waiting_room(
          v_room.id,
          'janitor_waiting_timeout',
          v_now
        );
        RAISE LOG 'janitor: force-cancelled waiting room % result=%', v_room.id, v_cancelled;
      EXCEPTION
        WHEN OTHERS THEN
          RAISE LOG 'janitor: error force-cancelling WAITING room %: %', v_room.id, SQLERRM;
      END;
    END IF;
  END LOOP;

  -- 2) Stuck PLAYING rooms (unchanged)
  FOR v_room IN
    SELECT r.id
    FROM public.rooms r
    WHERE r.status = 'playing'::public.room_status
      AND r.updated_at < v_now - INTERVAL '6 minutes'
    FOR UPDATE SKIP LOCKED
  LOOP
    BEGIN
      SELECT COUNT(*)
        INTO v_consumed_count
      FROM public.tickets
      WHERE room_id = v_room.id
        AND reservation_status = 'consumed'::public.reservation_status;

      IF v_consumed_count > 0 THEN
        CONTINUE;
      END IF;

      FOR v_ticket IN
        SELECT id
        FROM public.tickets
        WHERE room_id = v_room.id
          AND reservation_status = ANY(c_cancelable)
        FOR UPDATE
      LOOP
        BEGIN
          PERFORM game_finance.fn_wallet_release_join(v_ticket.id);
        EXCEPTION
          WHEN OTHERS THEN
            NULL;
        END;
      END LOOP;

      UPDATE public.tickets
         SET reservation_status = 'cancelled'::public.reservation_status,
             cancelled_at = v_now,
             updated_at = v_now
       WHERE room_id = v_room.id
         AND reservation_status = ANY(c_cancelable);

      UPDATE public.rooms
         SET status = 'cancelled'::public.room_status,
             starts_at = NULL,
             ends_at = COALESCE(ends_at, v_now),
             cancelled_at = v_now,
             cancelled_by = NULL,
             cancelled_reason = 'janitor_cancel_stuck_playing',
             updated_at = v_now
       WHERE id = v_room.id;
    EXCEPTION
      WHEN OTHERS THEN
        RAISE LOG 'janitor: error processing PLAYING room %: %', v_room.id, SQLERRM;
    END;
  END LOOP;

  -- 3) Stuck SETTLING rooms (unchanged)
  FOR v_room IN
    SELECT r.id
    FROM public.rooms r
    WHERE r.status = 'settling'::public.room_status
      AND r.updated_at < v_now - INTERVAL '2 minutes'
    FOR UPDATE SKIP LOCKED
  LOOP
    BEGIN
      PERFORM game_finance.fn_finish_room_and_settle(v_room.id);
    EXCEPTION
      WHEN OTHERS THEN
        RAISE LOG 'janitor: re-settle %: %', v_room.id, SQLERRM;
    END;
  END LOOP;

  PERFORM game_core.fn_requeue_failed_draw_jobs();
  PERFORM game_core.fn_stamp_orphan_draws_on_terminal_rooms();

  FOR v_room IN
    SELECT r.id
    FROM public.rooms r
    WHERE r.status = 'playing'::public.room_status
      AND EXISTS (
        SELECT 1
        FROM public.results res
        WHERE res.room_id = r.id
          AND res.win_type = 'full'
      )
    FOR UPDATE SKIP LOCKED
  LOOP
    BEGIN
      UPDATE public.rooms
         SET status = 'settling'::public.room_status,
             updated_at = v_now
       WHERE id = v_room.id
         AND status = 'playing'::public.room_status;
      PERFORM game_finance.fn_finish_room_and_settle(v_room.id);
    EXCEPTION
      WHEN OTHERS THEN
        RAISE LOG 'janitor: finish full-winner room %: %', v_room.id, SQLERRM;
    END;
  END LOOP;

  RAISE LOG 'janitor: sweep completed at %', v_now;
END;
$$;

ALTER FUNCTION game_core.fn_janitor_sweep() OWNER TO postgres;

COMMENT ON FUNCTION game_core.fn_janitor_sweep() IS
  'Janitor sweep: waiting timeout (template-based), stuck playing/settling, draw hygiene. TEMP waiting-room diagnostics enabled.';

COMMIT;
