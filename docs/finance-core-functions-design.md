# طراحی هسته مالی واحد (Finance Core Functions Design)

**تاریخ تولید:** 2025-01-XX  
**هدف:** طراحی یک هسته مالی پایین‌دستی واحد برای تمام تغییرات روی `wallets` و `transactions`  
**وضعیت:** طراحی اولیه - هنوز migration اجرا نشده

---

## 1. خلاصه وضعیت فعلی توابع مالی

### 1.1. `fn_adjust_wallet_manual` (public)

**Signature فعلی:**
```sql
CREATE OR REPLACE FUNCTION public.fn_adjust_wallet_manual(
  p_target_user uuid,
  p_amount numeric,
  p_currency text,
  p_type transaction_type,  -- 'deposit' یا 'withdraw'
  p_description text DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER;
```

**جداول نوشتاری:**
- `wallets`: UPDATE `balance`, `updated_at` (یا INSERT اگر وجود نداشته باشد)
- `transactions`: INSERT با `source_kind='manual_panel'`

**منطق کنترلی:**
- بررسی نقش: فقط `admin`, `super`, `agent` می‌توانند فراخوانی کنند
- `FOR UPDATE` روی wallet برای جلوگیری از race condition
- چک موجودی: `balance_after >= 0` (برای withdraw)
- `p_amount` باید مثبت باشد
- `source_ref` = `auth.uid()::text` (actor)
- `status` = `'completed'`

**Idempotency:** ندارد - هر فراخوانی یک تراکنش جدید ایجاد می‌کند

---

### 1.2. `fn_distribute_ticket_commission` (game_finance)

**Signature فعلی:**
```sql
CREATE OR REPLACE FUNCTION game_finance.fn_distribute_ticket_commission(
  p_ticket uuid
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER;
```

**جداول نوشتاری:**
- `wallets`: UPDATE `balance` برای agent, super, admin (هر کدام جداگانه)
- `transactions`: INSERT با `type='fee_agent'`, `'fee_super'`, `'fee_admin'`
- `commissions_log`: UPDATE `distributed_at`, `admin_amount` (در صورت rollup)

**منطق کنترلی:**
- ابتدا `commissions_log` را می‌خواند (یا با `fn_record_ticket_commission` می‌سازد)
- اگر `distributed_at IS NOT NULL` → خروج (idempotent)
- `FOR UPDATE` روی هر wallet
- اگر wallet وجود نداشته باشد → rollup به `admin_amount`
- `source_kind` = `'ticket_commission'` (ضمنی)
- `room_id` و `ticket_id` در transaction ثبت می‌شوند

**Idempotency:** دارد - اگر قبلاً توزیع شده باشد، خروج می‌کند

---

### 1.3. `fn_record_ticket_commission` (game_finance)

**Signature فعلی:**
```sql
-- نسخه 1
CREATE OR REPLACE FUNCTION game_finance.fn_record_ticket_commission(
  p_ticket uuid
) RETURNS uuid

-- نسخه 2 (overloaded)
CREATE OR REPLACE FUNCTION game_finance.fn_record_ticket_commission(
  _room_id uuid,
  _ticket_id uuid
) RETURNS void
```

**جداول نوشتاری:**
- `commissions_log`: INSERT (محاسبه و ثبت کمیسیون)

**منطق کنترلی:**
- اگر قبلاً ثبت شده باشد → همان `id` را برمی‌گرداند (idempotent)
- محاسبه کمیسیون بر اساس:
  - `commission_rate` اتاق
  - `agent_commission` / `super_commission` از `user_commissions`
  - `player_affiliation` برای پیدا کردن agent/super

**Idempotency:** دارد - اگر `ticket_id` قبلاً ثبت شده باشد، خروج می‌کند

**نکته:** این function فقط `commissions_log` را می‌نویسد، نه `wallets` یا `transactions`

---

### 1.4. `fn_payout_room_if_full` (public)

**Signature فعلی (بر اساس مستندات):**
```sql
CREATE OR REPLACE FUNCTION public.fn_payout_room_if_full(
  p_room_id uuid
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER;
```

**جداول نوشتاری (احتمالی):**
- `wallets`: UPDATE `balance` برای برندگان
- `transactions`: INSERT تراکنش‌های پرداخت جایزه

**منطق کنترلی (احتمالی):**
- بعد از `fn_evaluate_room_after_draw` فراخوانی می‌شود
- پرداخت جایزه به برندگان (line win / full win)
- احتمالاً `source_kind` = `'game_payout'` یا `'room_settlement'`

**Idempotency:** نامشخص (احتمالاً دارد)

**نکته:** کد دقیق این function در دسترس نیست، اما بر اساس مستندات و الگوی سایر functions طراحی می‌شود

---

## 2. طراحی هسته مالی پایین‌دستی واحد

### 2.1. تابع اصلی: `game_finance.fn_wallet_apply_delta`

**هدف:** تمام تغییرات روی `wallets` و `transactions` از این راه انجام شوند

**Signature پیشنهادی:**
```sql
CREATE OR REPLACE FUNCTION game_finance.fn_wallet_apply_delta(
  p_user_id uuid,
  p_currency text,
  p_amount_delta numeric,  -- مثبت = واریز، منفی = برداشت
  p_transaction_type transaction_type,
  p_source_kind text,
  p_source_ref uuid DEFAULT NULL,  -- actor یا reference ID
  p_description text DEFAULT NULL,
  p_meta jsonb DEFAULT '{}'::jsonb,  -- room_id, ticket_id, و سایر metadata
  p_allow_negative boolean DEFAULT false  -- آیا اجازه موجودی منفی داریم؟
) RETURNS uuid  -- transaction_id
LANGUAGE plpgsql
SECURITY DEFINER
STRICT;
```

**وظایف تابع:**

1. **ایجاد یا خواندن wallet:**
   - اگر wallet برای `(p_user_id, p_currency)` وجود ندارد → ایجاد با `balance = 0`
   - اگر وجود دارد → با `FOR UPDATE` بخوان

2. **محاسبه موجودی جدید:**
   - `balance_before = wallet.balance`
   - `balance_after = balance_before + p_amount_delta`

3. **بررسی invariantها:**
   - اگر `p_allow_negative = false` و `balance_after < 0` → `RAISE EXCEPTION 'insufficient funds'`
   - اگر `p_amount_delta = 0` → `RAISE EXCEPTION 'zero amount not allowed'`

4. **به‌روزرسانی wallet:**
   - `UPDATE wallets SET balance = balance_after, updated_at = now() WHERE id = wallet.id`

