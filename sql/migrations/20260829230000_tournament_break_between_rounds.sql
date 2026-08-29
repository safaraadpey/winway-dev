-- Inter-round break: meta.break_between_rounds_minutes (0 = none).
-- Runtime: meta.round_break_ends_at, meta.round_break_after_round.
-- After a round finishes with 2+ advancing players, wait then start the next round.

BEGIN;

CREATE OR REPLACE FUNCTION tournament.fn_admin_create_tournament(p_payload jsonb)
 RETURNS public.tournaments
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
  v_final_winners int := coalesce(nullif(p_payload->>'final_winners_count','')::int, 1);
  v_min_players_to_start int := nullif(p_payload->>'min_players_to_start','')::int;
  v_registration_extend_minutes int := nullif(p_payload->>'registration_extend_minutes','')::int;
  v_break_between_rounds_minutes int := nullif(p_payload->>'break_between_rounds_minutes','')::int;
  v_registration_extend_enabled boolean;
  v_is_test_tournament boolean;
  v_entry_currency text := upper(coalesce(nullif(p_payload->>'entry_currency',''), p_payload->>'currency', 'IRR'));
  v_guaranteed numeric := coalesce(nullif(p_payload->>'guaranteed_prize','')::numeric, 0);
  v_ticket_price numeric := coalesce(nullif(p_payload->>'ticket_price','')::numeric, 0);
  v_meta jsonb;
  v_prize_percentages jsonb;
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

  IF v_final_winners < 1 OR v_final_winners > 8 THEN
    RAISE EXCEPTION 'final_winners_count must be between 1 and 8';
  END IF;

  IF v_min_players_to_start IS NOT NULL AND v_min_players_to_start < 3 THEN
    RAISE EXCEPTION 'min_players_to_start must be >= 3';
  END IF;

  IF v_registration_extend_minutes IS NOT NULL
     AND (v_registration_extend_minutes < 1 OR v_registration_extend_minutes > 10080) THEN
    RAISE EXCEPTION 'registration_extend_minutes must be between 1 and 10080';
  END IF;

  IF v_break_between_rounds_minutes IS NOT NULL
     AND (v_break_between_rounds_minutes < 0 OR v_break_between_rounds_minutes > 1440) THEN
    RAISE EXCEPTION 'break_between_rounds_minutes must be between 0 and 1440';
  END IF;

  v_registration_extend_enabled := tournament.fn_jsonb_bool(
    p_payload, 'registration_extend_enabled', true
  );
  v_is_test_tournament := tournament.fn_jsonb_bool(
    p_payload, 'is_test_tournament', false
  );

  IF v_entry_currency NOT IN ('IRR','DING') THEN
    RAISE EXCEPTION 'entry_currency must be IRR or DING';
  END IF;

  IF v_ticket_price < 0 THEN
    RAISE EXCEPTION 'ticket_price must be >= 0';
  END IF;

  IF v_entry_currency = 'DING' AND v_guaranteed <= 0 THEN
    RAISE EXCEPTION 'ding tournaments require guaranteed_prize';
  END IF;

  v_meta := jsonb_strip_nulls(jsonb_build_object(
    'final_winners_count', v_final_winners,
    'min_players_to_start', coalesce(v_min_players_to_start, 3),
    'registration_extend_minutes', coalesce(v_registration_extend_minutes, 60),
    'registration_extend_enabled', v_registration_extend_enabled,
    'break_between_rounds_minutes', coalesce(v_break_between_rounds_minutes, 0),
    'entry_currency', v_entry_currency,
    'is_test_tournament', v_is_test_tournament
  ));

  INSERT INTO public.tournaments(
    title, status, start_at, currency, ticket_price,
    min_tickets_per_player, max_tickets_per_player,
    table_size_mode, table_size_fixed, table_size_min, table_size_max,
    later_round_table_size_mode, later_round_table_size_fixed,
    later_round_table_size_min, later_round_table_size_max,
    remainder_policy, commission_rate, guaranteed_prize, meta, created_at, updated_at
  )
  VALUES (
    p_payload->>'title',
    v_status,
    nullif(p_payload->>'start_at','')::timestamptz,
    coalesce(p_payload->>'currency','IRR'),
    v_ticket_price,
    coalesce(nullif(p_payload->>'min_tickets_per_player','')::int, 1),
    coalesce(nullif(p_payload->>'max_tickets_per_player','')::int, 1),
    coalesce(nullif(p_payload->>'table_size_mode','')::public.tournament_table_size_mode, 'fixed'),
    nullif(p_payload->>'table_size_fixed','')::int,
    nullif(p_payload->>'table_size_min','')::int,
    nullif(p_payload->>'table_size_max','')::int,
    nullif(p_payload->>'later_round_table_size_mode','')::public.tournament_table_size_mode,
    nullif(p_payload->>'later_round_table_size_fixed','')::int,
    nullif(p_payload->>'later_round_table_size_min','')::int,
    nullif(p_payload->>'later_round_table_size_max','')::int,
    coalesce(nullif(p_payload->>'remainder_policy','')::public.tournament_remainder_policy, 'adaptive_tables'),
    nullif(p_payload->>'commission_rate','')::numeric,
    v_guaranteed,
    CASE WHEN v_meta = '{}'::jsonb THEN NULL ELSE v_meta END,
    v_now,
    v_now
  )
  RETURNING * INTO v_row;

  IF p_payload ? 'prize_percentages'
     AND jsonb_typeof(p_payload->'prize_percentages') = 'array'
     AND jsonb_array_length(p_payload->'prize_percentages') > 0 THEN
    v_prize_percentages := p_payload->'prize_percentages';
    IF jsonb_array_length(v_prize_percentages) <> v_final_winners THEN
      RAISE EXCEPTION 'prize_percentages length must match final_winners_count';
    END IF;
  ELSE
    IF v_final_winners > 1 THEN
      RAISE EXCEPTION 'prize_percentages required when final_winners_count > 1';
    END IF;
    v_prize_percentages := tournament.fn_build_default_prize_percentages(v_final_winners);
  END IF;

  PERFORM tournament.fn_sync_prize_rules(v_row.id, v_prize_percentages);

  RETURN v_row;
