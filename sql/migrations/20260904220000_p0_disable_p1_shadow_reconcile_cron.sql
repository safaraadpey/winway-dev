-- P0 incident mitigation: disable platform_shadow_reconcile cron again.
-- P1 incremental fn_shadow_reconcile() and shadow_reconcile_state remain for manual use.
-- platform_shadow_drain (10s) unchanged. No gameplay/player rows touched.

DO $$
BEGIN
  PERFORM cron.unschedule('platform_shadow_reconcile');
EXCEPTION WHEN OTHERS THEN
  NULL; -- idempotent if already unscheduled
END$$;

-- ROLLBACK (re-enable after soak — do not auto-run):
-- SELECT cron.schedule(
--   'platform_shadow_reconcile',
--   '*/5 * * * *',
--   $$SELECT platform.fn_shadow_reconcile(200);$$
-- );
