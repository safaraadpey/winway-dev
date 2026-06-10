-- Play windows for join presets (when templates in preset may run joins)
BEGIN;

ALTER TABLE public.dev_player_join_presets
  ADD COLUMN IF NOT EXISTS play_windows jsonb NOT NULL
    DEFAULT '[{"start":"10:00","end":"22:00"}]'::jsonb;

COMMENT ON COLUMN public.dev_player_join_presets.play_windows IS
  'Daily time windows when this join preset is active (same format as dev_player_configs.play_windows).';

COMMIT;
