import { NextResponse } from "next/server";
import {
  loadPlayingTablesFromPg,
  loadRoomLifecycleBatchFromPg,
  loadRoomLifecycleFromPg,
  resolveRoomLifecycleFields,
} from "@/lib/gameroomRoomPg";
import { pgPool } from "@/lib/pg";
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
  const [{ data: room, error: roomError }, pgLifecycle] = await Promise.all([
    supabase
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
        waiting_started_at,
        updated_at
      `
      )
      .eq("id", roomId)
      .single(),
    loadRoomLifecycleFromPg(roomId),
  ]);

  if (roomError || !room) {
    console.error("buildViewFromRoomId: rooms error", roomError);
    return null;
  }

  const lifecycle = resolveRoomLifecycleFields(
    roomId,
    room,
    pgLifecycle,
    "buildViewFromRoomId"
  );

  const mode = mapRoomStatusToMode(lifecycle.status);
  const roomType = await getRoomTemplateType(
    supabase,
    (room.room_template_id as string | null) ?? null
  );

  // کارت‌های فعال (بر اساس tickets)
  const activeCards = await loadActiveCardsForRoom(supabase, room.id as string);

  // میزهای playing همین تمپلیت (باکس «میزهای فعال»)
  const activeTables = await loadPlayingTablesForTemplate(
    supabase,
    (room.room_template_id as string | null) ?? null,
    {
      cardPrice: Number(room.card_price || 0),
      currency: room.currency || "IRR",
    }
  );

  const countdownSeconds =
    mode === "waiting"
      ? computeCountdownSeconds(lifecycle.starts_at, serverNow)
      : 0;

  const canCancel = computeCanCancel({
    roomStatus: lifecycle.status,
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
      status: lifecycle.status,
      ticket_price: Number(room.card_price || 0),
      currency: room.currency || "IRR",
      min_players: room.min_players ?? null,
      max_players: room.max_players ?? null,
      max_cards_per_player: room.max_cards_per_player ?? null,
      starts_at: lifecycle.starts_at,
      ends_at: lifecycle.ends_at,
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
        waiting_started_at,
        updated_at,
        created_at
      `
    )
    .eq("room_template_id", templateId)
    .in("status", waitingStatuses);

  if (waitingRoomsError) {
    console.error("buildViewFromTemplateId: rooms waiting error", waitingRoomsError);
  }

  const rawRoomRows = (waitingRooms || []) as Array<{
    id: string;
    status: string | null;
    starts_at: string | null;
    ends_at: string | null;
    waiting_started_at: string | null;
    updated_at: string | null;
    created_at: string | null;
  }>;

  const pgLifecycleByRoomId = await loadRoomLifecycleBatchFromPg(
    rawRoomRows.map((r) => r.id)
  );

  const roomRows = rawRoomRows.map((room) => {
    const lifecycle = resolveRoomLifecycleFields(
      room.id,
      room,
      pgLifecycleByRoomId?.get(room.id),
      "buildViewFromTemplateId"
    );
    return {
      ...room,
      status: lifecycle.status,
      starts_at: lifecycle.starts_at,
      ends_at: lifecycle.ends_at,
      waiting_started_at: lifecycle.waiting_started_at,
      updated_at: lifecycle.updated_at,
    };
  });

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
        max_players,
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

  const activeTables = await loadPlayingTablesForTemplate(
    supabase,
    templateId,
    {
      cardPrice: Number(template.price || 0),
      currency: template.currency || "IRR",
    }
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
      max_players: template.max_players ?? null,
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
    .select("id, player_user_id, reservation_status, created_at")
    .eq("room_id", roomId)
    .in("reservation_status", ["reserved", "confirmed", "consumed"]);

  let pgCompareRows: Array<{ user_id: string; card_count: number }> | null =
    null;
  let pgCompareError: string | null = null;

  if (!pgPool) {
    pgCompareError = "DATABASE_URL not set";
  } else {
    try {
      const pgResult = await pgPool.query<{
        user_id: string;
        card_count: number;
      }>(
        `
        select
          t.player_user_id::text as user_id,
          count(*)::int as card_count
        from public.tickets t
        where t.room_id = $1::uuid
          and t.reservation_status in ('reserved','confirmed','consumed')
        group by t.player_user_id
        order by t.player_user_id
        `,
        [roomId]
      );
      pgCompareRows = pgResult.rows;
    } catch (pgErr) {
      pgCompareError =
        pgErr instanceof Error ? pgErr.message : "pg query failed";
      console.error("loadActiveCardsForRoom: pg compare error", pgErr);
    }
  }

  const { data: rpcDebug, error: rpcError } = await supabase.rpc(
    "debug_ticket_counts",
    { p_room_id: roomId }
  );

  const { data: ctx, error: ctxError } = await supabase.rpc(
    "debug_runtime_context",
    { p_room_id: roomId }
  );

  const { data: bypassRlsData, error: bypassRlsError } = await supabase.rpc(
    "test_active_cards_bypass_rls",
    { p_room_id: roomId }
  );

  console.info("[test_active_cards_bypass_rls]", {
    roomId,
    data: bypassRlsData,
    error: bypassRlsError,
  });

  console.info(
    "[debug_runtime_context]",
    JSON.stringify({ roomId, ctx, ctxError: ctxError?.message ?? null })
  );

  console.info(
    "[activeCardsRpcDebug]",
    JSON.stringify({
      roomId,
      supabaseRows: tickets?.length ?? 0,
      ticketsError: error?.message ?? null,
      rpcDebug,
      rpcError: rpcError?.message ?? null,
    })
  );

  const usePg = pgCompareRows !== null;
  const counts: Record<string, number> = {};

  if (usePg) {
    for (const row of pgCompareRows ?? []) {
      if (!row.user_id) continue;
      counts[row.user_id] = Number(row.card_count) || 0;
    }
  } else {
    if (error) {
      console.error("loadActiveCardsForRoom: tickets error", error);
      return [];
    }

    if (!tickets || tickets.length === 0) {
      return [];
    }

    for (const t of tickets as any[]) {
      const userId = t.player_user_id as string | null;
      if (!userId) continue;
      counts[userId] = (counts[userId] || 0) + 1;
    }
  }

  const supabaseCounts: Record<string, number> = {};
  for (const t of tickets || []) {
    const userId = (t as { player_user_id?: string | null }).player_user_id;
    if (!userId) continue;
    supabaseCounts[userId] = (supabaseCounts[userId] || 0) + 1;
  }

  console.info(
    "[activeCardsCompare:pg-vs-supabase]",
    JSON.stringify({
      roomId,
      dataSource: usePg ? "pg" : "supabase",
      supabaseRows: tickets?.length ?? null,
      supabasePlayers: Object.keys(supabaseCounts),
      pgRows: pgCompareRows,
      pgCompareError,
      pgTotalCards: (pgCompareRows ?? []).reduce(
        (sum, r) => sum + Number(r.card_count || 0),
        0
      ),
      debugTs: new Date().toISOString(),
    })
  );

  const userIds = Object.keys(counts);
  if (userIds.length === 0) {
    return [];
  }

  const [{ data: users, error: usersError }, { data: profiles, error: profilesError }] =
    await Promise.all([
      supabase.from("users").select("id, username").in("id", userIds),
      supabase.from("user_profiles").select("user_id, nickname").in("user_id", userIds),
    ]);

  if (usersError) {
    console.error("loadActiveCardsForRoom: users error", usersError);
  }
  if (profilesError) {
    console.error("loadActiveCardsForRoom: user_profiles error", profilesError);
  }

  const usernameById = new Map<string, string>();
  for (const u of (users || []) as Array<{ id: string; username: string | null }>) {
    if (u.username) usernameById.set(u.id, u.username);
  }

  const nicknameById = new Map<string, string>();
  for (const p of (profiles || []) as Array<{ user_id: string; nickname: string | null }>) {
    if (p.nickname) nicknameById.set(p.user_id, p.nickname);
  }

  // همیشه از روی ticket counts خروجی بساز — هیچ player_user_id حذف نشود.
  const result: Array<{
    user_id: string;
    display_name: string;
    card_count: number;
  }> = userIds.map((userId) => ({
    user_id: userId,
    display_name:
      nicknameById.get(userId) || usernameById.get(userId) || userId,
    card_count: counts[userId] || 0,
  }));

  result.sort((a, b) => a.display_name.localeCompare(b.display_name, "fa"));

  console.info(
    "[loadActiveCardsForRoom]",
    JSON.stringify({
      roomId,
      dataSource: usePg ? "pg" : "supabase",
      ticketRowCount: usePg
        ? (pgCompareRows ?? []).reduce(
            (sum, r) => sum + Number(r.card_count || 0),
            0
          )
        : tickets?.length ?? 0,
      tickets: usePg ? null : tickets,
      counts,
      userIds,
      result,
    })
  );

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

async function loadPlayingTablesForTemplate(
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
  type ActiveTableResult = {
    room_id: string;
    room_code: string;
    players: number;
    card_count: number;
    prize: number;
  };

  if (!templateId && !fallback) {
    return [];
  }

  const pgParams = templateId
    ? { templateId }
    : {
        cardPrice: fallback!.cardPrice,
        currency: fallback!.currency,
      };

  const [pgTables, supabaseRoomsResult] = await Promise.all([
    loadPlayingTablesFromPg(pgParams),
    (() => {
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

      return query;
    })(),
  ]);

  const { data: rooms, error } = supabaseRoomsResult;

  if (error) {
    console.error("loadPlayingTablesForTemplate: rooms error", error);
  }

  const supabaseRoomIds = ((rooms || []) as Array<{ id: string }>).map(
    (r) => r.id
  );

  console.info(
    "[activeTablesCompare:pg-vs-supabase]",
    JSON.stringify({
      templateId,
      fallback: fallback ?? null,
      dataSource: pgTables !== null ? "pg" : "supabase",
      supabaseRoomCount: supabaseRoomIds.length,
      supabaseRoomIds,
      pgRoomCount: pgTables?.length ?? null,
      pgRooms: pgTables?.map((t) => ({
        room_id: t.room_id,
        room_code: t.room_code,
        players: t.players,
        card_count: t.card_count,
      })),
      debugTs: new Date().toISOString(),
    })
  );

  if (pgTables !== null) {
    return pgTables.map((row) => ({
      room_id: row.room_id,
      room_code: row.room_code,
      players: row.players,
      card_count: row.card_count,
      prize: row.card_price * row.card_count,
    }));
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
    console.error("loadPlayingTablesForTemplate: tickets error", ticketsError);
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

  const result: ActiveTableResult[] = [];

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


