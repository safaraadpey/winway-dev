# گزارش دارایی پلیرها و موجودی دینگ

- **تاریخ تهیه:** 2026-08-12 (ساعت تهران)
- **منبع:** PostgreSQL (`public.users`, `public.wallets`, `public.ding_balances`, `public.player_affiliation`)
- **محدوده:** همه کاربران با نقش `player`
- **مرتب‌سازی جدول اصلی:** بر اساس موجودی دینگ (نزولی)

## خلاصه کل

| شاخص | مقدار |
|------|------:|
| تعداد پلیر | 65 |
| مجموع موجودی کیف‌پول (wallet) | 359,497,784 |
| مجموع قفل کیف‌پول (locked) | 228,366 |
| مجموع موجودی دینگ | 408,591 |
| مجموع دینگ قفل‌شده | 0 |

## خلاصه بر اساس ایجنت / والد بالادستی (`parent_id`)

| بالادستی | نقش | تعداد پلیر | مجموع wallet | مجموع دینگ |
|----------|------|----------:|-------------:|-----------:|
| adminzero | admin | 44 | 245,134,948 | 398,715 |
| majid | super | 10 | 53,013,243 | 8,304 |
| ramram1414 | agent | 10 | 57,178,563 | 974 |
| agent002 | agent | 1 | 4,171,030 | 598 |

## جزئیات پلیرها

ستون‌ها:

- **والد:** از `users.parent_id`
- **ایجنت / سوپر (affiliation):** از `player_affiliation` (در صورت وجود)

