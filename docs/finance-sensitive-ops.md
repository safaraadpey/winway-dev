# عملیات حساس مالی - لیست کامل

**تاریخ تولید:** 2025-01-XX  
**هدف:** شناسایی تمام جاهایی که روی جداول مالی (`wallets`, `transactions`, `commissions_log`, `user_commissions`) عملیات INSERT/UPDATE/DELETE انجام می‌شود

---

## جدول عملیات حساس مالی

| # | منبع | نوع عملیات | جدول | توضیحات |
|---|------|------------|------|---------|
| 1 | `fn_adjust_wallet_manual` (Postgres Function) | UPDATE | `wallets` | به‌روزرسانی موجودی کیف پول در واریز/برداشت دستی |
| 2 | `fn_adjust_wallet_manual` (Postgres Function) | INSERT | `wallets` | ایجاد والت جدید اگر وجود نداشته باشد |
| 3 | `fn_adjust_wallet_manual` (Postgres Function) | INSERT | `transactions` | ثبت تراکنش واریز/برداشت دستی |
| 4 | `fn_distribute_ticket_commission` (Postgres Function) | UPDATE | `wallets` | به‌روزرسانی موجودی agent/super/admin هنگام توزیع کمیسیون بلیط |
| 5 | `fn_distribute_ticket_commission` (Postgres Function) | INSERT | `transactions` | ثبت تراکنش‌های کمیسیون (fee_agent, fee_super, fee_admin) |
| 6 | `fn_distribute_ticket_commission` (Postgres Function) | UPDATE | `commissions_log` | علامت‌گذاری توزیع‌شدن کمیسیون (distributed_at) |
| 7 | `fn_record_ticket_commission` (Postgres Function) | INSERT | `commissions_log` | ثبت محاسبه کمیسیون بلیط |
| 8 | `fn_payout_room_if_full` (Postgres Function) | UPDATE | `wallets` | به‌روزرسانی موجودی برندگان (احتمالاً) |
| 9 | `fn_payout_room_if_full` (Postgres Function) | INSERT | `transactions` | ثبت تراکنش‌های پرداخت جایزه (احتمالاً) |
| 10 | `services/user-account.ts` → `changeUserRole()` | UPDATE/UPSERT | `user_commissions` | مدیریت `user_commissions` هنگام تغییر نقش کاربر |
| 11 | `services/user-account.ts` → `saveUserCommission()` | UPSERT | `user_commissions` | ذخیره درصد کمیسیون agent/super |

---

## جزئیات هر عملیات

### 1-3. `fn_adjust_wallet_manual` - واریز/برداشت دستی

**فایل:** Postgres Function (در دیتابیس)  
**مستندات:** `docs/backend/manual-transactions.md`  
**فراخوانی از:**
- `app/api/admin/wallet/adjust/route.ts` (API route - جدید)
- `services/transactions.ts` → `adjustWalletForUsersBulk()` (فرانت - قدیمی، باید به API route منتقل شود)

**عملیات:**
1. **UPDATE `wallets`**: به‌روزرسانی `balance` و `updated_at`
2. **INSERT `wallets`**: ایجاد والت جدید اگر برای کاربر/ارز وجود نداشته باشد
3. **INSERT `transactions`**: ثبت تراکنش با `source_kind='manual_panel'`

**جزئیات:**
- فقط admin/super/agent می‌توانند این function را فراخوانی کنند
- بررسی موجودی کافی برای برداشت
- استفاده از `FOR UPDATE` برای جلوگیری از race condition

**خطر:** ⚠️ **بسیار حساس** - دستکاری مستقیم پول

---

### 4-6. `fn_distribute_ticket_commission` - توزیع کمیسیون بلیط

**فایل:** Postgres Function (در دیتابیس)  
**Schema:** `game_finance`  
**مستندات:** `docs/backend/supabese/game/tickets/tickets_functions_documentation.md`  
**فراخوانی از:**
- Trigger: `game_finance.trg_tickets_after_paid` (بعد از پرداخت بلیط)
- Worker: draw jobs (احتمالاً)