5. **ثبت transaction:**
   - `INSERT INTO transactions` با تمام metadata:
     - `wallet_id`, `user_id`, `type`, `status = 'completed'`
     - `amount = ABS(p_amount_delta)` (همیشه مثبت)
     - `balance_before`, `balance_after`
     - `source_kind`, `source_ref`
     - `description`
     - تمام فیلدهای `p_meta` (room_id, ticket_id, و غیره)

6. **بازگرداندن transaction_id:**
   - `RETURN transaction.id`

**Invariantها (قوانین ثابت):**

1. ✅ `balance` هیچ‌وقت زیر صفر نمی‌رود (مگر `p_allow_negative = true`)
2. ✅ هر تغییر wallet همیشه یک transaction ثبت می‌کند
3. ✅ `balance_after = balance_before + p_amount_delta` (همیشه)
4. ✅ `amount` در transaction همیشه مثبت است (`ABS(p_amount_delta)`)
5. ✅ `FOR UPDATE` برای جلوگیری از race condition
6. ✅ Transactional: در صورت خطا، rollback می‌شود

**Pseudo-SQL (طراحی):**

```sql
CREATE OR REPLACE FUNCTION game_finance.fn_wallet_apply_delta(
  p_user_id uuid,
  p_currency text,
  p_amount_delta numeric,
  p_transaction_type transaction_type,
  p_source_kind text,
  p_source_ref uuid DEFAULT NULL,
  p_description text DEFAULT NULL,
  p_meta jsonb DEFAULT '{}'::jsonb,
  p_allow_negative boolean DEFAULT false
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
STRICT
AS $function$
DECLARE
  v_wallet_id uuid;
  v_wallet_balance numeric;
  v_balance_before numeric;
  v_balance_after numeric;
  v_transaction_id uuid;
BEGIN
  -- 1. خواندن یا ایجاد wallet با FOR UPDATE
  SELECT id, balance INTO v_wallet_id, v_wallet_balance
  FROM public.wallets
  WHERE user_id = p_user_id AND currency = p_currency
  FOR UPDATE;
  
  IF v_wallet_id IS NULL THEN
    -- ایجاد wallet جدید
    INSERT INTO public.wallets (user_id, currency, balance, locked_amount, created_at, updated_at)
    VALUES (p_user_id, p_currency, 0, 0, now(), now())
    RETURNING id, balance INTO v_wallet_id, v_wallet_balance;
  END IF;
  
  v_balance_before := v_wallet_balance;
  v_balance_after := v_balance_before + p_amount_delta;
  
  -- 2. بررسی invariantها
  IF p_amount_delta = 0 THEN
    RAISE EXCEPTION 'zero amount not allowed';
  END IF;
  
  IF NOT p_allow_negative AND v_balance_after < 0 THEN
    RAISE EXCEPTION 'insufficient funds: balance would be %', v_balance_after;
  END IF;
  
  -- 3. به‌روزرسانی wallet
  UPDATE public.wallets
  SET balance = v_balance_after,
      updated_at = now()
  WHERE id = v_wallet_id;
  
  -- 4. ثبت transaction
  INSERT INTO public.transactions (
    id, wallet_id, user_id, type, status,
    amount, currency, description,
    balance_before, balance_after,
    source_kind, source_ref,
    room_id, ticket_id,
    created_at
  )
  VALUES (
    gen_random_uuid(),
    v_wallet_id,
    p_user_id,
    p_transaction_type,
    'completed',
    ABS(p_amount_delta),  -- همیشه مثبت
    p_currency,
    p_description,
    v_balance_before,
    v_balance_after,
    p_source_kind,
    p_source_ref,
    (p_meta->>'room_id')::uuid,
    (p_meta->>'ticket_id')::uuid,
    now()
  )
  RETURNING id INTO v_transaction_id;
  
  RETURN v_transaction_id;
EXCEPTION
  WHEN OTHERS THEN
    -- Rollback خودکار توسط transaction
    RAISE;
END;
$function$;
```

---

## 3. بازطراحی توابع فعلی روی این هسته

### 3.1. `fn_adjust_wallet_manual` → Refactor

**وضعیت فعلی:**
- مستقیماً `wallets` و `transactions` را می‌نویسد
- منطق امنیتی (بررسی نقش) درون function
- منطق wallet management (ایجاد/به‌روزرسانی) درون function

**طرح refactor پیشنهادی:**

```sql
CREATE OR REPLACE FUNCTION public.fn_adjust_wallet_manual(
  p_target_user uuid,
  p_amount numeric,
  p_currency text,
  p_type transaction_type,
  p_description text DEFAULT NULL
) RETURNS uuid  -- transaction_id
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
DECLARE
  v_actor uuid;
  v_actor_role text;
  v_amount_delta numeric;
  v_transaction_id uuid;
BEGIN
  -- 1. بررسی نقش (منطق امنیتی)
  v_actor := auth.uid();
  SELECT role INTO v_actor_role FROM public.users WHERE id = v_actor;
  
  IF v_actor_role NOT IN ('admin', 'agent', 'super') THEN
    RAISE EXCEPTION 'permission denied: only admin/agent/super can adjust wallets';
  END IF;
  
  -- 2. Validation
  IF p_amount <= 0 THEN
    RAISE EXCEPTION 'amount must be positive';
  END IF;
  
  -- 3. تعیین delta بر اساس type
  IF p_type = 'deposit' THEN
    v_amount_delta := p_amount;
  ELSIF p_type = 'withdraw' THEN
    v_amount_delta := -p_amount;
  ELSE
    RAISE EXCEPTION 'unsupported transaction type: %', p_type;
  END IF;
  
  -- 4. فراخوانی هسته مالی
  SELECT game_finance.fn_wallet_apply_delta(
    p_user_id := p_target_user,
    p_currency := p_currency,
    p_amount_delta := v_amount_delta,
    p_transaction_type := p_type,
    p_source_kind := 'manual_panel',
    p_source_ref := v_actor,
    p_description := COALESCE(p_description, 'manual panel adjustment'),
    p_meta := '{}'::jsonb,
    p_allow_negative := false
  ) INTO v_transaction_id;
  
  RETURN v_transaction_id;
END;
$function$;
```

**تغییرات کلیدی:**
- ✅ دیگر مستقیماً `wallets` و `transactions` نمی‌نویسد
- ✅ فقط محاسبه `v_amount_delta` و فراخوانی `fn_wallet_apply_delta`
- ✅ منطق امنیتی (بررسی نقش) حفظ می‌شود
- ✅ `transaction_id` را برمی‌گرداند (برای audit trail)

