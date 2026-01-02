CREATE OR REPLACE FUNCTION tournament.fn_tick_due_tournaments()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = tournament, public, pg_temp
AS $$
DECLARE
  v_now timestamptz := now();
  v_due RECORD;
BEGIN
  FOR v_due IN
    SELECT id
    FROM public.tournaments
    WHERE status = 'registration_open'
      AND start_at IS NOT NULL
      AND start_at <= v_now
  LOOP
    PERFORM tournament.fn_manage_tournament_cycle(v_due.id, NULL);
  END LOOP;
END;
$$;

