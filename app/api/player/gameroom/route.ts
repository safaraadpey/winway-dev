import { NextResponse } from "next/server";
import {
  loadGameRoomSnapshotFromPg,
  loadPlayingTablesFromPg,
  loadTemplatePreviewFromPg,
  nudgeWaitingRoomSchedulerFireAndForget,
  resolveWaitingRoomIdForTemplateFromPg,
  type GameroomSnapshotPg,
} from "@/lib/gameroomRoomPg";
import { createServiceClient, getUserFromRequest } from "@/lib/supabaseServer";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type GameMode = "preview" | "waiting" | "running" | "finished";

const CANCEL_WINDOW_SECONDS = 15;

type GameRoomView = {
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

function templateRequiresPassword(
  password: string | null | undefined
): boolean {
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
  if (countdownSeconds <= 0 || countdownSeconds > CANCEL_WINDOW_SECONDS) {
    return false;
  }

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

function buildViewFromPgSnapshot(
  snapshot: GameroomSnapshotPg,
  serverNow: string,
  currentUserId: string,
  lockOverride?: {
    locked: boolean;
    reason: string | null;
  }
): GameRoomView {
  const { room } = snapshot;
  const mode = mapRoomStatusToMode(room.status);
  const countdownSeconds =
    mode === "waiting"
      ? computeCountdownSeconds(room.starts_at, serverNow)
      : 0;

  const locked = lockOverride ?? {
    locked: snapshot.global_registration_locked,
    reason: snapshot.global_registration_lock_reason,
  };

  return {
    mode,
    room: {
      id: room.id,
      template_id: room.template_id,
      room_type: room.room_type,
      room_code: room.room_code,
      title: room.title,
      status: room.status,
      ticket_price: room.card_price,
      currency: room.currency,
      min_players: room.min_players,
      max_players: room.max_players,
      max_cards_per_player: room.max_cards_per_player,
      starts_at: room.starts_at,
      ends_at: room.ends_at,
      requires_password: room.requires_password,
    },
    server_now: serverNow,
    countdown_seconds: countdownSeconds,
    active_cards: snapshot.active_cards,
    active_tables: snapshot.active_tables,
    can_cancel: computeCanCancel({
      roomStatus: room.status,
      countdownSeconds,
      activeCards: snapshot.active_cards,
      currentUserId,
    }),
    global_registration_locked: locked.locked,
    global_registration_lock_reason: locked.reason,
  };
}

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const roomId = url.searchParams.get("roomId");
    const templateId = url.searchParams.get("templateId");

    if (!roomId && !templateId) {
      return NextResponse.json(
        {
          error: "missing_parameters",
          message: "Either roomId or templateId must be provided.",
        },
        { status: 400 }
      );
    }

    const user = await getUserFromRequest(request);
    if (!user) {
      return NextResponse.json(
        { error: "unauthorized", message: "Authentication required." },
        { status: 401 }
      );
    }

    const serverNow = new Date().toISOString();

    if (roomId) {
      const view = await buildViewFromRoomId(
        roomId,
        serverNow,
        user.id
      );
      if (!view) {
        return NextResponse.json(
          { error: "room_not_found", message: "Room not found." },
          { status: 404 }
        );
      }
      return NextResponse.json(view);
    }

    if (!templateId) {
      return NextResponse.json(
        {
          error: "missing_parameters",
          message: "templateId is required when roomId is not provided.",
        },
        { status: 400 }
      );
    }

    const view = await buildViewFromTemplateId(
      templateId,
      serverNow,
      user.id
    );
    if (!view) {
      return NextResponse.json(
        {
          error: "template_not_found",
          message: "Room template not found or inactive.",
        },
        { status: 404 }
      );
    }

    return NextResponse.json(view);
  } catch (error: unknown) {
    console.error("[Room] GET /api/player/gameroom error:", error);
    return NextResponse.json(
      {
        error: "internal_error",
        message: "Failed to load game room view.",
      },
      { status: 500 }
    );
  }
}

async function buildViewFromRoomId(
  roomId: string,
  serverNow: string,
  currentUserId: string
): Promise<GameRoomView | null> {
  const pgSnapshot = await loadGameRoomSnapshotFromPg(roomId);
  if (pgSnapshot) {
    if (
      isWaitingCountdownElapsed(
        pgSnapshot.room.status,
        pgSnapshot.room.starts_at,
        serverNow
      )
    ) {
      nudgeWaitingRoomSchedulerFireAndForget(roomId);
    }
    return buildViewFromPgSnapshot(pgSnapshot, serverNow, currentUserId);
  }

  return buildViewFromRoomIdSupabaseFallback(
    roomId,
    serverNow,
    currentUserId
  );
}