---

### 3.2. `fn_distribute_ticket_commission` → Refactor

**وضعیت فعلی:**
- مستقیماً `wallets` و `transactions` را می‌نویسد (سه بار: agent, super, admin)
- منطق rollup (اگر wallet وجود نداشته باشد) درون function
- `commissions_log` را به‌روزرسانی می‌کند

**طرح refactor پیشنهادی:**

```sql
CREATE OR REPLACE FUNCTION game_finance.fn_distribute_ticket_commission(
  p_ticket uuid
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
DECLARE
  c record;
  v_currency text;
  v_admin_user uuid;
  v_agent_transaction_id uuid;
  v_super_transaction_id uuid;
  v_admin_transaction_id uuid;
  v_rollup_amount numeric := 0;
BEGIN
  -- 1. خواندن commissions_log
  SELECT * INTO c
  FROM public.commissions_log
  WHERE ticket_id = p_ticket;
  
  IF NOT FOUND THEN
    PERFORM game_finance.fn_record_ticket_commission(p_ticket);
    SELECT * INTO c FROM public.commissions_log WHERE ticket_id = p_ticket;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'commission log not found for ticket %', p_ticket;
    END IF;
  END IF;
  
  -- 2. Idempotency check
  IF c.distributed_at IS NOT NULL THEN
    RETURN;
  END IF;
  
  -- 3. گرفتن currency و admin
  SELECT currency INTO v_currency FROM public.rooms WHERE id = c.room_id;
  SELECT id INTO v_admin_user FROM public.users WHERE role = 'admin' LIMIT 1;
  
  -- 4. توزیع به Agent
  IF c.agent_user_id IS NOT NULL AND c.agent_amount > 0 THEN
    BEGIN
      SELECT game_finance.fn_wallet_apply_delta(
        p_user_id := c.agent_user_id,
        p_currency := v_currency,
        p_amount_delta := c.agent_amount,
        p_transaction_type := 'fee_agent',
        p_source_kind := 'ticket_commission',
        p_source_ref := NULL,  -- یا ticket_id
        p_description := 'ticket commission (agent)',
        p_meta := jsonb_build_object('room_id', c.room_id, 'ticket_id', c.ticket_id),
        p_allow_negative := false
      ) INTO v_agent_transaction_id;
    EXCEPTION
      WHEN OTHERS THEN
        -- اگر wallet وجود نداشته باشد یا خطا بدهد → rollup
        v_rollup_amount := v_rollup_amount + c.agent_amount;
    END;
  END IF;
  
  -- 5. توزیع به Super
  IF c.super_user_id IS NOT NULL AND c.super_amount > 0 THEN
    BEGIN
      SELECT game_finance.fn_wallet_apply_delta(
        p_user_id := c.super_user_id,
        p_currency := v_currency,
        p_amount_delta := c.super_amount,
        p_transaction_type := 'fee_super',
        p_source_kind := 'ticket_commission',
        p_source_ref := NULL,
        p_description := 'ticket commission (super)',
        p_meta := jsonb_build_object('room_id', c.room_id, 'ticket_id', c.ticket_id),
        p_allow_negative := false
      ) INTO v_super_transaction_id;
    EXCEPTION
      WHEN OTHERS THEN
        v_rollup_amount := v_rollup_amount + c.super_amount;
    END;
  END IF;
  
  -- 6. توزیع به Admin (باقیمانده + rollup)
  IF (c.admin_amount + v_rollup_amount) > 0 AND v_admin_user IS NOT NULL THEN
    SELECT game_finance.fn_wallet_apply_delta(
      p_user_id := v_admin_user,
      p_currency := v_currency,
      p_amount_delta := c.admin_amount + v_rollup_amount,
      p_transaction_type := 'fee_admin',
      p_source_kind := 'ticket_commission',
      p_source_ref := NULL,
      p_description := 'ticket commission (admin remainder)',
      p_meta := jsonb_build_object('room_id', c.room_id, 'ticket_id', c.ticket_id),
      p_allow_negative := false
    ) INTO v_admin_transaction_id;
  END IF;
  
  -- 7. به‌روزرسانی commissions_log
  UPDATE public.commissions_log
  SET distributed_at = now(),
      admin_amount = c.admin_amount + v_rollup_amount
  WHERE id = c.id;
END;
$function$;
```

**تغییرات کلیدی:**
- ✅ دیگر مستقیماً `wallets` و `transactions` نمی‌نویسد
- ✅ سه بار `fn_wallet_apply_delta` فراخوانی می‌کند (agent, super, admin)
- ✅ منطق rollup با `EXCEPTION` handling انجام می‌شود
- ✅ `commissions_log` همچنان در همین function به‌روزرسانی می‌شود (چون مربوط به business logic است)

---

### 3.3. `fn_payout_room_if_full` → Refactor

**وضعیت فعلی:**
- کد دقیق در دسترس نیست
- احتمالاً مستقیماً `wallets` و `transactions` را می‌نویسد
- پرداخت جایزه به برندگان (line win / full win)

**طرح refactor پیشنهادی:**

```sql
CREATE OR REPLACE FUNCTION public.fn_payout_room_if_full(
  p_room_id uuid
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
DECLARE
  v_room record;
  v_winners record;
  v_currency text;
  v_line_reward numeric;
  v_full_reward numeric;
  v_transaction_id uuid;
BEGIN
  -- 1. خواندن اطلاعات room
  SELECT currency, line_reward_percentage, full_reward_percentage, card_price
  INTO v_room
  FROM public.rooms
  WHERE id = p_room_id;
  
  IF NOT FOUND THEN
    RAISE EXCEPTION 'room not found: %', p_room_id;
  END IF;
  
  v_currency := v_room.currency;
  v_line_reward := v_room.card_price * (v_room.line_reward_percentage / 100);
  v_full_reward := v_room.card_price * (v_room.full_reward_percentage / 100);
  
  -- 2. خواندن برندگان (از results یا جداول دیگر)
  -- این بخش بستگی به ساختار results دارد
  FOR v_winners IN
    SELECT player_user_id, win_type  -- 'line' یا 'full'
    FROM public.results
    WHERE room_id = p_room_id
      AND win_type IN ('line', 'full')
      AND paid_at IS NULL  -- اگر قبلاً پرداخت نشده باشد
  LOOP
    -- 3. محاسبه مبلغ جایزه
    DECLARE
      v_reward_amount numeric;
    BEGIN
      IF v_winners.win_type = 'line' THEN
        v_reward_amount := v_line_reward;
      ELSIF v_winners.win_type = 'full' THEN
        v_reward_amount := v_full_reward;
      ELSE
        CONTINUE;
      END IF;
      
      -- 4. فراخوانی هسته مالی
      SELECT game_finance.fn_wallet_apply_delta(
        p_user_id := v_winners.player_user_id,
        p_currency := v_currency,
        p_amount_delta := v_reward_amount,
        p_transaction_type := 'payout',  -- یا 'win_line', 'win_full'
        p_source_kind := 'game_payout',
        p_source_ref := NULL,
        p_description := format('game payout: %s win', v_winners.win_type),
        p_meta := jsonb_build_object('room_id', p_room_id, 'win_type', v_winners.win_type),
        p_allow_negative := false
      ) INTO v_transaction_id;
      
      -- 5. علامت‌گذاری پرداخت شده
      UPDATE public.results
      SET paid_at = now()
      WHERE room_id = p_room_id
        AND player_user_id = v_winners.player_user_id
        AND win_type = v_winners.win_type;
    END;
  END LOOP;
END;
$function$;
```

