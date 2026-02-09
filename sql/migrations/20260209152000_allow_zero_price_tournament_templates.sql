BEGIN;

-- Allow price=0 only for tournament room templates.
ALTER TABLE public.room_templates
  DROP CONSTRAINT IF EXISTS room_templates_price_check;

ALTER TABLE public.room_templates
  ADD CONSTRAINT room_templates_price_check
  CHECK (
    price > 0
    OR (room_type = 'tournament'::public.room_type AND price = 0)
  );

COMMIT;

