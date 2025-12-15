# تحلیل Function `bingo_draw_worker` (pg_cron Jobs - Workerهای موازی)

**تاریخ تحلیل:** $(date)  
**Job Names:** `bingo_draw_worker_1`, `bingo_draw_worker_2`, `bingo_draw_worker_3`  
**Function:** `public.fn_process_draw_jobs_batch_worker(p_worker_id, p_total_workers)`

---

## 📋 اطلاعات Cron Jobs

### تنظیمات pg_cron (Workerهای موازی)

| Job ID | Job Name | Schedule | Command | Status |
|--------|----------|----------|---------|--------|
| 11 | `bingo_draw_worker_1` | `1 second` | `SELECT public.fn_process_draw_jobs_batch_worker(1, 3);` | ✅ Active |
| 12 | `bingo_draw_worker_2` | `1 second` | `SELECT public.fn_process_draw_jobs_batch_worker(2, 3);` | ✅ Active |
| 13 | `bingo_draw_worker_3` | `1 second` | `SELECT public.fn_process_draw_jobs_batch_worker(3, 3);` | ✅ Active |

**نکته:** 
- Worker قدیمی (`bingo_draw_worker`) غیرفعال شده است
- 3 Worker موازی هر 1 ثانیه یکبار اجرا می‌شوند
- هر Worker بار کاری را بر اساس hash `room_id` تقسیم می‌کند

---

## 🔍 تحلیل Function `fn_process_draw_jobs_batch_worker()`

### مشخصات Function

- **Schema:** `public`
- **Name:** `fn_process_draw_jobs_batch_worker`
- **Return Type:** `void`
- **Language:** PL/pgSQL
- **Arguments:** 
  - `p_worker_id integer` - شناسه Worker (1, 2, یا 3)
  - `p_total_workers integer` - تعداد کل Workerها (3)

### کد کامل Function

```sql
CREATE OR REPLACE FUNCTION public.fn_process_draw_jobs_batch_worker(
  p_worker_id integer,
  p_total_workers integer
)
 RETURNS void
 LANGUAGE plpgsql
AS $function$
DECLARE
  job record;
BEGIN
  -- 1) گرفتن batch از jobها با Worker ID
  FOR job IN
    SELECT *
    FROM game_core.rpc_pick_draw_jobs(
      p_limit => 100,
      p_worker_id => p_worker_id,
      p_total_workers => p_total_workers
    )
  LOOP
    begin
      -- 2) اعمال مارک‌ها
      perform public.rpc_apply_marks_for_draw(
        job.room_id,
        job.draw_number
      );

      -- 3) ارزیابی پس از قرعه
      perform public.fn_evaluate_room_after_draw(
        job.room_id,
        job.draw_number
      );

      -- 4) پرداخت اگر روم کامل شده باشد
      perform public.fn_payout_room_if_full(
        job.room_id
      );

      -- 5) بستن job در صورت موفقیت
      update public.draw_jobs
      set status = 'done',
          updated_at = now()
      where id = job.id;
    exception
      when others then
        -- در صورت خطا: برگرداندن به صف با attempts + 1
        update public.draw_jobs
        set status   = 'queued',
            attempts = coalesce(job.attempts, 0) + 1,
            updated_at = now()
        where id = job.id;
    end;
  end loop;
end;
$function$
```

---

## 🔄 جریان کار (Workflow)

### مرحله 1: دریافت Batch از Jobها

```sql
FOR job IN
  SELECT *
  FROM game_core.rpc_pick_draw_jobs(
    p_limit => 100,
    p_worker_id => p_worker_id,
    p_total_workers => p_total_workers
  )
LOOP
```

**عملکرد:**
- Function `game_core.rpc_pick_draw_jobs()` را با Worker ID فراخوانی می‌کند
- این Function Jobهایی با status `queued` را برمی‌دارد
- از `FOR UPDATE SKIP LOCKED` استفاده می‌کند تا Race Condition نداشته باشیم
- Jobها را بر اساس hash `room_id` بین Workerها توزیع می‌کند
- Status Jobها را به `processing` تغییر می‌دهد
- `attempts` را افزایش می‌دهد
- حداکثر 100 Job را به هر Worker برمی‌گرداند

