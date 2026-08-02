// Script برای پیدا کردن Function‌های مرتبط با tickets
// از طریق query مستقیم به PostgreSQL
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ Missing Supabase environment variables');
  process.exit(1);
}

// برای query‌های پیچیده، نیاز به service_role key داریم
// یا باید از Supabase SQL Editor استفاده کنیم

console.log('📋 برای اجرای این query‌ها، لطفاً یکی از روش‌های زیر را استفاده کنید:\n');
console.log('1️⃣  در Supabase Dashboard → SQL Editor → فایل tools/adhoc/find_tickets_functions.sql را اجرا کنید\n');
console.log('2️⃣  یا از psql استفاده کنید:\n');
console.log(`   psql "postgresql://postgres:[PASSWORD]@[HOST]:5432/postgres" -f tools/adhoc/find_tickets_functions.sql\n`);

console.log('📄 Query‌های آماده شده:\n');
console.log('✅ Query 1: Function‌هایی که tickets را آپدیت می‌کنند');
console.log('✅ Query 2: Trigger‌های روی جدول tickets');
console.log('✅ Query 3: Function‌هایی که در نام خود ticket دارند\n');

console.log('💡 برای اجرای سریع، فایل tools/adhoc/find_tickets_functions.sql را در Supabase SQL Editor باز کنید.\n');

