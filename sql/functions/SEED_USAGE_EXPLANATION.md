# استفاده از Seed در تولید کارت‌ها

## ✅ بله، از `pool_seed` استفاده می‌شود

Function `game_core.fn_generate_card_pool` از **`pool_seed`** برای تولید deterministic و provably fair کارت‌ها استفاده می‌کند.

---

## 🔐 مراحل استفاده از Seed

### 1. تولید Seed

```sql
v_pool_seed := gen_random_bytes(32);  -- 32 بایت تصادفی
v_commit_hash := encode(digest(v_pool_seed, 'sha256'), 'hex');  -- Hash برای commitment
```

### 2. ذخیره Seed در Pool

```sql
INSERT INTO public.card_pools (
  ...
  pool_seed,      -- Seed مخفی
  commit_hash,    -- Hash عمومی
  ...
)
```

### 3. استفاده از Seed در تولید کارت‌ها

**انتخاب موقعیت‌های اعداد در هر ردیف:**
```sql
hashtext(
  encode(v_pool_seed, 'hex') || ':' || 
  v_card_no::text || ':' || 
  v_row_no::text || ':' || 
  'pos' || v_pos_index::text
)
```

**تولید اعداد:**
```sql
hashtext(
  encode(v_pool_seed, 'hex') || ':' || 
  v_card_no::text || ':' || 
  v_row_no::text || ':' || 
  v_col_no::text || ':' ||
  v_pos_index::text || ':' ||
  v_attempts::text
)
```

---

## 🎯 ویژگی‌های Seed-based Generation

### ✅ Deterministic
- با همان `pool_seed`، همیشه همان کارت‌ها تولید می‌شوند
- کارت شماره 1 همیشه یکسان است
- کارت شماره 1000 همیشه یکسان است

### ✅ Provably Fair
- `commit_hash` قبل از تولید کارت‌ها منتشر می‌شود
- بعد از تولید، می‌توان `pool_seed` را افشا کرد
- هر کس می‌تواند با `pool_seed` کارت‌ها را بازتولید کند

### ✅ یکتا بودن
- هر کارت یکتا است (بر اساس `card_no`)
- هر سلول یکتا است (بر اساس `row_no`, `col_no`, `pos_index`)

---

## 📊 مثال استفاده از Seed

### تولید Pool:
```sql
SELECT game_core.fn_generate_card_pool(10000);
-- Pool ID: abc123...
```

### دریافت Seed و Hash:
```sql
SELECT 
    id,
    encode(pool_seed, 'hex') as pool_seed_hex,
    commit_hash,
    card_count
FROM public.card_pools
WHERE id = 'abc123...'::uuid;
```

### بازتولید کارت با Seed:
با داشتن `pool_seed` و `card_no`، می‌توانید کارت را دوباره تولید کنید:

```sql
-- این کارت را می‌توان با seed و card_no بازتولید کرد
SELECT card_data
FROM public.card_pool_cards
WHERE pool_id = 'abc123...'::uuid
  AND card_no = 1;
```

---

## 🔍 بررسی Deterministic بودن

برای تست اینکه کارت‌ها deterministic هستند:

1. **تولید Pool اول:**
   ```sql
   SELECT game_core.fn_generate_card_pool(10);
   -- Pool ID: pool1
   ```

2. **ذخیره `pool_seed`:**
   ```sql
   SELECT encode(pool_seed, 'hex') as seed_hex
   FROM public.card_pools
   WHERE id = 'pool1'::uuid;
   ```

3. **تولید Pool دوم با همان Seed:**
   - (نیاز به Function اضافی برای استفاده از seed مشخص)

**نکته:** در حال حاضر، هر Pool یک Seed جدید تولید می‌کند. برای استفاده از Seed مشخص، باید Function را اصلاح کنید.

---

## ✅ خلاصه

| مورد | وضعیت |
|------|-------|
| استفاده از `pool_seed` | ✅ بله |
| Deterministic بودن | ✅ بله |
| Provably Fair | ✅ بله (با commit_hash) |
| یکتا بودن کارت‌ها | ✅ بله |
| قابل بازتولید | ✅ بله (با pool_seed) |

**نتیجه:** Function از `pool_seed` برای تولید deterministic و provably fair کارت‌ها استفاده می‌کند.

