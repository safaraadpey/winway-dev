-- Migration: Add processed_at to draws and mark fully processed draws
-- Date: 2025-12-09

BEGIN;

-- 1) ستون processed_at برای تشخیص تکمیل پردازش هر draw
ALTER TABLE public.draws
  ADD COLUMN IF NOT EXISTS processed_at timestamptz NULL;

-- ایندکس کمکی برای فیلتر/مرتب‌سازی روی وضعیت پردازش یک اتاق
CREATE INDEX IF NOT EXISTS idx_draws_room_processed_at
  ON public.draws (room_id, processed_at);

-- 2) به‌روزرسانی worker پردازش draw_jobs
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
  FOR job IN
    SELECT *
    FROM game_core.rpc_pick_draw_jobs(
      p_limit => 100,
      p_worker_id => p_worker_id,
      p_total_workers => p_total_workers
    )
  LOOP
    BEGIN
      PERFORM public.rpc_apply_marks_for_draw(
        job.room_id,
        job.draw_number
      );

      PERFORM public.fn_evaluate_room_after_draw(
        job.room_id,
        job.draw_number
      );

      UPDATE public.draw_jobs
      SET status = 'done',
          updated_at = now()
      WHERE id = job.id;

      -- پس از اینکه این job با موفقیت done شد، بررسی می‌کنیم
      -- آیا این آخرین job مربوط به این draw است یا نه.
      PERFORM 1
      FROM public.draw_jobs
      WHERE room_id = job.room_id
        AND draw_number = job.draw_number
        AND status <> 'done'
      LIMIT 1;

      IF NOT FOUND THEN
        -- یعنی دیگر هیچ job فعالی مربوط به این draw باقی نمانده
        -- بنابراین draw کاملاً پردازش شده و می‌توانیم processed_at را ست کنیم
        UPDATE public.draws
        SET processed_at = now()
        WHERE room_id = job.room_id
          AND number   = job.draw_number
          AND processed_at IS NULL;
      END IF;
    EXCEPTION
      WHEN OTHERS THEN
        UPDATE public.draw_jobs
        SET status   = 'queued',
            attempts = COALESCE(job.attempts, 0) + 1,
            updated_at = now()
        WHERE id = job.id;
        
        RAISE WARNING 'Error processing job %: %', job.id, SQLERRM;
    END;
  END LOOP;
END;
$function$;

ALTER FUNCTION public.fn_process_draw_jobs_batch_worker(integer, integer) OWNER TO postgres;

COMMIT;