async function buildViewFromTemplateId(
  templateId: string,
  serverNow: string,
  currentUserId: string
): Promise<GameRoomView | null> {
  const resolvedRoomId = await resolveWaitingRoomIdForTemplateFromPg(
    templateId,
    currentUserId,
    serverNow
  );

  if (resolvedRoomId) {
    return buildViewFromRoomId(resolvedRoomId, serverNow, currentUserId);
  }

  const preview = await loadTemplatePreviewFromPg(templateId);
  if (preview) {
    return {
      mode: "preview",
      room: {
        id: null,
        template_id: preview.template.id,
        room_type: preview.template.room_type,
        room_code: null,
        title: preview.template.name,
        status: null,
        ticket_price: preview.template.price,
        currency: preview.template.currency,
        min_players: preview.template.min_players,
        max_players: preview.template.max_players,
        max_cards_per_player: preview.template.max_cards_per_player,
        starts_at: null,
        ends_at: null,
        requires_password: preview.template.requires_password,
      },
      server_now: serverNow,
      countdown_seconds: 0,
      active_cards: [],
      active_tables: preview.active_tables,
      can_cancel: false,
      global_registration_locked: preview.global_registration_locked,
      global_registration_lock_reason: preview.global_registration_lock_reason,
    };
  }

  return buildViewFromTemplateIdSupabaseFallback(
    templateId,
    serverNow,
    currentUserId
  );
}

