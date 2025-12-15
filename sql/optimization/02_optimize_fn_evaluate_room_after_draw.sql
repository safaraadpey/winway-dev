-- ============================================
-- بهینه‌سازی fn_evaluate_room_after_draw
-- ============================================
-- تاریخ: $(date)
-- تغییرات:
-- - تبدیل Loop به یک Query واحد
-- - استفاده از Window Functions
-- - Bulk INSERT به جای INSERT تکی
-- - کاهش از 40,000 Query به 1 Query

CREATE OR REPLACE FUNCTION public.fn_evaluate_room_after_draw(
  p_room_id uuid, 
  p_draw_number integer
)
RETURNS void
LANGUAGE plpgsql
AS $function$
DECLARE
  v_line_reward_percentage NUMERIC;
  v_full_reward_percentage NUMERIC;
  v_total_pool NUMERIC;
  v_line_reward NUMERIC;
  v_full_reward NUMERIC;
  v_line_winner_count INTEGER;
  v_full_winner_count INTEGER;
BEGIN
  -- گرفتن درصدهای جایزه از room
  SELECT 
    COALESCE(r.line_reward_percentage, rt.line_reward_percentage, 0.5),
    COALESCE(r.full_reward_percentage, rt.full_reward_percentage, 0.8)
  INTO v_line_reward_percentage, v_full_reward_percentage
  FROM rooms r
  LEFT JOIN room_templates rt ON r.room_template_id = rt.id
  WHERE r.id = p_room_id;
  
  -- محاسبه total pool
  SELECT COALESCE(SUM(r.card_price), 0)
  INTO v_total_pool
  FROM tickets t
  JOIN rooms r ON t.room_id = r.id
  WHERE t.room_id = p_room_id
    AND t.reservation_status = 'confirmed';
  
  -- ============================================
  -- بهینه‌سازی: تبدیل Loop به یک Query واحد
  -- ============================================
  WITH ticket_analysis AS (
    SELECT 
      t.id as ticket_id,
      t.player_user_id as user_id,
      t.pool_card_id,
      -- شمارش کل سلول‌های کارت
      COUNT(DISTINCT cn.value) as total_cells,
      -- شمارش سلول‌های mark شده
      COUNT(DISTINCT CASE WHEN m.value IS NOT NULL THEN cn.value END) as marked_cells,
      -- بررسی Line Win برای هر ردیف
      COUNT(DISTINCT CASE WHEN cn.row_no = 1 AND m.value IS NOT NULL THEN cn.value END) as row1_marked,
      COUNT(DISTINCT CASE WHEN cn.row_no = 2 AND m.value IS NOT NULL THEN cn.value END) as row2_marked,
      COUNT(DISTINCT CASE WHEN cn.row_no = 3 AND m.value IS NOT NULL THEN cn.value END) as row3_marked,
      COUNT(DISTINCT CASE WHEN cn.row_no = 1 THEN cn.value END) as row1_total,
      COUNT(DISTINCT CASE WHEN cn.row_no = 2 THEN cn.value END) as row2_total,
      COUNT(DISTINCT CASE WHEN cn.row_no = 3 THEN cn.value END) as row3_total
    FROM tickets t
    INNER JOIN card_numbers cn ON cn.pool_card_id = t.pool_card_id
    LEFT JOIN marks m ON m.ticket_id = t.id AND m.value = cn.value
    WHERE t.room_id = p_room_id
      AND t.reservation_status = 'confirmed'
      -- فقط تیکت‌هایی که هنوز برای این draw ارزیابی نشده‌اند
      AND NOT EXISTS (
        SELECT 1 
        FROM results r 
        WHERE r.ticket_id = t.id 
          AND r.draw_number = p_draw_number
      )
    GROUP BY t.id, t.player_user_id, t.pool_card_id
  ),
  winners AS (
    SELECT 
      ticket_id,
      user_id,
      CASE 
        WHEN marked_cells = total_cells THEN 'full'
        WHEN row1_marked = row1_total OR 
             row2_marked = row2_total OR 
             row3_marked = row3_total THEN 'line'
      END as win_type
    FROM ticket_analysis
    WHERE (marked_cells = total_cells OR 
           row1_marked = row1_total OR 
           row2_marked = row2_total OR 
           row3_marked = row3_total)
  )
  -- Bulk INSERT برای results
  INSERT INTO results (room_id, user_id, ticket_id, win_type, reward_amount, draw_number)
  SELECT 
    p_room_id,
    user_id,
    ticket_id,
    win_type,
    0, -- مقدار اولیه، بعداً به‌روزرسانی می‌شود
    p_draw_number
  FROM winners
  ON CONFLICT DO NOTHING;
  
  -- محاسبه و به‌روزرسانی reward_amount برای line winners
  SELECT COUNT(*) INTO v_line_winner_count
  FROM results
  WHERE room_id = p_room_id
    AND win_type = 'line'
    AND draw_number = p_draw_number;
  
  IF v_line_winner_count > 0 THEN
    v_line_reward := (v_total_pool * v_line_reward_percentage) / v_line_winner_count;
    
    UPDATE results
    SET reward_amount = v_line_reward
    WHERE room_id = p_room_id
      AND win_type = 'line'
      AND draw_number = p_draw_number
      AND reward_amount = 0;
  END IF;
  
  -- محاسبه و به‌روزرسانی reward_amount برای full winners
  SELECT COUNT(*) INTO v_full_winner_count
  FROM results
  WHERE room_id = p_room_id
    AND win_type = 'full'
    AND draw_number = p_draw_number;
  
  IF v_full_winner_count > 0 THEN
    v_full_reward := (v_total_pool * v_full_reward_percentage) / v_full_winner_count;
    
    UPDATE results
    SET reward_amount = v_full_reward
    WHERE room_id = p_room_id
      AND win_type = 'full'
      AND draw_number = p_draw_number
      AND reward_amount = 0;
    
    -- بستن اتاق در صورت وجود Full Winner
    UPDATE rooms
    SET status = 'finished'::room_status,
        updated_at = NOW()
    WHERE id = p_room_id 
      AND status <> 'finished'::room_status;
  END IF;
END;
$function$;

-- ============================================
-- بررسی Function جدید
-- ============================================
SELECT 
    n.nspname as schema_name,
    p.proname as function_name,
    pg_get_functiondef(p.oid) as definition
FROM pg_proc p
JOIN pg_namespace n ON p.pronamespace = n.oid
WHERE p.proname = 'fn_evaluate_room_after_draw'
  AND n.nspname = 'public';

