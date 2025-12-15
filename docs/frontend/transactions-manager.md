# کامپوننت مدیریت تراکنش‌ها (TransactionsManager)

این سند نحوه‌ی استفاده از کامپوننت `TransactionsManager` و سرویس‌های مربوط به مدیریت تراکنش‌ها در پنل ادمین / ایجنت / سوپر را توضیح می‌دهد.

---

## 1. هدف کامپوننت

**TransactionsManager** یک UI کامل برای:

- دیدن لیست کاربران زیرمجموعه (بر اساس نقش جاری)
- فیلتر کردن بر اساس نقش (پلیر / ایجنت / سوپر / همه)
- جست‌وجو بر اساس:
  - نام کاربری (`username`)
  - نام نمایشی (`displayName`)
  - ID عددی ده‌رقمی (`shortId`)
- انتخاب یک یا چند کاربر
- انجام **واریز** (`deposit`) یا **برداشت** (`withdraw`) تومان روی کیف پول کاربران انتخاب‌شده

این کامپوننت به صورت مشترک در صفحات زیر استفاده می‌شود:

- `/admin/transactions`
- `/agent/transactions`
- (در صورت نیاز: `/super/transactions` با همان ساختار)

---

## 2. ساختار فایل‌ها

- `components/admin/TransactionsManager.tsx` – UI و منطق صفحه مدیریت تراکنش‌ها
- `services/users.ts` – سرویس `loadManagedUsers` برای بارگذاری کاربران زیرمجموعه
- `services/transactions.ts` – سرویس `adjustWalletForUsersBulk` برای فراخوانی RPC بک‌اند
- `src/types/users.ts` – typeهای `ManagedUserSummary` و غیره
- `src/types/transactions.ts` – typeهای `TransactionAction` و `BulkAdjustRequest`

---

## 3. استفاده در صفحات

### 3.1. ادمین

```tsx
// app/(admin)/transactions/page.tsx
"use client";

import { useEffect } from "react";
import { useHeaderVisibility } from "@/lib/contexts/HeaderVisibilityContext";
import TransactionsManager from "@/components/admin/TransactionsManager";

export default function AdminTransactionsPage() {
  const { setShowHeader, setShowBackButton, setOnBackClick } = useHeaderVisibility();

  useEffect(() => {
    setShowHeader(true);
    setShowBackButton(true);
    setOnBackClick(() => () => history.back());

    return () => {
      setShowBackButton(false);
      setOnBackClick(null);
    };
  }, [setShowHeader, setShowBackButton, setOnBackClick]);

  return <TransactionsManager pageTitle="مدیریت تراکنش‌ها" />;
}
```

### 3.2. ایجنت

```tsx
// app/(agent)/transactions/page.tsx
"use client";

import { useEffect } from "react";
import { useHeaderVisibility } from "@/lib/contexts/HeaderVisibilityContext";
import TransactionsManager from "@/components/admin/TransactionsManager";

export default function AgentTransactionsPage() {
  const { setShowHeader, setShowBackButton, setOnBackClick } = useHeaderVisibility();

  useEffect(() => {
    setShowHeader(true);
    setShowBackButton(true);
    setOnBackClick(() => () => history.back());

    return () => {
      setShowBackButton(false);
      setOnBackClick(null);
    };
  }, [setShowHeader, setShowBackButton, setOnBackClick]);

  return <TransactionsManager pageTitle="مدیریت تراکنش‌ها" />;
}
```

---

## 4. منبع داده کاربران (`loadManagedUsers`)

در `services/users.ts` تابع `loadManagedUsers` بر اساس نقش جاری، زیرمجموعه مناسب را برمی‌گرداند:

- `agent`:
  - تمام playerهایی که در `player_affiliation.agent_id = currentUserId` هستند.
- `super`:
  - players و agents که در `player_affiliation.super_id = currentUserId` هستند.
- `admin`:
  - تمام کاربران جدول `public.users`.

خروجی هر کاربر (`ManagedUserSummary`):

```ts
export interface ManagedUserSummary {
  id: string;         // UUID
  shortId: string;    // ID ده‌رقمی برای نمایش
  username: string;
  displayName: string;
  role: ManagedUserRole; // 'admin' | 'agent' | 'super' | 'player'
  tomanBalance: number;  // موجودی تومان از جدول wallets
}
```