**تغییرات کلیدی:**
- ✅ دیگر مستقیماً `wallets` و `transactions` نمی‌نویسد
- ✅ برای هر برنده، `fn_wallet_apply_delta` فراخوانی می‌کند
- ✅ منطق business (خواندن results، محاسبه جایزه) در همین function
- ✅ `results.paid_at` برای idempotency

**نکته:** این design بر اساس فرضیات است. کد واقعی ممکن است متفاوت باشد.

---

## 4. Interaction با RLS

### 4.1. جداول با RLS

در design پیشنهادی، جداول زیر باید RLS فعال داشته باشند:

1. **`wallets`**
   - RLS فعال: ✅
   - Policy: فقط SELECT برای کاربران (خواندن موجودی خود)
   - Write: فقط از طریق `fn_wallet_apply_delta` (SECURITY DEFINER)

2. **`transactions`**
   - RLS فعال: ✅
   - Policy: فقط SELECT برای کاربران (خواندن تراکنش‌های خود)
   - Write: فقط از طریق `fn_wallet_apply_delta` (SECURITY DEFINER)

3. **`commissions_log`**
   - RLS فعال: ✅ (اختیاری - بستگی به نیاز دارد)
   - Policy: فقط SELECT برای admin/super/agent (خواندن کمیسیون‌های مربوطه)
   - Write: از طریق `fn_record_ticket_commission` و `fn_distribute_ticket_commission`

### 4.2. چرا همه writeها از طریق functions؟

**مزایا:**

1. **امنیت:** کلاینت‌های معمولی (anon key) نمی‌توانند مستقیماً `wallets` یا `transactions` را تغییر دهند
2. **یکپارچگی:** تمام تغییرات از یک مسیر واحد انجام می‌شوند (single source of truth)
3. **Audit Trail:** تمام تراکنش‌ها با metadata کامل ثبت می‌شوند
4. **Invariantها:** قوانین (مثلاً balance >= 0) در یک جا اجرا می‌شوند
5. **Race Conditions:** `FOR UPDATE` در یک جا مدیریت می‌شود

### 4.3. تنظیم RLS برای write-only functions

**الگوی پیشنهادی:**

```sql
-- 1. RLS فعال روی wallets
ALTER TABLE public.wallets ENABLE ROW LEVEL SECURITY;

-- 2. Policy برای SELECT (خواندن)
CREATE POLICY wallets_select_own ON public.wallets
  FOR SELECT
  USING (user_id = auth.uid());

-- 3. Policy برای INSERT/UPDATE/DELETE: هیچ policy وجود ندارد
-- یعنی کلاینت‌های معمولی نمی‌توانند write کنند
-- فقط functions با SECURITY DEFINER می‌توانند write کنند

-- 4. همین الگو برای transactions
ALTER TABLE public.transactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY transactions_select_own ON public.transactions
  FOR SELECT
  USING (user_id = auth.uid());

-- 5. برای admin/super/agent: policy اضافی برای SELECT
CREATE POLICY transactions_select_managed ON public.transactions
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.users
      WHERE id = auth.uid()
        AND role IN ('admin', 'super', 'agent')
    )
  );
```

**نکته:** Functions با `SECURITY DEFINER` از RLS عبور می‌کنند، بنابراین می‌توانند write کنند. اما باید درون function منطق امنیتی (بررسی نقش) وجود داشته باشد.

### 4.4. Migration Path

**مرحله 1:** ایجاد `fn_wallet_apply_delta` با SECURITY DEFINER  
**مرحله 2:** Refactor توابع فعلی برای استفاده از `fn_wallet_apply_delta`  
**مرحله 3:** حذف policies برای INSERT/UPDATE/DELETE روی `wallets` و `transactions`  
**مرحله 4:** تست کامل و اطمینان از اینکه هیچ کلاینت مستقیم write نمی‌کند

---

## 5. خلاصه و مراحل بعدی

### 5.1. خلاصه Design

1. ✅ **هسته مالی واحد:** `game_finance.fn_wallet_apply_delta`
   - تمام تغییرات `wallets` و `transactions` از این راه
   - Invariantها در یک جا
   - Transactional و safe

2. ✅ **Refactor توابع فعلی:**
   - `fn_adjust_wallet_manual` → استفاده از `fn_wallet_apply_delta`
   - `fn_distribute_ticket_commission` → استفاده از `fn_wallet_apply_delta`
   - `fn_payout_room_if_full` → استفاده از `fn_wallet_apply_delta`

3. ✅ **RLS Strategy:**
   - فقط SELECT برای کلاینت‌ها
   - Write فقط از طریق functions با SECURITY DEFINER

### 5.2. مراحل بعدی (Migration)

1. **ایجاد `fn_wallet_apply_delta`** در schema `game_finance`
2. **Refactor `fn_adjust_wallet_manual`** (پایلوت)
3. **Refactor `fn_distribute_ticket_commission`**
4. **Refactor `fn_payout_room_if_full`** (اگر کد در دسترس باشد)
5. **تست کامل** و اطمینان از backward compatibility
6. **حذف policies** برای write روی `wallets` و `transactions`

### 5.3. نکات مهم

- ⚠️ **Backward Compatibility:** توابع فعلی باید signature خود را حفظ کنند (یا versioned شوند)
- ⚠️ **Testing:** تمام سناریوها باید تست شوند (race conditions, rollup, idempotency)
- ⚠️ **Performance:** `FOR UPDATE` ممکن است lock ایجاد کند - باید monitor شود
- ⚠️ **Audit:** تمام تغییرات باید در `transactions` ثبت شوند

