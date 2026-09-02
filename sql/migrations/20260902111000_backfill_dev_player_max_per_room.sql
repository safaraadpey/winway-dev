-- Copy existing per-template caps from the active join preset into join settings
-- so the profile-only engine can enforce them without a blank reset.

BEGIN;

UPDATE public.dev_player_template_join_settings s
SET max_dev_players_per_room = l.max_dev_players_per_room
FROM public.dev_player_settings st
JOIN public.dev_player_join_preset_template_limits l
  ON l.preset_id = st.active_join_preset_id
WHERE s.template_id = l.template_id
  AND s.max_dev_players_per_room IS NULL
  AND l.max_dev_players_per_room IS NOT NULL;

COMMIT;
