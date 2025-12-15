-- پیدا کردن تمام Function‌هایی که tickets را آپدیت می‌کنند
-- در تمام schema‌ها

-- ============================================
-- Query 1: Function‌هایی که در body خود به tickets اشاره دارند
-- ============================================
SELECT 
    n.nspname as schema_name,
    p.proname as function_name,
    pg_get_function_arguments(p.oid) as arguments,
    CASE p.prokind
        WHEN 'f' THEN 'FUNCTION'
        WHEN 'p' THEN 'PROCEDURE'
        WHEN 'a' THEN 'AGGREGATE'
        WHEN 'w' THEN 'WINDOW'
    END as function_type,
    l.lanname as language
FROM pg_proc p
JOIN pg_namespace n ON p.pronamespace = n.oid
JOIN pg_language l ON p.prolang = l.oid
WHERE (
    -- جستجو برای UPDATE tickets
    pg_get_functiondef(p.oid) ILIKE '%UPDATE%tickets%'
    OR pg_get_functiondef(p.oid) ILIKE '%update%tickets%'
    OR pg_get_functiondef(p.oid) ILIKE '%tickets%SET%'
    OR pg_get_functiondef(p.oid) ILIKE '%tickets%set%'
    OR pg_get_functiondef(p.oid) ILIKE '%UPDATE tickets%'
    OR pg_get_functiondef(p.oid) ILIKE '%update tickets%'
)
AND n.nspname NOT IN ('pg_catalog', 'information_schema', 'pg_toast')
ORDER BY n.nspname, p.proname;

-- ============================================
-- Query 2: Trigger‌های روی جدول tickets
-- ============================================
SELECT 
    n.nspname as schema_name,
    t.tgname as trigger_name,
    c.relname as table_name,
    p.proname as trigger_function,
    CASE 
        WHEN t.tgtype::integer & 2 = 2 THEN 'BEFORE'
        WHEN t.tgtype::integer & 64 = 64 THEN 'INSTEAD OF'
        ELSE 'AFTER'
    END as timing,
    CASE 
        WHEN t.tgtype::integer & 4 = 4 THEN 'INSERT'
        WHEN t.tgtype::integer & 8 = 8 THEN 'DELETE'
        WHEN t.tgtype::integer & 16 = 16 THEN 'UPDATE'
        WHEN t.tgtype::integer & 32 = 32 THEN 'TRUNCATE'
    END as event,
    pg_get_triggerdef(t.oid) as trigger_definition
FROM pg_trigger t
JOIN pg_class c ON t.tgrelid = c.oid
JOIN pg_namespace n ON c.relnamespace = n.oid
JOIN pg_proc p ON t.tgfoid = p.oid
WHERE c.relname = 'tickets'
AND NOT t.tgisinternal
AND n.nspname NOT IN ('pg_catalog', 'information_schema', 'pg_toast')
ORDER BY n.nspname, t.tgname;

-- ============================================
-- Query 3: Function‌هایی که ممکن است tickets را آپدیت کنند (با جزئیات)
-- ============================================
SELECT 
    n.nspname as schema_name,
    p.proname as function_name,
    pg_get_function_arguments(p.oid) as arguments,
    pg_get_functiondef(p.oid) as full_definition
FROM pg_proc p
JOIN pg_namespace n ON p.pronamespace = n.oid
WHERE (
    pg_get_functiondef(p.oid) ILIKE '%UPDATE%tickets%'
    OR pg_get_functiondef(p.oid) ILIKE '%tickets%SET%'
    OR pg_get_functiondef(p.oid) ILIKE '%tickets%UPDATE%'
    OR p.proname ILIKE '%ticket%'
)
AND n.nspname NOT IN ('pg_catalog', 'information_schema', 'pg_toast')
ORDER BY n.nspname, p.proname;