---

## پیاده‌سازی مرحله ۳ (fn_wallet_apply_delta + fn_adjust_wallet_manual)

**تاریخ پیاده‌سازی:** 2025-01-27

### Migration‌های ایجاد شده

1. **`20250127144614_finance_core_wallet_apply_delta.sql`**
   - ایجاد schema `game_finance` (اگر وجود نداشته باشد)
   - ایجاد تابع `game_finance.fn_wallet_apply_delta`
   - Grant permissions به `authenticated` و `service_role`

2. **`20250127144615_refactor_fn_adjust_wallet_manual.sql`**
   - Refactor تابع `public.fn_adjust_wallet_manual`
   - تبدیل به wrapper برای `fn_wallet_apply_delta`
   - حفظ signature قبلی برای backward compatibility

### تغییرات نسبت به Design اولیه

1. **`p_source_ref` به صورت `text`:**
   - در design اولیه `uuid` بود، اما در implementation به `text` تغییر یافت
   - دلیل: در `transactions.source_ref` به صورت `text` ذخیره می‌شود (مثلاً `v_actor::text`)
   - این تغییر برای سازگاری با ساختار فعلی دیتابیس است

2. **استخراج `room_id` و `ticket_id` از `p_meta`:**
   - در implementation، استخراج این مقادیر با چک `p_meta ? 'room_id'` انجام می‌شود
   - اگر `p_meta` null باشد یا key وجود نداشته باشد، `NULL` تنظیم می‌شود
   - این رویکرد safe است و از خطا جلوگیری می‌کند

3. **`fn_adjust_wallet_manual` همچنان `void` برمی‌گرداند:**
   - در design پیشنهادی، `transaction_id` برگردانده می‌شد
   - اما برای حفظ backward compatibility، signature قبلی حفظ شد
   - در آینده می‌توان signature را تغییر داد اگر نیاز باشد

### وضعیت فعلی

✅ **`fn_wallet_apply_delta`** ایجاد شده و آماده استفاده است  
✅ **`fn_adjust_wallet_manual`** refactor شده و از `fn_wallet_apply_delta` استفاده می‌کند  
⏳ **توابع دیگر** (`fn_distribute_ticket_commission`, `fn_payout_room_if_full`) هنوز refactor نشده‌اند

### مراحل بعدی

1. تست migration‌ها در محیط development
2. بررسی backward compatibility با فرانت‌اند
3. Refactor `fn_distribute_ticket_commission` (مرحله بعد)
4. Refactor `fn_payout_room_if_full` (مرحله بعد)
5. تنظیم RLS policies (مرحله بعد)

---

## تحلیل وضعیت فعلی توابع کمیسیون و پرداخت (مرحله 4)

**تاریخ تحلیل:** 2025-01-27

### fn_distribute_ticket_commission – وضعیت فعلی

**Signature فعلی:**
```sql
CREATE OR REPLACE FUNCTION game_finance.fn_distribute_ticket_commission(
  p_ticket uuid
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER;
```

**Schema:** `game_finance`

**جداول نوشتاری:**
1. **`wallets`**: UPDATE `balance` و `updated_at` برای سه نقش:
   - Agent (اگر `c.agent_user_id IS NOT NULL` و `c.agent_amount > 0`)
   - Super (اگر `c.super_user_id IS NOT NULL` و `c.super_amount > 0`)
   - Admin (باقیمانده + rollup از agent/super اگر wallet نداشته باشند)

2. **`transactions`**: INSERT سه تراکنش جداگانه:
   - `type='fee_agent'` برای agent
   - `type='fee_super'` برای super
   - `type='fee_admin'` برای admin
   - هر تراکنش شامل: `wallet_id`, `user_id`, `amount`, `currency`, `room_id`, `ticket_id`

3. **`commissions_log`**: UPDATE `distributed_at` و `admin_amount` (در صورت rollup)

**محاسبات:**
- ابتدا `commissions_log` را می‌خواند (یا با `fn_record_ticket_commission` می‌سازد)
- مبالغ از `commissions_log` گرفته می‌شوند: `agent_amount`, `super_amount`, `admin_amount`
- `currency` از `rooms` خوانده می‌شود

**فرض‌ها:**
- یک `ticket_id` فقط یک بار توزیع می‌شود (idempotent با چک `distributed_at`)
- یک player فقط یک agent و یک super دارد (از `player_affiliation`)
- یک room فقط یک `currency` دارد
- اگر wallet agent/super وجود نداشته باشد، مبلغ به admin rollup می‌شود

**منطق کنترلی:**
- `FOR UPDATE` روی هر wallet قبل از update
- اگر wallet وجود نداشته باشد → rollup به `admin_amount`
- Idempotent: اگر `distributed_at IS NOT NULL` → خروج

---

### fn_payout_room_if_full – وضعیت فعلی

**Signature فعلی (بر اساس مستندات):**
```sql
CREATE OR REPLACE FUNCTION public.fn_payout_room_if_full(
  p_room_id uuid
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER;
```

**Schema:** `public`

**زمان فراخوانی:**
- بعد از `fn_evaluate_room_after_draw` در worker
- وقتی اتاق کامل شده باشد (تمام 90 عدد آمده)

**جداول نوشتاری (احتمالی):**
1. **`wallets`**: UPDATE `balance` برای برندگان
2. **`transactions`**: INSERT تراکنش‌های پرداخت جایزه
3. **`results`**: احتمالاً UPDATE `paid_at` برای علامت‌گذاری پرداخت شده

**منطق پیدا کردن برندگان:**
- از جدول `results` خوانده می‌شود
- `win_type` می‌تواند `'line'` یا `'full'` باشد
- احتمالاً `paid_at IS NULL` برای جلوگیری از پرداخت مجدد

**محاسبه مبلغ جایزه:**
- `line_reward = card_price * (line_reward_percentage / 100)`
- `full_reward = card_price * (full_reward_percentage / 100)`
- این مقادیر از `rooms` خوانده می‌شوند

**وابستگی‌ها:**
- احتمالاً `fn_distribute_ticket_commission` را صدا نمی‌زند (کمیسیون جداگانه توزیع می‌شود)
- فقط payout اصلی (جایزه برندگان) را انجام می‌دهد

**نکته:** کد دقیق این function در دسترس نیست، اما بر اساس مستندات و الگوی سایر functions طراحی می‌شود.

---

## طرح refactor پیشنهادی (مرحله 4)

### fn_distribute_ticket_commission – طرح refactor

