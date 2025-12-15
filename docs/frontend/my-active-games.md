# MyActiveGames (چیپِ بازی‌های فعال من)

### هدف
کامپوننت `MyActiveGames` برای این ساخته شده که **وقتی پلیر همزمان در چند روم حضور دارد** (waiting/playing/live/settling)، بتواند از هر صفحه‌ی بخش پلیر، با یک ردیف چیپ، **سریع به روم(های) فعال خودش برگردد**.

### محل نمایش (UX)
- **زیر `PlayerStatusBar`** و در هدر sticky بخش پلیر (مسیرهای `app/player/*`).
- اگر پلیر هیچ روم فعالی نداشته باشد، **هیچ چیزی نمایش داده نمی‌شود** (کامپوننت `null` برمی‌گرداند).
- ظاهر چیپ‌ها **مشابه چیپ‌های جایزه در `LiveRoomScreen` / `RoomHeader`** است (گرادیانت تیره، border و shadow).

---

## تعریف «روم فعال»

### وضعیت‌های قابل نمایش
روم در لیست `MyActiveGames` قرار می‌گیرد اگر:
- وضعیت روم یکی از این‌ها باشد:
  - `waiting`
  - `playing`
  - `live`
  - `settling`
- و پلیر برای آن روم ticket داشته باشد (بر اساس جدول `tickets`)

### فیلتر ticketها
در API فعلی، ticketهای پلیر با این وضعیت‌ها معتبر محسوب می‌شوند:
- `confirmed`
- `consumed`

> نکته: اگر در بازی شما «reserved» هم باید باعث نمایش شود، باید در API به فیلتر اضافه شود.

---

## جریان داده (Data Flow)

### 1) API: دریافت روم‌های فعال پلیر
**مسیر:** `GET /api/player/my-active-rooms`  
**فایل:** `app/api/player/my-active-rooms/route.ts`

**کارکرد کلی:**
- احراز هویت کاربر (از طریق `getUserFromRequest`)
- Query از `tickets` برای user جاری
- استخراج `room_id`ها و Query از `rooms`
- ساخت خروجی استاندارد برای UI
- ارسال `ETag` برای بهینه‌سازی polling

**خروجی JSON (نمونه):**
```json
{
  "rooms": [
    {
      "roomId": "uuid",
      "roomCode": "platin",
      "status": "live",
      "cardPrice": 20000,
      "currency": "IRR",
      "cardCount": 3,
      "prize": 60000
    }
  ]
}
```

**جزئیات محاسبات:**
- `cardCount`: تعداد ticketهای پلیر در آن روم
- `prize`: تخمین ساده (فعلاً `cardPrice * cardCount`)

**مرتب‌سازی (Sorting):**
- `live` و `playing` اولویت بالاتر دارند، سپس `waiting` و در نهایت `settling`.

**ETag / 304:**
- اگر کل خروجی نسبت به درخواست قبلی تغییری نکرده باشد، API می‌تواند `304 Not Modified` برگرداند.

---

### 2) Hook: مدیریت Fetch + Realtime + Polling
**فایل:** `lib/hooks/useActiveGames.ts`

این hook یک state پایدار برای همه صفحات پلیر فراهم می‌کند:
- `rooms: ActiveRoom[]`
- `loading: boolean`
- `error: string | null`

**Realtime**
- Subscription به تغییرات `tickets` برای user جاری (هر تغییر باعث refetch می‌شود)
- Subscription به تغییرات `rooms` (UPDATE وضعیت) و refetch در صورت تغییر وضعیت

**Polling (Safety-net)**
- هر **۱۲ ثانیه** یکبار (قابل تغییر به ۱۰–۱۵ ثانیه) refetch انجام می‌شود.
- در صورت داشتن `ETag`، header `If-None-Match` ارسال می‌شود تا پاسخ‌های بی‌تغییر `304` شوند.

---

### 3) Context: Single Source of Truth
**فایل:** `lib/contexts/ActiveGamesContext.tsx`

برای جلوگیری از چند subscription موازی در صفحات مختلف:
- `ActiveGamesProvider` یک بار hook را اجرا می‌کند و خروجی را در context می‌گذارد.
- `useActiveGamesContext()` در UI مصرف می‌شود.

---

## UI Component

### کامپوننت: `MyActiveGames`
**فایل:** `components/MyActiveGames.tsx`  
**استایل:** `components/MyActiveGames.module.css`

**رفتار:**
- اگر `loading === true` → در نسخه نهایی باید چیزی نمایش ندهد (طبق UX مورد نظر)، یا صرفاً یک placeholder بسیار کوچک.
- اگر `error` وجود داشته باشد → قابل تصمیم: نمایش toast یا فقط log.
- اگر `rooms.length === 0` → `null`

**Navigation:**
- کلیک روی چیپ: رفتن به
  - `/player/gameroom?roomId=<roomId>`

**نمایش متن چیپ:**
- اولویت: `roomCode`
- fallback: نمایش `cardPrice` (فرمت شده)

**آیکون‌ها (Status UI):**
- `live` / `playing` → آیکون play سبز
- `waiting` → آیکون ساعت زرد
- `settling` → آیکون آبی

---

## Integration (جایی که رندر می‌شود)

### Provider در layout پلیر
**فایل:** `app/player/layout.tsx`
- `ActiveGamesProvider` باید اطراف `PlayerLayoutClient` باشد.

### نمایش زیر PlayerStatusBar
**فایل:** `app/player/PlayerLayoutClient.tsx`
- در بخش sticky header، بعد از `PlayerStatusBar`، `MyActiveGames` رندر می‌شود.

---

## نکات امنیتی / دسترسی

- Query اصلی از طریق API داخلی Next انجام می‌شود.
- API از `createServiceClient` استفاده می‌کند (service role)؛ بنابراین باید حتماً:
  - **احراز هویت کاربر** برقرار باشد.
  - خروجی فقط مربوط به user جاری باشد (در کد فعلی، `player_user_id=user.id` اعمال شده).

---

## عیب‌یابی (Troubleshooting)

اگر چیپ‌ها نمایش داده نمی‌شوند:
- **حالت 1: پلیر واقعاً روم فعالی ندارد**
  - انتظار: چیزی نمایش داده نمی‌شود.
- **حالت 2: API hit نمی‌شود**
  - Network tab را چک کنید: `GET /api/player/my-active-rooms`
  - اگر request نیست، یعنی کامپوننت/Provider در صفحه mount نشده یا در کد کامنت/غیرفعال است.
- **حالت 3: API 401 می‌دهد**
  - یعنی session/Authorization header برای API داخلی ارسال نشده یا auth در سرور برقرار نیست.
- **حالت 4: ticketها در وضعیت‌های متفاوت هستند**
  - اگر ticketها `reserved` هستند ولی شما فقط `confirmed/consumed` را فیلتر می‌کنید، خروجی خالی می‌شود.
- **حالت 5: dev server cache / HMR**
  - گاهی نیاز است `.next` پاک شود و `npm run dev` دوباره اجرا شود.

---

## آیتم‌های قابل تکمیل (Future Enhancements)
- نمایش badge کوچک برای تعداد روم‌ها (مثلاً «۳ روم فعال»)
- نمایش `cardCount` یا `players` روی چیپ
- تعریف دقیق‌تر `prize` بر اساس منطق واقعی payout (نه صرفاً `price * cardCount`)
- filter دقیق‌تر realtime rooms (فقط roomIdهای مربوط به user) برای کاهش event noise