**نکته:** Workerهای موازی به صورت همزمان کار می‌کنند و بار کاری را تقسیم می‌کنند.

---

### مرحله 2: اعمال مارک‌ها (Marking)

```sql
perform public.rpc_apply_marks_for_draw(
  job.room_id,
  job.draw_number
);
```

**عملکرد:**
- عدد قرعه‌کشی شده (`draw_number`) را روی تمام تیکت‌های اتاق (`room_id`) اعمال می‌کند
- اگر عدد در تیکت وجود داشته باشد، آن را در جدول `marks` ثبت می‌کند
- این کار برای تمام تیکت‌های فعال در اتاق انجام می‌شود

**جداول مرتبط:**
- `marks` - ثبت مارک‌ها
- `tickets` - تیکت‌های اتاق
- `draws` - اطلاعات قرعه‌کشی

---

### مرحله 3: ارزیابی پس از قرعه (Evaluation)

```sql
perform public.fn_evaluate_room_after_draw(
  job.room_id,
  job.draw_number
);
```

**عملکرد:**
- بعد از اعمال مارک، بررسی می‌کند که آیا کسی برنده شده است یا نه
- بررسی می‌کند که آیا کسی Line (یک خط کامل) دارد
- بررسی می‌کند که آیا کسی Full Card (کل کارت) دارد
- برندگان را در جدول `results` ثبت می‌کند
- وضعیت تیکت‌های برنده را به‌روزرسانی می‌کند

**جداول مرتبط:**
- `results` - ثبت نتایج و برندگان
- `tickets` - به‌روزرسانی وضعیت تیکت‌ها
- `marks` - بررسی مارک‌ها برای تشخیص برنده

---

### مرحله 4: پرداخت (Payout)

```sql
perform public.fn_payout_room_if_full(
  job.room_id
);
```

**عملکرد:**
- بررسی می‌کند که آیا اتاق کامل شده است (تمام 90 عدد آمده)
- اگر اتاق کامل شده باشد:
  - جوایز را بین برندگان توزیع می‌کند
  - موجودی کیف پول‌ها را به‌روزرسانی می‌کند
  - تراکنش‌های پرداخت را ثبت می‌کند
  - وضعیت اتاق را به `finished` تغییر می‌دهد

**جداول مرتبط:**
- `rooms` - به‌روزرسانی وضعیت
- `wallets` - به‌روزرسانی موجودی
- `transactions` - ثبت تراکنش‌های پرداخت
- `results` - خواندن برندگان

---

### مرحله 5: بستن Job (Success)

```sql
update public.draw_jobs
set status = 'done',
    updated_at = now()
where id = job.id;
```

**عملکرد:**
- اگر تمام مراحل با موفقیت انجام شد
- Status Job را به `done` تغییر می‌دهد
- `updated_at` را به‌روزرسانی می‌کند

---

### مرحله 6: مدیریت خطا (Error Handling)

```sql
exception
  when others then
    -- در صورت خطا: برگرداندن به صف با attempts + 1
    update public.draw_jobs
    set status   = 'queued',
        attempts = coalesce(job.attempts, 0) + 1,
        updated_at = now()
    where id = job.id;
```

**عملکرد:**
- اگر در هر مرحله خطایی رخ دهد
- Job را دوباره به صف (`queued`) برمی‌گرداند
- `attempts` را افزایش می‌دهد
- این کار باعث می‌شود که Job در اجرای بعدی دوباره پردازش شود

**نکته:** اگر `attempts` خیلی زیاد شود، ممکن است نیاز به محدودیت یا alert باشد.

---

## 📊 نمودار جریان کار

