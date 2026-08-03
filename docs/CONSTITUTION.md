# The Ding Platform Constitution

## Architecture, Engineering & Operational Principles

**Version:** 1.0  
**Status:** Living Document  
**Authority:** Highest Engineering Guideline  
**Location:** `docs/CONSTITUTION.md`

---

# Foreword

Ding Platform یک محصول نیست.

یک بازی نیست.

یک وب‌سایت نیست.

Ding یک **Platform** برای اجرای موتورهای مستقل بازی، مدیریت اقتصاد آن‌ها و ایجاد یک زیرساخت مقیاس‌پذیر برای بازی‌های آنلاین است.

این سند توضیح نمی‌دهد پروژه امروز چگونه کار می‌کند.

این سند مشخص می‌کند پروژه **حق دارد چگونه تکامل پیدا کند.**

اگر میان این سند و هر تصمیم فنی تضادی وجود داشته باشد، این سند مرجع تصمیم‌گیری خواهد بود.

---

# Chapter 1 — The Mission

ماموریت Ding ساده است:

ساخت امن‌ترین، شفاف‌ترین و توسعه‌پذیرترین Platform بازی.

هر تصمیم باید حداقل یکی از این سه ویژگی را بهبود دهد:

* امنیت
* توسعه‌پذیری
* سادگی

اگر هیچ‌کدام را بهتر نمی‌کند، احتمالاً نباید انجام شود.

---

# Chapter 2 — The Platform Philosophy

Ding هرگز نباید حول یک بازی ساخته شود.

امروز:

* Bingo

فردا:

* Backgammon
* Poker
* Roulette
* Slots
* Crash

و شاید ده‌ها Engine دیگر.

بنابراین هیچ بخشی از سیستم نباید فرض کند Bingo تنها بازی موجود است.

---

# Chapter 3 — Platform Layers

Platform از چهار لایه تشکیل شده است.

## Layer 1 — Presentation

```
Web
Admin
Future Mobile
```

هیچ تصمیم بازی در این لایه گرفته نمی‌شود.

## Layer 2 — Game Engines

```
Bingo Engine
Backgammon Engine
Poker Engine
...
```

تمام قوانین بازی فقط اینجا زندگی می‌کنند.

## Layer 3 — Platform Services

* Wallet
* Settlement
* Commission
* Identity
* Notifications
* Scheduling
* Audit

## Layer 4 — Infrastructure

* Database
* Railway
* Supabase
* Storage
* Monitoring
* Deployment

---

# Chapter 4 — Engine Constitution

هر Engine باید بتواند مستقل زندگی کند.

حداقل قابلیت‌ها:

```
start()
shutdown()
health()
claimRoom()
releaseRoom()
processGame()
settle()
publishEvents()
```

هیچ Engine نباید از Engine دیگر Import بگیرد.

Canonical contract documentation: `packages/game-contracts/ENGINE_CONTRACT.md` and `docs/architecture/p4-3-engine-contract.md`.

---

# Chapter 5 — Engine Independence

اگر اضافه کردن یک Engine جدید باعث تغییر Engine قبلی شود،

معماری شکست خورده است.

هر Engine:

* Build مستقل
* Deploy مستقل
* Test مستقل
* Scale مستقل
* Monitoring مستقل

خواهد داشت.

---

# Chapter 6 — Database Constitution

Database حقیقت نهایی سیستم است.

Engine تصمیم می‌گیرد.

Database ثبت می‌کند.

هیچ وضعیت مالی نباید فقط داخل حافظه Engine وجود داشته باشد.

---

# Chapter 7 — Derived Data

داده‌های مشتق‌شده حقیقت نیستند.

مثل:

* masks
* indexes
* snapshots
* cache
* projections

این داده‌ها باید همیشه از Source of Truth قابل بازسازی باشند.

حادثه‌ی `card_definition_masks` و `card_number_index` باید به‌عنوان یک درس معماری ثبت شود: هر داده مشتق‌شده باید یا به‌صورت خودکار بازسازی شود یا مکانیزم اعتبارسنجی داشته باشد.

