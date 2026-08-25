-- Entry banners: optional close button and "don't show again" checkbox.
-- When show_close_button is false, the player-facing modal shows an X icon at the top instead.

BEGIN;

ALTER TABLE public.entry_banners
  ADD COLUMN IF NOT EXISTS show_close_button boolean NOT NULL DEFAULT true;

ALTER TABLE public.entry_banners
  ADD COLUMN IF NOT EXISTS show_dont_show_again boolean NOT NULL DEFAULT true;

COMMENT ON COLUMN public.entry_banners.show_close_button IS
  'Whether the bottom close button is shown on the player-facing modal. When false, an X icon is shown at the top instead.';

COMMENT ON COLUMN public.entry_banners.show_dont_show_again IS
  'Whether the do-not-show-again checkbox is shown. Ignored when require_confirmation is true.';

COMMIT;
