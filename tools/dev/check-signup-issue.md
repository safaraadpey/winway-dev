# عیب‌یابی مشکل ثبت‌نام

## مراحل بررسی

### 1. بررسی Referral Code در دیتابیس

```sql
SELECT 
  id,
  email,
  username,
  role,
  status,
  referral_code,
  UPPER(TRIM(referral_code)) as normalized
FROM public.users
WHERE referral_code = '61621811'
   OR UPPER(TRIM(referral_code)) = '61621811';
```

باید یک رکورد با `role = 'admin'` برگرداند.

### 2. بررسی Logs در Supabase

1. به **Supabase Dashboard** بروید
2. به **Logs** > **Postgres Logs** بروید
3. آخرین خطا را پیدا کنید
4. متن کامل خطا را کپی کنید

خطا باید شامل این اطلاعات باشد:
- متن خطا
- referral_code که وارد شده
- کدهای موجود (اگر referrer پیدا نشد)

### 3. تست Query Trigger

```sql
-- تست query که trigger استفاده می‌کند
SELECT id, role
FROM public.users
WHERE UPPER(TRIM(COALESCE(referral_code, ''))) = '61621811'
AND status = 'active';
```

باید یک رکورد برگرداند.

### 4. بررسی Metadata در SignupForm

در Developer Tools > Network:
1. Request به `/auth/v1/signup` را پیدا کنید
2. Payload را بررسی کنید
3. مطمئن شوید که `user_metadata.referral_code` وجود دارد

---

## مشکلات احتمالی

### مشکل 1: Referral Code در Metadata نیست

**علت**: referral_code در SignupForm به درستی در metadata ذخیره نمی‌شود

**راه حل**: بررسی کنید که در SignupForm:
```typescript
options: {
  data: {
    username: username.toLowerCase().trim(),
    referral_code: trimmedReferralCode, // باید اینجا باشد
  },
}
```

### مشکل 2: Referral Code پیدا نمی‌شود

**علت**: referral_code در دیتابیس نیست یا format متفاوت است

**راه حل**: 
```sql
-- بررسی همه referral_code های موجود
SELECT referral_code, email, role
FROM public.users
WHERE referral_code IS NOT NULL;
```

### مشکل 3: Constraint Violation

**علت**: username یا email تکراری است

**راه حل**: از username/email دیگری استفاده کنید

---

## تست کامل

1. **Console را باز کنید** (F12 > Console)
2. **Network را باز کنید** (F12 > Network)
3. به `/auth/signup` بروید
4. اطلاعات را وارد کنید:
   - Username: `testuser123`
   - Password: `test123456`
   - Referral Code: `61621811`
5. ثبت‌نام کنید
6. **خطاها را در Console بررسی کنید**
7. **Request را در Network بررسی کنید**
8. **Logs را در Supabase Dashboard بررسی کنید**

---

## اطلاعات مورد نیاز

لطفاً این اطلاعات را بفرستید:

1. **متن کامل خطا** از Supabase Dashboard > Logs
2. **خطاهای Console** (اگر وجود دارد)
3. **Payload Request** از Network tab
4. **نتیجه کوئری بررسی referral_code** (مرحله 1)

با این اطلاعات می‌توانم مشکل را دقیق‌تر پیدا کنم.

