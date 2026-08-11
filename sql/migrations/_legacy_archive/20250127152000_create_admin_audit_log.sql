-- Migration: ایجاد جدول admin_audit_log برای ثبت عملیات حساس ادمین
-- تاریخ: 2025-01-27
-- توضیحات: این جدول برای audit logging عملیات حساس ادمین استفاده می‌شود
--           تمام تغییرات مهم (تغییر نقش، تعلیق، تنظیمات اقتصادی) در این جدول ثبت می‌شوند

BEGIN;

-- ============================================================================
-- 1. ایجاد جدول admin_audit_log
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.admin_audit_log (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_id      uuid       NOT NULL,
  action        text       NOT NULL,
  target_table  text       NOT NULL,
  target_id     text       NULL,
  payload       jsonb      NOT NULL DEFAULT '{}'::jsonb,
  ip_address    text       NULL,
  user_agent    text       NULL,
  created_at    timestamptz NOT NULL DEFAULT now()
);

-- ============================================================================
-- 2. ایجاد index برای جستجوی سریع‌تر
-- ============================================================================

-- Index برای جستجو بر اساس admin_id
CREATE INDEX IF NOT EXISTS idx_admin_audit_log_admin_id 
  ON public.admin_audit_log(admin_id);

-- Index برای جستجو بر اساس action
CREATE INDEX IF NOT EXISTS idx_admin_audit_log_action 
  ON public.admin_audit_log(action);

-- Index برای جستجو بر اساس target_table و target_id
CREATE INDEX IF NOT EXISTS idx_admin_audit_log_target 
  ON public.admin_audit_log(target_table, target_id);

-- Index برای جستجو بر اساس created_at (برای گزارش‌های زمانی)
CREATE INDEX IF NOT EXISTS idx_admin_audit_log_created_at 
  ON public.admin_audit_log(created_at DESC);

-- ============================================================================
-- 3. Foreign key constraint (اختیاری - برای referential integrity)
-- ============================================================================

-- Foreign key به جدول users (admin_id)
ALTER TABLE public.admin_audit_log
  ADD CONSTRAINT fk_admin_audit_log_admin_id
  FOREIGN KEY (admin_id)
  REFERENCES public.users(id)
  ON DELETE SET NULL; -- اگر admin حذف شد، admin_id را null می‌کند (نه حذف رکورد)

-- ============================================================================
-- 4. RLS Policy (اختیاری - برای محدود کردن دسترسی)
-- ============================================================================

-- فعال‌سازی RLS
ALTER TABLE public.admin_audit_log ENABLE ROW LEVEL SECURITY;

-- Policy: فقط admin می‌تواند audit log را ببیند
CREATE POLICY "admin_can_view_audit_log"
ON public.admin_audit_log
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.users
    WHERE users.id = auth.uid()
    AND users.role = 'admin'
  )
);

-- ============================================================================
-- 5. Comment برای مستندسازی
-- ============================================================================

COMMENT ON TABLE public.admin_audit_log IS
  'جدول ثبت عملیات حساس ادمین - برای audit trail و traceability';

COMMENT ON COLUMN public.admin_audit_log.id IS
  'شناسه یکتا رکورد';

COMMENT ON COLUMN public.admin_audit_log.admin_id IS
  'شناسه ادمینی که عملیات را انجام داده است';

COMMENT ON COLUMN public.admin_audit_log.action IS
  'نوع عملیات (مثلاً: change_user_role, toggle_suspension, set_commission, ...)';

COMMENT ON COLUMN public.admin_audit_log.target_table IS
  'نام جدول هدف (مثلاً: users, room_templates, user_commissions, ...)';

COMMENT ON COLUMN public.admin_audit_log.target_id IS
  'شناسه رکورد هدف (مثلاً: user_id, template_id, ...)';

COMMENT ON COLUMN public.admin_audit_log.payload IS
  'داده‌های اضافی عملیات (JSONB) - شامل مقادیر قبل/بعد، پارامترها، و غیره';

COMMENT ON COLUMN public.admin_audit_log.ip_address IS
  'آدرس IP ادمین (برای security tracking)';

COMMENT ON COLUMN public.admin_audit_log.user_agent IS
  'User agent ادمین (برای security tracking)';

COMMENT ON COLUMN public.admin_audit_log.created_at IS
  'زمان انجام عملیات';

-- ============================================================================
-- 6. مثال‌های استفاده (کامنت شده)
-- ============================================================================

/*
-- مثال 1: ثبت تغییر نقش کاربر
INSERT INTO public.admin_audit_log (
  admin_id,
  action,
  target_table,
  target_id,
  payload,
  ip_address,
  user_agent
)
VALUES (
  'admin-uuid-here',
  'change_user_role',
  'users',
  'target-user-uuid',
  '{"old_role": "player", "new_role": "agent", "admin_sub_role": null}'::jsonb,
  '192.168.1.1',
  'Mozilla/5.0 ...'
);

-- مثال 2: ثبت تعلیق کاربر
INSERT INTO public.admin_audit_log (
  admin_id,
  action,
  target_table,
  target_id,
  payload,
  ip_address,
  user_agent
)
VALUES (
  'admin-uuid-here',
  'toggle_user_suspension',
  'users',
  'target-user-uuid',
  '{"old_status": "active", "new_status": "suspended"}'::jsonb,
  '192.168.1.1',
  'Mozilla/5.0 ...'
);

-- مثال 3: ثبت تنظیم کمیسیون
INSERT INTO public.admin_audit_log (
  admin_id,
  action,
  target_table,
  target_id,
  payload,
  ip_address,
  user_agent
)
VALUES (
  'admin-uuid-here',
  'set_commission',
  'user_commissions',
  'target-user-uuid',
  '{"role": "agent", "commission_percent": 15, "commission_decimal": 0.15}'::jsonb,
  '192.168.1.1',
  'Mozilla/5.0 ...'
);

-- مثال 4: جستجوی audit log برای یک admin
SELECT 
  id,
  action,
  target_table,
  target_id,
  payload,
  created_at
FROM public.admin_audit_log
WHERE admin_id = 'admin-uuid-here'
ORDER BY created_at DESC
LIMIT 50;

-- مثال 5: جستجوی audit log برای یک کاربر خاص
SELECT 
  id,
  admin_id,
  action,
  payload,
  created_at
FROM public.admin_audit_log
WHERE target_table = 'users'
  AND target_id = 'target-user-uuid'
ORDER BY created_at DESC;
*/

COMMIT;

