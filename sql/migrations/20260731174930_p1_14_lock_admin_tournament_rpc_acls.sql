-- P1.14: Lock ACL on public admin tournament mutation RPCs (DEV).
-- Project: yqnptpreowkimopxicfz
-- Scope: REVOKE/GRANT EXECUTE only — no DROP, no CREATE OR REPLACE, no body/mode/cron/trigger/RLS/app changes.
-- Targets (public wrappers only; tournament.* schema functions unchanged):
--   public.fn_admin_create_tournament(jsonb)
--   public.fn_admin_update_tournament(uuid, jsonb)
--   public.fn_admin_delete_tournament(uuid)
-- Target ACL:
--   REVOKE EXECUTE FROM PUBLIC
--   REVOKE EXECUTE FROM anon
--   KEEP / GRANT EXECUTE for authenticated, service_role, postgres
-- Prerequisite: P1.13 — browser no longer calls these; Admin API uses authenticated JWT.

BEGIN;

DO $$
DECLARE
  fn regprocedure;
  targets regprocedure[] := ARRAY[
    'public.fn_admin_create_tournament(jsonb)'::regprocedure,
    'public.fn_admin_update_tournament(uuid, jsonb)'::regprocedure,
    'public.fn_admin_delete_tournament(uuid)'::regprocedure
  ];
BEGIN
  FOREACH fn IN ARRAY targets
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC', fn);
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM anon', fn);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO postgres', fn);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated', fn);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', fn);
  END LOOP;
END;
$$;

COMMIT;
