-- P1 Migration B: Re-enable platform_shadow_reconcile cron (incremental only).
-- Gated: apply only after all P1 proofs pass.
-- No tail drain — platform_shadow_drain (10s) covers live mirroring.

DO $$
BEGIN
  PERFORM cron.unschedule('platform_shadow_reconcile');
EXCEPTION WHEN OTHERS THEN
  NULL;
END$$;

SELECT cron.schedule(
  'platform_shadow_reconcile',
  '*/5 * * * *',
  $$SELECT platform.fn_shadow_reconcile(200);$$
);

-- ROLLBACK (return to P0 disabled):
-- SELECT cron.unschedule('platform_shadow_reconcile');
