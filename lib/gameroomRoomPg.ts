import { pgPool } from "@/lib/pg";

export type GameroomRoomLifecycle = {
  status: string;
  starts_at: string | null;
  waiting_started_at: string | null;
  updated_at: string | null;
  ends_at: string | null;
};

export type GameroomActiveCardRow = {
  user_id: string;
  display_name: string;
  card_count: number;
};

export type GameroomActiveTableRow = {
  room_id: string;
  room_code: string;
  players: number;
  card_count: number;
  prize: number;
};

export type GameroomSnapshotPg = {
  room: {
    id: string;
    template_id: string;
    room_code: string | null;
    title: string | null;
    status: string;
    card_price: number;
    currency: string;
    min_players: number | null;
    max_players: number | null;
    max_cards_per_player: number | null;
    starts_at: string | null;
    ends_at: string | null;
    waiting_started_at: string | null;
    updated_at: string | null;
    room_type: string | null;
    requires_password: boolean;
  };
  active_cards: GameroomActiveCardRow[];
  active_tables: GameroomActiveTableRow[];
  global_registration_locked: boolean;
  global_registration_lock_reason: string | null;
};

export type GameroomTemplatePreviewPg = {
  template: {
    id: string;
    name: string | null;
    room_type: string | null;
    price: number;
    currency: string;
    min_players: number | null;
    max_players: number | null;
    max_cards_per_player: number | null;
    status: string;
    requires_password: boolean;
  };
  active_tables: GameroomActiveTableRow[];
  global_registration_locked: boolean;
  global_registration_lock_reason: string | null;
};

const ACTIVE_TICKET_STATUSES = ["reserved", "confirmed", "consumed"] as const;

function toIso(value: unknown): string | null {
  if (value == null) return null;
  if (value instanceof Date) return value.toISOString();
  return String(value);
}

function templateRequiresPassword(password: string | null | undefined): boolean {
  return typeof password === "string" && password.trim().length > 0;
}

function mapLifecycleRow(row: {
  status: string;
  starts_at: Date | string | null;
  waiting_started_at: Date | string | null;
  updated_at: Date | string | null;
  ends_at: Date | string | null;
}): GameroomRoomLifecycle {
  return {
    status: String(row.status),
    starts_at: toIso(row.starts_at),
    waiting_started_at: toIso(row.waiting_started_at),
    updated_at: toIso(row.updated_at),
    ends_at: toIso(row.ends_at),
  };
}

export async function loadRoomLifecycleFromPg(
  roomId: string
): Promise<GameroomRoomLifecycle | null> {
  if (!pgPool) return null;

  try {
    const result = await pgPool.query<{
      status: string;
      starts_at: Date | string | null;
      waiting_started_at: Date | string | null;
      updated_at: Date | string | null;
      ends_at: Date | string | null;
    }>(
      `
      select
        r.status::text as status,
        r.starts_at,
        r.waiting_started_at,
        r.updated_at,
        r.ends_at
      from public.rooms r
      where r.id = $1::uuid
      `,
      [roomId]
    );

    const row = result.rows[0];
    if (!row) return null;
    return mapLifecycleRow(row);
  } catch (err) {
    console.error("[Room] loadRoomLifecycleFromPg error:", err);
    return null;
  }
}

export async function loadRoomLifecycleBatchFromPg(
  roomIds: string[]
): Promise<Map<string, GameroomRoomLifecycle> | null> {
  if (!pgPool || roomIds.length === 0) return null;

  try {
    const result = await pgPool.query<{
      id: string;
      status: string;
      starts_at: Date | string | null;
      waiting_started_at: Date | string | null;
      updated_at: Date | string | null;
      ends_at: Date | string | null;
    }>(
      `
      select
        r.id::text as id,
        r.status::text as status,
        r.starts_at,
        r.waiting_started_at,
        r.updated_at,
        r.ends_at
      from public.rooms r
      where r.id = any($1::uuid[])
      `,
      [roomIds]
    );

    const map = new Map<string, GameroomRoomLifecycle>();
    for (const row of result.rows) {
      map.set(row.id, mapLifecycleRow(row));
    }
    return map;
  } catch (err) {
    console.error("[Room] loadRoomLifecycleBatchFromPg error:", err);
    return null;
  }
}

