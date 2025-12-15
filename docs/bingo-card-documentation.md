# مستندات کامل کارت Bingo و منطق‌های بازی

این مستندات شامل تمام جزئیات مربوط به کامپوننت‌های کارت Bingo، منطق‌های بازی، انیمیشن‌ها و ویژگی‌های UI/UX است.

---

## 📋 فهرست مطالب

1. [کامپوننت‌های اصلی](#کامپوننت‌های-اصلی)
2. [منطق بازی](#منطق-بازی)
3. [انیمیشن‌ها و افکت‌ها](#انیمیشن‌ها-و-افکت‌ها)
4. [جایزه خط (Line Prize)](#جایزه-خط-line-prize)
5. [سیستم Ding Balance](#سیستم-ding-balance)
6. [ویژگی‌های UI/UX](#ویژگی‌های-uiux)
7. [استفاده و مثال‌ها](#استفاده-و-مثال‌ها)

---

## 🎴 کامپوننت‌های اصلی

### 1. `BingoCard` Component

**مسیر:** `components/BingoCard.tsx`

کامپوننت اصلی برای نمایش کارت Bingo با تمام انیمیشن‌ها و افکت‌ها.

#### Props

```typescript
interface BingoCardProps {
  card: BingoCardData;              // آرایه 2 بعدی کارت (3x9)
  calledNumbers?: number[];         // لیست اعداد اعلام شده
  isWinner?: boolean;                // آیا کارت برنده است؟
  playerName?: string;               // نام بازیکن
  cardNumber?: number;               // شماره کارت
  size?: 'large' | 'small';         // اندازه کارت
  scale?: number;                    // ضریب scale برای تغییر اندازه کلی
  isMyCard?: boolean;                // آیا کارت متعلق به بازیکن فعلی است؟
  linePrize?: boolean;               // آیا جایزه خط فعال است؟
  onNumberCalled?: (number: number) => void;  // Callback هنگام اعلام عدد
}
```

#### ویژگی‌ها

- ✅ نمایش کارت 3x9 (3 سطر، 9 ستون)
- ✅ انیمیشن سکه هنگام اعلام عدد
- ✅ انیمیشن کل کارت هنگام برنده شدن
- ✅ نمایش نام بازیکن و شماره کارت در بالای کارت
- ✅ افکت طلایی برای کارت برنده
- ✅ فلاش زدن اعداد تقریباً کامل شده
- ✅ کادر طلایی برای سطر کامل شده (جایزه خط)

---

### 2. `BingoCardDemo` Component

**مسیر:** `components/BingoCardDemo.tsx`

کامپوننت موقت برای تست UI با داده‌های ثابت (بدون نیاز به بک‌اند).

**نکته:** این کامپوننت برای توسعه و تست UI استفاده می‌شود و باید در نهایت با `BingoCard` جایگزین شود.

---

## 🎮 منطق بازی

### فایل: `lib/bingo-logic.ts`

#### 1. `checkFullCardBingo()`

بررسی می‌کند آیا کارت Full Card Bingo است یا نه.

**قانون:** فقط وقتی تمام اعداد غیر null در کارت اعلام شده باشند، برنده است.

```typescript
checkFullCardBingo(card: BingoCardData, calledNumbers: number[]): boolean
```

**مثال:**
```typescript
const card = [
  [2, 19, 22, 36, null, null, null, 73, null],
  [null, null, 26, null, 48, 58, 61, null, 85],
  [8, null, null, 34, 43, null, 70, null, 87]
];

const calledNumbers = [2, 19, 22, 36, 73, 26, 48, 58, 61, 85, 8, 34, 43, 70, 87];
const isWinner = checkFullCardBingo(card, calledNumbers); // true
```

---

#### 2. `getAlmostCompleteRowNumber()`

پیدا کردن تمام اعداد باقی‌مانده در سطرهایی که تقریباً کامل شده‌اند (4 از 5 عدد خوانده شده).

**بازگشت:** آرایه اعداد باقی‌مانده (ممکن است چند سطر همزمان در این حالت باشند)

```typescript
getAlmostCompleteRowNumber(card: BingoCardData, calledNumbers: number[]): number[]
```

**استفاده:** برای فلاش زدن اعداد باقی‌مانده در سطرهای تقریباً کامل (فقط وقتی `linePrize={true}`)

---

#### 3. `getAlmostCompleteCardNumber()`

پیدا کردن عدد باقی‌مانده در کارتی که تقریباً فول شده (فقط 1 عدد باقی مانده).

**بازگشت:** عدد باقی‌مانده یا `null`

```typescript
getAlmostCompleteCardNumber(card: BingoCardData, calledNumbers: number[]): number | null
```

**اولویت:** این تابع اولویت بالاتری نسبت به `getAlmostCompleteRowNumber()` دارد.

**استفاده:** برای فلاش زدن عدد باقی‌مانده در کارت تقریباً فول

---

#### 4. `getCompleteRows()`

پیدا کردن سطرهای کامل شده (تمام 5 عدد خوانده شده).

**بازگشت:** آرایه شماره سطرهای کامل شده (0-based index)

```typescript
getCompleteRows(card: BingoCardData, calledNumbers: number[]): number[]
```

**استفاده:** برای اعمال کادر طلایی روی سطرهای کامل شده (جایزه خط)

---

#### 5. `getCardNumbers()`

استخراج تمام اعداد موجود در کارت (غیر null).

```typescript
getCardNumbers(card: BingoCardData): number[]
```

---

#### 6. `isNumberInCard()`

بررسی می‌کند آیا یک عدد خاص در کارت وجود دارد.

```typescript
isNumberInCard(card: BingoCardData, number: number): boolean
```

---

## ✨ انیمیشن‌ها و افکت‌ها

### 1. انیمیشن سکه (Coin Animation)

**زمان:** هنگام اعلام عددی که در کارت وجود دارد

**ویژگی‌ها:**
- فقط برای `isMyCard={true}` فعال است
- سکه با scale از 1 به 1.15 و برگشت به 1
- صدا (اگر فعال باشد)
- `addDing()` صدا زده می‌شود

**کد:**
```typescript
animate={
  isAnimating
    ? {
        scale: [1, 1.15, 1],
      }
    : {}
}
```

---

### 2. انیمیشن BINGO

**زمان:** وقتی کارت Full Card Bingo می‌شود

**ویژگی‌ها:**
- فقط برای `isMyCard={true}` فعال است
- Confetti (کاغذ رنگی)
- صدا (اگر فعال باشد)
- افکت طلایی روی کل کارت
- متن "BINGO!" نمایش داده می‌شود

---

### 3. فلاش زدن اعداد (Flashing Numbers)

**زمان:** وقتی یک عدد تقریباً کامل شده پیدا می‌شود

**انواع:**

#### الف) فلاش کارت تقریباً فول (اولویت بالاتر)
- وقتی فقط 1 عدد باقی مانده برای Full Card Bingo
- فقط برای `isMyCard={true}` فعال است

#### ب) فلاش سطر تقریباً کامل
- وقتی 4 از 5 عدد یک سطر خوانده شده
- فقط برای `isMyCard={true}` و `linePrize={true}` فعال است
- **محدودیت:** فقط یک بار در هر بازی اتفاق می‌افتد

**ویژگی‌های انیمیشن:**
- Scale: 1 → 1.2 → 1
- رنگ طلایی (background + border + shadow)
- درخشش طلایی

---

### 4. کادر طلایی سطر کامل (Complete Row Golden Border)

**زمان:** وقتی یک سطر کامل می‌شود (تمام 5 عدد خوانده شده)

**ویژگی‌ها:**
- فقط برای `isMyCard={true}` و `linePrize={true}` فعال است
- کادر طلایی روی تمام خانه‌های سطر کامل شده
- **محدودیت:** فقط اولین سطر کامل شده کادر طلایی می‌گیرد
- کادر طلایی باقی می‌ماند (محو نمی‌شود)

**استایل:**
```css
.cellCompleteRow {
  border-color: #fbbf24 !important; /* amber-400 */
  border-width: 3px !important;
  box-shadow: 0 0 8px rgba(251, 191, 36, 0.6) !important;
}
```

---

## 🎁 جایزه خط (Line Prize)

### فعال‌سازی

جایزه خط با prop `linePrize` کنترل می‌شود:

```typescript
<BingoCard
  linePrize={true}  // فعال کردن جایزه خط
  // ...
/>
```

### ویژگی‌ها

#### 1. فلاش سطر تقریباً کامل
- وقتی `linePrize={true}`: فلاش عدد باقی‌مانده در سطر تقریباً کامل (4 از 5)
- وقتی `linePrize={false}`: فلاش سطر غیرفعال است
- **محدودیت:** فقط یک بار در هر بازی

#### 2. کادر طلایی سطر کامل
- وقتی `linePrize={true}`: کادر طلایی برای اولین سطر کامل شده
- وقتی `linePrize={false}`: کادر طلایی غیرفعال است
- **محدودیت:** فقط اولین سطر کامل شده

### منطق محدودیت

#### State: `hasShownLinePrizeFlash`
- ردیابی اینکه آیا قبلاً فلاش سطر نشان داده شده
- وقتی بازی reset می‌شود (`calledNumbers.length === 0`)، به `false` برمی‌گردد

#### State: `hasShownLinePrizeComplete`
- ردیابی اینکه آیا قبلاً یک سطر کامل شده
- وقتی بازی reset می‌شود، به `false` برمی‌گردد
- کادر طلایی باقی می‌ماند (محو نمی‌شود)

---

## 💰 سیستم Ding Balance

### Context: `DingContext`

**مسیر:** `contexts/DingContext.tsx`

#### Provider

```typescript
<DingProvider initialBalance={1000}>
  {/* ... */}
</DingProvider>
```

#### Hook: `useDing()`

```typescript
const { dingBalance, addDing, isAnimating } = useDing();
```

#### توابع

##### `addDing()`
- موجودی را +10 می‌کند
- `isAnimating` را به `true` تنظیم می‌کند
- بعد از 1 ثانیه، `isAnimating` را به `false` برمی‌گرداند

**استفاده:**
```typescript
// در BingoCard وقتی عدد تیک می‌خورد
if (isMyCard) {
  dingContext.addDing();
}
```

---

### کامپوننت: `DingBalanceCapsule`

**مسیر:** `components/DingBalanceCapsule.tsx`

کپسول نمایش موجودی Ding با انیمیشن‌های کامل.

#### Props

```typescript
interface DingBalanceCapsuleProps {
  dingBalance: number;
  loading?: boolean;
  isAnimating?: boolean;
}
```

#### انیمیشن‌ها

##### 1. تپش سکه
- Scale: 1 → 1.15 → 1
- مدت زمان: 0.6s

##### 2. درخشش عدد
- رنگ: طلایی پایه (`#fbbf24`) → طلایی روشن‌تر → طلایی پایه
- Brightness: 1 → 2 → 1.5 → 1
- Text Shadow: درخشش طلایی
- مدت زمان: 0.8s

##### 3. درخشش بکگراند کپسول
- Background Color: آبی → طلایی → آبی
- Box Shadow: سایه طلایی
- مدت زمان: 0.8s

**نکته:** Border انیمیشن ندارد (ثابت می‌ماند)

---

### کامپوننت: `DingHeader`

**مسیر:** `components/DingHeader.tsx`

هدر با لوگو Dingmoney و کپسول موجودی.

**استفاده:**
```typescript
<DingHeader dingBalance={dingBalance} />
```

---

## 🎨 ویژگی‌های UI/UX

### 1. ساختار کارت

```
┌─────────────────────────────────┐
│ [نام بازیکن]    [شماره کارت]    │  ← Header
├─────────────────────────────────┤
│ [خانه‌های کارت 3x9]              │  ← Card Grid
└─────────────────────────────────┘
```

### 2. ابعاد و اندازه‌ها

#### اندازه‌های پیش‌فرض
- **Large:** عرض خانه: 37px، ارتفاع: 27px
- **Small:** عرض خانه: 28px، ارتفاع: 20px

#### Gap بین خانه‌ها
- 6px (هم افقی و هم عمودی)

#### Scalable Design
- استفاده از CSS Variables (`--card-scale`)
- تمام ابعاد با `calc()` محاسبه می‌شوند
- Gap هم scale می‌شود

### 3. رنگ‌بندی

#### خانه‌های خالی
- Background: transparent
- Border: black

#### خانه‌های پر (عادی)
- Background: white
- Border: black

#### خانه‌های تیک خورده
- Background: white
- Border: black/30 (کمرنگ)
- عدد: gray-300 (کمرنگ)

#### خانه‌های فلاش‌کننده
- Background: amber-100 (`#fef3c7`)
- Border: amber-400 (`#fbbf24`)
- Box Shadow: درخشش طلایی

#### خانه‌های سطر کامل (جایزه خط)
- Border: amber-400 (`#fbbf24`)
- Border Width: 3px
- Box Shadow: درخشش طلایی

### 4. انیمیشن‌های خانه

#### تیک خوردن عدد
- Scale: 1 → 1.1 → 1
- Opacity: 1 → 0.5 → 1 (کمرنگ شدن)

#### فلاش زدن
- Scale: 1 → 1.2 → 1
- رنگ طلایی

---

## 📝 استفاده و مثال‌ها

### مثال 1: استفاده ساده

```typescript
import BingoCard from '@/components/BingoCard';

const card: BingoCardData = [
  [2, 19, 22, 36, null, null, null, 73, null],
  [null, null, 26, null, 48, 58, 61, null, 85],
  [8, null, null, 34, 43, null, 70, null, 87]
];

<BingoCard
  card={card}
  calledNumbers={[2, 19, 22]}
  playerName="Player 1"
  cardNumber={1}
  isMyCard={true}
  linePrize={true}
/>
```

---

### مثال 2: با DingContext

```typescript
import { DingProvider } from '@/contexts/DingContext';
import BingoCard from '@/components/BingoCard';
import DingHeader from '@/components/DingHeader';

function GamePage() {
  return (
    <DingProvider initialBalance={1000}>
      <DingHeader />
      <BingoCard
        card={card}
        calledNumbers={calledNumbers}
        isMyCard={true}
        linePrize={true}
      />
    </DingProvider>
  );
}
```

---

### مثال 3: تست با BingoCardDemo

```typescript
import BingoCardDemo from '@/components/BingoCardDemo';
import { DingProvider } from '@/contexts/DingContext';

function TestPage() {
  const [calledNumbers, setCalledNumbers] = useState<number[]>([]);
  const [linePrize, setLinePrize] = useState(false);

  return (
    <DingProvider initialBalance={1000}>
      <BingoCardDemo
        calledNumbers={calledNumbers}
        isMyCard={true}
        linePrize={linePrize}
      />
    </DingProvider>
  );
}
```

---

## 🔧 فایل‌های مرتبط

### کامپوننت‌ها
- `components/BingoCard.tsx` - کامپوننت اصلی کارت
- `components/BingoCardDemo.tsx` - کامپوننت تست
- `components/DingHeader.tsx` - هدر با موجودی
- `components/DingBalanceCapsule.tsx` - کپسول موجودی

### منطق
- `lib/bingo-logic.ts` - تمام توابع منطق بازی

### Context
- `contexts/DingContext.tsx` - Context برای مدیریت موجودی

### استایل‌ها
- `components/BingoCard.module.css` - استایل کارت
- `components/BingoCardDemo.module.css` - استایل کارت تست
- `components/DingBalanceCapsule.module.css` - استایل کپسول

---

## 📌 نکات مهم

### 1. `isMyCard` Prop
- **true:** تمام انیمیشن‌ها، صداها، و `addDing()` فعال است
- **false:** فقط کمرنگ شدن خانه (بدون انیمیشن، صدا، یا `addDing()`)

### 2. `linePrize` Prop
- **true:** فلاش سطر و کادر طلایی فعال است
- **false:** فقط فلاش کارت تقریباً فول فعال است

### 3. محدودیت‌های جایزه خط
- فلاش سطر: فقط یک بار در هر بازی
- کادر طلایی: فقط اولین سطر کامل شده

### 4. اولویت فلاش
1. کارت تقریباً فول (اولویت بالاتر)
2. سطر تقریباً کامل (اگر `linePrize={true}`)

### 5. Reset خودکار
- وقتی `calledNumbers.length === 0` می‌شود، تمام state‌های مربوط به فلاش و جایزه خط reset می‌شوند

---

## 🎯 خلاصه منطق‌ها

### برنده شدن
- **فقط Full Card Bingo:** تمام اعداد غیر null باید اعلام شده باشند
- Row Bingo و Column Bingo در نظر گرفته نمی‌شوند

### فلاش زدن
- **کارت تقریباً فول:** فقط 1 عدد باقی مانده → فلاش می‌زند
- **سطر تقریباً کامل:** 4 از 5 عدد خوانده شده → فلاش می‌زند (فقط یک بار، فقط با `linePrize={true}`)

### جایزه خط
- **سطر کامل:** تمام 5 عدد خوانده شده → کادر طلایی (فقط اولین سطر، فقط با `linePrize={true}`)

### انیمیشن‌ها
- **فقط برای `isMyCard={true}`:** سکه، صدا، `addDing()`, BINGO, فلاش
- **برای همه:** کمرنگ شدن خانه هنگام تیک خوردن

---

**آخرین به‌روزرسانی:** 2024

