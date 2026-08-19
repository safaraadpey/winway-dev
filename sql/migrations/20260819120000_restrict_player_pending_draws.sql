-- Players must not read draw numbers before the engine marks them processed.
-- UI/API already filter processed_at IS NOT NULL; RLS was the gap (SELECT USING true).
-- service_role / engine paths bypass RLS and keep full access.

BEGIN;

DROP POLICY IF EXISTS "draws_read_public" ON public.draws;

CREATE POLICY "draws_read_public" ON public.draws
  FOR SELECT
  USING (processed_at IS NOT NULL);

COMMIT;
