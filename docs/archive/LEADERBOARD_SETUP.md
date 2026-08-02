# راهنمای راه‌اندازی لیدربورد (Leaderboard)

این راهنما نحوه راه‌اندازی و استفاده از سیستم لیدربورد برای پیدا کردن برندگان روز و هفته را توضیح می‌دهد.

## وضعیت فعلی

✅ **لیدربورد آماده استفاده است!**

Functions لیدربورد بر اساس جدول `results` ایجاد شده‌اند و آماده استفاده هستند. این Functions به صورت خودکار از فیلد `created_at` در جدول `results` برای محاسبه برندگان روزانه و هفتگی استفاده می‌کنند.

## نحوه کار

سیستم لیدربورد از جدول `results` استفاده می‌کند که شامل:
- `user_id`: شناسه کاربر برنده
- `created_at`: زمان برنده شدن (برای فیلتر روزانه/هفتگی)
- `reward_amount`: مبلغ جایزه
- `win_type`: نوع برد (line/full)

**نکته مهم:** هنگام ثبت برنده در جدول `results`، فیلد `created_at` به صورت خودکار با زمان فعلی پر می‌شود. نیازی به تنظیم دستی نیست.

## استفاده در Frontend

### مثال: نمایش برندگان روز

```typescript
import { getDailyLeaders } from '@/lib/leaderboard';

// در یک Component
const DailyLeaders = () => {
  const [leaders, setLeaders] = useState([]);
  
  useEffect(() => {
    async function fetchLeaders() {
      const data = await getDailyLeaders(5); // 5 نفر برتر
      setLeaders(data);
    }
    fetchLeaders();
  }, []);
  
  return (
    <div>
      <h2>برندگان امروز</h2>
      {leaders.map((leader, index) => (
        <div key={leader.user_id}>
          <span>#{leader.rank_position}</span>
          <span>{leader.user_id}</span>
          <span>{leader.wins} برد</span>
        </div>
      ))}
    </div>
  );
};
```

### مثال: نمایش برندگان هفته

```typescript
import { getWeeklyLeaders } from '@/lib/leaderboard';

const WeeklyLeaders = () => {
  const [leaders, setLeaders] = useState([]);
  
  useEffect(() => {
    async function fetchLeaders() {
      const data = await getWeeklyLeaders(5);
      setLeaders(data);
    }
    fetchLeaders();
  }, []);
  
  // ...
};
```

### مثال: برندگان روز خاص

```typescript
import { getDailyLeadersByDate } from '@/lib/leaderboard';

// برندگان دیروز
const yesterday = new Date();
yesterday.setDate(yesterday.getDate() - 1);

const leaders = await getDailyLeadersByDate(yesterday, 5);
```

## Functions موجود

### 1. `get_daily_leaders(limit_count)`
برندگان 24 ساعت گذشته را برمی‌گرداند.

**پارامترها:**
- `limit_count` (INTEGER, default: 5): تعداد برندگان

**خروجی:**
```sql
user_id        UUID
wins           BIGINT        -- تعداد بردها
total_rewards  NUMERIC       -- مجموع جایزه‌ها
last_win       TIMESTAMP     -- آخرین برد
rank_position  BIGINT        -- رتبه
```

### 2. `get_weekly_leaders(limit_count)`
برندگان 7 روز گذشته را برمی‌گرداند.

### 3. `get_daily_leaders_by_date(target_date, limit_count)`
برندگان یک روز خاص را برمی‌گرداند.

**پارامترها:**
- `target_date` (DATE): تاریخ مورد نظر (مثلاً '2024-01-15')
- `limit_count` (INTEGER, default: 5)

## نکات مهم

### 1. دسترسی به اطلاعات کاربر

Functions به صورت خودکار اطلاعات کاربر را از جداول `users` و `user_profiles` دریافت می‌کنند. فایل `lib/leaderboard.ts` این کار را به صورت خودکار انجام می‌دهد و اطلاعات زیر را برمی‌گرداند:
- `email`: از جدول `users`
- `username`: از جدول `users`
- `nickname`: از جدول `user_profiles`

### 2. ثبت برنده در جدول results

هنگام ثبت برنده در جدول `results`، فیلد `created_at` به صورت خودکار با زمان فعلی پر می‌شود. نیازی به تنظیم دستی نیست:

```typescript
// مثال: ثبت برنده در results
const { error } = await supabase
  .from('results')
  .insert({
    room_id: roomId,
    user_id: userId,
    ticket_id: ticketId,
    win_type: 'line', // یا 'full'
    reward_amount: rewardAmount,
    // created_at به صورت خودکار set می‌شود
  });
```

### 3. کارایی (Performance)

Functions بهینه هستند و از Index استفاده می‌کنند. Index های زیر برای بهبود عملکرد ایجاد شده‌اند:
- `idx_results_created_at`: برای فیلتر سریع بر اساس تاریخ
- `idx_results_user_id_created_at`: برای جستجوی سریع بر اساس کاربر و تاریخ

## مثال کامل: صفحه لیدربورد

```typescript
'use client';

import { useState, useEffect } from 'react';
import { getDailyLeaders, getWeeklyLeaders } from '@/lib/leaderboard';

export default function LeaderboardPage() {
  const [dailyLeaders, setDailyLeaders] = useState([]);
  const [weeklyLeaders, setWeeklyLeaders] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchData() {
      setLoading(true);
      const [daily, weekly] = await Promise.all([
        getDailyLeaders(5),
        getWeeklyLeaders(5),
      ]);
      setDailyLeaders(daily);
      setWeeklyLeaders(weekly);
      setLoading(false);
    }
    fetchData();
  }, []);

  if (loading) return <div>در حال بارگذاری...</div>;

  return (
    <div>
      <h1>لیدربورد</h1>
      
      <section>
        <h2>برندگان امروز</h2>
        {dailyLeaders.map((leader) => (
          <div key={leader.user_id}>
            #{leader.rank_position} - {leader.nickname || leader.username || leader.user_id} - 
            {leader.wins} برد - {leader.total_rewards.toLocaleString()} تومان
          </div>
        ))}
      </section>
      
      <section>
        <h2>برندگان هفته</h2>
        {weeklyLeaders.map((leader) => (
          <div key={leader.user_id}>
            #{leader.rank_position} - {leader.nickname || leader.username || leader.user_id} - 
            {leader.wins} برد - {leader.total_rewards.toLocaleString()} تومان
          </div>
        ))}
      </section>
    </div>
  );
}
```

## عیب‌یابی

### خطا: "function does not exist"
- مطمئن شوید migration را اجرا کرده‌اید
- بررسی کنید Functions در Supabase Dashboard وجود دارند

### خطا: "permission denied"
- بررسی کنید `GRANT EXECUTE` در migration اجرا شده
- RLS policies را بررسی کنید

### نتایج خالی
- بررسی کنید که داده‌ای در جدول `results` وجود دارد
- مطمئن شوید که `created_at` در ردیف‌های `results` به درستی set شده است
- بررسی کنید که تاریخ `created_at` در بازه زمانی مورد نظر (24 ساعت یا 7 روز) قرار دارد

