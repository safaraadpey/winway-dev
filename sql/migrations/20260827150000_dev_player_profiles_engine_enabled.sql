-- Dev player profiles: engine toggle (scheduler uses only engine_enabled profiles).

BEGIN;

ALTER TABLE public.dev_player_profiles
  ADD COLUMN IF NOT EXISTS engine_enabled boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.dev_player_profiles.engine_enabled IS
  'When true, this profile participates in the Dev Player join scheduler.';

CREATE INDEX IF NOT EXISTS idx_dev_player_profiles_engine_enabled
  ON public.dev_player_profiles (engine_enabled)
  WHERE engine_enabled = true;

COMMIT;
