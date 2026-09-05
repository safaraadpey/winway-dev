/**
 * Engine-resident live snapshot for manifest_ram rooms.
 * PG draws/results are not the oracle during play.
 */
import type { SupabaseAdmin } from "../db/supabase-admin.js";
import type { RoomRuntimeState } from "../state/room-state.js";
import type { RamLiveRoomContext } from "./liveRoomRamRegistry.js";
import {
  buildCardNumberMap,
  buildLiveRoomCards,
  loadLiveTicketsFromPg,
  loadLiveCardNumbersFromPg,
  loadCardPoolMetaForRoomFromPg,
  loadFrozenManifestRoomMetaFromPg,
  loadLiveTournamentForRoomFromPg,
  mapDrawRows,
  type LiveDrawRow,
  type LiveTicketRow,
} from "./live-room-snapshot-pg.js";
import type { LiveRoomResponse } from "./live-room-view.js";

export type RamLiveWinner = {
  ticketId: string;
  userId: string;
  drawNumber: number;
};

function buildDrawsFromRam(state: RoomRuntimeState): LiveDrawRow[] {
  const now = new Date().toISOString();
  return state.getDrawnNumbers().map((number, idx) => ({
    id: `ram-${state.roomId}-${idx + 1}`,
    number,
    created_at: now,
    processed_at: now,
  }));
}

/** Live line/full winners from engine RAM — not public.results (writes-per-draw=0). */
export function buildRamLiveWinners(state: RoomRuntimeState): {
  line_winners: RamLiveWinner[];
  full_winners: RamLiveWinner[];
} {
  const userByTicket = new Map(
    state.getTickets().map((t) => [t.id, t.player_user_id])
  );
  const mapWinners = (
    draws: ReadonlyMap<string, number>
  ): RamLiveWinner[] =>
    [...draws.entries()]
      .map(([ticketId, drawNumber]) => ({
        ticketId,
        userId: userByTicket.get(ticketId) ?? "",
        drawNumber,
      }))
      .sort(
        (a, b) =>
          a.drawNumber - b.drawNumber || a.ticketId.localeCompare(b.ticketId)
      );

  return {
    line_winners: mapWinners(state.getLineWinnerDraws()),
    full_winners: mapWinners(state.getFullWinnerDraws()),
  };
}

export async function buildLiveRoomSnapshotFromRam(
  supabase: SupabaseAdmin,
  userId: string,
  roomId: string,
  ctx: RamLiveRoomContext,
  scope: "full" | "draws"
): Promise<LiveRoomResponse | null> {
  const { state, ramNextDrawAtIso, eventSeq } = ctx;
  const room = state.room;
  const drawsOnly = scope === "draws";

  const roomMeta =
    room.meta && typeof room.meta === "object"
      ? (room.meta as Record<string, unknown>)
      : null;
  const rawDrawInterval = roomMeta?.["draw_interval_sec"];
  const drawIntervalSec = Math.max(
    Number.isFinite(Number(rawDrawInterval))
      ? Math.trunc(Number(rawDrawInterval))
      : 3,
    1
  );

  const draws = mapDrawRows(buildDrawsFromRam(state));
  const winners = buildRamLiveWinners(state);

  if (drawsOnly) {
    return {
      source: "engine_ram",
      eventSeq,
      room: {
        id: roomId,
        status: room.status,
        room_code: null,
        next_draw_at: ramNextDrawAtIso ?? room.next_draw_at,
        draw_interval_sec: drawIntervalSec,
        gameplay_persist_mode: "manifest_ram",
      },
      server_now: new Date().toISOString(),
      draws,
      line_winners: winners.line_winners,
      full_winners: winners.full_winners,
    } as LiveRoomResponse;
  }

  const pgTickets = await loadLiveTicketsFromPg(roomId);
  const tickets: LiveTicketRow[] = pgTickets ?? [];

  const poolIds = Array.from(
    new Set(
      tickets.map((t) => t.pool_card_id).filter((id): id is string => !!id)
    )
  );
  const pgCardNumbers = await loadLiveCardNumbersFromPg(poolIds);
  const cardNumbers = pgCardNumbers ?? [];
  const cardNumberMap = buildCardNumberMap(cardNumbers);

  const playerIds = Array.from(
    new Set(
      tickets.map((t) => t.player_user_id).filter((id): id is string => !!id)
    )
  );

  const { data: users } = playerIds.length
    ? await supabase
        .from("users")
        .select("id, username, user_profiles(nickname)")
        .in("id", playerIds)
    : { data: [] as Array<{
        id: string;
        username: string | null;
        user_profiles:
          | { nickname: string | null }
          | Array<{ nickname: string | null }>
          | null;
      }> };

  const userMap = new Map<
    string,
    { username: string | null; nickname: string | null }
  >();
  (users || []).forEach((u) => {
    const nickname = Array.isArray(u.user_profiles)
      ? u.user_profiles[0]?.nickname
      : u.user_profiles?.nickname;
    userMap.set(u.id, {
      username: u.username ?? null,
      nickname: nickname ?? null,
    });
  });

  const cards = buildLiveRoomCards(tickets, cardNumberMap, userMap, userId);
  const cardPool = (await loadCardPoolMetaForRoomFromPg(roomId)) ?? null;
  const frozenMeta = (await loadFrozenManifestRoomMetaFromPg(roomId)) ?? null;
  const tournament = (await loadLiveTournamentForRoomFromPg(roomId)) ?? null;
  const isTournament = Boolean(frozenMeta?.isTournament || tournament?.id);

  const resolvedLinePct =
    frozenMeta?.lineRewardPercentage ?? room.line_reward_percentage ?? 0.5;
  const resolvedFullPct =
    frozenMeta?.fullRewardPercentage ?? room.full_reward_percentage ?? 0.5;

  return {
    source: "engine_ram",
    eventSeq,
    terminal: room.status === "finished" || state.isFullHouseFrozen(),
    room: {
      id: roomId,
      status: room.status,
      room_code: frozenMeta?.roomCode ?? null,
      room_name: frozenMeta?.roomName ?? null,
      room_seed_hash: frozenMeta?.roomSeedHash ?? null,
      card_price: frozenMeta?.cardPrice ?? 0,
      currency: room.currency || "IRR",
      min_players: room.min_players,
      max_cards_per_player: null,
      started_at: room.starts_at,
      next_draw_at: ramNextDrawAtIso ?? room.next_draw_at,
      line_reward_percentage: resolvedLinePct,
      full_reward_percentage: resolvedFullPct,
      commission_rate: frozenMeta?.commissionRate ?? 0,
      ding_per_number: Number(room.ding_per_number ?? 1),
      draw_interval_sec: drawIntervalSec,
      ding_settle_mode: room.ding_settle_mode ?? "per_draw",
      gameplay_persist_mode: "manifest_ram",
    },
    tournament,
    is_tournament: isTournament,
    server_now: new Date().toISOString(),
    draws,
    cards,
    card_pool: cardPool,
    line_winners: isTournament ? [] : winners.line_winners,
    full_winners: winners.full_winners,
  } as LiveRoomResponse;
}
