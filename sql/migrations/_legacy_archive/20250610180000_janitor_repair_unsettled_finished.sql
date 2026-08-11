-- Repair finished rooms where marks show full cards but engine missed full results / payout.
-- Safe to run from pg_cron or game-engine janitor tick.

BEGIN;

CREATE OR REPLACE FUNCTION game_core.fn_janitor_repair_unsettled_finished(p_limit integer DEFAULT 20)
RETURNS TABLE(room_id uuid)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_room record;
  v_last_draw integer;
  v_had_full_before integer;
  v_had_full_after integer;
  v_repaired integer := 0;
BEGIN
  FOR v_room IN
    SELECT r.id
    FROM public.rooms r
    WHERE r.status IN ('finished'::public.room_status, 'settling'::public.room_status)
      AND r.prize_paid_at IS NULL
      AND (SELECT count(*) FROM public.draws d WHERE d.room_id = r.id) >= 89
      AND (
        NOT EXISTS (
          SELECT 1 FROM public.results res
          WHERE res.room_id = r.id AND res.win_type = 'full'
        )
        OR EXISTS (
          SELECT 1 FROM public.results res
          WHERE res.room_id = r.id AND res.win_type = 'full'
        )
      )
    ORDER BY r.updated_at ASC
    LIMIT GREATEST(p_limit, 1)
    FOR UPDATE OF r SKIP LOCKED
  LOOP
    BEGIN
      SELECT d.number
        INTO v_last_draw
      FROM public.draws d
      WHERE d.room_id = v_room.id
      ORDER BY d.created_at DESC
      LIMIT 1;

      IF v_last_draw IS NULL THEN
        CONTINUE;
      END IF;

      IF EXISTS (
        SELECT 1 FROM public.draw_jobs j
        WHERE j.room_id = v_room.id
          AND j.status IN ('queued', 'processing')
        LIMIT 1
      ) THEN
        CONTINUE;
      END IF;

      SELECT count(*) INTO v_had_full_before
      FROM public.results res
      WHERE res.room_id = v_room.id AND res.win_type = 'full';

      PERFORM public.fn_evaluate_room_after_draw(v_room.id, v_last_draw);

      SELECT count(*) INTO v_had_full_after
      FROM public.results res
      WHERE res.room_id = v_room.id AND res.win_type = 'full';

      IF v_had_full_after > v_had_full_before OR v_had_full_after > 0 THEN
        UPDATE public.rooms
        SET status = 'settling'::public.room_status,
            updated_at = now()
        WHERE id = v_room.id
          AND status IN ('finished'::public.room_status, 'settling'::public.room_status);

        PERFORM game_finance.fn_finish_room_and_settle(v_room.id);
      END IF;

      room_id := v_room.id;
      v_repaired := v_repaired + 1;
      RETURN NEXT;
    EXCEPTION
      WHEN OTHERS THEN
        RAISE LOG 'janitor_repair_unsettled_finished: room % failed: %', v_room.id, SQLERRM;
    END;
  END LOOP;

  IF v_repaired > 0 THEN
    RAISE LOG 'janitor_repair_unsettled_finished: repaired % room(s)', v_repaired;
  END IF;
END;
$function$;

CREATE OR REPLACE FUNCTION public.fn_janitor_repair_unsettled_finished(p_limit integer DEFAULT 20)
RETURNS TABLE(room_id uuid)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
BEGIN
  RETURN QUERY SELECT * FROM game_core.fn_janitor_repair_unsettled_finished(p_limit);
END;
$function$;

GRANT EXECUTE ON FUNCTION public.fn_janitor_repair_unsettled_finished(integer) TO service_role;

COMMIT;
