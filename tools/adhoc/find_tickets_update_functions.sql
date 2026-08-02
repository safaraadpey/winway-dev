-- پیدا کردن تمام Function‌هایی که جدول tickets را آپدیت می‌کنند
-- در تمام schema‌ها

-- 1. Function‌هایی که در body خود به tickets اشاره دارند و UPDATE انجام می‌دهند
SELECT 
    n.nspname as schema_name,
    p.proname as function_name,
    pg_get_function_arguments(p.oid) as arguments,
    pg_get_function_result(p.oid) as return_type,
    CASE 
        WHEN p.prokind = 'f' THEN 'FUNCTION'
        WHEN p.prokind = 'p' THEN 'PROCEDURE'
        WHEN p.prokind = 'a' THEN 'AGGREGATE'
        WHEN p.prokind = 'w' THEN 'WINDOW'
    END as function_type,
    l.lanname as language,
    pg_get_functiondef(p.oid) as function_definition
FROM pg_proc p
JOIN pg_namespace n ON p.pronamespace = n.oid
JOIN pg_language l ON p.prolang = l.oid
WHERE (
    -- جستجو در body function برای UPDATE tickets
    pg_get_functiondef(p.oid) ILIKE '%UPDATE%tickets%'
    OR pg_get_functiondef(p.oid) ILIKE '%update%tickets%'
    OR pg_get_functiondef(p.oid) ILIKE '%UPDATE tickets%'
    OR pg_get_functiondef(p.oid) ILIKE '%update tickets%'
    OR pg_get_functiondef(p.oid) ILIKE '%tickets%SET%'
    OR pg_get_functiondef(p.oid) ILIKE '%tickets%set%'
)
AND n.nspname NOT IN ('pg_catalog', 'information_schema', 'pg_toast')
ORDER BY n.nspname, p.proname;

-- 2. Trigger‌هایی که روی جدول tickets هستند
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
    END as event
FROM pg_trigger t
JOIN pg_class c ON t.tgrelid = c.oid
JOIN pg_namespace n ON c.relnamespace = n.oid
JOIN pg_proc p ON t.tgfoid = p.oid
WHERE c.relname = 'tickets'
AND NOT t.tgisinternal
AND n.nspname NOT IN ('pg_catalog', 'information_schema', 'pg_toast')
ORDER BY n.nspname, t.tgname;

-- 3. Function‌هایی که توسط Trigger‌های tickets فراخوانی می‌شوند
SELECT DISTINCT
    n.nspname as schema_name,
    p.proname as function_name,
    pg_get_function_arguments(p.oid) as arguments,
    'TRIGGER FUNCTION' as function_type
FROM pg_trigger t
JOIN pg_class c ON t.tgrelid = c.oid
JOIN pg_namespace n ON c.relnamespace = n.oid
JOIN pg_proc p ON t.tgfoid = p.oid
WHERE c.relname = 'tickets'
AND NOT t.tgisinternal
AND n.nspname NOT IN ('pg_catalog', 'information_schema', 'pg_toast')
ORDER BY n.nspname, p.proname;

-- 4. Function‌هایی که ممکن است tickets را آپدیت کنند (جستجوی دقیق‌تر)
SELECT 
    n.nspname as schema_name,
    p.proname as function_name,
    pg_get_function_arguments(p.oid) as arguments,
    CASE 
        WHEN pg_get_functiondef(p.oid) ILIKE '%UPDATE tickets%' THEN 'Direct UPDATE'
        WHEN pg_get_functiondef(p.oid) ILIKE '%tickets%SET%' THEN 'SET on tickets'
        WHEN pg_get_functiondef(p.oid) ILIKE '%.from(%''tickets%' THEN 'Supabase client update'
        ELSE 'Possible update'
    END as update_type
FROM pg_proc p
JOIN pg_namespace n ON p.pronamespace = n.oid
WHERE (
    pg_get_functiondef(p.oid) ILIKE '%UPDATE%tickets%'
    OR pg_get_functiondef(p.oid) ILIKE '%tickets%SET%'
    OR pg_get_functiondef(p.oid) ILIKE '%tickets%UPDATE%'
    OR pg_get_functiondef(p.oid) ILIKE '%.from(%''tickets%'
    OR pg_get_functiondef(p.oid) ILIKE '%tickets%update%'
)
AND n.nspname NOT IN ('pg_catalog', 'information_schema', 'pg_toast')
ORDER BY n.nspname, p.proname;

