-- Entry banners: optional player-facing title.
-- Title stays required for admin identification; show_title controls modal display.

BEGIN;

ALTER TABLE public.entry_banners
  ADD COLUMN IF NOT EXISTS show_title boolean NOT NULL DEFAULT true;

COMMENT ON COLUMN public.entry_banners.show_title IS
  'Whether the banner title is shown on the player-facing modal. Title is still stored for admin identification.';

COMMIT;
