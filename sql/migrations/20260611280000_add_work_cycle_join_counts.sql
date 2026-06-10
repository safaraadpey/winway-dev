-- Per-template join count within the current work phase (before pause)
BEGIN;

ALTER TABLE public.dev_player_settings
  ADD COLUMN IF NOT EXISTS scheduler_joins_in_work_cycle_by_template jsonb NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN public.dev_player_settings.scheduler_joins_in_work_cycle_by_template IS
  'Map of template_id -> join schedules created in the current work phase (resets when work phase starts).';

COMMENT ON COLUMN public.dev_player_join_preset_template_limits.max_joins_per_tick IS
  'Max dev-player joins per template during each work phase (before scheduler pause).';

COMMIT;
