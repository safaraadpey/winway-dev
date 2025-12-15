// Script برای لیست کردن همه جداول Supabase
import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import { resolve } from 'path';

// Load environment variables
dotenv.config({ path: resolve(__dirname, '../.env.local') });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('Missing Supabase environment variables');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function listAllTables() {
  try {
    // Query برای دریافت همه جداول
    const { data, error } = await supabase.rpc('exec_sql', {
      query: `
        SELECT 
          table_name,
          (SELECT COUNT(*) 
           FROM information_schema.columns c 
           WHERE c.table_schema = 'public' 
             AND c.table_name = t.table_name) as column_count
        FROM information_schema.tables t
        WHERE t.table_schema = 'public' 
          AND t.table_type = 'BASE TABLE'
        ORDER BY t.table_name;
      `
    });

    if (error) {
      // اگر RPC وجود نداشت، از query مستقیم استفاده کنیم
      console.log('RPC not available, using direct query...');
      
      // روش دیگر: استفاده از PostgREST برای دریافت metadata
      // اما این کار نیاز به دسترسی admin دارد
      console.log('Please run the SQL query in Supabase SQL Editor instead.');
      console.log('See file: get_all_tables.sql');
      return;
    }

    console.log('Tables in public schema:');
    console.table(data);
  } catch (err) {
    console.error('Error:', err);
  }
}

listAllTables();