type LifecycleSlice = {
  status?: string | null;
  starts_at?: string | null;
  waiting_started_at?: string | null;
  updated_at?: string | null;
  ends_at?: string | null;
};

export function resolveRoomLifecycleFields(
  _roomId: string,
  supabaseRoom: LifecycleSlice,
  pgLifecycle: GameroomRoomLifecycle | null | undefined,
  _source: string
): {
  status: string | null;
  starts_at: string | null;
  waiting_started_at: string | null;
  updated_at: string | null;
  ends_at: string | null;
  dataSource: "pg" | "supabase";
} {
  if (pgLifecycle != null) {
    return {
      status: pgLifecycle.status,
      starts_at: pgLifecycle.starts_at,
      waiting_started_at: pgLifecycle.waiting_started_at,
      updated_at: pgLifecycle.updated_at,
      ends_at: pgLifecycle.ends_at,
      dataSource: "pg",
    };
  }

  return {
    status: supabaseRoom.status ?? null,
    starts_at: supabaseRoom.starts_at ?? null,
    waiting_started_at: supabaseRoom.waiting_started_at ?? null,
    updated_at: supabaseRoom.updated_at ?? null,
    ends_at: supabaseRoom.ends_at ?? null,
    dataSource: "supabase",
  };
}

export type PlayingTablePgRow = {
  room_id: string;
  room_code: string;
  card_price: number;
  players: number;
  card_count: number;
};

export async function loadPlayingTablesFromPg(params: {
  templateId?: string | null;
  cardPrice?: number;
  currency?: string;
}): Promise<PlayingTablePgRow[] | null> {
  if (!pgPool) return null;

  const { templateId, cardPrice, currency } = params;
  if (!templateId && (cardPrice == null || !currency)) return null;

  try {
    const result = templateId
      ? await pgPool.query<{
          room_id: string;
          room_code: string;
          card_price: string | number;
          players: number;
          card_count: number;
        }>(
          `
          select
            r.id::text as room_id,
            r.room_code,
            r.card_price,
            count(distinct t.player_user_id)::int as players,
            count(t.id)::int as card_count
          from public.rooms r
          left join public.tickets t
            on t.room_id = r.id
           and t.reservation_status in ('reserved','confirmed','consumed')
          where r.status = 'playing'
            and r.room_template_id = $1::uuid
          group by r.id, r.room_code, r.card_price
          order by r.room_code
          `,
          [templateId]
        )
      : await pgPool.query<{
          room_id: string;
          room_code: string;
          card_price: string | number;
          players: number;
          card_count: number;
        }>(
          `
          select
            r.id::text as room_id,
            r.room_code,
            r.card_price,
            count(distinct t.player_user_id)::int as players,
            count(t.id)::int as card_count
          from public.rooms r
          left join public.tickets t
            on t.room_id = r.id
           and t.reservation_status in ('reserved','confirmed','consumed')
          where r.status = 'playing'
            and r.card_price = $1
            and r.currency = $2
          group by r.id, r.room_code, r.card_price
          order by r.room_code
          `,
          [cardPrice, currency]
        );

    return result.rows.map((row) => ({
      room_id: row.room_id,
      room_code: row.room_code,
      card_price: Number(row.card_price) || 0,
      players: Number(row.players) || 0,
      card_count: Number(row.card_count) || 0,
    }));
  } catch (err) {
    console.error("[Room] loadPlayingTablesFromPg error:", err);
    return null;
  }
}

