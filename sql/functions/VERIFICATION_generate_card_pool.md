# بررسی سازگاری Generator با جداول و Functionهای مرتبط

## ✅ بررسی سازگاری با جداول

### 1. جدول `card_pools`

| فیلد | نوع | وضعیت | توضیحات |
|------|-----|-------|---------|
| `id` | uuid | ✅ | با `gen_random_uuid()` تولید می‌شود |
| `version` | integer | ✅ | به صورت خودکار از MAX(version) + 1 محاسبه می‌شود |
| `is_active` | boolean | ✅ | ابتدا `false`، بعد از تولید کارت‌ها `true` می‌شود |
| `created_by` | uuid | ✅ | از پارامتر `p_created_by` گرفته می‌شود |
| `pool_seed` | bytea | ✅ | با `gen_random_bytes(32)` تولید می‌شود |
| `commit_hash` | text | ✅ | SHA-256 hash از `pool_seed` |
| `prng_version` | text | ✅ | از پارامتر `p_prng_version` (پیش‌فرض: 'v1') |
| `card_count` | integer | ✅ | از پارامتر `p_card_count` |
| `created_at` | timestamptz | ✅ | با `now()` |
| `updated_at` | timestamptz | ✅ | با `now()` |

**نتیجه:** ✅ همه فیلدها به درستی پر می‌شوند

---

### 2. جدول `card_pool_cards`

| فیلد | نوع | وضعیت | توضیحات |
|------|-----|-------|---------|
| `id` | bigint | ✅ | به صورت خودکار با sequence تولید می‌شود |
| `pool_id` | uuid | ✅ | از `v_pool_id` |
| `card_no` | integer | ✅ | از 1 تا `p_card_count` |
| `card_data` | jsonb | ✅ | ساختار: `[{"row": 1, "col": 1, "value": 5}, ...]` |
| `is_taken` | boolean | ✅ | همیشه `false` در زمان تولید |
| `created_at` | timestamptz | ✅ | با `now()` |
| `taken_by_ticket` | uuid | ✅ | NULL (اختیاری) |
| `taken_at` | timestamptz | ✅ | NULL (اختیاری) |

**Constraint بررسی شده:**
- ✅ `card_taken_logic_chk`: `is_taken = false` OR `taken_by_ticket IS NOT NULL` → رعایت می‌شود

**نتیجه:** ✅ همه فیلدها به درستی پر می‌شوند

---

### 3. جدول `card_numbers`

| فیلد | نوع | وضعیت | توضیحات |
|------|-----|-------|---------|
| `pool_card_id` | bigint | ✅ | از `card_pool_cards.id` |
| `row_no` | smallint | ✅ | از 1 تا 3 |
| `col_no` | smallint | ✅ | از 1 تا 9 |
| `value` | integer | ✅ | از 1 تا 90 (مطابق محدوده ستون) |
| `created_at` | timestamptz | ✅ | با `now()` |

**Constraints بررسی شده:**
- ✅ `cn_row_chk`: `row_no >= 1 AND row_no <= 3` → رعایت می‌شود
- ✅ `cn_col_chk`: `col_no >= 1 AND col_no <= 9` → رعایت می‌شود
- ✅ `cn_val_chk`: `value >= 1 AND value <= 90` → رعایت می‌شود
- ✅ Primary Key: `(pool_card_id, row_no, col_no)` → یکتا است

**نتیجه:** ✅ همه فیلدها به درستی پر می‌شوند و Constraints رعایت می‌شوند

---

## ✅ بررسی سازگاری با Functionهای مرتبط

### 1. `rpc_join_or_create_room_and_reserve_tickets`

**استفاده از کارت‌ها:**
```sql
SELECT c.id as pool_card_id, c.card_no
FROM public.card_pool_cards c
WHERE c.pool_id = v_pool
  AND (v_room_type = 'tournament' OR c.card_no <= 200)
  AND NOT EXISTS (...)
ORDER BY digest(...)
LIMIT p_card_count
```

