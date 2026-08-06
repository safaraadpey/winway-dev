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
  v_min_players int;
  v_extend_minutes int;

  -- error log details
  v_ctx    text;
  v_detail text;
  v_hint   text;
BEGIN
  FOR r IN
    SELECT
      t.id,
      t.status,
      GREATEST(COALESCE(NULLIF(t.meta->>'min_players_to_start','')::int, 3), 3) AS min_players_to_start,
      LEAST(
        GREATEST(COALESCE(NULLIF(t.meta->>'registration_extend_minutes','')::int, 60), 1),
        10080
      ) AS registration_extend_minutes
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
        v_min_players := COALESCE(r.min_players_to_start, 3);
        v_extend_minutes := COALESCE(r.registration_extend_minutes, 60);

        SELECT count(DISTINCT te.user_id)
          INTO v_entries_players
        FROM public.tournament_entries te
        WHERE te.tournament_id = r.id
          AND te.status = 'created';

        IF COALESCE(v_entries_players, 0) < v_min_players THEN
          UPDATE public.tournaments
             SET start_at = now() + make_interval(mins => v_extend_minutes),
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
