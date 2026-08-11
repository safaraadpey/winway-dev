-- Delay tournament start by one hour when registrations are below threshold.
-- Rule: if registration_open tournament reaches start_at with fewer than 3 created entries,
-- push start_at forward by 1 hour instead of moving to running.

CREATE OR REPLACE FUNCTION tournament.fn_tick_due_tournaments()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = tournament, public, pg_temp
AS $$
DECLARE
  v_now timestamptz := now();
  v_due RECORD;
  v_entries_players int;
  v_min_players int := 3;
BEGIN
  FOR v_due IN
    SELECT id
    FROM public.tournaments
    WHERE status = 'registration_open'
      AND start_at IS NOT NULL
      AND start_at <= v_now
  LOOP
    SELECT count(DISTINCT te.user_id)
      INTO v_entries_players
    FROM public.tournament_entries te
    WHERE te.tournament_id = v_due.id
      AND te.status = 'created';

    IF COALESCE(v_entries_players, 0) < v_min_players THEN
      UPDATE public.tournaments
         SET start_at = v_now + interval '1 hour',
             updated_at = v_now
       WHERE id = v_due.id;
      CONTINUE;
    END IF;

    PERFORM tournament.fn_manage_tournament_cycle(v_due.id, NULL);
  END LOOP;
END;
$$;
