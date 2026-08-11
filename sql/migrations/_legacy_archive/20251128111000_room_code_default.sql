-- Migration: Ensure rooms.room_code always has a generated value
-- تاریخ: 2025-11-28
--
-- هدف:
-- 1) ایجاد یک فانکشن کمکی برای ساخت room_code یکتا/خوانا (۶ کاراکتر هگز)
-- 2) تنظیم DEFAULT روی ستون room_code تا در صورت عدم ارسال مقدار، مقدار معتبر دریافت کند.
-- 3) پاکسازی ردیف‌های احتمالی null (در محیط‌های توسعه) برای جلوگیری از مغایرت‌های بعدی.

BEGIN;

CREATE OR REPLACE FUNCTION public.fn_generate_room_code()
RETURNS text
LANGUAGE sql
STABLE
AS $function$
  SELECT upper(substr(encode(gen_random_bytes(4), 'hex'), 1, 6));
$function$;

ALTER TABLE public.rooms
  ALTER COLUMN room_code SET DEFAULT public.fn_generate_room_code();

UPDATE public.rooms
SET room_code = public.fn_generate_room_code()
WHERE room_code IS NULL;

COMMIT;


