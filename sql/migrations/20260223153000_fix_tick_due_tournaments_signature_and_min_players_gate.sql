-- Fix tournament tick ambiguity and keep only canonical 3-arg function.
-- Also enforce "delay 1 hour if registration_open tournament has < 3 players".

DROP FUNCTION IF EXISTS tournament.fn_tick_due_tournaments();

CREATE OR REPLACE FUNCTION tournament.fn_tick_due_tournaments(
  p_limit integer DEFAULT 50,
  p_seed bigint DEFAULT NULL::bigint,
  p_batch_tables integer DEFAULT NULL::integer
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'tournament', 'public', 'pg_temp'
AS $function$
DECLARE
  r record;
  v_count int := 0;
  v_entries_players int;
  v_min_players int := 3;

  v_ctx    text;
  v_detail text;
  v_hint   text;
BEGIN
  FOR r IN
    SELECT t.id, t.status
    FROM public.tournaments t
    WHERE
      (t.status = 'registration_open'::public.tournament_status
       AND t.start_at IS NOT NULL
       AND t.start_at <= now())
      OR
      (t.status = 'running'::public.tournament_status)
    ORDER BY t.start_at NULLS LAST, t.created_at
    LIMIT p_limit
  LOOP
    BEGIN
      IF r.status = 'registration_open'::public.tournament_status THEN
        SELECT count(DISTINCT te.user_id)
          INTO v_entries_players
        FROM public.tournament_entries te
        WHERE te.tournament_id = r.id
          AND te.status = 'created';

        IF COALESCE(v_entries_players, 0) < v_min_players THEN
          UPDATE public.tournaments
             SET start_at = now() + interval '1 hour',
                 updated_at = now()
           WHERE id = r.id
             AND status = 'registration_open'::public.tournament_status;
          CONTINUE;
        END IF;
      END IF;

      PERFORM tournament.fn_tick_tournament(
        p_tournament_id := r.id,
        p_seed          := p_seed::bigint,
        p_batch_tables  := CASE
                             WHEN p_batch_tables IS NULL THEN NULL::integer[]
                             ELSE ARRAY[p_batch_tables::integer]
                           END
      );

      v_count := v_count + 1;

    EXCEPTION
      WHEN lock_not_available THEN
        CONTINUE;

      WHEN others THEN
        GET STACKED DIAGNOSTICS
          v_ctx    = PG_EXCEPTION_CONTEXT,
          v_detail = PG_EXCEPTION_DETAIL,
          v_hint   = PG_EXCEPTION_HINT;

        INSERT INTO tournament.tournament_tick_log(tournament_id, stage, sqlstate, message, context)
        VALUES (
          r.id,
          'fn_tick_tournament',
          SQLSTATE,
          SQLERRM
            || COALESCE(' | detail=' || v_detail, '')
            || COALESCE(' | hint='   || v_hint, ''),
          v_ctx
        );

        CONTINUE;
    END;
  END LOOP;

  RETURN v_count;
END;
$function$;

-- Make pg_cron call explicit to avoid overload ambiguity.
DO $$
BEGIN
  UPDATE cron.job
     SET command = 'SELECT tournament.fn_tick_due_tournaments(50, NULL, NULL)'
   WHERE jobname = 'tournament.fn_tick_due_tournaments';
EXCEPTION
  WHEN undefined_table THEN
    -- In environments without pg_cron metadata table.
    NULL;
  WHEN insufficient_privilege THEN
    -- In hosted environments where current role cannot update cron metadata.
    NULL;
END
$$;
