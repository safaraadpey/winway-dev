import { pgPool } from "@/lib/pg";

export type GameroomRoomLifecycle = {
  status: string;
  starts_at: string | null;
  waiting_started_at: string | null;
  updated_at: string | null;
  ends_at: string | null;
};

function toIso(value: unknown): string | null {
  if (value == null) return null;
  if (value instanceof Date) return value.toISOString();
  return String(value);
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
    console.error("loadRoomLifecycleFromPg error:", err);
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
    console.error("loadRoomLifecycleBatchFromPg error:", err);
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
  roomId: string,
  supabaseRoom: LifecycleSlice,
  pgLifecycle: GameroomRoomLifecycle | null | undefined,
  source: string
): {
  status: string | null;
  starts_at: string | null;
  waiting_started_at: string | null;
  updated_at: string | null;
  ends_at: string | null;
  dataSource: "pg" | "supabase";
} {
  const supabaseSlice = {
    status: supabaseRoom.status ?? null,
    starts_at: supabaseRoom.starts_at ?? null,
    waiting_started_at: supabaseRoom.waiting_started_at ?? null,
    updated_at: supabaseRoom.updated_at ?? null,
    ends_at: supabaseRoom.ends_at ?? null,
  };

  const usePg = pgLifecycle != null;

  console.info(
    "[gameroomRoomLifecycle:pg-vs-supabase]",
    JSON.stringify({
      roomId,
      source,
      dataSource: usePg ? "pg" : "supabase",
      supabase: supabaseSlice,
      pg: pgLifecycle ?? null,
      debugTs: new Date().toISOString(),
    })
  );

  if (usePg) {
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
    ...supabaseSlice,
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
    console.error("loadPlayingTablesFromPg error:", err);
    return null;
  }
}
