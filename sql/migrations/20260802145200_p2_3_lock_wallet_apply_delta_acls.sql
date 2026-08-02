-- P2.3: Lock ACL on fn_wallet_apply_delta (public + game_finance).
-- Project: yqnptpreowkimopxicfz
-- Evidence: docs/audits/p2-2-wallet-red-team-review.md → SAFE_TO_LOCK_WALLET_APPLY_DELTA
-- Scope: REVOKE/GRANT EXECUTE only — no body/signature/mode/owner/cron/trigger/RLS/app changes.
-- Target ACL: postgres + service_role EXECUTE; no PUBLIC / anon / authenticated.

BEGIN;

DO $$
DECLARE
  fn regprocedure;
  targets regprocedure[] := ARRAY[
    'public.fn_wallet_apply_delta(uuid, text, numeric, transaction_type, text, text, text, jsonb, boolean)'::regprocedure,
    'game_finance.fn_wallet_apply_delta(uuid, text, numeric, transaction_type, text, text, text, jsonb, boolean)'::regprocedure
  ];
BEGIN
  FOREACH fn IN ARRAY targets
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC', fn);
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM anon', fn);
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM authenticated', fn);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO postgres', fn);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', fn);
  END LOOP;
END;
$$;

COMMIT;
