# معماری ادمین و دسترسی‌ها - وضعیت فعلی پروژه

**تاریخ تولید:** 2025-01-XX  
**پروژه:** Winway Bingo Platform

---

## 1. Supabase Clients

### کلاینت‌های موجود در پروژه

#### کلاینت اصلی (Browser/Client-side)
- **`lib/supabaseClient.ts`**
  - **نوع:** Browser Client (فرانت‌اند)
  - **Env Keys:** 
    - `NEXT_PUBLIC_SUPABASE_URL`
    - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
  - **استفاده:** کلاینت اصلی برای تمام کامپوننت‌های React و صفحات Next.js
  - **ویژگی‌ها:** 
    - `persistSession: true`
    - `autoRefreshToken: true`
  - **Export:** `supabase` (singleton instance)

#### کلاینت‌های Script (Node.js)
- **`scripts/execute-tickets-query.js`**
  - **نوع:** Node.js Script
  - **Env Keys:** `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`
  - **استفاده:** اسکریپت‌های تست و utility

- **`scripts/find-tickets-functions-direct.js`**
  - **نوع:** Node.js Script
  - **Env Keys:** `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`
  - **استفاده:** جستجوی function‌های مرتبط با tickets

- **`scripts/list-tables.ts`**
  - **نوع:** TypeScript Script
  - **Env Keys:** `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`
  - **استفاده:** لیست کردن جداول دیتابیس

- **`scripts/test-connection.js`**
  - **نوع:** Node.js Script
  - **Env Keys:** `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`
  - **استفاده:** تست اتصال به Supabase

#### کلاینت‌های Edge Function (Deno)
- **`draw_jobs_occurrences.md`** (مستندات)
  - **نوع:** Edge Function (Deno)
  - **Env Keys:** `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`
  - **استفاده:** Worker برای پردازش draw jobs (در مستندات ذکر شده، فایل واقعی پیدا نشد)

### خلاصه
- **کلاینت اصلی:** `lib/supabaseClient.ts` - استفاده از `NEXT_PUBLIC_SUPABASE_ANON_KEY` (anon key)
- **Service Role:** فقط در مستندات Edge Functions ذکر شده، در کد اصلی استفاده نشده
- **همه کلاینت‌ها:** از anon key استفاده می‌کنند (نه service role)

---

## 2. مدل نقش‌ها (Roles) و تشخیص ادمین

### ساختار نقش‌ها

#### نقش‌های اصلی (Main Roles)
- **`player`**: کاربر عادی بازی
- **`agent`**: ایجنت (می‌تواند پلیرها را مدیریت کند)
- **`super`**: سوپر (می‌تواند ایجنت‌ها و پلیرها را مدیریت کند)
- **`admin`**: ادمین (دسترسی کامل)

#### نقش‌های فرعی ادمین (Admin Sub-roles)
- **`manager`** (یا `null`): مدیر کل - دسترسی کامل
- **`finance`**: مدیر مالی - دسترسی به تراکنش‌ها و گزارش‌های مالی
- **`support`**: مدیر پشتیبانی - دسترسی به تیکت‌ها و مدیریت کاربران
- **`room`**: مدیر اتاق‌ها - دسترسی به مدیریت room_templates و rooms

### تشخیص نقش ادمین

#### منبع داده
- **جدول `users`**: فیلد `role` (نوع: text/enum)
- **جدول `users`**: فیلد `admin_sub_role` (نوع: `admin_sub_role` enum یا `null`)
- **NOT از `app_metadata` یا `user_metadata`**: نقش از جدول `users` خوانده می‌شود

#### فرآیند تشخیص
1. **در Services:**
   - `services/dashboard.ts`: `loadDashboardUserInfo()` - خواندن `role` و `admin_sub_role` از جدول `users`
   - `lib/admin-permissions.ts`: `getCurrentAdminPermissions()` - بررسی `role === "admin"` و بارگذاری permissions

2. **در Components:**
   - `app/(admin)/dashboard/page.tsx`: 
     - `const isAdmin = userRole === "admin"`
     - `const adminSubRole = data?.user?.adminSubRole || null`
     - بررسی دسترسی‌ها بر اساس `permissions` از جدول `admin_permissions`

3. **در Layout:**
   - `app/(admin)/layout.tsx`: Layout مخصوص admin (بدون guard خاص، فقط route group)

