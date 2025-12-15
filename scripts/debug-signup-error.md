# عیب‌یابی خطای "Database error saving new user"

## مراحل عیب‌یابی

### 1. بررسی Referral Code

```sql
-- بررسی اینکه referral_code 61621811 درست تنظیم شده
SELECT id, email, username, role, status, referral_code
FROM public.users
WHERE referral_code = '61621811' OR email = 'adminzero@dingmoney.org';
```

باید یک رکورد با:
- `email = 'adminzero@dingmoney.org'`
- `role = 'admin'`
- `referral_code = '61621811'`
- `status = 'active'`

### 2. تست Query مشابه Trigger

```sql
-- تست query که trigger استفاده می‌کند
SELECT id, role
FROM public.users
WHERE UPPER(TRIM(referral_code)) = '61621811'
AND status = 'active'
LIMIT 1;
```

باید یک رکورد برگرداند.

### 3. بررسی آخرین خطاها

اگر در Supabase Dashboard به **Logs** بروید، می‌توانید خطای دقیق را ببینید.

### 4. بررسی Metadata

وقتی کاربر ثبت‌نام می‌کند، بررسی کنید که referral_code در metadata ذخیره می‌شود:

```sql
-- بررسی آخرین کاربر ایجاد شده در auth.users
SELECT 
  id,
  email,
  raw_user_meta_data
FROM auth.users
ORDER BY created_at DESC
LIMIT 1;
```

باید `raw_user_meta_data` شامل `referral_code: "61621811"` باشد.

---

## مشکلات احتمالی و راه حل

### مشکل 1: Referral Code در Metadata نیست

**علت**: referral_code به درستی در metadata ذخیره نمی‌شود

**راه حل**: بررسی کنید که در SignupForm، referral_code در `options.data` ذخیره می‌شود:

```typescript
const { data, error } = await supabase.auth.signUp({
  email,
  password,
  options: {
    data: {
      username: username.toLowerCase().trim(),
      referral_code: trimmedReferralCode, // باید اینجا باشد
    },
  },
});
```

### مشکل 2: Referral Code در دیتابیس نیست

**علت**: referral_code برای adminzero تنظیم نشده

**راه حل**: اجرا کنید:

```sql
UPDATE public.users
SET referral_code = '61621811'
WHERE email = 'adminzero@dingmoney.org';
```

### مشکل 3: Case Sensitivity

**علت**: referral_code با case متفاوت ذخیره شده

**راه حل**: trigger اصلاح شده و از `UPPER(TRIM())` استفاده می‌کند.

### مشکل 4: Constraint Violation

**علت**: ممکن است constraint دیگری مشکل ایجاد کند

**راه حل**: بررسی کنید که:
- username تکراری نباشد
- email تکراری نباشد
- referral_code تکراری نباشد (اگر برای کاربر جدید تنظیم شده)

---

## تست کامل

برای تست کامل، این مراحل را دنبال کنید:

1. **بررسی Referral Code**:
   ```sql
   SELECT * FROM public.users WHERE referral_code = '61621811';
   ```

2. **تست ثبت‌نام**:
   - به `/auth/signup` بروید
   - Username: `testuser`
   - Password: `test123456`
   - Referral Code: `61621811`
   - ثبت‌نام کنید

3. **بررسی نتیجه**:
   ```sql
   SELECT * FROM public.users WHERE email = 'testuser@dingmoney.org';
   ```

4. **بررسی Logs**:
   - به Supabase Dashboard > Logs بروید
   - خطای دقیق را ببینید

---

## اگر هنوز خطا می‌دهد

لطفاً این اطلاعات را بفرستید:

1. **متن کامل خطا** از Supabase Dashboard > Logs
2. **Metadata کاربر** که ثبت‌نام کرده:
   ```sql
   SELECT id, email, raw_user_meta_data 
   FROM auth.users 
   ORDER BY created_at DESC 
   LIMIT 1;
   ```
3. **وضعیت referral_code**:
   ```sql
   SELECT * FROM public.users WHERE referral_code = '61621811';
   ```

با این اطلاعات می‌توانم مشکل را دقیق‌تر پیدا کنم.

