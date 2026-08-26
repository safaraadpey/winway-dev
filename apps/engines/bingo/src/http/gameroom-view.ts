/**
 * GameRoomView builder for GET /v1/gameroom.
 * Mirrors app/api/player/gameroom/route.ts using Supabase service role (no direct PG).
 */

import type { SupabaseAdmin } from "../db/supabase-admin.js";

type GameMode = "preview" | "waiting" | "running" | "finished";

const CANCEL_WINDOW_SECONDS = 15;

export type GameRoomView = {
  mode: GameMode;
  room: {
    id: string | null;
    template_id: string;
    room_type: string | null;
    room_code: string | null;
    title: string | null;
    status: string | null;
    ticket_price: number;
    currency: string;
    min_players: number | null;
    max_players: number | null;
    max_cards_per_player: number | null;
    starts_at: string | null;
    ends_at: string | null;
    requires_password: boolean;
  };
  server_now: string;
  countdown_seconds: number;
  active_cards: Array<{
    user_id: string;
    display_name: string;
    card_count: number;
  }>;
  active_tables: Array<{
    room_id: string;
    room_code: string;
    players: number;
    card_count: number;
    prize: number;
  }>;
  can_cancel: boolean;
  global_registration_locked: boolean;
  global_registration_lock_reason: string | null;
};

type GlobalRegistrationLockState = {
  locked: boolean;
  reason: string | null;
};

function mapRoomStatusToMode(status: string | null): GameMode {
  if (!status) return "preview";

  switch (status.toLowerCase()) {
    case "waiting":
      return "waiting";
    case "playing":
    case "running":
    case "live":
      return "running";
    case "settling":
      return "running";
    case "finished":
    case "cancelled":
    case "canceled":
      return "finished";
    default:
      return "finished";
  }
}

function computeCountdownSeconds(
  startsAt: string | null,
  serverNowIso: string
): number {
  if (!startsAt) return 0;

  const starts = Date.parse(startsAt);
  const now = Date.parse(serverNowIso);

  if (Number.isNaN(starts) || Number.isNaN(now)) return 0;

  return Math.max(0, Math.floor((starts - now) / 1000));
}

function isWaitingCountdownElapsed(
  status: string | null,
  startsAt: string | null,
  serverNowIso: string
): boolean {
  if ((status || "").toLowerCase() !== "waiting") return false;
  if (!startsAt) return false;
  const startsMs = Date.parse(startsAt);
  const nowMs = Date.parse(serverNowIso);
  return Number.isFinite(startsMs) && Number.isFinite(nowMs) && startsMs <= nowMs;
}

function templateRequiresPassword(password: string | null | undefined): boolean {
  return typeof password === "string" && password.trim().length > 0;
}

function computeCanCancel({
  roomStatus,
  countdownSeconds,
  activeCards,
  currentUserId,
}: {
  roomStatus: string | null;
  countdownSeconds: number;
  activeCards: Array<{ user_id: string; card_count: number }>;
  currentUserId: string;
}): boolean {
  if (!currentUserId) return false;
  if (!roomStatus || roomStatus !== "waiting") return false;
  if (countdownSeconds <= 0 || countdownSeconds > CANCEL_WINDOW_SECONDS) return false;

  const players = new Set<string>();
  for (const card of activeCards) {
    if (card.user_id) players.add(card.user_id);
  }

  if (players.size !== 1) return false;

  const currentPlayerCards = activeCards.find(
    (card) => card.user_id === currentUserId
  );
  if (!currentPlayerCards || currentPlayerCards.card_count <= 0) return false;

  return true;
}

async function loadGlobalRegistrationLockState(
  supabase: SupabaseAdmin
): Promise<GlobalRegistrationLockState> {
  const { data, error } = await supabase
    .from("app_runtime_flags")
    .select("global_registration_locked, global_registration_lock_reason")
    .eq("id", true)
    .maybeSingle();

  if (error) {
    if ((error as { code?: string }).code === "42P01") {
      return { locked: false, reason: null };
    }
    return { locked: false, reason: null };
  }

  return {
    locked: Boolean((data as { global_registration_locked?: boolean })?.global_registration_locked),
    reason:
      (data as { global_registration_lock_reason?: string | null })
        ?.global_registration_lock_reason ?? null,
  };
}

