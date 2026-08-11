-- Allow scheduler tick as low as 5 seconds (Dev Panel setting)
BEGIN;

ALTER TABLE public.dev_player_settings
  DROP CONSTRAINT IF EXISTS dev_player_settings_scheduler_tick_interval_check;

ALTER TABLE public.dev_player_settings
  ADD CONSTRAINT dev_player_settings_scheduler_tick_interval_check
    CHECK (scheduler_tick_interval_seconds >= 5 AND scheduler_tick_interval_seconds <= 3600);

COMMIT;
