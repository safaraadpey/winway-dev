-- ============================================
-- Function برای تولید Card Pool
-- ============================================
-- این Function یک Pool جدید ایجاد می‌کند و کارت‌های Bingo (9×3) را تولید می‌کند
-- ساختار کارت: 3 ردیف × 9 ستون = 27 سلول
-- هر ستون محدوده خاصی دارد:
--   ستون 1: 1-10
--   ستون 2: 11-20
--   ستون 3: 21-30
--   ستون 4: 31-40
--   ستون 5: 41-50
--   ستون 6: 51-60
--   ستون 7: 61-70
--   ستون 8: 71-80
--   ستون 9: 81-90
--
-- سازگاری با جداول:
-- ✓ card_pools: همه فیلدها پر می‌شوند (pool_seed, commit_hash, prng_version, card_count)
-- ✓ card_pool_cards: همه فیلدها پر می‌شوند (pool_id, card_no, card_data, is_taken)
-- ✓ card_numbers: همه فیلدها پر می‌شوند (pool_card_id, row_no, col_no, value)
-- ✓ Constraints: همه constraints رعایت می‌شوند (row_no: 1-3, col_no: 1-9, value: 1-90)
-- ✓ سازگار با rpc_join_or_create_room_and_reserve_tickets: کارت‌ها با card_no قابل دسترسی هستند

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
  v_card_no integer;
  v_row_no smallint;
  v_col_no smallint;
  v_value integer;
  v_card_data jsonb;
  v_cells jsonb[];
  v_col_min integer;
  v_col_max integer;
  v_random_index integer;
  v_batch_size integer := 1000;
  v_batch_count integer;
  v_current_batch integer;
  v_row_array jsonb;
  v_row_values integer[];
  v_all_used_numbers integer[];
  v_row_positions integer[];
  v_selected_pos integer;
  v_temp_positions integer[];
  v_pos_index integer;
  v_num_in_col integer[];
  v_col_has_number boolean[];
  v_possible_numbers integer[];
  v_candidate integer;
  v_found boolean;
  v_attempts integer;