async function loadActiveCardsForRoom(
  supabase: SupabaseAdmin,
  roomId: string
): Promise<Array<{ user_id: string; display_name: string; card_count: number }>> {
  const { data: tickets, error } = await supabase
    .from("tickets")
    .select("id, player_user_id, reservation_status")
    .eq("room_id", roomId)
    .in("reservation_status", ["reserved", "confirmed", "consumed"]);

  if (error || !tickets?.length) return [];

  const counts: Record<string, number> = {};
  for (const t of tickets as Array<{ player_user_id: string | null }>) {
    const userId = t.player_user_id;
    if (!userId) continue;
    counts[userId] = (counts[userId] || 0) + 1;
  }

  const userIds = Object.keys(counts);
  if (userIds.length === 0) return [];

  const [{ data: users }, { data: profiles }] = await Promise.all([
    supabase.from("users").select("id, username").in("id", userIds),
    supabase.from("user_profiles").select("user_id, nickname").in("user_id", userIds),
  ]);

  const usernameById = new Map<string, string>();
  for (const u of (users || []) as Array<{ id: string; username: string | null }>) {
    if (u.username) usernameById.set(u.id, u.username);
  }

  const nicknameById = new Map<string, string>();
  for (const p of (profiles || []) as Array<{ user_id: string; nickname: string | null }>) {
    if (p.nickname) nicknameById.set(p.user_id, p.nickname);
  }

  return userIds
    .map((userId) => ({
      user_id: userId,
      display_name: nicknameById.get(userId) || usernameById.get(userId) || userId,
      card_count: counts[userId] || 0,
    }))
    .sort((a, b) => a.display_name.localeCompare(b.display_name, "fa"));
}

async function loadPlayingTablesForTemplate(
  supabase: SupabaseAdmin,
  templateId: string | null,
  fallback?: { cardPrice: number; currency: string }
): Promise<
  Array<{
    room_id: string;
    room_code: string;
    players: number;
    card_count: number;
    prize: number;
  }>
> {
  if (!templateId && !fallback) return [];

  let query = supabase
    .from("rooms")
    .select("id, room_code, card_price, currency, room_template_id")
    .in("status", ["playing"]);

  if (templateId) {
    query = query.eq("room_template_id", templateId);
  } else if (fallback) {
    query = query
      .eq("card_price", fallback.cardPrice)
      .eq("currency", fallback.currency);
  }

  const { data: rooms, error } = await query;
  if (error || !rooms?.length) return [];

  const roomIds = (rooms as Array<{ id: string }>).map((r) => r.id);
  const { data: ticketsData } = await supabase
    .from("tickets")
    .select("room_id, player_user_id")
    .in("room_id", roomIds)
    .in("reservation_status", ["reserved", "confirmed", "consumed"]);

  const stats: Record<string, { players: Set<string>; cards: number }> = {};
  for (const t of (ticketsData || []) as Array<{
    room_id: string;
    player_user_id: string | null;
  }>) {
    if (!stats[t.room_id]) {
      stats[t.room_id] = { players: new Set(), cards: 0 };
    }
    if (t.player_user_id) stats[t.room_id].players.add(t.player_user_id);
    stats[t.room_id].cards += 1;
  }

  const result: Array<{
    room_id: string;
    room_code: string;
    players: number;
    card_count: number;
    prize: number;
  }> = [];

  for (const r of rooms as Array<{
    id: string;
    room_code: string;
    card_price: unknown;
  }>) {
    const s = stats[r.id] || { players: new Set(), cards: 0 };
    const cardCount = s.cards;
    result.push({
      room_id: r.id,
      room_code: r.room_code,
      players: s.players.size,
      card_count: cardCount,
      prize: Number(r.card_price || 0) * cardCount,
    });
  }

  return result;
}

