-- P2.0 Batch 2: Low-risk ACL hardening (DEV) — APPLIED 2026-08-02 via MCP apply_migration p2_0_batch2_acl.
-- Project: yqnptpreowkimopxicfz
-- Source: docs/audits/p1-15-admin-agent-rpc-audit.md (Batch2 ACL = YES)
-- Scope: REVOKE/GRANT EXECUTE only — no DROP, no CREATE OR REPLACE, no body/mode/cron/trigger/RLS/app changes.
-- Target ACL: postgres + service_role EXECUTE; no PUBLIC / anon / authenticated.
-- EXCLUDED by brief / re-verification: all fn_wallet_apply_delta; fn_admin_set_tournament_status;
--   tournament.*; wallet transfer overloads with live JWT API use; trigger functions; soft-only candidates.

BEGIN;

DO $$
DECLARE
  fn regprocedure;
  targets regprocedure[] := ARRAY[
    'public.fn_admin_games_report(timestamp with time zone, timestamp with time zone, integer, integer)'::regprocedure,
    'public.fn_generate_card_pool(integer, uuid, text)'::regprocedure,
    'public.fn_adjust_wallet_manual(uuid, numeric, text, transaction_type, text)'::regprocedure,
    'public.fn_adjust_referral_wallet(uuid, numeric, text, transaction_type, text)'::regprocedure
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
