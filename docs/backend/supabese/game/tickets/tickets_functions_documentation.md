# مستندات Function‌های مرتبط با جدول `tickets`

این مستند شامل تمام Function‌ها و Trigger‌هایی است که جدول `tickets` را آپدیت می‌کنند.

**تاریخ تولید:** $(date)

---

## 📋 فهرست مطالب

1. [Trigger‌های روی جدول tickets](#triggerهای-روی-جدول-tickets)
2. [Function‌های مرتبط با tickets](#functionهای-مرتبط-با-tickets)
   - [public Schema](#public-schema)
   - [game_finance Schema](#game_finance-schema)
   - [game_ticket Schema](#game_ticket-schema)

---

## 🔔 Trigger‌های روی جدول `tickets`

| Schema | Trigger Name | Function | Timing | Event | توضیحات |
|--------|--------------|----------|--------|-------|---------|
| **public** | `trg_set_updated_at_tickets` | `set_updated_at` | BEFORE | UPDATE | به‌روزرسانی خودکار `updated_at` |
| **public** | `trg_tickets_after_paid` | `trg_tickets_after_paid` | AFTER | UPDATE | پردازش بعد از پرداخت (UPDATE) |

---

## ⚙️ Function‌های مرتبط با `tickets`

### 📦 public Schema

#### `set_updated_at()`

**نوع:** Trigger Function  
**زبان:** PL/pgSQL  
**دسترسی:** PUBLIC

**توضیحات:**  
Function عمومی برای به‌روزرسانی خودکار فیلد `updated_at` در جداول مختلف.

**کد:**

```sql
CREATE OR REPLACE FUNCTION public.set_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$function$
```

**استفاده:**  
این Function توسط Trigger `trg_set_updated_at_tickets` روی جدول `tickets` استفاده می‌شود.

---

### 💰 game_finance Schema

#### `fn_distribute_ticket_commission(p_ticket uuid)`

**نوع:** Function  
**زبان:** PL/pgSQL  
**دسترسی:** SECURITY DEFINER  
**بازگشت:** `void`

**توضیحات:**  
این Function کمیسیون بلیط را بین Agent، Super و Admin توزیع می‌کند. ابتدا رکورد کمیسیون را از `commissions_log` می‌خواند (یا با `fn_record_ticket_commission` می‌سازد)، سپس مبالغ را به کیف پول‌های مربوطه واریز می‌کند.

**پارامترها:**
- `p_ticket` (uuid): شناسه بلیط

**کد:**

```sql
CREATE OR REPLACE FUNCTION game_finance.fn_distribute_ticket_commission(p_ticket uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  c record;
  v_now timestamptz := now();
  v_wallet uuid;
  v_admin_user uuid;
BEGIN
  -- رکورد کمیسیون را بخوان (باید قبلاً توسط fn_record_ticket_commission ساخته شده باشد)
  SELECT *
    INTO c
  FROM public.commissions_log
  WHERE ticket_id = p_ticket;

  IF NOT FOUND THEN
    -- تلاش برای ثبت، اگر نبود
    PERFORM game_finance.fn_record_ticket_commission(p_ticket);
    SELECT * INTO c FROM public.commissions_log WHERE ticket_id = p_ticket;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'commission log not found for ticket %', p_ticket;
    END IF;
  END IF;

  -- اگر قبلاً واریز شده، خروج
  IF c.distributed_at IS NOT NULL THEN
    RETURN;
  END IF;

  -- (اختیاری) تعیین ادمین از کانفیگ؛ فعلاً از public.users با role='admin' یک نفر را برمی‌داریم
  SELECT u.id INTO v_admin_user
  FROM public.users u
  WHERE u.role = 'admin'
  LIMIT 1;

  -- 1) Agent
  IF c.agent_user_id IS NOT NULL AND c.agent_amount > 0 THEN
    SELECT id FROM public.wallets WHERE user_id = c.agent_user_id FOR UPDATE INTO v_wallet;
    IF v_wallet IS NOT NULL THEN
      UPDATE public.wallets
         SET balance = balance + c.agent_amount,
             updated_at = v_now
       WHERE id = v_wallet;

      INSERT INTO public.transactions(
        id, wallet_id, user_id, type, amount, currency, description, room_id, ticket_id, created_at
      )
      VALUES (
        gen_random_uuid(), v_wallet, c.agent_user_id,
        'fee_agent'::transaction_type, c.agent_amount, (SELECT currency FROM public.rooms WHERE id=c.room_id),
        'ticket commission (agent)', c.room_id, c.ticket_id, v_now
      );
    ELSE
      -- اگر کیف پول نبود، به ادمین می‌ریزد
      c.admin_amount := c.admin_amount + c.agent_amount;
    END IF;
  END IF;

  -- 2) Super
  IF c.super_user_id IS NOT NULL AND c.super_amount > 0 THEN
    SELECT id FROM public.wallets WHERE user_id = c.super_user_id FOR UPDATE INTO v_wallet;
    IF v_wallet IS NOT NULL THEN
      UPDATE public.wallets
         SET balance = balance + c.super_amount,
             updated_at = v_now
       WHERE id = v_wallet;

      INSERT INTO public.transactions(
        id, wallet_id, user_id, type, amount, currency, description, room_id, ticket_id, created_at
      )
      VALUES (
        gen_random_uuid(), v_wallet, c.super_user_id,
        'fee_super'::transaction_type, c.super_amount, (SELECT currency FROM public.rooms WHERE id=c.room_id),
        'ticket commission (super)', c.room_id, c.ticket_id, v_now
      );
    ELSE
      c.admin_amount := c.admin_amount + c.super_amount;
    END IF;
  END IF;

  -- 3) Admin (باقیمانده)
  IF c.admin_amount > 0 AND v_admin_user IS NOT NULL THEN
    SELECT id FROM public.wallets WHERE user_id = v_admin_user FOR UPDATE INTO v_wallet;
    IF v_wallet IS NOT NULL THEN
      UPDATE public.wallets
         SET balance = balance + c.admin_amount,
             updated_at = v_now
       WHERE id = v_wallet;

      INSERT INTO public.transactions(
        id, wallet_id, user_id, type, amount, currency, description, room_id, ticket_id, created_at
      )
      VALUES (
        gen_random_uuid(), v_wallet, v_admin_user,
        'fee_admin'::transaction_type, c.admin_amount, (SELECT currency FROM public.rooms WHERE id=c.room_id),
        'ticket commission (admin remainder)', c.room_id, c.ticket_id, v_now
      );
    END IF;
  END IF;

  -- علامت‌گذاری توزیع‌شدن
  UPDATE public.commissions_log
     SET distributed_at = v_now,
         admin_amount   = c.admin_amount -- درصورتی‌که رول‌آپ شد
   WHERE id = c.id;
END;
$function$
```

**جداول مرتبط:**
- `commissions_log` - خواندن و آپدیت
- `wallets` - آپدیت موجودی
- `transactions` - ثبت تراکنش‌ها
- `rooms` - خواندن ارز
- `users` - پیدا کردن ادمین

---

#### `fn_record_ticket_commission(p_ticket uuid)`

**نوع:** Function (Overloaded - دو نسخه)  
**زبان:** PL/pgSQL  
**دسترسی:** SECURITY DEFINER  
**بازگشت:** `uuid` (نسخه اول) یا `void` (نسخه دوم)

**توضیحات:**  
این Function کمیسیون بلیط را محاسبه و در `commissions_log` ثبت می‌کند. دو نسخه overloaded دارد.

**نسخه 1: با یک پارامتر**

**پارامترها:**
- `p_ticket` (uuid): شناسه بلیط

**کد:**

```sql
CREATE OR REPLACE FUNCTION game_finance.fn_record_ticket_commission(p_ticket uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_room            uuid;
  v_player          uuid;
  v_price           numeric;
  v_rate_room       numeric := 0;
  v_total_comm      numeric := 0;

  v_agent           uuid;
  v_super           uuid;
  v_agent_rate      numeric := 0;
  v_super_rate      numeric := 0;

  v_agent_amount    numeric := 0;
  v_super_amount    numeric := 0;
  v_admin_amount    numeric := 0;

  v_id              uuid;
BEGIN
  -- اگر قبلاً ثبت شده، همان id را برگردان
  SELECT id INTO v_id FROM public.commissions_log WHERE ticket_id = p_ticket;
  IF v_id IS NOT NULL THEN
    RETURN v_id;
  END IF;

  -- تیکت قطعی + قیمت/پلیر/روم
  SELECT t.room_id, t.player_user_id, t.price
    INTO v_room, v_player, v_price
  FROM public.tickets t
  WHERE t.id = p_ticket
    AND t.reservation_status = 'consumed'::reservation_status;

  IF v_room IS NULL OR v_price IS NULL THEN
    RAISE EXCEPTION 'ticket % not found or not consumed', p_ticket;
  END IF;

  -- نرخ کمیسیون روم
  SELECT COALESCE(r.commission_rate,0)
    INTO v_rate_room
  FROM public.rooms r
  WHERE r.id = v_room;

  -- وابستگی پلیر → agent/super
  SELECT pa.agent_id, pa.super_id
    INTO v_agent, v_super
  FROM public.player_affiliation pa
  WHERE pa.user_id = v_player;

  -- نرخ‌های کمیسیون ایجنت و سوپر (در صورت نبود، 0)
  IF v_agent IS NOT NULL THEN
    SELECT COALESCE(uc.agent_commission,0) INTO v_agent_rate
    FROM public.user_commissions uc WHERE uc.user_id = v_agent;
  END IF;

  IF v_super IS NOT NULL THEN
    SELECT COALESCE(uc.super_commission,0) INTO v_super_rate
    FROM public.user_commissions uc WHERE uc.user_id = v_super;
  END IF;

  -- محاسبه مبلغ‌ها (فعلاً گرد ساده: ceil به بالا برای پولِ بدون اعشار)
  v_total_comm   := CEIL(v_price * v_rate_room);
  v_agent_amount := CEIL(v_total_comm * v_agent_rate);
  v_super_amount := CEIL(v_total_comm * v_super_rate);
  v_admin_amount := GREATEST(v_total_comm - v_agent_amount - v_super_amount, 0);

  INSERT INTO public.commissions_log(
    ticket_id, room_id, player_user_id,
    price, commission_rate, total_commission,
    agent_user_id, super_user_id,
    agent_rate, super_rate,
    agent_amount, super_amount, admin_amount
  )
  VALUES (
    p_ticket, v_room, v_player,
    v_price, v_rate_room, v_total_comm,
    v_agent, v_super,
    NULLIF(v_agent_rate,0), NULLIF(v_super_rate,0),
    v_agent_amount, v_super_amount, v_admin_amount
  )
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$function$
```

**نسخه 2: با دو پارامتر**

**پارامترها:**
- `_room_id` (uuid): شناسه اتاق
- `_ticket_id` (uuid): شناسه بلیط

**کد:**

```sql
CREATE OR REPLACE FUNCTION game_finance.fn_record_ticket_commission(_room_id uuid, _ticket_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_currency text;
  v_agent uuid;
  v_super uuid;
  v_admin uuid;
  v_agent_rate numeric;
  v_super_rate numeric;
  v_commission_rate numeric;
  v_gross numeric;
  v_base numeric;
  v_agent_amount numeric;
  v_super_amount numeric;
  v_admin_amount numeric;
  v_agent_wallet uuid;
  v_super_wallet uuid;
  v_admin_wallet uuid;
BEGIN
  -- 1. نرخ‌ها و ارز روم
  SELECT commission_rate, currency
  INTO v_commission_rate, v_currency
  FROM rooms
  WHERE id = _room_id;

  -- 2. مبلغ بلیت (gross)
  SELECT r.card_price INTO v_gross
  FROM rooms r
  WHERE r.id = _room_id;

  -- 3. بالاسری‌های پلیر
  SELECT pa.agent_id, pa.super_id
  INTO v_agent, v_super
  FROM player_affiliation pa
  JOIN tickets t ON t.player_user_id = pa.user_id
  WHERE t.id = _ticket_id;

  -- 4. نرخ‌های شخصی agent/super
  SELECT uc.agent_commission, uc.super_commission
  INTO v_agent_rate, v_super_rate
  FROM user_commissions uc
  WHERE uc.user_id IN (v_agent, v_super)
  LIMIT 1;

  -- 5. پیدا کردن ادمین اصلی
  SELECT id INTO v_admin
  FROM users
  WHERE role = 'admin'
  LIMIT 1;

  -- 6. محاسبه پایه کمیسیون و سهم‌ها
  v_base := v_commission_rate * v_gross;
  v_agent_amount := COALESCE(v_agent_rate,0) * v_base;
  v_super_amount := COALESCE(v_super_rate,0) * v_base;
  v_admin_amount := v_base - (v_agent_amount + v_super_amount);

  -- 7. ساخت رکوردهای تراکنش برای هر نقش
  -- (wallet_id لازم است: از wallets با user_id گرفته می‌شود)
  SELECT id INTO v_agent_wallet FROM wallets WHERE user_id = v_agent;
  SELECT id INTO v_super_wallet FROM wallets WHERE user_id = v_super;
  SELECT id INTO v_admin_wallet FROM wallets WHERE user_id = v_admin;

  INSERT INTO transactions (
    id, wallet_id, user_id, amount, currency, type, status, description, related_room, created_at
  )
  VALUES
    (gen_random_uuid(), v_agent_wallet, v_agent, v_agent_amount, v_currency,
     'credit','completed','commission (agent)', _room_id, now()),
    (gen_random_uuid(), v_super_wallet, v_super, v_super_amount, v_currency,
     'credit','completed','commission (super)', _room_id, now()),
    (gen_random_uuid(), v_admin_wallet, v_admin, v_admin_amount, v_currency,
     'credit','completed','commission (admin)', _room_id, now());

END;
$function$
```

**جداول مرتبط:**
- `tickets` - خواندن اطلاعات بلیط
- `rooms` - خواندن نرخ کمیسیون
- `player_affiliation` - پیدا کردن agent/super
- `user_commissions` - خواندن نرخ‌های کمیسیون
- `commissions_log` - ثبت رکورد
- `transactions` - ثبت تراکنش‌ها (نسخه دوم)

---

#### `trg_tickets_after_paid()`

**نوع:** Trigger Function  
**زبان:** PL/pgSQL  
**دسترسی:** SECURITY DEFINER

**توضیحات:**  
این Function بعد از تغییر وضعیت بلیط به `consumed` اجرا می‌شود و کمیسیون را ثبت و توزیع می‌کند.

**کد:**

```sql
CREATE OR REPLACE FUNCTION game_finance.trg_tickets_after_paid()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
BEGIN
  IF TG_OP = 'UPDATE'
     AND NEW.reservation_status = 'consumed'::reservation_status
     AND (OLD.reservation_status IS DISTINCT FROM 'consumed'::reservation_status) THEN

    -- 1) ثبت/محاسبهٔ کمیسیون
    PERFORM game_finance.fn_record_ticket_commission(NEW.id);

    -- 2) توزیع بین کیف پول‌ها
    PERFORM game_finance.fn_distribute_ticket_commission(NEW.id);
  END IF;
  RETURN NEW;
END;
$function$
```

**استفاده:**  
این Function توسط Trigger `trg_tickets_after_paid` استفاده می‌شود.

---

## 📊 خلاصه

### Function‌های اصلی که `tickets` را آپدیت می‌کنند:

1. **`set_updated_at`** (public) - به‌روزرسانی `updated_at`
2. **`trg_tickets_after_paid`** (game_finance) - پردازش بعد از پرداخت
3. **`fn_record_ticket_commission`** (game_finance) - ثبت کمیسیون
4. **`fn_distribute_ticket_commission`** (game_finance) - توزیع کمیسیون

### جداول مرتبط که آپدیت می‌شوند:

- ✅ `tickets` - آپدیت `updated_at` و `reservation_status`
- ✅ `wallets` - آپدیت موجودی برای کمیسیون
- ✅ `transactions` - ثبت تراکنش‌های کمیسیون
- ✅ `commissions_log` - ثبت و آپدیت رکوردهای کمیسیون

---

## 🔗 جریان کار (Workflow)

```
tickets.reservation_status = 'consumed'
         ↓
Trigger: trg_tickets_after_paid (AFTER UPDATE)
         ↓
Function: trg_tickets_after_paid()
         ↓
    ┌────────────────────────────┐
    │ fn_record_ticket_commission │ → ثبت در commissions_log
    └────────────────────────────┘
         ↓
    ┌────────────────────────────┐
    │ fn_distribute_ticket_commission │ → توزیع به wallets
    └────────────────────────────┘
         ↓
    wallets.balance += commission
    transactions ← ثبت تراکنش
```

---

**نکته:** این مستندات بر اساس بررسی دیتابیس در تاریخ تولید شده است. در صورت تغییر Function‌ها، این مستند باید به‌روزرسانی شود.

### 🧹 Cleanup 2025-11-18
- Removed trigger `public.trg_tickets_paid` on `tickets` (no longer needed; payment handled by `game_finance.trg_tickets_after_paid` on UPDATE).
- Removed legacy functions `game_ticket.set_tickets_updated_at` و `game_ticket.trg_tickets_after_paid`.
- Source of truth for ticket payments and commissions: `game_finance.trg_tickets_after_paid` → `fn_record_ticket_commission` → `fn_distribute_ticket_commission`.
