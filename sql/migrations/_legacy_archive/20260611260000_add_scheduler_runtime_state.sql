-- Random work/pause cycle + per-template next join timestamps for dev player manager
BEGIN;

ALTER TABLE public.dev_player_settings
  ADD COLUMN IF NOT EXISTS scheduler_cycle_phase text NOT NULL DEFAULT 'work',
  ADD COLUMN IF NOT EXISTS scheduler_cycle_phase_ends_at timestamptz,
  ADD COLUMN IF NOT EXISTS scheduler_next_join_at_by_template jsonb NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE public.dev_player_settings
  DROP CONSTRAINT IF EXISTS dev_player_settings_scheduler_cycle_phase_check;

ALTER TABLE public.dev_player_settings
  ADD CONSTRAINT dev_player_settings_scheduler_cycle_phase_check
    CHECK (scheduler_cycle_phase IN ('work', 'pause'));

COMMENT ON COLUMN public.dev_player_settings.scheduler_cycle_phase IS
  'Current random scheduler cycle phase: work or pause.';
COMMENT ON COLUMN public.dev_player_settings.scheduler_cycle_phase_ends_at IS
  'UTC timestamp when the current work/pause phase ends and the next phase begins.';
COMMENT ON COLUMN public.dev_player_settings.scheduler_next_join_at_by_template IS
  'Map of template_id -> ISO timestamp: earliest allowed next dev player join for that template.';

COMMIT;