BEGIN
  -- 1. تولید Pool Seed
  v_pool_seed := gen_random_bytes(32);
  v_commit_hash := encode(digest(v_pool_seed, 'sha256'), 'hex');
  
  -- 2. پیدا کردن آخرین version
  SELECT COALESCE(MAX(version), 0) + 1 INTO v_version
  FROM public.card_pools;
  
  -- 3. ایجاد Pool
  INSERT INTO public.card_pools (
    id,
    version,
    is_active,
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
    false, -- ابتدا غیرفعال است تا کارت‌ها تولید شوند
    p_created_by,
    v_pool_seed,
    v_commit_hash,
    p_prng_version,
    p_card_count,
    now(),
    now()
  )
  RETURNING id INTO v_pool_id;
  
  RAISE NOTICE 'Pool created: % (version: %, card_count: %)', v_pool_id, v_version, p_card_count;
  
  -- 4. تولید کارت‌ها به صورت Batch
  v_batch_count := CEIL(p_card_count::numeric / v_batch_size);
  
  FOR v_current_batch IN 1..v_batch_count LOOP
      -- تولید یک Batch از کارت‌ها
      FOR v_card_no IN ((v_current_batch - 1) * v_batch_size + 1)..LEAST(v_current_batch * v_batch_size, p_card_count) LOOP
      -- تولید کارت با استفاده از pool_seed برای deterministic بودن
      -- ساختار card_data باید array of arrays باشد: [[row1], [row2], [row3]]
      -- قوانین کارت Bingo:
      -- 1. در هر ردیف: 5 عدد + 4 صفر
      -- 2. هیچ عدد تکراری در کل کارت
      -- 3. در هر ستون حداقل یک عدد
      v_card_data := '[]'::jsonb;
      v_all_used_numbers := ARRAY[]::integer[];
      
      -- مقداردهی اولیه: هر ستون باید حداقل یک عدد داشته باشد
      v_col_has_number := ARRAY[false, false, false, false, false, false, false, false, false]::boolean[];
      
      -- برای هر ردیف (3 ردیف)
      FOR v_row_no IN 1..3 LOOP
        v_row_values := ARRAY[0, 0, 0, 0, 0, 0, 0, 0, 0]::integer[];
        v_row_positions := ARRAY[]::integer[];
        
        -- انتخاب 5 موقعیت تصادفی برای اعداد در این ردیف
        -- استفاده از hash deterministic
        v_temp_positions := ARRAY[1, 2, 3, 4, 5, 6, 7, 8, 9]::integer[];
        
        -- انتخاب 5 موقعیت
        FOR v_pos_index IN 1..5 LOOP
          v_selected_pos := v_temp_positions[
            ABS(
              MOD(
                hashtext(
                  encode(v_pool_seed, 'hex') || ':' || 
                  v_card_no::text || ':' || 
                  v_row_no::text || ':' || 
                  'pos' || v_pos_index::text
                ),
                array_length(v_temp_positions, 1)
              )
            ) + 1
          ];
          
          -- حذف موقعیت انتخاب شده از لیست
          v_temp_positions := array_remove(v_temp_positions, v_selected_pos);
          v_row_positions := array_append(v_row_positions, v_selected_pos);
        END LOOP;
        
        -- برای هر موقعیت انتخاب شده، تولید عدد
        FOR v_pos_index IN 1..5 LOOP
          v_col_no := v_row_positions[v_pos_index];
          
          -- تعیین محدوده اعداد برای این ستون
          v_col_min := (v_col_no - 1) * 10 + 1;
          v_col_max := v_col_no * 10;
          
          -- تولید عدد تا زمانی که یکتا باشد
          v_attempts := 0;
          LOOP
            v_attempts := v_attempts + 1;
            IF v_attempts > 100 THEN
              RAISE EXCEPTION 'Cannot generate unique number for card %, row %, col %', v_card_no, v_row_no, v_col_no;
            END IF;
            
            -- تولید عدد تصادفی deterministic
            v_random_index := ABS(
              MOD(
                hashtext(
                  encode(v_pool_seed, 'hex') || ':' || 
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
            
            -- بررسی تکراری نبودن
            v_found := false;
            IF array_length(v_all_used_numbers, 1) > 0 THEN
              SELECT EXISTS(
                SELECT 1 FROM unnest(v_all_used_numbers) AS num WHERE num = v_value
              ) INTO v_found;
            END IF;
            
            IF NOT v_found THEN
              EXIT; -- عدد یکتا پیدا شد
            END IF;
          END LOOP;
          
          -- اضافه کردن عدد به ردیف و لیست اعداد استفاده شده
          v_row_values[v_col_no] := v_value;
          v_all_used_numbers := array_append(v_all_used_numbers, v_value);
          v_col_has_number[v_col_no] := true;
        END LOOP;
        
        -- تبدیل array به jsonb و تبدیل صفرها به null
        -- Trigger fn_sync_card_numbers فقط اعداد غیر null را اضافه می‌کند
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
      
      -- بررسی نهایی: اطمینان از اینکه هر ستون حداقل یک عدد دارد
      FOR v_col_no IN 1..9 LOOP
        IF NOT v_col_has_number[v_col_no] THEN
          -- اگر ستونی عدد ندارد، باید یک عدد اضافه کنیم
          -- این حالت نادر است اما باید رفع شود
          v_col_min := (v_col_no - 1) * 10 + 1;
          v_col_max := v_col_no * 10;
          
          v_attempts := 0;
          LOOP
            v_attempts := v_attempts + 1;
            IF v_attempts > 100 THEN
              RAISE EXCEPTION 'Cannot generate number for empty column % in card %', v_col_no, v_card_no;
            END IF;
            
            v_random_index := ABS(
              MOD(
                hashtext(
                  encode(v_pool_seed, 'hex') || ':' || 
                  v_card_no::text || ':' || 
                  'col_fix' || v_col_no::text || ':' ||
                  v_attempts::text
                ),
                (v_col_max - v_col_min + 1)
              )
            ) + v_col_min;
            
            v_value := GREATEST(v_col_min, LEAST(v_col_max, v_random_index));
            
            -- بررسی تکراری نبودن
            v_found := false;
            IF array_length(v_all_used_numbers, 1) > 0 THEN
              SELECT EXISTS(
                SELECT 1 FROM unnest(v_all_used_numbers) AS num WHERE num = v_value
              ) INTO v_found;
            END IF;
            
            IF NOT v_found THEN
              -- پیدا کردن یک ردیف که در این ستون 0 دارد و کمتر از 5 عدد دارد
              -- و اضافه کردن عدد به آن
              DECLARE
                v_non_zero_count integer;
                v_row_data jsonb;
                v_fixed boolean := false;
              BEGIN
                FOR v_row_no IN 1..3 LOOP
                  v_row_data := v_card_data->>(v_row_no - 1);
                  
                  -- بررسی اینکه در این ستون 0 است
                  IF (v_row_data->>(v_col_no - 1))::integer = 0 THEN
                    -- شمارش اعداد غیر صفر در این ردیف
                    v_non_zero_count := 0;
                    FOR v_pos_index IN 0..8 LOOP
                      IF (v_row_data->>v_pos_index)::integer > 0 THEN
                        v_non_zero_count := v_non_zero_count + 1;
                      END IF;
                    END LOOP;
                    
                    -- اگر کمتر از 5 عدد دارد، می‌توانیم عدد را اضافه کنیم
                    IF v_non_zero_count < 5 THEN
                      -- به‌روزرسانی card_data
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
                      v_fixed := true;
                      EXIT; -- عدد اضافه شد
                    END IF;
                  END IF;
                END LOOP;
                
                IF NOT v_fixed THEN
                  RAISE EXCEPTION 'Cannot fix empty column % in card %', v_col_no, v_card_no;
                END IF;
              END;
              EXIT; -- عدد پیدا شد
            END IF;
          END LOOP;
        END IF;
      END LOOP;
      
      -- درج کارت
      INSERT INTO public.card_pool_cards (
        pool_id,
        card_no,
        card_data,
        is_taken,
        created_at
      )
      VALUES (
        v_pool_id,
        v_card_no,
        v_card_data,
        false,
        now()
      );
      
      -- Trigger trg_sync_card_numbers به صورت خودکار card_numbers را پر می‌کند
      -- نیازی به درج دستی نیست
      
      -- نمایش پیشرفت هر 100 کارت
      IF v_card_no % 100 = 0 THEN
        RAISE NOTICE 'Generated card % of %', v_card_no, p_card_count;
      END IF;
    END LOOP;
    
    -- نمایش پیشرفت Batch
    RAISE NOTICE 'Batch % of % completed', v_current_batch, v_batch_count;
  END LOOP;
  
  -- 5. غیرفعال کردن Poolهای قبلی و فعال کردن Pool جدید
  -- (اگر constraint one_active_pool وجود دارد)
  UPDATE public.card_pools
  SET is_active = false,
      updated_at = now()
  WHERE is_active = true
    AND id != v_pool_id;
  
  -- فعال کردن Pool جدید
  UPDATE public.card_pools
  SET is_active = true,
      updated_at = now()
  WHERE id = v_pool_id;
  
  RAISE NOTICE 'Pool % activated with % cards', v_pool_id, p_card_count;
  
  RETURN v_pool_id;
END;
$function$;

-- ============================================
-- مثال استفاده:
-- ============================================
-- SELECT game_core.fn_generate_card_pool(10000);
-- SELECT game_core.fn_generate_card_pool(10000, NULL, 'v1');

