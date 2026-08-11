-- Phase 5: game-engine tournament-orchestrator owns tournament tick (hybrid).
-- Rollback: scripts/game-engine-cron-tournament.sql (RESTORE section).

SELECT cron.unschedule(jobid)
FROM cron.job
WHERE jobname = 'tournament.fn_tick_due_tournaments';
