# همه ارجاعات به `draw_jobs`

## خلاصه
این فایل شامل تمام ارجاعات به جدول `draw_jobs` در پروژه است.

---

## 1. جدول `draw_jobs` در دیتابیس

### ساختار جدول:
- `id` (bigint, PRIMARY KEY)
- `room_id` (uuid, NOT NULL)
- `draw_number` (integer, NOT NULL)
- `status` (text, NOT NULL, DEFAULT 'queued')
- `attempts` (integer, NOT NULL, DEFAULT 0)
- `created_at` (timestamptz, NOT NULL, DEFAULT now())
- `updated_at` (timestamptz, NOT NULL, DEFAULT now())

### Indexes:
- `draw_jobs_pkey` (PRIMARY KEY on `id`)
- `idx_draw_jobs_status` (INDEX on `status`)

---

## 2. Edge Function: `draw-worker`

**مسیر:** `supabase/functions/draw-worker/index.ts`

**ارجاعات:**
1. خط 6: `await supabase.rpc("rpc_pick_draw_jobs")` - فراخوانی تابع برای انتخاب jobs
2. خط 30: `await supabase.from("draw_jobs").update({...}).eq("id", job.id)` - به‌روزرسانی status به 'done'
3. خط 35: `await supabase.from("draw_jobs").update({...}).eq("id", job.id)` - به‌روزرسانی status به 'queued' در صورت خطا

**کد کامل:**
```typescript
// supabase/functions/draw-worker/index.ts
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
export async function handler(req) {
  const supabase = createClient(Deno.env.get("SUPABASE_URL"), Deno.env.get("SUPABASE_SERVICE_ROLE_KEY"));
  // 1) گرفتن 10 job در حال انتظار و قفل‌کردنشان
  const { data: jobs, error: pickErr } = await supabase.rpc("rpc_pick_draw_jobs");
  if (pickErr) return new Response(pickErr.message, { status: 500 });
  for (const job of jobs ?? []){
    try {
      // 2) درج مارک‌ها برای این قرعه
      const { error: marksErr } = await supabase.rpc("rpc_apply_marks_for_draw", {
        p_room_id: job.room_id,
        p_draw_number: job.draw_number
      });
      if (marksErr) throw marksErr;
      // 3) ارزیابی برنده‌ها
      await supabase.rpc("fn_evaluate_room_after_draw", {
        p_room_id: job.room_id,
        p_draw_number: job.draw_number
      });
      await supabase.rpc("fn_payout_room_if_full", {
        p_room_id: job.room_id
      });
      // 4) اتمام job
      await supabase.from("draw_jobs").update({
        status: "done",
        updated_at: new Date().toISOString()
      }).eq("id", job.id);
    } catch (e) {
      // retry: attempts+1 و برگرداندن به queued
      await supabase.from("draw_jobs").update({
        status: "queued",
        attempts: (job.attempts ?? 0) + 1,
        updated_at: new Date().toISOString()
      }).eq("id", job.id);
    }
  }
  return new Response("ok");
}
```

---

## 3. تابع SQL: `rpc_pick_draw_jobs`

**نوع:** FUNCTION (RPC)

**تعداد نسخه‌ها:** 3 نسخه در schema های مختلف

### نسخه 1: `public.rpc_pick_draw_jobs()`
```sql
CREATE OR REPLACE FUNCTION public.rpc_pick_draw_jobs()
RETURNS TABLE(id bigint, room_id uuid, draw_number integer, status text, attempts integer, created_at timestamp with time zone, updated_at timestamp with time zone)
LANGUAGE plpgsql
AS $function$
BEGIN
  RETURN QUERY
  UPDATE draw_jobs
  SET 
    status = 'processing',
    updated_at = NOW()
  WHERE id IN (
    SELECT dj.id
    FROM draw_jobs dj
    WHERE dj.status = 'queued'
    ORDER BY dj.created_at ASC
    LIMIT 10
    FOR UPDATE SKIP LOCKED
  )
  RETURNING 
    draw_jobs.id,
    draw_jobs.room_id,
    draw_jobs.draw_number,
    draw_jobs.status,
    draw_jobs.attempts,
    draw_jobs.created_at,
    draw_jobs.updated_at;
END;
$function$
```

**ارجاعات به `draw_jobs`:**
- SELECT از `draw_jobs` برای انتخاب jobs با status='queued'
- UPDATE روی `draw_jobs` برای تغییر status به 'processing'
- استفاده از `FOR UPDATE SKIP LOCKED` برای جلوگیری از race condition

### نسخه 2: `game_core.rpc_pick_draw_jobs()` (RETURNS SETOF)
```sql
CREATE OR REPLACE FUNCTION game_core.rpc_pick_draw_jobs()
RETURNS SETOF draw_jobs
LANGUAGE sql
AS $function$
WITH picked AS (
    SELECT id
    FROM draw_jobs
    WHERE status = 'queued'
    ORDER BY id
    LIMIT 10
    FOR UPDATE SKIP LOCKED
  )
  UPDATE draw_jobs j
  SET status = 'running', attempts = attempts + 1, updated_at = now()
  FROM picked p
  WHERE j.id = p.id
  RETURNING j.*;
$function$
```

### نسخه 3: `game_core.rpc_pick_draw_jobs(p_limit integer)`
```sql
CREATE OR REPLACE FUNCTION game_core.rpc_pick_draw_jobs(p_limit integer DEFAULT 10)
RETURNS TABLE(id bigint, room_id uuid, draw_number integer)
LANGUAGE plpgsql
AS $function$
BEGIN
  RETURN QUERY
  SELECT j.id, j.room_id, j.draw_number
  FROM public.draw_jobs j
  WHERE j.status='queued'
  ORDER BY j.created_at
  FOR UPDATE SKIP LOCKED
  LIMIT p_limit;
END;
$function$
```

**Migration:** `create_draw_functions` (20251114063651)

---

## 4. Migration ها

**Migration های مرتبط:**
- `create_draw_functions` (20251114063651) - ایجاد توابع draw
- `fix_apply_marks_for_draw_logic` (20251114063719)
- `improve_evaluate_function` (20251114063747)
- `improve_payout_function` (20251114063804)
- `fix_payout_idempotency` (20251114063822)

---

## 5. توابع مرتبط (که از draw_jobs استفاده نمی‌کنند اما مرتبط هستند)

- `rpc_apply_marks_for_draw` - اعمال marks برای draw
- `fn_evaluate_room_after_draw` - ارزیابی برندگان
- `fn_payout_room_if_full` - پرداخت جایزه

---

## 6. فایل‌های محلی پروژه

**نتیجه:** هیچ ارجاعی به `draw_jobs` در فایل‌های محلی پروژه وجود ندارد.

**دلیل:** 
- جدول و توابع در Supabase هستند
- Edge Function در Supabase Dashboard است
- کد محلی فقط از Supabase Client استفاده می‌کند

---

## خلاصه ارجاعات

| محل | نوع | تعداد ارجاعات |
|-----|-----|---------------|
| Edge Function `draw-worker` | TypeScript | 3 (1 SELECT, 2 UPDATE) |
| تابع SQL `rpc_pick_draw_jobs` | SQL | چندین (SELECT, UPDATE) |
| جدول دیتابیس | Table | 1 (تعریف جدول) |
| Indexes | Index | 2 (PRIMARY KEY, INDEX) |
| Migration ها | SQL | 5 migration مرتبط |

**جمع کل:** حدود 10+ ارجاع مستقیم و غیرمستقیم

