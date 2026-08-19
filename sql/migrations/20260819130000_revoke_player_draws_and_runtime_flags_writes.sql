-- Defense in depth: browser roles cannot mutate draws or runtime flags directly.
-- Writes already blocked by RLS (no write policies on draws; no policies at all on
-- app_runtime_flags). Engine/admin use service_role; registration lock reads go
-- through server APIs with service_role.

BEGIN;

REVOKE INSERT, UPDATE, DELETE ON TABLE public.draws FROM anon, authenticated;

REVOKE INSERT, UPDATE, DELETE ON TABLE public.app_runtime_flags FROM anon, authenticated;

COMMIT;
