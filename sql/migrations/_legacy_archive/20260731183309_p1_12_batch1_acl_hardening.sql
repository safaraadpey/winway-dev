-- P1.12 Batch 1: ACL harden P1.11 Batch1-Ready UNSAFE RPCs (DEV).
-- Project: yqnptpreowkimopxicfz
-- Scope: REVOKE/GRANT EXECUTE only — no DROP, no CREATE OR REPLACE, no body/cron/trigger/RLS changes.
-- Target ACL: postgres + service_role EXECUTE; no PUBLIC / anon / authenticated.
-- Source: docs/audits/p1-11-unsafe-rpc-remediation.md (Batch1 Ready = YES only).
-- EXCLUDED: public.fn_admin_create/update/delete_tournament (BLOCKED);
--   fn_wallet_apply_delta (HYBRID); all CLIENT_RPC; Batch 0 / P1.7 targets.

BEGIN;

DO $$
DECLARE
  fn regprocedure;
  targets regprocedure[] := ARRAY[
    'game_core.fn_confirm_win(uuid, uuid, text)'::regprocedure,
    'game_core.fn_payout_room(uuid)'::regprocedure,
    'game_finance.fn_payout_room_prize(uuid)'::regprocedure,
    'game_finance.fn_payout_winners(uuid)'::regprocedure,
    'public.fn_payout_room_if_full(uuid)'::regprocedure,
    'public.distribute_ding_on_draw()'::regprocedure,
    'public.update_ding_balance(uuid, numeric)'::regprocedure,
    'public.rpc_backfill_missed_engine_ding(uuid)'::regprocedure,
    'public.fn_tournament_wallet_capture(uuid, uuid, numeric, text)'::regprocedure,
    'public.debug_ticket_counts(uuid)'::regprocedure,
    'public.debug_runtime_context(uuid)'::regprocedure,
    'public.test_active_cards_bypass_rls(uuid)'::regprocedure
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