type SnapshotQueryRow = {
  room_id: string;
  room_template_id: string;
  room_code: string | null;
  title: string | null;
  status: string;
  card_price: string | number;
  currency: string;
  min_players: number | null;
  max_players: number | null;
  max_cards_per_player: number | null;
  starts_at: Date | string | null;
  ends_at: Date | string | null;
  waiting_started_at: Date | string | null;
  updated_at: Date | string | null;
  room_type: string | null;
  template_password: string | null;
  active_cards: Array<{
    user_id: string;
    display_name: string;
    card_count: number;
  }> | null;
  active_tables: Array<{
    room_id: string;
    room_code: string;
    card_price: string | number;
    players: number;
    card_count: number;
  }> | null;
  global_registration_locked: boolean | null;
  global_registration_lock_reason: string | null;
};

const GAMEROOM_SNAPSHOT_SQL = `
with room_ctx as (
  select
    r.id,
    r.room_template_id,
    r.room_code,
    r.title,
    r.status::text as status,
    r.card_price,
    r.currency,
    r.min_players,
    r.max_players,
    r.max_cards_per_player,
    r.starts_at,
    r.ends_at,
    r.waiting_started_at,
    r.updated_at,
    rt.room_type,
    rt.password as template_password
  from public.rooms r
  left join public.room_templates rt on rt.id = r.room_template_id
  where r.id = $1::uuid
),
active_cards as (
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'user_id', s.user_id,
        'display_name', s.display_name,
        'card_count', s.card_count
      )
      order by s.display_name
    ),
    '[]'::jsonb
  ) as rows
  from (
    select
      t.player_user_id::text as user_id,
      count(*)::int as card_count,
      coalesce(up.nickname, u.username, t.player_user_id::text) as display_name
    from public.tickets t
    left join public.users u on u.id = t.player_user_id
    left join public.user_profiles up on up.user_id = t.player_user_id
    where t.room_id = $1::uuid
      and t.reservation_status in ('reserved','confirmed','consumed')
    group by t.player_user_id, up.nickname, u.username
  ) s
),
active_tables as (
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'room_id', s.room_id,
        'room_code', s.room_code,
        'card_price', s.card_price,
        'players', s.players,
        'card_count', s.card_count
      )
      order by s.room_code
    ),
    '[]'::jsonb
  ) as rows
  from (
    select
      r.id::text as room_id,
      r.room_code,
      r.card_price,
      count(distinct t.player_user_id)::int as players,
      count(t.id)::int as card_count
    from public.rooms r
    left join public.tickets t
      on t.room_id = r.id
     and t.reservation_status in ('reserved','confirmed','consumed')
    where r.status = 'playing'
      and r.room_template_id = (select room_template_id from room_ctx)
    group by r.id, r.room_code, r.card_price
    order by r.room_code
  ) s
),
lock_row as (
  select
    coalesce(arf.global_registration_locked, false) as global_registration_locked,
    arf.global_registration_lock_reason
  from public.app_runtime_flags arf
  where arf.id = true
  limit 1
)
select
  rc.id::text as room_id,
  rc.room_template_id::text as room_template_id,
  rc.room_code,
  rc.title,
  rc.status,
  rc.card_price,
  rc.currency,
  rc.min_players,
  rc.max_players,
  rc.max_cards_per_player,
  rc.starts_at,
  rc.ends_at,
  rc.waiting_started_at,
  rc.updated_at,
  rc.room_type,
  rc.template_password,
  (select rows from active_cards) as active_cards,
  (select rows from active_tables) as active_tables,
  coalesce((select global_registration_locked from lock_row), false) as global_registration_locked,
  (select global_registration_lock_reason from lock_row) as global_registration_lock_reason
from room_ctx rc
`;

