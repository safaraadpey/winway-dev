-- Allow super/agent to read subordinate commission rollup rows on user account pages.

BEGIN;

CREATE POLICY commission_daily_stats_super_subordinate_read
  ON public.commission_daily_stats
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM public.users viewer
      JOIN public.users subject ON subject.id = commission_daily_stats.user_id
      WHERE viewer.id = auth.uid()
        AND viewer.role = 'super'::public.user_role
        AND subject.parent_id = viewer.id
    )
  );

CREATE POLICY commission_daily_stats_agent_subordinate_read
  ON public.commission_daily_stats
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM public.users viewer
      JOIN public.users subject ON subject.id = commission_daily_stats.user_id
      WHERE viewer.id = auth.uid()
        AND viewer.role = 'agent'::public.user_role
        AND subject.parent_id = viewer.id
        AND subject.role = 'agent'::public.user_role
    )
  );

COMMIT;
