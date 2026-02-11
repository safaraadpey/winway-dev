# Game Finance — Wallet & Commission Flow

این سند معماری فعلی زیرسیستم مالی را برای **کیف‌پول‌ها، تراکنش‌ها و کمیسیون بلیت‌ها** شرح می‌دهد.

## 1. جداول کلیدی

### 1.1. جدول `wallets`

- یک کیف‌پول برای هر `(user_id, currency)`
- ستون‌های مهم:
  - `id :: uuid`
  - `user_id :: uuid`
  - `currency :: text`
  - `balance :: numeric` — موجودی آزاد
  - `locked_amount :: numeric` — مبلغ قفل‌شده (برای موارد آینده)
  - `created_at`, `updated_at`

### 1.2. جدول `transactions`

- لاگ کامل تمام تغییرات اعمال‌شده روی کیف‌پول‌ها.
- ستون‌های مهم:
  - `id :: uuid`
  - `wallet_id :: uuid`
  - `user_id :: uuid`
  - `type :: text`  
    مثال‌ها: `deposit`, `withdraw`, `bet`, `prize_payout`, `fee_agent`, `fee_super`, `fee_admin`, …
  - `status :: text` — فعلاً معمولاً `completed`
  - `amount :: numeric` — همواره **مقدار مثبت** (قدر مطلق delta)
  - `currency :: text`
  - `description :: text`
  - `balance_before :: numeric`
  - `balance_after :: numeric`
  - `source_kind :: text` — نوع منبع، مثال: `ticket_commission`, `room_prize`, …
  - `source_ref :: text` — شناسهٔ مرجع (دلخواه، مثلاً `room_id` یا `ticket_id` به‌صورت string)
  - `room_id :: uuid NULL` — در صورت مرتبط بودن با روم
  - `ticket_id :: uuid NULL` — در صورت مرتبط بودن با تیکت
  - `created_at :: timestamptz`

### 1.3. جدول `commissions_log`

- برای هر تیکت، خلاصهٔ کمیسیون قابل توزیع را نگه می‌دارد.
- ستون‌های مهم:
  - `id :: uuid`
  - `ticket_id :: uuid`
  - `room_id :: uuid`
  - `player_user_id :: uuid`
  - `price :: numeric`
  - `commission_rate :: numeric` — نرخ روم/تمپلیت
  - `total_commission :: numeric`
  - `agent_user_id :: uuid NULL`
  - `super_user_id :: uuid NULL`
  - `agent_rate`, `super_rate :: numeric`
  - `agent_amount`, `super_amount`, `admin_amount :: numeric`
  - `distributed_at :: timestamptz NULL` — اگر مقدار داشته باشد یعنی کمیسیون این تیکت **کامل توزیع شده** است.

---

## 2. موتور کیف‌پول: `game_finance.fn_wallet_apply_delta`

### 2.1. امضا

```sql
game_finance.fn_wallet_apply_delta(
  p_user_id        uuid,
  p_currency       text,
  p_amount_delta   numeric,
  p_transaction_type text,
  p_source_kind    text,
  p_source_ref     text,
  p_description    text,
  p_meta           jsonb,
  p_allow_negative boolean DEFAULT false
) RETURNS uuid
```

### 2.2. رفتار

1. **یافتن یا ساختن والت** (با قفل optimistic):

   ```sql
   SELECT id, balance
   INTO v_wallet_id, v_wallet_balance
   FROM public.wallets
   WHERE user_id = p_user_id AND currency = p_currency
   FOR UPDATE;

   IF v_wallet_id IS NULL THEN
     INSERT INTO public.wallets (...)
     VALUES (p_user_id, p_currency, 0, 0, now(), now())
     RETURNING id, balance INTO v_wallet_id, v_wallet_balance;
   END IF;
   ```

2. **محاسبهٔ قبل و بعد:**

   ```sql
   v_balance_before := v_wallet_balance;
   v_balance_after  := v_balance_before + p_amount_delta;
   ```

3. **قوانین (Invariants):**

   - اگر `p_amount_delta = 0` → خطا: `zero amount not allowed`
   - اگر `p_allow_negative = FALSE` و `v_balance_after < 0` → خطا: `insufficient funds`

4. **استخراج `room_id` و `ticket_id` از `p_meta`:**

   ```sql
   IF p_meta IS NOT NULL THEN
     IF p_meta ? 'room_id' THEN
       v_room_id := (p_meta->>'room_id')::uuid;
     END IF;
     IF p_meta ? 'ticket_id' THEN
       v_ticket_id := (p_meta->>'ticket_id')::uuid;
     END IF;
   END IF;
   ```

5. **به‌روزرسانی والت:**

   ```sql
   UPDATE public.wallets
   SET balance = v_balance_after,
       updated_at = now()
   WHERE id = v_wallet_id;
   ```

