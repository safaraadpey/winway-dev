-- Function: بررسی اعتبار referral_code
-- تاریخ: 2025-11-22
-- توضیحات: بررسی می‌کند که کد معرف معتبر باشد (3-8 کاراکتر، حروف و اعداد)

CREATE OR REPLACE FUNCTION public.validate_referral_code(
  p_code TEXT
)
RETURNS BOOLEAN
LANGUAGE plpgsql
IMMUTABLE
AS $$
BEGIN
  -- بررسی NULL یا خالی
  IF p_code IS NULL OR TRIM(p_code) = '' THEN
    RETURN FALSE;
  END IF;
  
  -- حذف فاصله‌ها
  p_code := UPPER(TRIM(p_code));
  
  -- بررسی طول (3-8 کاراکتر)
  IF LENGTH(p_code) < 3 OR LENGTH(p_code) > 8 THEN
    RETURN FALSE;
  END IF;
  
  -- بررسی اینکه فقط حروف انگلیسی و اعداد باشد
  IF p_code !~ '^[A-Z0-9]+$' THEN
    RETURN FALSE;
  END IF;
  
  RETURN TRUE;
END;
$$;

COMMENT ON FUNCTION public.validate_referral_code IS 
  'بررسی اعتبار referral_code: باید 3-8 کاراکتر باشد و فقط شامل حروف انگلیسی و اعداد باشد';

