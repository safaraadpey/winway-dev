-- Per-template quick fill flag on join preset limits (Dev Panel only; engine wiring later)
BEGIN;

ALTER TABLE public.dev_player_join_preset_template_limits
  ADD COLUMN IF NOT EXISTS quick_fill_enabled boolean NOT NULL DEFAULT false;

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
      OR quick_fill_enabled = true
    );

COMMENT ON COLUMN public.dev_player_join_preset_template_limits.quick_fill_enabled IS
  'Per-template quick fill mode (Dev Panel). Engine behavior wired separately.';

COMMIT;
