-- Function: بررسی اینکه آیا یک referral_code قابل استفاده است
-- تاریخ: 2025-11-22
-- توضیحات: بررسی می‌کند که آیا کد آزاد است یا متعلق به کاربر فعلی است

CREATE OR REPLACE FUNCTION public.check_referral_code_available(
  p_code TEXT,
  p_user_id UUID
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_owner_id UUID;
  v_is_valid BOOLEAN;
BEGIN
  -- بررسی اعتبار کد
  SELECT public.validate_referral_code(p_code) INTO v_is_valid;
  IF NOT v_is_valid THEN
    RETURN FALSE;
  END IF;
  
  -- نرمال‌سازی کد
  p_code := UPPER(TRIM(p_code));
  
  -- بررسی اینکه آیا کد استفاده شده است
  SELECT id INTO v_owner_id
  FROM public.users
  WHERE referral_code = p_code
  LIMIT 1;
  
  -- اگر کد استفاده نشده (NULL) یا متعلق به کاربر فعلی است
  IF v_owner_id IS NULL OR v_owner_id = p_user_id THEN
    RETURN TRUE;
  END IF;
  
  -- بررسی اینکه آیا کد در تاریخچه کاربر فعلی است (می‌تواند به آن برگردد)
  IF EXISTS (
    SELECT 1 FROM public.referral_code_history
    WHERE user_id = p_user_id
    AND referral_code = p_code
  ) THEN
    -- اگر کد در تاریخچه است، بررسی کن که آیا الان استفاده می‌شود
    -- اگر استفاده نمی‌شود، می‌تواند برگردد
    IF v_owner_id IS NULL THEN
      RETURN TRUE;
    END IF;
  END IF;
  
  RETURN FALSE;
END;
$$;

COMMENT ON FUNCTION public.check_referral_code_available IS 
  'بررسی اینکه آیا یک referral_code قابل استفاده است: آزاد است، متعلق به کاربر است، یا در تاریخچه کاربر است';

