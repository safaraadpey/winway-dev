-- Migration: add price snapshot back to tickets
-- Date: 2025-12-02

BEGIN;

-- این مهاجرت فقط تضمین می‌کند ستون price روی tickets وجود داشته باشد و مقداردهی شود.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name   = 'tickets'
      AND column_name  = 'price'
  ) THEN
    ALTER TABLE public.tickets
      ADD COLUMN price numeric(10,2);

    UPDATE public.tickets t
       SET price = COALESCE(r.card_price, rt.price, 0)
      FROM public.rooms r
      LEFT JOIN public.room_templates rt ON rt.id = r.room_template_id
     WHERE t.room_id = r.id;

    ALTER TABLE public.tickets
      ALTER COLUMN price SET NOT NULL;
  END IF;
END;
$$;

COMMIT;