### فایل‌های مرتبط با Role Checking
- `lib/auth-helpers.ts`: Type definitions و helper functions برای roles
- `services/dashboard.ts`: `loadDashboardUserInfo()` - خواندن role از دیتابیس
- `lib/admin-permissions.ts`: `getCurrentAdminPermissions()` - بررسی permissions
- `services/admins.ts`: فیلتر کردن admin‌ها بر اساس `role = 'admin'`
- `services/users.ts`: `loadManagedUsers()` - فیلتر کردن کاربران بر اساس role
- `services/transactions.ts`: بررسی role برای دسترسی به تراکنش‌ها
- `app/(admin)/dashboard/page.tsx`: بررسی role و permissions برای نمایش منوها

### خلاصه
- **منبع نقش:** جدول `users.role` (نه metadata)
- **منبع sub-role:** جدول `users.admin_sub_role`
- **تشخیص در فرانت:** شرط‌های ساده `role === "admin"` در کامپوننت‌ها
- **Guard:** هیچ middleware یا HOC خاصی برای محافظت از routes وجود ندارد (فقط route groups)

---

## 3. صفحات و کامپوننت‌های ادمین

### Route Structure
تمام صفحات ادمین در `app/(admin)/` قرار دارند (Next.js Route Group).

### صفحات اصلی

| مسیر | فایل | توضیحات |
|------|------|---------|
| `/admin/dashboard` | `app/(admin)/dashboard/page.tsx` | داشبورد اصلی ادمین - نمایش آمار مالی، منوهای ناوبری |
| `/admin/users` | `app/(admin)/admin/users/page.tsx` | لیست کاربران زیرمجموعه - نمایش و جستجوی کاربران |
| `/admin/users/[userId]` | `app/(admin)/admin/users/[userId]/page.tsx` | صفحه حساب کاربر - نمایش جزئیات، تغییر نقش، تعلیق |
| `/admin/transactions` | `app/(admin)/admin/transactions/page.tsx` | مدیریت تراکنش‌ها - واریز/برداشت دستی، تاریخچه |
| `/admin/room-templates` | `app/(admin)/admin/room-templates/page.tsx` | مدیریت Room Templates - ایجاد، ویرایش، حذف |
| `/admin/entry-banner` | `app/(admin)/admin/entry-banner/page.tsx` | لیست بنرهای ورودی |
| `/admin/entry-banner/create` | `app/(admin)/admin/entry-banner/create/page.tsx` | ایجاد بنر ورودی جدید |
| `/admin/entry-banner/[bannerId]` | `app/(admin)/admin/entry-banner/[bannerId]/page.tsx` | ویرایش/حذف بنر موجود |
| `/admin/admins` | `app/(admin)/admin/admins/page.tsx` | مدیریت مدیران - تغییر sub-role، تعلیق، تنظیم permissions |
| `/admin/settings` | `app/(admin)/admin/settings/page.tsx` | تنظیمات ادمین - تغییر کد معرف |

### کامپوننت‌های مشترک

| کامپوننت | مسیر | توضیحات |
|----------|------|---------|
| `TransactionsManager` | `components/admin/TransactionsManager.tsx` | مدیریت تراکنش‌ها - واریز/برداشت دستی، تاریخچه |
| `ManagedUsersList` | `components/admin/ManagedUsersList.tsx` | لیست کاربران زیرمجموعه با فیلتر role |
| `UserAccountPage` | `components/admin/UserAccountPage.tsx` | صفحه حساب کاربر - نمایش جزئیات، تغییر نقش، تعلیق |
| `AdminsList` | `components/admin/AdminsList.tsx` | لیست مدیران با امکان تغییر sub-role و permissions |
| `RoomTemplatePanel` | `components/admin/RoomTemplatePanel.tsx` | پنل مدیریت Room Templates |

### Layout
- **`app/(admin)/layout.tsx`**: Layout مشترک برای تمام صفحات admin
  - شامل `DingHeader` (نمایش موجودی Toman)
  - شامل `EntryBannerModal` (نمایش بنرهای ورودی)

---

## 4. عملیات حساس (Critical Operations) که از فرانت‌اند صدا زده می‌شوند

### جدول عملیات حساس