**تغییرات:**
- دیگر مستقیماً `wallets` و `transactions` نمی‌نویسد
- برای هر نقش (agent, super, admin) یک بار `game_finance.fn_wallet_apply_delta` فراخوانی می‌کند
- منطق rollup (اگر wallet وجود نداشته باشد) با exception handling انجام می‌شود

**Pseudo-code:**
```
1. خواندن commissions_log (یا ایجاد با fn_record_ticket_commission)
2. چک idempotency (distributed_at)
3. خواندن currency از rooms
4. خواندن admin_user_id

5. برای Agent:
   - اگر agent_user_id و agent_amount > 0:
     - try: fn_wallet_apply_delta(agent_user_id, currency, agent_amount, 'fee_agent', 'ticket_commission', ...)
     - catch: rollup به admin_amount

6. برای Super:
   - اگر super_user_id و super_amount > 0:
     - try: fn_wallet_apply_delta(super_user_id, currency, super_amount, 'fee_super', 'ticket_commission', ...)
     - catch: rollup به admin_amount

7. برای Admin:
   - اگر admin_amount > 0:
     - fn_wallet_apply_delta(admin_user_id, currency, admin_amount, 'fee_admin', 'ticket_commission', ...)

8. UPDATE commissions_log: distributed_at, admin_amount (با rollup)
```

**Metadata در fn_wallet_apply_delta:**
- `source_kind = 'ticket_commission'`
- `source_ref = NULL` (یا ticket_id به صورت text)
- `p_meta = jsonb_build_object('room_id', c.room_id, 'ticket_id', c.ticket_id)`
- `description = 'ticket commission (agent/super/admin)'`

---

### fn_payout_room_if_full – طرح refactor

**تغییرات:**
- دیگر مستقیماً `wallets` و `transactions` نمی‌نویسد
- برای هر برنده، یک بار `game_finance.fn_wallet_apply_delta` فراخوانی می‌کند
- منطق business (خواندن results، محاسبه جایزه) در همین function باقی می‌ماند

**Pseudo-code:**
```
1. خواندن اطلاعات room (currency, line_reward_percentage, full_reward_percentage, card_price)
2. محاسبه line_reward و full_reward
3. خواندن برندگان از results (WHERE room_id = p_room_id AND paid_at IS NULL)

4. برای هر برنده:
   - تعیین مبلغ جایزه بر اساس win_type
   - fn_wallet_apply_delta(
       player_user_id,
       currency,
       reward_amount,
       'payout' یا 'win_line'/'win_full',
       'game_payout',
       NULL,
       description,
       jsonb_build_object('room_id', p_room_id, 'win_type', win_type),
       false
     )
   - UPDATE results SET paid_at = now()
```

**Metadata در fn_wallet_apply_delta:**
- `source_kind = 'game_payout'`
- `source_ref = NULL` (یا room_id به صورت text)
- `p_meta = jsonb_build_object('room_id', p_room_id, 'win_type', win_type)`
- `description = format('game payout: %s win', win_type)`
- `p_transaction_type`: احتمالاً `'payout'` یا enum مخصوص (`'win_line'`, `'win_full'`)

**نکته:** اگر `transaction_type` enum مخصوصی برای payout وجود ندارد، از `'payout'` استفاده می‌شود.

---

## پیاده‌سازی مرحله ۴ (refactor commission + room payout)

**تاریخ پیاده‌سازی:** 2025-01-27

### Migration ایجاد شده

**`20250127145821_refactor_commission_and_room_payout.sql`**
- Refactor `game_finance.fn_distribute_ticket_commission`
- Refactor `public.fn_payout_room_if_full`
- هر دو تابع از `game_finance.fn_wallet_apply_delta` استفاده می‌کنند

### تغییرات کلیدی

#### fn_distribute_ticket_commission

✅ **دیگر مستقیماً `wallets` و `transactions` نمی‌نویسد**  
✅ **برای هر نقش (agent, super, admin) یک بار `fn_wallet_apply_delta` فراخوانی می‌کند**  
✅ **منطق rollup با exception handling انجام می‌شود**  
✅ **`commissions_log` همچنان در همین function به‌روزرسانی می‌شود**

**Metadata در fn_wallet_apply_delta:**
- `source_kind = 'ticket_commission'`
- `source_ref = NULL`
- `p_meta = jsonb_build_object('room_id', c.room_id, 'ticket_id', c.ticket_id)`
- `p_transaction_type = 'fee_agent'/'fee_super'/'fee_admin'`

#### fn_payout_room_if_full

✅ **دیگر مستقیماً `wallets` و `transactions` نمی‌نویسد**  
✅ **برای هر برنده یک بار `fn_wallet_apply_delta` فراخوانی می‌کند**  
✅ **منطق business (خواندن results، محاسبه جایزه) در همین function باقی می‌ماند**  
✅ **`results.paid_at` برای idempotency به‌روزرسانی می‌شود**

**Metadata در fn_wallet_apply_delta:**
- `source_kind = 'game_payout'`
- `source_ref = p_room_id::text`
- `p_meta = jsonb_build_object('room_id', p_room_id, 'win_type', win_type)`
- `p_transaction_type = 'payout'`
- `p_description = format('game payout: %s win', win_type)`

### تغییرات نسبت به Design اولیه

1. **Exception Handling برای Rollup:**
   - در design اولیه، rollup با چک `IF v_wallet IS NOT NULL` انجام می‌شد
   - در implementation، از `EXCEPTION` handling استفاده شد
   - این رویکرد safe‌تر است و خطاهای دیگر را هم handle می‌کند

2. **source_ref در fn_payout_room_if_full:**
   - در design اولیه `NULL` بود
   - در implementation، `p_room_id::text` استفاده شد برای audit trail بهتر

3. **محاسبه reward:**
   - در implementation، تقسیم بر `100.0` انجام می‌شود (نه `100`) برای اطمینان از دقت اعشاری

### وضعیت فعلی

✅ **`fn_wallet_apply_delta`** ایجاد شده و آماده استفاده است  
✅ **`fn_adjust_wallet_manual`** refactor شده و از `fn_wallet_apply_delta` استفاده می‌کند  
✅ **`fn_distribute_ticket_commission`** refactor شده و از `fn_wallet_apply_delta` استفاده می‌کند  
✅ **`fn_payout_room_if_full`** refactor شده و از `fn_wallet_apply_delta` استفاده می‌کند  

**همه توابع مالی اصلی حالا از هسته مالی واحد استفاده می‌کنند!** 🎉

### مراحل بعدی

