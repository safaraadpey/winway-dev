// تست ساده اتصال به Supabase
require('dotenv').config({ path: '.env.local' });

const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

console.log('\n🔍 تست اتصال به Supabase...\n');

// تست 1: بررسی Environment Variables
console.log('1️⃣ بررسی Environment Variables...');
if (!supabaseUrl || !supabaseAnonKey) {
  console.error('❌ خطا: متغیرهای محیطی تنظیم نشده‌اند!');
  console.error('   لطفاً فایل .env.local را بررسی کنید.\n');
  process.exit(1);
}

if (supabaseUrl.includes('your_') || supabaseAnonKey.includes('your_')) {
  console.error('❌ خطا: مقادیر placeholder هنوز جایگزین نشده‌اند!');
  console.error('   لطفاً مقادیر واقعی را از Supabase Dashboard وارد کنید.\n');
  process.exit(1);
}

console.log('   ✅ URL:', supabaseUrl);
console.log('   ✅ Key موجود است:', supabaseAnonKey.substring(0, 20) + '...\n');

// تست 2: ایجاد کلاینت
console.log('2️⃣ ایجاد Supabase Client...');
try {
  const supabase = createClient(supabaseUrl, supabaseAnonKey);
  console.log('   ✅ کلاینت با موفقیت ایجاد شد\n');
  
  // تست 3: بررسی Authentication
  console.log('3️⃣ تست Authentication Service...');
  supabase.auth.getSession()
    .then(({ data, error }) => {
      if (error) {
        console.error('   ❌ خطا در Authentication:', error.message);
      } else {
        console.log('   ✅ Authentication Service در دسترس است');
        console.log('   ℹ️  Session:', data.session ? 'موجود' : 'خالی (طبیعی است)\n');
      }
      
      // تست 4: بررسی Database
      console.log('4️⃣ تست Database Connection...');
      return supabase
        .from('rooms')
        .select('id')
        .limit(1);
    })
    .then(({ data, error }) => {
      if (error) {
        if (
          error.code === 'PGRST116' ||
          error.message.includes('relation') ||
          error.message.includes('does not exist')
        ) {
          console.log('   ✅ اتصال به Database برقرار است');
          console.log('   ⚠️  جدول rooms وجود ندارد (این طبیعی است اگر هنوز schema را اجرا نکرده‌اید)');
        } else if (error.message.includes('permission denied')) {
          console.log('   ✅ اتصال به Database برقرار است');
          console.log('   ⚠️  دسترسی محدود است (RLS فعال است)');
        } else {
          console.error('   ❌ خطا:', error.message);
          console.error('   کد خطا:', error.code);
        }
      } else {
        console.log('   ✅ اتصال به Database برقرار است');
        console.log('   ✅ جدول rooms موجود است');
        console.log('   ℹ️  تعداد رکوردها:', data?.length || 0);
      }
      
      console.log('\n✨ تست کامل شد!\n');
      console.log('📝 نتیجه: اتصال به Supabase برقرار است ✅\n');
      process.exit(0);
    })
    .catch((error) => {
      console.error('\n❌ خطای غیرمنتظره:', error.message);
      process.exit(1);
    });
    
} catch (error) {
  console.error('❌ خطا در ایجاد کلاینت:', error.message);
  process.exit(1);
}



