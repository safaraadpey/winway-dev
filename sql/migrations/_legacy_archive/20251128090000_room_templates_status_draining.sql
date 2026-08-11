-- Migration: Add room_templates.status (active | draining | inactive)
-- و منطق «خاموش شدن تدریجی» تمپلیت‌ها
-- تاریخ: 2025-11-28
--
-- ایده:
-- - ستون جدید status روی room_templates:
--     - active   : تمپلیت فعال است و می‌توان روم جدید ساخت
--     - draining : در حال خاموش شدن؛ روم جدید نباید ساخته شود
--     - inactive : کاملاً غیرفعال؛ فقط برای گزارش
-- - تریگر روی rooms:
--     - وقتی آخرین روم یک تمپلیت (waiting/playing) از بین رفت
--       و status تمپلیت = 'draining' بود، آن تمپلیت به 'inactive' تغییر می‌کند.

BEGIN;

-- ====================================================================
-- 1) تعریف enum برای وضعیت تمپلیت
-- ====================================================================

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_type
    WHERE typname = 'room_template_status'
  ) THEN
    CREATE TYPE public.room_template_status AS ENUM (
      'active',
      'draining',
      'inactive'
    );
  END IF;
END;
$$;

-- ====================================================================
-- 2) افزودن ستون status به room_templates
-- ====================================================================

ALTER TABLE public.room_templates
  ADD COLUMN IF NOT EXISTS status public.room_template_status NOT NULL DEFAULT 'active';

-- اطمینان از این‌که تمام ردیف‌های فعلی مقدار مشخص دارند
UPDATE public.room_templates
SET status = 'active'
WHERE status IS NULL;

-- ایندکس کم‌هزینه برای فیلتر کردن بر اساس status (مثلاً در لابی)
CREATE INDEX IF NOT EXISTS idx_room_templates_status
  ON public.room_templates (status);

-- ====================================================================
-- 3) تابع کمکی: اگر تمپلیت در حال draining باشد و هیچ روم فعالی نداشته باشد،
--    آن را inactive کن.
-- ====================================================================

CREATE OR REPLACE FUNCTION public.fn_try_mark_template_inactive_if_drained(
  p_template_id uuid
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
DECLARE
  v_status public.room_template_status;
  v_active_rooms_count integer;
BEGIN
  IF p_template_id IS NULL THEN
    RETURN;
  END IF;

  SELECT status
  INTO v_status
  FROM public.room_templates
  WHERE id = p_template_id;

  -- اگر تمپلیت پیدا نشد یا در حالت draining نیست، کاری نکن
  IF NOT FOUND OR v_status IS DISTINCT FROM 'draining' THEN
    RETURN;
  END IF;

  -- شمارش روم‌های منتظر/در حال بازی برای این تمپلیت
  SELECT COUNT(*)
  INTO v_active_rooms_count
  FROM public.rooms
  WHERE room_template_id = p_template_id
    AND status IN ('waiting', 'playing');

  -- اگر هیچ رومی در حال استفاده نبود، تمپلیت را inactive کن
  IF v_active_rooms_count = 0 THEN
    UPDATE public.room_templates
    SET status = 'inactive'
    WHERE id = p_template_id
      AND status = 'draining';
  END IF;
END;
$function$;

-- ====================================================================
-- 4) تریگر روی rooms: بعد از تغییر status، خروج از waiting/playing را
--    رصد می‌کند و در صورت لزوم تمپلیت را inactive می‌کند.
-- ====================================================================

CREATE OR REPLACE FUNCTION public.trg_rooms_status_template_draining()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
BEGIN
  -- فقط وقتی معنی‌دار است که روم از حالت waiting/playing به حالت دیگری برود
  IF TG_OP = 'UPDATE'
     AND OLD.status IN ('waiting', 'playing')
     AND NEW.status NOT IN ('waiting', 'playing') THEN
    PERFORM public.fn_try_mark_template_inactive_if_drained(NEW.room_template_id);
  END IF;

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_rooms_status_template_draining ON public.rooms;

CREATE TRIGGER trg_rooms_status_template_draining
AFTER UPDATE OF status ON public.rooms
FOR EACH ROW
EXECUTE FUNCTION public.trg_rooms_status_template_draining();

COMMIT;


