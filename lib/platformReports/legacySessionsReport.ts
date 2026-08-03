import type { SupabaseClient } from "@supabase/supabase-js";
import { platformStatusesToBingoRoomStatuses } from "./config";
import {
  mapBingoRoomLifecycle,
  mapTicketParticipantStatus,
  type SessionParticipantReportRow,
  type SessionReportRow,
  type SessionsAnalyticsResult,
  type SessionsReportResult,
} from "./types";

type RoomRow = {
  id: string;
  status: string;
  engine_owner_id: string | null;
  created_at: string;
  updated_at: string;
  waiting_started_at: string | null;
};

type TicketRow = {
  room_id: string;
  player_user_id: string;
  reservation_status: string;
  price: number | string;
  created_at: string;
  cancelled_at: string | null;
  updated_at: string;
};

export type SessionsQueryArgs = {
  from: Date;
  to: Date;
  page: number;
  pageSize: number;
  /** Platform lifecycle statuses to include. Omit = all. */
  statuses?: string[];
};

/**
 * Legacy Bingo-equivalent sessions report (rooms + tickets).
 * Shape matches Platform projection for Stage 1/2 compare.
 */
export async function fetchLegacySessionsReport(
  supabase: SupabaseClient,
  args: SessionsQueryArgs
): Promise<SessionsReportResult> {
  const { from, to, page, pageSize, statuses } = args;
  const fromIso = from.toISOString();
  const toIso = to.toISOString();
  const bingoStatuses = statuses?.length
    ? platformStatusesToBingoRoomStatuses(statuses)
    : null;

  let countQuery = supabase
    .from("rooms")
    .select("id", { count: "exact", head: true })
    .gte("created_at", fromIso)
    .lte("created_at", toIso);
  if (bingoStatuses?.length) {
    countQuery = countQuery.in("status", bingoStatuses);
  }
  const { count, error: countError } = await countQuery;
  if (countError) {
    throw new Error(countError.message || "legacy rooms count failed");
  }

  const totalCount = Number(count || 0);
  const offset = (page - 1) * pageSize;

  let roomsQuery = supabase
    .from("rooms")
    .select("id, status, engine_owner_id, created_at, updated_at, waiting_started_at")
    .gte("created_at", fromIso)
    .lte("created_at", toIso)
    .order("created_at", { ascending: false })
    .range(offset, offset + pageSize - 1);
  if (bingoStatuses?.length) {
    roomsQuery = roomsQuery.in("status", bingoStatuses);
  }

  const { data: roomRows, error: roomsError } = await roomsQuery;
  if (roomsError) {
    throw new Error(roomsError.message || "legacy rooms fetch failed");
  }

  const rooms = (roomRows || []) as RoomRow[];
  const roomIds = rooms.map((r) => r.id);

  const ticketsByRoom = new Map<string, TicketRow[]>();
  if (roomIds.length > 0) {
    const { data: ticketRows, error: ticketsError } = await supabase
      .from("tickets")
      .select(
        "room_id, player_user_id, reservation_status, price, created_at, cancelled_at, updated_at"
      )
      .in("room_id", roomIds);

    if (ticketsError) {
      throw new Error(ticketsError.message || "legacy tickets fetch failed");
    }

    for (const t of (ticketRows || []) as TicketRow[]) {
      const list = ticketsByRoom.get(t.room_id) || [];
      list.push(t);
      ticketsByRoom.set(t.room_id, list);
    }
  }

  const items: SessionReportRow[] = rooms
    .map((room) => buildLegacySessionRow(room, ticketsByRoom.get(room.id) || []))
    .filter((row) => !statuses?.length || statuses.includes(row.status));

  return {
    items,
    totalCount,
    page,
    pageSize,
    source: "legacy",
  };
}

/**
 * Aggregate analytics over the period (no pagination).
 * Non-financial: session counts, participant shells, entry spend totals.
 */
