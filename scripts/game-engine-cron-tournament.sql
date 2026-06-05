-- Game-engine migration Phase 5: tournament orchestrator (replaces tournament tick cron).
-- Run DISABLE only after game-engine runs tournament-orchestrator role (hybrid|engine).

-- ========== DISABLE ==========
SELECT cron.unschedule(jobid)
FROM cron.job
WHERE jobname = 'tournament.fn_tick_due_tournaments';

-- ========== RESTORE ==========
-- Stop game-engine tournament-orchestrator first, then:
-- SELECT cron.schedule(
--   'tournament.fn_tick_due_tournaments',
--   '5 seconds',
--   $$SELECT tournament.fn_tick_due_tournaments(50, NULL, NULL);$$
-- );

-- ========== VERIFY ==========
-- SELECT jobid, jobname, schedule, active, command FROM cron.job ORDER BY jobid;
