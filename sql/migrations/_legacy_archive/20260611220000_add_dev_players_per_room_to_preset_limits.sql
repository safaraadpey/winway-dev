-- Per-template min/max dev players in the join-target waiting room
BEGIN;

ALTER TABLE public.dev_player_join_preset_template_limits
  ADD COLUMN IF NOT EXISTS min_dev_players_per_room integer,
  ADD COLUMN IF NOT EXISTS max_dev_players_per_room integer;

ALTER TABLE public.dev_player_join_preset_template_limits
  DROP CONSTRAINT IF EXISTS dev_player_join_preset_template_limits_min_dev_check;

ALTER TABLE public.dev_player_join_preset_template_limits
  ADD CONSTRAINT dev_player_join_preset_template_limits_min_dev_check
    CHECK (min_dev_players_per_room IS NULL OR min_dev_players_per_room >= 0);

ALTER TABLE public.dev_player_join_preset_template_limits
  DROP CONSTRAINT IF EXISTS dev_player_join_preset_template_limits_max_dev_check;

ALTER TABLE public.dev_player_join_preset_template_limits
  ADD CONSTRAINT dev_player_join_preset_template_limits_max_dev_check
    CHECK (max_dev_players_per_room IS NULL OR max_dev_players_per_room >= 0);

ALTER TABLE public.dev_player_join_preset_template_limits
  DROP CONSTRAINT IF EXISTS dev_player_join_preset_template_limits_dev_range_check;

ALTER TABLE public.dev_player_join_preset_template_limits
  ADD CONSTRAINT dev_player_join_preset_template_limits_dev_range_check
    CHECK (
      min_dev_players_per_room IS NULL
      OR max_dev_players_per_room IS NULL
      OR min_dev_players_per_room <= max_dev_players_per_room
    );

ALTER TABLE public.dev_player_join_preset_template_limits
  DROP CONSTRAINT IF EXISTS dev_player_join_preset_template_limits_has_value_check;

ALTER TABLE public.dev_player_join_preset_template_limits
  ADD CONSTRAINT dev_player_join_preset_template_limits_has_value_check
    CHECK (
      min_active_rooms IS NOT NULL
      OR max_active_rooms IS NOT NULL
      OR join_interval_minutes IS NOT NULL
      OR max_joins_per_tick IS NOT NULL
      OR min_dev_players_per_room IS NOT NULL
      OR max_dev_players_per_room IS NOT NULL
    );

COMMENT ON COLUMN public.dev_player_join_preset_template_limits.min_dev_players_per_room IS
  'Minimum enabled dev players in the oldest waiting room (join target) before scheduler stops filling.';
COMMENT ON COLUMN public.dev_player_join_preset_template_limits.max_dev_players_per_room IS
  'Maximum enabled dev players allowed in the oldest waiting room (join target).';

COMMIT;
