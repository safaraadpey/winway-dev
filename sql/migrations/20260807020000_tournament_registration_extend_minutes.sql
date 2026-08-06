-- Configurable registration extension when under min_players_to_start.
-- meta.registration_extend_minutes (default 60, clamp 1..10080) replaces hardcoded +1 hour.

CREATE OR REPLACE FUNCTION tournament.fn_admin_create_tournament(p_payload jsonb)
 RETURNS tournaments
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'tournament', 'public', 'pg_temp'
AS $function$
DECLARE
  v_actor         uuid := auth.uid();
  v_actor_role    public.user_role;
  v_actor_status  public.user_status;
  v_now           timestamptz := now();
  v_row           public.tournaments%rowtype;
  v_status        public.tournament_status := coalesce(
                         nullif(p_payload->>'status','')::public.tournament_status,
                         'draft'::public.tournament_status
                       );
  v_final_winners int := nullif(p_payload->>'final_winners_count','')::int;
  v_min_players_for_guarantee int := nullif(p_payload->>'min_players_for_guarantee','')::int;
  v_min_players_to_start int := nullif(p_payload->>'min_players_to_start','')::int;
  v_registration_extend_minutes int := nullif(p_payload->>'registration_extend_minutes','')::int;
  v_entry_currency text := upper(coalesce(nullif(p_payload->>'entry_currency',''), p_payload->>'currency', 'IRR'));
  v_guaranteed numeric := nullif(p_payload->>'guaranteed_prize','')::numeric;
  v_meta jsonb;
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'UNAUTHORIZED';
  END IF;

  SELECT role, status
    INTO v_actor_role, v_actor_status
  FROM public.users
  WHERE id = v_actor;

  IF v_actor_role NOT IN ('admin','super') OR v_actor_status IS DISTINCT FROM 'active' THEN
    RAISE EXCEPTION 'FORBIDDEN';
  END IF;

  IF v_status NOT IN ('draft','registration_open') THEN
    RAISE EXCEPTION 'invalid initial status';
  END IF;

  IF v_final_winners IS NOT NULL AND (v_final_winners < 1 OR v_final_winners > 4) THEN
    RAISE EXCEPTION 'final_winners_count must be between 1 and 4';
  END IF;

  IF v_min_players_for_guarantee IS NOT NULL AND v_min_players_for_guarantee < 1 THEN
    RAISE EXCEPTION 'min_players_for_guarantee must be >= 1';
  END IF;

  IF v_min_players_to_start IS NOT NULL AND v_min_players_to_start < 3 THEN
    RAISE EXCEPTION 'min_players_to_start must be >= 3';
  END IF;

  IF v_registration_extend_minutes IS NOT NULL
     AND (v_registration_extend_minutes < 1 OR v_registration_extend_minutes > 10080) THEN
    RAISE EXCEPTION 'registration_extend_minutes must be between 1 and 10080';
  END IF;

  IF v_entry_currency NOT IN ('IRR','DING') THEN
    RAISE EXCEPTION 'entry_currency must be IRR or DING';
  END IF;

  IF v_entry_currency = 'DING' AND (v_guaranteed IS NULL OR v_guaranteed <= 0) THEN
    RAISE EXCEPTION 'ding tournaments require guaranteed_prize';
  END IF;

  v_meta := jsonb_strip_nulls(jsonb_build_object(
    'final_winners_count', v_final_winners,
    'min_players_for_guarantee', v_min_players_for_guarantee,
    'min_players_to_start', coalesce(v_min_players_to_start, 3),
    'registration_extend_minutes', coalesce(v_registration_extend_minutes, 60),
    'entry_currency', v_entry_currency
  ));

  INSERT INTO public.tournaments(
    title,
    status,
    start_at,
    currency,
    ticket_price,
    min_tickets_per_player,
    max_tickets_per_player,
    table_size_mode,
    table_size_fixed,
    table_size_min,
    table_size_max,
    remainder_policy,
    commission_rate,
    guaranteed_prize,
    meta,
    created_at,
    updated_at
  )
  VALUES (
    p_payload->>'title',
    v_status,
    nullif(p_payload->>'start_at','')::timestamptz,
    coalesce(p_payload->>'currency','IRR'),
    nullif(p_payload->>'ticket_price','')::numeric,
    nullif(p_payload->>'min_tickets_per_player','')::int,
    nullif(p_payload->>'max_tickets_per_player','')::int,
    coalesce(nullif(p_payload->>'table_size_mode','')::public.tournament_table_size_mode, 'fixed'),
    nullif(p_payload->>'table_size_fixed','')::int,
    nullif(p_payload->>'table_size_min','')::int,
    nullif(p_payload->>'table_size_max','')::int,
    coalesce(nullif(p_payload->>'remainder_policy','')::public.tournament_remainder_policy, 'adaptive_tables'),
    nullif(p_payload->>'commission_rate','')::numeric,
    v_guaranteed,
    CASE WHEN v_meta = '{}'::jsonb THEN NULL ELSE v_meta END,
    v_now,
    v_now
  )
  RETURNING * INTO v_row;

  RETURN v_row;
END;
$function$;

