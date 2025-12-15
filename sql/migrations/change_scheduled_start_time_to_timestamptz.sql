-- Migration: تغییر scheduled_start_time از time به timestamptz
-- تاریخ: 2025-11-22
-- توضیحات: برای پشتیبانی از تاریخ و ساعت کامل برای تورنومنت‌ها

BEGIN;

-- 1) تغییر نوع ستون در room_templates
-- اگر داده‌ای وجود دارد، ابتدا باید تبدیل شود
-- در اینجا فرض می‌کنیم که داده‌های موجود null هستند یا باید به timestamptz تبدیل شوند

-- ابتدا یک ستون موقت اضافه می‌کنیم
ALTER TABLE public.room_templates
ADD COLUMN IF NOT EXISTS scheduled_start_time_new timestamptz;

-- تبدیل داده‌های موجود (اگر time بود، به امروز + آن time تبدیل می‌شود)
-- اما چون احتمالاً null است، این تبدیل را انجام نمی‌دهیم
-- UPDATE public.room_templates
-- SET scheduled_start_time_new = 
--   CASE 
--     WHEN scheduled_start_time IS NOT NULL 
--     THEN (CURRENT_DATE + scheduled_start_time)::timestamptz
--     ELSE NULL
--   END;

-- حذف ستون قدیمی
ALTER TABLE public.room_templates
DROP COLUMN IF EXISTS scheduled_start_time;

-- تغییر نام ستون جدید به نام اصلی
ALTER TABLE public.room_templates
RENAME COLUMN scheduled_start_time_new TO scheduled_start_time;

-- اضافه کردن comment
COMMENT ON COLUMN public.room_templates.scheduled_start_time IS 
  'تاریخ و زمان شروع برنامه‌ریزی‌شده Room (timestamptz) - برای تورنومنت‌ها';

-- 2) تغییر نوع ستون در rooms (اگر وجود دارد)
-- این ستون در rooms احتمالاً override است و باید به timestamptz تبدیل شود
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
      AND table_name = 'rooms' 
      AND column_name = 'scheduled_start_time'
      AND data_type = 'time without time zone'
  ) THEN
    -- تبدیل ستون در rooms
    ALTER TABLE public.rooms
    ADD COLUMN IF NOT EXISTS scheduled_start_time_new timestamptz;
    
    -- تبدیل داده‌های موجود (اگر وجود داشته باشد)
    -- UPDATE public.rooms
    -- SET scheduled_start_time_new = 
    --   CASE 
    --     WHEN scheduled_start_time IS NOT NULL 
    --     THEN (CURRENT_DATE + scheduled_start_time)::timestamptz
    --     ELSE NULL
    --   END;
    
    ALTER TABLE public.rooms
    DROP COLUMN IF EXISTS scheduled_start_time;
    
    ALTER TABLE public.rooms
    RENAME COLUMN scheduled_start_time_new TO scheduled_start_time;
    
    COMMENT ON COLUMN public.rooms.scheduled_start_time IS 
      'تاریخ و زمان شروع برنامه‌ریزی‌شده Room (timestamptz) - override برای Room خاص';
  END IF;
END $$;

COMMIT;

