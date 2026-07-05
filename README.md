# Dingmoney Bingo

یک اپلیکیشن Next.js برای بازی Bingo با اتصال به Supabase.

## شروع سریع

### 1. نصب Dependencies

```bash
npm install
```

### 2. تنظیم Supabase

1. یک پروژه در [supabase.com](https://supabase.com) بسازید
2. از Settings → API، Project URL و anon key را کپی کنید
3. فایل `.env.local` را ایجاد کنید:

```env
NEXT_PUBLIC_SUPABASE_URL=https://your-project-id.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key-here

# Phase 1 Game Engine cutover (optional — defaults off)
NEXT_PUBLIC_USE_GAME_ENGINE=false
NEXT_PUBLIC_GAME_ENGINE_URL=http://localhost:8080
```

Railway game-engine (required when flag is on for live-room PG parity):

```env
GAME_ENGINE_API=true
DATABASE_URL=postgresql://...
GAME_ENGINE_CORS_ORIGINS=https://dingmoney.org,http://localhost:3000
```

4. در Supabase SQL Editor، فایل `supabase-schema.sql` را اجرا کنید

برای راهنمای کامل، فایل `supabase-setup.md` را مطالعه کنید.

### 3. اجرای سرور توسعه

```bash
npm run dev
```

مرورگر را در [http://localhost:3000](http://localhost:3000) باز کنید.

## ساختار پروژه

- `app/(public)/auth/page.tsx` - صفحه احراز هویت (با Supabase)
- `app/(protected)/lobby/page.tsx` - صفحه لابی برای اتاق‌های بازی (با Realtime)
- `app/(protected)/game/[roomId]/page.tsx` - صفحه بازی با کارت Bingo
- `components/BingoCard.tsx` - کامپوننت کارت Bingo
- `lib/supabaseClient.ts` - کلاینت Supabase

## ویژگی‌ها

✅ احراز هویت با Supabase Auth  
✅ نمایش اتاق‌های بازی از دیتابیس  
✅ به‌روزرسانی زنده با Supabase Realtime  
✅ TypeScript و Tailwind CSS  
✅ Route Groups برای سازماندهی صفحات

## فایل‌های راهنما

- `supabase-setup.md` - راهنمای کامل تنظیم Supabase
- `supabase-schema.sql` - Schema دیتابیس
- `SETUP_GUIDE.md` - راهنمای اولیه پروژه

