-- Leo: remember last applied preset name on each player.

BEGIN;

ALTER TABLE public.leo_user_configs
  ADD COLUMN IF NOT EXISTS applied_preset_name text;

ALTER TABLE public.leo_user_configs
  DROP CONSTRAINT IF EXISTS leo_user_configs_applied_preset_name_check;

ALTER TABLE public.leo_user_configs
  ADD CONSTRAINT leo_user_configs_applied_preset_name_check
  CHECK (applied_preset_name IS NULL OR length(trim(applied_preset_name)) BETWEEN 1 AND 80);

COMMENT ON COLUMN public.leo_user_configs.applied_preset_name IS
  'Last Leo config preset name applied to this player in Dev Panel.';

COMMIT;