export async function loadGameRoomSnapshotFromPg(
  roomId: string
): Promise<GameroomSnapshotPg | null> {
  if (!pgPool) return null;

  try {
    const result = await pgPool.query<SnapshotQueryRow>(GAMEROOM_SNAPSHOT_SQL, [
      roomId,
    ]);
    const row = result.rows[0];
    if (!row) return null;

    const cardsRaw = row.active_cards ?? [];
    const tablesRaw = row.active_tables ?? [];

    return {
      room: {
        id: row.room_id,
        template_id: row.room_template_id,
        room_code: row.room_code,
        title: row.title,
        status: row.status,
        card_price: Number(row.card_price) || 0,
        currency: row.currency || "IRR",
        min_players: row.min_players ?? null,
        max_players: row.max_players ?? null,
        max_cards_per_player: row.max_cards_per_player ?? null,
        starts_at: toIso(row.starts_at),
        ends_at: toIso(row.ends_at),
        waiting_started_at: toIso(row.waiting_started_at),
        updated_at: toIso(row.updated_at),
        room_type: row.room_type ?? null,
        requires_password: templateRequiresPassword(row.template_password),
      },
      active_cards: cardsRaw.map((c) => ({
        user_id: c.user_id,
        display_name: c.display_name,
        card_count: Number(c.card_count) || 0,
      })),
      active_tables: tablesRaw.map((t) => {
        const cardPrice = Number(t.card_price) || 0;
        const cardCount = Number(t.card_count) || 0;
        return {
          room_id: t.room_id,
          room_code: t.room_code,
          players: Number(t.players) || 0,
          card_count: cardCount,
          prize: cardPrice * cardCount,
        };
      }),
      global_registration_locked: Boolean(row.global_registration_locked),
      global_registration_lock_reason:
        row.global_registration_lock_reason ?? null,
    };
  } catch (err) {
    console.error("[Room] loadGameRoomSnapshotFromPg error:", err);
    return null;
  }
}

export async function resolveWaitingRoomIdForTemplateFromPg(
  templateId: string,
  userId: string,
  serverNowIso: string
): Promise<string | null> {
  if (!pgPool) return null;

  try {
    const result = await pgPool.query<{
      id: string;
      status: string;
      starts_at: Date | string | null;
      created_at: Date | string | null;
      has_user_tickets: boolean;
    }>(
      `
      with waiting_rooms as (
        select
          r.id,
          r.status::text as status,
          r.starts_at,
          r.created_at
        from public.rooms r
        where r.room_template_id = $1::uuid
          and r.status = 'waiting'
      ),
      user_rooms as (
        select distinct wr.id
        from waiting_rooms wr
        join public.tickets t on t.room_id = wr.id
        where t.player_user_id = $2::uuid
          and t.reservation_status in ('reserved','confirmed','consumed')
      )
      select
        wr.id::text as id,
        wr.status,
        wr.starts_at,
        wr.created_at,
        exists (select 1 from user_rooms ur where ur.id = wr.id) as has_user_tickets
      from waiting_rooms wr
      order by
        case when exists (select 1 from user_rooms ur where ur.id = wr.id) then 0 else 1 end,
        wr.starts_at desc nulls last,
        wr.created_at desc nulls last
      `,
      [templateId, userId]
    );

    const myRooms = result.rows.filter((r) => r.has_user_tickets);
    if (myRooms.length > 0) {
      return myRooms[0].id;
    }

    for (const row of result.rows) {
      const startsAt = toIso(row.starts_at);
      const status = row.status ?? "waiting";
      if (status === "waiting" && startsAt) {
        const startsMs = Date.parse(startsAt);
        const nowMs = Date.parse(serverNowIso);
        if (
          Number.isFinite(startsMs) &&
          Number.isFinite(nowMs) &&
          startsMs <= nowMs
        ) {
          continue;
        }
      }
      return row.id;
    }

    return null;
  } catch (err) {
    console.error("[Room] resolveWaitingRoomIdForTemplateFromPg error:", err);
    return null;
  }
}

