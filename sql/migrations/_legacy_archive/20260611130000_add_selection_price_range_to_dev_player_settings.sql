-- Price range for template selection strategy (any_in_price_range)
BEGIN;

ALTER TABLE public.dev_player_settings
  ADD COLUMN IF NOT EXISTS selection_min_room_price numeric,
  ADD COLUMN IF NOT EXISTS selection_max_room_price numeric;

ALTER TABLE public.dev_player_settings
  DROP CONSTRAINT IF EXISTS dev_player_settings_selection_price_range_check;

ALTER TABLE public.dev_player_settings
  ADD CONSTRAINT dev_player_settings_selection_price_range_check
    CHECK (
      selection_min_room_price IS NULL
      OR selection_max_room_price IS NULL
      OR selection_min_room_price <= selection_max_room_price
    );

COMMENT ON COLUMN public.dev_player_settings.selection_min_room_price IS
  'Min room template price when template_selection_mode = any_in_price_range.';
COMMENT ON COLUMN public.dev_player_settings.selection_max_room_price IS
  'Max room template price when template_selection_mode = any_in_price_range.';

COMMIT;
