import { NextResponse } from "next/server";
import { createServiceClient, getUserFromRequest } from "@/lib/supabaseServer";

type LobbyRoomGroup = {
  templateId: string | null;
  price: number;
  currency: string;
  waitingRooms: number;
  playingRooms: number; // includes live + playing
  totalRooms: number;
  players: number; // distinct players across all active rooms in this template group
  waitingPlayers: number; // distinct players in waiting rooms in this group
  playingPlayers: number; // distinct players in live/playing rooms in this group
};

export type LobbySnapshotResponse = {
  // same shape as /api/player/lobby-room-groups
  roomGroups: { groups: LobbyRoomGroup[] };
  // same shape as /api/player/lobby-online-count
  onlineCount: { onlinePlayers: number };
};

export async function GET(request: Request) {
  try {
    // Require auth (player lobby is authenticated).
    const user = await getUserFromRequest(request);
    if (!user) {
      return NextResponse.json(
        { error: "unauthorized", message: "Authentication required." },
        { status: 401 }
      );
    }

    const supabase = createServiceClient();

    // ---- roomGroups (copied from /lobby-room-groups) ----

    // 1) Active templates (exclude inactive)
    const { data: templates, error: templatesError } = await supabase
      .from("room_templates")
      .select("id, price, currency, status")
      .neq("status", "inactive")
      .order("price", { ascending: true });

    if (templatesError) {
      console.error("GET /api/player/lobby-snapshot templates error:", templatesError);
      return NextResponse.json(
        { error: "internal_error", message: "Failed to load lobby templates." },
        { status: 500 }
      );
    }

    const templateRows = (templates || []) as Array<{
      id: string;
      price: any;
      currency: string | null;
      status: string | null;
    }>;

    const templateIds = templateRows.map((t) => t.id);

    // 2) Active rooms (waiting/playing/live)
    const { data: rooms, error: roomsError } = await supabase
      .from("rooms")
      .select("id, status, room_template_id, card_price, currency")
      .in("status", ["waiting", "playing", "live"]);

    if (roomsError) {
      console.error("GET /api/player/lobby-snapshot rooms error:", roomsError);
      return NextResponse.json(
        { error: "internal_error", message: "Failed to load active rooms." },
        { status: 500 }
      );
    }

    const roomRows = (rooms || []) as Array<{
      id: string;
      status: string | null;
      room_template_id: string | null;
      card_price: any;
      currency: string | null;
    }>;

    const roomIds = roomRows.map((r) => r.id);

    // 3) Tickets for those rooms (service role => bypass RLS)
    const { data: tickets, error: ticketsError } = roomIds.length
      ? await supabase
          .from("tickets")
          .select("room_id, player_user_id, reservation_status")
          .in("room_id", roomIds)
          .in("reservation_status", ["reserved", "confirmed", "consumed"])
      : { data: [], error: null };

    if (ticketsError) {
      console.error("GET /api/player/lobby-snapshot tickets error:", ticketsError);
      return NextResponse.json(
        { error: "internal_error", message: "Failed to load lobby players." },
        { status: 500 }
      );
    }

    // Base groups: one per template (0 counts)
    const groups = new Map<string, LobbyRoomGroup>();
    const playersSetByGroup = new Map<string, Set<string>>();
    const waitingPlayersSetByGroup = new Map<string, Set<string>>();
    const playingPlayersSetByGroup = new Map<string, Set<string>>();

    for (const t of templateRows) {
      const key = `tpl_${t.id}`;
      groups.set(key, {
        templateId: t.id,
        price: Number(t.price || 0),
        currency: (t.currency || "IRR") as string,
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

    // Rooms contribute to waiting/playing/live totals
    // If a room has no templateId, fallback group by price/currency (keeps old behavior)
    for (const r of roomRows) {
      const templateId = r.room_template_id;
      const price = Number(r.card_price || 0);
      const currency = (r.currency || "IRR") as string;
      const key = templateId ? `tpl_${templateId}` : `price_${price}_${currency}`;

      if (!groups.has(key)) {
        groups.set(key, {
          templateId: templateId ?? null,
          price,
          currency,
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
    }

    // Tickets contribute to distinct player counts per group (distinct across all rooms in that group)
    const roomIdToKey = new Map<string, string>();
    const roomIdToStatus = new Map<string, string>();
    for (const r of roomRows) {
      const templateId = r.room_template_id;
      const price = Number(r.card_price || 0);
      const currency = (r.currency || "IRR") as string;
      const key = templateId ? `tpl_${templateId}` : `price_${price}_${currency}`;
      roomIdToKey.set(r.id, key);
      roomIdToStatus.set(r.id, (r.status || "").toLowerCase());
    }

    const ticketRows = (tickets || []) as Array<{ room_id: string; player_user_id: string | null }>;
    for (const t of ticketRows) {
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

    const roomGroupsPayload: LobbyRoomGroup[] = Array.from(groups.values()).sort(
      (a, b) => a.price - b.price
    );

    // ---- onlineCount (copied from /lobby-online-count; best-effort) ----
    let onlinePlayers = 0;
    try {
      const { data, error } = await supabase
        .from("v_lobby_online_players")
        .select("online_players")
        .maybeSingle();
      if (error) {
        console.error("GET /api/player/lobby-snapshot online-count db error:", error);
      } else {
        onlinePlayers = Number((data as any)?.online_players ?? 0) || 0;
      }
    } catch (err: any) {
      console.error("GET /api/player/lobby-snapshot online-count error:", err);
    }

    const payload: LobbySnapshotResponse = {
      roomGroups: { groups: roomGroupsPayload },
      onlineCount: { onlinePlayers },
    };

    return NextResponse.json(payload);
  } catch (err: any) {
    console.error("GET /api/player/lobby-snapshot error:", err);
    return NextResponse.json(
      { error: "internal_error", message: err?.message || "Failed to load lobby snapshot." },
      { status: 500 }
    );
  }
}


