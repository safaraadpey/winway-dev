-- Ensure ledger idempotency unique index exists in every environment.
-- Documented in docs/security/p6-4-monetary-integrity-hardening.md but was
-- missing as an explicit CREATE in repository migrations (live DEV already had it).

BEGIN;

CREATE UNIQUE INDEX IF NOT EXISTS ux_tx_idempotency
  ON public.transactions (idempotency_key)
  WHERE idempotency_key IS NOT NULL;

COMMENT ON INDEX public.ux_tx_idempotency IS
  'P6.4: exactly-once ledger rows for non-null idempotency_key (fn_wallet_apply_delta)';

COMMIT;

-- DOWN:
-- BEGIN;
-- DROP INDEX IF EXISTS public.ux_tx_idempotency;
-- COMMIT;
