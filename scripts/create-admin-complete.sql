-- ============================================
-- اسکریپت کامل ایجاد اکانت ادمین
-- این اسکریپت همه چیز را بررسی و ایجاد می‌کند
-- ============================================

DO $$
DECLARE
  v_user_id UUID;
  v_email TEXT := 'admin@dingmoney.org';
  v_username TEXT := 'admin';
  v_exists BOOLEAN;
BEGIN
  -- پیدا کردن ID کاربر در auth.users
  SELECT id INTO v_user_id
  FROM auth.users
  WHERE email = v_email
  ORDER BY created_at DESC
  LIMIT 1;
  
  -- اگر کاربر پیدا نشد، خطا بده
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION '❌ کاربر با ایمیل % در auth.users پیدا نشد. لطفاً ابتدا کاربر را در Dashboard > Authentication > Users ایجاد کنید.', v_email;
  END IF;
  
  RAISE NOTICE '✅ کاربر در auth.users پیدا شد. ID: %', v_user_id;
  
  -- بررسی اینکه آیا در public.users وجود دارد
  SELECT EXISTS(SELECT 1 FROM public.users WHERE id = v_user_id) INTO v_exists;
  
  IF v_exists THEN
    RAISE NOTICE '⚠️ کاربر قبلاً در public.users وجود دارد. در حال به‌روزرسانی...';
    
    -- به‌روزرسانی رکورد موجود
    UPDATE public.users
    SET 
      email = v_email,
      username = v_username,
      role = 'admin',
      status = 'active',
      updated_at = NOW()
    WHERE id = v_user_id;
    
    RAISE NOTICE '✅ رکورد به‌روزرسانی شد.';
  ELSE
    RAISE NOTICE '📝 ایجاد رکورد جدید در public.users...';
    
    -- ایجاد رکورد جدید
    INSERT INTO public.users (
      id, email, username, role, status, created_at
    ) VALUES (
      v_user_id,
      v_email,
      v_username,
      'admin',
      'active',
      NOW()
    );
    
    RAISE NOTICE '✅ رکورد در public.users ایجاد شد.';
  END IF;
  
  -- ایجاد wallet (اگر وجود نداشته باشد)
  INSERT INTO public.wallets (user_id, balance, currency, created_at)
  VALUES (v_user_id, 0, 'IRR', NOW())
  ON CONFLICT DO NOTHING;
  
  RAISE NOTICE '✅ Wallet بررسی/ایجاد شد.';
  
  -- ایجاد ding_balance (اگر وجود نداشته باشد)
  INSERT INTO public.ding_balances (user_id, balance, created_at)
  VALUES (v_user_id, 0, NOW())
  ON CONFLICT DO NOTHING;
  
  RAISE NOTICE '✅ Ding Balance بررسی/ایجاد شد.';
  
  -- ایجاد user_profile (اگر وجود نداشته باشد)
  INSERT INTO public.user_profiles (user_id, language, created_at)
  VALUES (v_user_id, 'fa', NOW())
  ON CONFLICT DO NOTHING;
  
  RAISE NOTICE '✅ User Profile بررسی/ایجاد شد.';
  
  -- نمایش اطلاعات نهایی
  RAISE NOTICE '';
  RAISE NOTICE '========================================';
  RAISE NOTICE '✅ اکانت ادمین با موفقیت ایجاد/به‌روزرسانی شد!';
  RAISE NOTICE '========================================';
  RAISE NOTICE 'Email: %', v_email;
  RAISE NOTICE 'Username: %', v_username;
  RAISE NOTICE 'Role: admin';
  RAISE NOTICE 'User ID: %', v_user_id;
  RAISE NOTICE '';
  RAISE NOTICE 'حالا می‌توانید با این اطلاعات وارد شوید:';
  RAISE NOTICE '  - Email: %', v_email;
  RAISE NOTICE '  - Password: (رمز عبوری که در Dashboard تنظیم کردید)';
  RAISE NOTICE '';
  
END $$;

-- بررسی نهایی: نمایش اطلاعات کاربر ایجاد شده
SELECT 
  u.id,
  u.email,
  u.username,
  u.role,
  u.status,
  u.created_at,
  CASE WHEN w.id IS NOT NULL THEN '✅' ELSE '❌' END as wallet_exists,
  CASE WHEN db.user_id IS NOT NULL THEN '✅' ELSE '❌' END as ding_balance_exists,
  CASE WHEN up.user_id IS NOT NULL THEN '✅' ELSE '❌' END as profile_exists
FROM public.users u
LEFT JOIN public.wallets w ON w.user_id = u.id
LEFT JOIN public.ding_balances db ON db.user_id = u.id
LEFT JOIN public.user_profiles up ON up.user_id = u.id
WHERE u.email = 'admin@dingmoney.org'
ORDER BY u.created_at DESC
LIMIT 1;

