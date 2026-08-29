-- Fix broken fn_admin_create_tournament calling non-existent fn_sync_tournament_prize_rules.

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

  IF p_payload ? 'watch_invite_banner' AND jsonb_typeof(p_payload->'watch_invite_banner') = 'object' THEN
    v_meta := v_meta || jsonb_build_object('watch_invite_banner', p_payload->'watch_invite_banner');
  ELSIF p_payload ? 'meta'
        AND (p_payload->'meta') ? 'watch_invite_banner'
        AND jsonb_typeof(p_payload->'meta'->'watch_invite_banner') = 'object' THEN
    v_meta := v_meta || jsonb_build_object('watch_invite_banner', p_payload->'meta'->'watch_invite_banner');
  END IF;

  INSERT INTO public.tournaments(
    title, status, start_at, currency, ticket_price,
    min_tickets_per_player, max_tickets_per_player,
    table_size_mode, table_size_fixed, table_size_min, table_size_max,
    later_round_table_size_mode, later_round_table_size_fixed,
    later_round_table_size_min, later_round_table_size_max,
    remainder_policy, guaranteed_prize, commission_rate,
    meta, created_at, updated_at
  )
  VALUES (
    coalesce(nullif(p_payload->>'title',''), 'Untitled'),
    v_status,
    nullif(p_payload->>'start_at','')::timestamptz,
    coalesce(nullif(p_payload->>'currency',''), 'IRR'),
    v_ticket_price,
    coalesce(nullif(p_payload->>'min_tickets_per_player','')::int, 1),
    coalesce(nullif(p_payload->>'max_tickets_per_player','')::int, 1),
    coalesce(nullif(p_payload->>'table_size_mode','')::public.tournament_table_size_mode, 'fixed'::public.tournament_table_size_mode),
    nullif(p_payload->>'table_size_fixed','')::int,
    nullif(p_payload->>'table_size_min','')::int,
    nullif(p_payload->>'table_size_max','')::int,
    coalesce(nullif(p_payload->>'later_round_table_size_mode','')::public.tournament_table_size_mode, nullif(p_payload->>'table_size_mode','')::public.tournament_table_size_mode, 'fixed'::public.tournament_table_size_mode),
    coalesce(nullif(p_payload->>'later_round_table_size_fixed','')::int, nullif(p_payload->>'table_size_fixed','')::int),
    coalesce(nullif(p_payload->>'later_round_table_size_min','')::int, nullif(p_payload->>'table_size_min','')::int),
    coalesce(nullif(p_payload->>'later_round_table_size_max','')::int, nullif(p_payload->>'table_size_max','')::int),
    coalesce(nullif(p_payload->>'remainder_policy','')::public.tournament_remainder_policy, 'adaptive_tables'::public.tournament_remainder_policy),
    v_guaranteed,
    coalesce(nullif(p_payload->>'commission_rate','')::numeric, 0),
    v_meta,
    v_now,
    v_now
  )
  RETURNING * INTO v_row;

  v_prize_percentages := p_payload->'prize_percentages';
  IF v_prize_percentages IS NOT NULL AND jsonb_typeof(v_prize_percentages) = 'array' THEN
    PERFORM tournament.fn_sync_prize_rules(v_row.id, v_prize_percentages);
  ELSE
    PERFORM tournament.fn_sync_prize_rules(
      v_row.id,
      tournament.fn_build_default_prize_percentages(v_final_winners)
    );
  END IF;

  RETURN v_row;
END;
$function$;

COMMIT;
