# برنامه مهاجرت عملیات حساس ادمین به لایه سرور

**تاریخ تولید:** 2025-01-XX  
**هدف:** تبدیل عملیات حساس از فرانت (anon key) به لایه سرور (service role)

---

## استراتژی کلی

### لایه‌های پیشنهادی

1. **API Route (Next.js Route Handler)**: برای عملیات سریع و ساده
2. **Postgres Function (`fn_admin_*`)**: برای عملیات پیچیده با منطق business
3. **Job Table + Worker**: برای عملیات سنگین/طولانی (مثل generate card pool)

### کلاینت سروری

**فایل:** `lib/supabaseServer.ts` (مرحله 3 ایجاد می‌شود)
- استفاده از `SUPABASE_SERVICE_ROLE_KEY`
- فقط در محیط سرور (route handlers, server actions)
- **هرگز** در فرانت استفاده نشود

---

## برنامه مهاجرت برای هر عملیات

### 1. واریز/برداشت دستی موجودی (`fn_adjust_wallet_manual`)

**وضعیت فعلی:**
- فراخوانی مستقیم RPC `fn_adjust_wallet_manual` از فرانت
- استفاده از anon key
- در `services/transactions.ts` → `adjustWalletForUsersBulk()`

**هدف:**
- API Route: `/api/admin/wallet/adjust`
- استفاده از `supabaseServer` (service role)
- RPC function موجود است (`fn_adjust_wallet_manual`) - نیاز به تغییر ندارد

**تغییرات لازم در فرانت:**
- `services/transactions.ts`: `adjustWalletForUsersBulk()` را تغییر به call به API route
- `components/admin/TransactionsManager.tsx`: بدون تغییر (از service استفاده می‌کند)

**اولویت:** 🔴 **بسیار بالا** - دستکاری مستقیم پول

---

### 2. تغییر نقش کاربر

**وضعیت فعلی:**
- UPDATE مستقیم روی `users.role` و `users.admin_sub_role` از فرانت
- در `services/user-account.ts` → `changeUserRole()`

**هدف:**
- API Route: `/api/admin/users/[userId]/role`
- Postgres Function: `fn_admin_change_user_role(p_user_id, p_new_role, p_admin_sub_role, p_actor_id)`
  - بررسی قوانین دسترسی در function
  - مدیریت `user_commissions` در function
  - استفاده از `supabaseServer` در API route

**تغییرات لازم در فرانت:**
- `services/user-account.ts`: `changeUserRole()` را تغییر به call به API route
- `components/admin/UserAccountPage.tsx`: بدون تغییر

**اولویت:** 🔴 **بسیار بالا** - تغییر دسترسی کاربر

---

### 3. تعلیق/فعال‌سازی اکانت کاربر

**وضعیت فعلی:**
- UPDATE مستقیم روی `users.status` از فرانت
- در `services/user-account.ts` → `toggleUserSuspension()`

**هدف:**
- API Route: `/api/admin/users/[userId]/suspend`
- Postgres Function: `fn_admin_toggle_user_suspension(p_user_id, p_actor_id)`
  - بررسی دسترسی در function
  - استفاده از `supabaseServer` در API route

**تغییرات لازم در فرانت:**
- `services/user-account.ts`: `toggleUserSuspension()` را تغییر به call به API route
- `components/admin/UserAccountPage.tsx`: بدون تغییر

**اولویت:** 🟡 **متوسط** - مسدود کردن دسترسی کاربر

---

### 4. تغییر درصد کمیسیون

**وضعیت فعلی:**
- UPDATE مستقیم روی `user_commissions` از فرانت
- در `services/user-account.ts` → `saveUserCommission()`

**هدف:**
- API Route: `/api/admin/users/[userId]/commission`
- Postgres Function: `fn_admin_update_user_commission(p_user_id, p_agent_commission, p_super_commission, p_actor_id)`
  - بررسی اینکه کاربر agent/super است
  - استفاده از `supabaseServer` در API route

**تغییرات لازم در فرانت:**
- `services/user-account.ts`: `saveUserCommission()` را تغییر به call به API route
- `components/admin/UserAccountPage.tsx`: بدون تغییر

**اولویت:** 🟡 **متوسط** - تغییر درآمد agent/super

---

### 5-6. مدیریت یادداشت شخصی

**وضعیت فعلی:**
- INSERT/UPDATE/DELETE مستقیم روی `user_notes` از فرانت
- در `services/user-account.ts` → `savePersonalNote()`, `deletePersonalNote()`

**هدف:**
- API Route: `/api/admin/users/[userId]/note`
- استفاده از `supabaseServer` در API route
- نیاز به function خاصی نیست (عملیات ساده)

