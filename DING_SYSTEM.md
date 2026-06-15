# راهنمای سیستم Ding

> **سند فنی کامل (انگلیسی، به‌روز با کد):** [`docs/system-map/Ding-system.md`](docs/system-map/Ding-system.md)

Ding یک **امتیاز/ارز جدا از کیف پول تومان** است. در بازی زنده، وقتی عدد قرعه روی
کارت(های) بازیکن بیفتد، به موجودی `ding_balances` اضافه می‌شود.

---

## خلاصه منطق

### فرمول (سرور — منبع حقیقت)

```
delta = (تعداد کارت‌های match‌شده) × ding_per_number
```

- **کارت match‌شده:** بلیت `reserved`، لغو نشده، عدد روی کارت باشد.
- **ding_per_number:** `room.ding_per_number` → وگرنه `template` → وگرنه `1`.

### مثال

- بازیکن ۳ کارت `reserved` دارد.
- عدد ۱۲ می‌آید و روی ۲ کارتش است.
- `ding_per_number = 2`

→ سرور **۴ ding** credit می‌کند (۲ × ۲).

---

## مسیر اعمال در سیستم

### ۱. سرور (Game Engine)

1. قرعه در `draws` + job در `draw_jobs`
2. Engine: mark، ارزیابی برنده، محاسبه ding در حافظه
3. یک RPC (`rpc_finalize_engine_draw_job`): marks، results، `processed_at`،
   credit در `ding_balances` + `ding_transactions`
4. Trigger قدیمی DB (`trg_aggregate_ding_on_processed_at`) **غیرفعال** است تا
   دوبار credit نشود.

جزئیات: [`docs/system-map/Ding-system.md`](docs/system-map/Ding-system.md)

### ۲. کلاینت (نمایش در UI)

| مرحله | رفتار |
| --- | --- |
| ورود / لاگین | `GET /api/me/ding-balance` |
| حین Live Room | جمع **محلی** به ازای هر عدد reveal‌شده + صدای دینگ |
| پایان بازی | `refreshAllBalances()` از API |
| refresh صفحه | دوباره API |

**فایل‌های کلیدی:**

- `lib/hooks/useBalances.ts` — `creditDingOnReveal`, `refreshAllBalances`
- `src/screens/LiveRoomScreen.tsx` — شمارش کارت و trigger بعد از reveal
- `app/player/PlayerLayoutClient.tsx` + `MergedPlayerHeader` — نمایش

**نکته:** realtime روی `ding_balances` در پلیر فعال **نیست**؛ موجودی حین بازی
optimistic است.

---

## تفاوت UI و سرور (مهم)

| | سرور | UI حین بازی |
| --- | --- | --- |
| بلیت‌های eligible | فقط `reserved` | همه `is_my_card` |
| زمان credit | finalize شدن draw | reveal در صف UI |
| عدد نهایی | `ding_balances` | بعد از refresh با API هم‌تراز می‌شود |

در **تورنومنت** بلیت‌ها اغلب `confirmed` هستند → سرور ممکن است ding ندهد ولی UI
هنوز optimistic زیاد نشان دهد.

---

## جداول اصلی

- **`ding_balances`** — موجودی فعلی (`balance`, `locked_amount`)
- **`ding_transactions`** — لاگ credit (در engine: یک ردیف تجمیعی per user per draw)
- **`rooms.ding_per_number` / `room_templates.ding_per_number`** — ضریب

---

## API و helperهای فرانت

```typescript
// موجودی (ترجیحاً در shell از useBalancesContext)
import { getMyDingBalance } from "@/lib/features/ding/ding";

// یا
fetch("/api/me/ding-balance", { headers: { Authorization: `Bearer ${token}` } });
```

```typescript
// در Live Room — از context
const { creditDingOnReveal } = useBalancesContext();
// LiveRoomScreen internally: creditDingOnReveal(`${roomId}:${number}`, delta)
```

تراکنش‌ها و آمار: `getMyDingTransactions`, `getMyDingStats` در
`lib/features/ding/ding.ts`.

---

## تنظیم ضریب

```sql
-- template
UPDATE room_templates SET ding_per_number = 2 WHERE id = '…';

-- override اتاق
UPDATE rooms SET ding_per_number = 3 WHERE id = '…';
-- NULL روی room → از template استفاده می‌شود
```

---

## عیب‌یابی

**سرور ding نداده:**

```sql
SELECT processed_at, ding_aggregated_at FROM draws
WHERE room_id = '…' AND number = 12;

SELECT reservation_status, cancelled_at FROM tickets WHERE room_id = '…';

SELECT * FROM ding_transactions
WHERE room_id = '…' AND drawn_number = 12;
```

**UI با refresh فرق دارد:** تراکنش‌های بالا را با تعداد کارت‌های match‌شده در UI
مقایسه کن؛ معمولاً به خاطر `reserved` vs `confirmed` یا جمع optimistic است.

---

## مستندات مرتبط

- [`docs/system-map/Ding-system.md`](docs/system-map/Ding-system.md) — reality map کامل
- [`docs/system-map/event-flows.md`](docs/system-map/event-flows.md)
- [`docs/backend/supabese/tournament_dingmoney_architecture.md`](docs/backend/supabese/tournament_dingmoney_architecture.md)
