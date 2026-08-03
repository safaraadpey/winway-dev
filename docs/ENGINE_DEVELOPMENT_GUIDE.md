# ENGINE_DEVELOPMENT_GUIDE.md

## Ding Platform — Engine Development Standard

**Version:** 1.0  
**Status:** Living Document  
**Authority:** Required for every new and existing Game Engine  
**Location:** `docs/ENGINE_DEVELOPMENT_GUIDE.md`

> **«اگر فردا بخواهم یک موتور بازی جدید بنویسم، دقیقاً چه چیزهایی باید مشترک باشند و چه چیزهایی باید فقط داخل همان Engine بمانند؟»**

این سند Architecture نیست و SDK نیست.  
این سند **استاندارد توسعه** تمام Engineهای Ding است.

هیچ Engine جدید نباید بدون رعایت این سند ایجاد شود.

مرجع بالاتر: [`docs/CONSTITUTION.md`](./CONSTITUTION.md)  
قرارداد lifecycle: [`packages/game-contracts/ENGINE_CONTRACT.md`](../packages/game-contracts/ENGINE_CONTRACT.md)

---

## 1. هدف

تعیین مرز قطعی میان:

* آنچه **Platform** مالک آن است و بین همه Engineها مشترک می‌ماند
* آنچه فقط داخل **یک Engine** زندگی می‌کند و حق نشت به Platform یا Engine دیگر را ندارد

هر Engine جدید (Backgammon، Poker، …) باید قبل از اولین Commit، این مرزها را پاس کند.

---

## 2. Shared vs Engine-specific

### همیشه مشترک (Platform)

* Authentication
* Users
* Wallet
* Ledger
* Settlement
* Commission
* Referral
* Notifications
* Audit
* Scheduler (platform-level)
* Monitoring
* Health (probe contract / identity pattern)
* Metrics
* Logging

### همیشه داخل Engine

* قوانین بازی
* State Machine
* Winner Detection
* RNG
* Turn Logic
* AI
* Match Flow
* Validation (قوانین بازی)
* Scoring

---

## 3. Database Ownership

### Platform

```text
users
wallets
transactions
ledger
commissions
```

(و جداول/RPCهای هویت، ارجاع، و مالی مرتبط)

### Engine

```text
rooms
moves
boards
cards
draws
game_state
```

(و هر جدول/RPC اختصاصی قوانین همان بازی)

**قانون:** Engine تصمیم بازی را می‌گیرد؛ Database حقیقت را ثبت می‌کند. وضعیت مالی فقط در حافظه Engine مجاز نیست.

---

## 4. Engine Lifecycle

هر Engine باید قابلیت‌های lifecycle توافق‌شده Platform را پیاده کند (حداقل منطقی):

```text
createRoom()
claimRoom()
initialize()
run()
finish()
settle()
archive()
```

و همچنین قرارداد پایه:

```text
start()
shutdown()
health()
claimRoom()
releaseRoom()
processGame()
settle()
publishEvents()
```

نام توابع در کد ممکن است متفاوت باشد؛ **معنا و مرز مسئولیت** نباید نقض شود.

هیچ Engine نباید از Engine دیگر Import بگیرد.

---

## 5. Engine Inputs

Engine فقط این داده‌ها را دریافت می‌کند:

```text
Room
Players
Configuration
Current State
Events
```

نه بیشتر.

به‌ویژه نباید به‌عنوان ورودی «مجوز مالی» یا «تغییر موجودی» بگیرد؛ فقط درخواست settlement از طریق Contract Platform.

---

## 6. Engine Outputs

Engine فقط این Eventها را تولید می‌کند (یا معادل معنایی آن‌ها):

```text
GameStarted
MoveAccepted
RoundFinished
WinnerDetected
SettlementRequested
GameFinished
```

Eventها Source of Truth نیستند؛ برای UI و orchestration هستند و باید از Snapshot قابل بازیابی باشند.

---

## 7. ممنوعیت‌ها

Engine حق ندارد:

