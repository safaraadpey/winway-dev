-- ============================================
-- ایجاد Index‌های مورد نیاز برای بهینه‌سازی
-- ============================================
-- تاریخ: $(date)
-- هدف: بهبود عملکرد Draw Worker برای 5,000 کارت

-- ============================================
-- Index برای marks (برای NOT EXISTS check)
-- ============================================
CREATE INDEX IF NOT EXISTS idx_marks_ticket_value 
ON public.marks(ticket_id, value);

CREATE INDEX IF NOT EXISTS idx_marks_ticket_id 
ON public.marks(ticket_id);

-- ============================================
-- Index برای card_numbers (برای JOIN و فیلتر)
-- ============================================
CREATE INDEX IF NOT EXISTS idx_card_numbers_pool_row_value 
ON public.card_numbers(pool_card_id, row_no, value);

CREATE INDEX IF NOT EXISTS idx_card_numbers_pool_id 
ON public.card_numbers(pool_card_id);

-- ============================================
-- Index برای tickets (برای فیلتر room_id)
-- ============================================
CREATE INDEX IF NOT EXISTS idx_tickets_room_status 
ON public.tickets(room_id, reservation_status) 
WHERE reservation_status = 'confirmed';

CREATE INDEX IF NOT EXISTS idx_tickets_room_id 
ON public.tickets(room_id);

-- ============================================
-- Index برای results (برای NOT EXISTS check)
-- ============================================
CREATE INDEX IF NOT EXISTS idx_results_ticket_draw 
ON public.results(ticket_id, draw_number);

CREATE INDEX IF NOT EXISTS idx_results_room_win_draw 
ON public.results(room_id, win_type, draw_number);

-- ============================================
-- بررسی Index‌های ایجاد شده
-- ============================================
SELECT 
    schemaname,
    tablename,
    indexname,
    indexdef
FROM pg_indexes
WHERE tablename IN ('marks', 'card_numbers', 'tickets', 'results')
  AND schemaname = 'public'
  AND indexname LIKE 'idx_%'
ORDER BY tablename, indexname;

