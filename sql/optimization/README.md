# راهنمای بهینه‌سازی Draw Worker

این پوشه شامل تمام فایل‌های SQL مورد نیاز برای بهینه‌سازی Draw Worker است.

## 📁 ساختار فایل‌ها

1. **`01_create_indexes.sql`** - ایجاد Index‌های مورد نیاز
2. **`02_optimize_fn_evaluate_room_after_draw.sql`** - بهینه‌سازی Function ارزیابی
3. **`03_parallel_workers.sql`** - پیاده‌سازی Workerهای موازی
4. **`04_monitoring_queries.sql`** - Query‌های مانیتورینگ

## 🚀 مراحل اجرا

### مرحله 1: ایجاد Index‌ها

```bash
# در Supabase SQL Editor
# فایل 01_create_indexes.sql را اجرا کنید
```

**زمان:** ~2-5 دقیقه

---

### مرحله 2: بهینه‌سازی Function

```bash
# در Supabase SQL Editor
# فایل 02_optimize_fn_evaluate_room_after_draw.sql را اجرا کنید
```

**زمان:** < 1 دقیقه

**نکته:** بعد از اجرا، Function را تست کنید:

```sql
EXPLAIN ANALYZE
SELECT public.fn_evaluate_room_after_draw(
  'room-id-here'::uuid,
  1
);
```

---

### مرحله 3: Workerهای موازی

```bash
# در Supabase SQL Editor
# فایل 03_parallel_workers.sql را اجرا کنید
```

**نکات مهم:**
1. ابتدا Function‌ها را ایجاد کنید
2. سپس Worker قدیمی را غیرفعال کنید
3. سپس Workerهای جدید را فعال کنید

**ترتیب:**
1. اجرای Function‌ها (خطوط 1-100)
2. غیرفعال کردن Worker قدیمی (خط 103)
3. فعال کردن Workerهای جدید (خطوط 106-125)

---

### مرحله 4: مانیتورینگ

```bash
# در Supabase SQL Editor
# فایل 04_monitoring_queries.sql را اجرا کنید
```

این Query‌ها را به صورت دوره‌ای اجرا کنید تا عملکرد را بررسی کنید.

---

## ✅ چک‌لیست

### قبل از Deploy:

- [ ] Backup از دیتابیس گرفته شده است
- [ ] روی محیط Test تست شده است
- [ ] Index‌ها ایجاد شده‌اند
- [ ] Function بهینه شده است
- [ ] زمان اجرا < 5s است

### بعد از Deploy:

- [ ] Workerهای موازی فعال هستند
- [ ] Worker قدیمی غیرفعال شده است
- [ ] مانیتورینگ فعال است
- [ ] Jobها به درستی پردازش می‌شوند
- [ ] زمان پردازش < 3s است

---

## 🚨 Rollback Plan

اگر مشکلی پیش آمد:

1. غیرفعال کردن Workerهای جدید:
```sql
SELECT cron.unschedule('bingo_draw_worker_1');
SELECT cron.unschedule('bingo_draw_worker_2');
SELECT cron.unschedule('bingo_draw_worker_3');
```

2. فعال کردن Worker قدیمی:
```sql
SELECT cron.schedule(
  'bingo_draw_worker',
  '1 second',
  $$ SELECT public.fn_process_draw_jobs_batch(); $$
);
```

3. بازگرداندن Function قدیمی (اگر backup دارید)

---

## 📊 نتایج مورد انتظار

### قبل از بهینه‌سازی:
- زمان پردازش: 36-78s
- تعداد Query: 40,000+
- وضعیت: ❌ نمی‌تواند از پس بار کاری بربیاید

### بعد از بهینه‌سازی:
- زمان پردازش: 1-3s
- تعداد Query: 1-5
- وضعیت: ✅ مشکل رفع شده است

---

**تاریخ:** $(date)  
**وضعیت:** ✅ **آماده برای اجرا**

