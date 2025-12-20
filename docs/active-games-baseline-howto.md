### Active Games — Baseline (Dev) ثبت متریک‌ها (۲۰ ثانیه)

این راهنما فقط برای **Dev Metrics** است و نباید رفتار سیستم را تغییر دهد.

---

## پیش‌نیاز
- اپ را در حالت dev اجرا کنید.
- Console مرورگر را باز کنید.
- در اولین mount، باید لاگ نصب helperها را ببینید:
  - `[ActiveGames][Metrics] window helpers installed ...`

---

## سناریو baseline (۲۰ ثانیه)
1) به یکی از صفحات `/player/*` بروید (مثلاً `/player/home`).
2) **۲۰ ثانیه** بدون توقف صبر کنید.
3) در این مدت بین **۲ تا ۳ route** زیر `/player` جابه‌جا شوید (مثلاً `home → lobby → wallet`).
4) یک **refresh** انجام دهید و دوباره وارد `/player/*` شوید.

---

## گرفتن snapshot قابل کپی
در console این را اجرا کنید:
- `window.__activeGamesMetricsPrint("baseline-20s")`
- اگر Phase C فعال است، snapshot orchestrator را هم بگیرید:
  - `window.__activeGamesOrchestratorMetricsPrint("baseline-20s")`

یا برای گرفتن object خام:
- `window.__activeGamesMetrics()`

برای صفر کردن شمارنده‌ها قبل از شروع سناریو:
- `window.__activeGamesMetricsReset()`
- (اختیاری) `window.__activeGamesOrchestratorMetricsReset()`


