# راهنمای سیستم Ding

سیستم Ding یک نوع امتیاز/ارز جدا از wallet است که به بازیکنان به ازای هر عدد قرعه‌کشی شده که روی کارت‌هایشان باشد، داده می‌شود.

## نحوه کار

### منطق توزیع Ding

1. **وقتی یک عدد در قرعه‌کشی می‌آید:**
   - سیستم به صورت خودکار تمام کارت‌های فعال در Room را بررسی می‌کند
   - برای هر کارتی که آن عدد رویش است، **1 Ding** به بازیکن آن کارت داده می‌شود
   - اگر یک بازیکن چند کارت داشته باشد و عدد روی همه آنها باشد، به ازای هر کارت Ding می‌گیرد

### مثال

فرض کنید:
- بازیکن A دارای 3 کارت است
- عدد 12 در قرعه‌کشی می‌آید
- عدد 12 روی 2 کارت از بازیکن A است
- ضریب Ding در Room: **2** (هر عدد 2 Ding می‌دهد)

**نتیجه:** بازیکن A، **4 Ding** دریافت می‌کند (2 کارت × 2 Ding = 4 Ding)

### مثال با ضریب متفاوت

- بازیکن B دارای 5 کارت است
- عدد 25 در قرعه‌کشی می‌آید
- عدد 25 روی 3 کارت از بازیکن B است
- ضریب Ding در Room: **1.5**

**نتیجه:** بازیکن B، **4.5 Ding** دریافت می‌کند (3 کارت × 1.5 Ding = 4.5 Ding)

## ساختار دیتابیس

### جدول `ding_balances`
ذخیره موجودی Ding هر کاربر:
```sql
user_id      UUID PRIMARY KEY
balance      NUMERIC (موجودی)
updated_at   TIMESTAMP
created_at   TIMESTAMP
```

### جدول `ding_transactions`
لاگ تمام تراکنش‌های Ding:
```sql
id            UUID PRIMARY KEY
user_id       UUID (کاربر دریافت‌کننده)
room_id       UUID (اتاق بازی)
ticket_id     UUID (کارت مربوطه)
draw_id       UUID (قرعه‌کشی مربوطه)
drawn_number  INTEGER (عدد قرعه‌کشی شده)
amount        NUMERIC (مقدار Ding)
description   TEXT
created_at    TIMESTAMP
```

## استفاده در Frontend

### دریافت موجودی Ding

```typescript
import { getMyDingBalance } from '@/lib/ding';

const balance = await getMyDingBalance();
console.log(`موجودی Ding شما: ${balance}`);
```

### دریافت تراکنش‌های Ding

```typescript
import { getMyDingTransactions } from '@/lib/ding';

const transactions = await getMyDingTransactions(20);
transactions.forEach(t => {
  console.log(`عدد ${t.drawn_number} - ${t.amount} Ding`);
});
```

### Subscribe به تغییرات Realtime

```typescript
import { subscribeToDingBalance } from '@/lib/ding';

const unsubscribe = await subscribeToDingBalance((newBalance) => {
  console.log(`موجودی جدید: ${newBalance} Ding`);
  // به‌روزرسانی UI
});

// برای unsubscribe
unsubscribe();
```

### دریافت آمار

```typescript
import { getMyDingStats } from '@/lib/ding';

const stats = await getMyDingStats();
console.log(`کل دریافتی: ${stats.total_received}`);
console.log(`تعداد تراکنش‌ها: ${stats.transaction_count}`);
```

## مثال کامل: نمایش Ding در UI

