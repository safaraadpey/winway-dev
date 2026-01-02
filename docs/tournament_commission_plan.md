# طرح پیاده‌سازی منطق مالی و کمیسیون تورنومنت

## 1) جداول پیشنهادی
### tournament_commission_snapshots
- `id uuid pk default gen_random_uuid()`
- `tournament_id uuid not null`
- `entry_id uuid not null` (ارجاع به `tournament_entries.id`)
- `user_id uuid not null` (صاحب entry)
- `agent_id uuid null`
- `super_id uuid null`
- `admin_id uuid null`
- `gross_amount numeric` (مبلغ کل خرید/ورودی)
- `commission_rate numeric`
- `commission_base numeric`
- `agent_rate numeric`
- `super_rate numeric`
- `agent_amount numeric`
- `super_amount numeric`
- `admin_amount numeric`
- `amount_to_pool numeric`
- `currency text`
- `commission_model text` (اختیاری، برای اشاره به مدل)
- `created_at timestamptz default now()`
- ایندکس یکتا `(tournament_id, entry_id)`

### tournament_commission_payouts
- `id uuid pk default gen_random_uuid()`
- `tournament_id uuid not null`
- `entry_id uuid not null`
- `beneficiary_user_id uuid not null`
- `role text not null` (agent/super/admin/pool)
- `amount numeric not null`
- `currency text`
- `status text default 'pending'`
- `meta jsonb`
- `created_at timestamptz default now()`
- `paid_at timestamptz`
- ایندکس `(tournament_id, entry_id, beneficiary_user_id, role)`

### ستون‌های تنظیمات در tournaments
- `commission_rate numeric`
- `commission_amounts jsonb` (در صورت نیاز) و `commission_model text`

## 2) توابع مالی
- موجود: `fn_tournament_wallet_hold` و `fn_tournament_wallet_release`.
- نیاز جدید: `tournament.fn_wallet_capture_join(p_tournament_id, p_entry_id, p_amount, p_currency)`  
  - کاهش locked_amount  
  - درج تراکنش `join_capture` با `source_kind='tournament_join'`, `source_ref=tournament_id`, meta شامل entry_id  
  - wrapper در `public` برای rpc

## 3) توابع کمیسیون
- `tournament.fn_commission_snapshot(tournament_id, entry_id)`  
  - خواندن entry و تنظیمات کمیسیون؛ محاسبه سهم‌ها (agent/super/admin/pool)  
  - درج در `tournament_commission_snapshots` با مقادیر ستونی (نه JSONB)
- `tournament.fn_commission_payout(tournament_id, entry_id)`  
  - از snapshot خوانده و رکوردهای `tournament_commission_payouts` با `status='pending'` درج می‌کند (role‌ها جدا)
- اختیاری: `tournament.fn_commission_set_paid(payout_id)` برای settlement

## 4) توالی اجرای شروع تورنومنت (orchestrator)
برای هر entry با `status='created'`:
1. `fn_tournament_wallet_capture_join(...)`
2. `tournament.fn_commission_snapshot(...)`
3. `tournament.fn_commission_payout(...)`
4. (اختیاری) به‌روزرسانی status entry به «locked» برای جلوگیری از تکرار

## 5) استخر جایزه
- سهم pool به‌صورت payout با role='pool' ثبت شود؛ در settlement نهایی پرداخت یا مصرف شود.

## 6) فرانت
- تغییری نیاز نیست؛ هولد/ریلِز هم‌اکنون انجام می‌شود؛ capture/کمیسیون توسط سرور در شروع تورنومنت اجرا شود.

## 7) چرا جدا از commissions_log روم؟
- `commissions_log` ستون tournament_id ندارد و روی ticket/room است.  
- نگه‌داشتن جداول اختصاصی تورنومنت حسابرسی را ساده می‌کند و منطق روم دست‌نخورده می‌ماند.

## 8) نکته مقیاس کمیسیون
- در room_templates مقادیر `commission_rate` به‌صورت درصد (0..100) ذخیره شده است. برای تورنومنت نیز همین مقیاس را رعایت کنید.


