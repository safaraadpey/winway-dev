import { NextResponse } from "next/server";
import { createServiceClient, getUserFromRequest } from "@/lib/supabaseServer";

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

function computeCountdownSeconds(startsAt: string | null, serverNowIso: string): number {
  if (!startsAt) return 0;

  const starts = Date.parse(startsAt);
  const now = Date.parse(serverNowIso);

  if (Number.isNaN(starts) || Number.isNaN(now)) return 0;

  const diffMs = starts - now;
  return Math.max(0, Math.floor(diffMs / 1000));
}

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const searchParams = url.searchParams;

    const roomId = searchParams.get("roomId");
    const templateId = searchParams.get("templateId");

    if (!roomId && !templateId) {
      return NextResponse.json(
        {
          error: "missing_parameters",
          message: "Either roomId or templateId must be provided.",
        },
        { status: 400 }
      );
    }

    // احراز هویت پلیر از روی Authorization header (Bearer token)
    const user = await getUserFromRequest(request);

    if (!user) {
      return NextResponse.json(
        {
          error: "unauthorized",
          message: "Authentication required.",
        },
        { status: 401 }
      );
    }

    const supabase = createServiceClient();
    const serverNow = new Date().toISOString();
    const globalRegistrationLockState = await loadGlobalRegistrationLockState(supabase);

    if (roomId) {
      const view = await buildViewFromRoomId(
        supabase,
        roomId,
        serverNow,
        user.id,
        globalRegistrationLockState
      );
      if (!view) {
        // Never substitute another waiting room — client holds tickets on roomId.
        return NextResponse.json(
          { error: "room_not_found", message: "Room not found." },
          { status: 404 }
        );
      }
      return NextResponse.json(view);
    }

    // templateId mode
    if (!templateId) {
      // این حالت نباید برسد، ولی برای اطمینان:
      return NextResponse.json(
        {
          error: "missing_parameters",
          message: "templateId is required when roomId is not provided.",
        },
        { status: 400 }
      );
    }

    const view = await buildViewFromTemplateId(
      supabase,
      templateId,
      serverNow,
      user.id,
      globalRegistrationLockState
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
  } catch (error: any) {
    console.error("GET /api/player/gameroom error:", error);
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
  supabase: ReturnType<typeof createServiceClient>,
  roomId: string,
  serverNow: string,
  currentUserId: string,
  globalRegistrationLockState: GlobalRegistrationLockState
): Promise<GameRoomView | null> {
  // اطلاعات روم
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

  if (roomError || !room) {
    console.error("buildViewFromRoomId: rooms error", roomError);
    return null;
  }

  const mode = mapRoomStatusToMode(room.status || null);
  const roomType = await getRoomTemplateType(
    supabase,
    (room.room_template_id as string | null) ?? null
  );

  // کارت‌های فعال (بر اساس tickets)
  const activeCards = await loadActiveCardsForRoom(supabase, room.id as string);

  // میزهای فعال دیگر با همین قیمت/ارز
  const activeTables = await loadActiveTablesForRoom(
    supabase,
    Number(room.card_price || 0),
    room.currency || "IRR",
    undefined
  );

  const countdownSeconds =
    mode === "waiting" ? computeCountdownSeconds(room.starts_at || null, serverNow) : 0;

  const canCancel = computeCanCancel({
    roomStatus: room.status || null,
    countdownSeconds,
    activeCards,
    currentUserId,
  });

  const view: GameRoomView = {
    mode,
    room: {
      id: room.id,
      template_id: room.room_template_id,
      room_type: roomType,
      room_code: room.room_code,
      title: room.title,
      status: room.status,
      ticket_price: Number(room.card_price || 0),
      currency: room.currency || "IRR",
      min_players: room.min_players ?? null,
      max_players: room.max_players ?? null,
      max_cards_per_player: room.max_cards_per_player ?? null,
      starts_at: room.starts_at,
      ends_at: room.ends_at,
    },
    server_now: serverNow,
    countdown_seconds: countdownSeconds,
    active_cards: activeCards,
    active_tables: activeTables,
    can_cancel: canCancel,
    global_registration_locked: globalRegistrationLockState.locked,
    global_registration_lock_reason: globalRegistrationLockState.reason,
  };

  return view;
}

