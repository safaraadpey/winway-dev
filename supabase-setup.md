# راهنمای تنظیم Supabase برای پروژه Bingo

## مراحل تنظیم

### 1. ساخت پروژه در Supabase

1. به [supabase.com](https://supabase.com) بروید
2. یک حساب کاربری بسازید یا وارد شوید
3. روی "New Project" کلیک کنید
4. نام پروژه و رمز دیتابیس را وارد کنید
5. منطقه (Region) را انتخاب کنید
6. پروژه را بسازید (چند دقیقه طول می‌کشد)

### 2. دریافت API Keys

1. در Dashboard پروژه، به **Settings** → **API** بروید
2. این اطلاعات را کپی کنید:
   - **Project URL** (مثل: `https://xxxxx.supabase.co`)
   - **anon public** key

### 3. تنظیم Environment Variables

فایل `.env.local` را در ریشه پروژه ایجاد کنید:

```env
NEXT_PUBLIC_SUPABASE_URL=https://your-project-id.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key-here
```

**⚠️ مهم:** فایل `.env.local` در `.gitignore` است و نباید commit شود.

### 4. ساخت جداول دیتابیس

در Supabase Dashboard، به **SQL Editor** بروید و این کد را اجرا کنید:

```sql
-- جدول rooms برای اتاق‌های بازی
CREATE TABLE rooms (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  player_count INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

-- جدول players برای بازیکنان
CREATE TABLE players (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  room_id UUID REFERENCES rooms(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  joined_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
  UNIQUE(room_id, user_id)
);

-- جدول games برای بازی‌های فعال
CREATE TABLE games (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  room_id UUID REFERENCES rooms(id) ON DELETE CASCADE,
  status TEXT DEFAULT 'waiting' CHECK (status IN ('waiting', 'active', 'finished')),
  current_number INTEGER,
  started_at TIMESTAMP WITH TIME ZONE,
  finished_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

-- جدول bingo_cards برای کارت‌های بازی
CREATE TABLE bingo_cards (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  game_id UUID REFERENCES games(id) ON DELETE CASCADE,
  player_id UUID REFERENCES players(id) ON DELETE CASCADE,
  card_numbers JSONB NOT NULL, -- آرایه 5x5 از اعداد
  marked_cells JSONB DEFAULT '[]'::jsonb, -- سلول‌های علامت‌گذاری شده
  is_winner BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

-- تابع برای به‌روزرسانی updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = TIMEZONE('utc'::text, NOW());
    RETURN NEW;
END;
$$ language 'plpgsql';

-- تریگر برای به‌روزرسانی خودکار updated_at
CREATE TRIGGER update_rooms_updated_at BEFORE UPDATE ON rooms
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- فعال‌سازی Row Level Security (RLS)
ALTER TABLE rooms ENABLE ROW LEVEL SECURITY;
ALTER TABLE players ENABLE ROW LEVEL SECURITY;
ALTER TABLE games ENABLE ROW LEVEL SECURITY;
ALTER TABLE bingo_cards ENABLE ROW LEVEL SECURITY;

-- Policy برای rooms: همه می‌توانند بخوانند
CREATE POLICY "Anyone can read rooms" ON rooms
    FOR SELECT USING (true);

-- Policy برای rooms: فقط کاربران وارد شده می‌توانند اتاق بسازند
CREATE POLICY "Authenticated users can create rooms" ON rooms
    FOR INSERT WITH CHECK (auth.role() = 'authenticated');

-- Policy برای players: کاربران می‌توانند بازیکنان را ببینند
CREATE POLICY "Users can view players" ON players
    FOR SELECT USING (true);

-- Policy برای players: کاربران می‌توانند خودشان را اضافه کنند
CREATE POLICY "Users can join as players" ON players
    FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Policy برای games: همه می‌توانند بازی‌ها را ببینند
CREATE POLICY "Anyone can read games" ON games
    FOR SELECT USING (true);

-- Policy برای bingo_cards: بازیکنان می‌توانند کارت خودشان را ببینند
CREATE POLICY "Players can view their own cards" ON bingo_cards
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM players 
            WHERE players.id = bingo_cards.player_id 
            AND players.user_id = auth.uid()
        )
    );
```

### 5. فعال‌سازی Authentication

1. در Dashboard، به **Authentication** → **Providers** بروید
2. **Email** provider را فعال کنید
3. (اختیاری) تنظیمات Email templates را شخصی‌سازی کنید

### 6. فعال‌سازی Realtime (برای به‌روزرسانی‌های زنده)

1. در Dashboard، به **Database** → **Replication** بروید
2. برای جدول `rooms`، Replication را فعال کنید
3. برای جدول `games`، Replication را فعال کنید

یا از SQL Editor:

```sql
-- فعال‌سازی Realtime برای جداول
ALTER PUBLICATION supabase_realtime ADD TABLE rooms;
ALTER PUBLICATION supabase_realtime ADD TABLE games;
```

### 7. تست اتصال

1. سرور توسعه را اجرا کنید:
   ```bash
   npm run dev
   ```

2. به `/auth` بروید و یک حساب کاربری بسازید

3. به `/lobby` بروید و اتاق‌ها را ببینید

## نکات مهم

- **Environment Variables:** همیشه از `NEXT_PUBLIC_` استفاده کنید برای متغیرهایی که در client-side نیاز دارید
- **Security:** RLS (Row Level Security) را همیشه فعال نگه دارید
- **Realtime:** برای به‌روزرسانی‌های زنده، Realtime را برای جداول مورد نیاز فعال کنید
- **Production:** در production، environment variables را در Vercel/Netlify تنظیم کنید

## عیب‌یابی

### خطای "Missing Supabase environment variables"
- مطمئن شوید فایل `.env.local` وجود دارد
- متغیرها را با `NEXT_PUBLIC_` شروع کنید
- سرور را restart کنید

### خطای Authentication
- بررسی کنید Email provider فعال است
- بررسی کنید RLS policies درست تنظیم شده‌اند

### خطای Realtime
- بررسی کنید Replication برای جداول فعال است
- بررسی کنید از `supabase.channel()` درست استفاده می‌کنید



