-- نسخه ساده‌تر: پیدا کردن Function‌های مرتبط با tickets
-- این query سریع‌تر است و فقط Function‌ها را نشان می‌دهد

-- تمام Function‌هایی که در نام یا body خود به tickets اشاره دارند
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
    -- جستجو در نام function
    p.proname ILIKE '%ticket%'
    -- یا در body function
    OR pg_get_functiondef(p.oid) ILIKE '%tickets%'
)
AND n.nspname NOT IN ('pg_catalog', 'information_schema', 'pg_toast')
ORDER BY n.nspname, p.proname;

-- نمایش کامل definition برای بررسی
SELECT 
    n.nspname as schema_name,
    p.proname as function_name,
    pg_get_functiondef(p.oid) as full_definition
FROM pg_proc p
JOIN pg_namespace n ON p.pronamespace = n.oid
WHERE (
    p.proname ILIKE '%ticket%'
    OR pg_get_functiondef(p.oid) ILIKE '%UPDATE%tickets%'
    OR pg_get_functiondef(p.oid) ILIKE '%tickets%SET%'
)
AND n.nspname NOT IN ('pg_catalog', 'information_schema', 'pg_toast')
ORDER BY n.nspname, p.proname;

