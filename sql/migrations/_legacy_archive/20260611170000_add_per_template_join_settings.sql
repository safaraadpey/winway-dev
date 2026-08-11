-- Per-template join interval and max joins per tick (moved from global settings)
BEGIN;

ALTER TABLE public.dev_player_template_room_limits
  ADD COLUMN IF NOT EXISTS join_interval_minutes integer,
  ADD COLUMN IF NOT EXISTS max_joins_per_tick integer;

ALTER TABLE public.dev_player_template_room_limits
  DROP CONSTRAINT IF EXISTS dev_player_template_room_limits_has_value_check;

ALTER TABLE public.dev_player_template_room_limits
  DROP CONSTRAINT IF EXISTS dev_player_template_room_limits_join_interval_check;

ALTER TABLE public.dev_player_template_room_limits
  DROP CONSTRAINT IF EXISTS dev_player_template_room_limits_max_joins_check;

ALTER TABLE public.dev_player_template_room_limits
  ADD CONSTRAINT dev_player_template_room_limits_join_interval_check
    CHECK (join_interval_minutes IS NULL OR (join_interval_minutes >= 1 AND join_interval_minutes <= 120)),
  ADD CONSTRAINT dev_player_template_room_limits_max_joins_check
    CHECK (max_joins_per_tick IS NULL OR (max_joins_per_tick >= 1 AND max_joins_per_tick <= 100)),
  ADD CONSTRAINT dev_player_template_room_limits_has_value_check
    CHECK (
      min_active_rooms IS NOT NULL
      OR max_active_rooms IS NOT NULL
      OR join_interval_minutes IS NOT NULL
      OR max_joins_per_tick IS NOT NULL
    );

ALTER TABLE public.dev_player_settings
  DROP CONSTRAINT IF EXISTS dev_player_settings_join_interval_check,
  DROP CONSTRAINT IF EXISTS dev_player_settings_max_joins_per_tick_check;

ALTER TABLE public.dev_player_settings
  DROP COLUMN IF EXISTS join_interval_minutes,
  DROP COLUMN IF EXISTS max_joins_per_tick;

COMMIT;
