-- P1.7: ACL lockdown for legacy DB game orchestrators (DEV / Final Pre-Launch).
-- Project: yqnptpreowkimopxicfz
-- Scope: REVOKE/GRANT EXECUTE only — no DROP, no CREATE OR REPLACE, no cron changes.
-- Preserves: postgres + service_role (Railway hybrid rollback / postgres owner).
-- Does NOT touch: rpc_pick_draw_jobs, lease/claim/insert, settle, wallet, janitor, card-pool.

BEGIN;

DO $$
DECLARE
  fn regprocedure;
  targets regprocedure[] := ARRAY[
    'public.fn_heartbeat_tick()'::regprocedure,
    'public.fn_process_draw_jobs_batch()'::regprocedure,
    'public.fn_process_draw_jobs_batch_worker(integer,integer)'::regprocedure,
    'game_core.fn_manage_waiting_rooms(integer,boolean)'::regprocedure,
    'game_core.fn_manage_room_live_actions()'::regprocedure
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
