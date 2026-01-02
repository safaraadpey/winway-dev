## ثبت‌نام تورنومنت و محاسبه کمیسیون (وضعیت فعلی DB)

این سند خلاصهٔ منطق فعلی بر اساس توابع و جداول موجود در دیتابیس (postgres) و لاگ‌های بررسی‌شده است. هیچ تغییری در کد ایجاد نشده است.

### 1) ثبت‌نام/افزایش خرید
- ورود الزامی: `auth.uid()` در همهٔ توابع.
- محدودیت وضعیت: تابع نگهبان `tournament._assert_registration_open(p_tournament_id)` فقط در حالت `registration_open` اجازه می‌دهد؛ در غیر این صورت خطاهای `TOURNAMENT_NOT_FOUND` یا `REGISTRATION_NOT_OPEN`.
- هولد مبلغ (فرانت): RPC `public.fn_tournament_wallet_hold` → از موجودی آزاد کم، به `locked_amount` اضافه می‌کند، تراکنش `join_hold` با `source_kind='tournament_join'` (متادیتا: `tournament_id`, `entry_id`).
- ثبت/به‌روزرسانی entry:
  - تابع DB اصلی: `tournament.buy_tickets(p_tournament_id uuid, p_delta int)`
  - اگر رکوردی برای `(tournament_id, user_id)` نباشد: حداقل بلیت (`min_tickets_per_player`) + `p_delta` محاسبه و با وضعیت `created` درج می‌شود.
  - اگر رکورد فعال باشد: `tickets_count += p_delta` تا سقف/کف (`min/max_tickets_per_player`) رعایت شود و `amount = tickets_count * ticket_price` به‌روزرسانی می‌شود.
  - خطاهای اصلی: `UNAUTHENTICATED`, `TOURNAMENT_BAD_PRICING`, `ENTRY_NOT_ACTIVE`, `MIN_TICKETS_NOT_MET`, `MAX_TICKETS_EXCEEDED`.

### 2) لغو ثبت‌نام
- تابع: `tournament.cancel_registration(p_tournament_id uuid)`
- نگهبان وضعیت: `_assert_registration_open`.
- فقط رکوردهای `status='created'` همان کاربر را به‌روزرسانی می‌کند: `status='cancelled'`, `tickets_count=0`, `amount=0`. در غیر این صورت خطا `ENTRY_NOT_FOUND_OR_NOT_ACTIVE`.
- هولد آزادسازی (فرانت): RPC `public.fn_tournament_wallet_release` با تراکنش `join_refund` و کاهش `locked_amount`.

### 3) جداول کلیدی
- `public.tournament_entries`: نمایندهٔ مشارکت کاربر در تورنومنت (کلید یکتا `(tournament_id, user_id)`؛ `entry_id` ثابت می‌ماند). ستون‌های مهم: `tickets_count`, `amount`, `status` از نوع `public.tournament_entry_status` با مقادیر `created | cancelled`.
- `public.tournament_commission_snapshots`: خروجی محاسبهٔ کمیسیون برای هر `(tournament_id, entry_id)`؛ ستون‌ها شامل `gross_amount`, `commission_rate`, `agent/super/admin_amount`, `amount_to_pool`, `currency`.
- `public.tournament_commission_payouts`: رکوردهای پرداخت کمیسیون (pending/paid/cancelled) به تفکیک beneficiary و نقش (agent/super/admin/pool).

### 4) محاسبه کمیسیون (Snapshot)
- تابع: `tournament.fn_commission_snapshot(p_tournament_id, p_entry_id)`
- ورودی‌ها: تنظیمات تورنومنت (`commission_rate`, `commission_model`, `currency`, `ticket_price`) و رکورد `tournament_entries`.
- محاسبات فعلی (طبق مهاجرت 2026-01-01):
  - `gross_amount = tickets_count * ticket_price`
  - `commission_rate` بر حسب درصد (0..100)، در کد جاری به کل مبلغ اعمال و به admin اختصاص یافته؛ مقادیر agent/super فعلاً صفر (در اسنپ‌شات‌های مشاهده‌شده).
  - `amount_to_pool = gross_amount - admin_amount`
- نتیجه با UPSERT در `tournament_commission_snapshots` ذخیره می‌شود (idempotent).

### 5) ساخت رکورد پرداخت کمیسیون
- تابع: `tournament.fn_commission_payout(p_tournament_id, p_entry_id)`
- از snapshot می‌خواند و برای هر نقش با مبلغ >0 رکورد `tournament_commission_payouts` با `status='pending'` درج می‌کند (pool، admin، agent، super).
- قبل از درج، رکوردهای قبلی همان `(tournament_id, entry_id)` حذف می‌شوند (idempotent).

### 6) Capturing مبلغ هولد (شروع تورنومنت)
- تابع: `tournament.fn_wallet_capture_join(p_tournament_id, p_entry_id, p_amount, p_currency)` (و wrapper `public.fn_tournament_wallet_capture`)
  - نیاز به `auth.uid()`؛ قفل کیف پول؛ بررسی `locked_amount >= amount`.
  - تراکنش `join_capture` با متا `tournament_id/entry_id` درج می‌کند.
  - `locked_amount` کاهش می‌یابد (مبلغ آزاد نمی‌شود؛ صرفاً lock کاهش می‌یابد).
  - این تابع معمولاً در ارکستریتور شروع تورنومنت صدا زده می‌شود (پس از پایان ثبت‌نام).

### 7) محدودیت‌ها و نقاط کنترلی
- وضعیت تورنومنت: همهٔ مسیرهای ثبت‌نام/لغو/خرید بلیت به `_assert_registration_open` متکی هستند؛ خارج از `registration_open` خطا می‌دهد.
- احراز هویت: همهٔ توابع سرویس در اسکیما `tournament` `SECURITY DEFINER` هستند ولی `auth.uid()` را بررسی می‌کنند؛ کاربر ناشناس خطا می‌گیرد.
- سقف/کف خرید: `min_tickets_per_player` و `max_tickets_per_player` در `tournaments` در buy_tickets enforce می‌شود.
- Idempotency:
  - snapshot: ON CONFLICT (tournament_id, entry_id) DO UPDATE
  - payouts: حذف قبلی و درج جدید
  - entry: کلید یکتا `(tournament_id, user_id)` و UPDATE در buy_tickets

### 8) نمونهٔ وضعیت فعلی (کوئری‌های اخیر)
- تورنومنت «تورنومنت تست» (running): دو entry با tickets_count=5 و 15؛ snapshot با commission_rate=0 → تمام مبلغ به pool.
- تورنومنت «jsj» و «تست دوم»: snapshots با commission_rate=10% و super_id حاضر، agent_amount=0.

> برای تغییر رفتار (مثلاً سهم agent/super یا زمان اجرای snapshot/payout) باید توابع موجود را به‌روزرسانی کرد؛ این سند صرفاً وضع موجود را گزارش می‌کند.

