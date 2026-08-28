-- Allow tournament prize percentages with 2 decimal places (e.g. 33.50).
-- Treat payout_value as percentage points (always / 100), not a 0-1 fraction.

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
    v_val := round((p_percentages->>v_i)::numeric, 2);
    IF v_val IS NULL OR v_val <= 0 OR v_val > 100 THEN
      RAISE EXCEPTION 'prize percentage at rank % must be between 0.01 and 100', v_i + 1;
    END IF;
    v_sum := v_sum + v_val;
  END LOOP;

  IF round(v_sum, 2) <> 100 THEN
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
      round((p_percentages->>v_i)::numeric, 2),
      '{}'::jsonb,
      now()
    );
  END LOOP;
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
  v_currency        text;
  v_now             timestamptz := now();
  v_effective_guarantee numeric := 0;
  v_entry_currency text;
  v_champion        uuid;
  v_max_rule_rank   int;
  v_rule_rank       int;
  v_i               int;
  v_n               int;
  v_group_end       int;
  v_group_size      int;
  v_slots_available int;
  v_ranks_to_use    int;
  v_ding_val        numeric;
  v_pct_sum         numeric;
  v_fixed_sum       numeric;
  v_amount_each     numeric;
  v_rank_start      int;
  v_rank_end        int;

  r_rule   record;
  r_ding   record;
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

  SELECT w.user_id
    INTO v_champion
  FROM (
    SELECT rw.user_id, sum(rw.weight) AS score
    FROM public.tournament_round_rooms trr
    JOIN public.room_winners rw ON rw.room_id = trr.room_id
    WHERE trr.tournament_id = p_tournament_id
      AND trr.round_no = v_last_round
    GROUP BY rw.user_id
    ORDER BY score DESC, rw.user_id
    LIMIT 1
  ) w;

  IF v_champion IS NULL THEN
    RAISE EXCEPTION 'no champion found for tournament %', p_tournament_id;
  END IF;

  SELECT count(*) INTO v_rules_count
  FROM public.tournament_prize_rules
  WHERE tournament_id = p_tournament_id;

  IF NOT EXISTS (
    SELECT 1 FROM public.tournament_payouts WHERE tournament_id = p_tournament_id
  ) THEN
    IF v_rules_count = 0 THEN
      INSERT INTO public.tournament_payouts(
        tournament_id, user_id, rank, amount, status, created_at, meta
      ) VALUES (
        p_tournament_id,
        v_champion,
        1,
        v_pool,
        'pending',
        v_now,
        jsonb_build_object('payout_mode', 'champion_take_all')
      )
      ON CONFLICT DO NOTHING;
    ELSE
      SELECT max(rank) INTO v_max_rule_rank
      FROM public.tournament_prize_rules
      WHERE tournament_id = p_tournament_id;

      FOR r_rule IN
        SELECT rank, payout_type, payout_value
        FROM public.tournament_prize_rules
        WHERE tournament_id = p_tournament_id
          AND rank = 1
        ORDER BY rank
      LOOP
        IF r_rule.payout_type = 'percent' THEN
          v_amount := v_pool * (r_rule.payout_value / 100);
        ELSE
          v_amount := r_rule.payout_value;
        END IF;

        INSERT INTO public.tournament_payouts(
          tournament_id, user_id, rank, amount, status, created_at, meta
        ) VALUES (
          p_tournament_id,
          v_champion,
          1,
          v_amount,
          'pending',
          v_now,
          jsonb_build_object(
            'payout_mode', 'champion',
            'ding_total', COALESCE((
              SELECT ding_total
              FROM public.tournament_player_ding_totals
              WHERE tournament_id = p_tournament_id
                AND user_id = v_champion
            ), 0)
          )
        )
        ON CONFLICT DO NOTHING;
      END LOOP;

      CREATE TEMP TABLE _ding_ranked (
        ord int NOT NULL,
        user_id uuid NOT NULL,
        ding_total numeric NOT NULL
      ) ON COMMIT DROP;

      INSERT INTO _ding_ranked (ord, user_id, ding_total)
      SELECT
        row_number() OVER (ORDER BY COALESCE(dt.ding_total, 0) DESC, p.user_id)::int,
        p.user_id,
        COALESCE(dt.ding_total, 0)
      FROM (
        SELECT DISTINCT tra.user_id
        FROM public.tournament_round_assignments tra
        WHERE tra.tournament_id = p_tournament_id
          AND tra.user_id <> v_champion
      ) p
      LEFT JOIN public.tournament_player_ding_totals dt
        ON dt.tournament_id = p_tournament_id
       AND dt.user_id = p.user_id;

      SELECT count(*)::int INTO v_n FROM _ding_ranked;

      v_rule_rank := 2;
      v_i := 1;

      WHILE v_i <= v_n AND v_rule_rank <= v_max_rule_rank LOOP
        SELECT ding_total INTO v_ding_val
        FROM _ding_ranked
        WHERE ord = v_i;

        SELECT COALESCE(max(ord), v_i)
          INTO v_group_end
        FROM _ding_ranked
        WHERE ord >= v_i
          AND ding_total = v_ding_val;

        v_group_size := v_group_end - v_i + 1;
        v_slots_available := v_max_rule_rank - v_rule_rank + 1;
        v_ranks_to_use := LEAST(v_group_size, v_slots_available);

        IF v_ranks_to_use <= 0 THEN
          EXIT;
        END IF;

        v_rank_start := v_rule_rank;
        v_rank_end := v_rule_rank + v_ranks_to_use - 1;

        SELECT COALESCE(sum(
          CASE
            WHEN payout_type = 'percent' THEN payout_value
            ELSE 0
          END
        ), 0)
          INTO v_pct_sum
        FROM public.tournament_prize_rules
        WHERE tournament_id = p_tournament_id
          AND rank BETWEEN v_rank_start AND v_rank_end
          AND payout_type = 'percent';

        SELECT COALESCE(sum(payout_value), 0)
          INTO v_fixed_sum
        FROM public.tournament_prize_rules
        WHERE tournament_id = p_tournament_id
          AND rank BETWEEN v_rank_start AND v_rank_end
          AND payout_type = 'fixed';

        v_amount_each := ((v_pool * v_pct_sum / 100) + v_fixed_sum) / v_group_size;

        FOR r_ding IN
          SELECT user_id, ding_total
          FROM _ding_ranked
          WHERE ord BETWEEN v_i AND v_group_end
          ORDER BY ord
        LOOP
          INSERT INTO public.tournament_payouts(
            tournament_id, user_id, rank, amount, status, created_at, meta
          ) VALUES (
            p_tournament_id,
            r_ding.user_id,
            v_rule_rank,
            v_amount_each,
            'pending',
            v_now,
            jsonb_build_object(
              'payout_mode', 'ding_rank',
              'ding_total', r_ding.ding_total,
              'tie_group_size', v_group_size,
              'pct_combined', v_pct_sum,
              'fixed_combined', v_fixed_sum,
              'rank_slots_used', v_ranks_to_use
            )
          )
          ON CONFLICT DO NOTHING;
        END LOOP;

        v_i := v_group_end + 1;
        v_rule_rank := v_rule_rank + v_ranks_to_use;
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