**تغییرات لازم در فرانت:**
- `services/user-account.ts`: `savePersonalNote()`, `deletePersonalNote()` را تغییر به call به API route
- `components/admin/UserAccountPage.tsx`: بدون تغییر

**اولویت:** 🟢 **پایین** - فقط اطلاعات متنی

---

### 7. تغییر admin_sub_role

**وضعیت فعلی:**
- UPDATE مستقیم روی `users.admin_sub_role` از فرانت
- در `services/admins.ts` → `changeAdminSubRole()`

**هدف:**
- API Route: `/api/admin/admins/[adminId]/sub-role`
- Postgres Function: `fn_admin_change_sub_role(p_admin_id, p_new_sub_role, p_actor_id)`
  - بررسی اینکه actor مدیر کل است
  - استفاده از `supabaseServer` در API route

**تغییرات لازم در فرانت:**
- `services/admins.ts`: `changeAdminSubRole()` را تغییر به call به API route
- `components/admin/AdminsList.tsx`: بدون تغییر

**اولویت:** 🔴 **بسیار بالا** - تغییر دسترسی مدیر

---

### 8. تعلیق/فعال‌سازی مدیر

**وضعیت فعلی:**
- UPDATE مستقیم روی `users.status` از فرانت
- در `services/admins.ts` → `toggleAdminStatus()`

**هدف:**
- API Route: `/api/admin/admins/[adminId]/suspend`
- Postgres Function: `fn_admin_toggle_admin_suspension(p_admin_id, p_actor_id)`
  - بررسی اینکه actor مدیر کل است
  - استفاده از `supabaseServer` در API route

**تغییرات لازم در فرانت:**
- `services/admins.ts`: `toggleAdminStatus()` را تغییر به call به API route
- `components/admin/AdminsList.tsx`: بدون تغییر

**اولویت:** 🔴 **بسیار بالا** - مسدود کردن دسترسی مدیر

---

### 9. تنظیم دسترسی‌های مدیر

**وضعیت فعلی:**
- INSERT/UPDATE/DELETE مستقیم روی `admin_permissions` از فرانت
- در `services/admins.ts` → `updateAdminPermissions()`

**هدف:**
- API Route: `/api/admin/admins/[adminId]/permissions`
- Postgres Function: `fn_admin_update_permissions(p_admin_id, p_permissions_jsonb, p_actor_id)`
  - بررسی اینکه actor مدیر کل است
  - استفاده از `supabaseServer` در API route

**تغییرات لازم در فرانت:**
- `services/admins.ts`: `updateAdminPermissions()` را تغییر به call به API route
- `components/admin/AdminsList.tsx`: بدون تغییر

**اولویت:** 🔴 **بسیار بالا** - تغییر دسترسی‌های granular مدیر

---

### 10-12. مدیریت Room Templates

**وضعیت فعلی:**
- INSERT/UPDATE/DELETE مستقیم روی `room_templates` از فرانت
- در `services/rooms.ts` → `saveRoomTemplate()`, `deleteRoomTemplate()`

**هدف:**
- API Route: `/api/admin/room-templates` (POST برای create, PUT برای update, DELETE برای delete)
- Postgres Function: `fn_admin_save_room_template(p_template_data jsonb, p_actor_id)` (اختیاری)
- استفاده از `supabaseServer` در API route

**تغییرات لازم در فرانت:**
- `services/rooms.ts`: `saveRoomTemplate()`, `deleteRoomTemplate()` را تغییر به call به API route
- `components/admin/RoomTemplatePanel.tsx`: بدون تغییر

**اولویت:** 🟡 **متوسط** - تغییر اقتصاد بازی

---

### 13-15. مدیریت Entry Banners

**وضعیت فعلی:**
- INSERT/UPDATE/DELETE مستقیم روی `entry_banners` از فرانت
- در `services/entry-banner.ts` → `createEntryBanner()`, `updateEntryBanner()`, `deleteEntryBanner()`

**هدف:**
- API Route: `/api/admin/entry-banners` (POST, PUT, DELETE)
- استفاده از `supabaseServer` در API route
- نیاز به function خاصی نیست (عملیات ساده)

**تغییرات لازم در فرانت:**
- `services/entry-banner.ts`: توابع را تغییر به call به API route
- صفحات ایجاد/ویرایش بنر: بدون تغییر

**اولویت:** 🟢 **پایین** - فقط محتوای نمایشی

---

### 16. آپلود تصویر بنر

**وضعیت فعلی:**
- آپلود مستقیم به Supabase Storage از فرانت
- در `services/entry-banner.ts` → `uploadBannerImage()`

**هدف:**
- API Route: `/api/admin/entry-banners/upload`
- استفاده از `supabaseServer` برای آپلود به Storage
- Validation در API route

