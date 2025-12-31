CREATE OR REPLACE FUNCTION tournament.fn_manage_tournament_cycle(
  p_tournament_id uuid,
  p_seed          bigint DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = tournament, public, pg_temp
AS $$
DECLARE
  v_t                 public.tournaments%ROWTYPE;
  v_next_round        int;
  v_curr_round        int;
  v_round_room_id     uuid;

  v_table_min         int;
  v_table_max         int;
  v_table_fixed       int;
  v_table_mode        public.tournament_table_size_mode;

  v_count_players     int;
  v_tables_needed     int;
  v_min_tables        int;
  v_max_tables        int;

  v_sizes             int[];
  v_idx               int;
  v_base              int;
  v_rem               int;

  v_now               timestamptz := now();
BEGIN
  PERFORM tournament._assert_tournament_exists(p_tournament_id);

  SELECT * INTO v_t
  FROM public.tournaments
  WHERE id = p_tournament_id
  FOR UPDATE;

  v_table_mode  := COALESCE(v_t.table_size_mode, 'range');
  v_table_fixed := COALESCE(v_t.table_size_fixed, 0);
  v_table_min   := COALESCE(v_t.table_size_min, 8);
  v_table_max   := COALESCE(v_t.table_size_max, 12);

  -- bump status to running on first orchestration
  IF v_t.status = 'registration_open'::public.tournament_status THEN
    UPDATE public.tournaments
       SET status = 'running',
           updated_at = v_now
     WHERE id = p_tournament_id;
    v_t.status := 'running';
  END IF;

  IF v_t.status <> 'running'::public.tournament_status THEN
    RAISE NOTICE 'tournament % not in running; status=%', p_tournament_id, v_t.status;
    RETURN;
  END IF;

  -- discover current max round
  SELECT COALESCE(MAX(round_no), 0) INTO v_curr_round
  FROM public.tournament_round_rooms
  WHERE tournament_id = p_tournament_id;

  v_next_round := v_curr_round + 1;

  -- idempotency: if next round already created, no-op
  IF EXISTS (
    SELECT 1 FROM public.tournament_round_rooms
    WHERE tournament_id = p_tournament_id
      AND round_no = v_next_round
  ) THEN
    RAISE NOTICE 'tournament % round % already exists; skipping', p_tournament_id, v_next_round;
    RETURN;
  END IF;

  -- If there is an existing round, ensure all its rooms are finished before advancing
  IF v_curr_round > 0 THEN
    IF EXISTS (
      SELECT 1
      FROM public.tournament_round_rooms
      WHERE tournament_id = p_tournament_id
        AND round_no = v_curr_round
        AND status <> 'finished'
    ) THEN
      RAISE NOTICE 'round % of tournament % not finished; skipping', v_curr_round, p_tournament_id;
      RETURN;
    END IF;
  END IF;

  -- participants staging: one row per user, with cards_count ثابت برای کل تورنومنت
  CREATE TEMP TABLE tmp_participants(
    user_id     uuid PRIMARY KEY,
    cards_count int  NOT NULL
  ) ON COMMIT DROP;

  -- Build participant list:
  -- Round 1: all active entries (cards_count = tickets_count)
  -- Next rounds: winners from room_winners of previous round rooms,
  --             but cards_count is still from tournament_entries.tickets_count (ثابت تا آخر)
  IF v_curr_round = 0 THEN
    INSERT INTO tmp_participants(user_id, cards_count)
    SELECT
      te.user_id,
      GREATEST(COALESCE(te.tickets_count, 1), 1) AS cards_count
    FROM public.tournament_entries te
    WHERE te.tournament_id = p_tournament_id
      AND te.status = 'created'
    ON CONFLICT (user_id) DO UPDATE
      SET cards_count = EXCLUDED.cards_count;
  ELSE
    INSERT INTO tmp_participants(user_id, cards_count)
    SELECT
      rw.user_id,
      GREATEST(COALESCE(te.tickets_count, 1), 1) AS cards_count
    FROM public.tournament_round_rooms trr
    JOIN public.room_winners rw ON rw.room_id = trr.room_id
    LEFT JOIN public.tournament_entries te
           ON te.tournament_id = p_tournament_id
          AND te.user_id = rw.user_id
          AND te.status = 'created'
    WHERE trr.tournament_id = p_tournament_id
      AND trr.round_no = v_curr_round
    ON CONFLICT (user_id) DO UPDATE
      SET cards_count = EXCLUDED.cards_count;
  END IF;

  SELECT COUNT(*) INTO v_count_players FROM tmp_participants;
  IF v_count_players = 0 THEN
    RAISE NOTICE 'no participants found for tournament % round %', p_tournament_id, v_next_round;
    RETURN;
  END IF;

  -- Determine table sizing
  IF v_table_mode = 'fixed' THEN
    IF v_table_fixed <= 0 THEN
      RAISE EXCEPTION 'table_size_fixed must be >0 for fixed mode';
    END IF;
    v_table_min := v_table_fixed;
    v_table_max := v_table_fixed;
  END IF;

  -- اگر کمتر از min هستیم، یک میز می‌سازیم (فینال/مرحله کم‌نفر)
  IF v_count_players < v_table_min THEN
    v_tables_needed := 1;
  ELSE
    -- min_tables = ceil(n/max), max_tables = floor(n/min)
    v_min_tables := CEIL(v_count_players::numeric / v_table_max)::int;
    v_max_tables := FLOOR(v_count_players::numeric / v_table_min)::int;

    IF v_max_tables < 1 THEN
      v_max_tables := 1;
    END IF;

    -- انتخاب تعداد میز: کمترین تعداد میز که قوانین min/max را رعایت کند
    v_tables_needed := LEAST(GREATEST(v_min_tables, 1), v_max_tables);
  END IF;

  -- توزیع متعادل تعداد نفرات هر میز (فقط seating کاربران؛ کارت‌ها جداست)
  v_base := v_count_players / v_tables_needed;
  v_rem  := v_count_players % v_tables_needed;

  v_sizes := ARRAY[]::int[];
  FOR v_idx IN 1..v_tables_needed LOOP
    v_sizes := v_sizes || (v_base + CASE WHEN v_idx <= v_rem THEN 1 ELSE 0 END);
  END LOOP;

  -- safety: اگر n>=min اینجا باید همه بین min..max باشند
  IF v_count_players >= v_table_min THEN
    IF EXISTS (
      SELECT 1
      FROM unnest(v_sizes) s(sz)
      WHERE sz < v_table_min OR sz > v_table_max
    ) THEN
      RAISE EXCEPTION 'unable to satisfy table size constraints: n=%, sizes=% (min=%, max=%)',
        v_count_players, v_sizes, v_table_min, v_table_max;
    END IF;
  END IF;

  -- Shuffle participants with seed for deterministic order if provided
  -- (md5 برای ترتیب پایدار و بدون نیاز به pgcrypto digest)
  WITH ordered AS (
    SELECT
      tp.user_id,
      tp.cards_count,
      ROW_NUMBER() OVER (
        ORDER BY
          CASE
            WHEN p_seed IS NULL THEN random()::text
            ELSE md5(p_seed::text || ':' || tp.user_id::text)
          END
      ) AS rn
    FROM tmp_participants tp
  )
  -- Insert round rooms and assignments (cards_count داخل assignment ذخیره می‌شود)
  SELECT 1;

  v_idx := 1;

  FOR v_tables_needed IN 1..array_length(v_sizes, 1) LOOP
    INSERT INTO public.tournament_round_rooms(
      id, tournament_id, round_no, table_no, room_id, status, meta, created_at
    ) VALUES (
      gen_random_uuid(), p_tournament_id, v_next_round, v_tables_needed, NULL,
      'created'::public.tournament_round_room_status,
      jsonb_build_object('generated_at', v_now),
      v_now
    )
    RETURNING id INTO STRICT v_round_room_id;

    INSERT INTO public.tournament_round_assignments(
      tournament_id, round_no, room_id, user_id, seed, cards_count, created_at
    )
    SELECT
      p_tournament_id,
      v_next_round,
      v_round_room_id,
      o.user_id,
      p_seed,
      o.cards_count,
      v_now
    FROM (
      SELECT user_id, cards_count, rn
      FROM (
        SELECT
          tp.user_id,
          tp.cards_count,
          ROW_NUMBER() OVER (
            ORDER BY
              CASE
                WHEN p_seed IS NULL THEN random()::text
                ELSE md5(p_seed::text || ':' || tp.user_id::text)
              END
          ) AS rn
        FROM tmp_participants tp
      ) q
      WHERE rn BETWEEN v_idx AND (v_idx + v_sizes[v_tables_needed] - 1)
    ) o;

    v_idx := v_idx + v_sizes[v_tables_needed];
  END LOOP;

  UPDATE public.tournaments
     SET updated_at = v_now
   WHERE id = p_tournament_id;

  RAISE NOTICE 'tournament % round % created with % tables (n=%)', p_tournament_id, v_next_round, array_length(v_sizes,1), v_count_players;
END;
$$;
