# سیستم قرعه‌کشی Bingo و صف جاب‌ها (Draw Queue Architecture)

> **Superseded note (DEV mutex / Wave 2A docs sync — 2026-07-31):** شرح زیر
> معماری **DB-side** draw queue و workerهای pg_cron را به‌عنوان طراحی تاریخی /
> rollback نگه می‌دارد. روی Final Pre-Launch DEV، `bingo_draw_worker_*` و
> `bingo_heartbeat` unschedule شده‌اند؛ runtime بازی روی Railway است. این سند
> hybrid/legacy را «حذف‌شده» معرفی نمی‌کند — pathهای rollback عمداً باقی‌اند.
> ر.ک. `docs/system-map/game-engine-reality.md`.

این سند، معماری کامل سیستم قرعه‌کشی، تولید Draw، ساخت Job، و اجرای Draw Worker را توضیح می‌دهد. این گردش‌کار در دیتابیس به‌صورت ایمن، قطعی (Deterministic) و بدون هم‌پوشانی طراحی شده است.

---

## 1. نقش‌های کلیدی در سیستم

### 1.1 Dealer — تولیدکنندهٔ قرعه
تولید قرعهٔ جدید فقط از طریق تابع زیر انجام می‌شود:

```
fn_manage_room_live_actions()
```

وظایف:
- پیدا کردن روم‌هایی که **زمان نوبت قرعه**‌شان رسیده.
- انتخاب یک عدد جدید بین ۱ تا ۹۰ که قبل از آن در همان روم نیامده.
- درج در جدول رسمی `draws`.
- جلو بردن `next_draw_at`.
- بردن روم به `finished` اگر تمام اعداد آمده باشند.

> **نکته:** این تابع *هیچ* Jobی نمی‌سازد. فقط Draw می‌سازد.

---

## 2. تریگر مسئول ساخت Job ها
هر بار یک رکورد جدید در جدول `draws` ایجاد شود، تریگر زیر اجرا می‌شود:

```
trg_after_draw_enqueue → game_core.trg_after_draw_enqueue()
```

بدنهٔ تابع تریگر:

```sql
insert into public.draw_jobs (
    room_id,
    draw_number,
    status,
    attempts,
    created_at,
    updated_at
)
values (
    NEW.room_id,
    NEW.number,
    'queued',
    0,
    now(),
    now()
)
on conflict (room_id, draw_number) do nothing;
```

### نقش این تریگر
- تضمین می‌کند **برای هر قرعه فقط یک Job** ساخته شود.
- اگر Dealer دوبار همان Draw را بسازد → Job تکراری ساخته نمی‌شود.
- Queue همیشه تمیز و بدون Job موازی باقی می‌ماند.

---

## 3. Constraint حیاتی برای جلوگیری از Job تکراری
در جدول `draw_jobs` محدودیت زیر اعمال شده:

```sql
unique (room_id, draw_number)
```

این محدودیت به‌طور قطعی تضمین می‌کند که:
- برای هر `(room_id, draw_number)` فقط **یک Job** وجود دارد.
- دستور `on conflict do nothing` در تریگر درست کار می‌کند.

---

## 4. برداشتن Job برای پردازش
تابع زیر وظیفهٔ Pull کردن Jobها از صف را دارد:

```
rpc_pick_draw_jobs(p_limit integer, p_worker_id integer, p_total_workers integer)
```

عملیات داخلی:
- انتخاب Jobهایی با وضعیت `queued`.
- استفاده از `FOR UPDATE SKIP LOCKED` برای جلوگیری از Race Condition.
- توزیع Jobها بین Workerها بر اساس `room_id` (hash-based distribution).
- تغییر وضعیت Job → `processing`.
- افزایش `attempts`.
- بازگرداندن Jobها به Worker مربوطه.

**نکته:** این Function از Worker ID پشتیبانی می‌کند تا Workerهای موازی بتوانند همزمان کار کنند.

---

## 5. Worker اصلی — پردازش Jobها
تابع Worker که توسط pg_cron هر ثانیه اجرا می‌شود:

```
fn_process_draw_jobs_batch_worker(p_worker_id integer, p_total_workers integer)
```

**Workerهای موازی:**
- `bingo_draw_worker_1` - Worker ID: 1
- `bingo_draw_worker_2` - Worker ID: 2
- `bingo_draw_worker_3` - Worker ID: 3

**عملکرد:**
1. دریافت Batch از Jobها با `rpc_pick_draw_jobs(p_worker_id, p_total_workers)`
2. اعمال مارک‌ها روی تیکت‌ها
3. Evaluate برندگان و لاین‌ها (با Query بهینه شده)
4. پرداخت‌ها (payout) در صورت پایان بازی
5. تغییر status → `done`
6. در صورت خطا → بازگشت به `queued` با attempts+1

این Worker چرخهٔ کامل پردازش را انجام می‌دهد و بخش داوری و مارک‌گذاری از Dealer جدا شده‌اند.

**نکته:** Workerهای موازی بار کاری را بین خود تقسیم می‌کنند و عملکرد سیستم را بهبود می‌بخشند.

---

## 6. گردش‌کار کامل (Sequence)
1. روم در حالت `playing` و زمان `next_draw_at` رسیده.
2. Dealer یک Draw جدید در جدول `draws` می‌سازد.
3. تریگر، یک Job برای این Draw ایجاد می‌کند (یا نادیده می‌گیرد).
4. Worker Job را برمی‌دارد.
5. مارک‌گذاری روی تیکت‌ها.
6. Evaluate → پخش جوایز → وضعیت‌ها.
7. Job به حالت `done` می‌رود.

---

## 7. مزایای این معماری
- بدون Job تکراری
- بدون Race Condition
- باثبات و قابل تست
- واضح بودن نقاط مسئولیت (Dealer → Trigger → Worker)
- مقیاس‌پذیر و قابل مدیریت تحت Load

---

## 8. نتیجه نهایی
هستهٔ سیستم قرعه‌کشی Bingo اکنون **کاملاً پایدار**، **ایمن** و **قطعی** است و تمام مسیرهای تولید، صف‌بندی و پردازش Jobs به‌درستی و بدون تداخل کار می‌کنند.

این سند باید به‌عنوان مرجع اصلی بخش Draw Engine و Job Queue در مستندات پروژه ذخیره شود.

