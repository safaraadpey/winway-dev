# تحلیل عملکرد `bingo_draw_worker` در سناریوی سنگین

> **Superseded (DEV mutex / Wave 2A docs sync — 2026-07-31):** این تحلیل بار
> workerهای pg_cron را توصیف می‌کند؛ روی DEV فعلی `bingo_draw_worker_*`
> unschedule شده‌اند و draw drain متعلق به Railway `draw-processor` است.
> محتوا برای تاریخچه / rollback نگه داشته شده است.

**تاریخ تحلیل:** $(date)  
**سناریو:** سنگین‌ترین اتاق بازی

---

## 📊 محاسبه بار کاری (Workload Calculation)

### پارامترهای سناریو

| پارامتر | مقدار |
|---------|-------|
| **تعداد پلیرها** | 1,000 نفر |
| **کارت‌های هر پلیر** | حداکثر 5 کارت |
| **کل کارت‌ها** | 1,000 × 5 = **5,000 کارت** |
| **اعداد هر کارت** | 15 عدد |
| **فاصله قرعه‌کشی** | 3 ثانیه |
| **فرکانس Worker** | هر 1 ثانیه |

### محاسبات

**در هر قرعه‌کشی:**
- تعداد کارت‌ها: **5,000 کارت**
- تعداد مارک‌ها: 5,000 × 15 = **75,000 عدد** (حداکثر)
- زمان پردازش: **3 ثانیه** (بین دو قرعه)

**در هر ثانیه:**
- Worker اجرا می‌شود
- باید Jobهای `queued` را پردازش کند
- در بدترین حالت: **1 Job در هر 3 ثانیه** (یک قرعه)

---

## ⚡ تحلیل عملکرد

### مرحله 1: دریافت Batch (`rpc_pick_draw_jobs`)

**محدودیت:** حداکثر 200 Job در هر Batch

**در سناریوی ما:**
- ✅ کافی است (فقط 1 Job در هر 3 ثانیه)
- ⚠️ اما اگر چندین اتاق همزمان فعال باشند، ممکن است محدود شود

**نتیجه:** ✅ **کافی است**

---

### مرحله 2: اعمال مارک (`rpc_apply_marks_for_draw`)

**Definition واقعی:**
```sql
INSERT INTO marks (ticket_id, value, created_at)
SELECT DISTINCT
  t.id,
  v_draw_number,
  NOW()
FROM tickets t
INNER JOIN card_numbers cn ON cn.pool_card_id = t.pool_card_id
WHERE t.room_id = p_room_id
  AND t.reservation_status = 'confirmed'
  AND cn.value = v_draw_number
  AND NOT EXISTS (
    SELECT 1 
    FROM marks m 
    WHERE m.ticket_id = t.id 
      AND m.value = v_draw_number
  );
```

**بار کاری:**
- یک Bulk INSERT با JOIN
- JOIN بین `tickets` (5,000 ردیف) و `card_numbers` (5,000 × 15 = 75,000 ردیف)
- NOT EXISTS برای هر تیکت (5,000 بررسی)

**عملیات:**
- 1 SELECT با JOIN (بهینه)
- 1 Bulk INSERT (بهینه)
- 5,000 NOT EXISTS check (نیاز به Index)

**زمان تخمینی:**
- اگر Index روی `(ticket_id, value)` در `marks` باشد: **~1-3 ثانیه** ✅
- اگر Index نباشد: **~5-15 ثانیه** ⚠️

**نتیجه:** ✅ **به نسبت بهینه است** (اما نیاز به Index)

---

### مرحله 3: ارزیابی برندگان (`fn_evaluate_room_after_draw`)

**Definition واقعی:**
```sql
FOR v_ticket IN
  SELECT t.id, t.player_user_id, t.pool_card_id
  FROM tickets t
  WHERE t.room_id = p_room_id
    AND t.reservation_status = 'confirmed'
LOOP
  -- شمارش کل سلول‌های کارت
  SELECT COUNT(*) INTO v_total_cells
  FROM card_numbers
  WHERE pool_card_id = v_ticket.pool_card_id;
  
  -- شمارش سلول‌های mark شده
  SELECT COUNT(DISTINCT cn.value) INTO v_marked_cells
  FROM card_numbers cn
  INNER JOIN marks m ON m.ticket_id = v_ticket.ticket_id AND m.value = cn.value
  WHERE cn.pool_card_id = v_ticket.pool_card_id;
  
  -- بررسی Line Win: برای هر ردیف (3 ردیف)
  FOR i IN 1..3 LOOP
    SELECT COUNT(*) INTO v_row_cells ...
    SELECT COUNT(*) INTO v_row_marked_count ...
  END LOOP;
END LOOP;
```

