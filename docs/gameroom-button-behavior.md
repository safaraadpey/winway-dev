# رفتار دکمه خرید/تایید در GameRoomScreen

## 📍 محل رندر دکمه

**کامپوننت**: `BuyCardsPanel` (در `components/room/BuyCardsPanel.tsx`)  
**بخش JSX**: در `GameRoomScreen.tsx` خطوط 534-547، داخل `<div className="px-4 space-y-1 pt-4">`

```tsx
<BuyCardsPanel
  price={roomInfo.cardPrice}
  minQuantity={1}
  maxQuantity={roomInfo.maxPlayers || 10}
  maxBuy={roomInfo.maxPlayers || 10}
  onConfirm={handleAddToList}
  disabled={...}
  mode={canCancel ? "cancel" : "purchase"}
  actionLabel={canCancel ? "لغو رزرو" : undefined}
/>
```

---

## 📝 متن دکمه در حالت‌های مختلف

### 1. حالت خرید (`mode="purchase"`)
- **متن**: `"تایید {totalPrice} تومن"` (مثلاً "تایید 50000 تومن")
- **استایل**: سبز (`bg-[#32cd32]`)

### 2. حالت لغو (`mode="cancel"`)
- **متن**: `actionLabel` یا "لغو رزرو"
- **استایل**: قرمز (`bg-red-600`)

### 3. در حال پردازش (`isSubmitting=true`)
- **متن**: "در حال پردازش..." با spinner
- **دکمه**: غیرفعال می‌شود

---

## 🎛️ Stateها و Props مؤثر

### Props ارسالی به `BuyCardsPanel`:

| Prop | منبع | توضیح |
|------|------|-------|
| `price` | `roomInfo.cardPrice` | قیمت هر کارت |
| `minQuantity` | `1` | حداقل تعداد |
| `maxQuantity` | `roomInfo.maxPlayers || 10` | حداکثر تعداد |
| `maxBuy` | `roomInfo.maxPlayers || 10` | حداکثر خرید |
| `disabled` | محاسبه می‌شود (زیر) | وضعیت غیرفعال |
| `mode` | `canCancel ? "cancel" : "purchase"` | حالت دکمه |
| `actionLabel` | `canCancel ? "لغو رزرو" : undefined` | متن دکمه در حالت لغو |
| `onConfirm` | `handleAddToList` | تابع onClick |

### Stateهای داخلی `BuyCardsPanel`:

- `isSubmitting`: در حین ارسال درخواست
- `quantity`: تعداد انتخاب‌شده

### Stateهای `GameRoomScreen` که روی دکمه تأثیر می‌گذارند:

- `roomId`: وجود `roomId` برای محاسبه `disabled`
- `canCancel`: `Boolean(roomId && roomInfo?.canCancel)`
- `countdownSeconds`: برای محاسبه `disabled`
- `roomInfo.status`: برای محاسبه `disabled`
- `roomInfo`: برای `price`, `maxPlayers`, `templateId`, `canCancel`

### محاسبه `disabled`:

```tsx
disabled={
  roomId && !canCancel
    ? countdownSeconds === 0 || roomInfo.status !== "waiting"
    : false
}
```

**یعنی:**
- اگر `roomId` وجود دارد و `canCancel=false`: غیرفعال می‌شود اگر `countdownSeconds === 0` یا `status !== "waiting"`
- در غیر این صورت: فعال است

---

## 🔧 تابع onClick: `handleAddToList`

```tsx
const handleAddToList = async (selectedQuantity: number) => {
  // 1. بررسی اعتبار roomInfo
  if (!roomInfo || !roomInfo.templateId) {
    toast.error("اطلاعات روم ناقص است");
    return;
  }

  const isCancelMode = canCancel;

  try {
    // 2. حالت لغو رزرو
    if (isCancelMode && roomId) {
      await cancelWaitingRoom(roomId);  // API call
      toast.success("رزرو شما لغو شد");
      router.push("/player/lobby");  // Redirect
      return;
    }

    // 3. حالت خرید کارت
    const result = await joinOrCreateRoom({  // API call
      templateId: roomInfo.templateId,
      cardCount: selectedQuantity,
    });

    toast.success(`${selectedQuantity} کارت با موفقیت خریداری شد`);

    // 4. اگر در روم واقعی هستیم، کارت‌های فعال را رفرش می‌کنیم
    if (roomId) {
      const roomCards = await loadRoomActiveCards(roomId);  // API call
      const activeCardsList = roomCards.map(...);
      setActiveCards(activeCardsList);  // State update
    }

    // 5. اگر room_id جدید است، redirect می‌کنیم
    if (!roomId || result.room_id !== roomId) {
      router.push(`/player/gameroom?roomId=${result.room_id}`);
    }
  } catch (error) {
    toast.error(error.message || "خطا در خرید کارت");
  }
};
```

### APIهای صدا زده شده:

1. **`cancelWaitingRoom(roomId)`**: در حالت لغو
2. **`joinOrCreateRoom({ templateId, cardCount })`**: در حالت خرید
3. **`loadRoomActiveCards(roomId)`**: برای رفرش کارت‌های فعال

### Stateهای تغییر یافته:

- `activeCards`: بعد از خرید کارت در روم موجود
- Navigation: redirect به lobby (لغو) یا روم جدید (خرید)

---

## 🔄 منطق تبدیل به "لغو رزرو"

### شرط تبدیل:

```tsx
const canCancel = Boolean(roomId && roomInfo?.canCancel);
```

### `canCancel` از کجا می‌آید:

- از `GameRoomView.can_cancel` در `fetchRoomData`
- در حالت preview: `canCancel: false`
- در روم واقعی: `canCancel: view.can_cancel`

### رفتار در حالت لغو:

1. `mode="cancel"` می‌شود
2. `actionLabel="لغو رزرو"` تنظیم می‌شود
3. دکمه قرمز می‌شود
4. دکمه‌های + و - غیرفعال می‌شوند (`controlsDisabled = true`)
5. با کلیک: `cancelWaitingRoom` صدا زده می‌شود و به lobby redirect می‌شود

---

## 📋 خلاصه مرحله‌به‌مرحله

### 1️⃣ اولین ورود به روم

- `fetchRoomData(true)` اجرا می‌شود
- `roomInfo` از API می‌آید
- `canCancel` از `view.can_cancel` تنظیم می‌شود
- `countdownDeadline` و `serverOffset` محاسبه می‌شوند
- `countdownSeconds` از deadline محاسبه می‌شود
- `disabled` بر اساس `roomId`, `canCancel`, `countdownSeconds`, `status` محاسبه می‌شود
- `mode`: `canCancel ? "cancel" : "purchase"`

### 2️⃣ کلیک روی دکمه

- `handleAddToList(quantity)` اجرا می‌شود
- **اگر `canCancel=true`:**
  - `cancelWaitingRoom(roomId)` صدا زده می‌شود
  - toast موفقیت
  - redirect به `/player/lobby`
- **اگر `canCancel=false`:**
  - `joinOrCreateRoom({ templateId, cardCount })` صدا زده می‌شود
  - toast موفقیت
  - اگر `roomId` موجود باشد: `loadRoomActiveCards` و به‌روزرسانی `activeCards`
  - اگر `result.room_id !== roomId`: redirect به روم جدید

### 3️⃣ در حالت رزرو یا شمارنده

- **Polling هر 20 ثانیه**: `fetchRoomData(false)`
- **Realtime**: subscription روی `rooms` و `tickets`
- **اگر Realtime `status` یا `starts_at` را تغییر دهد:**
  - `roomInfo` به‌روزرسانی می‌شود
  - `countdownDeadline` ممکن است تغییر کند
  - `countdownSeconds` از deadline محاسبه می‌شود
- **اگر `countdownSeconds === 0` و `canCancel=false`:**
  - دکمه غیرفعال می‌شود
- **اگر `status !== "waiting"`:**
  - دکمه غیرفعال می‌شود
- **اگر `canCancel=true`:**
  - دکمه به "لغو رزرو" تبدیل می‌شود و فعال می‌ماند

---

## 🔄 خلاصه تغییرات State در طول زمان:

```
ورود اولیه:
  roomInfo → از API
  canCancel → از view.can_cancel
  countdownDeadline → از starts_at یا countdown_seconds
  countdownSeconds → از deadline محاسبه می‌شود

Polling (هر 20 ثانیه):
  roomInfo → به‌روزرسانی می‌شود
  countdownDeadline → ممکن است تغییر کند
  countdownSeconds → از deadline محاسبه می‌شود

Realtime (rooms):
  roomInfo → به‌روزرسانی می‌شود
  countdownDeadline → ممکن است تغییر کند یا null شود
  countdownSeconds → از deadline محاسبه می‌شود یا 0 می‌شود

کلیک روی دکمه:
  حالت لغو: redirect به lobby
  حالت خرید: activeCards به‌روزرسانی می‌شود یا redirect به روم جدید
```

---

## 📊 فلوچارت تصمیم‌گیری

```
شروع
  ↓
آیا roomId وجود دارد؟
  ├─ خیر → mode="purchase", disabled=false
  └─ بله
      ↓
      آیا canCancel=true؟
      ├─ بله → mode="cancel", actionLabel="لغو رزرو"
      │         ↓
      │         کلیک → cancelWaitingRoom → redirect به lobby
      └─ خیر → mode="purchase"
                ↓
                آیا countdownSeconds === 0 یا status !== "waiting"؟
                ├─ بله → disabled=true
                └─ خیر → disabled=false
                          ↓
                          کلیک → joinOrCreateRoom → خرید کارت
```

---

## 🔍 نکات مهم

1. **دکمه در حالت preview همیشه فعال است** (چون `roomId` وجود ندارد)
2. **دکمه در حالت لغو همیشه فعال است** (حتی اگر countdown صفر باشد)
3. **دکمه در حالت خرید فقط زمانی غیرفعال می‌شود که:**
   - `countdownSeconds === 0` **و** `canCancel=false`
   - یا `status !== "waiting"`
4. **Realtime updates** می‌توانند `canCancel` را تغییر دهند (از طریق `roomInfo.canCancel`)
5. **Polling interval** 20 ثانیه است (قبلاً 5 ثانیه بود)

