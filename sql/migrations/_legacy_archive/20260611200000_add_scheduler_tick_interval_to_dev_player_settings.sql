-- Global scheduler tick interval (seconds) — read by game-engine dev-player-scheduler
BEGIN;

ALTER TABLE public.dev_player_settings
  ADD COLUMN IF NOT EXISTS scheduler_tick_interval_seconds integer NOT NULL DEFAULT 60;

ALTER TABLE public.dev_player_settings
  DROP CONSTRAINT IF EXISTS dev_player_settings_scheduler_tick_interval_check;

ALTER TABLE public.dev_player_settings
  ADD CONSTRAINT dev_player_settings_scheduler_tick_interval_check
    CHECK (scheduler_tick_interval_seconds >= 10 AND scheduler_tick_interval_seconds <= 3600);

COMMENT ON COLUMN public.dev_player_settings.scheduler_tick_interval_seconds IS
  'How often game-engine dev-player-scheduler runs a tick (seconds).';

COMMIT;