| مسیر فایل | نوع عملیات | جدول/تابع | توضیحات |
|-----------|------------|-----------|---------|
| `services/transactions.ts` | RPC | `fn_adjust_wallet_manual` | واریز/برداشت دستی موجودی کیف پول کاربران - از پنل تراکنش‌ها |
| `services/transactions.ts` | SELECT | `transactions` | خواندن تاریخچه تراکنش‌های manual_panel |
| `services/user-account.ts` | UPDATE | `users` | تغییر نقش کاربر (player → agent/super/admin) |
| `services/user-account.ts` | UPDATE | `users` | تعلیق/فعال‌سازی اکانت کاربر (تغییر status) |
| `services/user-account.ts` | UPDATE | `user_commissions` | تغییر درصد کمیسیون agent/super |
| `services/user-account.ts` | INSERT/UPDATE | `user_notes` | ایجاد/ویرایش یادداشت شخصی درباره کاربر |
| `services/user-account.ts` | DELETE | `user_notes` | حذف یادداشت شخصی |
| `services/admins.ts` | UPDATE | `users` | تغییر `admin_sub_role` مدیر |
| `services/admins.ts` | UPDATE | `users` | تعلیق/فعال‌سازی اکانت مدیر |
| `services/admins.ts` | INSERT/UPDATE/DELETE | `admin_permissions` | تنظیم دسترسی‌های مدیر (rooms, users, transactions, entry_banner, admins) |
| `services/rooms.ts` | UPDATE | `room_templates` | ویرایش Room Template |
| `services/rooms.ts` | INSERT | `room_templates` | ایجاد Room Template جدید |
| `services/rooms.ts` | DELETE | `room_templates` | حذف Room Template |
| `services/rooms.ts` | RPC | `fn_join_or_create_room` | ایجاد/join کردن room و رزرو کارت‌ها (از player panel) |
| `services/entry-banner.ts` | INSERT | `entry_banners` | ایجاد بنر ورودی جدید |
| `services/entry-banner.ts` | UPDATE | `entry_banners` | ویرایش بنر موجود |
| `services/entry-banner.ts` | DELETE | `entry_banners` | حذف بنر |
| `services/entry-banner.ts` | Storage | `banner-images` | آپلود تصویر بنر (Supabase Storage) |
| `services/profile.ts` | UPDATE | `user_profiles` | تغییر display name کاربر |
| `services/profile.ts` | UPDATE | `user_profiles` | تغییر avatar کاربر |
| `services/profile.ts` | Storage | `avatars` | آپلود avatar سفارشی (Supabase Storage) |
| `lib/auth-helpers.ts` | UPDATE | `users` | تغییر referral_code کاربر |

### نکات مهم
- **تمام عملیات از فرانت با anon key انجام می‌شود** (نه service role)
- **RLS Policies** باید دسترسی‌ها را کنترل کنند
- **RPC Functions** (`fn_adjust_wallet_manual`, `fn_join_or_create_room`) منطق business را در دیتابیس اجرا می‌کنند

---

## 5. RLS و سیاست‌های امنیتی جداول حساس

### وضعیت RLS در Migration Files

#### جداول بررسی شده

**`users`**
- **RLS:** فعال (در migration `update_users_referral_code_policy.sql` ذکر شده)
- **Policy:** "Users can update own referral_code" - agent, super, admin می‌توانند referral_code خودشان را تغییر دهند

**`referral_code_history`**
- **RLS:** فعال (در migration `create_referral_code_history.sql`)
- **Policy:** "Users can view own referral code history" - کاربران فقط می‌توانند تاریخچه خودشان را ببینند

**`admin_permissions`**
- **RLS:** فعال (در migration `add_admin_sub_role.sql` ذکر نشده، اما جدول ایجاد شده)
- **Policy:** جزئیات در migration files پیدا نشد

### جداول دیگر
- **`wallets`**: RLS policies در migration files پیدا نشد
- **`transactions`**: RLS policies در migration files پیدا نشد
- **`card_pools`**: RLS policies در migration files پیدا نشد
- **`rooms`**: RLS policies در migration files پیدا نشد
- **`tickets`**: RLS policies در migration files پیدا نشد
- **`room_templates`**: RLS policies در migration files پیدا نشد
- **`entry_banners`**: RLS policies در migration files پیدا نشد

