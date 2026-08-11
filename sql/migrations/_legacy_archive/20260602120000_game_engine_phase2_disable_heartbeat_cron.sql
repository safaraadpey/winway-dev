-- Phase 2: game-engine room-scheduler owns fn_heartbeat_tick (hybrid).
-- Disable pg_cron bingo_heartbeat; engine runs scheduler+draw-processor roles.
-- Rollback: scripts/game-engine-cron-heartbeat.sql (RESTORE section).

SELECT cron.unschedule(jobid)
FROM cron.job
WHERE jobname = 'bingo_heartbeat';
