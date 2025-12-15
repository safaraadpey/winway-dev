-- Migration: Guard fn_join_or_create_room by room_templates.status
-- تاریخ: 2025-11-28
--
-- هدف:
-- 1) جلوگیری از استفاده از تمپلیت‌های آرشیوشده (status = 'inactive') در
--    RPC `fn_join_or_create_room`.
-- 2) آماده‌سازی برای منطق «در حال انتقال به آرشیو» (draining) در سطح دیتابیس،
--    بدون دست زدن به بدنه فعلی فانکشن اصلی.
--
-- روش:
-- - فانکشن فعلی را به نام `fn_join_or_create_room_base` تغییر نام می‌دهیم
--   (همان امضای سه‌پارامتری).
-- - یک Wrapper جدید با نام اصلی `fn_join_or_create_room` می‌سازیم که:
--     * status تمپلیت را از `room_templates` می‌خواند؛
--     * اگر `inactive` بود → خطا می‌دهد؛
--     * در غیر این صورت، نتیجه را از `fn_join_or_create_room_base` برمی‌گرداند.

BEGIN;

-- =====================================================================
-- 1) تغییر نام فانکشن اصلی به نسخه‌ی پایه
-- =====================================================================

-- توجه: این فانکشن باید از قبل در دیتابیس وجود داشته باشد.
-- امضا: (p_template_id uuid, p_card_count integer, p_password text)
ALTER FUNCTION public.fn_join_or_create_room(
  p_template_id uuid,
  p_card_count integer,
  p_password text
)
RENAME TO fn_join_or_create_room_base;

-- =====================================================================
-- 2) Wrapper جدید با چک کردن status تمپلیت
-- =====================================================================

CREATE OR REPLACE FUNCTION public.fn_join_or_create_room(
  p_template_id uuid,
  p_card_count integer,
  p_password text DEFAULT NULL
)
RETURNS TABLE (
  room_id    uuid,
  starts_at  timestamptz,
  ticket_ids uuid[]
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
DECLARE
  v_status public.room_template_status;
BEGIN
  -- 1) خواندن وضعیت تمپلیت
  SELECT status
    INTO v_status
  FROM public.room_templates
  WHERE id = p_template_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'room template not found: %', p_template_id;
  END IF;

  -- 2) جلوگیری از استفاده از تمپلیت آرشیوشده (inactive)
  IF v_status = 'inactive' THEN
    RAISE EXCEPTION 'room template is inactive';
  END IF;

  -- نکته:
  -- - برای status = 'active' و 'draining'، منطق فعلی تابع پایه اجرا می‌شود.
  -- - کنترل ظریف‌تر روی تمپلیت‌های draining (اجازه فقط join و ممنوعیت create)
  --   در لایه فرانت/سرویس‌ها انجام شده است؛ در صورت نیاز می‌توان اینجا هم
  --   به‌صورت کامل پیاده‌سازی کرد.

  -- 3) فراخوانی فانکشن پایه و برگرداندن نتیجه
  RETURN QUERY
  SELECT room_id, starts_at, ticket_ids
  FROM public.fn_join_or_create_room_base(p_template_id, p_card_count, p_password);
END;
$function$;

COMMIT;