END;
$function$;

CREATE OR REPLACE FUNCTION tournament.fn_admin_update_tournament(p_tournament_id uuid, p_patch jsonb)
 RETURNS public.tournaments
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
    'table_size_max','later_round_table_size_mode','later_round_table_size_fixed',
    'later_round_table_size_min','later_round_table_size_max',
    'remainder_policy','guaranteed_prize','commission_rate','meta'
  ];
  v_bad_keys      text[];
  v_min_players_to_start int;
  v_registration_extend_minutes int;
  v_break_between_rounds_minutes int;
  v_final_winners int;
  v_entry_currency text;
  v_next_guaranteed numeric;
  v_next_meta jsonb;
  v_prize_percentages jsonb;
  v_sync_prize_rules boolean := false;
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

  SELECT * INTO v_row FROM public.tournaments WHERE id = p_tournament_id FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'tournament_not_found';
  END IF;

  IF v_row.status IN ('running','settling','finished') THEN
    RAISE EXCEPTION 'tournament is locked';
  END IF;

  IF p_patch ? 'prize_percentages' THEN
    v_prize_percentages := p_patch->'prize_percentages';
    v_sync_prize_rules := true;
    p_patch := p_patch - 'prize_percentages';
  END IF;

  IF p_patch ? 'prize_rules' THEN
    RAISE EXCEPTION 'prize_rules is deprecated; use prize_percentages';
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
    v_min_players_to_start := nullif(p_patch->'meta'->>'min_players_to_start','')::int;
    IF v_min_players_to_start IS NOT NULL AND v_min_players_to_start < 3 THEN
      RAISE EXCEPTION 'min_players_to_start must be >= 3';
    END IF;

    v_registration_extend_minutes := nullif(p_patch->'meta'->>'registration_extend_minutes','')::int;
    IF v_registration_extend_minutes IS NOT NULL
       AND (v_registration_extend_minutes < 1 OR v_registration_extend_minutes > 10080) THEN
      RAISE EXCEPTION 'registration_extend_minutes must be between 1 and 10080';
    END IF;

    v_break_between_rounds_minutes := nullif(p_patch->'meta'->>'break_between_rounds_minutes','')::int;
    IF v_break_between_rounds_minutes IS NOT NULL
       AND (v_break_between_rounds_minutes < 0 OR v_break_between_rounds_minutes > 1440) THEN
      RAISE EXCEPTION 'break_between_rounds_minutes must be between 0 and 1440';
    END IF;

    v_final_winners := nullif(p_patch->'meta'->>'final_winners_count','')::int;
    IF v_final_winners IS NOT NULL AND (v_final_winners < 1 OR v_final_winners > 8) THEN
      RAISE EXCEPTION 'final_winners_count must be between 1 and 8';
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

  IF p_patch ? 'meta' THEN
    v_next_meta := (coalesce(v_row.meta, '{}'::jsonb) || coalesce(p_patch->'meta','{}'::jsonb))
                   - 'min_players_for_guarantee';
  ELSE
    v_next_meta := v_row.meta;
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
         later_round_table_size_mode = coalesce(
                                    nullif(p_patch->>'later_round_table_size_mode','')::public.tournament_table_size_mode,
                                    t.later_round_table_size_mode
                                  ),
         later_round_table_size_fixed = coalesce(
                                    nullif(p_patch->>'later_round_table_size_fixed','')::int,
                                    t.later_round_table_size_fixed
                                  ),
         later_round_table_size_min = coalesce(
                                    nullif(p_patch->>'later_round_table_size_min','')::int,
                                    t.later_round_table_size_min
                                  ),
         later_round_table_size_max = coalesce(
                                    nullif(p_patch->>'later_round_table_size_max','')::int,
                                    t.later_round_table_size_max
                                  ),
         remainder_policy        = coalesce(
                                    nullif(p_patch->>'remainder_policy','')::public.tournament_remainder_policy,
                                    t.remainder_policy
                                  ),
         commission_rate         = coalesce(nullif(p_patch->>'commission_rate','')::numeric, t.commission_rate),
         guaranteed_prize        = v_next_guaranteed,
         meta                    = v_next_meta,
         updated_at              = v_now
   WHERE t.id = p_tournament_id
   RETURNING * INTO v_row;

  v_final_winners := coalesce(nullif(v_row.meta->>'final_winners_count','')::int, 1);

  IF v_sync_prize_rules THEN
    IF jsonb_typeof(v_prize_percentages) <> 'array' THEN
      RAISE EXCEPTION 'prize_percentages must be a json array';
    END IF;
    IF jsonb_array_length(v_prize_percentages) <> v_final_winners THEN
      RAISE EXCEPTION 'prize_percentages length must match final_winners_count';
    END IF;
    PERFORM tournament.fn_sync_prize_rules(p_tournament_id, v_prize_percentages);
  ELSIF p_patch ? 'meta' AND (p_patch->'meta') ? 'final_winners_count' THEN
    PERFORM tournament.fn_sync_prize_rules(
      p_tournament_id,
      tournament.fn_build_default_prize_percentages(v_final_winners)
    );
  END IF;

  RETURN v_row;
