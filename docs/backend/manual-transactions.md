# مدیریت دستی تراکنش‌ها (واریز / برداشت از کیف پول کاربران)

این سند منطق بک‌اند برای واریز و برداشت دستی از کیف پول کاربران را توضیح می‌دهد.  
ادمین / ایجنت / سوپر از طریق پنل مدیریت تراکنش‌ها از این قابلیت استفاده می‌کنند.

---

## 1. جدول‌های درگیر

- `public.wallets`
  - `id uuid` – شناسه والت
  - `user_id uuid` – شناسه کاربر
  - `balance bigint` – موجودی فعلی (تومان/واحد ارزی)
  - `currency text` – نوع ارز (مثلاً `'IRR'`)
  - `locked_amount numeric` – مبلغ قفل‌شده (برای آینده)
  - `created_at timestamptz`
  - `updated_at timestamptz`

- `public.transactions`
  - `id uuid`
  - `wallet_id uuid`
  - `user_id uuid`
  - `type transaction_type` – مقدارهای مهم برای این ماژول:
    - `deposit`, `withdraw`, `adjustment`, `fee_admin`, `fee_agent`, `fee_super`, ...
  - `status transaction_status` – `pending`, `completed`, `failed`, `cancelled`, `settled`
  - `amount numeric`
  - `currency text`
  - `description text`
  - `balance_before numeric`
  - `balance_after numeric`
  - `source_kind text` – برای این ماژول: `'manual_panel'`
  - `source_ref text` – معمولاً `actor_user_id::text`
  - سایر ستون‌ها مربوط به بازی (room/ticket) هستند.

---

## 2. تابع `fn_adjust_wallet_manual`

### امضا

```sql
CREATE OR REPLACE FUNCTION public.fn_adjust_wallet_manual(
  p_target_user uuid,
  p_amount numeric,
  p_currency text,
  p_type transaction_type,
  p_description text DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER;
```

### منطق امنیتی

داخل تابع:

```sql
v_actor uuid := auth.uid();
select role into v_actor_role from public.users where id = v_actor;

IF v_actor_role NOT IN ('admin','agent','super') THEN
  RAISE EXCEPTION 'permission denied';
END IF;
```

- فقط کاربرانی که نقش آن‌ها در جدول `public.users` یکی از `admin`، `agent` یا `super` است می‌توانند از این تابع استفاده کنند.
- **player** ها حتی اگر RLS را دور بزنند، این تابع برایشان خطای `permission denied` می‌دهد.

### منطق به‌روزرسانی والت

1. والت کاربر هدف (`p_target_user`) برای ارز `p_currency` با `FOR UPDATE` خوانده می‌شود:

   ```sql
   SELECT * INTO v_wallet
   FROM public.wallets
   WHERE user_id = p_target_user AND currency = p_currency
   FOR UPDATE;
   ```

2. اگر والت وجود نداشته باشد، ساخته می‌شود:

   ```sql
   INSERT INTO public.wallets(user_id, balance, currency, locked_amount, created_at, updated_at)
   VALUES (p_target_user, 0, p_currency, 0, now(), now())
   RETURNING * INTO v_wallet;
   ```

3. مبلغ باید مثبت باشد:

   ```sql
   IF p_amount <= 0 THEN
     RAISE EXCEPTION 'amount must be positive';
   END IF;
   ```

4. جهت تغییر:

   ```sql
   IF p_type = 'deposit' THEN
     v_delta := p_amount;
   ELSIF p_type = 'withdraw' THEN
     v_delta := -p_amount;
   ELSE
     RAISE EXCEPTION 'unsupported transaction type %', p_type;
   END IF;
   ```

5. بررسی موجودی:

   ```sql
   v_before := v_wallet.balance;
   v_after := v_before + v_delta;

   IF v_after < 0 THEN
     RAISE EXCEPTION 'insufficient funds';
   END IF;
   ```

6. به‌روزرسانی والت:

   ```sql
   UPDATE public.wallets
   SET balance = v_after,
       updated_at = now()
   WHERE id = v_wallet.id;
   ```

7. ثبت تراکنش در جدول `transactions`:

   ```sql
   INSERT INTO public.transactions(
     id, wallet_id, user_id, type, status,
     amount, currency, description,
     balance_before, balance_after,
     source_kind, source_ref
   ) VALUES (
     gen_random_uuid(), v_wallet.id, p_target_user, p_type, 'completed',
     p_amount, p_currency, coalesce(p_description, 'manual panel adjustment'),
     v_before, v_after,
     'manual_panel', v_actor::text
   );
   ```

---

## 3. استفاده مستقیم در SQL

```sql
-- مثال: ادمین 100000 تومان به کاربر target واریز می‌کند
SELECT public.fn_adjust_wallet_manual(
  'target-user-uuid',
  100000,
  'IRR',
  'deposit',
  'admin panel deposit test'
);

-- مثال: برداشت 50000 تومان
SELECT public.fn_adjust_wallet_manual(
  'target-user-uuid',
  50000,
  'IRR',
  'withdraw',
  'manual withdraw by admin'
);
```

**توجه:** این تابع باید پشت RLS مناسب برای جدول‌های `wallets` و `transactions` قرار بگیرد (RLS جداگانه روی این جداول همچنان ضروری است).

---

## 4. ارتباط با Frontend

در لایه‌ی فرانت‌اند:

- فایل `services/transactions.ts`:

  ```ts
  export async function adjustWalletForUsersBulk(req: BulkAdjustRequest): Promise<void> {
    const { userIds, amount, action, currency = "IRR", description } = req;
    // ... validation ...

    const calls = userIds.map((userId) =>
      supabase.rpc("fn_adjust_wallet_manual", {
        p_target_user: userId,
        p_amount: amount,
        p_currency: currency,
        p_type: action,
        p_description: description ?? null,
      })
    );
    const results = await Promise.all(calls);
    // اگر یکی از callها خطا بدهد، error برگردانده می‌شود
  }
  ```

- این سرویس در کامپوننت `TransactionsManager` برای دکمه‌های «واریز» و «برداشت» استفاده می‌شود.


