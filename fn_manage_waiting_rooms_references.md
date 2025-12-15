# ارجاعات به `fn_manage_waiting_rooms`

## خلاصه
این فایل شامل تمام ارجاعات به تابع `game_core.fn_manage_waiting_rooms` است.

---

## نتیجه جستجو

### ✅ تابع تعریف شده:
- **نام:** `fn_manage_waiting_rooms`
- **Schema:** `game_core`
- **نوع:** FUNCTION
- **پارامترها:** 
  - `p_limit integer DEFAULT 50`
  - `p_capture boolean DEFAULT false`
- **Return Type:** `TABLE(room_id uuid, became_live_at timestamp with time zone, paid_players integer)`

---

## ❌ فراخوانی‌ها

### 1. توابع SQL
**نتیجه:** هیچ تابع SQL دیگری این تابع را فراخوانی نمی‌کند.

**بررسی شده:**
- تمام توابع در schema `public`
- تمام توابع در schema `game_core`
- هیچ تابعی در تعریف خود از `fn_manage_waiting_rooms` استفاده نمی‌کند

---

### 2. تریگرها (Triggers)
**نتیجه:** هیچ تریگری این تابع را فراخوانی نمی‌کند.

**بررسی شده:**
- تمام تریگرها در schema `public`
- تمام تریگرها در schema `game_core`
- هیچ تریگری در تعریف خود از `fn_manage_waiting_rooms` استفاده نمی‌کند

---

### 3. Edge Functions
**نتیجه:** هیچ Edge Function این تابع را فراخوانی نمی‌کند.

**بررسی شده:**
- `draw-worker` - ❌ استفاده نمی‌کند
- `generate-card-pool` - ❌ استفاده نمی‌کند

**کد Edge Functions:**
```typescript
// draw-worker/index.ts - هیچ ارجاعی به fn_manage_waiting_rooms ندارد
// generate-card-pool/index.ts - هیچ ارجاعی به fn_manage_waiting_rooms ندارد
```

---

### 4. Views
**نتیجه:** هیچ View این تابع را فراخوانی نمی‌کند.

---

### 5. Cron Jobs
**نتیجه:** هیچ Cron Job این تابع را فراخوانی نمی‌کند.

---

### 6. فایل‌های محلی پروژه
**نتیجه:** هیچ ارجاعی در فایل‌های محلی وجود ندارد.

---

## 📝 تعریف تابع

```sql
CREATE OR REPLACE FUNCTION game_core.fn_manage_waiting_rooms(
  p_limit integer DEFAULT 50, 
  p_capture boolean DEFAULT false
)
RETURNS TABLE(
  room_id uuid, 
  became_live_at timestamp with time zone, 
  paid_players integer
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'game_core'
AS $function$
DECLARE
  r record;
  v_now timestamptz := now();
  v_paid int;
BEGIN
  /*
    معیار شروع:
    - status = 'waiting'
    - starts_at IS NOT NULL AND now() >= starts_at
    - تعداد بازیکنانِ paid در همان روم ≥ rooms.min_players
  */
  FOR r IN
    SELECT
      rm.id,
      rm.min_players,
      rm.starts_at
    FROM public.rooms rm
    WHERE rm.status = 'waiting'
      AND rm.starts_at IS NOT NULL
      AND v_now >= rm.starts_at
      AND (
        SELECT COUNT(DISTINCT t.player_user_id)
        FROM public.tickets t
        WHERE t.room_id = rm.id
          AND t.reservation_status IN ('reserved','paid')
      ) >= rm.min_players
    ORDER BY rm.starts_at ASC
    LIMIT p_limit
  LOOP
    -- شمارش paid برای خروجی
    SELECT COUNT(DISTINCT t.player_user_id)
    INTO v_paid
    FROM public.tickets t
    WHERE t.room_id = r.id
      AND t.reservation_status = 'paid';

    -- (اختیاری) گفتن به ماژول مالی: قفل‌ها را نهایی کن
    IF p_capture THEN
      BEGIN
        PERFORM game_finance.fn_wallet_capture_and_distribute(r.id);
      EXCEPTION
        WHEN undefined_function THEN
          RAISE NOTICE 'game_finance.fn_wallet_capture_and_distribute not found';
      END;
    END IF;

    -- تغییر وضعیت روم به live
    UPDATE public.rooms
       SET status     = 'live',
           updated_at = v_now
     WHERE id = r.id
       AND status = 'waiting';

    -- خروجی
    room_id        := r.id;
    became_live_at := v_now;
    paid_players   := v_paid;
    RETURN NEXT;
  END LOOP;

  RETURN;
END;
$function$
```

---

## 🔍 نحوه استفاده

این تابع باید به صورت **دستی** یا از طریق **Cron Job** فراخوانی شود:

### مثال فراخوانی مستقیم:
```sql
-- فراخوانی با پارامترهای پیش‌فرض
SELECT * FROM game_core.fn_manage_waiting_rooms();

-- فراخوانی با limit مشخص
SELECT * FROM game_core.fn_manage_waiting_rooms(100);

-- فراخوانی با capture
SELECT * FROM game_core.fn_manage_waiting_rooms(50, true);
```

### مثال Cron Job (پیشنهادی):
```sql
-- این Cron Job باید ایجاد شود
SELECT cron.schedule(
  'manage-waiting-rooms',
  '*/10 * * * *',  -- هر 10 ثانیه
  $$
  SELECT * FROM game_core.fn_manage_waiting_rooms(50, true);
  $$
);
```

---

## ⚠️ نتیجه نهایی

**هیچ جایی در کد این تابع را به صورت خودکار فراخوانی نمی‌کند.**

این تابع باید:
1. به صورت دستی از SQL Editor فراخوانی شود
2. یا از طریق Cron Job به صورت دوره‌ای اجرا شود
3. یا از طریق Edge Function/API endpoint فراخوانی شود

**توصیه:** یک Cron Job یا Edge Function برای فراخوانی دوره‌ای این تابع ایجاد کنید.