6. **ثبت تراکنش:**

   ```sql
   INSERT INTO public.transactions (
     id,
     wallet_id,
     user_id,
     type,
     status,
     amount,
     currency,
     description,
     balance_before,
     balance_after,
     source_kind,
     source_ref,
     room_id,
     ticket_id,
     created_at
   )
   VALUES (
     gen_random_uuid(),
     v_wallet_id,
     p_user_id,
     p_transaction_type,
     'completed',
     ABS(p_amount_delta), -- همیشه مثبت
     p_currency,
     COALESCE(p_description, 'wallet adjustment'),
     v_balance_before,
     v_balance_after,
     p_source_kind,
     p_source_ref,
     v_room_id,
     v_ticket_id,
     now()
   )
   RETURNING id INTO v_transaction_id;
   ```

7. **خروجی:** `transaction_id :: uuid`

> **نکته طراحی:**  
> هر تغییر موجودی باید از این تابع عبور کند تا:
> - `wallets` و `transactions` همیشه هم‌خوان بمانند،
> - و سیستم برای حسابرسی و گزارش‌گیری آماده باشد.

---

## 3. کمیسیون بلیت‌ها

### 3.1. تریگر روی `tickets` (مصرف بلیت)

Trigger function:

```sql
BEGIN
  IF TG_OP = 'UPDATE'
     AND NEW.reservation_status = 'consumed'::reservation_status
     AND (OLD.reservation_status IS DISTINCT FROM 'consumed'::reservation_status) THEN

    PERFORM game_finance.fn_distribute_ticket_commission(NEW.id);
  END IF;
  RETURN NEW;
END;
```

رفتار:

- فقط وقتی `reservation_status` از هر حالت دیگری به `consumed` تغییر کند، فعال می‌شود.
- برای هر تیکت تنها یکبار کمیسیون، در لحظهٔ مصرف، توزیع می‌شود (در کنار idempotency داخلی).

### 3.2. `game_finance.fn_record_ticket_commission(p_ticket uuid)`

#### امضا

```sql
game_finance.fn_record_ticket_commission(p_ticket uuid) RETURNS uuid
```

#### رفتار

1. **Idempotent check:**

   ```sql
   SELECT id INTO v_id
   FROM public.commissions_log
   WHERE ticket_id = p_ticket;

   IF v_id IS NOT NULL THEN
     RETURN v_id;
   END IF;
   ```

2. **خواندن اطلاعات تیکت:**

   - باید `reservation_status = 'consumed'` باشد.
   - اگر نبود → خطا: `ticket % not found or not consumed`.

3. **نرخ کمیسیون روم:**

   ```sql
   SELECT COALESCE(r.commission_rate, rt.commission_rate, 0)
   INTO v_rate_room
   FROM public.rooms r
   LEFT JOIN public.room_templates rt ON rt.id = r.room_template_id
   WHERE r.id = v_room;
   ```

4. **شناخت Agent و Super پلیر (از `player_affiliation`)** و سپس نرخ‌های اختصاصی آنها (از `user_commissions`).

5. **محاسبهٔ مبلغ‌ها:**

   ```sql
   v_total_comm   := CEIL(v_price * v_rate_room);
   v_agent_amount := CEIL(v_total_comm * v_agent_rate);
   v_super_amount := CEIL(v_total_comm * GREATEST(v_super_rate - v_agent_rate, 0));
   v_admin_amount := GREATEST(v_total_comm - v_agent_amount - v_super_amount, 0);
   ```

6. **ثبت در `commissions_log`:**

   - شامل `total_commission`, `agent_amount`, `super_amount`, `admin_amount`, و نرخ‌های مربوطه.
   - `distributed_at` در این مرحله `NULL` می‌ماند.

7. **خروجی:** `id` رکورد `commissions_log`.

### 3.3. `game_finance.fn_distribute_ticket_commission(p_ticket uuid)`

#### امضا

```sql
game_finance.fn_distribute_ticket_commission(p_ticket uuid) RETURNS void
```

#### رفتار

1. **خواندن `commissions_log`**، و اگر نبود، یکبار `fn_record_ticket_commission` را صدا می‌زند و دوباره می‌خواند.

2. **Idempotency:**

   ```sql
   IF c.distributed_at IS NOT NULL THEN
     RETURN;
   END IF;
   ```

   اگر قبلاً توزیع شده باشد، هیچ کاری انجام نمی‌دهد.

