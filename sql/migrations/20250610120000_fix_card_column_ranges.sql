-- Fix UK Housie column ranges in fn_generate_card_pool_step
-- Before: col 1 = 1-10, col 2 = 11-20, ... (multiples of 10 in wrong column)
-- After:  col 1 = 1-9,  col 2 = 10-19, col 3 = 20-29, ... col 9 = 80-90

BEGIN;

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

  SELECT *
    INTO v_pool
  FROM public.card_pools
  WHERE is_building = true
    AND cards_built < card_count
  ORDER BY created_at
  LIMIT 1
  FOR UPDATE SKIP LOCKED;

  IF NOT FOUND THEN
    RETURN;
  END IF;

  v_start_card := v_pool.cards_built + 1;
  v_end_card := LEAST(v_pool.cards_built + p_batch_size, v_pool.card_count);

  FOR v_card_no IN v_start_card..v_end_card LOOP
    v_card_data := '[]'::jsonb;
    v_all_used_numbers := ARRAY[]::integer[];
    v_col_has_number := ARRAY[false, false, false, false, false, false, false, false, false]::boolean[];

    FOR v_row_no IN 1..3 LOOP
      v_row_values := ARRAY[0,0,0,0,0,0,0,0,0]::integer[];
      v_row_positions := ARRAY[]::integer[];
      v_temp_positions := ARRAY[1,2,3,4,5,6,7,8,9]::integer[];

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

          v_found := v_value = ANY(v_all_used_numbers);
          IF NOT v_found THEN
            EXIT;
          END IF;
        END LOOP;

        v_row_values[v_col_no] := v_value;
        v_all_used_numbers := array_append(v_all_used_numbers, v_value);
        v_col_has_number[v_col_no] := true;
      END LOOP;

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

          v_found := v_value = ANY(v_all_used_numbers);
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

  UPDATE public.card_pools
     SET cards_built = v_new_built,
         updated_at = now()
   WHERE id = v_pool.id;

  IF v_new_built >= v_pool.card_count THEN
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

  RAISE NOTICE 'Pool %: built % cards this step (cards_built now % of %)',
    v_pool.id, v_generated, v_new_built, v_pool.card_count;

EXCEPTION
  WHEN OTHERS THEN
    RAISE;
END;
$function$;

COMMIT;
