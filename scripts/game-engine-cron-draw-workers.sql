-- Game-engine migration: draw job workers (replaces pg_cron jobs 11-13 style).
-- Run DISABLE before starting game-engine with GAME_RUNTIME=hybrid|engine and draw-processor role.
-- Run RESTORE on rollback (GAME_RUNTIME=legacy_db, stop engine draw-processor).

-- ========== DISABLE (engine owns draw_jobs) ==========
-- Safe to run multiple times (unschedule returns void; ignore if job missing).
SELECT cron.unschedule(jobid)
FROM cron.job
WHERE jobname IN ('bingo_draw_worker_1', 'bingo_draw_worker_2', 'bingo_draw_worker_3');

-- ========== RESTORE (DB owns draw_jobs again) ==========
-- Run when rolling back (stop game-engine draw-processor first):

SELECT cron.schedule(
  'bingo_draw_worker_1',
  '1 second',
  $$SELECT public.fn_process_draw_jobs_batch_worker(1, 3);$$
);
SELECT cron.schedule(
  'bingo_draw_worker_2',
  '1 second',
  $$SELECT public.fn_process_draw_jobs_batch_worker(2, 3);$$
);
SELECT cron.schedule(
  'bingo_draw_worker_3',
  '1 second',
  $$SELECT public.fn_process_draw_jobs_batch_worker(3, 3);$$
);

-- ========== VERIFY ==========
-- SELECT jobid, jobname, schedule, active, command FROM cron.job ORDER BY jobid;