3. **خواندن currency روم و یافتن یک `admin` (user با role = 'admin`).**

4. **توزیع به Agent (در صورت وجود):**

   - اگر `agent_user_id IS NOT NULL` و `agent_amount > 0`:
     - تلاش برای:

       ```sql
       SELECT game_finance.fn_wallet_apply_delta(
         p_user_id      := c.agent_user_id,
         p_currency     := v_currency,
         p_amount_delta := c.agent_amount,
         p_transaction_type := 'fee_agent',
         p_source_kind  := 'ticket_commission',
         p_source_ref   := NULL,
         p_description  := 'ticket commission (agent)',
         p_meta := jsonb_build_object('room_id', c.room_id, 'ticket_id', c.ticket_id),
         p_allow_negative := false
       ) INTO v_transaction_id;
       ```

     - در صورت هر خطا، مبلغ agent به `v_rollup_amount` اضافه می‌شود تا بعداً به admin برسد.

5. **توزیع به Super (در صورت وجود):**

   - دقیقاً مشابه Agent، با `p_transaction_type := 'fee_super'`.

6. **توزیع به Admin:**

   - مبلغ `admin_amount + v_rollup_amount` به کاربر admin واریز می‌شود:

     ```sql
     SELECT game_finance.fn_wallet_apply_delta(
       p_user_id      := v_admin_user,
       p_currency     := v_currency,
       p_amount_delta := c.admin_amount + v_rollup_amount,
       p_transaction_type := 'fee_admin',
       p_source_kind  := 'ticket_commission',
       p_source_ref   := NULL,
       p_description  := 'ticket commission (admin remainder)',
       p_meta := jsonb_build_object('room_id', c.room_id, 'ticket_id', c.ticket_id),
       p_allow_negative := false
     ) INTO v_transaction_id;
     ```

7. **علامت‌زدن log به‌عنوان توزیع‌شده:**

   ```sql
   UPDATE public.commissions_log
   SET distributed_at = now(),
       admin_amount   = c.admin_amount + v_rollup_amount
   WHERE id = c.id;
   ```

---

## 4. نمونهٔ سناریوهای مالی

### 4.1. مصرف بلیت و توزیع کمیسیون

1. وضعیت تیکت از `reserved/confirmed/...` → `consumed` می‌شود.
2. تریگر روی `tickets` → `fn_distribute_ticket_commission(ticket_id)` را صدا می‌زند.
3. اگر قبلاً `commissions_log` برای این تیکت وجود نداشته باشد، `fn_record_ticket_commission` آن را می‌سازد.
4. با توجه به لاگ:
   - سهم Agent، Super و Admin محاسبه و از طریق `fn_wallet_apply_delta` به کیف‌پول‌ها اعمال می‌شود.
5. `distributed_at` در `commissions_log` ست می‌شود تا دوباره توزیع نشود.

### 4.2. واریز جایزه به برنده (پیشنهاد طراحی)

برای پرداخت جایزهٔ روم به برنده، توصیه می‌شود از همان موتور `fn_wallet_apply_delta` استفاده شود:

```sql
SELECT game_finance.fn_wallet_apply_delta(
  p_user_id        := <winner_user_id>,
  p_currency       := <room_currency>,
  p_amount_delta   := <prize_amount>, -- مثبت
  p_transaction_type := 'prize_payout',
  p_source_kind    := 'room_prize',
  p_source_ref     := <room_id::text>,
  p_description    := 'room prize payout',
  p_meta           := jsonb_build_object('room_id', <room_id>, 'ticket_id', <optional_ticket_id>),
  p_allow_negative := false
);
```

به این ترتیب:

- تمام پرداخت‌های جایزه در جدول `transactions` قابل ردیابی است.
- موجودی برنده از طریق مکانیزم استاندارد کیف‌پول آپدیت می‌شود.
- گزارش‌های مالی (مثلاً مجموع جوایز پرداخت‌شده در یک روز/هفته/روم) به‌سادگی از روی `transactions` قابل تولید است.

---

## 5. خلاصهٔ طراحی

- **یک درگاه واحد برای تغییر کیف‌پول**:  
  `game_finance.fn_wallet_apply_delta` تنها نقطه‌ای است که `wallets.balance` را تغییر می‌دهد و همیشه یک `transaction` ثبت می‌کند.

- **کمیسیون تیکت‌ها دو مرحله‌ای است**:
  1. محاسبه و ثبت در `commissions_log` (`fn_record_ticket_commission`)
  2. توزیع عملی به کیف‌پول‌ها (`fn_distribute_ticket_commission` + `fn_wallet_apply_delta`)

- **تریگر روی tickets** تضمین می‌کند این فرآیند دقیقاً در لحظه‌ای که بلیت `consumed` می‌شود اتفاق بیفتد.

- **Idempotency**:
  - `fn_record_ticket_commission` روی هر `ticket_id` یک‌بار لاگ می‌سازد.
  - `fn_distribute_ticket_commission` اگر `distributed_at` پر شده باشد، دوباره پول توزیع نمی‌کند.

- این معماری، سیستم را برای:
  - حسابرسی (Auditing)
  - گزارش‌گیری دقیق
  - و توسعهٔ آینده (مثل prize payout، bonus، refund و …)
  
  آماده و قابل اتکا می‌کند.

