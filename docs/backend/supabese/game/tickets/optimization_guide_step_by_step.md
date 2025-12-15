# راهنمای گام‌به‌گام بهینه‌سازی Draw Worker

**تاریخ:** $(date)  
**هدف:** بهینه‌سازی سیستم برای پشتیبانی از 1,000 پلیر × 5 کارت = 5,000 کارت

---

## 📋 فهرست کارها

### مرحله 1: بهینه‌سازی Query‌ها (فوری - 1 روز)
- [ ] بهینه‌سازی `fn_evaluate_room_after_draw`
- [ ] افزودن Index‌ها
- [ ] تست عملکرد

### مرحله 2: Workerهای موازی (میان‌مدت - 1 هفته)
- [ ] ایجاد Workerهای موازی
- [ ] تغییر `rpc_pick_draw_jobs` برای پشتیبانی از Workerهای موازی
- [ ] تست و مانیتورینگ

---

## 🔧 مرحله 1: بهینه‌سازی Query‌ها

### گام 1.1: بررسی Index‌های موجود

```sql
-- بررسی Index‌های موجود
SELECT 
    schemaname,
    tablename,
    indexname,
    indexdef
FROM pg_indexes
WHERE tablename IN ('marks', 'card_numbers', 'tickets', 'results')
  AND schemaname = 'public'
ORDER BY tablename, indexname;
```

**نتیجه را ذخیره کنید** تا ببینید چه Index‌هایی وجود دارد.

---

### گام 1.2: ایجاد Index‌های مورد نیاز

```sql
-- ============================================
-- Index برای marks (برای NOT EXISTS check)
-- ============================================
CREATE INDEX IF NOT EXISTS idx_marks_ticket_value 
ON public.marks(ticket_id, value);

-- Index برای کارایی بهتر در JOIN
CREATE INDEX IF NOT EXISTS idx_marks_ticket_id 
ON public.marks(ticket_id);

-- ============================================
-- Index برای card_numbers (برای JOIN و فیلتر)
-- ============================================
CREATE INDEX IF NOT EXISTS idx_card_numbers_pool_row_value 
ON public.card_numbers(pool_card_id, row_no, value);

-- Index برای فیلتر pool_card_id
CREATE INDEX IF NOT EXISTS idx_card_numbers_pool_id 
ON public.card_numbers(pool_card_id);

-- ============================================
-- Index برای tickets (برای فیلتر room_id)
-- ============================================
CREATE INDEX IF NOT EXISTS idx_tickets_room_status 
ON public.tickets(room_id, reservation_status) 
WHERE reservation_status = 'confirmed';

-- Index برای فیلتر room_id
CREATE INDEX IF NOT EXISTS idx_tickets_room_id 
ON public.tickets(room_id);

-- ============================================
-- Index برای results (برای NOT EXISTS check)
-- ============================================
CREATE INDEX IF NOT EXISTS idx_results_ticket_draw 
ON public.results(ticket_id, draw_number);

-- Index برای فیلتر room_id و win_type
CREATE INDEX IF NOT EXISTS idx_results_room_win_draw 
ON public.results(room_id, win_type, draw_number);
```

**زمان اجرا:** ~2-5 دقیقه (بسته به حجم داده)

---

### گام 1.3: بهینه‌سازی `fn_evaluate_room_after_draw`

**فایل:** `optimize_fn_evaluate_room_after_draw.sql`

