-- Align dev_player_configs metadata with dev naming (post bot→dev rename)
BEGIN;

COMMENT ON TABLE public.dev_player_configs IS
  'Per-user dev player behavior for Dev Panel: play windows, room price bounds, max tickets.';

COMMENT ON COLUMN public.dev_player_configs.is_enabled IS
  'When true, user is treated as an active dev player.';

COMMIT;