### خلاصه
- **فقط 2 جدول** (`users`, `referral_code_history`) در migration files دارای RLS policy هستند
- **سایر جداول حساس** (wallets, transactions, rooms, tickets) در migration files بررسی نشدند
- **توصیه:** باید تمام جداول حساس دارای RLS policies باشند

---

## 6. Workerها، Jobها و Edge Functionها

### Edge Functions
- **هیچ Edge Function در فولدر `supabase/functions` پیدا نشد**
- **در مستندات:** `draw_jobs_occurrences.md` به یک worker برای پردازش draw jobs اشاره می‌کند، اما فایل واقعی پیدا نشد

### Background Jobs
- **`draw_jobs`**: جدول برای ذخیره job‌های draw (در مستندات ذکر شده)
- **`rpc_pick_draw_jobs`**: RPC function برای انتخاب jobs (در مستندات ذکر شده)
- **`rpc_apply_marks_for_draw`**: RPC function برای اعمال marks (در مستندات ذکر شده)
- **`fn_evaluate_room_after_draw`**: Function برای ارزیابی room بعد از draw (در مستندات ذکر شده)
- **`fn_payout_room_if_full`**: Function برای پرداخت room (در مستندات ذکر شده)

### خلاصه
- **هیچ Edge Function واقعی در ریپو پیدا نشد**
- **Worker logic** در مستندات ذکر شده اما فایل‌های واقعی پیدا نشد
- **RPC Functions** برای draw jobs در دیتابیس وجود دارند (در مستندات)

---

## 7. خلاصهٔ وضعیت موجود

### اتصال به Supabase
- **کلاینت اصلی:** `lib/supabaseClient.ts` - استفاده از `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- **همه عملیات از فرانت:** با anon key انجام می‌شود (نه service role)
- **Service Role:** فقط در مستندات Edge Functions ذکر شده، در کد اصلی استفاده نشده

### تشخیص نقش ادمین
- **منبع:** جدول `users.role` (نه metadata)
- **Sub-role:** جدول `users.admin_sub_role`
- **تشخیص در فرانت:** شرط‌های ساده `role === "admin"` در کامپوننت‌ها
- **Guard:** هیچ middleware یا HOC خاصی برای محافظت از routes وجود ندارد (فقط route groups)

### عملیات حساس از فرانت
- **واریز/برداشت دستی:** `fn_adjust_wallet_manual` RPC
- **تغییر نقش کاربر:** UPDATE روی `users.role`
- **تعلیق اکانت:** UPDATE روی `users.status`
- **تغییر sub-role مدیر:** UPDATE روی `users.admin_sub_role`
- **تنظیم permissions:** INSERT/UPDATE/DELETE روی `admin_permissions`
- **مدیریت Room Templates:** INSERT/UPDATE/DELETE روی `room_templates`
- **مدیریت Entry Banners:** INSERT/UPDATE/DELETE روی `entry_banners`
- **همه عملیات:** با anon key و وابسته به RLS policies

### Worker/Job System
- **Edge Functions:** هیچ Edge Function واقعی در ریپو پیدا نشد
- **Draw Jobs:** RPC functions برای پردازش draw jobs در دیتابیس وجود دارند (در مستندات)
- **Background Processing:** منطق worker در مستندات ذکر شده اما فایل‌های واقعی پیدا نشد

### امنیت
- **RLS:** فقط 2 جدول (`users`, `referral_code_history`) در migration files دارای RLS policy هستند
- **سایر جداول حساس:** RLS policies در migration files بررسی نشدند
- **توصیه:** باید تمام جداول حساس دارای RLS policies باشند

---

## 8. توصیه‌های بهبود

### امنیت
1. **افزودن RLS Policies:** تمام جداول حساس (wallets, transactions, rooms, tickets, room_templates, entry_banners) باید دارای RLS policies باشند
2. **Middleware Guard:** افزودن middleware برای محافظت از routes admin
3. **Service Role:** استفاده از service role برای عملیات حساس (به جای anon key)

### معماری
1. **Edge Functions:** پیاده‌سازی Edge Functions برای عملیات background
2. **API Routes:** استفاده از Next.js API Routes برای عملیات حساس (به جای direct client calls)
3. **Validation:** افزودن validation در server-side برای عملیات حساس

---

**پایان سند**