**بار کاری:**
- **Loop روی 5,000 تیکت**
- برای هر تیکت:
  - 1 SELECT برای COUNT(*) از `card_numbers` (15 ردیف)
  - 1 SELECT با JOIN برای COUNT(DISTINCT) از `marks` (15 JOIN)
  - 3 Loop برای ردیف‌ها:
    - 2 SELECT برای هر ردیف (6 SELECT)
  - **جمع: 1 + 1 + 6 = 8 Query برای هر تیکت**

**عملیات:**
- **5,000 × 8 = 40,000 Query** در یک اجرا! 🚨
- 5,000 SELECT برای COUNT
- 5,000 SELECT با JOIN
- 15,000 SELECT برای ردیف‌ها
- حداکثر 5,000 INSERT در `results`

**زمان تخمینی:**
- با Index: **~30-60 ثانیه** 🚨
- بدون Index: **~2-5 دقیقه** 🚨🚨

**نتیجه:** 🚨 **خیلی سنگین است! نیاز به بهینه‌سازی فوری**

---

### مرحله 4: پرداخت (`fn_payout_room_if_full`)

**بار کاری:**
- فقط زمانی اجرا می‌شود که اتاق کامل شود
- باید برندگان را پیدا کند
- جوایز را توزیع کند

**عملیات:**
- SELECT از `results`
- UPDATE `wallets`
- INSERT در `transactions`

**زمان تخمینی:**
- ~1-3 ثانیه (چون فقط یکبار در پایان اتاق اجرا می‌شود)

**نتیجه:** ✅ **کافی است**

---

## ⏱️ زمان کل پردازش

### در بدترین حالت (با Definition واقعی):

| مرحله | زمان تخمینی (بدون Index) | زمان تخمینی (با Index) |
|-------|--------------------------|------------------------|
| دریافت Batch | < 0.1s | < 0.1s |
| اعمال مارک | 5-15s | **1-3s** ✅ |
| ارزیابی | **2-5 دقیقه** 🚨 | **30-60s** 🚨 |
| پرداخت | 1-3s | 1-3s |
| **جمع** | **~2-5 دقیقه** 🚨🚨 | **~32-66s** 🚨 |

### مشکل اصلی:

**زمان پردازش (32-66s) >> فاصله قرعه‌کشی (3s)** 🚨🚨

این یعنی:
- Worker نمی‌تواند در 3 ثانیه کار را تمام کند
- Jobها در صف جمع می‌شوند (هر 3 ثانیه یک Job جدید)
- در 1 دقیقه: 20 Job در صف
- در 5 دقیقه: 100 Job در صف
- **سیستم از کار می‌افتد!** 🚨

---

## 🚨 مشکلات احتمالی

### 1. Backlog در صف

اگر Worker نتواند در 3 ثانیه کار را تمام کند:
- Jobها در صف جمع می‌شوند
- هر 3 ثانیه یک Job جدید اضافه می‌شود
- صف بزرگ می‌شود

**مثال:**
- اگر پردازش 10 ثانیه طول بکشد
- در 30 ثانیه: 10 Job در صف
- در 1 دقیقه: 20 Job در صف
- و...

### 2. Race Condition

اگر چند Worker همزمان اجرا شوند:
- ممکن است روی همان Job کار کنند
- `FOR UPDATE SKIP LOCKED` کمک می‌کند اما...

### 3. Lock Contention

- 5,000 کارت باید بررسی شوند
- ممکن است Lock روی جداول ایجاد شود
- Performance کاهش می‌یابد

---

## 💡 راه‌حل‌های پیشنهادی

### 1. بهینه‌سازی Query‌ها

