/**
 * Live room snapshot builder for GET /v1/live-room.
 * Mirrors app/api/player/live-room/route.ts with PG-first parity.
 */

import type { SupabaseAdmin } from "../db/supabase-admin.js";
import {
  buildCardNumberMap,
  buildLiveRoomCards,
  loadLiveCardNumbersFromPg,
  loadLiveDrawsFromPg,
  loadLiveTicketsFromPg,
  loadCardPoolMetaForRoomFromPg,
  logLiveRoomPgCompare,
  mapDrawRows,
  type LiveDrawRow,
  type LiveTicketRow,
} from "./live-room-snapshot-pg.js";

export type LiveRoomResponse = {
  source?: "pg" | "engine_ram";
  eventSeq?: number;
  terminal?: boolean;
  room: {
    id: string;
    status: string | null;
    room_code: string | null;
    /** Lobby display name from room_templates.name (e.g. «پنج هزار»). */
    room_name: string | null;
    room_seed_hash: string | null;
    card_price: number;
    currency: string;
    min_players: number | null;
    max_cards_per_player: number | null;
    started_at: string | null;
    next_draw_at: string | null;
    line_reward_percentage: number;
    full_reward_percentage: number;
    commission_rate: number;
    ding_per_number: number;
    draw_interval_sec: number;
    ding_settle_mode?: "per_draw" | "room_level";
    gameplay_persist_mode?: "per_draw" | "manifest_ram";
  };
  tournament?: {
    id: string;
    title: string | null;
    round_no: number | null;
  } | null;
  is_tournament?: boolean;
  server_now: string;
  draws: Array<{
    id: string;
    number: number;
    created_at: string;
    processed_at: string;
  }>;
  cards: Array<{
    ticket_id: string;
    player_id: string | null;
    player_name: string;
    card_number: number | null;
    pool_card_id: string | null;
    card: Array<Array<number | null>>;
    is_my_card: boolean;
  }>;
  card_pool?: {
    poolId: string;
    commitHash: string;
    prngVersion: string;
    cardCount: number;
  } | null;
  /** Engine RAM winners (manifest_ram). Omitted on PG per_draw snapshots. */
  line_winners?: Array<{
    ticketId: string;
    userId: string;
    drawNumber: number;
  }>;
  full_winners?: Array<{
    ticketId: string;
    userId: string;
    drawNumber: number;
  }>;
};

export type LiveRoomDrawsOnlyResponse = {
  source?: "pg" | "engine_ram";
  eventSeq?: number;
  room: {
    id: string;
    status: string | null;
    room_code: string | null;
    next_draw_at: string | null;
    draw_interval_sec: number;
    gameplay_persist_mode?: "per_draw" | "manifest_ram";
  };
  server_now: string;
  draws: LiveRoomResponse["draws"];
  line_winners?: LiveRoomResponse["line_winners"];
  full_winners?: LiveRoomResponse["full_winners"];
};

