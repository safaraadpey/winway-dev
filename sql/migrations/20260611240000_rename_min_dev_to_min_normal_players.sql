-- Min gate is normal (non-dev) players in join-target waiting room, not dev players
BEGIN;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'dev_player_join_preset_template_limits'
      AND column_name = 'min_dev_players_per_room'
  ) THEN
    ALTER TABLE public.dev_player_join_preset_template_limits
      RENAME COLUMN min_dev_players_per_room TO min_normal_players_per_room;
  END IF;
END $$;

ALTER TABLE public.dev_player_join_preset_template_limits
  DROP CONSTRAINT IF EXISTS dev_player_join_preset_template_limits_min_dev_check;

ALTER TABLE public.dev_player_join_preset_template_limits
  DROP CONSTRAINT IF EXISTS dev_player_join_preset_template_limits_dev_range_check;

ALTER TABLE public.dev_player_join_preset_template_limits
  ADD CONSTRAINT dev_player_join_preset_template_limits_min_normal_check
    CHECK (min_normal_players_per_room IS NULL OR min_normal_players_per_room >= 0);

ALTER TABLE public.dev_player_join_preset_template_limits
  DROP CONSTRAINT IF EXISTS dev_player_join_preset_template_limits_has_value_check;

ALTER TABLE public.dev_player_join_preset_template_limits
  ADD CONSTRAINT dev_player_join_preset_template_limits_has_value_check
    CHECK (
      min_active_rooms IS NOT NULL
      OR max_active_rooms IS NOT NULL
      OR join_interval_seconds IS NOT NULL
      OR max_joins_per_tick IS NOT NULL
      OR min_normal_players_per_room IS NOT NULL
      OR max_dev_players_per_room IS NOT NULL
    );

COMMENT ON COLUMN public.dev_player_join_preset_template_limits.min_normal_players_per_room IS
  'Require at least this many non-dev players in the join-target waiting room before dev players may join.';

COMMIT;