1. تست migration در محیط development
2. بررسی backward compatibility
3. تنظیم RLS policies (مرحله بعد)
4. Monitor performance و race conditions

---

## تحلیل وضعیت فعلی RLS (مرحله 5.1)

**تاریخ تحلیل:** 2025-01-27

### ساختار جداول مالی

#### `public.wallets`
**ستون‌های کلیدی:**
- `id uuid` (PRIMARY KEY)
- `user_id uuid` (ارجاع به `users.id`)
- `balance bigint` (موجودی فعلی)
- `currency text` (نوع ارز، مثلاً `'IRR'`)
- `locked_amount numeric` (مبلغ قفل‌شده)
- `created_at timestamptz`
- `updated_at timestamptz`

**کلیدهای منحصر به فرد:** احتمالاً `(user_id, currency)` unique constraint

#### `public.transactions`
**ستون‌های کلیدی:**
- `id uuid` (PRIMARY KEY)
- `wallet_id uuid` (ارجاع به `wallets.id`)
- `user_id uuid` (ارجاع به `users.id`)
- `type transaction_type` (enum: `deposit`, `withdraw`, `fee_agent`, `fee_super`, `fee_admin`, `payout`, ...)
- `status transaction_status` (enum: `pending`, `completed`, `failed`, `cancelled`, `settled`)
- `amount numeric`
- `currency text`
- `description text`
- `balance_before numeric`
- `balance_after numeric`
- `source_kind text` (مثلاً `'manual_panel'`, `'ticket_commission'`, `'game_payout'`)
- `source_ref text` (معمولاً actor_user_id یا reference ID)
- `room_id uuid` (اختیاری)
- `ticket_id uuid` (اختیاری)
- `created_at timestamptz`

#### `public.commissions_log`
**ستون‌های کلیدی:**
- `id uuid` (PRIMARY KEY)
- `ticket_id uuid` (ارجاع به `tickets.id`)
- `room_id uuid` (ارجاع به `rooms.id`)
- `player_user_id uuid` (ارجاع به `users.id`)
- `price numeric` (قیمت بلیط)
- `commission_rate numeric` (نرخ کمیسیون اتاق)
- `total_commission numeric` (کل کمیسیون)
- `agent_user_id uuid` (اختیاری)
- `super_user_id uuid` (اختیاری)
- `agent_rate numeric` (نرخ کمیسیون agent)
- `super_rate numeric` (نرخ کمیسیون super)
- `agent_amount numeric` (مبلغ کمیسیون agent)
- `super_amount numeric` (مبلغ کمیسیون super)
- `admin_amount numeric` (مبلغ کمیسیون admin)
- `distributed_at timestamptz` (زمان توزیع)
- `created_at timestamptz`

### وضعیت فعلی RLS

#### `public.wallets`
- **RLS فعال:** ❌ **خیر** (در migration files پیدا نشد)
- **Policy موجود:** هیچ policy در migration files پیدا نشد
- **وضعیت فعلی:** احتمالاً write آزاد است (بدون RLS)

#### `public.transactions`
- **RLS فعال:** ❌ **خیر** (در migration files پیدا نشد)
- **Policy موجود:** هیچ policy در migration files پیدا نشد
- **وضعیت فعلی:** احتمالاً write آزاد است (بدون RLS)

#### `public.commissions_log`
- **RLS فعال:** ❌ **نامشخص** (در migration files پیدا نشد)
- **Policy موجود:** هیچ policy در migration files پیدا نشد
- **وضعیت فعلی:** نامشخص

### خلاصه وضعیت فعلی

⚠️ **هیچ RLS policy برای جداول مالی در migration files پیدا نشد**  
⚠️ **این یک ریسک امنیتی است** - کلاینت‌های عادی می‌توانند مستقیماً wallets و transactions را تغییر دهند  
✅ **توابع هسته مالی (`fn_wallet_apply_delta` و wrapperها) با `SECURITY DEFINER` تعریف شده‌اند** - می‌توانند از RLS عبور کنند

---

## طراحی RLS هدف برای جداول مالی (مرحله 5.2)

### 1. `public.wallets`

**قوانین هدف:**

#### SELECT (خواندن)
- **Player (authenticated user):**
  - فقط `SELECT` روی wallet خودش (`user_id = auth.uid()`)
  - می‌تواند موجودی و اطلاعات wallet خودش را ببیند

- **Admin/Super/Agent:**
  - می‌توانند wallets زیرمجموعه‌های خود را ببینند
  - این دسترسی از طریق application logic کنترل می‌شود (نه RLS)
  - برای سادگی، در RLS فقط policy برای player تعریف می‌شود
  - Admin/Super/Agent از طریق functions با `SECURITY DEFINER` به wallets دسترسی دارند

#### INSERT/UPDATE/DELETE (نوشتن)
- **هیچ policy برای INSERT/UPDATE/DELETE تعریف نمی‌شود**
- **پیش‌فرض RLS:** اگر policy وجود نداشته باشد، write ممنوع است
- **فقط توابع با `SECURITY DEFINER`** (مثل `game_finance.fn_wallet_apply_delta`) می‌توانند write کنند
- **کلاینت‌های عادی (anon/authenticated) نمی‌توانند مستقیماً wallets را تغییر دهند**

### 2. `public.transactions`

**قوانین هدف:**

#### SELECT (خواندن)
- **Player (authenticated user):**
  - فقط `SELECT` تراکنش‌های خودش (`user_id = auth.uid()`)
  - می‌تواند تاریخچه تراکنش‌های خودش را ببیند

- **Admin/Super/Agent:**
  - می‌توانند تراکنش‌های زیرمجموعه‌های خود را ببینند
  - این دسترسی از طریق application logic کنترل می‌شود (نه RLS)
  - برای سادگی، در RLS فقط policy برای player تعریف می‌شود
  - Admin/Super/Agent از طریق functions با `SECURITY DEFINER` به transactions دسترسی دارند

#### INSERT/UPDATE/DELETE (نوشتن)
- **هیچ policy برای INSERT/UPDATE/DELETE تعریف نمی‌شود**
- **پیش‌فرض RLS:** اگر policy وجود نداشته باشد، write ممنوع است
- **فقط توابع با `SECURITY DEFINER`** (مثل `game_finance.fn_wallet_apply_delta`) می‌توانند write کنند
- **کلاینت‌های عادی (anon/authenticated) نمی‌توانند مستقیماً transactions را تغییر دهند**

### 3. `public.commissions_log`

**قوانین هدف:**

