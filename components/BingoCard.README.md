# کامپوننت BingoCard

کامپوننت نمایش کارت Bingo با انیمیشن‌های کامل.

## نصب وابستگی‌ها

```bash
npm install framer-motion use-sound react-confetti
```

## استفاده

```tsx
import BingoCard from '@/components/BingoCard';
import { generateCard } from '@/src/lib/bingo-generator';

function MyComponent() {
  const poolSeedHex = "abc123..."; // Seed از دیتابیس
  const cardNo = 1;
  const card = generateCard(poolSeedHex, cardNo);
  
  const [calledNumbers, setCalledNumbers] = useState<number[]>([]);
  const [isWinner, setIsWinner] = useState(false);

  return (
    <BingoCard
      card={card}
      calledNumbers={calledNumbers}
      isWinner={isWinner}
      playerName="safa1234"
      cardNumber={85}
      size="large"
      onNumberCalled={(number) => {
        console.log('Number called:', number);
      }}
    />
  );
}
```

## Props

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `card` | `(number \| null)[][]` | **required** | آرایه 3x9 کارت Bingo |
| `calledNumbers` | `number[]` | `[]` | لیست اعداد اعلام شده |
| `isWinner` | `boolean` | `false` | آیا کارت برنده است؟ |
| `playerName` | `string` | `undefined` | نام بازیکن (نمایش در سمت چپ) |
| `cardNumber` | `number` | `undefined` | شماره کارت (نمایش در سمت چپ) |
| `size` | `'large' \| 'small'` | `'large'` | اندازه کارت |
| `onNumberCalled` | `(number: number) => void` | `undefined` | Callback هنگام اعلام عدد |

## ویژگی‌ها

### انیمیشن سکه
- وقتی عددی اعلام می‌شود که در کارت وجود دارد:
  - سکه `ding-coin.png` ظاهر می‌شود
  - صدای دینگو پخش می‌شود
  - سلول scale می‌گیرد
  - بعد از 600ms سکه محو می‌شود
  - عدد کمرنگ می‌شود (اما باقی می‌ماند)

### انیمیشن برنده شدن (BINGO)
- وقتی `isWinner={true}` باشد:
  - کل کارت border طلایی می‌گیرد
  - Confetti نمایش داده می‌شود
  - صدای بینگو پخش می‌شود
  - متن "BINGO!" با انیمیشن نمایش داده می‌شود

## افزودن صداهای واقعی

برای استفاده از صداهای واقعی:

1. فایل‌های صوتی را در `public/sounds/` قرار دهید:
   - `ding.mp3` - صدا هنگام اعلام عدد
   - `bingo.mp3` - صدا هنگام برنده شدن

2. در `BingoCard.tsx`، کامنت‌های مربوط به صداها را فعال کنید:

```tsx
import dingSound from '/sounds/ding.mp3';
import bingoSound from '/sounds/bingo.mp3';

const [playDing] = useSound(dingSound, { volume: 0.5 });
const [playBingo] = useSound(bingoSound, { volume: 0.7 });
```

3. توابع placeholder (`playDing` و `playBingo`) را حذف کنید.

## مثال کامل

```tsx
"use client";

import { useState, useEffect } from 'react';
import BingoCard from '@/components/BingoCard';
import { generateCard } from '@/src/lib/bingo-generator';

export default function GamePage() {
  const poolSeedHex = "1234567890abcdef"; // از دیتابیس
  const card = generateCard(poolSeedHex, 1);
  
  const [calledNumbers, setCalledNumbers] = useState<number[]>([]);
  const [isWinner, setIsWinner] = useState(false);

  // شبیه‌سازی اعلام اعداد
  useEffect(() => {
    const interval = setInterval(() => {
      if (calledNumbers.length < 90) {
        const nextNumber = calledNumbers.length + 1;
        setCalledNumbers(prev => [...prev, nextNumber]);
        
        // بررسی برنده شدن (مثال ساده)
        if (nextNumber === 85) {
          setIsWinner(true);
        }
      }
    }, 2000);

    return () => clearInterval(interval);
  }, [calledNumbers]);

  return (
    <div className="p-4">
      <BingoCard
        card={card}
        calledNumbers={calledNumbers}
        isWinner={isWinner}
        playerName="safa1234"
        cardNumber={85}
        size="large"
        onNumberCalled={(number) => {
          console.log('Number called:', number);
        }}
      />
    </div>
  );
}
```

## نکات

- کامپوننت از **Framer Motion** برای انیمیشن‌ها استفاده می‌کند
- از **react-confetti** برای افکت confetti استفاده می‌شود
- صداها به صورت placeholder با Web Audio API ایجاد می‌شوند (می‌توانید فایل‌های واقعی اضافه کنید)
- کامپوننت کاملاً responsive است و با Tailwind CSS طراحی شده است

