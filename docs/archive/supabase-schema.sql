-- Schema برای پروژه Bingo Game
-- این فایل را در Supabase SQL Editor اجرا کنید

-- جدول rooms برای اتاق‌های بازی
CREATE TABLE IF NOT EXISTS rooms (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  player_count INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

-- جدول players برای بازیکنان
CREATE TABLE IF NOT EXISTS players (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  room_id UUID REFERENCES rooms(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  joined_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
  UNIQUE(room_id, user_id)
);

-- جدول games برای بازی‌های فعال
CREATE TABLE IF NOT EXISTS games (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  room_id UUID REFERENCES rooms(id) ON DELETE CASCADE,
  status TEXT DEFAULT 'waiting' CHECK (status IN ('waiting', 'active', 'finished')),
  current_number INTEGER,
  started_at TIMESTAMP WITH TIME ZONE,
  finished_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

-- جدول bingo_cards برای کارت‌های بازی
CREATE TABLE IF NOT EXISTS bingo_cards (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  game_id UUID REFERENCES games(id) ON DELETE CASCADE,
  player_id UUID REFERENCES players(id) ON DELETE CASCADE,
  card_numbers JSONB NOT NULL, -- آرایه 5x5 از اعداد
  marked_cells JSONB DEFAULT '[]'::jsonb, -- سلول‌های علامت‌گذاری شده
  is_winner BOOLEAN DEFAULT FALSE,
  won_at TIMESTAMP WITH TIME ZONE, -- زمان برنده شدن (برای لیدربورد روز/هفته)
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
DROP TRIGGER IF EXISTS update_rooms_updated_at ON rooms;
CREATE TRIGGER update_rooms_updated_at BEFORE UPDATE ON rooms
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- فعال‌سازی Row Level Security (RLS)
ALTER TABLE rooms ENABLE ROW LEVEL SECURITY;
ALTER TABLE players ENABLE ROW LEVEL SECURITY;
ALTER TABLE games ENABLE ROW LEVEL SECURITY;
ALTER TABLE bingo_cards ENABLE ROW LEVEL SECURITY;

-- حذف policies قبلی (اگر وجود دارند)
DROP POLICY IF EXISTS "Anyone can read rooms" ON rooms;
DROP POLICY IF EXISTS "Authenticated users can create rooms" ON rooms;
DROP POLICY IF EXISTS "Users can view players" ON players;
DROP POLICY IF EXISTS "Users can join as players" ON players;
DROP POLICY IF EXISTS "Anyone can read games" ON games;
DROP POLICY IF EXISTS "Players can view their own cards" ON bingo_cards;

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

-- فعال‌سازی Realtime برای جداول
ALTER PUBLICATION supabase_realtime ADD TABLE rooms;
ALTER PUBLICATION supabase_realtime ADD TABLE games;

-- ============================================
-- Functions برای لیدربورد (برندگان روز و هفته)
-- ============================================

-- Function برای دریافت برندگان هفته (7 روز گذشته)
CREATE OR REPLACE FUNCTION get_weekly_leaders(limit_count INTEGER DEFAULT 5)
RETURNS TABLE (
  user_id UUID,
  wins BIGINT,
  last_win TIMESTAMP WITH TIME ZONE,
  rank_position BIGINT
) AS $$
BEGIN
  RETURN QUERY
  WITH weekly_wins AS (
    SELECT 
      p.user_id,
      COUNT(*) as wins,
      MAX(COALESCE(bc.won_at, bc.created_at, g.finished_at)) as last_win
    FROM bingo_cards bc
    JOIN players p ON p.id = bc.player_id
    JOIN games g ON g.id = bc.game_id
    WHERE bc.is_winner = TRUE
      AND (
        bc.won_at >= NOW() - INTERVAL '7 days'
        OR (bc.won_at IS NULL AND g.finished_at >= NOW() - INTERVAL '7 days')
        OR (bc.won_at IS NULL AND g.finished_at IS NULL AND bc.created_at >= NOW() - INTERVAL '7 days')
      )
      AND g.status = 'finished'
    GROUP BY p.user_id
  )
  SELECT 
    ww.user_id,
    ww.wins,
    ww.last_win,
    ROW_NUMBER() OVER (ORDER BY ww.wins DESC, ww.last_win DESC) as rank_position
  FROM weekly_wins ww
  ORDER BY ww.wins DESC, ww.last_win DESC
  LIMIT limit_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function برای دریافت برندگان روز (24 ساعت گذشته)
CREATE OR REPLACE FUNCTION get_daily_leaders(limit_count INTEGER DEFAULT 5)
RETURNS TABLE (
  user_id UUID,
  wins BIGINT,
  last_win TIMESTAMP WITH TIME ZONE,
  rank_position BIGINT
) AS $$
BEGIN
  RETURN QUERY
  WITH daily_wins AS (
    SELECT 
      p.user_id,
      COUNT(*) as wins,
      MAX(COALESCE(bc.won_at, bc.created_at, g.finished_at)) as last_win
    FROM bingo_cards bc
    JOIN players p ON p.id = bc.player_id
    JOIN games g ON g.id = bc.game_id
    WHERE bc.is_winner = TRUE
      AND (
        bc.won_at >= NOW() - INTERVAL '24 hours'
        OR (bc.won_at IS NULL AND g.finished_at >= NOW() - INTERVAL '24 hours')
        OR (bc.won_at IS NULL AND g.finished_at IS NULL AND bc.created_at >= NOW() - INTERVAL '24 hours')
      )
      AND g.status = 'finished'
    GROUP BY p.user_id
  )
  SELECT 
    dw.user_id,
    dw.wins,
    dw.last_win,
    ROW_NUMBER() OVER (ORDER BY dw.wins DESC, dw.last_win DESC) as rank_position
  FROM daily_wins dw
  ORDER BY dw.wins DESC, dw.last_win DESC
  LIMIT limit_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function برای دریافت برندگان روز خاص (مثلاً امروز)
CREATE OR REPLACE FUNCTION get_daily_leaders_by_date(target_date DATE, limit_count INTEGER DEFAULT 5)
RETURNS TABLE (
  user_id UUID,
  wins BIGINT,
  last_win TIMESTAMP WITH TIME ZONE,
  rank_position BIGINT
) AS $$
BEGIN
  RETURN QUERY
  WITH daily_wins AS (
    SELECT 
      p.user_id,
      COUNT(*) as wins,
      MAX(COALESCE(bc.won_at, bc.created_at, g.finished_at)) as last_win
    FROM bingo_cards bc
    JOIN players p ON p.id = bc.player_id
    JOIN games g ON g.id = bc.game_id
    WHERE bc.is_winner = TRUE
      AND (
        DATE(COALESCE(bc.won_at, bc.created_at, g.finished_at)) = target_date
      )
      AND g.status = 'finished'
    GROUP BY p.user_id
  )
  SELECT 
    dw.user_id,
    dw.wins,
    dw.last_win,
    ROW_NUMBER() OVER (ORDER BY dw.wins DESC, dw.last_win DESC) as rank_position
  FROM daily_wins dw
  ORDER BY dw.wins DESC, dw.last_win DESC
  LIMIT limit_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;



