-- Time-of-day overrides for Dev Player join rhythm / room cap per template.
-- Empty array = use join_delay_max_seconds + max_dev_players_per_room all day.

BEGIN;

ALTER TABLE public.dev_player_template_join_settings
  ADD COLUMN IF NOT EXISTS rhythm_windows jsonb NOT NULL DEFAULT '[]'::jsonb;

COMMENT ON COLUMN public.dev_player_template_join_settings.rhythm_windows IS
  'Time-of-day overrides [{start,end,joinDelayMaxSeconds,maxDevPlayersPerRoom}]. First matching [start,end) in scheduler timezone wins; empty uses row defaults.';

COMMIT;
