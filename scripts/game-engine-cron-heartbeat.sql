-- Game-engine migration Phase 2: room scheduler (replaces fn_heartbeat_tick cron).
-- Run DISABLE only after draw-processor hybrid is stable AND engine runs scheduler role.

-- ========== DISABLE ==========
SELECT cron.unschedule(jobid)
FROM cron.job
WHERE jobname = 'bingo_heartbeat';

-- ========== RESTORE ==========
-- SELECT cron.schedule(
--   'bingo_heartbeat',
--   '1 second',
--   $$SELECT public.fn_heartbeat_tick();$$
-- );