**تغییرات لازم در فرانت:**
- `services/entry-banner.ts`: `uploadBannerImage()` را تغییر به call به API route با FormData
- صفحات ایجاد/ویرایش بنر: بدون تغییر

**اولویت:** 🟢 **پایین** - فقط فایل‌های استاتیک

---

## TODO List

### مرحله 3: ساخت supabaseServer.ts
- [x] ایجاد `lib/supabaseServer.ts` با service role
- [x] مستند کردن استفاده در `docs/admin-migration-plan.md`
- [x] Helper functions: `verifyAdminAccess()`, `verifyManagerAccess()`

### مرحله 4: پایلوت (واریز/برداشت دستی)
- [x] ایجاد API route `/api/admin/wallet/adjust`
- [x] تغییر `services/transactions.ts` برای استفاده از API route
- [ ] تست کامل عملیات

**وضعیت قبل:**
- `services/transactions.ts`: فراخوانی مستقیم `supabase.rpc("fn_adjust_wallet_manual")` از فرانت
- استفاده از anon key
- RLS policies باید دسترسی را کنترل کنند

**وضعیت بعد:**
- `services/transactions.ts`: فراخوانی `fetch("/api/admin/wallet/adjust", {...})` با session token
- API route (`app/api/admin/wallet/adjust/route.ts`) از `supabaseServer` (service role) استفاده می‌کند
- Authentication و authorization در API route انجام می‌شود
- RLS policies همچنان فعال هستند اما service role از آن‌ها عبور می‌کند

### مرحله 5: تعمیم (بقیه عملیات)

#### اولویت بالا (بسیار حساس)
- [ ] migrate user role change to server API (`/api/admin/users/[userId]/role`)
  - ایجاد Postgres function: `fn_admin_change_user_role(p_user_id, p_new_role, p_admin_sub_role, p_actor_id)`
  - ایجاد API route با verifyManagerAccess (فقط مدیر کل)
  - تغییر `services/user-account.ts` → `changeUserRole()`

- [ ] migrate admin sub-role change to server API (`/api/admin/admins/[adminId]/sub-role`)
  - ایجاد Postgres function: `fn_admin_change_sub_role(p_admin_id, p_new_sub_role, p_actor_id)`
  - ایجاد API route با verifyManagerAccess (فقط مدیر کل)
  - تغییر `services/admins.ts` → `changeAdminSubRole()`

- [ ] migrate admin suspension to server API (`/api/admin/admins/[adminId]/suspend`)
  - ایجاد Postgres function: `fn_admin_toggle_admin_suspension(p_admin_id, p_actor_id)`
  - ایجاد API route با verifyManagerAccess (فقط مدیر کل)
  - تغییر `services/admins.ts` → `toggleAdminStatus()`

- [ ] migrate admin permissions to server API (`/api/admin/admins/[adminId]/permissions`)
  - ایجاد Postgres function: `fn_admin_update_permissions(p_admin_id, p_permissions_jsonb, p_actor_id)`
  - ایجاد API route با verifyManagerAccess (فقط مدیر کل)
  - تغییر `services/admins.ts` → `updateAdminPermissions()`

#### اولویت متوسط
- [ ] migrate user suspension to server API (`/api/admin/users/[userId]/suspend`)
  - ایجاد Postgres function: `fn_admin_toggle_user_suspension(p_user_id, p_actor_id)`
  - ایجاد API route با verifyAdminAccess (admin/super/agent)
  - تغییر `services/user-account.ts` → `toggleUserSuspension()`

- [ ] migrate user commission update to server API (`/api/admin/users/[userId]/commission`)
  - ایجاد Postgres function: `fn_admin_update_user_commission(p_user_id, p_agent_commission, p_super_commission, p_actor_id)`
  - ایجاد API route با verifyAdminAccess (admin/super/agent)
  - تغییر `services/user-account.ts` → `saveUserCommission()`

- [ ] migrate room templates CRUD to server API (`/api/admin/room-templates`)
  - ایجاد API routes: POST (create), PUT (update), DELETE (delete)
  - استفاده از `supabaseServer` مستقیم (نیاز به function خاصی نیست)
  - تغییر `services/rooms.ts` → `saveRoomTemplate()`, `deleteRoomTemplate()`

#### اولویت پایین
- [ ] migrate user notes to server API (`/api/admin/users/[userId]/note`)
  - ایجاد API routes: POST (create/update), DELETE (delete)
  - استفاده از `supabaseServer` مستقیم
  - تغییر `services/user-account.ts` → `savePersonalNote()`, `deletePersonalNote()`

- [ ] migrate entry banners CRUD to server API (`/api/admin/entry-banners`)
  - ایجاد API routes: POST (create), PUT (update), DELETE (delete)
  - استفاده از `supabaseServer` مستقیم
  - تغییر `services/entry-banner.ts` → `createEntryBanner()`, `updateEntryBanner()`, `deleteEntryBanner()`