CREATE OR REPLACE FUNCTION tournament.fn_admin_update_tournament(p_tournament_id uuid, p_patch jsonb)
 RETURNS tournaments
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'tournament', 'public', 'pg_temp'
AS $function$
DECLARE
  v_actor         uuid := auth.uid();
  v_actor_role    public.user_role;
  v_actor_status  public.user_status;
  v_row           public.tournaments%rowtype;
  v_now           timestamptz := now();
  v_allowed_keys  text[] := array[
    'title','start_at','currency','ticket_price','min_tickets_per_player',
    'max_tickets_per_player','table_size_mode','table_size_fixed','table_size_min',
    'table_size_max','remainder_policy','guaranteed_prize','commission_rate','meta'
  ];
  v_bad_keys      text[];
  v_min_players_for_guarantee int;
  v_min_players_to_start int;
  v_registration_extend_minutes int;
  v_entry_currency text;
  v_next_guaranteed numeric;
BEGIN
  p_patch := coalesce(p_patch, '{}'::jsonb);

  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'UNAUTHORIZED';
  END IF;

  SELECT role, status
    INTO v_actor_role, v_actor_status
  FROM public.users
  WHERE id = v_actor;

  IF v_actor_role NOT IN ('admin','super') OR v_actor_status IS DISTINCT FROM 'active' THEN
    RAISE EXCEPTION 'FORBIDDEN';
  END IF;

  IF p_tournament_id IS NULL THEN
    RAISE EXCEPTION 'tournament_id is required';
  END IF;

  SELECT *
    INTO v_row
  FROM public.tournaments
  WHERE id = p_tournament_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'tournament_not_found';
  END IF;

  IF v_row.status IN ('running','settling','finished') THEN
    RAISE EXCEPTION 'tournament is locked';
  END IF;

  v_bad_keys := (
    SELECT array_agg(k)
    FROM jsonb_object_keys(p_patch) AS k
    WHERE k <> ALL (v_allowed_keys)
  );
  IF v_bad_keys IS NOT NULL THEN
    RAISE EXCEPTION 'unsupported keys: %', v_bad_keys;
  END IF;

  IF p_patch ? 'status' THEN
    RAISE EXCEPTION 'status cannot be changed via this RPC';
  END IF;

  IF p_patch ? 'meta' THEN
    v_min_players_for_guarantee := nullif(p_patch->'meta'->>'min_players_for_guarantee','')::int;
    IF v_min_players_for_guarantee IS NOT NULL AND v_min_players_for_guarantee < 1 THEN
      RAISE EXCEPTION 'min_players_for_guarantee must be >= 1';
    END IF;

    v_min_players_to_start := nullif(p_patch->'meta'->>'min_players_to_start','')::int;
    IF v_min_players_to_start IS NOT NULL AND v_min_players_to_start < 3 THEN
      RAISE EXCEPTION 'min_players_to_start must be >= 3';
    END IF;

    v_registration_extend_minutes := nullif(p_patch->'meta'->>'registration_extend_minutes','')::int;
    IF v_registration_extend_minutes IS NOT NULL
       AND (v_registration_extend_minutes < 1 OR v_registration_extend_minutes > 10080) THEN
      RAISE EXCEPTION 'registration_extend_minutes must be between 1 and 10080';
    END IF;
  END IF;

  v_entry_currency := upper(coalesce(
    nullif(p_patch->'meta'->>'entry_currency',''),
    v_row.meta->>'entry_currency',
    v_row.currency,
    'IRR'
  ));

  IF v_entry_currency NOT IN ('IRR','DING') THEN
    RAISE EXCEPTION 'entry_currency must be IRR or DING';
  END IF;

  v_next_guaranteed := coalesce(nullif(p_patch->>'guaranteed_prize','')::numeric, v_row.guaranteed_prize);
  IF v_entry_currency = 'DING' AND (v_next_guaranteed IS NULL OR v_next_guaranteed <= 0) THEN
    RAISE EXCEPTION 'ding tournaments require guaranteed_prize';
  END IF;

  UPDATE public.tournaments t
     SET title                   = coalesce(p_patch->>'title', t.title),
         start_at                = coalesce((p_patch->>'start_at')::timestamptz, t.start_at),
         currency                = coalesce(p_patch->>'currency', t.currency),
         ticket_price            = coalesce(nullif(p_patch->>'ticket_price','')::numeric, t.ticket_price),
         min_tickets_per_player  = coalesce(nullif(p_patch->>'min_tickets_per_player','')::int, t.min_tickets_per_player),
         max_tickets_per_player  = coalesce(nullif(p_patch->>'max_tickets_per_player','')::int, t.max_tickets_per_player),
         table_size_mode         = coalesce(
                                    nullif(p_patch->>'table_size_mode','')::public.tournament_table_size_mode,
                                    t.table_size_mode
                                  ),
         table_size_fixed        = coalesce(nullif(p_patch->>'table_size_fixed','')::int, t.table_size_fixed),
         table_size_min          = coalesce(nullif(p_patch->>'table_size_min','')::int, t.table_size_min),
         table_size_max          = coalesce(nullif(p_patch->>'table_size_max','')::int, t.table_size_max),
         remainder_policy        = coalesce(
                                    nullif(p_patch->>'remainder_policy','')::public.tournament_remainder_policy,
                                    t.remainder_policy
                                  ),
         commission_rate         = coalesce(nullif(p_patch->>'commission_rate','')::numeric, t.commission_rate),
         guaranteed_prize        = v_next_guaranteed,
         meta                    = CASE
                                    WHEN p_patch ? 'meta' THEN coalesce(t.meta, '{}'::jsonb) || coalesce(p_patch->'meta','{}'::jsonb)
                                    ELSE t.meta
                                  END,
         updated_at              = v_now
   WHERE t.id = p_tournament_id
   RETURNING * INTO v_row;

  RETURN v_row;
END;
$function$;

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