async function getRoomTemplateType(
  supabase: SupabaseAdmin,
  templateId: string | null
): Promise<string | null> {
  if (!templateId) return null;

  const { data } = await supabase
    .from("room_templates")
    .select("room_type")
    .eq("id", templateId)
    .maybeSingle();

  return ((data as { room_type?: string | null })?.room_type as string | null) ?? null;
}

async function getTemplateRequiresPassword(
  supabase: SupabaseAdmin,
  templateId: string | null
): Promise<boolean> {
  if (!templateId) return false;

  const { data } = await supabase
    .from("room_templates")
    .select("password")
    .eq("id", templateId)
    .maybeSingle();

  return templateRequiresPassword(
    (data as { password?: string | null })?.password
  );
}

async function buildViewFromRoomId(
  supabase: SupabaseAdmin,
  roomId: string,
  serverNow: string,
  currentUserId: string,
  globalRegistrationLockState: GlobalRegistrationLockState
): Promise<GameRoomView | null> {
  const { data: room, error: roomError } = await supabase
    .from("rooms")
    .select(
      `
        id,
        room_template_id,
        room_code,
        title,
        status,
        card_price,
        currency,
        min_players,
        max_players,
        max_cards_per_player,
        starts_at,
        ends_at
      `
    )
    .eq("id", roomId)
    .single();

  if (roomError || !room) return null;

  const status = (room.status as string | null) ?? null;
  const mode = mapRoomStatusToMode(status);
  const roomType = await getRoomTemplateType(
    supabase,
    (room.room_template_id as string | null) ?? null
  );

  const activeCards = await loadActiveCardsForRoom(supabase, room.id as string);
  const activeTables = await loadPlayingTablesForTemplate(
    supabase,
    (room.room_template_id as string | null) ?? null,
    {
      cardPrice: Number(room.card_price || 0),
      currency: (room.currency as string) || "IRR",
    }
  );

  const countdownSeconds =
    mode === "waiting"
      ? computeCountdownSeconds(room.starts_at as string | null, serverNow)
      : 0;

  const canCancel = computeCanCancel({
    roomStatus: status,
    countdownSeconds,
    activeCards,
    currentUserId,
  });

  const requiresPassword = await getTemplateRequiresPassword(
    supabase,
    (room.room_template_id as string | null) ?? null
  );

  return {
    mode,
    room: {
      id: room.id as string,
      template_id: (room.room_template_id as string) ?? "",
      room_type: roomType,
      room_code: room.room_code as string | null,
      title: room.title as string | null,
      status,
      ticket_price: Number(room.card_price || 0),
      currency: (room.currency as string) || "IRR",
      min_players: (room.min_players as number | null) ?? null,
      max_players: (room.max_players as number | null) ?? null,
      max_cards_per_player: (room.max_cards_per_player as number | null) ?? null,
      starts_at: (room.starts_at as string | null) ?? null,
      ends_at: (room.ends_at as string | null) ?? null,
      requires_password: requiresPassword,
    },
    server_now: serverNow,
    countdown_seconds: countdownSeconds,
    active_cards: activeCards,
    active_tables: activeTables,
    can_cancel: canCancel,
    global_registration_locked: globalRegistrationLockState.locked,
    global_registration_lock_reason: globalRegistrationLockState.reason,
  };
}

