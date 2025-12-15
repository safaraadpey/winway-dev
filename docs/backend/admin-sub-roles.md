# مستندات سیستم رول‌های فرعی ادمین (Admin Sub Roles)

## 📋 خلاصه

این سیستم امکان تفکیک دسترسی‌های ادمین‌ها را فراهم می‌کند. به جای اینکه همه ادمین‌ها دسترسی کامل داشته باشند، می‌توانیم رول‌های فرعی تعریف کنیم که هر کدام به بخش خاصی دسترسی دارند.

---

## 🗄️ ساختار دیتابیس

### جدول `users`

جدول `users` دارای دو ستون مرتبط با نقش است:

- **`role`**: نقش اصلی کاربر (`player`, `admin`, `super`, `agent`)
- **`admin_sub_role`**: نقش فرعی ادمین (فقط برای `role = 'admin'`)

### ENUM Type: `admin_sub_role`

```sql
CREATE TYPE admin_sub_role AS ENUM (
  'manager',    -- مدیر کل - دسترسی کامل
  'finance',    -- ادمین مالی - دسترسی به تراکنش‌ها و گزارش‌های مالی
  'support',    -- ادمین پشتیبانی - دسترسی به تیکت‌ها و مدیریت کاربران
  'room'        -- ادمین اتاق‌ها - دسترسی به مدیریت room_templates و rooms
);
```

### ساختار داده‌ها

```sql
-- مثال داده‌ها:
id          | email              | role   | admin_sub_role | status
------------|--------------------|--------|----------------|--------
uuid-1      | player1@...         | player | NULL           | active
uuid-2      | admin@...           | admin  | manager        | active
uuid-3      | finance@...         | admin  | finance        | active
uuid-4      | support@...         | admin  | support        | active
uuid-5      | room@...            | admin  | room           | active
uuid-6      | superadmin@...      | admin  | NULL           | active  -- مدیر کل
```

**نکات مهم:**
- فقط کاربران با `role = 'admin'` می‌توانند `admin_sub_role` داشته باشند
- اگر `admin_sub_role = NULL` باشد، یعنی مدیر کل (دسترسی کامل)
- بقیه کاربران (`player`, `agent`, `super`) همیشه `admin_sub_role = NULL` دارند

---

## 🔧 Migration

برای اعمال تغییرات، فایل migration زیر را اجرا کنید:

```bash
# فایل: sql/migrations/add_admin_sub_role.sql
```

این migration:
1. ENUM type `admin_sub_role` را ایجاد می‌کند
2. ستون `admin_sub_role` را به جدول `users` اضافه می‌کند
3. Index برای جستجوی سریع‌تر ایجاد می‌کند
4. CHECK constraint برای اطمینان از صحت داده‌ها اضافه می‌کند

---

## 💻 استفاده در Frontend

### Helper Functions

تمام helper functions در فایل `lib/auth-helpers.ts` تعریف شده‌اند:

#### 1. `getCurrentUserSubRole()`

دریافت sub_role کاربر فعلی:

```typescript
import { getCurrentUserSubRole } from '@/lib/auth-helpers';

const subRole = await getCurrentUserSubRole();
if (subRole === 'finance') {
  // نمایش بخش مالی
}
```

#### 2. `hasAdminSubRole(userId, requiredSubRole)`

بررسی دسترسی کاربر به یک sub_role خاص:

```typescript
import { hasAdminSubRole } from '@/lib/auth-helpers';

const canAccess = await hasAdminSubRole(userId, 'finance');
if (canAccess) {
  // نمایش بخش مالی
}
```

#### 3. `canAccessSection(section)`

بررسی دسترسی کاربر به یک بخش خاص:

```typescript
import { canAccessSection } from '@/lib/auth-helpers';

const canAccess = await canAccessSection('finance');
if (canAccess) {
  // نمایش بخش مالی
}
```

**نکته:** مدیر کل (`admin_sub_role = NULL` یا `'manager'`) به همه بخش‌ها دسترسی دارد.

#### 4. `isSuperAdmin()`

بررسی اینکه آیا کاربر مدیر کل است:

```typescript
import { isSuperAdmin } from '@/lib/auth-helpers';

const isManager = await isSuperAdmin();
if (isManager) {
  // نمایش همه بخش‌ها
}
```

#### 5. `getCurrentUserRoleInfo()`

دریافت اطلاعات کامل نقش کاربر:

```typescript
import { getCurrentUserRoleInfo } from '@/lib/auth-helpers';

const roleInfo = await getCurrentUserRoleInfo();
if (roleInfo?.role === 'admin' && roleInfo.admin_sub_role === 'finance') {
  // نمایش بخش مالی
}
```

---

## 🎯 مثال‌های استفاده

### مثال 1: نمایش/مخفی کردن بخش‌ها

```typescript
"use client";

import { useEffect, useState } from 'react';
import { canAccessSection } from '@/lib/auth-helpers';

export default function AdminDashboard() {
  const [canAccessFinance, setCanAccessFinance] = useState(false);
  const [canAccessSupport, setCanAccessSupport] = useState(false);
  const [canAccessRoom, setCanAccessRoom] = useState(false);
  
  useEffect(() => {
    async function checkAccess() {
      setCanAccessFinance(await canAccessSection('finance'));
      setCanAccessSupport(await canAccessSection('support'));
      setCanAccessRoom(await canAccessSection('room'));
    }
    checkAccess();
  }, []);
  
  return (
    <div>
      <h1>پنل ادمین</h1>
      
      {canAccessFinance && (
        <section>
          <h2>بخش مالی</h2>
          {/* محتوای مالی */}
        </section>
      )}
      
      {canAccessSupport && (
        <section>
          <h2>پشتیبانی کاربران</h2>
          {/* محتوای پشتیبانی */}
        </section>
      )}
      
      {canAccessRoom && (
        <section>
          <h2>مدیریت اتاق‌ها</h2>
          {/* محتوای اتاق‌ها */}
        </section>
      )}
    </div>
  );
}
```

### مثال 2: هدایت بعد از لاگین

فایل `app/post-login/page.tsx` به‌روزرسانی شده است تا بر اساس `admin_sub_role` هدایت کند:

- `admin` + `finance` → `/admin/finance/dashboard`
- `admin` + `support` → `/admin/support/dashboard`
- `admin` + `room` → `/admin/room-templates`
- `admin` + `manager` یا `NULL` → `/admin/dashboard`

### مثال 3: محافظت از Route

```typescript
// app/admin/finance/dashboard/page.tsx
"use client";

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { canAccessSection } from '@/lib/auth-helpers';

export default function FinanceDashboard() {
  const router = useRouter();
  const [hasAccess, setHasAccess] = useState(false);
  const [loading, setLoading] = useState(true);
  
  useEffect(() => {
    async function checkAccess() {
      const access = await canAccessSection('finance');
      setHasAccess(access);
      setLoading(false);
      
      if (!access) {
        router.push('/admin/dashboard');
      }
    }
    checkAccess();
  }, [router]);
  
  if (loading) {
    return <div>در حال بررسی دسترسی...</div>;
  }
  
  if (!hasAccess) {
    return null;
  }
  
  return (
    <div>
      <h1>داشبورد مالی</h1>
      {/* محتوای مالی */}
    </div>
  );
}
```

---

## 🔒 استفاده در Backend (RLS Policies)

### مثال 1: فقط ادمین مالی می‌تواند تراکنش‌ها را ببیند

```sql
CREATE POLICY "Finance admins can view all transactions"
ON public.transactions
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.users
    WHERE id = auth.uid()
    AND role = 'admin'
    AND admin_sub_role = 'finance'
  )
);
```

### مثال 2: ادمین مالی و مدیر کل می‌توانند تراکنش‌ها را ببینند

```sql
CREATE POLICY "Finance and manager admins can view transactions"
ON public.transactions
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.users
    WHERE id = auth.uid()
    AND role = 'admin'
    AND (
      admin_sub_role = 'finance' 
      OR admin_sub_role = 'manager' 
      OR admin_sub_role IS NULL  -- مدیر کل
    )
  )
);
```