**عملیات:**
1. **UPDATE `wallets`**: به‌روزرسانی موجودی agent، super، و admin
2. **INSERT `transactions`**: ثبت تراکنش‌های `fee_agent`, `fee_super`, `fee_admin`
3. **UPDATE `commissions_log`**: علامت‌گذاری `distributed_at` و به‌روزرسانی `admin_amount` (در صورت rollup)

**جزئیات:**
- ابتدا `commissions_log` را می‌خواند (یا با `fn_record_ticket_commission` می‌سازد)
- اگر والت agent/super وجود نداشته باشد، مبلغ به admin اضافه می‌شود (rollup)
- استفاده از `FOR UPDATE` برای جلوگیری از race condition

**خطر:** ⚠️ **بسیار حساس** - توزیع خودکار کمیسیون

---

### 7. `fn_record_ticket_commission` - ثبت کمیسیون بلیط

**فایل:** Postgres Function (در دیتابیس)  
**Schema:** `game_finance`  
**مستندات:** `docs/backend/supabese/game/tickets/tickets_functions_documentation.md`  
**فراخوانی از:**
- `fn_distribute_ticket_commission` (اگر رکورد وجود نداشته باشد)
- Trigger: `game_finance.trg_tickets_after_paid` (بعد از پرداخت بلیط)

**عملیات:**
1. **INSERT `commissions_log`**: ثبت محاسبه کمیسیون بلیط

**جزئیات:**
- محاسبه کمیسیون بر اساس `commission_rate` اتاق و `agent_commission`/`super_commission`
- اگر قبلاً ثبت شده باشد، همان `id` را برمی‌گرداند (idempotent)

**خطر:** ⚠️ **حساس** - ثبت محاسبه کمیسیون

---

### 8-9. `fn_payout_room_if_full` - پرداخت جایزه اتاق

**فایل:** Postgres Function (در دیتابیس)  
**Schema:** `public`  
**مستندات:** `docs/backend/supabese/game/draws/bingo_draw_worker_analysis.md`  
**فراخوانی از:**
- Worker: draw jobs (بعد از ارزیابی برندگان)
- `sql/optimization/03_parallel_workers.sql`

**عملیات:**
- **UPDATE `wallets`**: به‌روزرسانی موجودی برندگان (احتمالاً)
- **INSERT `transactions`**: ثبت تراکنش‌های پرداخت جایزه (احتمالاً)

**جزئیات:**
- این function در مستندات ذکر شده اما کد دقیق آن در دسترس نیست
- احتمالاً بعد از `fn_evaluate_room_after_draw` فراخوانی می‌شود

**خطر:** ⚠️ **بسیار حساس** - پرداخت جایزه به برندگان

---

### 10. `changeUserRole()` - مدیریت user_commissions هنگام تغییر نقش

**فایل:** `services/user-account.ts`  
**تابع:** `changeUserRole()`  
**نوع:** UPDATE/UPSERT روی `user_commissions`  
**UI:** `components/admin/UserAccountPage.tsx` → بخش "نقش" → dropdown

**عملیات:**
- **UPDATE/UPSERT `user_commissions`**: مدیریت `agent_commission` و `super_commission` بر اساس نقش جدید

**جزئیات:**
- اگر کاربر به Agent تبدیل شود: `super_commission = null`
- اگر کاربر به Super تبدیل شود: `agent_commission = null`
- اگر کاربر به Player تبدیل شود: هر دو `null` (اما این حالت نباید اتفاق بیفتد)

**خطر:** ⚠️ **حساس** - تغییر تنظیمات کمیسیون

**نکته:** این عملیات باید به API route منتقل شود (طبق `docs/admin-migration-plan.md`)

---

### 11. `saveUserCommission()` - ذخیره درصد کمیسیون

**فایل:** `services/user-account.ts`  
**تابع:** `saveUserCommission()`  
**نوع:** UPSERT روی `user_commissions`  
**UI:** `components/admin/UserAccountPage.tsx` → بخش "درصد کانیات" → input + دکمه "ثبت"

