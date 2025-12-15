-- Migration: Create public.fn_join_or_create_room_base wrapper
-- تاریخ: 2025-11-28
--
-- هدف:
-- در حال حاضر wrapper تابع `public.fn_join_or_create_room` در مایگریشن‌های
-- `20251128091500_guard_fn_join_or_create_room_status.sql` و
-- `20251128100000_guard_join_or_create_room_suspension.sql`
-- این تابع داخلی را صدا می‌زند:
--
--   public.fn_join_or_create_room_base(p_template_id uuid, p_card_count integer, p_password text)
--
-- اما در اسکیمای فعلی، نسخه‌ی پایه در schema دیگری (مثلاً `game_core`) تعریف شده است.
-- این مایگریشن یک Shim در schema `public` می‌سازد که فقط درخواست را به نسخه‌ی
-- اصلی در `game_core` پاس می‌دهد، تا خطای
-- "function public.fn_join_or_create_room_base(uuid, integer, text) does not exist"
-- برطرف شود.

BEGIN;

-- توجه:
-- اگر در آینده نام یا schema تابع پایه تغییر کرد، کافی است داخل این wrapper
-- به‌روزرسانی شود؛ امضای خارجی آن باید ثابت بماند، چون توسط RPC و فرانت‌اند
-- استفاده می‌شود.

CREATE OR REPLACE FUNCTION public.fn_join_or_create_room_base(
  p_template_id uuid,
  p_card_count integer,
  p_password text
)
RETURNS TABLE (
  room_id    uuid,
  starts_at  timestamptz,
  ticket_ids uuid[]
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
BEGIN
  -- اینجا فرض می‌کنیم نسخه‌ی اصلی در schema `game_core` قرار دارد.
  -- اگر نام یا schema دقیق متفاوت است، این SELECT باید مطابق آن اصلاح شود.
  --
  -- از RETURN QUERY SELECT * استفاده می‌کنیم تا از ابهام روی نام ستون room_id
  -- (بین پارامترهای خروجی و ستون‌های نتیجه) جلوگیری شود.
  RETURN QUERY
  SELECT *
  FROM game_core.fn_join_or_create_room_base(p_template_id, p_card_count, p_password);
END;
$function$;

COMMIT;


