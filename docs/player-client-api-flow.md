## جریان درخواست‌های کلاینت پلیر (Home → Lobby → Room → Live)

### فهرست اندپوینت‌ها
- `GET /api/player/gameroom?roomId=...` یا `?templateId=...`  
  - بارگذاری نما‌ی Room/Lobby (active_cards, active_tables، وضعیت روم).  
  - Polling در کلاینت: هر ~5s در `GameRoomScreen`.
- `POST /api/player/gameroom?roomId=...` (در کد با RPC `fn_join_or_create_room`)  
  - خرید/رزرو کارت؛ در `BuyCardsPanel` استفاده می‌شود.
- `POST /api/player/cancel-waiting-room`  
  - لغو رزرو/انتظار برای روم؛ body: `{ roomId }`.
- `GET /api/player/live-room?roomId=...`  
  - داده‌ی زنده بازی (draws، کارت‌ها، status روم).  
  - Polling در کلاینت: هر ~2s در `LiveRoomScreen`.
- `GET /api/player/room-results?roomId=...`  
  - برگرداندن برندگان از جدول `results` (line/full) همراه با `reward_amount`، `nickname/username` و `avatar_url`.  
  - Trigger: یک‌بار پس از پایان بازی (status خارج از running/playing/live/waiting) در `LiveRoomScreen`.
- سایر موارد:  
  - آواتارها و پروفایل از `users`/`user_profiles` خوانده می‌شوند (در PlayerStatusBar و room-results).

### فلوها
#### 1) ورود / Home
- احراز هویت Supabase در سمت کلاینت؛ سشن از مرورگر گرفته می‌شود.
- PlayerStatusBar و DingHeader داده‌ی کاربر را از `useBalances` و پروفایل می‌گیرند.

#### 2) Lobby / انتخاب روم
- `GameRoomScreen` با `roomId` یا `templateId` بارگذاری می‌شود.
- Polling هر ~5s به `GET /api/player/gameroom` برای وضعیت روم، کارت‌های فعال، میزهای مشابه.
- خرید کارت: `POST` (RPC `fn_join_or_create_room`) → در صورت موفق، همان polling داده‌های تازه را می‌گیرد.
- لغو رزرو: `POST /api/player/cancel-waiting-room`.

#### 3) ورود به روم زنده (LiveRoomScreen)
- وقتی status روم در gameroom به حالت live/running برسد، `LiveRoomScreen` رندر می‌شود.
- Polling هر ~2s به `GET /api/player/live-room`:
  - داده‌های draws، کارت‌ها، و `room.status`.
  - اگر `room.status` پایان را نشان دهد (finished/settling/…)، state ریست و مرحله‌ی نتایج فعال می‌شود.

#### 4) پایان بازی و نمایش نتایج
- شرط پایان: status روم خارج از `running/playing/live/waiting`.
- در اولین بار پایان، `GET /api/player/room-results` صدا زده می‌شود:
  - از جدول `results` برندگان خطی/کامل و مبلغ جایزه را می‌خواند.
  - `users` و `user_profiles` برای نام و آواتار join می‌شوند.
- پاپ‌آپ `GameResultsDialog` نمایش داده می‌شود؛ بستن دیالوگ کاربر را به `/player/lobby` برمی‌گرداند.
- شروع بازی جدید: با دریافت status غیرپایانی (running/playing/...) state نتایج ریست می‌شود تا تریگر بعدی کار کند.

### نکات کلیدی
- احراز هویت در همهٔ اندپوینت‌ها به صورت Bearer token انجام می‌شود؛ در room-results اختیاری است تا UI همیشه پاسخ بگیرد.
- جدول برندگان: `public.results` شامل `win_type` (line/full)، `reward_amount`، `room_id`، `user_id`, `ticket_id`.
- آواتار: اگر `avatar_url` در `user_profiles` نباشد و `metadata.avatar_id` موجود باشد، باید به آواتار داخلی نگاشت شود (نگاشت فعلاً در فرانت انجام می‌شود).