```sql
-- ============================================
-- نسخه بهینه شده fn_evaluate_room_after_draw
-- ============================================
CREATE OR REPLACE FUNCTION public.fn_evaluate_room_after_draw(
  p_room_id uuid, 
  p_draw_number integer
)
RETURNS void
LANGUAGE plpgsql
AS $function$
DECLARE
  v_line_reward_percentage NUMERIC;
  v_full_reward_percentage NUMERIC;
  v_total_pool NUMERIC;
  v_line_reward NUMERIC;
  v_full_reward NUMERIC;
  v_line_winner_count INTEGER;
  v_full_winner_count INTEGER;
BEGIN
  -- گرفتن درصدهای جایزه از room
  SELECT 
    COALESCE(r.line_reward_percentage, rt.line_reward_percentage, 0.5),
    COALESCE(r.full_reward_percentage, rt.full_reward_percentage, 0.8)
  INTO v_line_reward_percentage, v_full_reward_percentage
  FROM rooms r
  LEFT JOIN room_templates rt ON r.room_template_id = rt.id
  WHERE r.id = p_room_id;
  
  -- محاسبه total pool
  SELECT COALESCE(SUM(r.card_price), 0)
  INTO v_total_pool
  FROM tickets t
  JOIN rooms r ON t.room_id = r.id
  WHERE t.room_id = p_room_id
    AND t.reservation_status = 'confirmed';
  
  -- ============================================
  -- بهینه‌سازی: تبدیل Loop به یک Query واحد
  -- ============================================
  WITH ticket_analysis AS (
    SELECT 
      t.id as ticket_id,
      t.player_user_id as user_id,
      t.pool_card_id,
      -- شمارش کل سلول‌های کارت
      COUNT(DISTINCT cn.value) as total_cells,
      -- شمارش سلول‌های mark شده
      COUNT(DISTINCT CASE WHEN m.value IS NOT NULL THEN cn.value END) as marked_cells,
      -- بررسی Line Win برای هر ردیف
      COUNT(DISTINCT CASE WHEN cn.row_no = 1 AND m.value IS NOT NULL THEN cn.value END) as row1_marked,
      COUNT(DISTINCT CASE WHEN cn.row_no = 2 AND m.value IS NOT NULL THEN cn.value END) as row2_marked,
      COUNT(DISTINCT CASE WHEN cn.row_no = 3 AND m.value IS NOT NULL THEN cn.value END) as row3_marked,
      COUNT(DISTINCT CASE WHEN cn.row_no = 1 THEN cn.value END) as row1_total,
      COUNT(DISTINCT CASE WHEN cn.row_no = 2 THEN cn.value END) as row2_total,
      COUNT(DISTINCT CASE WHEN cn.row_no = 3 THEN cn.value END) as row3_total
    FROM tickets t
    INNER JOIN card_numbers cn ON cn.pool_card_id = t.pool_card_id
    LEFT JOIN marks m ON m.ticket_id = t.id AND m.value = cn.value
    WHERE t.room_id = p_room_id
      AND t.reservation_status = 'confirmed'
      -- فقط تیکت‌هایی که هنوز برای این draw ارزیابی نشده‌اند
      AND NOT EXISTS (
        SELECT 1 
        FROM results r 
        WHERE r.ticket_id = t.id 
          AND r.draw_number = p_draw_number
      )
    GROUP BY t.id, t.player_user_id, t.pool_card_id
  ),
  winners AS (
    SELECT 
      ticket_id,
      user_id,
      CASE 
        WHEN marked_cells = total_cells THEN 'full'
        WHEN row1_marked = row1_total OR 
             row2_marked = row2_total OR 
             row3_marked = row3_total THEN 'line'
      END as win_type
    FROM ticket_analysis
    WHERE (marked_cells = total_cells OR 
           row1_marked = row1_total OR 
           row2_marked = row2_total OR 
           row3_marked = row3_total)
  )
  -- Bulk INSERT برای results
  INSERT INTO results (room_id, user_id, ticket_id, win_type, reward_amount, draw_number)
  SELECT 
    p_room_id,
    user_id,
    ticket_id,
    win_type,
    0, -- مقدار اولیه، بعداً به‌روزرسانی می‌شود
    p_draw_number
  FROM winners
  ON CONFLICT DO NOTHING;
  
  -- محاسبه و به‌روزرسانی reward_amount برای line winners
  SELECT COUNT(*) INTO v_line_winner_count
  FROM results
  WHERE room_id = p_room_id
    AND win_type = 'line'
    AND draw_number = p_draw_number;
  
  IF v_line_winner_count > 0 THEN
    v_line_reward := (v_total_pool * v_line_reward_percentage) / v_line_winner_count;
    
    UPDATE results
    SET reward_amount = v_line_reward
    WHERE room_id = p_room_id
      AND win_type = 'line'
      AND draw_number = p_draw_number
      AND reward_amount = 0;
  END IF;
  
  -- محاسبه و به‌روزرسانی reward_amount برای full winners
  SELECT COUNT(*) INTO v_full_winner_count
  FROM results
  WHERE room_id = p_room_id
    AND win_type = 'full'
    AND draw_number = p_draw_number;
  
  IF v_full_winner_count > 0 THEN
    v_full_reward := (v_total_pool * v_full_reward_percentage) / v_full_winner_count;
    
    UPDATE results
    SET reward_amount = v_full_reward
    WHERE room_id = p_room_id
      AND win_type = 'full'
      AND draw_number = p_draw_number
      AND reward_amount = 0;
    
    -- بستن اتاق در صورت وجود Full Winner
    UPDATE rooms
    SET status = 'finished'::room_status,
        updated_at = NOW()
    WHERE id = p_room_id 
      AND status <> 'finished'::room_status;
  END IF;
END;
$function$;
```

