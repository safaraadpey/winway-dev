/**
 * PG-first loaders for live-room snapshots.
 * Mirrors lib/liveRoomSnapshotPg.ts in the Next.js app.
 */

import { pgPool } from "../db/pg.js";

const LIVE_ROOM_PG_COMPARE_LOG_UNTIL_MS = Date.parse("2026-06-17T23:59:59.999Z");

export type LiveDrawRow = {
  id: string;
  number: number;
  created_at: string;
  processed_at: string;
};

export type LiveTicketRow = {
  id: string;
  player_user_id: string | null;
  pool_card_id: string | null;
  card_no: number | null;
};

export type LiveCardNumberRow = {
  pool_card_id: string;
  row_no: number;
  col_no: number;
  value: number | null;
};

function toIso(value: unknown): string {
  if (value instanceof Date) return value.toISOString();
  return String(value ?? "");
}

export async function loadLiveDrawsFromPg(
  roomId: string
): Promise<LiveDrawRow[] | null> {
  if (!pgPool) return null;

  try {
    const result = await pgPool.query<{
      id: string;
      number: number;
      created_at: Date | string;
      processed_at: Date | string;
    }>(
      `
      select
        d.id::text as id,
        d.number,
        d.created_at,
        d.processed_at
      from public.draws d
      where d.room_id = $1::uuid
        and d.processed_at is not null
      order by d.processed_at asc
      `,
      [roomId]
    );

    return result.rows.map((row) => ({
      id: row.id,
      number: row.number,
      created_at: toIso(row.created_at),
      processed_at: toIso(row.processed_at),
    }));
  } catch (err) {
    console.error("[LiveRoom] loadLiveDrawsFromPg error:", err);
    return null;
  }
}

export async function loadLiveTicketsFromPg(
  roomId: string
): Promise<LiveTicketRow[] | null> {
  if (!pgPool) return null;

  try {
    const result = await pgPool.query<{
      id: string;
      player_user_id: string | null;
      pool_card_id: string | null;
      card_no: number | null;
    }>(
      `
      select
        t.id::text as id,
        t.player_user_id::text as player_user_id,
        t.pool_card_id::text as pool_card_id,
        t.card_no
      from public.tickets t
      where t.room_id = $1::uuid
        and t.reservation_status in ('reserved','confirmed','consumed')
      `,
      [roomId]
    );

    return result.rows;
  } catch (err) {
    console.error("[LiveRoom] loadLiveTicketsFromPg error:", err);
    return null;
  }
}

export async function loadLiveCardNumbersFromPg(
  poolIds: string[]
): Promise<LiveCardNumberRow[] | null> {
  if (!pgPool) return null;
  if (poolIds.length === 0) return [];

  const poolIdBigints = poolIds
    .map((id) => Number(id))
    .filter((id) => Number.isFinite(id));

  if (poolIdBigints.length === 0) return [];

  try {
    const result = await pgPool.query<{
      pool_card_id: string;
      row_no: number;
      col_no: number;
      value: number | null;
    }>(
      `
      select
        cn.pool_card_id::text as pool_card_id,
        cn.row_no,
        cn.col_no,
        cn.value
      from public.card_numbers cn
      where cn.pool_card_id = any($1::bigint[])
      `,
      [poolIdBigints]
    );

    return result.rows;
  } catch (err) {
    console.error("[LiveRoom] loadLiveCardNumbersFromPg error:", err);
    return null;
  }
}

export function logLiveRoomPgCompare(payload: Record<string, unknown>): void {
  if (Date.now() > LIVE_ROOM_PG_COMPARE_LOG_UNTIL_MS) return;

  console.info(
    "[liveRoomSnapshot:pg-vs-supabase]",
    JSON.stringify({
      ...payload,
      debugTs: new Date().toISOString(),
    })
  );
}

export function mapDrawRows(
  rows: Array<{
    id: string;
    number: number;
    created_at: string;
    processed_at: string;
  }>
) {
  return rows.map((d) => ({
    id: d.id,
    number: d.number,
    created_at: d.created_at,
    processed_at: d.processed_at,
  }));
}

export function buildCardNumberMap(
  cardNumbers: LiveCardNumberRow[]
): Map<string, LiveCardNumberRow[]> {
  const cardNumberMap = new Map<string, LiveCardNumberRow[]>();
  for (const cn of cardNumbers) {
    const key = String(cn.pool_card_id);
    if (!cardNumberMap.has(key)) {
      cardNumberMap.set(key, []);
    }
    cardNumberMap.get(key)!.push(cn);
  }
  return cardNumberMap;
}

export function buildLiveRoomCards(
  tickets: LiveTicketRow[],
  cardNumberMap: Map<string, LiveCardNumberRow[]>,
  userMap: Map<string, { username: string | null; nickname: string | null }>,
  currentUserId: string
) {
  return tickets.map((ticket) => {
    const grid = Array.from({ length: 3 }, () =>
      Array(9).fill(null) as Array<number | null>
    );
    const positions = ticket.pool_card_id
      ? cardNumberMap.get(String(ticket.pool_card_id)) || []
      : [];

    for (const pos of positions) {
      const rowIndex = pos.row_no - 1;
      const colIndex = pos.col_no - 1;
      if (rowIndex >= 0 && rowIndex < 3 && colIndex >= 0 && colIndex < 9) {
        grid[rowIndex][colIndex] = pos.value;
      }
    }

    const playerId = ticket.player_user_id || "";
    const displayName =
      userMap.get(playerId)?.nickname ||
      userMap.get(playerId)?.username ||
      playerId ||
      "player";

    return {
      ticket_id: ticket.id,
      player_id: ticket.player_user_id,
      player_name: displayName,
      card_number: ticket.card_no,
      card: grid,
      is_my_card: ticket.player_user_id === currentUserId,
    };
  });
}
