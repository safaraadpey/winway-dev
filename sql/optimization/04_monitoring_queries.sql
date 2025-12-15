-- ============================================
-- Query‌های مانیتورینگ عملکرد
-- ============================================
-- تاریخ: $(date)

-- ============================================
-- مانیتورینگ وضعیت Jobها
-- ============================================
SELECT 
  status,
  COUNT(*) as job_count,
  AVG(attempts) as avg_attempts,
  MAX(attempts) as max_attempts,
  AVG(EXTRACT(EPOCH FROM (NOW() - created_at))) as avg_age_seconds,
  MAX(EXTRACT(EPOCH FROM (NOW() - created_at))) as max_age_seconds
FROM public.draw_jobs
GROUP BY status
ORDER BY status;

-- ============================================
-- بررسی Jobهای که خیلی طول کشیده‌اند
-- ============================================
SELECT 
  id,
  room_id,
  draw_number,
  status,
  attempts,
  created_at,
  updated_at,
  EXTRACT(EPOCH FROM (NOW() - created_at)) as age_seconds
FROM public.draw_jobs
WHERE status IN ('queued', 'processing')
  AND EXTRACT(EPOCH FROM (NOW() - created_at)) > 30  -- بیشتر از 30 ثانیه
ORDER BY created_at DESC
LIMIT 20;

-- ============================================
-- بررسی Index Usage
-- ============================================
SELECT 
    schemaname,
    tablename,
    indexname,
    idx_scan as index_scans,
    idx_tup_read as tuples_read,
    idx_tup_fetch as tuples_fetched
FROM pg_stat_user_indexes
WHERE schemaname = 'public'
  AND tablename IN ('marks', 'card_numbers', 'tickets', 'results')
  AND indexname LIKE 'idx_%'
ORDER BY tablename, indexname;

-- ============================================
-- بررسی Table Size
-- ============================================
SELECT 
    schemaname,
    tablename,
    pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) AS size,
    pg_total_relation_size(schemaname||'.'||tablename) AS size_bytes
FROM pg_tables
WHERE schemaname = 'public'
  AND tablename IN ('marks', 'card_numbers', 'tickets', 'results', 'draw_jobs')
ORDER BY size_bytes DESC;

-- ============================================
-- بررسی Query Performance
-- ============================================
-- برای تست عملکرد Function
EXPLAIN ANALYZE
SELECT public.fn_evaluate_room_after_draw(
  'room-id-here'::uuid,
  1
);