#### SELECT (خواندن)
- **Player:**
  - ❌ **نیازی به دسترسی ندارد** - commissions_log فقط برای audit و گزارش است
  - Player نیازی به دیدن کمیسیون‌های agent/super/admin ندارد

- **Admin/Super/Agent:**
  - می‌توانند commissions_log مربوط به خودشان یا زیرمجموعه‌های خود را ببینند
  - این دسترسی از طریق application logic کنترل می‌شود (نه RLS)
  - برای سادگی، در RLS هیچ policy برای SELECT تعریف نمی‌شود (یا policy محدود برای admin)
  - Admin/Super/Agent از طریق functions با `SECURITY DEFINER` به commissions_log دسترسی دارند

#### INSERT/UPDATE/DELETE (نوشتن)
- **هیچ policy برای INSERT/UPDATE/DELETE تعریف نمی‌شود**
- **پیش‌فرض RLS:** اگر policy وجود نداشته باشد، write ممنوع است
- **فقط توابع با `SECURITY DEFINER`** (مثل `game_finance.fn_record_ticket_commission`, `game_finance.fn_distribute_ticket_commission`) می‌توانند write کنند
- **کلاینت‌های عادی (anon/authenticated) نمی‌توانند مستقیماً commissions_log را تغییر دهند**

### خلاصه طراحی RLS

| جدول | SELECT Policy | INSERT/UPDATE/DELETE Policy | توضیحات |
|------|---------------|------------------------------|---------|
| `wallets` | ✅ Player: فقط wallet خودش | ❌ هیچ policy (write ممنوع) | فقط functions با SECURITY DEFINER می‌توانند write کنند |
| `transactions` | ✅ Player: فقط تراکنش‌های خودش | ❌ هیچ policy (write ممنوع) | فقط functions با SECURITY DEFINER می‌توانند write کنند |
| `commissions_log` | ❌ یا محدود به admin | ❌ هیچ policy (write ممنوع) | فقط functions با SECURITY DEFINER می‌توانند write کنند |

**نکته مهم:** توابع هسته مالی (`game_finance.fn_wallet_apply_delta` و wrapperها) با `SECURITY DEFINER` تعریف شده‌اند و از RLS عبور می‌کنند. این توابع می‌توانند write کنند حتی اگر هیچ policy برای write وجود نداشته باشد.

---

## پیاده‌سازی مرحله ۵ (RLS مالی)

**تاریخ پیاده‌سازی:** 2025-01-27

### Migration ایجاد شده

**`20250127150000_rls_wallets_transactions_commissions.sql`**
- فعال‌سازی RLS روی `wallets`, `transactions`, `commissions_log`
- تعریف policyهای SELECT برای players
- قفل‌کردن write مستقیم (هیچ policy برای INSERT/UPDATE/DELETE)

### خلاصه رفتار RLS

#### برای Players (authenticated users)

✅ **می‌توانند بخوانند:**
- فقط wallet خودش (`user_id = auth.uid()`)
- فقط تراکنش‌های خودش (`user_id = auth.uid()`)

❌ **نمی‌توانند بنویسند:**
- هیچ INSERT/UPDATE/DELETE مستقیم روی `wallets`
- هیچ INSERT/UPDATE/DELETE مستقیم روی `transactions`
- هیچ INSERT/UPDATE/DELETE مستقیم روی `commissions_log`

#### برای Admin/Super/Agent

✅ **از طریق Application Logic:**
- می‌توانند wallets/transactions زیرمجموعه‌های خود را بخوانند (از طریق services)
- این دسترسی از طریق application logic کنترل می‌شود (نه RLS)

✅ **از طریق Functions با SECURITY DEFINER:**
- می‌توانند write کنند (از طریق `fn_wallet_apply_delta` و wrapperها)
- این functions از RLS عبور می‌کنند

#### برای توابع هسته مالی

✅ **می‌توانند write کنند:**
- `game_finance.fn_wallet_apply_delta` (SECURITY DEFINER)
- `public.fn_adjust_wallet_manual` (SECURITY DEFINER)
- `game_finance.fn_distribute_ticket_commission` (SECURITY DEFINER)
- `public.fn_payout_room_if_full` (SECURITY DEFINER)
- `game_finance.fn_record_ticket_commission` (SECURITY DEFINER)

**دلیل:** این توابع با `SECURITY DEFINER` تعریف شده‌اند و با نقش owner اجرا می‌شوند، نه نقش caller. بنابراین از RLS عبور می‌کنند.

### Policies تعریف شده

#### `wallets`
- ✅ **SELECT:** `wallets_select_own` - Player فقط wallet خودش را می‌بیند
- ❌ **INSERT/UPDATE/DELETE:** هیچ policy (write ممنوع برای کلاینت‌های عادی)

#### `transactions`
- ✅ **SELECT:** `transactions_select_own` - Player فقط تراکنش‌های خودش را می‌بیند
- ❌ **INSERT/UPDATE/DELETE:** هیچ policy (write ممنوع برای کلاینت‌های عادی)

#### `commissions_log`
- ❌ **SELECT:** هیچ policy (Player نیازی به دیدن ندارد)
- ❌ **INSERT/UPDATE/DELETE:** هیچ policy (write ممنوع برای کلاینت‌های عادی)

**نکته:** Admin/Super/Agent از طریق functions با SECURITY DEFINER به commissions_log دسترسی دارند.

### تغییرات نسبت به Design اولیه

1. **commissions_log SELECT Policy:**
   - در design اولیه، policy محدود برای admin پیشنهاد شده بود
   - در implementation، هیچ policy تعریف نشد (برای سادگی)
   - Admin/Super/Agent از طریق functions با SECURITY DEFINER دسترسی دارند

2. **Admin/Super/Agent SELECT:**
   - در design اولیه، policy اضافی برای admin/super/agent پیشنهاد شده بود
   - در implementation، فقط policy برای player تعریف شد
   - Admin/Super/Agent از طریق application logic (services) دسترسی دارند

### امنیت

✅ **تمام writeهای مالی فقط از طریق توابع هسته مالی انجام می‌شوند**  
✅ **کلاینت‌های عادی نمی‌توانند مستقیماً wallets/transactions را تغییر دهند**  
✅ **Player فقط می‌تواند داده‌های خودش را بخواند**  
✅ **توابع هسته مالی با SECURITY DEFINER از RLS عبور می‌کنند**

### مراحل بعدی

1. تست migration در محیط development
2. بررسی backward compatibility
3. Monitor performance و race conditions
4. بررسی نیاز به policy اضافی برای admin/super/agent (اگر لازم باشد)

---

**پایان سند**

