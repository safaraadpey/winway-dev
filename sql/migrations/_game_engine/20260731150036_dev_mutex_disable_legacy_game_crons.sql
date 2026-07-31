-- DEV-ONLY ops SQL: mutex so Railway game-engine owns game lifecycle clocks.
--
-- DO NOT place this file in sql/migrations/*.sql top-level auto-apply chain.
-- Location under _game_engine/ is intentional: operators apply manually to
-- Supabase project yqnptpreowkimopxicfz (DEV) only, via the runbook:
--   docs/runbooks/dev-game-cron-mutex-apply.md
--
-- Target jobs (unschedule only if present - idempotent):
--   bingo_heartbeat
--   bingo_draw_worker_1
--   bingo_draw_worker_2
--   bingo_draw_worker_3
--
-- Safety: if more than 4 matching rows exist (duplicate jobnames), abort
-- BEFORE any unschedule (transactional DO block).
--
-- MUST NOT touch:
--   fn_janitor_sweep
--   fn_generate_card_pool_step
--   heartbeat_log_partitions
--   cleanup_retention
--
-- Does NOT drop functions/RPCs. Rollback = re-schedule only (see runbook).
-- Canonical DISABLE/RESTORE references:
--   scripts/game-engine-cron-heartbeat.sql
--   scripts/game-engine-cron-draw-workers.sql

DO $$
DECLARE
  target_job record;
  matched_count integer := 0;
  unscheduled_count integer := 0;
BEGIN
  SELECT count(*)::integer
  INTO matched_count
  FROM cron.job
  WHERE jobname IN (
    'bingo_heartbeat',
    'bingo_draw_worker_1',
    'bingo_draw_worker_2',
    'bingo_draw_worker_3'
  );

  IF matched_count > 4 THEN
    RAISE EXCEPTION
      'dev_mutex aborted: expected at most 4 target jobs, found %',
      matched_count;
  END IF;

  FOR target_job IN
    SELECT jobid, jobname
    FROM cron.job
    WHERE jobname IN (
      'bingo_heartbeat',
      'bingo_draw_worker_1',
      'bingo_draw_worker_2',
      'bingo_draw_worker_3'
    )
    ORDER BY jobid
  LOOP
    PERFORM cron.unschedule(target_job.jobid);
    unscheduled_count := unscheduled_count + 1;

    RAISE NOTICE
      'dev_mutex: unscheduled cron job % (jobid=%)',
      target_job.jobname,
      target_job.jobid;
  END LOOP;

  RAISE NOTICE
    'dev_mutex complete: matched=%, unscheduled=%',
    matched_count,
    unscheduled_count;
END
$$;
