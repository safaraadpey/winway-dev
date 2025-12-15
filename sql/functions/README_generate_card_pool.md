# راهنمای استفاده از Function تولید Card Pool

## Function: `game_core.fn_generate_card_pool`

این Function برای تولید یک Card Pool جدید با تعداد دلخواه کارت استفاده می‌شود.

## پارامترها

- `p_card_count` (integer, پیش‌فرض: 10000): تعداد کارت‌هایی که باید تولید شوند
- `p_created_by` (uuid, پیش‌فرض: NULL): شناسه کاربری که Pool را ایجاد کرده است
- `p_prng_version` (text, پیش‌فرض: 'v1'): نسخه الگوریتم PRNG

## خروجی

- `uuid`: شناسه Pool ایجاد شده

## نحوه استفاده

### تولید Pool با 10000 کارت (پیش‌فرض)

```sql
SELECT game_core.fn_generate_card_pool();
```

یا

```sql
SELECT game_core.fn_generate_card_pool(10000);
```

### تولید Pool با تعداد دلخواه کارت

```sql
-- تولید Pool با 5000 کارت
SELECT game_core.fn_generate_card_pool(5000);

-- تولید Pool با 20000 کارت
SELECT game_core.fn_generate_card_pool(20000);
```

### تولید Pool با مشخص کردن کاربر

```sql
SELECT game_core.fn_generate_card_pool(
  10000,
  'user-uuid-here'::uuid
);
```

### تولید Pool با نسخه PRNG خاص

```sql
SELECT game_core.fn_generate_card_pool(
  10000,
  NULL,
  'v2'
);
```

## ساختار کارت‌ها

هر کارت Bingo دارای ساختار 9×3 (27 سلول) است:

- **3 ردیف** (row_no: 1, 2, 3)
- **9 ستون** (col_no: 1-9)
- **محدوده اعداد هر ستون:**
  - ستون 1: 1-10
  - ستون 2: 11-20
  - ستون 3: 21-30
  - ستون 4: 31-40
  - ستون 5: 41-50
  - ستون 6: 51-60
  - ستون 7: 61-70
  - ستون 8: 71-80
  - ستون 9: 81-90

## فرآیند تولید

1. **تولید Pool Seed**: یک Seed تصادفی 32 بایتی تولید می‌شود
2. **محاسبه Commit Hash**: Hash SHA-256 از Seed محاسبه می‌شود
3. **ایجاد Pool**: یک رکورد جدید در `card_pools` ایجاد می‌شود
4. **تولید کارت‌ها**: کارت‌ها به صورت Batch (هر 1000 کارت) تولید می‌شوند
5. **ذخیره در جداول**:
   - `card_pool_cards`: اطلاعات کلی کارت (card_data به صورت JSONB)
   - `card_numbers`: اطلاعات هر سلول برای query بهتر
6. **فعال‌سازی Pool**: بعد از تولید تمام کارت‌ها، Pool فعال می‌شود

## ویژگی‌ها

- **Deterministic**: کارت‌ها بر اساس `pool_seed` به صورت deterministic تولید می‌شوند
- **Provably Fair**: با استفاده از Seed و Hash، قابل ممیزی است
- **Batch Processing**: کارت‌ها به صورت Batch تولید می‌شوند تا عملکرد بهتر باشد
- **Progress Tracking**: هر 100 کارت یک پیام NOTICE نمایش داده می‌شود

## زمان اجرا

- **1000 کارت**: حدود 1-2 دقیقه
- **5000 کارت**: حدود 5-10 دقیقه
- **10000 کارت**: حدود 10-20 دقیقه
- **20000 کارت**: حدود 20-40 دقیقه

*زمان اجرا بستگی به قدرت سرور دارد*

## بررسی Pool ایجاد شده

```sql
-- بررسی Pool
SELECT 
    id,
    version,
    is_active,
    card_count,
    prng_version,
    created_at
FROM public.card_pools
WHERE id = 'pool-uuid-here';

-- بررسی تعداد کارت‌های تولید شده
SELECT COUNT(*) as total_cards
FROM public.card_pool_cards
WHERE pool_id = 'pool-uuid-here';

-- بررسی یک کارت نمونه
SELECT 
    card_no,
    card_data,
    is_taken
FROM public.card_pool_cards
WHERE pool_id = 'pool-uuid-here'
ORDER BY card_no
LIMIT 1;
```

## نکات مهم

1. **زمان اجرا**: تولید 10000 کارت ممکن است چند دقیقه طول بکشد
2. **Transaction**: Function در یک Transaction اجرا می‌شود
3. **Batch Commit**: هر 1000 کارت یک Commit انجام می‌شود
4. **Memory**: برای Pool‌های بزرگ (بیش از 50000 کارت) ممکن است نیاز به تنظیمات دیتابیس باشد

## مثال کامل

```sql
-- تولید Pool با 10000 کارت
DO $$
DECLARE
  v_pool_id uuid;
BEGIN
  v_pool_id := game_core.fn_generate_card_pool(10000);
  RAISE NOTICE 'Pool created with ID: %', v_pool_id;
END;
$$;
```