**عملیات:**
- **UPSERT `user_commissions`**: ذخیره `agent_commission` یا `super_commission`

**جزئیات:**
- فقط برای role=agent یا role=super
- تبدیل درصد (0-100) به اعشار (0-1)
- استفاده از `onConflict: "user_id"` برای upsert

**خطر:** ⚠️ **حساس** - تغییر درصد کمیسیون

**نکته:** این عملیات باید به API route منتقل شود (طبق `docs/admin-migration-plan.md`)

---

## عملیات‌های خواندن (SELECT) - کمتر حساس

این عملیات‌ها فقط خواندن هستند و تغییر در دیتابیس ایجاد نمی‌کنند:

| فایل | جدول | توضیحات |
|------|------|---------|
| `services/transactions.ts` | `transactions` | خواندن تاریخچه تراکنش‌های manual_panel |
| `services/user-account.ts` | `wallets`, `transactions`, `commissions_log` | خواندن موجودی، تراکنش‌ها و کمیسیون کاربر |
| `services/users.ts` | `wallets` | خواندن موجودی کیف‌پول کاربران |
| `services/dashboard.ts` | `transactions`, `commissions_log` | خواندن برای گزارش‌های مالی |
| `services/financial-reports.ts` | `transactions` | خواندن تراکنش‌های مالی |
| `services/leaderboard.ts` | `transactions` | خواندن برای لیدر بورد |
| `components/admin/TransactionsManager.tsx` | `wallets` | خواندن موجودی برای نمایش |
| `lib/hooks/useWalletBalances.ts` | `wallets` | خواندن موجودی (hook) |
| `lib/hooks/useBalances.ts` | `wallets` | خواندن موجودی (hook) |

---

## خلاصه اولویت‌بندی

### 🔴 بسیار حساس (اولویت بالا)
1. **`fn_adjust_wallet_manual`** - دستکاری مستقیم پول (واریز/برداشت دستی)
2. **`fn_distribute_ticket_commission`** - توزیع خودکار کمیسیون
3. **`fn_payout_room_if_full`** - پرداخت جایزه به برندگان

### 🟡 حساس (اولویت متوسط)
4. **`fn_record_ticket_commission`** - ثبت محاسبه کمیسیون
5. **`changeUserRole()` → user_commissions** - تغییر تنظیمات کمیسیون هنگام تغییر نقش
6. **`saveUserCommission()` → user_commissions** - تغییر درصد کمیسیون

---

## نکات امنیتی

### 1. RLS Policies
- تمام جداول مالی باید RLS فعال داشته باشند
- Service role از RLS عبور می‌کند، بنابراین باید در API routes با دقت استفاده شود

### 2. Race Conditions
- Functions از `FOR UPDATE` استفاده می‌کنند برای جلوگیری از race condition
- `fn_adjust_wallet_manual` و `fn_distribute_ticket_commission` باید transactional باشند

### 3. Audit Trail
- تمام تغییرات در `transactions` ثبت می‌شوند
- `commissions_log` تاریخچه کامل کمیسیون‌ها را نگه می‌دارد

### 4. Migration به API Routes
- طبق `docs/admin-migration-plan.md`، عملیات‌های حساس باید به API routes منتقل شوند
- `fn_adjust_wallet_manual` ✅ (انجام شده - پایلوت)
- `changeUserRole()` و `saveUserCommission()` ⏳ (در TODO list)

---

## منابع و مستندات مرتبط

- `docs/admin-sensitive-operations.md` - لیست عملیات حساس ادمین
- `docs/admin-migration-plan.md` - برنامه مهاجرت به API routes
- `docs/backend/manual-transactions.md` - مستندات `fn_adjust_wallet_manual`
- `docs/backend/supabese/game/tickets/tickets_functions_documentation.md` - مستندات functions کمیسیون
- `docs/backend/supabese/game/draws/bingo_draw_worker_analysis.md` - مستندات draw worker و payout

---

**پایان سند**

