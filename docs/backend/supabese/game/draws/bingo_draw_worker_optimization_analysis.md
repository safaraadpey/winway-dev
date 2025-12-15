# تحلیل امکان رفع مشکل با بهینه‌سازی

**تاریخ تحلیل:** $(date)  
**سوال:** آیا با بهینه‌سازی مشکل رفع می‌شود؟

---

## 📊 محاسبه زمان با بهینه‌سازی کامل

### سناریو: 1,000 پلیر × 5 کارت = 5,000 کارت

---

## ✅ بهینه‌سازی‌های ممکن

### 1. بهینه‌سازی `fn_evaluate_room_after_draw`

**وضعیت فعلی:**
- Loop روی 5,000 تیکت
- 8 Query برای هر تیکت
- **40,000 Query** در هر اجرا

**بهینه‌سازی پیشنهادی:**
```sql
-- تبدیل به یک Query واحد با Window Functions
WITH ticket_marks AS (
  SELECT 
    t.id as ticket_id,
    t.player_user_id as user_id,
    t.pool_card_id,
    COUNT(DISTINCT m.value) as marked_count,
    COUNT(DISTINCT cn.value) as total_cells,
    -- بررسی Line Win برای هر ردیف
    COUNT(DISTINCT CASE WHEN cn.row_no = 1 AND m.value IS NOT NULL THEN cn.value END) as row1_marked,
    COUNT(DISTINCT CASE WHEN cn.row_no = 2 AND m.value IS NOT NULL THEN cn.value END) as row2_marked,
    COUNT(DISTINCT CASE WHEN cn.row_no = 3 AND m.value IS NOT NULL THEN cn.value END) as row3_marked,
    COUNT(DISTINCT CASE WHEN cn.row_no = 1 THEN cn.value END) as row1_total,
    COUNT(DISTINCT CASE WHEN cn.row_no = 2 THEN cn.value END) as row2_total,
    COUNT(DISTINCT CASE WHEN cn.row_no = 3 THEN cn.value END) as row3_total
  FROM tickets t
  JOIN card_numbers cn ON cn.pool_card_id = t.pool_card_id
  LEFT JOIN marks m ON m.ticket_id = t.id AND m.value = cn.value
  WHERE t.room_id = p_room_id
    AND t.reservation_status = 'confirmed'
  GROUP BY t.id, t.player_user_id, t.pool_card_id
)
INSERT INTO results (room_id, user_id, ticket_id, win_type, reward_amount, draw_number)
SELECT 
  p_room_id,
  user_id,
  ticket_id,
  CASE 
    WHEN marked_count = total_cells THEN 'full'
    WHEN row1_marked = row1_total OR row2_marked = row2_total OR row3_marked = row3_total THEN 'line'
  END as win_type,
  0,
  p_draw_number
FROM ticket_marks
WHERE (marked_count = total_cells OR 
       row1_marked = row1_total OR 
       row2_marked = row2_total OR 
       row3_marked = row3_total)
  AND NOT EXISTS (
    SELECT 1 FROM results r 
    WHERE r.ticket_id = ticket_marks.ticket_id 
      AND r.draw_number = p_draw_number
  );
```

**نتیجه:**
- از **40,000 Query** به **1 Query** ✅
- زمان: از **30-60s** به **2-5s** ✅

---

### 2. افزودن Index‌ها

**Index‌های مورد نیاز:**

```sql
-- Index برای marks (برای NOT EXISTS check)
CREATE INDEX IF NOT EXISTS idx_marks_ticket_value 
ON marks(ticket_id, value);

-- Index برای card_numbers (برای JOIN)
CREATE INDEX IF NOT EXISTS idx_card_numbers_pool_row_value 
ON card_numbers(pool_card_id, row_no, value);

-- Index برای tickets (برای فیلتر room_id)
CREATE INDEX IF NOT EXISTS idx_tickets_room_status 
ON tickets(room_id, reservation_status) 
WHERE reservation_status = 'confirmed';

-- Index برای results (برای NOT EXISTS check)
CREATE INDEX IF NOT EXISTS idx_results_ticket_draw 
ON results(ticket_id, draw_number);
```

**نتیجه:**
- اعمال مارک: از **5-15s** به **1-2s** ✅
- ارزیابی: از **2-5s** به **1-3s** ✅

---

### 3. بهینه‌سازی Bulk Operations

**فعلی:**
- INSERT تکی در Loop

**بهینه:**
- Bulk INSERT (همانطور که در Query بالا نشان داده شد)

**نتیجه:**
- زمان INSERT: از **1-2s** به **< 0.5s** ✅

---

## ⏱️ زمان کل با بهینه‌سازی کامل

| مرحله | زمان فعلی | زمان با بهینه‌سازی |
|-------|-----------|-------------------|
| دریافت Batch | < 0.1s | < 0.1s |
| اعمال مارک | 5-15s | **1-2s** ✅ |
| ارزیابی | 30-60s | **1-3s** ✅ |
| پرداخت | 1-3s | 1-3s |
| **جمع** | **36-78s** | **3-8s** |