**نکات مهم:**
- ✅ از Loop به یک Query واحد تبدیل شده
- ✅ از Window Functions استفاده می‌کند
- ✅ Bulk INSERT استفاده می‌کند
- ✅ از Index‌های ایجاد شده استفاده می‌کند

---

### گام 1.4: تست عملکرد

```sql
-- تست عملکرد Function جدید
EXPLAIN ANALYZE
SELECT public.fn_evaluate_room_after_draw(
  'room-id-here'::uuid,
  1
);
```

**بررسی:**
- زمان اجرا باید < 5s باشد
- Query Plan باید از Index استفاده کند
- تعداد Rows Scanned باید کم باشد

---

## 🔄 مرحله 2: Workerهای موازی

### گام 2.1: تغییر `rpc_pick_draw_jobs` برای پشتیبانی از Worker ID

```sql
-- ============================================
-- نسخه بهینه شده rpc_pick_draw_jobs با Worker ID
-- ============================================
CREATE OR REPLACE FUNCTION game_core.rpc_pick_draw_jobs(
  p_limit integer DEFAULT 200,
  p_worker_id integer DEFAULT 1,
  p_total_workers integer DEFAULT 1
)
RETURNS TABLE (
  id bigint,
  room_id uuid,
  draw_number integer,
  status text,
  attempts integer,
  created_at timestamptz,
  updated_at timestamptz
)
LANGUAGE plpgsql
AS $function$
BEGIN
  RETURN QUERY
  WITH available_jobs AS (
    SELECT 
      dj.*,
      -- توزیع Jobها بین Workerها بر اساس room_id
      MOD(hashtext(dj.room_id::text), p_total_workers) as worker_hash
    FROM public.draw_jobs dj
    WHERE dj.status = 'queued'
    FOR UPDATE SKIP LOCKED
    LIMIT p_limit * p_total_workers
  )
  SELECT 
    aj.id,
    aj.room_id,
    aj.draw_number,
    aj.status,
    aj.attempts,
    aj.created_at,
    aj.updated_at
  FROM available_jobs aj
  WHERE aj.worker_hash = p_worker_id - 1  -- worker_id از 1 شروع می‌شود
  LIMIT p_limit;
  
  -- به‌روزرسانی status به processing
  UPDATE public.draw_jobs
  SET status = 'processing',
      attempts = attempts + 1,
      updated_at = NOW()
  WHERE id IN (
    SELECT id FROM available_jobs 
    WHERE worker_hash = p_worker_id - 1
    LIMIT p_limit
  );
END;
$function$;
```

---

### گام 2.2: ایجاد Workerهای موازی در pg_cron

```sql
-- ============================================
-- Worker 1: پردازش Jobهای اتاق‌های با hash 0
-- ============================================
SELECT cron.schedule(
  'bingo_draw_worker_1',
  '1 second',
  $$
  SELECT public.fn_process_draw_jobs_batch_worker(1, 3);
  $$
);

-- ============================================
-- Worker 2: پردازش Jobهای اتاق‌های با hash 1
-- ============================================
SELECT cron.schedule(
  'bingo_draw_worker_2',
  '1 second',
  $$
  SELECT public.fn_process_draw_jobs_batch_worker(2, 3);
  $$
);

-- ============================================
-- Worker 3: پردازش Jobهای اتاق‌های با hash 2
-- ============================================
SELECT cron.schedule(
  'bingo_draw_worker_3',
  '1 second',
  $$
  SELECT public.fn_process_draw_jobs_batch_worker(3, 3);
  $$
);
```

---

### گام 2.3: ایجاد Function جدید برای Workerهای موازی

