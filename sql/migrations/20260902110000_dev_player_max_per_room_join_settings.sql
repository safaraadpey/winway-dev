-- Per-template Dev Player cap for the join-target waiting room (profile-only engine).
-- NULL = unlimited. 0 = do not schedule Dev Players for that template.

BEGIN;

ALTER TABLE public.dev_player_template_join_settings
  ADD COLUMN IF NOT EXISTS max_dev_players_per_room integer;

ALTER TABLE public.dev_player_template_join_settings
  DROP CONSTRAINT IF EXISTS dev_player_template_join_settings_max_dev_check;

ALTER TABLE public.dev_player_template_join_settings
  ADD CONSTRAINT dev_player_template_join_settings_max_dev_check
  CHECK (
    max_dev_players_per_room IS NULL
    OR (
      max_dev_players_per_room >= 0
      AND max_dev_players_per_room <= 99
    )
  );

COMMENT ON COLUMN public.dev_player_template_join_settings.max_dev_players_per_room IS
  'Max enabled Dev Players in the oldest waiting room for this template. NULL = unlimited.';

COMMIT;
