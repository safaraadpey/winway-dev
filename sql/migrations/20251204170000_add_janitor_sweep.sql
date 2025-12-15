-- Migration: Add janitor sweep function for stuck rooms
-- Date: 2025-12-04

BEGIN;

CREATE OR REPLACE FUNCTION game_core.fn_janitor_sweep()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_room record;
  v_now timestamptz := now();
  v_consumed_count integer;
  v_cancelable_count integer;
  v_ticket record;
  v_cancelled integer;
  c_cancelable constant public.reservation_status[] := ARRAY['held'::public.reservation_status,'reserved'::public.reservation_status,'confirmed'::public.reservation_status];
BEGIN
  -- ============================================
  -- 1) Stuck WAITING Rooms
  -- ============================================
  FOR v_room IN
    SELECT r.id,
           r.status,
           r.starts_at,
           r.updated_at,
           COALESCE(r.min_players, (r.meta->>'min_players')::int, 2) AS min_players
    FROM public.rooms r
    WHERE r.status = 'waiting'::public.room_status
      AND (
        -- Condition 1: starts_at passed by more than 1 minute
        (r.starts_at IS NOT NULL AND r.starts_at < v_now - INTERVAL '1 minute')
        OR
        -- Condition 2: enough tickets AND stale updated_at
        (
          (
            SELECT COUNT(DISTINCT t.player_user_id)
            FROM public.tickets t
            WHERE t.room_id = r.id
              AND t.reservation_status IN ('reserved','confirmed')
          ) >= COALESCE(r.min_players, (r.meta->>'min_players')::int, 2)
          AND r.updated_at < v_now - INTERVAL '2 minutes'
        )
      )
    FOR UPDATE SKIP LOCKED
  LOOP
    BEGIN
      RAISE LOG 'janitor: detected stuck WAITING room %, cancelling', v_room.id;
      v_cancelled := game_core.fn_cancel_waiting_rooms(v_room.id, true, NULL);
      RAISE LOG 'janitor: cancelled WAITING room %, result=%', v_room.id, v_cancelled;
    EXCEPTION
      WHEN OTHERS THEN
        RAISE LOG 'janitor: error cancelling WAITING room %: %', v_room.id, SQLERRM;
    END;
  END LOOP;

  -- ============================================
  -- 2) Stuck PLAYING Rooms
  -- ============================================
  FOR v_room IN
    SELECT r.id,
           r.status,
           r.updated_at
    FROM public.rooms r
    WHERE r.status = 'playing'::public.room_status
      AND r.updated_at < v_now - INTERVAL '6 minutes'
    FOR UPDATE SKIP LOCKED
  LOOP
    BEGIN
      -- Check if any consumed tickets exist
      SELECT COUNT(*)
        INTO v_consumed_count
      FROM public.tickets
      WHERE room_id = v_room.id
        AND reservation_status = 'consumed'::public.reservation_status;

      IF v_consumed_count > 0 THEN
        RAISE LOG 'janitor: skipping PLAYING room % (has % consumed tickets, unsafe to cancel)', v_room.id, v_consumed_count;
        CONTINUE;
      END IF;

      -- Safe to cancel: no consumed tickets
      RAISE LOG 'janitor: detected stuck PLAYING room % (no consumed tickets), cancelling', v_room.id;

      -- Release wallet holds for all cancelable tickets
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
            RAISE LOG 'janitor: error releasing wallet for ticket % in room %: %', v_ticket.id, v_room.id, SQLERRM;
        END;
      END LOOP;

      -- Cancel all cancelable tickets
      UPDATE public.tickets
         SET reservation_status = 'cancelled'::public.reservation_status,
             cancelled_at = v_now,
             updated_at = v_now
       WHERE room_id = v_room.id
         AND reservation_status = ANY(c_cancelable);

      GET DIAGNOSTICS v_cancelable_count = ROW_COUNT;

      -- Update room to cancelled
      UPDATE public.rooms
         SET status = 'cancelled'::public.room_status,
             starts_at = NULL,
             ends_at = COALESCE(ends_at, v_now),
             cancelled_at = v_now,
             cancelled_by = NULL,
             cancelled_reason = 'janitor_cancel_stuck_playing',
             updated_at = v_now
       WHERE id = v_room.id;

      RAISE LOG 'janitor: cancelled PLAYING room % (% tickets cancelled)', v_room.id, v_cancelable_count;

    EXCEPTION
      WHEN OTHERS THEN
        RAISE LOG 'janitor: error processing PLAYING room %: %', v_room.id, SQLERRM;
    END;
  END LOOP;

  -- ============================================
  -- 3) Stuck SETTLING Rooms
  -- ============================================
  FOR v_room IN
    SELECT r.id,
           r.status,
           r.updated_at
    FROM public.rooms r
    WHERE r.status = 'settling'::public.room_status
      AND r.updated_at < v_now - INTERVAL '2 minutes'
    FOR UPDATE SKIP LOCKED
  LOOP
    BEGIN
      RAISE LOG 'janitor: detected stuck SETTLING room %, re-settling', v_room.id;
      PERFORM game_finance.fn_finish_room_and_settle(v_room.id);
      RAISE LOG 'janitor: re-settled SETTLING room %', v_room.id;
    EXCEPTION
      WHEN OTHERS THEN
        RAISE LOG 'janitor: error re-settling SETTLING room %: %', v_room.id, SQLERRM;
    END;
  END LOOP;

  RAISE LOG 'janitor: sweep completed at %', v_now;
END;
$$;

ALTER FUNCTION game_core.fn_janitor_sweep() OWNER TO postgres;

COMMENT ON FUNCTION game_core.fn_janitor_sweep() IS
  'Janitor sweep function: detects and handles stuck rooms (WAITING/PLAYING/SETTLING). Called manually by cron.';

COMMIT;
