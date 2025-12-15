-- ============================================
-- پیاده‌سازی Workerهای موازی
-- ============================================
-- تاریخ: $(date)
-- هدف: تقسیم بار کاری بین 3 Worker

-- ============================================
-- گام 1: بهینه‌سازی rpc_pick_draw_jobs برای Worker ID
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
DECLARE
  v_job_ids bigint[];
BEGIN
  -- ابتدا Jobها را انتخاب و UPDATE می‌کنیم
  WITH available_jobs AS (
    SELECT 
      dj.id,
      -- استفاده از ABS برای اطمینان از مقدار مثبت
      ABS(MOD(hashtext(dj.room_id::text), p_total_workers)) as worker_hash
    FROM public.draw_jobs dj
    WHERE dj.status = 'queued'
    FOR UPDATE SKIP LOCKED
    LIMIT p_limit * p_total_workers
  ),
  worker_jobs AS (
    SELECT aj.id
    FROM available_jobs aj
    WHERE aj.worker_hash = p_worker_id - 1
    LIMIT p_limit
  )
  SELECT ARRAY_AGG(wj.id) INTO v_job_ids
  FROM worker_jobs wj;
  
  -- اگر Jobی پیدا نشد، خروج
  IF v_job_ids IS NULL OR array_length(v_job_ids, 1) IS NULL THEN
    RETURN;
  END IF;
  
  -- UPDATE Jobها (با استفاده از alias برای جلوگیری از ambiguous)
  UPDATE public.draw_jobs AS dj
  SET status = 'processing',
      attempts = dj.attempts + 1,
      updated_at = NOW()
  WHERE dj.id = ANY(v_job_ids);
  
  -- Return Jobها
  RETURN QUERY
  SELECT 
    dj2.id,
    dj2.room_id,
    dj2.draw_number,
    dj2.status,
    dj2.attempts,
    dj2.created_at,
    dj2.updated_at
  FROM public.draw_jobs dj2
  WHERE dj2.id = ANY(v_job_ids)
  ORDER BY dj2.created_at;
END;
$function$;

-- ============================================
-- گام 2: ایجاد Function جدید برای Workerهای موازی
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

-- ============================================
-- گام 3: غیرفعال کردن Worker قدیمی
-- ============================================
-- SELECT cron.unschedule('bingo_draw_worker');

-- ============================================
-- گام 4: ایجاد Workerهای موازی در pg_cron
-- ============================================
-- Worker 1
-- SELECT cron.schedule(
--   'bingo_draw_worker_1',
--   '1 second',
--   $$ SELECT public.fn_process_draw_jobs_batch_worker(1, 3); $$
-- );

-- Worker 2
-- SELECT cron.schedule(
--   'bingo_draw_worker_2',
--   '1 second',
--   $$ SELECT public.fn_process_draw_jobs_batch_worker(2, 3); $$
-- );

-- Worker 3
-- SELECT cron.schedule(
--   'bingo_draw_worker_3',
--   '1 second',
--   $$ SELECT public.fn_process_draw_jobs_batch_worker(3, 3); $$
-- );

-- ============================================
-- بررسی Workerهای ایجاد شده
-- ============================================
SELECT 
    jobid,
    jobname,
    schedule,
    active,
    command
FROM cron.job
WHERE jobname LIKE 'bingo_draw_worker%'
ORDER BY jobid;