```typescript
'use client';

import { useState, useEffect } from 'react';
import { getMyDingBalance, subscribeToDingBalance } from '@/lib/ding';

export default function DingDisplay() {
  const [balance, setBalance] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // دریافت موجودی اولیه
    async function fetchBalance() {
      const b = await getMyDingBalance();
      setBalance(b);
      setLoading(false);
    }
    fetchBalance();

    // Subscribe به تغییرات
    let unsubscribe: (() => void) | null = null;
    subscribeToDingBalance((newBalance) => {
      setBalance(newBalance);
    }).then((unsub) => {
      unsubscribe = unsub;
    });

    return () => {
      if (unsubscribe) {
        unsubscribe();
      }
    };
  }, []);

  if (loading) {
    return <div>در حال بارگذاری...</div>;
  }

  return (
    <div className="ding-display">
      <h3>موجودی Ding</h3>
      <div className="balance">{balance.toLocaleString()}</div>
    </div>
  );
}
```

## تنظیمات

### تنظیم ضریب Ding در Room Template

مقدار پیش‌فرض: **1 Ding** به ازای هر کارت

برای تغییر ضریب Ding در یک Room Template:

```sql
-- تغییر ضریب در template
UPDATE room_templates 
SET ding_per_number = 2  -- هر عدد 2 Ding می‌دهد
WHERE id = 'template_id';
```

یا هنگام ایجاد template جدید:

```sql
INSERT INTO room_templates (
  price,
  currency,
  min_players,
  countdown_sec,
  ding_per_number  -- مثلاً 2 یا 3
) VALUES (
  1000,
  'IRR',
  2,
  120,
  2  -- هر عدد 2 Ding می‌دهد
);
```

### Override ضریب در Room خاص

می‌توانید برای یک Room خاص ضریب متفاوتی تنظیم کنید:

```sql
-- تنظیم ضریب خاص برای یک Room
UPDATE rooms 
SET ding_per_number = 3  -- این Room هر عدد 3 Ding می‌دهد
WHERE id = 'room_id';
```

**نکته:** اگر `ding_per_number` در Room `NULL` باشد، از مقدار template استفاده می‌شود.

### منطق انتخاب ضریب

سیستم به ترتیب زیر ضریب را انتخاب می‌کند:
1. اگر Room خودش `ding_per_number` داشته باشد → از آن استفاده می‌شود
2. اگر Room `ding_per_number` نداشته باشد → از template استفاده می‌شود
3. اگر template هم نداشته باشد → مقدار پیش‌فرض **1** استفاده می‌شود

### شرط‌های دریافت Ding

Ding فقط در شرایط زیر داده می‌شود:
- Room باید در وضعیت `live` یا `playing` باشد
- کارت باید در وضعیت `confirmed` یا `consumed` باشد
- عدد قرعه‌کشی شده باید روی کارت باشد

## نکات مهم

1. **توزیع خودکار:** Ding به صورت خودکار بعد از هر `INSERT` در جدول `draws` توزیع می‌شود
2. **Idempotent:** اگر یک Draw دوباره ثبت شود، Ding دوباره داده نمی‌شود (چون trigger فقط روی INSERT است)
3. **Performance:** Index های مناسب برای بهبود عملکرد ایجاد شده‌اند
4. **RLS:** کاربران فقط می‌توانند موجودی و تراکنش‌های خودشان را ببینند

## عیب‌یابی

### Ding داده نمی‌شود

1. بررسی کنید Room در وضعیت `live` یا `playing` است:
   ```sql
   SELECT status FROM rooms WHERE id = 'room_id';
   ```

2. بررسی کنید کارت‌ها در وضعیت صحیح هستند:
   ```sql
   SELECT reservation_status FROM tickets WHERE room_id = 'room_id';
   ```

3. بررسی کنید عدد روی کارت است:
   ```sql
   SELECT cn.value 
   FROM card_numbers cn
   JOIN card_pool_cards cpc ON cpc.id = cn.pool_card_id
   JOIN tickets t ON t.pool_card_id = cpc.id
   WHERE t.id = 'ticket_id' AND cn.value = 12;
   ```

### موجودی اشتباه است

بررسی تراکنش‌ها:
```sql
SELECT * FROM ding_transactions 
WHERE user_id = 'user_id' 
ORDER BY created_at DESC;
```

