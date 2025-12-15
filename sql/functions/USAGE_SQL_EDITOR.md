# راهنمای استفاده از Function در SQL Editor Supabase

## مراحل استفاده

### 1. باز کردن SQL Editor

1. وارد Dashboard Supabase شوید
2. از منوی سمت چپ، **SQL Editor** را انتخاب کنید
3. روی **New Query** کلیک کنید

---

## 2. استفاده از Function

### مثال 1: تولید Pool با 10000 کارت (پیش‌فرض)

```sql
SELECT game_core.fn_generate_card_pool();
```

این دستور:
- یک Pool جدید با 10000 کارت ایجاد می‌کند
- شناسه Pool را برمی‌گرداند
- حدود 10-20 دقیقه طول می‌کشد

---

### مثال 2: تولید Pool با تعداد دلخواه کارت

```sql
-- تولید Pool با 5000 کارت
SELECT game_core.fn_generate_card_pool(5000);

-- تولید Pool با 20000 کارت
SELECT game_core.fn_generate_card_pool(20000);
```

---

### مثال 3: ذخیره شناسه Pool در متغیر

```sql
DO $$
DECLARE
  v_pool_id uuid;
BEGIN
  -- تولید Pool
  v_pool_id := game_core.fn_generate_card_pool(10000);
  
  -- نمایش شناسه Pool
  RAISE NOTICE 'Pool created with ID: %', v_pool_id;
  
  -- می‌توانید از v_pool_id برای کارهای دیگر استفاده کنید
END;
$$;
```

---

### مثال 4: تولید Pool و بررسی نتیجه

```sql
-- تولید Pool
SELECT game_core.fn_generate_card_pool(10000) as pool_id;

-- سپس با شناسه Pool، بررسی کنید:
-- (pool_id را از نتیجه قبلی کپی کنید)
SELECT 
    id,
    version,
    is_active,
    card_count,
    prng_version,
    created_at
FROM public.card_pools
WHERE id = 'pool-id-here'::uuid;

-- بررسی تعداد کارت‌های تولید شده
SELECT COUNT(*) as total_cards
FROM public.card_pool_cards
WHERE pool_id = 'pool-id-here'::uuid;

-- بررسی یک کارت نمونه
SELECT 
    card_no,
    card_data,
    is_taken
FROM public.card_pool_cards
WHERE pool_id = 'pool-id-here'::uuid
ORDER BY card_no
LIMIT 1;
```

---

## 3. نمایش پیشرفت

هنگام اجرای Function، پیام‌های NOTICE نمایش داده می‌شوند:

```
NOTICE: Pool created: abc123... (version: 1, card_count: 10000)
NOTICE: Generated card 100 of 10000
NOTICE: Generated card 200 of 10000
...
NOTICE: Batch 1 of 10 completed
NOTICE: Batch 2 of 10 completed
...
NOTICE: Pool abc123... activated with 10000 cards
```

---

## 4. بررسی وضعیت Pool

### بررسی Poolهای موجود

```sql
SELECT 
    id,
    version,
    is_active,
    card_count,
    prng_version,
    created_at,
    updated_at
FROM public.card_pools
ORDER BY version DESC;
```

### بررسی کارت‌های یک Pool

```sql
SELECT 
    COUNT(*) as total_cards,
    COUNT(CASE WHEN is_taken THEN 1 END) as taken_cards,
    COUNT(CASE WHEN NOT is_taken THEN 1 END) as available_cards
FROM public.card_pool_cards
WHERE pool_id = 'pool-id-here'::uuid;
```

### بررسی یک کارت خاص

```sql
SELECT 
    cpc.card_no,
    cpc.card_data,
    cpc.is_taken,
    COUNT(cn.value) as cell_count
FROM public.card_pool_cards cpc
LEFT JOIN public.card_numbers cn ON cn.pool_card_id = cpc.id
WHERE cpc.pool_id = 'pool-id-here'::uuid
  AND cpc.card_no = 1
GROUP BY cpc.card_no, cpc.card_data, cpc.is_taken;
```

---

## 5. نکات مهم

### ⚠️ زمان اجرا

- **1000 کارت**: حدود 1-2 دقیقه
- **5000 کارت**: حدود 5-10 دقیقه
- **10000 کارت**: حدود 10-20 دقیقه
- **20000 کارت**: حدود 20-40 دقیقه

*زمان اجرا بستگی به قدرت سرور دارد*

### ⚠️ Transaction

Function در یک Transaction اجرا می‌شود. اگر خطایی رخ دهد، تمام تغییرات rollback می‌شوند.

### ⚠️ Progress Tracking

- هر 100 کارت یک پیام NOTICE نمایش داده می‌شود
- هر Batch (1000 کارت) یک پیام NOTICE نمایش داده می‌شود

### ⚠️ Memory

برای Pool‌های بزرگ (بیش از 50000 کارت)، ممکن است نیاز به تنظیمات دیتابیس باشد.

---

## 6. مثال کامل (Copy & Paste Ready)

```sql
-- ============================================
-- تولید Pool با 10000 کارت
-- ============================================

DO $$
DECLARE
  v_pool_id uuid;
  v_start_time timestamptz;
  v_end_time timestamptz;
BEGIN
  v_start_time := now();
  
  -- تولید Pool
  v_pool_id := game_core.fn_generate_card_pool(10000);
  
  v_end_time := now();
  
  -- نمایش نتیجه
  RAISE NOTICE '========================================';
  RAISE NOTICE 'Pool created successfully!';
  RAISE NOTICE 'Pool ID: %', v_pool_id;
  RAISE NOTICE 'Time taken: %', v_end_time - v_start_time;
  RAISE NOTICE '========================================';
  
  -- بررسی Pool
  RAISE NOTICE 'Pool details:';
  PERFORM * FROM public.card_pools WHERE id = v_pool_id;
  
  -- بررسی تعداد کارت‌ها
  RAISE NOTICE 'Total cards: %', (
    SELECT COUNT(*) 
    FROM public.card_pool_cards 
    WHERE pool_id = v_pool_id
  );
END;
$$;
```

---

## 7. Troubleshooting

### مشکل: Function پیدا نمی‌شود

```sql
-- بررسی وجود Function
SELECT 
    n.nspname as schema_name,
    p.proname as function_name,
    pg_get_function_arguments(p.oid) as arguments
FROM pg_proc p
JOIN pg_namespace n ON p.pronamespace = n.oid
WHERE p.proname = 'fn_generate_card_pool'
AND n.nspname = 'game_core';
```

### مشکل: خطای Permission

اگر خطای permission دریافت کردید، مطمئن شوید که:
- از کاربر `postgres` یا کاربر با دسترسی `SECURITY DEFINER` استفاده می‌کنید
- Schema `game_core` وجود دارد

### مشکل: خطای Constraint

اگر خطای constraint دریافت کردید:
- بررسی کنید که جداول `card_pools`, `card_pool_cards`, `card_numbers` وجود دارند
- بررسی کنید که Constraints درست تعریف شده‌اند

---

## 8. مثال سریع (Quick Start)

ساده‌ترین روش:

```sql
SELECT game_core.fn_generate_card_pool(10000);
```

این دستور را در SQL Editor کپی کنید و **Run** کنید. شناسه Pool در نتیجه نمایش داده می‌شود.

