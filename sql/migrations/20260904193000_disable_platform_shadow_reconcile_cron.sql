-- P0: Disable platform_shadow_reconcile (full-table scan caused DB saturation).
-- Shadow mirror remains via triggers + platform_shadow_drain (10s).
-- fn_shadow_reconcile() is retained for manual/rollback use only.

DO $$
BEGIN
  PERFORM cron.unschedule('platform_shadow_reconcile');
EXCEPTION WHEN OTHERS THEN
  NULL; -- idempotent if already unscheduled
END$$;

-- ROLLBACK (do not auto-run):
-- SELECT cron.schedule(
--   'platform_shadow_reconcile',
--   '* * * * *',
--   $$SELECT platform.fn_shadow_reconcile(200); SELECT platform.fn_shadow_drain(100);$$
-- );
