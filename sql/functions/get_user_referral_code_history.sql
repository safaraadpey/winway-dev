-- Function: دریافت تاریخچه referral_code یک کاربر
-- تاریخ: 2025-11-22
-- توضیحات: لیست تمام کدهای معرف قبلی یک کاربر را برمی‌گرداند

CREATE OR REPLACE FUNCTION public.get_user_referral_code_history(
  p_user_id UUID
)
RETURNS TABLE (
  referral_code TEXT,
  changed_at TIMESTAMPTZ,
  changed_to TEXT,
  is_current BOOLEAN
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    h.referral_code,
    h.changed_at,
    h.changed_to,
    (h.referral_code = u.referral_code) as is_current
  FROM public.referral_code_history h
  CROSS JOIN public.users u
  WHERE h.user_id = p_user_id
    AND u.id = p_user_id
  ORDER BY h.changed_at DESC;
  
  -- اگر کاربر کد فعلی دارد که در تاریخچه نیست، آن را هم اضافه کن
  -- (برای کاربرانی که کد دارند اما هنوز تغییر نداده‌اند)
  IF EXISTS (
    SELECT 1 FROM public.users 
    WHERE id = p_user_id 
    AND referral_code IS NOT NULL
    AND NOT EXISTS (
      SELECT 1 FROM public.referral_code_history 
      WHERE user_id = p_user_id 
      AND referral_code = (SELECT referral_code FROM public.users WHERE id = p_user_id)
    )
  ) THEN
    RETURN QUERY
    SELECT 
      u.referral_code,
      u.updated_at as changed_at,
      NULL::TEXT as changed_to,
      TRUE as is_current
    FROM public.users u
    WHERE u.id = p_user_id
      AND u.referral_code IS NOT NULL;
  END IF;
END;
$$;

COMMENT ON FUNCTION public.get_user_referral_code_history IS 
  'دریافت تاریخچه کدهای معرف یک کاربر - شامل کد فعلی و کدهای قبلی';

