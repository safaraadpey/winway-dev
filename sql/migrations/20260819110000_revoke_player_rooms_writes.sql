-- Defense in depth: browser roles cannot mutate public.rooms directly.
-- Writes already blocked by RLS (no INSERT/UPDATE/DELETE policies); room creation
-- uses SECURITY DEFINER RPCs and service_role/engine paths.
-- SELECT column allowlist from 20260819103000 remains unchanged.

BEGIN;

REVOKE INSERT, UPDATE, DELETE ON TABLE public.rooms FROM anon, authenticated;

COMMIT;