* ❌ Wallet را مستقیم تغییر دهد
* ❌ Referral را تغییر دهد
* ❌ User را تغییر دهد
* ❌ Commission را محاسبه/توزیع کند
* ❌ Authentication انجام دهد
* ❌ از Engine دیگر Import بگیرد
* ❌ Ledger را دور بزند

---

## 8. Platform Responsibilities

Platform مسئول است:

* Wallet
* Settlement
* Commission
* Tournament (زیرساخت تورنومنت مشترک؛ قوانین اختصاصی بازی در Engine)
* Payments
* Reporting
* Identity / Auth
* Audit Trail

---

## 9. Engine Responsibilities

Engine مسئول است:

* قوانین بازی
* تشخیص برنده
* اجرای بازی (match / room / turn flow)
* تولید Event
* Derived data اختصاصی بازی (با قوانین فصل ۱۰)

---

## 10. Derived Data

اگر Engine داده مشتق‌شده تولید می‌کند:

* cache
* masks
* indexes
* projections
* snapshots

باید برای آن‌ها:

* **rebuild**
* **validate**
* **backfill**

داشته باشد.

این بند دقیقاً از تجربه Bingo (`card_definition_masks` / `card_number_index`) آمده است: داده مشتق‌شده حقیقت نیست و باید از Source of Truth قابل بازسازی باشد.

---

## 11. Performance Rules

Engine باید رعایت کند:

* عملیات پرتکرار: O(1) یا نزدیک به آن
* Cache فقط برای Performance — نه به‌عنوان حقیقت
* Database حقیقت نهایی است
* Realtime فقط اطلاع‌رسانی است؛ تصمیم مالی/نهایی از Snapshot/DB

---

## 12. Security Rules

Engine:

* هیچ `EXECUTE` عمومی / ACL شل برای Functionهای حساس ایجاد نمی‌کند
* فقط از Contract Platform برای مسیرهای مالی استفاده می‌کند
* هیچ مسیر مالی مستقیمی (بدون Ledger/Audit) ندارد
* Least Privilege را رعایت می‌کند

---

## 13. Testing Checklist

قبل از Merge هر Engine:

* [ ] Unit
* [ ] Integration
* [ ] Manual Smoke
* [ ] Stress (hot path)
* [ ] Recovery (crash / restart / lease loss)

---

## 14. New Engine Checklist

وقتی Engine جدیدی (مثلاً Backgammon) اضافه می‌شود:

* [ ] پوشه Engine تحت `apps/engines/<name>/` ساخته شود
* [ ] `health()` فعال و هویت سرویس مشخص باشد
* [ ] `claimRoom` / `releaseRoom` پیاده شود
* [ ] Settlement فقط از Platform استفاده کند
* [ ] Wallet داخل Engine تغییر نکند
* [ ] Derived data دارای rebuild/validate باشد (در صورت وجود)
* [ ] Build / Test / Deploy مستقل
* [ ] تست کامل طبق فصل ۱۳
* [ ] مستند Why / What / Validation / Rollback

---

## 15. Code Ownership

```text
Platform Owner
      ↓
Engine Owner
      ↓
Feature Owner
```

تغییرات مالی/هویت → Platform Owner  
تغییرات قوانین بازی → Engine Owner  
Feature داخل یک Engine → Feature Owner با تأیید Engine Owner

---

## Related Documents

| Document | Role |
|----------|------|
| [`docs/CONSTITUTION.md`](./CONSTITUTION.md) | Highest platform principles |
| [`packages/game-contracts/ENGINE_CONTRACT.md`](../packages/game-contracts/ENGINE_CONTRACT.md) | Lifecycle contract |
| [`docs/architecture/p4-3-engine-boundaries.md`](./architecture/p4-3-engine-boundaries.md) | Bingo-specific vs shared inventory |
| [`docs/architecture/p4-4-shared-contracts-plan.md`](./architecture/p4-4-shared-contracts-plan.md) | Shared package extraction rules |