---

# Chapter 8 — Financial Constitution

Wallet قلب سیستم است.

هیچ تغییر موجودی بدون:

* Transaction
* Ledger
* Audit Trail

مجاز نیست.

تمام عملیات مالی باید:

* Atomic
* Idempotent
* Recoverable

باشند.

---

# Chapter 9 — Security Constitution

امنیت یک پروژه نیست.

امنیت یک فرآیند دائمی است.

اصول:

* Least Privilege
* Service Role فقط هنگام نیاز
* PUBLIC آخرین انتخاب
* هیچ Function حساس بدون بررسی Authorization
* ACLها باید به‌طور مستمر Audit شوند

---

# Chapter 10 — Repository Constitution

ساختار دائمی:

```
apps/
packages/
infrastructure/
tools/
docs/
```

هر پوشه فقط یک مسئولیت دارد.

---

# Chapter 11 — Shared Package Constitution

هیچ Package مشترکی صرفاً به خاطر «شباهت» ساخته نمی‌شود.

قانون:

1. اولین استفاده → داخل پروژه
2. دومین استفاده → بررسی
3. سومین استفاده → استخراج

---

# Chapter 12 — Refactoring Constitution

هر Refactor باید این مسیر را طی کند:

```
Audit
  ↓
Plan
  ↓
Implementation
  ↓
Validation
  ↓
Manual Test
  ↓
Commit
```

هیچ Refactor نباید رفتار سیستم را تغییر دهد مگر اینکه هدف آن تغییر رفتار باشد.

---

# Chapter 13 — Deployment Constitution

هر Engine یک Service مستقل Railway است.

هر Service مستقلاً دارای:

* Health
* Logs
* Metrics
* Restart
* Version

است.

---

# Chapter 14 — Observability

اگر چیزی قابل مشاهده نباشد،

قابل اعتماد نیست.

حداقل:

* Health
* Metrics
* Structured Logs
* Audit Events
* Tracing

---

# Chapter 15 — Documentation

Documentation بخشی از محصول است.

هر تغییر معماری باید شامل:

* Why
* What
* Validation
* Rollback

باشد.

---

# Chapter 16 — AI Engineering

AI عضوی از تیم توسعه است، نه جایگزین تیم.

هر پیشنهاد AI باید:

* قابل بازبینی باشد
* قابل تست باشد
* مستند باشد

هیچ تغییری فقط به دلیل پیشنهاد AI پذیرفته نمی‌شود.

---

# Chapter 17 — Operational Rules

قبل از هر Commit:

```
Build
  ↓
Tests
  ↓
Manual Smoke
  ↓
Review
  ↓
Push
```

---

# Chapter 18 — Long-Term Vision

هدف Ding تنها ساخت یک محصول نیست.

هدف ساخت یک زیرساخت است که بتواند:

* ده‌ها بازی
* میلیون‌ها تراکنش
* تیم‌های توسعه متعدد
* سرویس‌های مستقل

را بدون بازطراحی معماری پشتیبانی کند.

---

# The Engineering Oath

هر توسعه‌دهنده‌ای که روی Ding کار می‌کند، متعهد می‌شود:

* امنیت را فدای سرعت نکند
* سادگی را فدای پیچیدگی بی‌دلیل نکند
* مستندسازی را بخشی از توسعه بداند
* Platform را مهم‌تر از یک Feature ببیند
* آینده پروژه را مهم‌تر از راحتی امروز بداند

---

# Final Principle

> **هر تصمیم مهندسی باید بتواند به این سؤال پاسخ دهد:**
>
> **«آیا این تصمیم، Ding Platform را برای پنج سال آینده ساده‌تر، امن‌تر، پایدارتر و توسعه‌پذیرتر می‌کند؟»**

اگر پاسخ این سؤال **«نه»** باشد، آن تصمیم نباید وارد پروژه شود.
