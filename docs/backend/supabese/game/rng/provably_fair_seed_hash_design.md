# Provably Fair RNG with `room_seed` / `room_seed_hash`

این سند معماری کامل سیستم *Provably Fair* را برای روم‌های بینگو در لایه دیتابیس توضیح می‌دهد؛ یعنی:

- چطور برای هر روم یک **Seed مخفی** و یک **Hash عمومی** تولید می‌کنیم
- چطور کارت‌ها (tickets) و قرعه‌ها (draws) را به‌صورت **Deterministic و قابل‌اثبات** بر اساس همین Seed تولید می‌کنیم
- چطور از طریق RPCها امکان **Commitment** (قبل بازی) و **Reveal** (بعد بازی) را برقرار می‌کنیم.

این سیستم طوری طراحی شده که:

- سرور نتواند بعداً Seed را عوض کند (به‌خاطر Hash قبلی)
- کاربران بتوانند بعد از پایان بازی، با استفاده از Seed و کدهای public، مسیر تولید کارت‌ها و قرعه‌ها را خودشان بازتولید و اعتبارسنجی کنند.

---

## 1. ساختار دیتابیس

### 1.1. ستون‌های Seed در جدول `rooms`

در جدول `public.rooms` سه ستون مرتبط با Seed وجود دارد:

```sql
-- ستون‌های موجود در rooms:
room_seed         bytea,           -- Seed مخفی (32 بایت)
room_seed_hash    char(64),        -- Hash عمومی (SHA-256 hex)
seed_revealed_at  timestamptz      -- زمان افشای seed (NULL تا پایان بازی)
```

- `room_seed` (bytea) → یک مقدار باینری تصادفی (32 بایت) که فقط در سرور نگهداری می‌شود
- `room_seed_hash` (char(64)) → هش SHA-256 از همین Seed، به صورت رشته هگز ۶۴ کاراکتری
- `seed_revealed_at` (timestamptz) → زمان افشای seed (NULL تا پایان بازی)

**نکته:** ستون قدیمی `seed` (text) هنوز وجود دارد اما deprecated است و باید از `room_seed` استفاده شود.

این ستون‌ها برای هر روم فقط **یک‌بار** مقداردهی می‌شوند و بعد از آن ثابت می‌مانند.

---

## 2. تولید Seed و Hash برای هر روم

### 2.1. تابع تولید Seed: `fn_generate_room_seed()`

تابع کمکی در اسکیما `game_core`:

```sql
create or replace function game_core.fn_generate_room_seed()
returns table (
  seed      bytea,
  seed_hash char(64)
)
language plpgsql
as $$
begin
  seed := gen_random_bytes(32);
  seed_hash := encode(digest(seed, 'sha256'), 'hex');
  return next;
end;
$$;
```

- `seed` با `gen_random_bytes(32)` تولید می‌شود
- `seed_hash` هش SHA-256 همین Seed است

### 2.2. استفاده در ساخت روم: `rpc_join_or_create_room_and_reserve_tickets`

در فانکشنی که روم را می‌سازد یا به روم منتظر join می‌کند، اگر روم در حال انتظار (`waiting`) وجود نداشته باشد، روم جدید ساخته می‌شود و در همان لحظه Seed و Hash تولید و ذخیره می‌شوند:

```sql
select seed, seed_hash
  into v_room_seed, v_room_seed_hash
from game_core.fn_generate_room_seed();

insert into public.rooms(
  id, room_template_id, status,
  card_price, currency, pool_id,
  starts_at, created_by, meta,
  min_players, countdown_sec, max_cards_per_player,
  room_seed, room_seed_hash,
  created_at, updated_at
)
values (
  gen_random_uuid(),
  p_template_id,
  'waiting'::room_status,
  v_price, v_currency, v_pool,
  ...,  -- منطق starts_at (normal / tournament)
  v_min_players, v_cd, v_max_cards_pp,
  v_room_seed, v_room_seed_hash,
  v_now, v_now
)
returning id, starts_at into v_room, starts_at;

-- seed_revealed_at در این مرحله NULL است و بعد از پایان بازی تنظیم می‌شود
```

از این لحظه به بعد:

- `room_seed` برای تولید کارت‌ها و قرعه‌ها استفاده می‌شود
- `room_seed_hash` برای commitment به بازیکن‌ها قابل نمایش است.

---

## 3. استفاده از Seed برای تخصیص کارت‌ها (Tickets)

### 3.1. هدف

وقتی یک بازیکن کارت رزرو می‌کند، کارت‌ها باید:

- از `card_pool_cards` انتخاب شوند
- برای هر روم **به‌شکل deterministic** و بر اساس Seed مرتب شده باشند
- برای Normal فقط از محدوده‌ی کوچک (مثلاً ۲۰۰ کارت اول)، و برای Tournament از کل مخزن استفاده شود.

### 3.2. منطق انتخاب کارت در `rpc_join_or_create_room_and_reserve_tickets`

در مرحله‌ی ۶ این فانکشن، کارت‌ها از pool بر اساس Seed مرتب می‌شوند:

```sql
-- v_room_type از room_templates می‌آید: 'normal' یا 'tournament'

for r_card in
  select c.id as pool_card_id, c.card_no
    from public.card_pool_cards c
   where c.pool_id = v_pool
     and (
       v_room_type = 'tournament'
       or c.card_no <= 200          -- برای Normal فقط ۲۰۰ کارت اول
     )
     and not exists (
       select 1
       from public.tickets t
       where t.pool_card_id = c.id
         and t.room_id      = v_room
         and t.reservation_status in ('reserved','paid')
     )
   order by digest(
     encode(v_room_seed, 'hex') || ':' || c.id::text,
     'sha256'
   )
   limit p_card_count
   for update skip locked
loop
  ...  -- صدور ticket و اضافه کردن به v_ticket_ids
end loop;
```

نکات:

- برای هر کارت `c.id`، یک هش از رشته‌ی
  `room_seed_hex || ':' || c.id` گرفته می‌شود
- کارت‌ها بر اساس این هش مرتب می‌شوند → ترتیب deterministic وابسته به Seed
- `NOT EXISTS` تضمین می‌کند که کارت دوبار در یک روم استفاده نشود
- `FOR UPDATE SKIP LOCKED` جلوی رقابت هم‌زمان را می‌گیرد (Concurrency-safe)

نتیجه:

- هر بازیکن کارت‌هایی می‌گیرد که **کاملاً قابل‌اثبات‌اند**؛
- هر کسی که Seed را بداند، می‌تواند همین ترتیب را دوباره بسازد.

---

## 4. استفاده از Seed برای قرعه‌کشی (`draws`)

### 4.1. هدف

برای هر روم، ترتیب قرعه‌های ۱ تا ۹۰ باید:

- ثابت
- قابل بازتولید
- و بر اساس `room_seed` باشد

نه `random()`.

### 4.2. منطق در `fn_manage_room_live_actions`

تابع `game_core.fn_manage_room_live_actions()` (دیلر دیتابیسی) برای هر روم در حال بازی، با استفاده از `room_seed` عدد جدید قرعه را انتخاب می‌کند:

```sql
declare
  v_now   timestamptz := now();
  v_drew  int := 0;
  v_eval  int := 0;
  v_fin   int := 0;
  r_room  record;
  v_next  int;
begin
  for r_room in
    select id, room_seed
    from public.rooms
    where status = 'playing'::room_status
      and next_draw_at is not null
      and next_draw_at <= v_now
    for update skip locked
  loop
    if r_room.room_seed is null then
      raise exception 'room % has no room_seed but is playing', r_room.id;
    end if;

    -- انتخاب شماره جدید بر اساس room_seed
    select g.n
      into v_next
    from (
      select generate_series(1, 90) as n
    ) g
    where not exists (
      select 1
      from public.draws d
      where d.room_id = r_room.id
        and d.number  = g.n
    )
    order by digest(
      encode(r_room.room_seed, 'hex') || ':' || g.n::text,
      'sha256'
    )
    limit 1;

    if v_next is null then
      update public.rooms
         set status = 'finished'::room_status,
             updated_at = v_now
       where id = r_room.id;

      v_fin := v_fin + 1;
      continue;
    end if;

    insert into public.draws (id, room_id, number, "timestamp", created_at)
    values (gen_random_uuid(), r_room.id, v_next, v_now, v_now);

    update public.rooms
       set next_draw_at = v_now + interval '3 seconds',
           updated_at   = v_now
     where id = r_room.id;

    v_drew := v_drew + 1;
  end loop;

  return query select v_drew, v_eval, v_fin;
end;
```

- در هر step، اعدادی که قبلاً برای آن روم کشیده نشده‌اند فیلتر می‌شوند
- از بین باقی‌مانده‌ها، مرتب‌سازی بر اساس Seed انجام می‌شود
- اولین عدد در ترتیب → قرعه‌ی جدید

به این ترتیب، ترتیب کامل قرعه‌های ۱ تا ۹۰ برای هر روم **ثابت و قابل بازسازی** است.

