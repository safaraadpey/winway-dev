# راهنمای ایجاد اکانت ادمین جدید

## ⚠️ نکته مهم

**همه کاربران (حتی admin/super) باید با referral_code ثبت‌نام کنند!**

- همه کاربران جدید ابتدا به عنوان **player** ایجاد می‌شوند
- بعداً admin می‌تواند role را از player به admin/super تغییر دهد
- هیچ کاربری بدون referral_code نمی‌تواند ثبت‌نام کند

## Referral Code ادمین اصلی

**Referral Code ادمین اصلی: `61621811`**

این کد متعلق به کاربر `adminzero@dingmoney.org` است و می‌توانید از آن برای ایجاد admin های جدید استفاده کنید.

---

## روش ایجاد Admin جدید

### روش 1: از طریق SignupForm (پیشنهادی)

1. به صفحه `/auth/signup` بروید
2. اطلاعات را وارد کنید:
   - **Username**: مثلاً `newadmin`
   - **Password**: یک رمز عبور قوی
   - **کد معرف**: `61621811`
3. ثبت‌نام کنید
4. کاربر به عنوان **player** ایجاد می‌شود
5. بعداً admin می‌تواند role را تغییر دهد

### روش 2: از طریق Dashboard + تغییر Role

1. کاربر را در Dashboard ایجاد کنید (با referral_code در metadata)
2. بعد role را تغییر دهید

---

## تغییر Role از Player به Admin

بعد از ثبت‌نام، برای تبدیل player به admin:

```sql
-- پیدا کردن ID کاربر
SELECT id, email, username, role 
FROM public.users 
WHERE email = 'newadmin@dingmoney.org';

-- تغییر role به admin (جایگزین کنید YOUR_USER_ID را)
UPDATE public.users
SET role = 'admin'
WHERE id = 'YOUR_USER_ID';
```

---

## ایجاد اولین Admin (اگر adminzero وجود ندارد)

اگر adminzero@dingmoney.org وجود ندارد، باید آن را دستی ایجاد کنید:

### مرحله 1: ایجاد کاربر در Dashboard

1. به **Supabase Dashboard** > **Authentication** > **Users** > **Add user** بروید
2. اطلاعات را وارد کنید:
   - **Email**: `adminzero@dingmoney.org`
   - **Password**: یک رمز عبور قوی
   - **Auto Confirm User**: ✅ فعال کنید
   - **User Metadata**: این JSON را اضافه کنید:
   ```json
   {
     "referral_code": "61621811"
   }
   ```
3. **Create user** را بزنید

⚠️ **مهم**: اگر خطا داد (چون referral_code 61621811 وجود ندارد)، کاربر را بدون metadata ایجاد کنید و بعد دستی تنظیم کنید.

### مرحله 2: تنظیم دستی (اگر trigger خطا داد)

```sql
-- پیدا کردن ID کاربر
SELECT id FROM auth.users WHERE email = 'adminzero@dingmoney.org';

-- ایجاد/به‌روزرسانی در public.users (جایگزین کنید YOUR_ID_HERE را)
INSERT INTO public.users (id, email, username, role, status, referral_code, created_at)
VALUES ('YOUR_ID_HERE', 'adminzero@dingmoney.org', 'adminzero', 'admin', 'active', '61621811', NOW())
ON CONFLICT (id) DO UPDATE
SET role = 'admin', status = 'active', referral_code = '61621811';

-- ایجاد wallet و سایر جداول
INSERT INTO public.wallets (user_id, balance, currency, created_at)
VALUES ('YOUR_ID_HERE', 0, 'IRR', NOW())
ON CONFLICT DO NOTHING;

INSERT INTO public.ding_balances (user_id, balance, created_at)
VALUES ('YOUR_ID_HERE', 0, NOW())
ON CONFLICT DO NOTHING;

INSERT INTO public.user_profiles (user_id, language, created_at)
VALUES ('YOUR_ID_HERE', 'fa', NOW())
ON CONFLICT DO NOTHING;
```

---

## خلاصه منطق

1. ✅ همه کاربران جدید باید referral_code داشته باشند
2. ✅ همه کاربران جدید به عنوان **player** ایجاد می‌شوند
3. ✅ بعداً admin می‌تواند role را تغییر دهد
4. ✅ Referral Code ادمین اصلی: `61621811`

---

## تست

برای تست سیستم:

1. با referral_code `61621811` یک کاربر جدید ثبت‌نام کنید
2. بررسی کنید که به عنوان player ایجاد شده است
3. role را به admin تغییر دهید
4. با کاربر جدید وارد شوید و به `/admin/dashboard` بروید