### مثال 3: فقط ادمین اتاق‌ها می‌تواند room_templates را ویرایش کند

```sql
CREATE POLICY "Room admins can manage room templates"
ON public.room_templates
FOR ALL
USING (
  EXISTS (
    SELECT 1 FROM public.users
    WHERE id = auth.uid()
    AND role = 'admin'
    AND (
      admin_sub_role = 'room' 
      OR admin_sub_role = 'manager' 
      OR admin_sub_role IS NULL  -- مدیر کل
    )
  )
);
```

---

## 📝 مدیریت رول‌ها

### ایجاد ادمین جدید با sub_role

```sql
-- ایجاد ادمین مالی
INSERT INTO public.users (
  id, email, username, role, admin_sub_role, status
) VALUES (
  gen_random_uuid(),
  'finance@dingmoney.org',
  'finance',
  'admin',
  'finance',
  'active'
);
```

### تغییر sub_role یک ادمین

```sql
-- تغییر sub_role یک ادمین
UPDATE public.users
SET admin_sub_role = 'finance'
WHERE id = 'admin-uuid' AND role = 'admin';
```

### تبدیل به مدیر کل (حذف sub_role)

```sql
-- تبدیل به مدیر کل
UPDATE public.users
SET admin_sub_role = NULL
WHERE id = 'admin-uuid' AND role = 'admin';
```

---

## 🎭 سناریوهای مختلف

### سناریو 1: ادمین مالی
```sql
role = 'admin', admin_sub_role = 'finance'
```
- ✅ می‌تواند: تراکنش‌ها را ببیند، گزارش‌های مالی را ببیند
- ❌ نمی‌تواند: room_templates را ویرایش کند (مگر با policy خاص)

### سناریو 2: ادمین پشتیبانی
```sql
role = 'admin', admin_sub_role = 'support'
```
- ✅ می‌تواند: تیکت‌ها را ببیند، کاربران را مدیریت کند
- ❌ نمی‌تواند: تراکنش‌های مالی را ببیند

### سناریو 3: مدیر کل (بدون sub_role)
```sql
role = 'admin', admin_sub_role = NULL
```
- ✅ می‌تواند: به همه بخش‌ها دسترسی داشته باشد

### سناریو 4: Player
```sql
role = 'player', admin_sub_role = NULL
```
- ❌ نمی‌تواند: به هیچ بخش ادمین دسترسی داشته باشد

---

## ⚠️ نکات مهم

1. **مدیر کل**: کاربران با `admin_sub_role = NULL` یا `'manager'` دسترسی کامل دارند
2. **CHECK Constraint**: فقط کاربران با `role = 'admin'` می‌توانند `admin_sub_role` داشته باشند
3. **Backward Compatibility**: کدهای موجود که فقط `role = 'admin'` را چک می‌کنند همچنان کار می‌کنند
4. **Index**: یک index روی `admin_sub_role` ایجاد شده است برای جستجوی سریع‌تر
5. **NULL vs Manager**: `NULL` و `'manager'` هر دو به معنای مدیر کل هستند، اما `'manager'` صریح‌تر است

---

## 🔄 Migration Checklist

- [x] ایجاد ENUM type `admin_sub_role`
- [x] اضافه کردن ستون `admin_sub_role` به جدول `users`
- [x] ایجاد index برای جستجوی سریع‌تر
- [x] اضافه کردن CHECK constraint
- [x] ایجاد helper functions در TypeScript
- [x] به‌روزرسانی `post-login/page.tsx`
- [ ] به‌روزرسانی RLS Policies (باید بر اساس نیاز انجام شود)
- [ ] ایجاد صفحات dashboard برای هر sub_role (اختیاری)

---

## 📚 منابع

- Migration File: `sql/migrations/add_admin_sub_role.sql`
- Helper Functions: `lib/auth-helpers.ts`
- Post-Login Redirect: `app/post-login/page.tsx`
- Types: `lib/auth-helpers.ts` (AdminSubRole, UserRole, UserRoleInfo)

---

## 🆘 پشتیبانی

اگر سوالی دارید یا مشکلی پیش آمد، لطفاً با تیم توسعه تماس بگیرید.

