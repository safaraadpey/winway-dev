-- Migration: افزودن فیلد won_at به جدول bingo_cards
-- این فایل را در Supabase SQL Editor اجرا کنید تا فیلد won_at به جدول موجود اضافه شود

-- افزودن فیلد won_at به جدول bingo_cards (اگر وجود نداشته باشد)
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 
        FROM information_schema.columns 
        WHERE table_name = 'bingo_cards' 
        AND column_name = 'won_at'
    ) THEN
        ALTER TABLE bingo_cards 
        ADD COLUMN won_at TIMESTAMP WITH TIME ZONE;
        
        -- پر کردن won_at برای ردیف‌های موجود که برنده هستند
        -- از finished_at بازی استفاده می‌کنیم یا created_at کارت
        UPDATE bingo_cards bc
        SET won_at = COALESCE(
            (SELECT finished_at FROM games WHERE id = bc.game_id),
            bc.created_at
        )
        WHERE bc.is_winner = TRUE 
          AND bc.won_at IS NULL;
    END IF;
END $$;

-- افزودن Functions برای لیدربورد (اگر وجود نداشته باشند)
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

-- اطمینان از دسترسی همه به این Functions (برای لیدربورد عمومی)
GRANT EXECUTE ON FUNCTION get_weekly_leaders(INTEGER) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION get_daily_leaders(INTEGER) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION get_daily_leaders_by_date(DATE, INTEGER) TO anon, authenticated;

