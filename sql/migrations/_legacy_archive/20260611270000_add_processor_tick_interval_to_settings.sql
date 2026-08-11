-- Processor tick interval configurable from Dev Panel (like scheduler tick)
BEGIN;

ALTER TABLE public.dev_player_settings
  ADD COLUMN IF NOT EXISTS processor_tick_interval_seconds integer NOT NULL DEFAULT 60;

ALTER TABLE public.dev_player_settings
  DROP CONSTRAINT IF EXISTS dev_player_settings_processor_tick_interval_check;

ALTER TABLE public.dev_player_settings
  ADD CONSTRAINT dev_player_settings_processor_tick_interval_check
    CHECK (processor_tick_interval_seconds >= 5 AND processor_tick_interval_seconds <= 3600);

COMMENT ON COLUMN public.dev_player_settings.processor_tick_interval_seconds IS
  'How often game-engine dev-player-processor picks and runs dev_room_schedules (seconds).';

COMMIT;
