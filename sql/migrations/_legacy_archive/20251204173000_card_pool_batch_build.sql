-- Migration: Convert card pool generation to staged batch builder
-- Date: 2025-12-04

BEGIN;

-- 1) Add state columns to card_pools for staged builds
ALTER TABLE public.card_pools
  ADD COLUMN IF NOT EXISTS is_building boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS cards_built integer NOT NULL DEFAULT 0,
  ALTER COLUMN card_count SET NOT NULL,
  ALTER COLUMN card_count SET DEFAULT 0;

-- 2) Refactor main creator: only creates pool row, no cards
CREATE OR REPLACE FUNCTION game_core.fn_generate_card_pool(
  p_card_count integer DEFAULT 10000,
  p_created_by uuid DEFAULT NULL,
  p_prng_version text DEFAULT 'v1'
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
DECLARE
  v_pool_id uuid;
  v_pool_seed bytea;
  v_commit_hash text;
  v_version integer;
BEGIN
  IF p_card_count IS NULL OR p_card_count <= 0 THEN
    RAISE EXCEPTION 'card_count must be positive';
  END IF;

  v_pool_seed := gen_random_bytes(32);
  v_commit_hash := encode(digest(v_pool_seed, 'sha256'), 'hex');

  SELECT COALESCE(MAX(version), 0) + 1 INTO v_version
  FROM public.card_pools;

  INSERT INTO public.card_pools (
    id,
    version,
    is_active,
    is_building,
    cards_built,
    created_by,
    pool_seed,
    commit_hash,
    prng_version,
    card_count,
    created_at,
    updated_at
  )
  VALUES (
    gen_random_uuid(),
    v_version,
    false,   -- not active until cards are fully built
    true,    -- mark building
    0,       -- no cards built yet
    p_created_by,
    v_pool_seed,
    v_commit_hash,
    p_prng_version,
    p_card_count,
    now(),
    now()
  )
  RETURNING id INTO v_pool_id;

  RAISE NOTICE 'Pool created for staged build: % (version %, card_count %)', v_pool_id, v_version, p_card_count;

  RETURN v_pool_id;
END;
$function$;

-- 3) Step-wise builder: generates cards in small batches
CREATE OR REPLACE FUNCTION game_core.fn_generate_card_pool_step(
  p_batch_size integer DEFAULT 20
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
DECLARE
  v_pool record;
  v_start_card integer;
  v_end_card integer;
  v_card_no integer;
  v_row_no smallint;
  v_col_no smallint;
  v_value integer;
  v_card_data jsonb;
  v_row_array jsonb;
  v_row_values integer[];
  v_all_used_numbers integer[];
  v_row_positions integer[];
  v_temp_positions integer[];
  v_pos_index integer;
  v_selected_pos integer;
  v_col_min integer;
  v_col_max integer;
  v_random_index integer;
  v_attempts integer;
  v_found boolean;
  v_col_has_number boolean[];
  v_non_zero_count integer;
  v_row_data jsonb;
  v_generated integer := 0;
  v_new_built integer;
  v_now timestamptz := now();
  -- UK Housie: col 1 = 1-9, col 2 = 10-19, ..., col 9 = 80-90
  v_col_mins constant integer[] := ARRAY[1,10,20,30,40,50,60,70,80];
  v_col_maxs constant integer[] := ARRAY[9,19,29,39,49,59,69,79,90];
BEGIN
  IF p_batch_size IS NULL OR p_batch_size <= 0 THEN
    RAISE EXCEPTION 'p_batch_size must be positive';
  END IF;

  -- pick one pool that is currently building
  SELECT *
    INTO v_pool
  FROM public.card_pools
  WHERE is_building = true
    AND cards_built < card_count
  ORDER BY created_at
  LIMIT 1
  FOR UPDATE SKIP LOCKED;

  IF NOT FOUND THEN
    -- nothing to do
    RETURN;
  END IF;

  v_start_card := v_pool.cards_built + 1;
  v_end_card := LEAST(v_pool.cards_built + p_batch_size, v_pool.card_count);

  FOR v_card_no IN v_start_card..v_end_card LOOP
    -- initialize structures for a single card
    v_card_data := '[]'::jsonb;
    v_all_used_numbers := ARRAY[]::integer[];
    v_col_has_number := ARRAY[false, false, false, false, false, false, false, false, false]::boolean[];

    -- three rows
    FOR v_row_no IN 1..3 LOOP
      v_row_values := ARRAY[0,0,0,0,0,0,0,0,0]::integer[];
      v_row_positions := ARRAY[]::integer[];
      v_temp_positions := ARRAY[1,2,3,4,5,6,7,8,9]::integer[];

      -- pick 5 positions deterministically
      FOR v_pos_index IN 1..5 LOOP
        v_selected_pos := v_temp_positions[
          ABS(
            MOD(
              hashtext(
                encode(v_pool.pool_seed, 'hex') || ':' ||
                v_card_no::text || ':' ||
                v_row_no::text || ':' ||
                'pos' || v_pos_index::text
              ),
              array_length(v_temp_positions, 1)
            )
          ) + 1
        ];
        v_temp_positions := array_remove(v_temp_positions, v_selected_pos);
        v_row_positions := array_append(v_row_positions, v_selected_pos);
      END LOOP;

      -- generate numbers for selected positions
      FOR v_pos_index IN 1..5 LOOP
        v_col_no := v_row_positions[v_pos_index];
        v_col_min := v_col_mins[v_col_no];
        v_col_max := v_col_maxs[v_col_no];

        v_attempts := 0;
        LOOP
          v_attempts := v_attempts + 1;
          IF v_attempts > 500 THEN
            RAISE EXCEPTION 'Cannot generate unique number for card %, row %, col %', v_card_no, v_row_no, v_col_no;
          END IF;

          v_random_index := ABS(
            MOD(
              hashtext(
                encode(v_pool.pool_seed, 'hex') || ':' ||
                v_card_no::text || ':' ||
                v_row_no::text || ':' ||
                v_col_no::text || ':' ||
                v_pos_index::text || ':' ||
                v_attempts::text
              ),
              (v_col_max - v_col_min + 1)
            )
          ) + v_col_min;

          v_value := GREATEST(v_col_min, LEAST(v_col_max, v_random_index));

          v_found := false;
          IF array_length(v_all_used_numbers, 1) > 0 THEN
            SELECT EXISTS(
              SELECT 1 FROM unnest(v_all_used_numbers) AS num WHERE num = v_value
            ) INTO v_found;
          END IF;

          IF NOT v_found THEN
            EXIT;
          END IF;
        END LOOP;

        v_row_values[v_col_no] := v_value;
        v_all_used_numbers := array_append(v_all_used_numbers, v_value);
        v_col_has_number[v_col_no] := true;
      END LOOP;

      -- build row json with nulls for zeros
      v_row_array := '[]'::jsonb;
      FOR v_col_no IN 1..9 LOOP
        IF v_row_values[v_col_no] > 0 THEN
          v_row_array := v_row_array || jsonb_build_array(v_row_values[v_col_no]);
        ELSE
          v_row_array := v_row_array || jsonb_build_array(jsonb 'null');
        END IF;
      END LOOP;
      v_card_data := v_card_data || jsonb_build_array(v_row_array);
    END LOOP;

    -- ensure each column has at least one number
    FOR v_col_no IN 1..9 LOOP
      IF NOT v_col_has_number[v_col_no] THEN
        v_col_min := v_col_mins[v_col_no];
        v_col_max := v_col_maxs[v_col_no];
        v_attempts := 0;
        LOOP
          v_attempts := v_attempts + 1;
          IF v_attempts > 500 THEN
            RAISE EXCEPTION 'Cannot generate number for empty column % in card %', v_col_no, v_card_no;
          END IF;

          v_random_index := ABS(
            MOD(
              hashtext(
                encode(v_pool.pool_seed, 'hex') || ':' ||
                v_card_no::text || ':' ||
                'col_fix' || v_col_no::text || ':' ||
                v_attempts::text
              ),
              (v_col_max - v_col_min + 1)
            )
          ) + v_col_min;

          v_value := GREATEST(v_col_min, LEAST(v_col_max, v_random_index));

          v_found := false;
          IF array_length(v_all_used_numbers, 1) > 0 THEN
            SELECT EXISTS(
              SELECT 1 FROM unnest(v_all_used_numbers) AS num WHERE num = v_value
            ) INTO v_found;
          END IF;

          IF NOT v_found THEN
            FOR v_row_no IN 1..3 LOOP
              v_row_data := v_card_data->(v_row_no - 1);
              IF COALESCE((v_row_data->>(v_col_no - 1))::integer, 0) = 0 THEN
                v_non_zero_count := 0;
                FOR v_pos_index IN 0..8 LOOP
                  IF COALESCE((v_row_data->>v_pos_index)::integer, 0) > 0 THEN
                    v_non_zero_count := v_non_zero_count + 1;
                  END IF;
                END LOOP;
                IF v_non_zero_count < 5 THEN
                  v_row_data := jsonb_set(
                    v_row_data,
                    ARRAY[(v_col_no - 1)::text],
                    to_jsonb(v_value)
                  );
                  v_card_data := jsonb_set(
                    v_card_data,
                    ARRAY[(v_row_no - 1)::text],
                    v_row_data
                  );
                  v_all_used_numbers := array_append(v_all_used_numbers, v_value);
                  v_col_has_number[v_col_no] := true;
                  EXIT;
                END IF;
              END IF;
            END LOOP;
            EXIT;
          END IF;
        END LOOP;
      END IF;
    END LOOP;

    INSERT INTO public.card_pool_cards (
      pool_id,
      card_no,
      card_data,
      created_at
    )
    VALUES (
      v_pool.id,
      v_card_no,
      v_card_data,
      v_now
    );

    v_generated := v_generated + 1;
  END LOOP;

  v_new_built := v_pool.cards_built + v_generated;

  -- update pool progress
  UPDATE public.card_pools
     SET cards_built = v_new_built,
         updated_at = now()
   WHERE id = v_pool.id;

  -- finalize if complete
  IF v_new_built >= v_pool.card_count THEN
    -- deactivate other pools first to satisfy one_active_pool constraint
    UPDATE public.card_pools
       SET is_active = false,
           updated_at = now()
     WHERE is_active = true
       AND id <> v_pool.id;

    UPDATE public.card_pools
       SET is_building = false,
           is_active = true,
           updated_at = now()
     WHERE id = v_pool.id;
  END IF;

  RAISE LOG 'Pool %: built % cards this step (cards_built now % of %)',
    v_pool.id, v_generated, v_new_built, v_pool.card_count;

EXCEPTION
  WHEN OTHERS THEN
    -- keep pool state; just log
    RAISE LOG 'fn_generate_card_pool_step error: %', SQLERRM;
END;
$function$;

COMMIT;
