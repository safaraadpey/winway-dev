# کامپوننت LobbyRoomCard

کامپوننت نمایش کارت روم در صفحه لابی بازی.

## ویژگی‌ها

- ✅ دو حالت نمایش: **minimal** (فقط عکس) و **expanded** (همه اطلاعات)
- ✅ حالت پیش‌فرض: **minimal**
- ✅ نمایش خودکار عکس روم بر اساس قیمت
- ✅ پشتیبانی از keyboard navigation
- ✅ نمایش وضعیت روم (در حال بازی، در انتظار، در دسترس نیست)

## استفاده

### حالت Minimal (پیش‌فرض)

```tsx
import LobbyRoomCard from '@/components/LobbyRoomCard';

<LobbyRoomCard
  price={5000}
  currency="IRR"
  waitingRooms={2}
  playingRooms={1}
  totalRooms={3}
  players={25}
  templateId="uuid-here"
  variant="minimal" // یا بدون این prop (پیش‌فرض minimal است)
  onClick={(price, templateId) => {
    console.log('Room clicked:', price, templateId);
  }}
/>
```

### حالت Expanded

```tsx
<LobbyRoomCard
  price={5000}
  currency="IRR"
  waitingRooms={2}
  playingRooms={1}
  totalRooms={3}
  players={25}
  templateId="uuid-here"
  variant="expanded"
  onClick={(price, templateId) => {
    console.log('Room clicked:', price, templateId);
  }}
/>
```

## Props

| Prop | Type | Required | Default | Description |
|------|------|----------|---------|-------------|
| `price` | `number` | ✅ | - | قیمت تیکت روم (به ریال) |
| `currency` | `string` | ✅ | - | واحد پول (مثلاً 'IRR') |
| `waitingRooms` | `number` | ✅ | - | تعداد روم‌های در انتظار |
| `playingRooms` | `number` | ✅ | - | تعداد روم‌های در حال بازی |
| `totalRooms` | `number` | ✅ | - | تعداد کل روم‌ها |
| `players` | `number` | ✅ | - | تعداد بازیکنان |
| `templateId` | `string` | ❌ | - | شناسه template روم |
| `variant` | `'minimal' \| 'expanded'` | ❌ | `'minimal'` | حالت نمایش کارت |
| `onClick` | `(price: number, templateId?: string) => void` | ❌ | - | تابع callback برای کلیک |

## حالت‌های نمایش

### Minimal
- فقط عکس روم نمایش داده می‌شود
- قیمت به صورت overlay در پایین عکس نمایش داده می‌شود
- مناسب برای نمایش فشرده و سریع

### Expanded
- عکس روم
- قیمت کامل
- آمار اتاق‌ها و بازیکنان
- وضعیت روم‌ها (در حال بازی، در انتظار، در دسترس نیست)
- مناسب برای نمایش جزئیات کامل

## تنظیمات ادمین

برای کنترل حالت پیش‌فرض از پنل ادمین، می‌توانید یک تنظیم در دیتابیس ذخیره کنید:

```sql
-- مثال: جدول settings
CREATE TABLE IF NOT EXISTS lobby_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  default_card_variant TEXT DEFAULT 'minimal' CHECK (default_card_variant IN ('minimal', 'expanded')),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

سپس در کامپوننت لابی:

```tsx
// در app/player/lobby/page.tsx
const [defaultVariant, setDefaultVariant] = useState<'minimal' | 'expanded'>('minimal');

useEffect(() => {
  // گرفتن تنظیمات از دیتابیس
  async function fetchSettings() {
    const { data } = await supabase
      .from('lobby_settings')
      .select('default_card_variant')
      .single();
    
    if (data?.default_card_variant) {
      setDefaultVariant(data.default_card_variant);
    }
  }
  fetchSettings();
}, []);

// استفاده در رندر
<LobbyRoomCard
  // ... other props
  variant={defaultVariant}
/>
```

## عکس‌های روم

کامپوننت به صورت خودکار عکس مناسب را بر اساس قیمت انتخاب می‌کند:

- قیمت ≤ 5,000 تومان → `5.png`
- قیمت ≤ 10,000 تومان → `10.png`
- قیمت ≤ 20,000 تومان → `20.png`
- قیمت ≤ 50,000 تومان → `50.png`
- قیمت ≤ 100,000 تومان → `100.png`
- قیمت > 100,000 تومان → `200.png`

عکس‌ها باید در مسیر `src/assets/room/` قرار گیرند.

## استایل‌ها

استایل‌ها در فایل `LobbyRoomCard.module.css` تعریف شده‌اند و قابل سفارشی‌سازی هستند.

### کلاس‌های اصلی:
- `.roomCard` - کارت اصلی
- `.roomCard.minimal` - حالت minimal
- `.roomCard.expanded` - حالت expanded
- `.roomImageContainer` - کانتینر عکس
- `.minimalPriceOverlay` - overlay قیمت در حالت minimal
- `.roomInfo` - بخش اطلاعات (فقط در expanded)
- `.roomPrice` - نمایش قیمت
- `.roomStats` - آمار اتاق‌ها و بازیکنان
- `.roomStatus` - وضعیت روم‌ها
- `.statusBadge` - بج وضعیت

## مثال کامل

```tsx
"use client";

import LobbyRoomCard from '@/components/LobbyRoomCard';
import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabaseClient';

export default function LobbyPage() {
  const [defaultVariant, setDefaultVariant] = useState<'minimal' | 'expanded'>('minimal');

  useEffect(() => {
    // گرفتن تنظیمات از دیتابیس
    async function loadSettings() {
      const { data } = await supabase
        .from('lobby_settings')
        .select('default_card_variant')
        .single();
      
      if (data?.default_card_variant) {
        setDefaultVariant(data.default_card_variant);
      }
    }
    loadSettings();
  }, []);

  const handleRoomClick = (price: number, templateId?: string) => {
    console.log('Room selected:', { price, templateId });
    // هدایت به صفحه روم
  };

  return (
    <div>
      <LobbyRoomCard
        price={5000}
        currency="IRR"
        waitingRooms={2}
        playingRooms={1}
        totalRooms={3}
        players={25}
        templateId="template-uuid"
        variant={defaultVariant}
        onClick={handleRoomClick}
      />
    </div>
  );
}
```

## نکات مهم

1. **قیمت**: باید به ریال باشد (نه تومان)
2. **عکس‌ها**: باید در مسیر `src/assets/room/` قرار گیرند
3. **Keyboard Navigation**: کامپوننت از Enter و Space برای فعال‌سازی پشتیبانی می‌کند
4. **Accessibility**: از role="button" و tabIndex استفاده شده است

## تغییرات آینده

- [ ] اضافه کردن انیمیشن transition بین حالت‌ها
- [ ] اضافه کردن حالت loading
- [ ] اضافه کردن tooltip برای اطلاعات بیشتر
- [ ] پشتیبانی از dark/light mode

