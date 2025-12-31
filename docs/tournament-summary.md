# Tournament Flow — وضعیت موجود و تصمیم‌ها

## مفروضات کلیدی
- گارانتی: نیاز به hold/capture از کیف پول پلتفرم نیست (ادمین موجودی نامحدود).
- جریان مالی تورنومنت مستقل از روم‌های بازی است؛ روم‌های راند فقط برای اجرای بازی و تراکنش‌های فعلی‌شان پذیرفته می‌شود.
- Prize plan از ابتدا توسط ادمین در `tournament_prize_rules` ثبت می‌شود؛ تسویه نهایی بر مبنای همین جدول.
- اندازه میزها و min/max بلیت در `tournaments` تنظیم می‌شود.
- ادمین کمیسیون: همان ادمین کل (پیش‌فرض `fn_pick_admin_user`).
- محیط: همین دیتابیس.
- محدودیت ظرفیت روم‌های بازی: در فانکشن فعلی `fn_join_or_create_room` از `max_players` استفاده نمی‌شود و تنها `min_players`, `countdown_sec`, `max_cards_per_player` اعمال می‌شوند؛ پس شروع روم به ظرفیت سقف وابسته نیست مگر توسعه‌ی بعدی.

## ساختار داده/فانکشن‌های کلیدی موجود
- ثبت‌نام و هولد:
  - `tournament.tournament_entry_buy`: ایجاد/افزایش entry، hold کیف پول (`join_hold`)، افزایش `locked_amount`، ثبت lock در `tournament.tournament_locks`، snapshot کمیسیون در `tournament.tournament_commission_snapshots`.
  - `tournament.tournament_entry_cancel`: release hold تا قبل از بستن ثبت‌نام.
  - `tournament.fn_calc_commission`: نرخ از meta.tournaments، agent/super از `vw_player_commission`.
- تسویه تورنومنت:
  - `tournament.tournament_finalize`: در status=`settling`, capture همه holds (کم کردن `locked_amount` و ثبت `join_capture`)، پرداخت کمیسیون‌های pending، پرداخت `tournament_payouts` (pending→paid)، افزودن `guaranteed_prize` به total_pool داخلی، پایان: status=`finished`.
- برگزاری بازی:
  - روم‌های واقعی با قیمت حداقلی ساخته می‌شوند (تراکنش واقعی پذیرفته می‌شود). نتایج راندها باید خوانده و به فینال منجر شود.
- Locked amount:
  - فیلد `wallets.locked_amount` تجمیعی است و منبع را نشان نمی‌دهد؛ برای تورنومنت جزئیات در `tournament.tournament_locks` نگه داشته می‌شود.

## فلو پیشنهادی (MVP بدون تغییر کد/DB)
1) **ایجاد تورنومنت**: ادمین رکورد `tournaments` (status draft→registration_open) + `tournament_prize_rules` (rank/percent|fixed) + پارامترهای table_size/min/max tickets.
2) **ثبت‌نام**: کلاینت/سرور از `tournament_entry_buy` استفاده می‌کند؛ هولد و snapshot کمیسیون انجام می‌شود. لغو با `tournament_entry_cancel`.
3) **بستن ثبت‌نام و شروع راند 1**: تغییر status به running؛ برَکِتینگ بر اساس table_size_*؛ ساخت روم‌های راند با قیمت حداقلی؛ ذخیره در `tournament_round_rooms` و `tournament_round_assignments`.
4) **چرخه راندها**: جمع‌آوری نتایج روم‌ها، صعود و ساخت راند بعد تا فینال.
5) **فینال و خروجی رتبه**: نتایج فینال → پر کردن `tournament.tournament_payouts` بر اساس `tournament_prize_rules`.
6) **تسویه**: status=`settling` → `tournament_finalize` → capture holds، پرداخت کمیسیون‌ها، پرداخت جوایز، status=`finished`.
7) **فرانت**: لیست/وضعیت از جداول tournament_*؛ لینک روم‌های هر راند از `tournament_round_rooms.room_id`.

## کارهای بعدی (نیاز به توسعه، نه اجرای فعلی)
- فانکشن/سرویس orchestration برای برَکِتینگ، ساخت راندها، خواندن نتایج روم‌ها و تولید `tournament_payouts` از `tournament_prize_rules`.
- API/UI برای نمایش تورنومنت‌ها، ثبت‌نام، وضعیت راندها و ورود به روم‌های راند.
- (اختیاری) بهبود گارانتی با قفل واقعی در آینده؛ (اختیاری) مدیریت/ریفاند کمیسیون روم‌های حداقلی در فاز بعد.

