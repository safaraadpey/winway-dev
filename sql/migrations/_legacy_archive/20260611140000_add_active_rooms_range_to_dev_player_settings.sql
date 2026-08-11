-- Gate dev player joins by active room count per template
BEGIN;

ALTER TABLE public.dev_player_settings
  ADD COLUMN IF NOT EXISTS min_active_rooms_per_template integer,
  ADD COLUMN IF NOT EXISTS max_active_rooms_per_template integer;

ALTER TABLE public.dev_player_settings
  DROP CONSTRAINT IF EXISTS dev_player_settings_active_rooms_range_check;

ALTER TABLE public.dev_player_settings
  ADD CONSTRAINT dev_player_settings_active_rooms_range_check
    CHECK (
      (min_active_rooms_per_template IS NULL OR min_active_rooms_per_template >= 0)
      AND (max_active_rooms_per_template IS NULL OR max_active_rooms_per_template >= 0)
      AND (
        min_active_rooms_per_template IS NULL
        OR max_active_rooms_per_template IS NULL
        OR min_active_rooms_per_template <= max_active_rooms_per_template
      )
    );

COMMENT ON COLUMN public.dev_player_settings.min_active_rooms_per_template IS
  'Join dev players only when active rooms (waiting/playing) per template >= this value.';
COMMENT ON COLUMN public.dev_player_settings.max_active_rooms_per_template IS
  'Join dev players only when active rooms (waiting/playing) per template <= this value.';

COMMIT;
