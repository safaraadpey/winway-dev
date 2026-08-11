-- Cyclical scheduler pause: work for N seconds, then pause for M seconds (repeats daily from midnight in timezone)
BEGIN;

ALTER TABLE public.dev_player_settings
  ADD COLUMN IF NOT EXISTS scheduler_pause_after_seconds integer,
  ADD COLUMN IF NOT EXISTS scheduler_pause_duration_seconds integer;

ALTER TABLE public.dev_player_settings
  DROP CONSTRAINT IF EXISTS dev_player_settings_scheduler_pause_after_check;

ALTER TABLE public.dev_player_settings
  ADD CONSTRAINT dev_player_settings_scheduler_pause_after_check
    CHECK (
      scheduler_pause_after_seconds IS NULL
      OR (scheduler_pause_after_seconds >= 5 AND scheduler_pause_after_seconds <= 86400)
    );

ALTER TABLE public.dev_player_settings
  DROP CONSTRAINT IF EXISTS dev_player_settings_scheduler_pause_duration_check;

ALTER TABLE public.dev_player_settings
  ADD CONSTRAINT dev_player_settings_scheduler_pause_duration_check
    CHECK (
      scheduler_pause_duration_seconds IS NULL
      OR (scheduler_pause_duration_seconds >= 5 AND scheduler_pause_duration_seconds <= 86400)
    );

ALTER TABLE public.dev_player_settings
  DROP CONSTRAINT IF EXISTS dev_player_settings_scheduler_pause_pair_check;

ALTER TABLE public.dev_player_settings
  ADD CONSTRAINT dev_player_settings_scheduler_pause_pair_check
    CHECK (
      (scheduler_pause_after_seconds IS NULL AND scheduler_pause_duration_seconds IS NULL)
      OR (
        scheduler_pause_after_seconds IS NOT NULL
        AND scheduler_pause_duration_seconds IS NOT NULL
      )
    );

COMMENT ON COLUMN public.dev_player_settings.scheduler_pause_after_seconds IS
  'Active scheduler window length (seconds) before each cyclical pause.';
COMMENT ON COLUMN public.dev_player_settings.scheduler_pause_duration_seconds IS
  'Scheduler pause length (seconds) after each active window.';

COMMIT;
