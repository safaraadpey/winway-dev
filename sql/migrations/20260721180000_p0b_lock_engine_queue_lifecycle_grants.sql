-- P0-B: Remove anon/authenticated/PUBLIC direct access to engine/queue/lifecycle primitives.
-- Applied to main (gtwgatewbagklpmxdlsj). See docs/security/DING_MONEY_P0B_ENGINE_QUEUE_LIFECYCLE_REMEDIATION_REPORT.md.
-- Trusted paths: game-engine service_role, postgres/pg_cron owner, SECURITY DEFINER internals.
BEGIN;

CREATE OR REPLACE FUNCTION pg_temp.p0b_lock_fn_to_service_role(p_fn regprocedure)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC', p_fn);
  EXECUTE format('REVOKE ALL ON FUNCTION %s FROM anon', p_fn);
  EXECUTE format('REVOKE ALL ON FUNCTION %s FROM authenticated', p_fn);
  EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', p_fn);
END;
$$;

DO $$
DECLARE
  fn regprocedure;
BEGIN
  FOREACH fn IN ARRAY ARRAY[
    'public.fn_heartbeat_tick()'::regprocedure,
    'public.rpc_pick_draw_jobs(integer)'::regprocedure,
    'public.rpc_requeue_failed_draw_jobs()'::regprocedure,
    'public.fn_process_draw_jobs_batch()'::regprocedure,
    'public.fn_process_draw_jobs_batch_worker(integer,integer)'::regprocedure,
    'public.rpc_apply_marks_for_draw(uuid,integer)'::regprocedure,
    'public.rpc_claim_game_room(uuid,text,integer)'::regprocedure,
    'public.rpc_renew_game_room_lease(uuid,text,integer,bigint)'::regprocedure,
    'public.rpc_release_game_room(uuid,text,bigint)'::regprocedure,
    'public.rpc_insert_draw_if_ready(uuid,integer,timestamp with time zone,integer)'::regprocedure,
    'public.rpc_insert_draw_if_ready_owner_guard(uuid,integer,timestamp with time zone,text,integer,timestamp with time zone,bigint)'::regprocedure,
    'game_core.rpc_pick_draw_jobs(integer)'::regprocedure,
    'game_core.rpc_pick_draw_jobs(integer,integer,integer)'::regprocedure,
    'game_core.fn_requeue_failed_draw_jobs()'::regprocedure,
    'game_core.fn_manage_waiting_rooms(integer,boolean)'::regprocedure,
    'game_core.fn_manage_room_live_actions()'::regprocedure,
    'game_core.fn_janitor_sweep()'::regprocedure,
    'game_core.fn_janitor_repair_unsettled_finished(integer)'::regprocedure,
    'game_core.fn_stamp_orphan_draws_on_terminal_rooms()'::regprocedure,
    'game_core.rpc_apply_marks_for_draw(uuid,integer)'::regprocedure
  ] LOOP
    PERFORM pg_temp.p0b_lock_fn_to_service_role(fn);
  END LOOP;
END;
$$;

REVOKE ALL ON TABLE public.app_runtime_flags FROM anon;
REVOKE ALL ON TABLE public.app_runtime_flags FROM authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE, REFERENCES, TRIGGER ON TABLE public.app_runtime_flags TO service_role;

COMMIT;