export async function buildLiveRoomSnapshot(
  supabase: SupabaseAdmin,
  userId: string,
  roomId: string,
  scope: "full" | "draws"
): Promise<LiveRoomResponse | LiveRoomDrawsOnlyResponse | null> {
  const drawsOnly = scope === "draws";

  const { data: room, error: roomError } = await supabase
    .from("rooms")
    .select(
      `
        id,
        status,
        room_code,
        room_seed_hash,
        card_price,
        currency,
        min_players,
        max_cards_per_player,
        starts_at,
        next_draw_at,
        line_reward_percentage,
        full_reward_percentage,
        commission_rate,
        room_template_id,
        ding_per_number,
        pool_id,
        meta
      `
    )
    .eq("id", roomId)
    .single();

  if (roomError || !room) {
    return null;
  }

  let template: {
    name: string | null;
    line_reward_percentage: number | null;
    full_reward_percentage: number | null;
    commission_rate: number | null;
    ding_per_number: number | null;
  } | null = null;

  if (room.room_template_id) {
    const { data: templateRow } = await supabase
      .from("room_templates")
      .select(
        `
          name,
          line_reward_percentage,
          full_reward_percentage,
          commission_rate,
          ding_per_number
        `
      )
      .eq("id", room.room_template_id)
      .single();

    template = templateRow ?? null;
  }

  const roomDisplayName =
    typeof template?.name === "string" && template.name.trim()
      ? template.name.trim()
      : null;

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
  const resolvedDingPerNumber = Number(
    room.ding_per_number ?? template?.ding_per_number ?? 1
  );

  const resolvedCommissionRateRaw =
    room.commission_rate ?? template?.commission_rate ?? 0;
  const resolvedCommissionRate =
    resolvedCommissionRateRaw > 1
      ? resolvedCommissionRateRaw / 100
      : resolvedCommissionRateRaw;

  let resolvedLinePct =
    room.line_reward_percentage ?? template?.line_reward_percentage ?? 0.5;
  let resolvedFullPct =
    room.full_reward_percentage ?? template?.full_reward_percentage ?? 0.5;

  if (resolvedLinePct === 0 && resolvedFullPct === 0) {
    resolvedLinePct = 0.5;
    resolvedFullPct = 0.5;
  }

  if (resolvedLinePct + resolvedFullPct > 1) {
    const sum = resolvedLinePct + resolvedFullPct;
    resolvedLinePct = resolvedLinePct / sum;
    resolvedFullPct = 1 - resolvedLinePct;
  }

  const { data: supabaseDraws, error: drawsError } = await supabase
    .from("draws")
    .select("id, number, created_at, processed_at")
    .eq("room_id", roomId)
    .not("processed_at", "is", null)
    .order("processed_at", { ascending: true });

  if (drawsError) {
    console.error("[LiveRoom] fetch draws error:", drawsError);
  }

  const pgDraws = await loadLiveDrawsFromPg(roomId);
  const drawsSource = pgDraws !== null ? "pg" : "supabase";
  const draws: LiveDrawRow[] =
    pgDraws !== null
      ? pgDraws
      : (supabaseDraws || []).map((d) => ({
          id: d.id as string,
          number: d.number as number,
          created_at: d.created_at as string,
          processed_at: d.processed_at as string,
        }));

  logLiveRoomPgCompare({
    roomId,
    scope: drawsOnly ? "draws" : "full",
    drawsSource,
    supabaseDrawCount: supabaseDraws?.length ?? 0,
    pgDrawCount: pgDraws?.length ?? null,
    drawsError: drawsError?.message ?? null,
  });

  if (drawsOnly) {
    return {
      room: {
        id: room.id as string,
        status: room.status as string | null,
        room_code: room.room_code as string | null,
        next_draw_at: (room.next_draw_at as string | null) ?? null,
        draw_interval_sec: drawIntervalSec,
      },
      server_now: new Date().toISOString(),
      draws: mapDrawRows(draws),
    };
  }

  const { data: supabaseTickets, error: ticketsError } = await supabase
    .from("tickets")
    .select("id, player_user_id, pool_card_id, card_no")
    .eq("room_id", roomId)
    .in("reservation_status", ["reserved", "confirmed", "consumed"]);

  if (ticketsError) {
    console.error("[LiveRoom] fetch tickets error:", ticketsError);
  }

  const pgTickets = await loadLiveTicketsFromPg(roomId);
  const ticketsSource = pgTickets !== null ? "pg" : "supabase";
  const tickets: LiveTicketRow[] =
    pgTickets !== null
      ? pgTickets
      : (supabaseTickets || []).map((t) => ({
          id: t.id as string,
          player_user_id: (t.player_user_id as string | null) ?? null,
          pool_card_id:
            t.pool_card_id != null ? String(t.pool_card_id) : null,
          card_no: (t.card_no as number | null) ?? null,
        }));

  const poolIds = Array.from(
    new Set(
      tickets.map((t) => t.pool_card_id).filter((id): id is string => !!id)
    )
  );

  const { data: supabaseCardNumbers, error: cardNumbersError } = poolIds.length
    ? await supabase
        .from("card_numbers")
        .select("pool_card_id, row_no, col_no, value")
        .in("pool_card_id", poolIds)
    : { data: [] as Array<{
        pool_card_id: unknown;
        row_no: number;
        col_no: number;
        value: number | null;
      }>, error: null };

  if (cardNumbersError) {
    console.error("[LiveRoom] fetch card_numbers error:", cardNumbersError);
  }

  const pgCardNumbers = await loadLiveCardNumbersFromPg(poolIds);
  let cardNumbersSource = pgCardNumbers !== null ? "pg" : "supabase";
  let cardNumbers =
    pgCardNumbers !== null
      ? pgCardNumbers
      : (supabaseCardNumbers || []).map((cn) => ({
          pool_card_id: String(cn.pool_card_id),
          row_no: cn.row_no as number,
          col_no: cn.col_no as number,
          value: (cn.value as number | null) ?? null,
        }));

  if (
    poolIds.length > 0 &&
    cardNumbers.length === 0 &&
    (supabaseCardNumbers?.length ?? 0) > 0
  ) {
    cardNumbersSource = "supabase-fallback";
    cardNumbers = (supabaseCardNumbers || []).map((cn) => ({
      pool_card_id: String(cn.pool_card_id),
      row_no: cn.row_no as number,
      col_no: cn.col_no as number,
      value: (cn.value as number | null) ?? null,
    }));
  }

  logLiveRoomPgCompare({
    roomId,
    scope: "full",
    drawsSource,
    ticketsSource,
    cardNumbersSource,
    supabaseDrawCount: supabaseDraws?.length ?? 0,
    pgDrawCount: pgDraws?.length ?? null,
    supabaseTicketCount: supabaseTickets?.length ?? 0,
    pgTicketCount: pgTickets?.length ?? null,
    supabaseCardNumberCount: supabaseCardNumbers?.length ?? 0,
    pgCardNumberCount: pgCardNumbers?.length ?? null,
    ticketsError: ticketsError?.message ?? null,
    cardNumbersError: cardNumbersError?.message ?? null,
  });

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

  const cardNumberMap = buildCardNumberMap(cardNumbers);
  const cards = buildLiveRoomCards(tickets, cardNumberMap, userMap, userId);

  let cardPool: LiveRoomResponse["card_pool"] = null;
  const pgCardPool = await loadCardPoolMetaForRoomFromPg(roomId);
  if (pgCardPool) {
    cardPool = pgCardPool;
  } else if ((room as { pool_id?: string | null }).pool_id) {
    const poolId = (room as { pool_id?: string | null }).pool_id as string;
    const { data: poolRow } = await supabase
      .from("card_pools")
      .select("id, commit_hash, prng_version, card_count")
      .eq("id", poolId)
      .maybeSingle();
    if (poolRow) {
      cardPool = {
        poolId: poolRow.id as string,
        commitHash: poolRow.commit_hash as string,
        prngVersion: poolRow.prng_version as string,
        cardCount: Number(poolRow.card_count ?? 0),
      };
    }
  }

  let tournament: LiveRoomResponse["tournament"] = null;
  const { data: roundRow } = await supabase
    .from("tournament_round_rooms")
    .select("tournament_id, round_no")
    .eq("room_id", roomId)
    .maybeSingle();

  if (roundRow?.tournament_id) {
    const { data: tournamentRow } = await supabase
      .from("tournaments")
      .select("id,title")
      .eq("id", roundRow.tournament_id)
      .maybeSingle();

    tournament = {
      id: roundRow.tournament_id,
      title: tournamentRow?.title ?? null,
      round_no: roundRow.round_no ?? null,
    };
  }

  return {
    room: {
      id: room.id as string,
      status: room.status as string | null,
      room_code: room.room_code as string | null,
      room_name: roomDisplayName,
      room_seed_hash: (room as { room_seed_hash?: string | null }).room_seed_hash ?? null,
      card_price: Number(room.card_price || 0),
      currency: (room.currency as string) || "IRR",
      min_players: room.min_players as number | null,
      max_cards_per_player: room.max_cards_per_player as number | null,
      started_at: room.starts_at as string | null,
      next_draw_at: (room.next_draw_at as string | null) ?? null,
      line_reward_percentage: resolvedLinePct,
      full_reward_percentage: resolvedFullPct,
      commission_rate: resolvedCommissionRate,
      ding_per_number: resolvedDingPerNumber,
      draw_interval_sec: drawIntervalSec,
    },
    tournament,
    is_tournament: Boolean(tournament?.id),
    server_now: new Date().toISOString(),
    draws: mapDrawRows(draws),
    cards,
    card_pool: cardPool,
  };
}