- [ ] migrate banner image upload to server API (`/api/admin/entry-banners/upload`)
  - ایجاد API route با FormData handling
  - استفاده از `supabaseServer.storage` برای آپلود
  - تغییر `services/entry-banner.ts` → `uploadBannerImage()`

---

## Postgres Functions پیشنهادی

### Functions لازم برای ایجاد

1. **`fn_admin_change_user_role`**
   - بررسی قوانین دسترسی
   - مدیریت `user_commissions`
   - Audit log

2. **`fn_admin_toggle_user_suspension`**
   - بررسی دسترسی
   - Audit log

3. **`fn_admin_update_user_commission`**
   - بررسی اینکه کاربر agent/super است
   - Audit log

4. **`fn_admin_change_sub_role`**
   - بررسی اینکه actor مدیر کل است
   - Audit log

5. **`fn_admin_toggle_admin_suspension`**
   - بررسی اینکه actor مدیر کل است
   - Audit log

6. **`fn_admin_update_permissions`**
   - بررسی اینکه actor مدیر کل است
   - Audit log

**نکته:** `fn_adjust_wallet_manual` از قبل وجود دارد و نیاز به تغییر ندارد.

---

## الگوی Authentication در API Routes

هر API route باید از helper functions در `lib/supabaseServer.ts` استفاده کند:

### الگوی استاندارد:

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { supabaseServer, verifyAdminAccess, verifyManagerAccess, getUserFromRequest } from '@/lib/supabaseServer'

export async function POST(request: NextRequest) {
  try {
    // 1. بررسی Session از Authorization header
    const authHeader = request.headers.get('authorization')
    const user = await getUserFromRequest(authHeader)
    
    if (!user) {
      return NextResponse.json(
        { error: 'Unauthorized - Missing or invalid session' },
        { status: 401 }
      )
    }

    // 2. بررسی Role (بسته به نیاز)
    // برای عملیات admin/super/agent:
    const adminInfo = await verifyAdminAccess(user.id)
    if (!adminInfo || !adminInfo.isAdmin) {
      return NextResponse.json(
        { error: 'Forbidden - Insufficient permissions' },
        { status: 403 }
      )
    }

    // برای عملیات فقط مدیر کل:
    // const isManager = await verifyManagerAccess(user.id)
    // if (!isManager) {
    //   return NextResponse.json(
    //     { error: 'Forbidden - Only general manager can perform this action' },
    //     { status: 403 }
    //   )
    // }

    // 3. خواندن body و validation
    const body = await request.json()
    // ... validation logic

    // 4. انجام عملیات با supabaseServer (service role)
    const { data, error } = await supabaseServer
      .from('table_name')
      .update({ ... })
      .eq('id', targetId)

    if (error) {
      return NextResponse.json(
        { error: error.message },
        { status: 500 }
      )
    }

    return NextResponse.json({ success: true }, { status: 200 })
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message || "خطای غیرمنتظره" },
      { status: 500 }
    )
  }
}
```

### Helper Functions موجود:

- **`getUserFromRequest(authHeader)`**: استخراج user از Authorization header
- **`verifyAdminAccess(userId)`**: بررسی اینکه کاربر admin/super/agent است
- **`verifyManagerAccess(userId)`**: بررسی اینکه کاربر مدیر کل است (admin با admin_sub_role = null)

---

## وضعیت قبل و بعد (پایلوت)

### وضعیت قبل (فعلی)
- `services/transactions.ts`: فراخوانی مستقیم `supabase.rpc("fn_adjust_wallet_manual")` از فرانت
- استفاده از anon key
- RLS policies باید دسترسی را کنترل کنند

### وضعیت بعد (پس از مهاجرت)
- `services/transactions.ts`: فراخوانی `fetch("/api/admin/wallet/adjust", {...})` با session token در Authorization header
- API route (`app/api/admin/wallet/adjust/route.ts`):
  - از `getUserFromRequest()` برای verify کردن session استفاده می‌کند
  - از `verifyAdminAccess()` برای بررسی role استفاده می‌کند
  - از `supabaseServer` (service role) برای فراخوانی RPC استفاده می‌کند
- Authentication و authorization در API route انجام می‌شود
- RLS policies همچنان فعال هستند اما service role از آن‌ها عبور می‌کند

**فایل‌های ایجاد/تغییر شده:**
- ✅ `lib/supabaseServer.ts` - کلاینت سروری با service role + helper functions
- ✅ `app/api/admin/wallet/adjust/route.ts` - API route برای واریز/برداشت
- ✅ `services/transactions.ts` - تغییر `adjustWalletForUsersBulk()` برای استفاده از API route

---

**پایان سند**