export async function loadTemplatePreviewFromPg(
  templateId: string
): Promise<GameroomTemplatePreviewPg | null> {
  if (!pgPool) return null;

  try {
    const result = await pgPool.query<{
      id: string;
      name: string | null;
      room_type: string | null;
      price: string | number;
      currency: string;
      min_players: number | null;
      max_players: number | null;
      max_cards_per_player: number | null;
      status: string;
      password: string | null;
      active_tables: Array<{
        room_id: string;
        room_code: string;
        card_price: string | number;
        players: number;
        card_count: number;
      }> | null;
      global_registration_locked: boolean | null;
      global_registration_lock_reason: string | null;
    }>(
      `
      with template_row as (
        select
          rt.id,
          rt.name,
          rt.room_type,
          rt.price,
          rt.currency,
          rt.min_players,
          rt.max_players,
          rt.max_cards_per_player,
          rt.status::text as status,
          rt.password
        from public.room_templates rt
        where rt.id = $1::uuid
      ),
      active_tables as (
        select coalesce(
          jsonb_agg(
            jsonb_build_object(
              'room_id', s.room_id,
              'room_code', s.room_code,
              'card_price', s.card_price,
              'players', s.players,
              'card_count', s.card_count
            )
            order by s.room_code
          ),
          '[]'::jsonb
        ) as rows
        from (
          select
            r.id::text as room_id,
            r.room_code,
            r.card_price,
            count(distinct t.player_user_id)::int as players,
            count(t.id)::int as card_count
          from public.rooms r
          left join public.tickets t
            on t.room_id = r.id
           and t.reservation_status in ('reserved','confirmed','consumed')
          where r.status = 'playing'
            and r.room_template_id = $1::uuid
          group by r.id, r.room_code, r.card_price
          order by r.room_code
        ) s
      ),
      lock_row as (
        select
          coalesce(arf.global_registration_locked, false) as global_registration_locked,
          arf.global_registration_lock_reason
        from public.app_runtime_flags arf
        where arf.id = true
        limit 1
      )
      select
        tr.id::text as id,
        tr.name,
        tr.room_type,
        tr.price,
        tr.currency,
        tr.min_players,
        tr.max_players,
        tr.max_cards_per_player,
        tr.status,
        tr.password,
        (select rows from active_tables) as active_tables,
        coalesce((select global_registration_locked from lock_row), false) as global_registration_locked,
        (select global_registration_lock_reason from lock_row) as global_registration_lock_reason
      from template_row tr
      `,
      [templateId]
    );

    const row = result.rows[0];
    if (!row || row.status === "inactive") return null;

    const tablesRaw = row.active_tables ?? [];
    const cardPrice = Number(row.price) || 0;

    return {
      template: {
        id: row.id,
        name: row.name,
        room_type: row.room_type ?? null,
        price: cardPrice,
        currency: row.currency || "IRR",
        min_players: row.min_players ?? null,
        max_players: row.max_players ?? null,
        max_cards_per_player: row.max_cards_per_player ?? null,
        status: row.status,
        requires_password: templateRequiresPassword(row.password),
      },
      active_tables: tablesRaw.map((t) => {
        const tableCardPrice = Number(t.card_price) || cardPrice;
        const cardCount = Number(t.card_count) || 0;
        return {
          room_id: t.room_id,
          room_code: t.room_code,
          players: Number(t.players) || 0,
          card_count: cardCount,
          prize: tableCardPrice * cardCount,
        };
      }),
      global_registration_locked: Boolean(row.global_registration_locked),
      global_registration_lock_reason:
        row.global_registration_lock_reason ?? null,
    };
  } catch (err) {
    console.error("[Room] loadTemplatePreviewFromPg error:", err);
    return null;
  }
}

/** Fire-and-forget safety-net when scheduler heartbeat is off. */
export function nudgeWaitingRoomSchedulerFireAndForget(roomId: string): void {
  if (!pgPool) return;
  void pgPool
    .query(`SELECT game_core.fn_manage_waiting_rooms(10, false)`)
    .then(() => {
      console.info("[Scheduler] gameroom snapshot nudged waiting rooms", {
        roomId,
      });
    })
    .catch((err) => {
      console.warn("[Scheduler] gameroom waiting nudge failed", {
        roomId,
        error: err instanceof Error ? err.message : String(err),
      });
    });
}

export { ACTIVE_TICKET_STATUSES };