/** Supabase fallback when DATABASE_URL / pgPool is unavailable. */
async function buildViewFromRoomIdSupabaseFallback(
  roomId: string,
  serverNow: string,
  currentUserId: string
): Promise<GameRoomView | null> {
  const supabase = createServiceClient();

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
        ends_at,
        room_templates (
          room_type,
          password
        )
      `
    )
    .eq("id", roomId)
    .single();

  if (roomError || !room) {
    console.error("[Room] buildViewFromRoomId fallback rooms error", roomError);
    return null;
  }

  const templateId = (room.room_template_id as string | null) ?? null;

  const [lockState, activeCards, activeTables] = await Promise.all([
    loadGlobalRegistrationLockState(supabase),
    loadActiveCardsForRoomFallback(supabase, roomId),
    loadPlayingTablesForTemplateFallback(supabase, templateId, {
      cardPrice: Number(room.card_price || 0),
      currency: (room.currency as string) || "IRR",
    }),
  ]);

  const templateJoin = room.room_templates as
    | { room_type?: string | null; password?: string | null }
    | { room_type?: string | null; password?: string | null }[]
    | null;
  const templateRow = Array.isArray(templateJoin)
    ? templateJoin[0]
    : templateJoin;

  const status = (room.status as string | null) ?? null;
  if (isWaitingCountdownElapsed(status, room.starts_at as string | null, serverNow)) {
    nudgeWaitingRoomSchedulerFireAndForget(roomId);
  }

  const mode = mapRoomStatusToMode(status);
  const countdownSeconds =
    mode === "waiting"
      ? computeCountdownSeconds(room.starts_at as string | null, serverNow)
      : 0;

  const tables = activeTables;

  return {
    mode,
    room: {
      id: room.id as string,
      template_id: room.room_template_id as string,
      room_type: templateRow?.room_type ?? null,
      room_code: room.room_code as string | null,
      title: room.title as string | null,
      status,
      ticket_price: Number(room.card_price || 0),
      currency: (room.currency as string) || "IRR",
      min_players: (room.min_players as number | null) ?? null,
      max_players: (room.max_players as number | null) ?? null,
      max_cards_per_player:
        (room.max_cards_per_player as number | null) ?? null,
      starts_at: (room.starts_at as string | null) ?? null,
      ends_at: (room.ends_at as string | null) ?? null,
      requires_password: templateRequiresPassword(templateRow?.password),
    },
    server_now: serverNow,
    countdown_seconds: countdownSeconds,
    active_cards: activeCards,
    active_tables: tables,
    can_cancel: computeCanCancel({
      roomStatus: status,
      countdownSeconds,
      activeCards,
      currentUserId,
    }),
    global_registration_locked: lockState.locked,
    global_registration_lock_reason: lockState.reason,
  };
}

async function buildViewFromTemplateIdSupabaseFallback(
  templateId: string,
  serverNow: string,
  currentUserId: string
): Promise<GameRoomView | null> {
  const supabase = createServiceClient();
  const waitingStatuses = ["waiting"];

  const [{ data: waitingRooms }, lockState] = await Promise.all([
    supabase
      .from("rooms")
      .select(
        `
        id,
        status,
        starts_at,
        created_at
      `
      )
      .eq("room_template_id", templateId)
      .in("status", waitingStatuses),
    loadGlobalRegistrationLockState(supabase),
  ]);

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
      a: {
        status: string | null;
        starts_at: string | null;
        created_at: string | null;
      },
      b: {
        status: string | null;
        starts_at: string | null;
        created_at: string | null;
      }
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
      return buildViewFromRoomIdSupabaseFallback(
        selectedRoom.id,
        serverNow,
        currentUserId
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

  const activeTables = await loadPlayingTablesForTemplateFallback(
    supabase,
    templateId,
    {
      cardPrice: Number(template.price || 0),
      currency: (template.currency as string) || "IRR",
    }
  );

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
      max_cards_per_player:
        (template.max_cards_per_player as number | null) ?? null,
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
    global_registration_locked: lockState.locked,
    global_registration_lock_reason: lockState.reason,
  };
}

type GlobalRegistrationLockState = {
  locked: boolean;
  reason: string | null;
};

async function loadGlobalRegistrationLockState(
  supabase: ReturnType<typeof createServiceClient>
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
    console.error("[Room] loadGlobalRegistrationLockState error:", error);
    return { locked: false, reason: null };
  }

  return {
    locked: Boolean(
      (data as { global_registration_locked?: boolean })?.global_registration_locked
    ),
    reason:
      (data as { global_registration_lock_reason?: string | null })
        ?.global_registration_lock_reason ?? null,
  };
}

async function loadActiveCardsForRoomFallback(
  supabase: ReturnType<typeof createServiceClient>,
  roomId: string
): Promise<
  Array<{ user_id: string; display_name: string; card_count: number }>
> {
  const { data: tickets, error } = await supabase
    .from("tickets")
    .select("player_user_id")
    .eq("room_id", roomId)
    .in("reservation_status", ["reserved", "confirmed", "consumed"]);

  if (error || !tickets?.length) {
    if (error) {
      console.error("[Room] loadActiveCardsForRoom fallback error:", error);
    }
    return [];
  }

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
    supabase
      .from("user_profiles")
      .select("user_id, nickname")
      .in("user_id", userIds),
  ]);

  const usernameById = new Map<string, string>();
  for (const u of (users || []) as Array<{
    id: string;
    username: string | null;
  }>) {
    if (u.username) usernameById.set(u.id, u.username);
  }

  const nicknameById = new Map<string, string>();
  for (const p of (profiles || []) as Array<{
    user_id: string;
    nickname: string | null;
  }>) {
    if (p.nickname) nicknameById.set(p.user_id, p.nickname);
  }

  return userIds
    .map((userId) => ({
      user_id: userId,
      display_name:
        nicknameById.get(userId) || usernameById.get(userId) || userId,
      card_count: counts[userId] || 0,
    }))
    .sort((a, b) => a.display_name.localeCompare(b.display_name, "fa"));
}

async function loadPlayingTablesForTemplateFallback(
  supabase: ReturnType<typeof createServiceClient>,
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
  const pgParams = templateId
    ? { templateId }
    : fallback
      ? { cardPrice: fallback.cardPrice, currency: fallback.currency }
      : null;

  if (pgParams) {
    const pgTables = await loadPlayingTablesFromPg(pgParams);
    if (pgTables !== null) {
      return pgTables.map((row) => ({
        room_id: row.room_id,
        room_code: row.room_code,
        players: row.players,
        card_count: row.card_count,
        prize: row.card_price * row.card_count,
      }));
    }
  }

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
  if (error || !rooms?.length) {
    if (error) {
      console.error("[Room] loadPlayingTables fallback rooms error:", error);
    }
    return [];
  }

  const roomIds = (rooms as Array<{ id: string }>).map((r) => r.id);
  const { data: ticketsData, error: ticketsError } = await supabase
    .from("tickets")
    .select("room_id, player_user_id")
    .in("room_id", roomIds)
    .in("reservation_status", ["reserved", "confirmed", "consumed"]);

  if (ticketsError) {
    console.error("[Room] loadPlayingTables fallback tickets error:", ticketsError);
  }

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

  return (rooms as Array<{ id: string; room_code: string; card_price: unknown }>).map(
    (r) => {
      const s = stats[r.id] || { players: new Set(), cards: 0 };
      const cardCount = s.cards;
      return {
        room_id: r.id,
        room_code: r.room_code,
        players: s.players.size,
        card_count: cardCount,
        prize: Number(r.card_price || 0) * cardCount,
      };
    }
  );
}