---

## ❓ آیا مشکل رفع می‌شود؟

### پاسخ: **بله، اما...**

**با بهینه‌سازی کامل:**
- زمان پردازش: **3-8s**
- فاصله قرعه‌کشی: **3s**

**مشکل:**
- در بهترین حالت (3s): ✅ **کار می‌کند**
- در بدترین حالت (8s): ❌ **هنوز مشکل دارد**

**نتیجه:**
- ✅ **در حالت عادی کار می‌کند** (3-5s)
- ⚠️ **در حالت پیک ممکن است مشکل داشته باشد** (6-8s)

---

## 💡 راه‌حل‌های تکمیلی

### 1. افزایش فرکانس Worker

**فعلی:** هر 1 ثانیه  
**پیشنهاد:** هر 0.5 ثانیه

**نتیجه:**
- Worker سریع‌تر Jobها را برمی‌دارد
- اما اگر پردازش 8s طول بکشد، هنوز مشکل دارد

---

### 2. Workerهای موازی

**پیشنهاد:** 2-3 Worker همزمان

```sql
-- Worker 1: پردازش Jobهای اتاق‌های فرد
-- Worker 2: پردازش Jobهای اتاق‌های زوج
-- Worker 3: پردازش Jobهای باقیمانده
```

**نتیجه:**
- بار کاری تقسیم می‌شود
- اما نیاز به تغییر در `rpc_pick_draw_jobs` دارد

---

### 3. کاهش Batch Size در `rpc_pick_draw_jobs`

**فعلی:** 200 Job  
**پیشنهاد:** 50-100 Job

**نتیجه:**
- هر Worker کمتر کار می‌کند
- اما نیاز به Workerهای بیشتر دارد

---

### 4. تغییر معماری: پردازش Async

**پیشنهاد:**
- Worker فقط Job را برمی‌دارد و در صف دیگری می‌گذارد
- Workerهای جداگانه برای:
  - اعمال مارک
  - ارزیابی
  - پرداخت

**نتیجه:**
- پردازش موازی
- اما نیاز به تغییر معماری دارد

---

## 📊 جدول مقایسه

| راه‌حل | زمان پردازش | پیاده‌سازی | نتیجه |
|-------|-------------|-----------|-------|
| **بهینه‌سازی Query** | 3-8s | متوسط | ⚠️ در حالت پیک مشکل دارد |
| **بهینه‌سازی + Index** | 2-5s | آسان | ✅ در حالت عادی کار می‌کند |
| **بهینه‌سازی + Worker موازی** | 1-3s | سخت | ✅ **بهترین راه‌حل** |
| **بهینه‌سازی + Async** | 1-2s | خیلی سخت | ✅ **بهترین اما پیچیده** |

---

## 🎯 توصیه نهایی

### راه‌حل مرحله‌ای:

**مرحله 1 (فوری - 1 روز):**
1. ✅ بهینه‌سازی `fn_evaluate_room_after_draw` (تبدیل Loop به Query)
2. ✅ افزودن Index‌ها
3. ✅ بهینه‌سازی Bulk Operations

**نتیجه:** زمان از 36-78s به **2-5s** کاهش می‌یابد ✅

**مرحله 2 (میان‌مدت - 1 هفته):**
1. ✅ افزایش فرکانس Worker به 0.5s
2. ✅ Workerهای موازی (2-3 Worker)

**نتیجه:** زمان از 2-5s به **1-2s** کاهش می‌یابد ✅

**مرحله 3 (بلندمدت - 1 ماه):**
1. ✅ تغییر معماری به Async Processing
2. ✅ استفاده از Queue System

**نتیجه:** زمان به **< 1s** کاهش می‌یابد ✅

---

## ✅ نتیجه‌گیری

### پاسخ به سوال:

**آیا با بهینه‌سازی مشکل رفع می‌شود؟**

**بله، اما نه 100%:**
- ✅ با بهینه‌سازی کامل: **در حالت عادی کار می‌کند** (2-5s)
- ⚠️ در حالت پیک: **ممکن است هنوز مشکل داشته باشد** (6-8s)
- ✅ با Workerهای موازی: **مشکل کاملاً رفع می‌شود** (1-2s)

### توصیه:

1. **فوری:** بهینه‌سازی Query و Index (2-5s)
2. **میان‌مدت:** Workerهای موازی (1-2s)
3. **بلندمدت:** Async Processing (< 1s)

**نتیجه نهایی:** ✅ **با بهینه‌سازی + Workerهای موازی، مشکل کاملاً رفع می‌شود**

---

**تاریخ تحلیل:** $(date)  
**وضعیت:** ✅ **قابل حل با بهینه‌سازی + Workerهای موازی**

