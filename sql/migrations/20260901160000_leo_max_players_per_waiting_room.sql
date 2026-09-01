-- Leo engine: max Leo players per waiting room (0 = unlimited).

BEGIN;

ALTER TABLE public.leo_settings
  ADD COLUMN IF NOT EXISTS max_leo_players_per_waiting_room integer
    NOT NULL DEFAULT 3
    CHECK (max_leo_players_per_waiting_room BETWEEN 0 AND 50);

COMMENT ON COLUMN public.leo_settings.max_leo_players_per_waiting_room IS
  'Max Leo-enabled players allowed in a single waiting room. 0 means no Leo cap.';

COMMIT;
