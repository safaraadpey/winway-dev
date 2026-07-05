/**
 * Lobby snapshot builder for GET /v1/lobby.
 * Mirrors app/api/player/lobby-snapshot/route.ts (Supabase service role).
 */

import type { SupabaseAdmin } from "../db/supabase-admin.js";

export type LobbyRoomGroup = {
  templateId: string | null;
  entryRoomId: string | null;
  price: number;
  currency: string;
  roomName: string | null;
  waitingRooms: number;
  playingRooms: number;
  totalRooms: number;
  players: number;
  waitingPlayers: number;
  playingPlayers: number;
};

export type LobbySnapshotResponse = {
  roomGroups: { groups: LobbyRoomGroup[] };
  onlineCount: { onlinePlayers: number };
};

export async function buildLobbySnapshot(
  supabase: SupabaseAdmin
): Promise<LobbySnapshotResponse> {
  const { data: templates, error: templatesError } = await supabase
    .from("room_templates")
    .select("id, name, price, currency, status, room_type")
    .neq("status", "inactive")
    .eq("room_type", "normal")
    .order("price", { ascending: true });

  if (templatesError) {
    throw new Error(templatesError.message || "Failed to load lobby templates.");
  }

  const templateRows = (templates || []) as Array<{
    id: string;
    name: string | null;
    price: unknown;
    currency: string | null;
    room_type: string | null;
  }>;

  const normalTemplateRows = templateRows.filter(
    (t) => (t.room_type ?? "normal") === "normal"
  );
  const allowedTemplateIds = new Set(normalTemplateRows.map((t) => t.id));

  const { data: rooms, error: roomsError } = await supabase
    .from("rooms")
    .select("id, status, room_template_id, card_price, currency, created_at")
    .in("status", ["waiting", "playing", "live"]);

  if (roomsError) {
    throw new Error(roomsError.message || "Failed to load active rooms.");
  }

  const filteredRoomRows = ((rooms || []) as Array<{
    id: string;
    status: string | null;
    room_template_id: string | null;
    card_price: unknown;
    currency: string | null;
    created_at: string | null;
  }>).filter((r) => {
    if (!r.room_template_id) return true;
    return allowedTemplateIds.has(r.room_template_id);
  });

  const roomIds = filteredRoomRows.map((r) => r.id);

  const { data: tickets, error: ticketsError } = roomIds.length
    ? await supabase
        .from("tickets")
        .select("room_id, player_user_id, reservation_status")
        .in("room_id", roomIds)
        .in("reservation_status", ["reserved", "confirmed", "consumed"])
    : { data: [], error: null };

  if (ticketsError) {
    throw new Error(ticketsError.message || "Failed to load lobby players.");
  }

  const groups = new Map<string, LobbyRoomGroup>();
  const playersSetByGroup = new Map<string, Set<string>>();
  const waitingPlayersSetByGroup = new Map<string, Set<string>>();
  const playingPlayersSetByGroup = new Map<string, Set<string>>();

  for (const t of normalTemplateRows) {
    const key = `tpl_${t.id}`;
    groups.set(key, {
      templateId: t.id,
      entryRoomId: null,
      price: Number(t.price || 0),
      currency: (t.currency || "IRR") as string,
      roomName: t.name?.trim() || null,
      waitingRooms: 0,
      playingRooms: 0,
      totalRooms: 0,
      players: 0,
      waitingPlayers: 0,
      playingPlayers: 0,
    });
    playersSetByGroup.set(key, new Set());
    waitingPlayersSetByGroup.set(key, new Set());
    playingPlayersSetByGroup.set(key, new Set());
  }

  for (const r of filteredRoomRows) {
    const templateId = r.room_template_id;
    const price = Number(r.card_price || 0);
    const currency = (r.currency || "IRR") as string;
    const key = templateId ? `tpl_${templateId}` : `price_${price}_${currency}`;

    if (!groups.has(key)) {
      groups.set(key, {
        templateId: templateId ?? null,
        entryRoomId: null,
        price,
        currency,
        roomName: null,
        waitingRooms: 0,
        playingRooms: 0,
        totalRooms: 0,
        players: 0,
        waitingPlayers: 0,
        playingPlayers: 0,
      });
      playersSetByGroup.set(key, new Set());
      waitingPlayersSetByGroup.set(key, new Set());
      playingPlayersSetByGroup.set(key, new Set());
    }

    const g = groups.get(key)!;
    g.totalRooms += 1;

    if (r.status === "waiting") g.waitingRooms += 1;
    if (r.status === "playing" || r.status === "live") g.playingRooms += 1;

    if ((r.status || "").toLowerCase() === "waiting") {
      const currentEntry = g.entryRoomId
        ? filteredRoomRows.find((room) => room.id === g.entryRoomId) ?? null
        : null;

      const shouldReplaceEntry =
        !currentEntry ||
        Date.parse(r.created_at || "1970-01-01T00:00:00.000Z") >
          Date.parse(currentEntry.created_at || "1970-01-01T00:00:00.000Z");

      if (shouldReplaceEntry) {
        g.entryRoomId = r.id;
      }
    }
  }

  const roomIdToKey = new Map<string, string>();
  const roomIdToStatus = new Map<string, string>();
  for (const r of filteredRoomRows) {
    const templateId = r.room_template_id;
    const price = Number(r.card_price || 0);
    const currency = (r.currency || "IRR") as string;
    const key = templateId ? `tpl_${templateId}` : `price_${price}_${currency}`;
    roomIdToKey.set(r.id, key);
    roomIdToStatus.set(r.id, (r.status || "").toLowerCase());
  }

  for (const t of (tickets || []) as Array<{
    room_id: string;
    player_user_id: string | null;
  }>) {
    if (!t.player_user_id) continue;
    const key = roomIdToKey.get(t.room_id);
    if (!key) continue;
    playersSetByGroup.get(key)?.add(t.player_user_id);

    const status = roomIdToStatus.get(t.room_id);
    if (status === "waiting") {
      waitingPlayersSetByGroup.get(key)?.add(t.player_user_id);
    } else if (status === "playing" || status === "live") {
      playingPlayersSetByGroup.get(key)?.add(t.player_user_id);
    }
  }

  for (const [key, g] of groups.entries()) {
    g.players = playersSetByGroup.get(key)?.size ?? 0;
    g.waitingPlayers = waitingPlayersSetByGroup.get(key)?.size ?? 0;
    g.playingPlayers = playingPlayersSetByGroup.get(key)?.size ?? 0;
  }

  const roomGroupsPayload = Array.from(groups.values()).sort(
    (a, b) => a.price - b.price
  );

  let onlinePlayers = 0;
  try {
    const { data, error } = await supabase
      .from("v_lobby_online_players")
      .select("online_players")
      .maybeSingle();
    if (!error) {
      onlinePlayers = Number((data as { online_players?: unknown })?.online_players ?? 0) || 0;
    }
  } catch {
    onlinePlayers = 0;
  }

  return {
    roomGroups: { groups: roomGroupsPayload },
    onlineCount: { onlinePlayers },
  };
}
