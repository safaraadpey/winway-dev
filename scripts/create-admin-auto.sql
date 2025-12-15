-- ============================================
-- اسکریپت خودکار ایجاد اکانت ادمین
-- این اسکریپت به صورت خودکار ID را پیدا می‌کند و رکورد را ایجاد می‌کند
-- ============================================

DO $$
DECLARE
  v_user_id UUID;
  v_email TEXT := 'admin@dingmoney.org';
BEGIN
  -- پیدا کردن ID کاربر
  SELECT id INTO v_user_id
  FROM auth.users
  WHERE email = v_email
  ORDER BY created_at DESC
  LIMIT 1;
  
  -- اگر کاربر پیدا نشد، خطا بده
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'کاربر با ایمیل % در auth.users پیدا نشد. لطفاً ابتدا کاربر را در Dashboard ایجاد کنید.', v_email;
  END IF;
  
  -- ایجاد رکورد در public.users
  INSERT INTO public.users (
    id, email, username, role, status, created_at
  ) VALUES (
    v_user_id,
    v_email,
    'admin',
    'admin',
    'active',
    NOW()
  )
  ON CONFLICT (id) DO UPDATE
  SET 
    role = 'admin',
    status = 'active',
    username = 'admin';
  
  -- ایجاد wallet
  INSERT INTO public.wallets (user_id, balance, currency, created_at)
  VALUES (v_user_id, 0, 'IRR', NOW())
  ON CONFLICT DO NOTHING;
  
  -- ایجاد ding_balance
  INSERT INTO public.ding_balances (user_id, balance, created_at)
  VALUES (v_user_id, 0, NOW())
  ON CONFLICT DO NOTHING;
  
  -- ایجاد user_profile
  INSERT INTO public.user_profiles (user_id, language, created_at)
  VALUES (v_user_id, 'fa', NOW())
  ON CONFLICT DO NOTHING;
  
  RAISE NOTICE 'اکانت ادمین با موفقیت ایجاد شد. User ID: %', v_user_id;
END $$;

