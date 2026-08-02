// Script برای اجرای query و پیدا کردن Function‌های مرتبط با tickets
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ Missing Supabase environment variables');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function findTicketsFunctions() {
  console.log('🔍 در حال جستجوی Function‌های مرتبط با tickets...\n');

  // Query 1: Function‌هایی که tickets را آپدیت می‌کنند
  const query1 = `
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
      pg_get_functiondef(p.oid) ILIKE '%UPDATE%tickets%'
      OR pg_get_functiondef(p.oid) ILIKE '%update%tickets%'
      OR pg_get_functiondef(p.oid) ILIKE '%tickets%SET%'
      OR pg_get_functiondef(p.oid) ILIKE '%tickets%set%'
      OR pg_get_functiondef(p.oid) ILIKE '%UPDATE tickets%'
      OR pg_get_functiondef(p.oid) ILIKE '%update tickets%'
    )
    AND n.nspname NOT IN ('pg_catalog', 'information_schema', 'pg_toast')
    ORDER BY n.nspname, p.proname;
  `;

  // Query 2: Trigger‌های روی tickets
  const query2 = `
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
  `;

  // Query 3: Function‌هایی که در نام خود ticket دارند
  const query3 = `
    SELECT 
      n.nspname as schema_name,
      p.proname as function_name,
      pg_get_function_arguments(p.oid) as arguments
    FROM pg_proc p
    JOIN pg_namespace n ON p.pronamespace = n.oid
    WHERE p.proname ILIKE '%ticket%'
    AND n.nspname NOT IN ('pg_catalog', 'information_schema', 'pg_toast')
    ORDER BY n.nspname, p.proname;
  `;

  try {
    console.log('📋 Query 1: Function‌هایی که tickets را آپدیت می‌کنند\n');
    const { data: data1, error: error1 } = await supabase.rpc('exec_sql', { query: query1 });
    
    if (error1) {
      // اگر RPC وجود نداشت، از روش مستقیم استفاده کنیم
      console.log('⚠️  RPC exec_sql موجود نیست. لطفاً query را در Supabase SQL Editor اجرا کنید.');
      console.log('\n📄 Query 1:\n', query1);
      return;
    }

    if (data1 && data1.length > 0) {
      console.table(data1);
    } else {
      console.log('✅ هیچ Function‌ای پیدا نشد که مستقیماً tickets را آپدیت کند.\n');
    }

    console.log('\n📋 Query 2: Trigger‌های روی جدول tickets\n');
    const { data: data2, error: error2 } = await supabase.rpc('exec_sql', { query: query2 });
    
    if (data2 && data2.length > 0) {
      console.table(data2);
    } else {
      console.log('✅ هیچ Trigger‌ای روی tickets پیدا نشد.\n');
    }

    console.log('\n📋 Query 3: Function‌هایی که در نام خود ticket دارند\n');
    const { data: data3, error: error3 } = await supabase.rpc('exec_sql', { query: query3 });
    
    if (data3 && data3.length > 0) {
      console.table(data3);
    } else {
      console.log('✅ هیچ Function‌ای با نام ticket پیدا نشد.\n');
    }

  } catch (error) {
    console.error('❌ خطا:', error.message);
    console.log('\n💡 لطفاً query‌ها را مستقیماً در Supabase SQL Editor اجرا کنید.');
    console.log('📄 فایل: find_tickets_functions.sql');
  }
}

findTicketsFunctions();

