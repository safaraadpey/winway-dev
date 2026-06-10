-- Join interval per template: minutes -> seconds (existing values multiplied by 60)
BEGIN;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'dev_player_join_preset_template_limits'
      AND column_name = 'join_interval_minutes'
  ) THEN
    ALTER TABLE public.dev_player_join_preset_template_limits
      RENAME COLUMN join_interval_minutes TO join_interval_seconds;
  END IF;
END $$;

ALTER TABLE public.dev_player_join_preset_template_limits
  DROP CONSTRAINT IF EXISTS dev_player_join_preset_template_limits_join_interval_check;

UPDATE public.dev_player_join_preset_template_limits
  SET join_interval_seconds = join_interval_seconds * 60
  WHERE join_interval_seconds IS NOT NULL
    AND join_interval_seconds <= 120;

ALTER TABLE public.dev_player_join_preset_template_limits
  ADD CONSTRAINT dev_player_join_preset_template_limits_join_interval_check
    CHECK (join_interval_seconds IS NULL OR (join_interval_seconds >= 5 AND join_interval_seconds <= 7200));

ALTER TABLE public.dev_player_join_preset_template_limits
  DROP CONSTRAINT IF EXISTS dev_player_join_preset_template_limits_has_value_check;

ALTER TABLE public.dev_player_join_preset_template_limits
  ADD CONSTRAINT dev_player_join_preset_template_limits_has_value_check
    CHECK (
      min_active_rooms IS NOT NULL
      OR max_active_rooms IS NOT NULL
      OR join_interval_seconds IS NOT NULL
      OR max_joins_per_tick IS NOT NULL
      OR min_dev_players_per_room IS NOT NULL
      OR max_dev_players_per_room IS NOT NULL
    );

COMMENT ON COLUMN public.dev_player_join_preset_template_limits.join_interval_seconds IS
  'Minimum seconds between dev player schedule inserts for this template.';

COMMIT;
