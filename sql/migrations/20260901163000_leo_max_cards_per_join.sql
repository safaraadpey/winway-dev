-- Leo engine: max cards per round_join (0 = unlimited).

BEGIN;

ALTER TABLE public.leo_settings
  ADD COLUMN IF NOT EXISTS max_leo_cards_per_join integer
    NOT NULL DEFAULT 0
    CHECK (max_leo_cards_per_join BETWEEN 0 AND 99);

COMMENT ON COLUMN public.leo_settings.max_leo_cards_per_join IS
  'Max cards Leo buys per round_join. 0 means no cap.';

COMMIT;