export async function fetchLegacySessionsAnalytics(
  supabase: SupabaseClient,
  args: { from: Date; to: Date; statuses?: string[] }
): Promise<SessionsAnalyticsResult> {
  const pageSize = 500;
  let page = 1;
  let totalFetched = 0;
  let totalCount = Infinity;
  const byStatus: Record<string, number> = {};
  let participantCount = 0;
  let amountTotal = 0;

  while (totalFetched < totalCount) {
    const batch = await fetchLegacySessionsReport(supabase, {
      from: args.from,
      to: args.to,
      page,
      pageSize,
      statuses: args.statuses,
    });
    totalCount = batch.totalCount;
    totalFetched += batch.items.length;
    if (batch.items.length === 0) break;

    for (const row of batch.items) {
      byStatus[row.status] = (byStatus[row.status] || 0) + 1;
      participantCount += row.participantCount;
      amountTotal += row.amountTotal;
    }
    page += 1;
    if (page > 50) break; // safety
  }

  return {
    source: "legacy",
    from: args.from.toISOString(),
    to: args.to.toISOString(),
    sessionCount: totalCount === Infinity ? 0 : totalCount,
    participantCount,
    amountTotal: Number(amountTotal.toFixed(2)),
    byStatus,
  };
}

function buildLegacySessionRow(
  room: RoomRow,
  tickets: TicketRow[]
): SessionReportRow {
  const status = mapBingoRoomLifecycle(room.status, room.engine_owner_id);
  const participants = aggregateParticipants(tickets);
  const amountTotal = participants.reduce((s, p) => s + p.amountTotal, 0);
  const activeCount = participants.filter(
    (p) => p.status === "joined" || p.status === "active"
  ).length;

  const startedAt =
    status === "running" ||
    status === "finished" ||
    status === "settled" ||
    status === "archived"
      ? room.waiting_started_at || room.created_at
      : null;
  const finishedAt =
    status === "finished" || status === "settled" || status === "archived"
      ? room.updated_at
      : null;
  const settledAt = status === "settled" ? room.updated_at : null;

  return {
    sessionId: room.id,
    gameSlug: "bingo",
    status,
    createdAt: room.created_at,
    startedAt,
    finishedAt,
    settledAt,
    participantCount: activeCount,
    amountTotal: Number(amountTotal.toFixed(2)),
    participants,
  };
}

function aggregateParticipants(tickets: TicketRow[]): SessionParticipantReportRow[] {
  const byUser = new Map<
    string,
    {
      activeTickets: number;
      hasHeld: boolean;
      hasLive: boolean;
      amountTotal: number;
      joinedAt: string;
      leftAt: string | null;
      sourceUpdatedAt: string;
    }
  >();

  for (const t of tickets) {
    const uid = String(t.player_user_id);
    const st = String(t.reservation_status || "");
    const terminal = st === "cancelled" || st === "released" || st === "expired";
    const cur = byUser.get(uid) || {
      activeTickets: 0,
      hasHeld: false,
      hasLive: false,
      amountTotal: 0,
      joinedAt: t.created_at,
      leftAt: null as string | null,
      sourceUpdatedAt: t.updated_at,
    };

    if (!terminal) {
      cur.activeTickets += 1;
      cur.amountTotal += Number(t.price || 0);
      if (st === "held") cur.hasHeld = true;
      if (st === "reserved" || st === "confirmed" || st === "consumed") cur.hasLive = true;
    }
    if (t.created_at < cur.joinedAt) cur.joinedAt = t.created_at;
    if (t.updated_at > cur.sourceUpdatedAt) cur.sourceUpdatedAt = t.updated_at;
    if (terminal && t.cancelled_at) {
      if (!cur.leftAt || t.cancelled_at > cur.leftAt) cur.leftAt = t.cancelled_at;
    }
    byUser.set(uid, cur);
  }

  return Array.from(byUser.entries())
    .map(([userId, a]) => {
      const status = mapTicketParticipantStatus({
        activeTickets: a.activeTickets,
        hasHeld: a.hasHeld,
        hasLive: a.hasLive,
      });
      return {
        userId,
        status,
        ticketCount: a.activeTickets,
        amountTotal: Number(a.amountTotal.toFixed(2)),
        joinedAt: a.joinedAt,
        leftAt: status === "left" ? a.leftAt || a.sourceUpdatedAt : null,
        sourceUpdatedAt: a.sourceUpdatedAt,
      };
    })
    .sort((x, y) => x.userId.localeCompare(y.userId));
}