| # | یوزرنیم | نیک‌نیم | وضعیت | موجودی دینگ | دینگ قفل | موجودی wallet | wallet قفل | والد (نقش) | ایجنت | سوپر | تاریخ ساخت |
|--:|---------|---------|--------|------------:|---------:|--------------:|-----------:|------------|-------|------|------------|
| 1 | sasan13 | — | active | 68,660 | 0 | 14,091,229 | 0 | adminzero (admin) | — | — | 2026-08-05 22:06 |
| 2 | alisantal | — | active | 42,275 | 0 | 5,045,525 | 0 | adminzero (admin) | — | — | 2026-08-05 22:12 |
| 3 | vahid1 | — | active | 38,442 | 0 | 7,065,675 | 0 | adminzero (admin) | — | — | 2026-08-05 22:11 |
| 4 | pouya1 | — | active | 31,928 | 0 | 4,614,700 | 0 | adminzero (admin) | — | — | 2026-08-05 22:07 |
| 5 | sajad84 | — | active | 30,775 | 0 | 8,388,650 | 0 | adminzero (admin) | — | — | 2026-08-05 22:11 |
| 6 | hamed2539 | Masoomi | active | 26,935 | 0 | 6,051,525 | 0 | adminzero (admin) | — | — | 2026-08-05 23:42 |
| 7 | reza133 | — | active | 26,099 | 0 | 4,510,300 | 0 | adminzero (admin) | — | — | 2026-08-07 01:04 |
| 8 | mehdi1 | — | active | 19,290 | 0 | 30,100 | 0 | adminzero (admin) | — | — | 2026-08-07 01:06 |
| 9 | david83 | — | active | 17,766 | 0 | 21,370,500 | 0 | adminzero (admin) | — | — | 2026-08-07 02:42 |
| 10 | saeed777 | — | active | 16,416 | 0 | 1,092,000 | 0 | adminzero (admin) | — | — | 2026-08-05 22:08 |
| 11 | elyas4 | Elyas4 | active | 14,489 | 0 | 8,132,500 | 0 | adminzero (admin) | — | — | 2026-08-07 22:24 |
| 12 | ali642 | — | active | 11,323 | 0 | 14,223,400 | 0 | adminzero (admin) | — | — | 2026-08-05 23:51 |
| 13 | afshin12 | — | active | 7,658 | 0 | 16,825,850 | 0 | adminzero (admin) | — | — | 2026-08-05 22:12 |
| 14 | yazdan4 | نااانااای کنیم | active | 6,974 | 0 | 127,300 | 0 | adminzero (admin) | — | — | 2026-08-07 22:26 |
| 15 | t001 | — | active | 6,584 | 0 | 6,231,586 | 50,000 | adminzero (admin) | — | — | 2026-07-31 08:59 |
| 16 | ani12 | — | active | 5,144 | 0 | 5,124,200 | 0 | adminzero (admin) | — | — | 2026-08-07 15:09 |
| 17 | ayhan_1396 | AYHAN_1396_666 | active | 4,544 | 0 | 3,866,000 | 0 | adminzero (admin) | — | — | 2026-08-07 16:50 |
| 18 | demo003 | — | active | 3,886 | 0 | 11,904,700 | 0 | adminzero (admin) | — | — | 2026-08-06 23:46 |
| 19 | saman222 | — | active | 3,678 | 0 | 4,431,800 | 0 | adminzero (admin) | — | — | 2026-08-08 01:05 |
| 20 | t003 | — | active | 2,731 | 0 | 6,150,207 | 45,000 | adminzero (admin) | — | — | 2026-07-31 09:00 |
| 21 | shahriyar1 | — | active | 2,513 | 0 | 5,469,900 | 0 | adminzero (admin) | — | — | 2026-08-06 23:59 |
| 22 | hafez12 | — | active | 2,412 | 0 | 72,500 | 0 | adminzero (admin) | — | — | 2026-08-09 00:21 |
| 23 | parsa7 | — | active | 2,219 | 0 | 5,003,450 | 0 | adminzero (admin) | — | — | 2026-08-05 22:08 |
| 24 | babak | — | active | 1,966 | 0 | 5,482,541 | 0 | adminzero (admin) | — | — | 2026-07-20 23:38 |
| 25 | salvador | — | active | 1,890 | 0 | 5,825,550 | 25,000 | adminzero (admin) | — | — | 2026-07-20 23:38 |
| 26 | t002 | — | active | 1,558 | 0 | 6,886,000 | 30,000 | adminzero (admin) | — | — | 2026-07-31 08:59 |
| 27 | hamburg | Cartel | active | 1,423 | 0 | 5,000,563 | 0 | majid (super) | — | majid | 2026-07-20 23:38 |
| 28 | toronto | — | active | 1,063 | 0 | 5,210,838 | 0 | majid (super) | — | majid | 2026-07-20 23:38 |
| 29 | los_angeles | — | active | 993 | 0 | 5,651,488 | 0 | majid (super) | — | majid | 2026-07-20 23:38 |
| 30 | amirsha | — | active | 959 | 0 | 5,126,013 | 0 | majid (super) | — | majid | 2026-07-20 23:38 |
| 31 | tokyo | — | active | 954 | 0 | 5,000,000 | 0 | majid (super) | — | majid | 2026-07-20 23:38 |
| 32 | paris | — | active | 873 | 0 | 5,245,151 | 0 | majid (super) | — | majid | 2026-07-20 23:38 |
| 33 | makhmal | — | active | 818 | 0 | 5,818,489 | 0 | majid (super) | — | majid | 2026-07-20 23:38 |
| 34 | mho2305 | — | active | 634 | 0 | 5,307,676 | 0 | majid (super) | — | majid | 2026-07-20 23:38 |
| 35 | t004 | — | active | 598 | 0 | 4,171,030 | 78,366 | agent002 (agent) | agent002 | agent001 | 2026-07-31 19:18 |
| 36 | par_par | — | active | 353 | 0 | 5,553,025 | 0 | majid (super) | — | majid | 2026-07-20 23:38 |
| 37 | demo030 | — | active | 237 | 0 | 5,941,700 | 0 | adminzero (admin) | — | — | 2026-07-21 03:19 |
| 38 | abol5073 | — | active | 234 | 0 | 5,100,000 | 0 | majid (super) | — | majid | 2026-07-20 23:38 |
| 39 | mahin1363 | — | active | 217 | 0 | 8,488,563 | 0 | ramram1414 (agent) | ramram1414 | — | 2026-07-20 23:38 |
| 40 | 141 | — | active | 180 | 0 | 5,700,000 | 0 | ramram1414 (agent) | ramram1414 | — | 2026-07-20 23:38 |
| 41 | mmatest | — | active | 160 | 0 | 5,552,060 | 0 | adminzero (admin) | — | — | 2026-08-04 23:27 |
| 42 | mohammad | — | active | 118 | 0 | 5,500,000 | 0 | ramram1414 (agent) | ramram1414 | — | 2026-07-20 23:38 |
| 43 | ramtin1366 | — | active | 112 | 0 | 5,500,000 | 0 | ramram1414 (agent) | ramram1414 | — | 2026-07-20 23:38 |
| 44 | player003 | — | active | 111 | 0 | 5,000,000 | 0 | adminzero (admin) | — | — | 2026-07-20 23:38 |
| 45 | mahla1380 | — | active | 109 | 0 | 5,500,000 | 0 | ramram1414 (agent) | ramram1414 | — | 2026-07-20 23:38 |
| 46 | ahmad | — | active | 105 | 0 | 5,500,000 | 0 | ramram1414 (agent) | ramram1414 | — | 2026-07-20 23:38 |
| 47 | alim9756 | — | active | 76 | 0 | 5,490,000 | 0 | ramram1414 (agent) | ramram1414 | — | 2026-07-20 23:38 |
| 48 | hatef69 | — | active | 57 | 0 | 5,500,000 | 0 | ramram1414 (agent) | ramram1414 | — | 2026-07-20 23:38 |
| 49 | deep | — | active | 52 | 0 | 5,500,000 | 0 | adminzero (admin) | — | — | 2026-07-20 23:38 |
| 50 | advinpor70 | — | active | 0 | 0 | 5,000,000 | 0 | adminzero (admin) | — | — | 2026-08-07 20:25 |
| 51 | afshin | — | active | 0 | 0 | 5,000,000 | 0 | adminzero (admin) | — | — | 2026-08-05 22:07 |
| 52 | demo009 | — | active | 0 | 0 | 0 | 0 | adminzero (admin) | — | — | 2026-08-07 17:25 |
| 53 | demoplayer002 | — | active | 0 | 0 | 5,000,000 | 0 | adminzero (admin) | — | — | 2026-07-20 23:38 |
| 54 | fardigsm556 | — | active | 0 | 0 | 5,000,000 | 0 | adminzero (admin) | — | — | 2026-07-20 23:38 |
| 55 | hosien2 | — | active | 0 | 0 | 0 | 0 | adminzero (admin) | — | — | 2026-08-08 20:01 |
| 56 | javadhaghi | — | active | 0 | 0 | 0 | 0 | adminzero (admin) | — | — | 2026-08-08 21:01 |
| 57 | mahla_md | — | active | 0 | 0 | 5,000,000 | 0 | ramram1414 (agent) | ramram1414 | — | 2026-07-20 23:38 |
| 58 | nazlyrashid | Nazil | active | 0 | 0 | 0 | 0 | adminzero (admin) | — | — | 2026-08-07 21:38 |
| 59 | qazaleh0901 | — | active | 0 | 0 | 0 | 0 | adminzero (admin) | — | — | 2026-08-08 00:43 |
| 60 | ramin5772 | — | active | 0 | 0 | 5,000,000 | 0 | ramram1414 (agent) | ramram1414 | — | 2026-07-20 23:38 |
| 61 | sadra11 | — | active | 0 | 0 | 5,000,000 | 0 | adminzero (admin) | — | — | 2026-08-08 00:02 |
| 62 | saleh13 | — | active | 0 | 0 | 5,000,000 | 0 | adminzero (admin) | — | — | 2026-07-20 23:38 |
| 63 | sorena13 | — | active | 0 | 0 | 5,000,000 | 0 | adminzero (admin) | — | — | 2026-07-20 23:38 |
| 64 | t006 | — | active | 0 | 0 | 0 | 0 | adminzero (admin) | — | — | 2026-08-11 19:48 |
| 65 | test | — | active | 0 | 0 | 10,123,500 | 0 | adminzero (admin) | — | — | 2026-07-21 03:58 |

## نکات

1. بیشتر پلیرها والد مستقیم‌شان `adminzero` است و رکورد `player_affiliation` ندارند.
2. پلیرهای زیر `majid` در affiliation فقط `super_id` دارند (بدون agent).
3. پلیرهای زیر `ramram1414` ایجنت‌شان همان `ramram1414` است.
4. فقط `t004` هم‌زمان agent (`agent002`) و super (`agent001`) در affiliation دارد.
5. موجودی wallet و دینگ از جداول snapshot خوانده شده‌اند؛ این گزارش لحظه‌ای است نه audit مالی کامل.
