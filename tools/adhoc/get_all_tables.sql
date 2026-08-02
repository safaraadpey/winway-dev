-- لیست کامل همه جداول schema=public با جزئیات
SELECT 
    t.table_name,
    t.table_type,
    (SELECT COUNT(*) 
     FROM information_schema.columns c 
     WHERE c.table_schema = 'public' 
       AND c.table_name = t.table_name) as column_count,
    (SELECT COUNT(*) 
     FROM information_schema.table_constraints tc 
     WHERE tc.table_schema = 'public' 
       AND tc.table_name = t.table_name 
       AND tc.constraint_type = 'PRIMARY KEY') as has_primary_key
FROM information_schema.tables t
WHERE t.table_schema = 'public' 
    AND t.table_type = 'BASE TABLE'
ORDER BY t.table_name;

-- همچنین جداول view ها
SELECT 
    table_name,
    'VIEW' as table_type
FROM information_schema.views
WHERE table_schema = 'public'
ORDER BY table_name;