async function buildViewFromTemplateId(
  supabase: SupabaseAdmin,
  templateId: string,
  serverNow: string,
  currentUserId: string,
  globalRegistrationLockState: GlobalRegistrationLockState
): Promise<GameRoomView | null> {
  const { data: waitingRooms, error: waitingRoomsError } = await supabase
    .from("rooms")
    .select(
      `
        id,
        room_template_id,
        room_code,
        title,
        status,
        card_price,
        currency,
        min_players,
        max_players,
        max_cards_per_player,
        starts_at,
        ends_at,
        created_at
      `
    )
    .eq("room_template_id", templateId)
    .in("status", ["waiting"]);

  if (waitingRoomsError) {
    return null;
  }

  const roomRows = (waitingRooms || []) as Array<{
    id: string;
    status: string | null;
    starts_at: string | null;
    created_at: string | null;
  }>;

  if (roomRows.length > 0) {
    const roomIds = roomRows.map((r) => r.id);
    const { data: myTickets } = await supabase
      .from("tickets")
      .select("room_id")
      .eq("player_user_id", currentUserId)
      .in("room_id", roomIds)
      .in("reservation_status", ["reserved", "confirmed", "consumed"]);

    const sortByPriority = (
      a: { status: string | null; starts_at: string | null; created_at: string | null },
      b: { status: string | null; starts_at: string | null; created_at: string | null }
    ) => {
      const aStart = a.starts_at ? Date.parse(a.starts_at) : 0;
      const bStart = b.starts_at ? Date.parse(b.starts_at) : 0;
      if (aStart !== bStart) return bStart - aStart;
      const aCreated = a.created_at ? Date.parse(a.created_at) : 0;
      const bCreated = b.created_at ? Date.parse(b.created_at) : 0;
      return bCreated - aCreated;
    };

    const myRoomIds = new Set(
      ((myTickets || []) as Array<{ room_id: string | null }>)
        .map((t) => t.room_id)
        .filter((id): id is string => Boolean(id))
    );
    const myActiveRooms = roomRows
      .filter((room) => myRoomIds.has(room.id))
      .sort(sortByPriority);
    const spectatorJoinableRooms = roomRows
      .filter(
        (room) =>
          !isWaitingCountdownElapsed(room.status, room.starts_at, serverNow)
      )
      .sort(sortByPriority);
    const selectedRoom = myActiveRooms[0] ?? spectatorJoinableRooms[0];

    if (selectedRoom?.id) {
      return buildViewFromRoomId(
        supabase,
        selectedRoom.id,
        serverNow,
        currentUserId,
        globalRegistrationLockState
      );
    }
  }

  const { data: template, error: templateError } = await supabase
    .from("room_templates")
    .select(
      `
        id,
        name,
        room_type,
        price,
        currency,
        min_players,
        max_cards_per_player,
        max_players,
        status,
        password
      `
    )
    .eq("id", templateId)
    .single();

  if (templateError || !template || template.status === "inactive") {
    return null;
  }

  const activeTables = await loadPlayingTablesForTemplate(supabase, templateId, {
    cardPrice: Number(template.price || 0),
    currency: (template.currency as string) || "IRR",
  });

  return {
    mode: "preview",
    room: {
      id: null,
      template_id: template.id as string,
      room_type: (template.room_type as string | null) ?? null,
      room_code: null,
      title: template.name as string | null,
      status: null,
      ticket_price: Number(template.price || 0),
      currency: (template.currency as string) || "IRR",
      min_players: (template.min_players as number | null) ?? null,
      max_players: (template.max_players as number | null) ?? null,
      max_cards_per_player: (template.max_cards_per_player as number | null) ?? null,
      starts_at: null,
      ends_at: null,
      requires_password: templateRequiresPassword(
        (template as { password?: string | null }).password
      ),
    },
    server_now: serverNow,
    countdown_seconds: 0,
    active_cards: [],
    active_tables: activeTables,
    can_cancel: false,
    global_registration_locked: globalRegistrationLockState.locked,
    global_registration_lock_reason: globalRegistrationLockState.reason,
  };
}

export async function buildGameRoomView(
  supabase: SupabaseAdmin,
  currentUserId: string,
  params: { roomId?: string | null; templateId?: string | null }
): Promise<GameRoomView | null> {
  const serverNow = new Date().toISOString();
  const globalRegistrationLockState = await loadGlobalRegistrationLockState(supabase);

  if (params.roomId) {
    return buildViewFromRoomId(
      supabase,
      params.roomId,
      serverNow,
      currentUserId,
      globalRegistrationLockState
    );
  }

  if (params.templateId) {
    return buildViewFromTemplateId(
      supabase,
      params.templateId,
      serverNow,
      currentUserId,
      globalRegistrationLockState
    );
  }

  return null;
}