```
┌─────────────────────────────────────┐
│  pg_cron (هر 1 ثانیه)              │
└──────────────┬──────────────────────┘
               │
               ▼
┌─────────────────────────────────────┐
│  fn_process_draw_jobs_batch_worker() │
│  (Worker 1, 2, 3)                   │
└──────────────┬──────────────────────┘
               │
               ▼
┌─────────────────────────────────────┐
│  1. rpc_pick_draw_jobs()            │
│     → دریافت Batch از Jobها         │
│     → Status: queued → processing   │
└──────────────┬──────────────────────┘
               │
               ▼
        ┌──────┴──────┐
        │  Loop Jobs  │
        └──────┬──────┘
               │
               ▼
┌─────────────────────────────────────┐
│  2. rpc_apply_marks_for_draw()      │
│     → اعمال مارک روی تیکت‌ها         │
└──────────────┬──────────────────────┘
               │
               ▼
┌─────────────────────────────────────┐
│  3. fn_evaluate_room_after_draw()   │
│     → بررسی برندگان                 │
│     → ثبت در results                 │
└──────────────┬──────────────────────┘
               │
               ▼
┌─────────────────────────────────────┐
│  4. fn_payout_room_if_full()        │
│     → پرداخت جوایز (اگر کامل شد)    │
└──────────────┬──────────────────────┘
               │
               ▼
        ┌──────┴──────┐
        │   Success?  │
        └──────┬──────┘
        ┌──────┴──────┐
        │             │
        ▼             ▼
┌─────────────┐  ┌─────────────┐
│ Status:     │  │ Status:      │
│ 'done'      │  │ 'queued'     │
│             │  │ attempts++   │
└─────────────┘  └─────────────┘
```

---

## ⚙️ Function‌های فراخوانی شده

### 1. `game_core.rpc_pick_draw_jobs(p_limit integer, p_worker_id integer, p_total_workers integer)`

**نقش:** Pull کردن Jobها از صف با پشتیبانی از Workerهای موازی  
**Schema:** `game_core`  
**Arguments:** 
- `p_limit integer DEFAULT 200` - حداکثر Job در هر Batch
- `p_worker_id integer DEFAULT 1` - شناسه Worker (1, 2, یا 3)
- `p_total_workers integer DEFAULT 1` - تعداد کل Workerها (3)

**عملکرد:**
- Jobهایی با status `queued` را انتخاب می‌کند
- از `FOR UPDATE SKIP LOCKED` استفاده می‌کند (جلوگیری از Race Condition)
- Jobها را بر اساس hash `room_id` بین Workerها توزیع می‌کند
- Status را به `processing` تغییر می‌دهد
- `attempts` را افزایش می‌دهد
- فقط Jobهای مربوط به Worker مشخص شده را برمی‌گرداند

---

### 2. `public.rpc_apply_marks_for_draw(p_room_id uuid, p_draw_number integer)`

**نقش:** اعمال مارک روی تیکت‌ها  
**Schema:** `public` (همچنین در `game_core` نیز وجود دارد)  
**Arguments:** 
- `p_room_id uuid` - شناسه اتاق
- `p_draw_number integer` - عدد قرعه‌کشی شده

**عملکرد:**
- عدد قرعه‌کشی شده را روی تمام تیکت‌های اتاق اعمال می‌کند
- اگر عدد در تیکت وجود داشته باشد، در جدول `marks` ثبت می‌کند
- این کار برای تمام تیکت‌های فعال در اتاق انجام می‌شود

---

### 3. `public.fn_evaluate_room_after_draw(p_room_id uuid, p_draw_number integer)`

**نقش:** ارزیابی برندگان  
**Schema:** `public` (همچنین در `game_core` نیز وجود دارد)  
**Arguments:**
- `p_room_id uuid` - شناسه اتاق
- `p_draw_number integer` - عدد قرعه‌کشی شده

**عملکرد:**
- بعد از اعمال مارک، بررسی می‌کند که آیا کسی برنده شده است
- بررسی می‌کند که آیا کسی Line (یک خط کامل) دارد
- بررسی می‌کند که آیا کسی Full Card (کل کارت) دارد
- برندگان را در جدول `results` ثبت می‌کند
- وضعیت تیکت‌های برنده را به‌روزرسانی می‌کند

---

### 4. `public.fn_payout_room_if_full(p_room_id uuid)`