### 4.1. جست‌وجو

تابع `loadManagedUsers` روی `username`, `displayName` و `shortId` سرچ می‌کند:

```ts
if (search && search.trim().length > 0) {
  const q = search.trim().toLowerCase();
  const normalize = (s: string) => s.toLowerCase().replace(/[\s_]+/g, "");
  const qNorm = normalize(q);
  const qDigits = q.replace(/[^0-9]/g, "");

  mapped = mapped.filter(
    (u) =>
      normalize(u.username).includes(qNorm) ||
      normalize(u.displayName).includes(qNorm) ||
      (qDigits.length > 0 && u.shortId.includes(qDigits))
  );
}
```

---

## 5. انجام واریز / برداشت در UI

### 5.1. انتخاب کاربرها

- هر ردیف در لیست کاربران شامل یک checkbox مربعی است.
- شناسه‌های انتخاب‌شده در `selectedIds: Set<string>` نگه‌داری می‌شوند.
- اگر هیچ کاربری انتخاب نشده باشد، دکمه‌های واریز/برداشت خطا نشان می‌دهند.

### 5.2. وارد کردن مبلغ

- در نوار پایین (ثابت)، یک فیلد «مبلغ» وجود دارد:

```tsx
<input
  type="text"
  inputMode="numeric"
  pattern="[0-9]*"
  value={amountInput}
  onChange={handleAmountChange}
  className="bg-transparent outline-none text-right text-sm font-mono text-white w-28"
  placeholder="0"
/>
```

- `handleAmountChange` تمامی کاراکترهای غیرعدد را حذف می‌کند و مقدار را به صورت رشته عددی ذخیره می‌کند.

### 5.3. فراخوانی سرویس

برای واریز:

```ts
await adjustWalletForUsersBulk({
  userIds: Array.from(selectedIds),
  amount: parsedAmount,
  action: "deposit",
  currency: "IRR",
});
```

برای برداشت:

```ts
await adjustWalletForUsersBulk({
  userIds: Array.from(selectedIds),
  amount: parsedAmount,
  action: "withdraw",
  currency: "IRR",
});
```

پس از موفقیت:

- toast موفقیت (متن متفاوت برای واریز/برداشت)
- بارگذاری مجدد لیست کاربران (`loadManagedUsers`) برای به‌روزرسانی موجودی‌ها
- پاک شدن وضعیت انتخاب‌ها و مقدار مبلغ

---

## 6. کنترل دسترسی در فرانت

در `lib/auth-helpers.ts` یک helper برای بررسی مجوز مدیریت تراکنش‌ها اضافه شده است:

```ts
export async function canManageTransactions(): Promise<boolean> {
  const roleInfo = await getCurrentUserRoleInfo();
  if (!roleInfo) return false;

  if (roleInfo.role === 'admin') {
    // مدیر کل یا finance می‌توانند
    if (!roleInfo.admin_sub_role || roleInfo.admin_sub_role === 'manager') {
      return true;
    }
    if (roleInfo.admin_sub_role === 'finance') {
      return true;
    }
    return false;
  }

  // agent و super مجازند (روی زیرمجموعه خودشان)
  if (roleInfo.role === 'agent' || roleInfo.role === 'super') {
    return true;
  }

  return false;
}
```

می‌توان در آینده در لایه‌ی صفحه (page component) قبل از رندر `TransactionsManager` از این helper استفاده کرد و در صورت نبود مجوز، کاربر را به صفحه‌ی دیگری هدایت کرد.

---

## 7. نکات UX

- رنگ‌بندی و استایل کاملاً با صفحه «مدیریت کاربران» هماهنگ شده است:
  - پس‌زمینه اصلی: `#000000`
  - کارت‌ها و باکس‌ها: `#1f2933` و `#374151`
  - موجودی‌ها با فونت مونو و علامت `T` زرد در کنار عدد.
- نوار پایین همیشه در صفحه ثابت است تا ایجنت/ادمین بتواند بعد از انتخاب چند کاربر سریعاً مبلغ و نوع تراکنش را انتخاب کند.