**برای `rpc_apply_marks_for_draw`:**
- استفاده از Bulk INSERT به جای INSERT تکی
- استفاده از Index روی `tickets.room_id`
- استفاده از Index روی `card_numbers`

**برای `fn_evaluate_room_after_draw`:**
- استفاده از Materialized View برای کارت‌ها
- استفاده از Array Operations
- استفاده از Window Functions

### 2. افزایش Batch Size

**فعلی:** 200 Job  
**پیشنهاد:** 500-1000 Job (اگر منابع کافی دارید)

### 3. کاهش فرکانس Worker

**فعلی:** هر 1 ثانیه  
**پیشنهاد:** هر 0.5 ثانیه (اگر منابع کافی دارید)

یا:

**پیشنهاد:** Workerهای موازی (چند Worker همزمان)

### 4. Partitioning

- Partition کردن جدول `marks` بر اساس `room_id`
- Partition کردن جدول `tickets` بر اساس `room_id`

### 5. Caching

- Cache کردن کارت‌های فعال در Memory
- Cache کردن وضعیت مارک‌ها

### 6. Async Processing

- استفاده از Queue System (مثل pg_boss یا RabbitMQ)
- پردازش Async برای مراحل سنگین

---

## 🔍 بررسی نیاز به بهینه‌سازی

برای اطمینان، باید بررسی شود:

1. ✅ **Index‌ها:** آیا Index روی `tickets.room_id` و `marks.ticket_id` وجود دارد؟
2. ✅ **Query Plan:** آیا Query‌ها از Index استفاده می‌کنند؟
3. ✅ **Bulk Operations:** آیا از Bulk INSERT استفاده می‌شود؟
4. ✅ **Connection Pooling:** آیا Connection Pool بهینه است؟

---

## 📊 نتیجه‌گیری

### وضعیت فعلی:

🚨 **Function فعلی نمی‌تواند از پس این بار کاری بربیاید - نیاز به بهینه‌سازی فوری**

**دلایل:**
- زمان پردازش (32-66s) >> فاصله قرعه‌کشی (3s)
- **40,000 Query در هر اجرا** برای ارزیابی (بسیار سنگین!)
- Loop روی 5,000 تیکت با 8 Query برای هر تیکت
- بدون بهینه‌سازی: **2-5 دقیقه** برای هر قرعه

### مشکلات اصلی:

1. **`fn_evaluate_room_after_draw`:** 
   - استفاده از Loop روی 5,000 تیکت
   - 8 Query برای هر تیکت
   - باید به یک Query واحد تبدیل شود

2. **عدم استفاده از Bulk Operations:**
   - INSERT تکی در Loop
   - باید به Bulk INSERT تبدیل شود

3. **عدم استفاده از Window Functions:**
   - می‌تواند با Window Functions بهینه شود

### راه‌حل‌های فوری:

1. **بهینه‌سازی `fn_evaluate_room_after_draw`:**
   - تبدیل Loop به یک Query واحد
   - استفاده از Window Functions
   - استفاده از Materialized View

2. **افزودن Index‌ها:**
   - Index روی `marks(ticket_id, value)`
   - Index روی `card_numbers(pool_card_id, row_no, value)`
   - Index روی `tickets(room_id, reservation_status)`

3. **استفاده از Bulk Operations:**
   - Bulk INSERT برای `results`
   - Bulk UPDATE برای `results.reward_amount`

---

## 🎯 توصیه‌های فوری

### 1. بررسی Index‌ها

```sql
-- بررسی Index روی tickets
SELECT indexname, indexdef 
FROM pg_indexes 
WHERE tablename = 'tickets' 
AND schemaname = 'public';

-- بررسی Index روی marks
SELECT indexname, indexdef 
FROM pg_indexes 
WHERE tablename = 'marks' 
AND schemaname = 'public';
```

### 2. بررسی Query Plan

```sql
EXPLAIN ANALYZE
SELECT * FROM tickets WHERE room_id = '...';
```

### 3. بررسی Performance

- Monitor کردن زمان اجرای Function
- بررسی تعداد Jobهای در صف
- بررسی Lock Contention

---

**تاریخ تحلیل:** $(date)  
**وضعیت:** ⚠️ **نیاز به بهینه‌سازی**