END;
$function$;

CREATE OR REPLACE FUNCTION tournament.fn_manage_tournament_cycle(
  p_tournament_id uuid,
  p_seed bigint
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'tournament', 'public', 'pg_temp'
AS $function$
DECLARE
  v_t                 public.tournaments%ROWTYPE;

  v_curr_round        int;
  v_next_round        int;

  v_table_mode        public.tournament_table_size_mode;
  v_table_fixed       int;
  v_table_min         int;
  v_table_max         int;

  v_count_players     int;
  v_tables_needed     int;

  v_sizes             int[];
  v_now               timestamptz := now();

  v_trr_ids           uuid[];
  v_idx               int := 1;
  v_i                 int;
  r_entry             record;
  v_entry_currency    text;
  v_break_minutes     int;
  v_break_after       int;
  v_break_ends        timestamptz;
BEGIN
  DROP TABLE IF EXISTS pg_temp._tp_participants;
  DROP TABLE IF EXISTS pg_temp._tp_ordered;

  SELECT * INTO v_t
  FROM public.tournaments
  WHERE id = p_tournament_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'tournament not found: %', p_tournament_id;
  END IF;

  IF v_t.status <> 'running' THEN
    RETURN;
  END IF;

  v_entry_currency := upper(coalesce(nullif(v_t.meta->>'entry_currency',''), v_t.currency, 'IRR'));

  SELECT COALESCE(MAX(round_no), 0)
    INTO v_curr_round
  FROM public.tournament_round_rooms
  WHERE tournament_id = p_tournament_id;

  v_next_round := v_curr_round + 1;

  IF EXISTS (
    SELECT 1 FROM public.tournament_round_rooms
    WHERE tournament_id = p_tournament_id AND round_no = v_next_round
  ) THEN
    RETURN;
  END IF;

  IF v_curr_round > 0 AND EXISTS (
    SELECT 1 FROM public.tournament_round_rooms
    WHERE tournament_id = p_tournament_id
      AND round_no = v_curr_round
      AND status <> 'finished'
  ) THEN
    RETURN;
  END IF;

  IF v_curr_round = 0 THEN
    v_table_mode  := COALESCE(v_t.table_size_mode, 'range');
    v_table_fixed := COALESCE(v_t.table_size_fixed, 0);
    v_table_min   := COALESCE(v_t.table_size_min, 8);
    v_table_max   := COALESCE(v_t.table_size_max, 12);
  ELSE
    v_table_mode  := COALESCE(
      v_t.later_round_table_size_mode,
      v_t.table_size_mode,
      'range'::public.tournament_table_size_mode
    );
    v_table_fixed := COALESCE(
      v_t.later_round_table_size_fixed,
      v_t.table_size_fixed,
      0
    );
    v_table_min   := COALESCE(
      v_t.later_round_table_size_min,
      v_t.table_size_min,
      8
    );
    v_table_max   := COALESCE(
      v_t.later_round_table_size_max,
      v_t.table_size_max,
      12
    );
  END IF;

  IF v_table_mode = 'fixed' THEN
    v_table_min := v_table_fixed;
    v_table_max := v_table_fixed;
  END IF;

  CREATE TEMP TABLE _tp_participants(
    user_id uuid PRIMARY KEY,
    cards_count int NOT NULL
  ) ON COMMIT DROP;

  IF v_curr_round = 0 THEN
    INSERT INTO _tp_participants(user_id, cards_count)
    SELECT te.user_id, GREATEST(COALESCE(te.tickets_count, 1), 1)
    FROM public.tournament_entries te
    WHERE te.tournament_id = p_tournament_id
      AND te.status = 'created';
  ELSE
    INSERT INTO _tp_participants(user_id, cards_count)
    SELECT rw.user_id, GREATEST(COALESCE(te.tickets_count, 1), 1)
    FROM public.tournament_round_rooms trr
    JOIN public.room_winners rw ON rw.room_id = trr.room_id
    JOIN public.tournament_entries te
      ON te.tournament_id = p_tournament_id
     AND te.user_id = rw.user_id
    WHERE trr.tournament_id = p_tournament_id
      AND trr.round_no = v_curr_round
    GROUP BY rw.user_id, te.tickets_count;
  END IF;

  SELECT COUNT(*) INTO v_count_players FROM _tp_participants;

  IF v_curr_round > 0 AND v_count_players <= 1 THEN
    UPDATE public.tournaments
       SET status = 'finished'::public.tournament_status,
           meta = (coalesce(meta, '{}'::jsonb) - 'round_break_ends_at' - 'round_break_after_round'),
           updated_at = v_now
     WHERE id = p_tournament_id;

    PERFORM tournament.fn_payout_tournament(p_tournament_id);

    IF v_entry_currency <> 'DING' THEN
      FOR r_entry IN
        SELECT entry_id
        FROM public.tournament_commission_snapshots
        WHERE tournament_id = p_tournament_id
      LOOP
        PERFORM tournament.fn_commission_payout(p_tournament_id, r_entry.entry_id);
      END LOOP;

      PERFORM tournament.fn_settle_commission_payouts(p_tournament_id);
      PERFORM tournament.fn_capture_entry_locks(p_tournament_id);
    ELSE
      PERFORM tournament.fn_burn_ding_locks(p_tournament_id);
    END IF;

    UPDATE public.tournament_entries
       SET status = 'settled'::public.tournament_entry_status
     WHERE tournament_id = p_tournament_id
       AND status = 'created'::public.tournament_entry_status;

    RETURN;
  END IF;

  IF v_count_players = 0 THEN
    RETURN;
  END IF;

  v_break_minutes := GREATEST(
    COALESCE(NULLIF(v_t.meta->>'break_between_rounds_minutes', '')::int, 0),
    0
  );
  IF v_curr_round > 0 AND v_break_minutes > 0 THEN
    v_break_after := NULLIF(v_t.meta->>'round_break_after_round', '')::int;
    BEGIN
      v_break_ends := NULLIF(v_t.meta->>'round_break_ends_at', '')::timestamptz;
    EXCEPTION WHEN others THEN
      v_break_ends := NULL;
    END;

    IF v_break_after IS DISTINCT FROM v_curr_round OR v_break_ends IS NULL THEN
      v_break_ends := v_now + make_interval(mins => v_break_minutes);
      UPDATE public.tournaments
         SET meta = coalesce(meta, '{}'::jsonb)
                    || jsonb_build_object(
                         'round_break_ends_at', to_jsonb(v_break_ends),
                         'round_break_after_round', v_curr_round
                       ),
             updated_at = v_now
       WHERE id = p_tournament_id;
      RAISE LOG '[Tournament] round break started tournament=% round=% minutes=% ends_at=% source=postgresql',
        p_tournament_id, v_curr_round, v_break_minutes, v_break_ends;
      RETURN;
    END IF;

    IF v_now < v_break_ends THEN
      RETURN;
    END IF;

    UPDATE public.tournaments
       SET meta = (coalesce(meta, '{}'::jsonb) - 'round_break_ends_at' - 'round_break_after_round'),
           updated_at = v_now
     WHERE id = p_tournament_id;
    RAISE LOG '[Tournament] round break ended tournament=% advancing_to_round=% source=postgresql',
      p_tournament_id, v_next_round;
  END IF;

  v_tables_needed := CEIL(v_count_players::numeric / v_table_max);
  IF v_tables_needed < 1 THEN v_tables_needed := 1; END IF;

  v_sizes := ARRAY[]::int[];
  DECLARE
    v_base int := v_count_players / v_tables_needed;
    v_rem  int := v_count_players % v_tables_needed;
  BEGIN
    FOR v_i IN 1..v_tables_needed LOOP
      v_sizes := v_sizes || (v_base + CASE WHEN v_i <= v_rem THEN 1 ELSE 0 END);
    END LOOP;
  END;

  v_trr_ids := ARRAY[]::uuid[];

  FOR v_i IN 1..array_length(v_sizes,1) LOOP
    DECLARE v_trr_id uuid;
    BEGIN
      INSERT INTO public.tournament_round_rooms(
        id, tournament_id, round_no, table_no,
        room_id, status, target_players, seated_players,
        meta, created_at
      ) VALUES (
        gen_random_uuid(), p_tournament_id, v_next_round, v_i,
        NULL, 'created', v_sizes[v_i], 0,
        jsonb_build_object(
          'generated_at', v_now,
          'seed', p_seed,
          'table_min', v_table_min,
          'table_max', v_table_max,
          'round_phase', CASE WHEN v_curr_round = 0 THEN 'first' ELSE 'later' END
        ),
        v_now
      )
      RETURNING id INTO v_trr_id;

      v_trr_ids := array_append(v_trr_ids, v_trr_id);
    END;
  END LOOP;

  CREATE TEMP TABLE _tp_ordered(
    rn int PRIMARY KEY,
    user_id uuid,
    cards_count int
  ) ON COMMIT DROP;

  INSERT INTO _tp_ordered(rn, user_id, cards_count)
  SELECT
    ROW_NUMBER() OVER (
      ORDER BY
      CASE
       WHEN p_seed IS NULL THEN random()::text
       ELSE md5(p_seed::text || ':' || p_tournament_id::text || ':' || p.user_id::text)
       END
    ),
    p.user_id,
    p.cards_count
  FROM _tp_participants p;

  v_idx := 1;
  FOR v_i IN 1..array_length(v_sizes,1) LOOP
    INSERT INTO public.tournament_round_assignments(
      tournament_id,
      round_no,
      trr_id,
      user_id,
      seed,
      created_at,
      cards_count
    )
    SELECT
      p_tournament_id,
      v_next_round,
      v_trr_ids[v_i],
      o.user_id,
      p_seed,
      v_now,
      o.cards_count
    FROM _tp_ordered o
    WHERE o.rn BETWEEN v_idx AND (v_idx + v_sizes[v_i] - 1);

    v_idx := v_idx + v_sizes[v_i];
  END LOOP;

  UPDATE public.tournaments
  SET updated_at = v_now
  WHERE id = p_tournament_id;

  RETURN;
END;
$function$;

COMMIT;
