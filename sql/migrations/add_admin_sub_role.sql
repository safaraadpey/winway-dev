-- Migration: اضافه کردن admin_sub_role برای رول‌های فرعی ادمین
-- تاریخ: 2025-11-22
-- توضیحات: اضافه کردن ستون admin_sub_role برای تفکیک دسترسی‌های ادمین‌ها
--           مقادیر: manager (مدیر کل), finance (مالی), support (پشتیبانی), room (اتاق‌ها)

BEGIN;

-- 1. ایجاد ENUM برای admin sub roles
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'admin_sub_role') THEN
    CREATE TYPE admin_sub_role AS ENUM (
      'manager',    -- مدیر کل - دسترسی کامل
      'finance',    -- ادمین مالی - دسترسی به تراکنش‌ها و گزارش‌های مالی
      'support',    -- ادمین پشتیبانی - دسترسی به تیکت‌ها و مدیریت کاربران
      'room'        -- ادمین اتاق‌ها - دسترسی به مدیریت room_templates و rooms
    );
  END IF;
END $$;

-- 2. اضافه کردن ستون admin_sub_role به جدول users
ALTER TABLE public.users
ADD COLUMN IF NOT EXISTS admin_sub_role admin_sub_role;

-- 3. اضافه کردن comment برای ستون
COMMENT ON COLUMN public.users.admin_sub_role IS 
  'نقش فرعی ادمین - فقط برای کاربران با role=admin استفاده می‌شود. NULL به معنای مدیر کل است.';

-- 4. ایجاد index برای جستجوی سریع‌تر
CREATE INDEX IF NOT EXISTS idx_users_admin_sub_role 
ON public.users(admin_sub_role) 
WHERE admin_sub_role IS NOT NULL;

-- 5. اضافه کردن CHECK constraint
-- فقط کاربران با role='admin' می‌توانند admin_sub_role داشته باشند
-- اگر role != 'admin' باشد، admin_sub_role باید NULL باشد
ALTER TABLE public.users
DROP CONSTRAINT IF EXISTS check_admin_sub_role_only_for_admin;

ALTER TABLE public.users
ADD CONSTRAINT check_admin_sub_role_only_for_admin 
CHECK (
  (role = 'admin' AND (admin_sub_role IS NOT NULL OR admin_sub_role IS NULL)) OR
  (role != 'admin' AND admin_sub_role IS NULL)
);

-- 6. به‌روزرسانی comment برای جدول
COMMENT ON TABLE public.users IS 
  'جدول کاربران - role اصلی کاربر را نگه می‌دارد. admin_sub_role فقط برای ادمین‌ها استفاده می‌شود.';

COMMIT;