```sql
-- ============================================
-- Function جدید برای Workerهای موازی
-- ============================================
CREATE OR REPLACE FUNCTION public.fn_process_draw_jobs_batch_worker(
  p_worker_id integer,
  p_total_workers integer
)
RETURNS void
LANGUAGE plpgsql
AS $function$
DECLARE
  job record;
BEGIN
  -- گرفتن batch از jobها با Worker ID
  FOR job IN
    SELECT *
    FROM game_core.rpc_pick_draw_jobs(
      p_limit => 100,  -- کمتر از قبل چون Workerهای موازی داریم
      p_worker_id => p_worker_id,
      p_total_workers => p_total_workers
    )
  LOOP
    BEGIN
      -- 2) اعمال مارک‌ها
      PERFORM public.rpc_apply_marks_for_draw(
        job.room_id,
        job.draw_number
      );

      -- 3) ارزیابی پس از قرعه
      PERFORM public.fn_evaluate_room_after_draw(
        job.room_id,
        job.draw_number
      );

      -- 4) پرداخت اگر روم کامل شده باشد
      PERFORM public.fn_payout_room_if_full(
        job.room_id
      );

      -- 5) بستن job در صورت موفقیت
      UPDATE public.draw_jobs
      SET status = 'done',
          updated_at = now()
      WHERE id = job.id;
    EXCEPTION
      WHEN OTHERS THEN
        -- در صورت خطا: برگرداندن به صف با attempts + 1
        UPDATE public.draw_jobs
        SET status   = 'queued',
            attempts = COALESCE(job.attempts, 0) + 1,
            updated_at = now()
        WHERE id = job.id;
        
        -- Log خطا (اختیاری)
        RAISE WARNING 'Error processing job %: %', job.id, SQLERRM;
    END;
  END LOOP;
END;
$function$;
```

---

### گام 2.4: غیرفعال کردن Worker قدیمی

```sql
-- غیرفعال کردن Worker قدیمی
SELECT cron.unschedule('bingo_draw_worker');
```

---

### گام 2.5: تست Workerهای موازی

```sql
-- بررسی وضعیت Workerها
SELECT 
  jobid,
  jobname,
  schedule,
  active,
  command
FROM cron.job
WHERE jobname LIKE 'bingo_draw_worker%'
ORDER BY jobid;

-- بررسی Jobهای در حال پردازش
SELECT 
  status,
  COUNT(*) as count,
  AVG(EXTRACT(EPOCH FROM (NOW() - updated_at))) as avg_age_seconds
FROM public.draw_jobs
GROUP BY status;
```

---

## 📊 مانیتورینگ و بررسی

### Query برای مانیتورینگ عملکرد

```sql
-- ============================================
-- مانیتورینگ عملکرد Workerها
-- ============================================
SELECT 
  status,
  COUNT(*) as job_count,
  AVG(attempts) as avg_attempts,
  MAX(attempts) as max_attempts,
  AVG(EXTRACT(EPOCH FROM (NOW() - created_at))) as avg_age_seconds,
  MAX(EXTRACT(EPOCH FROM (NOW() - created_at))) as max_age_seconds
FROM public.draw_jobs
GROUP BY status
ORDER BY status;

-- بررسی Jobهای که خیلی طول کشیده‌اند
SELECT 
  id,
  room_id,
  draw_number,
  status,
  attempts,
  created_at,
  updated_at,
  EXTRACT(EPOCH FROM (NOW() - created_at)) as age_seconds
FROM public.draw_jobs
WHERE status IN ('queued', 'processing')
  AND EXTRACT(EPOCH FROM (NOW() - created_at)) > 30  -- بیشتر از 30 ثانیه
ORDER BY created_at DESC
LIMIT 20;
```

---

## ✅ چک‌لیست نهایی

### قبل از Deploy:

- [ ] Index‌ها ایجاد شده‌اند
- [ ] `fn_evaluate_room_after_draw` بهینه شده است
- [ ] Function جدید تست شده است
- [ ] زمان اجرا < 5s است

### بعد از Deploy:

- [ ] Workerهای موازی ایجاد شده‌اند
- [ ] Worker قدیمی غیرفعال شده است
- [ ] مانیتورینگ فعال است
- [ ] Jobها به درستی پردازش می‌شوند

---

## 🚨 نکات مهم

1. **Backup:** قبل از هر تغییر، Backup بگیرید
2. **تست:** ابتدا روی محیط Test تست کنید
3. **مانیتورینگ:** بعد از Deploy، عملکرد را مانیتور کنید
4. **Rollback:** اگر مشکلی پیش آمد، می‌توانید Worker قدیمی را دوباره فعال کنید

---

**تاریخ:** $(date)  
**وضعیت:** ✅ **آماده برای پیاده‌سازی**

