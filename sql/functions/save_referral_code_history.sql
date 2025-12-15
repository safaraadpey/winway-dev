-- Function: ذخیره تاریخچه referral_code
-- تاریخ: 2025-11-22
-- توضیحات: هنگام تغییر referral_code، کد قبلی را در تاریخچه ذخیره می‌کند

CREATE OR REPLACE FUNCTION public.save_referral_code_history()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- اگر referral_code تغییر کرده و کد قبلی NULL نبوده
  IF OLD.referral_code IS NOT NULL 
     AND (NEW.referral_code IS NULL OR NEW.referral_code != OLD.referral_code) THEN
    
    -- ذخیره کد قبلی در تاریخچه
    INSERT INTO public.referral_code_history (
      user_id,
      referral_code,
      changed_at,
      changed_to
    ) VALUES (
      NEW.id,
      OLD.referral_code,
      NOW(),
      NEW.referral_code
    );
  END IF;
  
  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.save_referral_code_history IS 
  'Trigger function برای ذخیره خودکار تاریخچه referral_code هنگام تغییر';

-- ایجاد Trigger
DROP TRIGGER IF EXISTS trigger_save_referral_code_history ON public.users;
CREATE TRIGGER trigger_save_referral_code_history
  AFTER UPDATE OF referral_code ON public.users
  FOR EACH ROW
  WHEN (OLD.referral_code IS DISTINCT FROM NEW.referral_code)
  EXECUTE FUNCTION public.save_referral_code_history();

