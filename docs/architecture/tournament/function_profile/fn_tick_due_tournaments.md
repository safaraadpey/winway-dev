## Function Execution Profile

### Name
**fn_tick_due_tournaments**  
> *Note:* نام دقیق تابع در کد اصلی باید اینجا گذاشته شود (همان تابعی که روی چند تورنومنت loop می‌زند و `fn_tick_tournament` را صدا می‌کند).

---

### Purpose (یک جمله)
اجرای batch‑ای tick برای مجموعه‌ای از تورنومنت‌های «رسیده به زمان شروع» یا «در حال اجرا»، با لاگ‌گیری خطا و ادامه‌ی پردازش.

---

### When it runs
- به‌صورت زمان‌بندی‌شده (Cron/Job/Edge Scheduler) یا دستی برای پیشبرد state تورنومنت‌ها.
- هر بار تا سقف `p_limit` تورنومنت را tick می‌کند.

---

### Selection Logic (کدام تورنومنت‌ها را انتخاب می‌کند)
از جدول `public.tournaments` تورنومنت‌هایی که یکی از شرایط زیر را دارند:
1) `status = registration_open` و `start_at IS NOT NULL` و `start_at <= now()`
2) `status = running`

مرتب‌سازی:
- `ORDER BY start_at NULLS LAST, created_at`

محدودیت:
- `LIMIT p_limit`

---

### Inputs (ورودی‌ها)
- `p_limit` : حداکثر تعداد تورنومنت برای tick در این batch.
- `p_seed` : seed مشترک/کنترلی برای tick (به `bigint` تبدیل می‌شود).
- `p_batch_tables` : اگر مقدار داشته باشد، به شکل آرایه‌ی تک‌عضوی به تابع tick پاس داده می‌شود؛ اگر NULL باشد، NULL پاس داده می‌شود.

---

### Core Action (کاری که انجام می‌دهد)
برای هر تورنومنت منتخب:
1) `tournament.fn_tick_tournament(...)` را اجرا می‌کند.
2) اگر موفق بود، شمارنده‌ی `v_count` را +1 می‌کند.

---

### Calls (توابعی که صدا می‌زند)
#### 1) Tick اصلی تورنومنت
- `tournament.fn_tick_tournament(
  p_tournament_id uuid,
  p_seed bigint,
  p_batch_tables integer[]
)`

نحوه ارسال پارامترها:
- `p_tournament_id := r.id`
- `p_seed := p_seed::bigint`
- `p_batch_tables := CASE WHEN p_batch_tables IS NULL THEN NULL::integer[] ELSE ARRAY[p_batch_tables::integer] END`

---

### Error Handling (رفتار در خطا)
- `lock_not_available` → تورنومنت فعلی را skip می‌کند و سراغ بعدی می‌رود (برای جلوگیری از درگیری concurrent).
- `others` → جزئیات خطا را استخراج می‌کند و در لاگ می‌نویسد و ادامه می‌دهد.

استخراج جزئیات:
- `PG_EXCEPTION_CONTEXT`
- `PG_EXCEPTION_DETAIL`
- `PG_EXCEPTION_HINT`

ثبت لاگ:
- جدول مقصد: `tournament.tournament_tick_log`
- فیلدهای کلیدی: `tournament_id`, `stage='fn_tick_tournament'`, `sqlstate`, `message`, `context`

---

### Outputs (خروجی)
- `RETURN v_count` : تعداد تورنومنت‌هایی که tick آن‌ها با موفقیت انجام شده است.

---

### Side Effects (اثر روی state)
- هیچ state تورنومنتی را مستقیم تغییر نمی‌دهد؛ تغییرات state از داخل `tournament.fn_tick_tournament` انجام می‌شود.
- در صورت خطا، رکورد لاگ در `tournament.tournament_tick_log` درج می‌شود.

---

### Debug Notes (برای دیباگ سریع)
- اگر `v_count` پایین است ولی تورنومنت‌ها زیادند:
  - احتمال `lock_not_available` بالا (concurrency) یا خطاهای داخلی tick.
- برای ریشه‌یابی خطاها:
  - آخرین رکوردهای `tournament.tournament_tick_log` را با `tournament_id` و `stage` بررسی کن.
- تفاوت `NULL` vs `ARRAY[x]` در `p_batch_tables`:
  - `NULL` یعنی بدون محدودیت batch.
  - `ARRAY[x]` یعنی اجرای محدود فقط روی batch مشخص.

