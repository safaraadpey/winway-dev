# API: `api_get_room_state` – مستند اسنپ‌شات روم بینگو

این سند معماری تکه‌ای از سیستم را توضیح می‌دهد که وضعیت کامل یک روم (Room) را در قالب یک JSON واحد به فرانت‌اند برمی‌گرداند.

## 1. هدف

- گرفتن **اسنپ‌شات کامل** از یک روم با یک کال
- استفاده در:
  - صفحه‌ی بازی پلیر
  - صفحه‌ی تماشاچی
  - صفحه‌ی ادمین برای مانیتورینگ
- داده‌ها از سه جدول می‌آیند:
  - `rooms`
  - `tickets`
  - `draws`

## 2. ساختار جدول‌ها (خلاصه)

### 2.1. جدول `rooms`

ستون‌های مهم:

- `id :: uuid` – شناسه روم
- `room_code :: text`
- `title :: text`
- `status :: room_status`
- `card_price :: numeric`
- `currency :: text`
- `max_players :: int4`
- `max_cards_per_player :: int4`
- `seed :: text`
- `ding_per_number :: numeric`
- `starts_at :: timestamptz`
- `ends_at :: timestamptz`
- `meta :: jsonb`

### 2.2. جدول `tickets`

- `id :: uuid` – شناسه تیکت
- `room_id :: uuid` – FK → rooms.id
- `player_user_id :: uuid`
- `pool_card_id :: int8` (برای اتصال به کارت‌پول)
- `card_no :: int2` – شماره کارت در روم
- `reservation_status :: reservation_status`
- `transaction_id :: uuid`
- `expires_at :: timestamptz`
- `claimed_bingo_at :: timestamptz`
- `is_verified_win :: bool`
- `created_at :: timestamptz`

### 2.3. جدول `draws`

- `id :: uuid`
- `room_id :: uuid` – FK → rooms.id
- `number :: int4` – عدد قرعه (۱–۹۰)
- `timestamp :: timestamptz` (اختیاری)
- `created_at :: timestamptz`

## 3. ایندکس‌ها

برای پرفورمنس بهتر، ایندکس‌های زیر توصیه می‌شوند:

```sql
-- tickets
create index if not exists idx_tickets_room_id
  on public.tickets (room_id);

create index if not exists idx_tickets_room_player
  on public.tickets (room_id, player_user_id);

-- draws
create index if not exists idx_draws_room_id
  on public.draws (room_id);

create index if not exists idx_draws_room_created_at
  on public.draws (room_id, created_at);

alter table public.draws
  add constraint if not exists draws_room_number_uniq
  unique (room_id, number);
```

## 4. تعریف فانکشن `api_get_room_state`

**Schema:** `game_core`

```sql
create or replace function game_core.api_get_room_state(p_room_id uuid)
returns jsonb
language sql
stable
as $$
  select jsonb_build_object(
    -- 🏠 اطلاعات روم
    'room', jsonb_build_object(
      'id', r.id,
      'room_code', r.room_code,
      'title', r.title,
      'status', r.status,
      'card_price', r.card_price,
      'currency', r.currency,
      'max_players', r.max_players,
      'max_cards_per_player', r.max_cards_per_player,
      'seed', r.seed,
      'ding_per_number', r.ding_per_number,
      'starts_at', r.starts_at,
      'ends_at', r.ends_at,
      'meta', coalesce(r.meta, '{}'::jsonb)
    ),

    -- 🎴 تیکت‌های این روم
    'tickets', (
      select coalesce(
        jsonb_agg(
          jsonb_build_object(
            'ticket_id', t.id,
            'player_user_id', t.player_user_id,
            'card_no', t.card_no,
            'pool_card_id', t.pool_card_id,
            'reservation_status', t.reservation_status,
            'transaction_id', t.transaction_id,
            'expires_at', t.expires_at,
            'claimed_bingo_at', t.claimed_bingo_at,
            'is_verified_win', t.is_verified_win,
            'created_at', t.created_at
          )
          order by t.card_no
        ),
        '[]'::jsonb
      )
      from public.tickets t
      where t.room_id = r.id
    ),

    -- 🎯 قرعه‌های این روم
    'draws', (
      select coalesce(
        jsonb_agg(
          jsonb_build_object(
            'id', d.id,
            'number', d.number,
            'timestamp', d."timestamp",
            'created_at', d.created_at
          )
          order by d.created_at
        ),
        '[]'::jsonb
      )
      from public.draws d
      where d.room_id = r.id
    )
  )
  from public.rooms r
  where r.id = p_room_id;
$$;
```

## 5. قرارداد خروجی

ساختار کلی JSON خروجی:

```json
{
  "room": { ... },
  "tickets": [
    {
      "ticket_id": "uuid",
      "player_user_id": "uuid",
      "card_no": 1,
      "pool_card_id": 123,
      "reservation_status": "confirmed",
      "transaction_id": "uuid",
      "expires_at": "2025-11-16T20:00:00Z",
      "claimed_bingo_at": null,
      "is_verified_win": false,
      "created_at": "..."
    }
  ],
  "draws": [
    { "id": "uuid", "number": 5, "timestamp": "...", "created_at": "..." }
  ]
}
```

## 6. استفاده در فرانت‌اند (TypeScript + Supabase JS)

```ts
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

export type RoomSnapshot = {
  room: {
    id: string;
    room_code: string;
    title: string;
    status: string;
    card_price: string;
    currency: string;
    max_players: number | null;
    max_cards_per_player: number | null;
    seed: string | null;
    ding_per_number: string | null;
    starts_at: string | null;
    ends_at: string | null;
    meta: Record<string, any>;
  };
  tickets: Array<{
    ticket_id: string;
    player_user_id: string | null;
    card_no: number | null;
    pool_card_id: number | null;
    reservation_status: string;
    transaction_id: string | null;
    expires_at: string | null;
    claimed_bingo_at: string | null;
    is_verified_win: boolean;
    created_at: string;
  }>;
  draws: Array<{
    id: string;
    number: number;
    timestamp: string | null;
    created_at: string;
  }>;
};

export async function fetchRoomSnapshot(roomId: string) {
  const { data, error } = await supabase
    .rpc('api_get_room_state', { p_room_id: roomId })
    .select('*')
    .single();

  if (error) throw error;

  return data as RoomSnapshot;
}
```

## 7. Realtime برای قرعه‌های جدید

پس از لود اولیه‌ی اسنپ‌شات، برای دریافت قرعه‌های جدید از Supabase Realtime روی جدول `draws` استفاده می‌شود:

```ts
function subscribeToDraws(roomId: string, onNewNumber: (num: number) => void) {
  const channel = supabase
    .channel(`room-${roomId}`)
    .on(
      'postgres_changes',
      {
        event: 'INSERT',
        schema: 'public',
        table: 'draws',
        filter: `room_id=eq.${roomId}`,
      },
      (payload) => {
        const newNumber = (payload.new as any).number as number;
        onNewNumber(newNumber);
      }
    )
    .subscribe();

  return () => {
    supabase.removeChannel(channel);
  };
}
```

الگوی استفاده در صفحه‌ی بازی:

1. هنگام ورود به صفحه:
   - `fetchRoomSnapshot(roomId)` → ساختن UI اولیه (کارت‌ها + اعداد قبلی)
2. سپس:
   - `subscribeToDraws(roomId, addNewNumber)` → هر عدد جدید فقط به آرایه‌ی `drawnNumbers` اضافه می‌شود و انیمیشن‌ها اجرا می‌شوند.

این سند برای استفاده در فولدر فرانت و درک معماری اسنپ‌شات روم نوشته شده است.

