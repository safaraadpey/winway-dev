-- P1.9B Batch 0: ACL harden proven server-only game/finance engine RPCs (DEV).
-- Project: yqnptpreowkimopxicfz
-- Scope: REVOKE/GRANT EXECUTE only — no DROP, no CREATE OR REPLACE, no body/cron/trigger changes.
-- Target ACL: postgres + service_role EXECUTE; no PUBLIC / anon / authenticated.
-- Does NOT touch: P1.7 quarantined orchestrators; fn_wallet_apply_delta (admin API);
--   player/admin product RPCs (join, transfer panel, dashboard, etc.).
-- Evidence: docs/audits/p1-9b-batch-0-server-only-acl-hardening.md
-- DO NOT APPLY until operator approval (BATCH_0_READY_FOR_APPROVAL).

BEGIN;

DO $$
DECLARE
  fn regprocedure;
  targets regprocedure[] := ARRAY[
    -- Engine room lease / claim
    'public.rpc_claim_game_room(uuid, text, integer)'::regprocedure,
    'public.rpc_release_game_room(uuid, text, bigint)'::regprocedure,
    'public.rpc_renew_game_room_lease(uuid, text, integer, bigint)'::regprocedure,
    'public.rpc_find_claimable_playing_rooms(integer)'::regprocedure,
    -- Draw pipeline
    'public.rpc_has_earlier_unprocessed_draw(uuid, integer)'::regprocedure,
    'public.rpc_insert_draw_if_ready(uuid, integer, timestamp with time zone, integer)'::regprocedure,
    'public.rpc_insert_draw_if_ready_owner_guard(uuid, integer, timestamp with time zone, text, integer, timestamp with time zone, bigint)'::regprocedure,
    'public.rpc_pick_draw_jobs(integer)'::regprocedure,
    'game_core.rpc_pick_draw_jobs(integer)'::regprocedure,
    'game_core.rpc_pick_draw_jobs(integer, integer, integer)'::regprocedure,
    'public.rpc_apply_marks_for_draw(uuid, integer)'::regprocedure,
    'game_core.rpc_apply_marks_for_draw(uuid, integer)'::regprocedure,
    'public.rpc_finalize_engine_draw_job(bigint, uuid, integer, jsonb, jsonb, boolean, integer, jsonb, integer, integer, timestamp with time zone, timestamp with time zone, timestamp with time zone, timestamp with time zone, timestamp with time zone, text, bigint)'::regprocedure,
    'public.rpc_apply_ding_credits_for_draw(uuid, integer, integer, jsonb)'::regprocedure,
    -- Evaluate / settle / commission / janitor (Railway + nested DEFINER)
    'public.fn_evaluate_room_after_draw(uuid, integer)'::regprocedure,
    'game_core.fn_evaluate_room_after_draw(uuid, integer)'::regprocedure,
    'public.fn_finish_room_and_settle(uuid, uuid)'::regprocedure,
    'game_finance.fn_finish_room_and_settle(uuid, uuid)'::regprocedure,
    'game_finance.fn_record_ticket_commission(uuid)'::regprocedure,
    'game_finance.fn_distribute_ticket_commission(uuid, uuid)'::regprocedure,
    'public.fn_janitor_repair_unsettled_finished(integer)'::regprocedure,
    'game_core.fn_janitor_repair_unsettled_finished(integer)'::regprocedure
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
