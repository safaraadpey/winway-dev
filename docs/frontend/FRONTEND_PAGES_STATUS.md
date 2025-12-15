# وضعیت فعلی صفحات فرانت‌اند (آذر ۱۴۰۴)

> خلاصه‌ای از صفحات/کامپوننت‌های کلیدی سمت Player بعد از پیاده‌سازی لابی، خرید کارت، و قابلیت لغو روم؛ مبنا برای کارهای بعدی مربوط به مرحلهٔ بازی زنده.

## 1. Lobby (`app/player/lobby`)
- نمایش کارت‌های قیمت با `LobbyRoomCard`.
- داده‌ها از `room_templates` + `rooms` خوانده می‌شوند؛ در نبود template، فقط پیام Empty نمایش داده می‌شود.
- کلیک روی هر کارت → `router.push("/player/gameroom?templateId=...")`.

## 2. GameRoom (`/player/gameroom` + `GameRoomScreen`)
- ورودی می‌تواند `templateId` یا `roomId` باشد. `fetchGameRoomView` حالت‌های زیر را برمی‌گرداند:
  - `mode = "preview"`: فقط اطلاعات template، countdown=0، دکمه خرید فعال.
  - `mode = "waiting"`: روم واقعی با countdown، active_cards، active_tables.
  - `mode = "running"` یا `finished`: هنوز UI خاصی برای حالت running نداریم؛ وضعیت فعلی فقط دادهٔ روم را نمایش می‌دهد.
- اگر روم منتظر لغو شود، API حالا preview template را برمی‌گرداند تا UI دوباره فعال شود.
- `view.can_cancel` وقتی true است که تنها بازیکن باشیم و کمتر از ۱۵ ثانیه باقی‌مانده باشد → دکمه خرید به «لغو رزرو» (قرمز) تغییر می‌کند و API جدید `/api/player/cancel-waiting-room` را صدا می‌زند.

## 3. صفحهٔ بازی (Running)
- `LiveRoomScreen` برای حالت‌های `running/playing/live` پیاده شده و با API جدید `/api/player/live-room` داده می‌گیرد.
- هر کارت (کارت‌های خود بازیکن و سایر بازیکنان حاضر در روم) با استفاده از `BingoCardDemo` و helper مشترک نمایش داده می‌شود.
- هنوز باید منطق DING/BINGO واقعی (دکمه‌ها و ارسال به سرور) و فید real-time (یا polling سریع‌تر) تکمیل شود؛ فعلاً snapshot هر ۲ ثانیه درخواست می‌شود.

## 4. مؤلفه‌ها و وضعیتشان
| مؤلفه | فایل | وضعیت |
| --- | --- | --- |
| `LobbyRoomCard` | `components/LobbyRoomCard.tsx` | آماده؛ در لابی استفاده می‌شود |
| `GameRoomScreen` | `src/screens/GameRoomScreen.tsx` | حالت preview/waiting تکمیل، running ناقص |
| `CardQuantityPanel` | `components/CardQuantityPanel.tsx` | خرید و لغو را پوشش می‌دهد |
| `ActiveCardsPanel` / `ActiveTablesPanel` | `components/*` | در GameRoom استفاده می‌شوند |
| `BingoCard` | `components/BingoCard.tsx` | فقط حالت تست؛ به UI اصلی وصل نشده |

## 5. گام‌های بعدی برای صفحهٔ Running
1. طراحی UI حالت running (نمایش کارت، اعداد Draw، دکمه‌های Ding/Bingo).
2. گسترش API (یا استفاده از `api_get_room_state`) برای آوردن داده‌های بازی زنده.
3. اضافه کردن state جدید در `GameRoomScreen` برای `mode = "running"` و اتصال آن به `BingoCard`.
4. مدیریت رویدادهای بازی (Claim Bingo، نمایش برنده، تاریخچه draw).

--- 

این سند نقطهٔ شروع برای کار روی صفحهٔ بازی زنده است؛ بعد از پیاده‌سازی حالت running باید به‌روزرسانی شود. 
{
  "cells": [],
  "metadata": {
    "language_info": {
      "name": "python"
    }
  },
  "nbformat": 4,
  "nbformat_minor": 2
}