**نقش:** پرداخت جوایز  
**Schema:** `public`  
**Arguments:**
- `p_room_id uuid` - شناسه اتاق

**عملکرد:**
- بررسی می‌کند که آیا اتاق کامل شده است (تمام 90 عدد آمده)
- اگر کامل شده باشد:
  - جوایز را بین برندگان توزیع می‌کند
  - موجودی کیف پول‌ها را به‌روزرسانی می‌کند
  - تراکنش‌های پرداخت را ثبت می‌کند
  - وضعیت اتاق را به `finished` تغییر می‌دهد

---

## ✅ مزایای این معماری

1. **Batch Processing:** چندین Job را همزمان پردازش می‌کند
2. **Error Handling:** در صورت خطا، Job را دوباره به صف برمی‌گرداند
3. **Race Condition Free:** از `FOR UPDATE SKIP LOCKED` استفاده می‌کند
4. **Retry Mechanism:** با افزایش `attempts`، امکان Retry وجود دارد
5. **Separation of Concerns:** هر مرحله در Function جداگانه‌ای است

---

## ⚠️ نکات مهم

### 1. فرکانس اجرا

Job هر 1 ثانیه یکبار اجرا می‌شود. این ممکن است:
- ✅ برای سیستم‌های با ترافیک بالا مناسب باشد
- ⚠️ ممکن است در صورت کمبود Job، منابع را هدر دهد
- 💡 می‌تواند به `5 seconds` یا `10 seconds` تغییر کند اگر نیاز نیست

### 2. Error Handling

- اگر خطایی رخ دهد، Job دوباره به صف برمی‌گردد
- ⚠️ اگر Job دائماً خطا بدهد، `attempts` زیاد می‌شود
- 💡 بهتر است محدودیتی برای `attempts` در نظر گرفته شود (مثلاً max 5)

### 3. Performance

- Function به صورت Loop کار می‌کند
- اگر تعداد Jobها زیاد باشد، ممکن است زمان‌بر شود
- 💡 بهتر است محدودیتی برای تعداد Jobها در هر Batch در نظر گرفته شود

---

## 🔍 بررسی Function‌های فراخوانی شده

**وضعیت Function‌ها:**

- ✅ `game_core.rpc_pick_draw_jobs(p_limit integer DEFAULT 200)` - موجود و فعال
- ✅ `public.rpc_apply_marks_for_draw(p_room_id, p_draw_number)` - موجود (همچنین در `game_core`)
- ✅ `public.fn_evaluate_room_after_draw(p_room_id, p_draw_number)` - موجود (همچنین در `game_core`)
- ✅ `public.fn_payout_room_if_full(p_room_id)` - موجود و فعال

**نکته:** برخی Function‌ها هم در `public` و هم در `game_core` وجود دارند. Function اصلی از `public` استفاده می‌کند.

---

## 📝 خلاصه

**Function `bingo_draw_worker` (که در واقع `fn_process_draw_jobs_batch_worker` است):**

1. ✅ 3 Worker موازی هر 1 ثانیه توسط pg_cron اجرا می‌شوند
2. ✅ Batch از Jobها را از صف می‌گیرند (با توزیع بر اساس Worker ID)
3. ✅ مارک‌ها را روی تیکت‌ها اعمال می‌کنند
4. ✅ برندگان را ارزیابی می‌کنند (با Query بهینه شده)
5. ✅ جوایز را پرداخت می‌کنند (اگر اتاق کامل شده باشد)
6. ✅ Job را به `done` می‌برند یا در صورت خطا به `queued` برمی‌گردانند

**بهینه‌سازی‌ها:**
- ✅ `fn_evaluate_room_after_draw` بهینه شده (از Loop به Query واحد)
- ✅ Index‌های لازم اضافه شده
- ✅ Workerهای موازی برای تقسیم بار کاری

**وضعیت:** ✅ **Function به درستی پیاده‌سازی شده و فعال است**

---

**تاریخ تحلیل:** $(date)  
**وضعیت:** ✅ **عملکرد صحیح**