async function buildViewFromTemplateId(
  supabase: ReturnType<typeof createServiceClient>,
  templateId: string,
  serverNow: string,
  currentUserId: string,
  globalRegistrationLockState: GlobalRegistrationLockState
): Promise<GameRoomView | null> {
  const waitingStatuses = ["waiting"];

  // ۱) فقط روم‌های waiting این template را بگیر
  // (طبق نیاز محصول، ورود از template نباید مستقیم وارد playing/live شود)
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
    .in("status", waitingStatuses);

  if (waitingRoomsError) {
    console.error("buildViewFromTemplateId: rooms waiting error", waitingRoomsError);
  }

  const roomRows = (waitingRooms || []) as Array<{
    id: string;
    status: string | null;
    starts_at: string | null;
    created_at: string | null;
  }>;

  if (roomRows.length > 0) {
    const roomIds = roomRows.map((r) => r.id);

    // ۲) اگر کاربر قبلاً در یکی از این روم‌ها کارت فعال دارد، همان روم انتخاب شود
    const { data: myTickets, error: myTicketsError } = await supabase
      .from("tickets")
      .select("room_id")
      .eq("player_user_id", currentUserId)
      .in("room_id", roomIds)
      .in("reservation_status", ["reserved", "confirmed", "consumed"]);

    if (myTicketsError) {
      console.error("buildViewFromTemplateId: myTickets error", myTicketsError);
    }

    const rankByStatus = (status: string | null): number => {
      const normalized = (status || "").toLowerCase();
      if (normalized === "playing" || normalized === "live" || normalized === "running") return 1;
      if (normalized === "settling") return 2;
      if (normalized === "waiting") return 3;
      return 9;
    };

    const sortByPriority = (a: { status: string | null; starts_at: string | null; created_at: string | null }, b: { status: string | null; starts_at: string | null; created_at: string | null }) => {
      const rankDiff = rankByStatus(a.status) - rankByStatus(b.status);
      if (rankDiff !== 0) return rankDiff;

      // جدیدتر اولویت دارد تا کاربر به آخرین روم فعال خودش برگردد.
      const aStart = a.starts_at ? Date.parse(a.starts_at) : 0;
      const bStart = b.starts_at ? Date.parse(b.starts_at) : 0;
      if (aStart !== bStart) return bStart - aStart;

      const aCreated = a.created_at ? Date.parse(a.created_at) : 0;
      const bCreated = b.created_at ? Date.parse(b.created_at) : 0;
      return bCreated - aCreated;
    };

    const myRoomIds = new Set(((myTickets || []) as Array<{ room_id: string | null }>).map((t) => t.room_id).filter((id): id is string => Boolean(id)));
    const myActiveRooms = roomRows.filter((room) => myRoomIds.has(room.id)).sort(sortByPriority);

    const selectedRoom = myActiveRooms[0] ?? roomRows.slice().sort(sortByPriority)[0];

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

  // ۳) اگر هیچ روم فعالی نبود، حالت preview از template برگردانده می‌شود.
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
        status
      `
    )
    .eq("id", templateId)
    .single();

  if (templateError || !template) {
    console.error("buildViewFromTemplateId: room_templates error", templateError);
    return null;
  }

  if (template.status === "inactive") {
    // تمپلیت غیرفعال نباید preview شود
    return null;
  }

  const activeTables = await loadActiveTablesForRoom(
    supabase,
    Number(template.price || 0),
    template.currency || "IRR",
    undefined
  );

  const view: GameRoomView = {
    mode: "preview",
    room: {
      id: null,
      template_id: template.id,
      room_type: template.room_type || null,
      room_code: null,
      title: template.name,
      status: null,
      ticket_price: Number(template.price || 0),
      currency: template.currency || "IRR",
      min_players: template.min_players ?? null,
      // در اسکیمای فعلی room_templates ستون مستقیمی برای max_players نداریم
      // در صورت نیاز در آینده می‌توان این مقدار را از ستون متناظر نگاشت کرد
      max_players: null,
      max_cards_per_player: template.max_cards_per_player ?? null,
      starts_at: null,
      ends_at: null,
    },
    server_now: serverNow,
    countdown_seconds: 0,
    active_cards: [],
    active_tables: activeTables,
    can_cancel: false,
    global_registration_locked: globalRegistrationLockState.locked,
    global_registration_lock_reason: globalRegistrationLockState.reason,
  };

  return view;
}

async function getRoomTemplateType(
  supabase: ReturnType<typeof createServiceClient>,
  templateId: string | null
): Promise<string | null> {
  if (!templateId) return null;

  const { data, error } = await supabase
    .from("room_templates")
    .select("room_type")
    .eq("id", templateId)
    .maybeSingle();

  if (error || !data) return null;
  return ((data as any).room_type as string | null) ?? null;
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
    if (card.user_id) {
      players.add(card.user_id);
    }
  }

  if (players.size !== 1) {
    return false;
  }

  const currentPlayerCards = activeCards.find((card) => card.user_id === currentUserId);
  if (!currentPlayerCards || currentPlayerCards.card_count <= 0) {
    return false;
  }

  return true;
}

async function loadActiveCardsForRoom(
  supabase: ReturnType<typeof createServiceClient>,
  roomId: string
): Promise<
  Array<{
    user_id: string;
    display_name: string;
    card_count: number;
  }>
> {
  const { data: tickets, error } = await supabase
    .from("tickets")
    .select("player_user_id")
    .eq("room_id", roomId)
    .in("reservation_status", ["reserved", "confirmed", "consumed"]);

  if (error) {
    console.error("loadActiveCardsForRoom: tickets error", error);
    return [];
  }

  if (!tickets || tickets.length === 0) {
    return [];
  }

  const counts: Record<string, number> = {};
  for (const t of tickets as any[]) {
    const userId = t.player_user_id as string | null;
    if (!userId) continue;
    counts[userId] = (counts[userId] || 0) + 1;
  }

  const userIds = Object.keys(counts);
  if (userIds.length === 0) {
    return [];
  }

  const { data: users, error: usersError } = await supabase
    .from("users")
    .select("id, username, user_profiles(nickname)")
    .in("id", userIds);

  if (usersError) {
    console.error("loadActiveCardsForRoom: users error", usersError);
    // اگر اطلاعات کاربر را نتوانیم بخوانیم، حداقل card_count را نگه می‌داریم
    return userIds.map((id) => ({
      user_id: id,
      display_name: id,
      card_count: counts[id] || 0,
    }));
  }

  const result: Array<{
    user_id: string;
    display_name: string;
    card_count: number;
  }> = [];

  for (const u of users as any[]) {
    const profile = Array.isArray(u.user_profiles)
      ? u.user_profiles[0]
      : u.user_profiles;
    const displayName =
      profile?.nickname || u.username || (u.id as string);

    result.push({
      user_id: u.id as string,
      display_name: displayName,
      card_count: counts[u.id as string] || 0,
    });
  }

  return result;
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
    // Graceful fallback for environments where migration is not applied yet.
    if ((error as any).code === "42P01") {
      return { locked: false, reason: null };
    }
    console.error("loadGlobalRegistrationLockState error:", error);
    return { locked: false, reason: null };
  }

  return {
    locked: Boolean((data as any)?.global_registration_locked),
    reason: (data as any)?.global_registration_lock_reason ?? null,
  };
}

async function loadActiveTablesForRoom(
  supabase: ReturnType<typeof createServiceClient>,
  cardPrice: number,
  currency: string,
  excludeRoomId?: string
): Promise<
  Array<{
    room_id: string;
    room_code: string;
    players: number;
    card_count: number;
    prize: number;
  }>
> {
  const query = supabase
    .from("rooms")
    .select("id, room_code, card_price, currency")
    .eq("card_price", cardPrice)
    .eq("currency", currency)
    .in("status", ["playing"]);

  if (excludeRoomId) {
    query.neq("id", excludeRoomId);
  }

  const { data: rooms, error } = await query;

  if (error) {
    console.error("loadActiveTablesForRoom: rooms error", error);
    return [];
  }

  if (!rooms || rooms.length === 0) {
    return [];
  }

  const roomIds = (rooms as any[]).map((r) => r.id as string);

  const { data: ticketsData, error: ticketsError } = await supabase
    .from("tickets")
    .select("room_id, player_user_id")
    .in("room_id", roomIds)
    .in("reservation_status", ["reserved", "confirmed", "consumed"]);

  if (ticketsError) {
    console.error("loadActiveTablesForRoom: tickets error", ticketsError);
  }

  const stats: Record<string, { players: Set<string>; cards: number }> = {};

  for (const t of (ticketsData || []) as any[]) {
    const rId = t.room_id as string;
    const pId = t.player_user_id as string | null;
    if (!stats[rId]) {
      stats[rId] = { players: new Set(), cards: 0 };
    }
    if (pId) {
      stats[rId].players.add(pId);
    }
    stats[rId].cards += 1;
  }

  const result: Array<{
    room_id: string;
    room_code: string;
    players: number;
    card_count: number;
    prize: number;
  }> = [];

  for (const r of rooms as any[]) {
    const s = stats[r.id as string] || { players: new Set(), cards: 0 };
    const cardCount = s.cards;
    const prize = Number(r.card_price || 0) * cardCount;

    result.push({
      room_id: r.id as string,
      room_code: r.room_code as string,
      players: s.players.size,
      card_count: cardCount,
      prize,
    });
  }

  return result;
}