**سازگاری:**
- ✅ `c.id` (pool_card_id) موجود است
- ✅ `c.card_no` موجود است و از 1 شروع می‌شود
- ✅ `c.pool_id` موجود است
- ✅ `c.card_data` موجود است (برای نمایش در UI)
- ✅ `c.is_taken = false` در زمان تولید

**نتیجه:** ✅ کاملاً سازگار است

---

### 2. `fn_evaluate_room_after_draw`

**استفاده از کارت‌ها:**
```sql
INNER JOIN card_numbers cn ON cn.pool_card_id = t.pool_card_id
```

**سازگاری:**
- ✅ `card_numbers.pool_card_id` موجود است
- ✅ `card_numbers.row_no` موجود است (1-3)
- ✅ `card_numbers.col_no` موجود است (1-9)
- ✅ `card_numbers.value` موجود است (1-90)

**نتیجه:** ✅ کاملاً سازگار است

---

## ✅ بررسی ساختار `card_data`

**ساختار JSONB:**
```json
[
  {"row": 1, "col": 1, "value": 5},
  {"row": 1, "col": 2, "value": 15},
  ...
  {"row": 3, "col": 9, "value": 87}
]
```

**ویژگی‌ها:**
- ✅ Array از Objects
- ✅ هر Object دارای `row`, `col`, `value`
- ✅ 27 عنصر (3 ردیف × 9 ستون)
- ✅ قابل Query با `jsonb_array_elements()`

**نتیجه:** ✅ ساختار درست است

---

## ✅ بررسی منطق تولید کارت

### محدوده اعداد هر ستون:

| ستون | محدوده | بررسی |
|------|--------|-------|
| 1 | 1-10 | ✅ `v_col_min = 1, v_col_max = 10` |
| 2 | 11-20 | ✅ `v_col_min = 11, v_col_max = 20` |
| 3 | 21-30 | ✅ `v_col_min = 21, v_col_max = 30` |
| 4 | 31-40 | ✅ `v_col_min = 31, v_col_max = 40` |
| 5 | 41-50 | ✅ `v_col_min = 41, v_col_max = 50` |
| 6 | 51-60 | ✅ `v_col_min = 51, v_col_max = 60` |
| 7 | 61-70 | ✅ `v_col_min = 61, v_col_max = 70` |
| 8 | 71-80 | ✅ `v_col_min = 71, v_col_max = 80` |
| 9 | 81-90 | ✅ `v_col_min = 81, v_col_max = 90` |

**نتیجه:** ✅ همه محدوده‌ها درست است

---

## ✅ بررسی Deterministic بودن

**فرمول تولید عدد:**
```sql
v_random_index := ABS(
  MOD(
    hashtext(
      encode(v_pool_seed, 'hex') || ':' || 
      v_card_no::text || ':' || 
      v_row_no::text || ':' || 
      v_col_no::text
    ),
    (v_col_max - v_col_min + 1)
  )
) + v_col_min;
```

**ویژگی‌ها:**
- ✅ بر اساس `pool_seed` (deterministic)
- ✅ بر اساس `card_no` (یکتا برای هر کارت)
- ✅ بر اساس `row_no` و `col_no` (یکتا برای هر سلول)
- ✅ قابل بازتولید با همان Seed

**نتیجه:** ✅ کاملاً deterministic است

---

## ✅ خلاصه

| مورد | وضعیت |
|------|-------|
| سازگاری با `card_pools` | ✅ |
| سازگاری با `card_pool_cards` | ✅ |
| سازگاری با `card_numbers` | ✅ |
| رعایت Constraints | ✅ |
| سازگاری با `rpc_join_or_create_room_and_reserve_tickets` | ✅ |
| سازگاری با `fn_evaluate_room_after_draw` | ✅ |
| ساختار `card_data` | ✅ |
| منطق تولید کارت | ✅ |
| Deterministic بودن | ✅ |

**نتیجه نهایی:** ✅ Generator کاملاً با جداول و Functionهای مرتبط سازگار است و آماده استفاده است.