---

## 5. RPCها برای Commitment و Reveal

### 5.1. گرفتن Hash برای نمایش به کاربر: `rpc_get_room_seed_hash`

این RPC فقط Hash را برمی‌گرداند (نه خود Seed):

```sql
create or replace function game_core.rpc_get_room_seed_hash(
  p_room_id uuid
)
returns char(64)
language plpgsql
as $$
declare
  v_hash char(64);
begin
  select room_seed_hash
    into v_hash
  from public.rooms
  where id = p_room_id;

  if v_hash is null then
    raise exception 'room % not found or has no room_seed_hash', p_room_id;
  end if;

  return v_hash;
end;
$$;
```

کاربرد:

- قبل شروع بازی یا هنگام نمایش اطلاعات روم
- برای نمایش «Committed Seed Hash» به کاربر

### 5.2. ریویل Seed بعد از پایان بازی: `rpc_reveal_room_seed`

این RPC بعد از پایان بازی، Seed واقعی را برای audit برمی‌گرداند و `seed_revealed_at` را ثبت می‌کند:

```sql
create or replace function game_core.rpc_reveal_room_seed(
  p_room_id uuid,
  out room_id uuid,
  out room_seed bytea,
  out room_seed_hash char(64),
  out status room_status,
  out seed_revealed_at timestamptz
)
language plpgsql
as $$
declare
  v_now timestamptz := now();
begin
  select id, room_seed, room_seed_hash, status, seed_revealed_at
    into room_id, room_seed, room_seed_hash, status, seed_revealed_at
  from public.rooms
  where id = p_room_id;

  if room_id is null then
    raise exception 'room % not found', p_room_id;
  end if;

  if room_seed is null or room_seed_hash is null then
    raise exception 'room % has no seed or seed_hash', p_room_id;
  end if;

  if status <> 'finished' then
    raise exception 'room % is not finished yet (status = %)', p_room_id, status;
  end if;

  -- ثبت زمان افشای seed (اگر قبلاً ثبت نشده باشد)
  if seed_revealed_at is null then
    update public.rooms
    set seed_revealed_at = v_now
    where id = p_room_id;
    
    seed_revealed_at := v_now;
  end if;

  return;
end;
$$;
```

کاربرد:

- فقط بعد از پایان روم (`status = 'finished'`)
- برای اینکه سرور Seed را ریویل کند و هر کس بتواند:
  - دوباره Hash را روی Seed حساب کند و ببیند با `room_seed_hash` برابر است
  - بر اساس Seed، انتخاب کارت‌ها و ترتیب Drawها را بازتولید کند
- `seed_revealed_at` به صورت خودکار ثبت می‌شود

---

## 6. چرخهٔ کامل Provably Fair

1. **ساخت روم**
   - Seed و Hash تولید و در `rooms` ذخیره می‌شوند.

2. **Commitment**
   - از طریق `rpc_get_room_seed_hash`، Hash به کاربر/کلاینت نشان داده می‌شود.

3. **بازی**
   - کارت‌ها و Drawها بر اساس `room_seed` تولید می‌شوند (نه random()).

4. **پایان بازی**
   - روم به حالت `finished` می‌رود.

5. **Reveal**
   - از طریق `rpc_reveal_room_seed`، Seed واقعی منتشر می‌شود
   - `seed_revealed_at` به صورت خودکار ثبت می‌شود

6. **Audit** (مرحله آتی UI)
   - کلاینت‌ها با استفاده از Seed و الگوریتم‌های فوق، صحت کارت‌ها و ترتیب Draw را بازسازی و تأیید می‌کنند
   - می‌توانند `seed_revealed_at` را بررسی کنند تا ببینند seed چه زمانی افشا شده است

---

## 7. وضعیت فعلی و مراحل بعد

در وضعیت فعلی:

- تمام منطق Seed/Hash در دیتابیس پیاده‌سازی شده است
- تخصیص کارت و قرعه‌ها کاملاً Seed-based و deterministic است
- RPCهای لازم برای `commit` و `reveal` آماده هستند

مرحله‌های بعدی (در سطح اپلیکیشن/فرانت):

- نمایش `room_seed_hash` به کاربر در صفحه‌ی اطلاعات روم
- نمایش `room_seed` بعد از پایان بازی (برای کاربران پیشرفته یا صفحه‌ی Audit)
- پیاده‌سازی یک صفحه یا ابزار ساده برای بازتولید و بررسی کارت‌ها و Draw بر اساس Seed.

