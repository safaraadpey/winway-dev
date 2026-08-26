-- Tournament prize split: admin UI syncs tournament_prize_rules (1-8 winners, percent sum = 100).
-- Also fixes fn_payout_tournament ranking to use elimination order, not just last-round winners.

BEGIN;

CREATE OR REPLACE FUNCTION tournament.fn_sync_prize_rules(
  p_tournament_id uuid,
  p_percentages jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'tournament', 'public', 'pg_temp'
AS $function$
DECLARE
  v_count int;
  v_sum numeric := 0;
  v_val numeric;
  v_i int;
BEGIN
  IF p_tournament_id IS NULL THEN
    RAISE EXCEPTION 'tournament_id is required';
  END IF;

  IF p_percentages IS NULL OR jsonb_typeof(p_percentages) <> 'array' THEN
    RAISE EXCEPTION 'prize_percentages must be a json array';
  END IF;

  v_count := jsonb_array_length(p_percentages);

  IF v_count < 1 OR v_count > 8 THEN
    RAISE EXCEPTION 'prize_percentages length must be between 1 and 8';
  END IF;

  FOR v_i IN 0..(v_count - 1) LOOP
    v_val := (p_percentages->>v_i)::numeric;
    IF v_val IS NULL OR v_val <= 0 THEN
      RAISE EXCEPTION 'prize percentage at rank % must be > 0', v_i + 1;
    END IF;
    v_sum := v_sum + v_val;
  END LOOP;

  IF v_sum <> 100 THEN
    RAISE EXCEPTION 'prize percentages must sum to exactly 100 (got %)', v_sum;
  END IF;

  DELETE FROM public.tournament_prize_rules
  WHERE tournament_id = p_tournament_id;

  FOR v_i IN 0..(v_count - 1) LOOP
    INSERT INTO public.tournament_prize_rules(
      tournament_id, rank, payout_type, payout_value, meta, created_at
    ) VALUES (
      p_tournament_id,
      v_i + 1,
      'percent',
      (p_percentages->>v_i)::numeric,
      '{}'::jsonb,
      now()
    );
  END LOOP;
END;
$function$;

CREATE OR REPLACE FUNCTION tournament.fn_build_default_prize_percentages(p_count int)
RETURNS jsonb
LANGUAGE plpgsql
IMMUTABLE
SET search_path TO 'tournament', 'public', 'pg_temp'
AS $function$
DECLARE
  v_base int;
  v_remainder int;
  v_i int;
  v_arr jsonb := '[]'::jsonb;
BEGIN
  IF p_count IS NULL OR p_count < 1 OR p_count > 8 THEN
    RAISE EXCEPTION 'winner count must be between 1 and 8';
  END IF;

  IF p_count = 1 THEN
    RETURN '[100]'::jsonb;
  END IF;

  v_base := floor(100::numeric / p_count)::int;
  v_remainder := 100 - (v_base * p_count);

  FOR v_i IN 1..p_count LOOP
    v_arr := v_arr || jsonb_build_array(
      CASE WHEN v_i = 1 THEN v_base + v_remainder ELSE v_base END
    );
  END LOOP;

  RETURN v_arr;
END;
$function$;

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
  v_registration_extend_enabled boolean;
  v_entry_currency text := upper(coalesce(nullif(p_payload->>'entry_currency',''), p_payload->>'currency', 'IRR'));
  v_guaranteed numeric := nullif(p_payload->>'guaranteed_prize','')::numeric;
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

  v_registration_extend_enabled := tournament.fn_jsonb_bool(
    p_payload, 'registration_extend_enabled', true
  );

  IF v_entry_currency NOT IN ('IRR','DING') THEN
    RAISE EXCEPTION 'entry_currency must be IRR or DING';
  END IF;

  IF v_entry_currency = 'DING' AND (v_guaranteed IS NULL OR v_guaranteed <= 0) THEN
    RAISE EXCEPTION 'ding tournaments require guaranteed_prize';
  END IF;

  v_meta := jsonb_strip_nulls(jsonb_build_object(
    'final_winners_count', v_final_winners,
    'min_players_to_start', coalesce(v_min_players_to_start, 3),
    'registration_extend_minutes', coalesce(v_registration_extend_minutes, 60),
    'registration_extend_enabled', v_registration_extend_enabled,
    'entry_currency', v_entry_currency
  ));

  INSERT INTO public.tournaments(
    title, status, start_at, currency, ticket_price,
    min_tickets_per_player, max_tickets_per_player,
    table_size_mode, table_size_fixed, table_size_min, table_size_max,
    remainder_policy, commission_rate, guaranteed_prize, meta, created_at, updated_at
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
    'table_size_max','remainder_policy','guaranteed_prize','commission_rate','meta'
  ];
  v_bad_keys      text[];
  v_min_players_to_start int;
  v_registration_extend_minutes int;
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

CREATE OR REPLACE FUNCTION tournament.fn_payout_tournament(p_tournament_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'tournament', 'public', 'pg_temp'
AS $function$
DECLARE
  v_t               public.tournaments%rowtype;
  v_pool            numeric := 0;
  v_entries_total   numeric := 0;
  v_pool_from_comm  numeric := 0;
  v_pool_base       numeric := 0;
  v_last_round      int;
  v_rules_count     int;
  v_ranked_count    int;
  v_currency        text;
  v_now             timestamptz := now();
  v_effective_guarantee numeric := 0;
  v_entry_currency text;

  r_winner record;
  r_rule   record;
  r_pay    record;
  v_amount numeric;
BEGIN
  SELECT * INTO v_t
  FROM public.tournaments
  WHERE id = p_tournament_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'tournament not found: %', p_tournament_id;
  END IF;

  v_currency := COALESCE(v_t.currency, 'IRR');
  v_entry_currency := upper(coalesce(nullif(v_t.meta->>'entry_currency',''), v_t.currency, 'IRR'));

  SELECT COALESCE(sum(amount), 0)
    INTO v_entries_total
  FROM public.tournament_entries
  WHERE tournament_id = p_tournament_id
    AND status IN ('created', 'settled');

  v_effective_guarantee := COALESCE(v_t.guaranteed_prize, 0);

  SELECT COALESCE(sum(amount_to_pool), 0)
    INTO v_pool_from_comm
  FROM public.tournament_commission_snapshots
  WHERE tournament_id = p_tournament_id;

  IF v_entry_currency = 'DING' THEN
    v_entries_total := 0;
    v_pool_from_comm := 0;
  END IF;

  v_pool_base := COALESCE(NULLIF(v_pool_from_comm, 0), v_entries_total);
  v_pool := GREATEST(COALESCE(v_effective_guarantee, 0), v_pool_base);

  SELECT COALESCE(max(round_no), 0)
    INTO v_last_round
  FROM public.tournament_round_rooms
  WHERE tournament_id = p_tournament_id;

  IF v_last_round = 0 THEN
    RAISE EXCEPTION 'no rounds found for tournament %', p_tournament_id;
  END IF;

  SELECT count(*) INTO v_ranked_count
  FROM (
    WITH participant_last AS (
      SELECT tra.user_id, MAX(tra.round_no) AS last_round
      FROM public.tournament_round_assignments tra
      WHERE tra.tournament_id = p_tournament_id
      GROUP BY tra.user_id
    ),
    round_scores AS (
      SELECT tra.user_id, tra.round_no, COALESCE(SUM(rw.weight), 0) AS round_score
      FROM public.tournament_round_assignments tra
      JOIN public.tournament_round_rooms trr
        ON trr.tournament_id = tra.tournament_id
       AND trr.round_no = tra.round_no
      LEFT JOIN public.room_winners rw
        ON rw.room_id = trr.room_id
       AND rw.user_id = tra.user_id
      WHERE tra.tournament_id = p_tournament_id
      GROUP BY tra.user_id, tra.round_no
    ),
    final_winners AS (
      SELECT DISTINCT rw.user_id
      FROM public.tournament_round_rooms trr
      JOIN public.room_winners rw ON rw.room_id = trr.room_id
      WHERE trr.tournament_id = p_tournament_id
        AND trr.round_no = v_last_round
    )
    SELECT pl.user_id
    FROM participant_last pl
    JOIN round_scores rs
      ON rs.user_id = pl.user_id
     AND rs.round_no = pl.last_round
    LEFT JOIN final_winners fw ON fw.user_id = pl.user_id
  ) ranked;

  IF v_ranked_count = 0 THEN
    RAISE EXCEPTION 'no ranked participants found for tournament %', p_tournament_id;
  END IF;

  SELECT count(*) INTO v_rules_count
  FROM public.tournament_prize_rules
  WHERE tournament_id = p_tournament_id;

  IF NOT EXISTS (
    SELECT 1 FROM public.tournament_payouts WHERE tournament_id = p_tournament_id
  ) THEN
    IF v_rules_count = 0 THEN
      INSERT INTO public.tournament_payouts(
        tournament_id, user_id, rank, amount, status, created_at
      )
      SELECT p_tournament_id, w.user_id, 1, v_pool, 'pending', v_now
      FROM (
        WITH participant_last AS (
          SELECT tra.user_id, MAX(tra.round_no) AS last_round
          FROM public.tournament_round_assignments tra
          WHERE tra.tournament_id = p_tournament_id
          GROUP BY tra.user_id
        ),
        round_scores AS (
          SELECT tra.user_id, tra.round_no, COALESCE(SUM(rw.weight), 0) AS round_score
          FROM public.tournament_round_assignments tra
          JOIN public.tournament_round_rooms trr
            ON trr.tournament_id = tra.tournament_id
           AND trr.round_no = tra.round_no
          LEFT JOIN public.room_winners rw
            ON rw.room_id = trr.room_id
           AND rw.user_id = tra.user_id
          WHERE tra.tournament_id = p_tournament_id
          GROUP BY tra.user_id, tra.round_no
        ),
        final_winners AS (
          SELECT DISTINCT rw.user_id
          FROM public.tournament_round_rooms trr
          JOIN public.room_winners rw ON rw.room_id = trr.room_id
          WHERE trr.tournament_id = p_tournament_id
            AND trr.round_no = v_last_round
        )
        SELECT pl.user_id
        FROM participant_last pl
        JOIN round_scores rs
          ON rs.user_id = pl.user_id
         AND rs.round_no = pl.last_round
        LEFT JOIN final_winners fw ON fw.user_id = pl.user_id
        ORDER BY
          CASE WHEN fw.user_id IS NOT NULL THEN 1 ELSE 0 END DESC,
          pl.last_round DESC,
          rs.round_score DESC,
          pl.user_id
        LIMIT 1
      ) w;
    ELSE
      FOR r_rule IN
        SELECT rank, payout_type, payout_value
        FROM public.tournament_prize_rules
        WHERE tournament_id = p_tournament_id
        ORDER BY rank
      LOOP
        FOR r_winner IN
          SELECT user_id
          FROM (
            WITH participant_last AS (
              SELECT tra.user_id, MAX(tra.round_no) AS last_round
              FROM public.tournament_round_assignments tra
              WHERE tra.tournament_id = p_tournament_id
              GROUP BY tra.user_id
            ),
            round_scores AS (
              SELECT tra.user_id, tra.round_no, COALESCE(SUM(rw.weight), 0) AS round_score
              FROM public.tournament_round_assignments tra
              JOIN public.tournament_round_rooms trr
                ON trr.tournament_id = tra.tournament_id
               AND trr.round_no = tra.round_no
              LEFT JOIN public.room_winners rw
                ON rw.room_id = trr.room_id
               AND rw.user_id = tra.user_id
              WHERE tra.tournament_id = p_tournament_id
              GROUP BY tra.user_id, tra.round_no
            ),
            final_winners AS (
              SELECT DISTINCT rw.user_id
              FROM public.tournament_round_rooms trr
              JOIN public.room_winners rw ON rw.room_id = trr.room_id
              WHERE trr.tournament_id = p_tournament_id
                AND trr.round_no = v_last_round
            )
            SELECT pl.user_id
            FROM participant_last pl
            JOIN round_scores rs
              ON rs.user_id = pl.user_id
             AND rs.round_no = pl.last_round
            LEFT JOIN final_winners fw ON fw.user_id = pl.user_id
            ORDER BY
              CASE WHEN fw.user_id IS NOT NULL THEN 1 ELSE 0 END DESC,
              pl.last_round DESC,
              rs.round_score DESC,
              pl.user_id
          ) s
          OFFSET (r_rule.rank - 1)
          LIMIT 1
        LOOP
          IF r_rule.payout_type = 'percent' THEN
            v_amount := v_pool * CASE
              WHEN r_rule.payout_value > 1 THEN r_rule.payout_value / 100
              ELSE r_rule.payout_value
            END;
          ELSE
            v_amount := r_rule.payout_value;
          END IF;

          INSERT INTO public.tournament_payouts(
            tournament_id, user_id, rank, amount, status, created_at
          ) VALUES (
            p_tournament_id, r_winner.user_id, r_rule.rank, v_amount, 'pending', v_now
          )
          ON CONFLICT DO NOTHING;
        END LOOP;
      END LOOP;
    END IF;
  END IF;

  FOR r_pay IN
    SELECT id, user_id, amount
    FROM public.tournament_payouts
    WHERE tournament_id = p_tournament_id
      AND status = 'pending'
    FOR UPDATE
  LOOP
    PERFORM game_finance.fn_wallet_apply_delta(
      p_user_id := r_pay.user_id,
      p_currency := v_currency,
      p_amount_delta := r_pay.amount,
      p_transaction_type := 'win',
      p_source_kind := 'tournament_prize',
      p_source_ref := p_tournament_id::text,
      p_description := 'tournament prize payout',
      p_meta := jsonb_build_object('tournament_id', p_tournament_id, 'payout_id', r_pay.id),
      p_allow_negative := false
    );

    UPDATE public.tournament_payouts
       SET status = 'paid',
           paid_at = v_now
     WHERE id = r_pay.id;
  END LOOP;

  RETURN;
END;
$function$;

COMMIT;
