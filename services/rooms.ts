// services/rooms.ts
//
// Supabase-backed service functions for working with `public.room_templates`.
// این توابع فقط لایه‌ی دسترسی به دیتا هستند و در کامپوننت‌ها/هوک‌ها استفاده می‌شوند.

import { supabase } from "@/lib/supabaseClient";
import {
  RoomTemplatePayload,
  RoomTemplateDbRow,
  mapRoomTemplateFromDb,
  mapRoomTemplateToDbUpdate,
} from "@/src/types/room";

/**
 * بارگذاری لیست Room Template ها از دیتابیس.
 *
 * - منبع داده: جدول `public.room_templates`
 * - خروجی: آرایه‌ای از `RoomTemplatePayload` که برای UI مناسب است.
 * - ترتیب: بر اساس `created_at DESC` (جدیدترین در بالا)
 */
export async function loadRooms(): Promise<RoomTemplatePayload[]> {
  const { data, error } = await supabase
    .from("room_templates")
    .select(
      `
        id,
        name,
        price,
        currency,
        min_players,
        countdown_sec,
        draw_interval_sec,
        line_reward_percentage,
        full_reward_percentage,
        vip,
        password,
        repeatable,
        scheduled_start_time,
        ding_per_number,
        room_type,
        commission_rate,
        max_cards_per_player,
        status
      `
    )
    .eq("room_type", "normal")
    .order("created_at", { ascending: false });

  if (error) {
    console.error("loadRooms error:", error);
    throw new Error(error.message || "Failed to load room templates");
  }

  if (!data) return [];

  return data.map(mapRoomTemplateFromDb);
}

/**
 * ذخیره‌سازی یک Room Template (ساخت یا ویرایش).
 *
 * رفتار:
 * - اگر `payload.id` موجود باشد → UPDATE روی همان ردیف.
 * - اگر `payload.id` خالی باشد → INSERT و ایجاد template جدید.
 *
 * منبع داده: جدول `public.room_templates`
 * ورودی/خروجی: `RoomTemplatePayload`
 */
export async function saveRoomTemplate(
  payload: RoomTemplatePayload
): Promise<RoomTemplatePayload> {
  const dbUpdate = mapRoomTemplateToDbUpdate(payload);

  let row: RoomTemplateDbRow | null = null;

  if (payload.id) {
    // UPDATE موجود
    const { data, error } = await supabase
      .from("room_templates")
      .update(dbUpdate)
      .eq("id", payload.id)
      .select(
        `
          id,
          name,
          price,
          currency,
          min_players,
          countdown_sec,
          draw_interval_sec,
          line_reward_percentage,
          full_reward_percentage,
          vip,
          password,
          repeatable,
          scheduled_start_time,
          ding_per_number,
          room_type,
          commission_rate,
          max_cards_per_player,
          status
        `
      )
      .single();

    if (error) {
      console.error("saveRoomTemplate (update) error:", error);
      throw new Error(error.message || "Failed to update room template");
    }

    row = data;
  } else {
    // INSERT جدید
    const { data, error } = await supabase
      .from("room_templates")
      .insert(dbUpdate)
      .select(
        `
          id,
          name,
          price,
          currency,
          min_players,
          countdown_sec,
          draw_interval_sec,
          line_reward_percentage,
          full_reward_percentage,
          vip,
          password,
          repeatable,
          scheduled_start_time,
          ding_per_number,
          room_type,
          commission_rate,
          max_cards_per_player,
          status
        `
      )
      .single();

    if (error) {
      console.error("saveRoomTemplate (insert) error:", error);
      throw new Error(error.message || "Failed to create room template");
    }

    row = data;
  }

  if (!row) {
    throw new Error("No data returned from saveRoomTemplate");
  }

  return mapRoomTemplateFromDb(row);
}

/**
 * حذف یک Room Template بر اساس id.
 */
export async function deleteRoomTemplate(id: string): Promise<void> {
  const { error } = await supabase
    .from("room_templates")
    .delete()
    .eq("id", id);

  if (error) {
    console.error("deleteRoomTemplate error:", error);
    throw new Error(error.message || "Failed to delete room template");
  }
}

/**
 * Join یا Create Room - استفاده از RPC function
 */
export type JoinOrCreateResult = {
  room_id: string;
  starts_at: string | null;
  ticket_ids: string[];
};

export async function joinOrCreateRoom(options: {
  templateId: string;
  cardCount: number;
  password?: string; // اختیاری
}): Promise<JoinOrCreateResult> {
  const { templateId, cardCount, password } = options;

  // قبل از هر چیز، وضعیت تمپلیت را چک می‌کنیم
  const { data: templateRow, error: templateError } = await supabase
    .from("room_templates")
    .select("id, status")
    .eq("id", templateId)
    .single();

  if (templateError || !templateRow) {
    console.error("joinOrCreateRoom: template not found or error", templateError);
    throw new Error("اتاق مورد نظر پیدا نشد یا غیرفعال است");
  }

  if (templateRow.status !== "active") {
    throw new Error("این اتاق در حال حاضر فعال نیست");
  }

  console.log("[JOIN_RPC][CALL]", {
    templateId,
    cardCount,
    hasPassword: Boolean(password),
  });

  const { data, error } = await supabase.rpc("fn_join_or_create_room", {
    p_template_id: templateId,
    p_card_count: cardCount,
    p_password: password ?? null,
  });

  if (error) {
    console.error("[JOIN_RPC][ERROR_RAW]", error);

    // هندل خطاهای شایع
    if (error.message.includes("invalid room password")) {
      throw new Error("رمز اتاق اشتباه است");
    }
    if (error.message.includes("max_cards_per_player exceeded")) {
      throw new Error("سقف تعداد کارت برای این اتاق را رد کرده‌اید");
    }
    if (error.message.includes("no active card pool")) {
      throw new Error("هیچ card pool فعالی برای ایجاد اتاق موجود نیست");
    }
    if (error.message.includes("insufficient balance")) {
      throw new Error("موجودی کافی نیست");
    }
    if (error.message.includes("player account suspended")) {
      throw new Error(
        "اکانت شما در حالت تعلیق است و فعلاً امکان ورود به اتاق وجود ندارد"
      );
    }
    if (
      error.message.includes("agent account suspended") ||
      error.message.includes("super account suspended")
    ) {
      throw new Error(
        "به دلیل تعلیق ایجنت یا سوپر شما، فعلاً امکان ورود به اتاق وجود ندارد"
      );
    }

    console.error("joinOrCreateRoom error:", error);
    throw error;
  }

  let row: JoinOrCreateResult = {
    room_id: "",
    starts_at: null,
    ticket_ids: [],
  };

  if (Array.isArray(data) && data.length > 0) {
    row = data[0] as JoinOrCreateResult;
  } else {
    console.warn("[JOIN_RPC][EMPTY_DATA]", {
      templateId,
      cardCount,
      hasPassword: !!password,
      data,
    });
  }

  console.log("[JOIN_RPC][DONE]", {
    room_id: row.room_id,
    starts_at: row.starts_at,
    ticket_ids_count: row.ticket_ids?.length ?? 0,
  });

  return row;
}

export async function cancelWaitingRoom(roomId: string): Promise<void> {
  if (!roomId) {
    throw new Error("شناسه روم نامعتبر است");
  }

  const {
    data: { session },
  } = await supabase.auth.getSession();

  const token = session?.access_token || null;

  const res = await fetch("/api/player/cancel-waiting-room", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({ roomId }),
  });

  let payload: any = null;
  try {
    payload = await res.json();
  } catch {
    payload = null;
  }

  if (!res.ok) {
    throw new Error(
      payload?.message || "امکان لغو روم در حال انتظار وجود ندارد"
    );
  }
}

/**
 * بارگذاری اطلاعات یک روم
 */
export interface RoomInfo {
  id: string;
  roomCode: string;
  title?: string;
  status: string;
  cardPrice: number;
  currency: string;
  countdownSec?: number;
  startsAt?: string;
  endsAt?: string;
  minPlayers?: number;
  maxPlayers?: number;
  currentPlayers: number;
  templateId?: string;
  canCancel?: boolean;
}

export async function loadRoomInfo(roomId: string): Promise<RoomInfo | null> {
  const { data, error } = await supabase
    .from("rooms")
    .select(
      `
      id,
      room_code,
      title,
      status,
      card_price,
      currency,
      countdown_sec,
      starts_at,
      ends_at,
      min_players,
      max_players,
      room_template_id
    `
    )
    .eq("id", roomId)
    .single();

  if (error) {
    console.error("loadRoomInfo error:", error);
    return null;
  }

  if (!data) return null;

  // شمارش تعداد بازیکنان فعلی
  const { count: playerCount } = await supabase
    .from("tickets")
    .select("*", { count: "exact", head: true })
    .eq("room_id", roomId)
    .in("reservation_status", ["reserved", "confirmed", "consumed"]);

  return {
    id: data.id,
    roomCode: data.room_code,
    title: data.title || undefined,
    status: data.status,
    cardPrice: Number(data.card_price || 0),
    currency: data.currency || "IRR",
    countdownSec: data.countdown_sec || undefined,
    startsAt: data.starts_at || undefined,
    endsAt: data.ends_at || undefined,
    minPlayers: data.min_players || undefined,
    maxPlayers: data.max_players || undefined,
    currentPlayers: playerCount || 0,
    templateId: data.room_template_id || undefined,
  };
}

/**
 * بارگذاری کارت‌های فعال کاربر در یک روم
 */
export interface UserActiveCard {
  id: string;
  ticketId: string;
  cardNo: number;
  status: string;
  createdAt: string;
}

export async function loadUserActiveCards(
  roomId: string,
  userId: string
): Promise<UserActiveCard[]> {
  const { data, error } = await supabase
    .from("tickets")
    .select("id, card_no, reservation_status, created_at")
    .eq("room_id", roomId)
    .eq("player_user_id", userId)
    .in("reservation_status", ["reserved", "confirmed", "consumed"])
    .order("created_at", { ascending: false });

  if (error) {
    console.error("loadUserActiveCards error:", error);
    return [];
  }

  if (!data) return [];

  return data.map((ticket) => ({
    id: ticket.id,
    ticketId: ticket.id,
    cardNo: ticket.card_no,
    status: ticket.reservation_status,
    createdAt: ticket.created_at,
  }));
}

/**
 * بارگذاری کارت‌های فعال همه کاربران در یک روم (گروه‌بندی شده)
 */
export interface RoomActiveCard {
  userId: string;
  userName: string;
  displayName?: string;
  cardCount: number;
}

export async function loadRoomActiveCards(
  roomId: string
): Promise<RoomActiveCard[]> {
  const { data: tickets, error } = await supabase
    .from("tickets")
    .select("player_user_id")
    .eq("room_id", roomId)
    .in("reservation_status", ["reserved", "confirmed", "consumed"]);

  if (error) {
    console.error("loadRoomActiveCards error:", error);
    return [];
  }

  if (!tickets || tickets.length === 0) return [];

  // شمارش کارت‌های هر کاربر
  const cardsByUser: { [userId: string]: number } = {};
  tickets.forEach((ticket) => {
    const userId = ticket.player_user_id;
    cardsByUser[userId] = (cardsByUser[userId] || 0) + 1;
  });

  // گرفتن اطلاعات کاربران
  const userIds = Object.keys(cardsByUser);
  const { data: users, error: usersError } = await supabase
    .from("users")
    .select("id, username, user_profiles(nickname)")
    .in("id", userIds);

  if (usersError) {
    console.error("loadRoomActiveCards users error:", usersError);
    return [];
  }

  // ساخت لیست نهایی
  return (users || []).map((user: any) => {
    const profile = Array.isArray(user.user_profiles)
      ? user.user_profiles[0]
      : user.user_profiles;
    return {
      userId: user.id,
      userName: user.username || "نامشخص",
      displayName: profile?.nickname,
      cardCount: cardsByUser[user.id] || 0,
    };
  });
}

/**
 * بارگذاری میزهای فعال (روم‌های دیگر با همان قیمت)
 */
export interface ActiveTableInfo {
  id: string;
  roomCode: string;
  prize: number; // مجموع جایزه (محاسبه از card_price * تعداد کارت‌ها)
  players: number;
  cardCount: number;
}

export async function loadActiveTables(
  cardPrice: number,
  currency: string = "IRR",
  excludeRoomId?: string
): Promise<ActiveTableInfo[]> {
  const query = supabase
    .from("rooms")
    .select("id, room_code, card_price, currency")
    .eq("card_price", cardPrice)
    .eq("currency", currency)
    .in("status", ["waiting", "playing"]);

  if (excludeRoomId) {
    query.neq("id", excludeRoomId);
  }

  const { data: rooms, error } = await query;

  if (error) {
    console.error("loadActiveTables error:", error);
    return [];
  }

  if (!rooms || rooms.length === 0) return [];

  // برای هر روم، تعداد بازیکنان و کارت‌ها را محاسبه می‌کنیم
  const roomIds = rooms.map((r) => r.id);
  const { data: ticketsData } = await supabase
    .from("tickets")
    .select("room_id, player_user_id")
    .in("room_id", roomIds)
    .in("reservation_status", ["reserved", "confirmed", "consumed"]);

  // شمارش بازیکنان و کارت‌ها برای هر روم
  const roomStats: {
    [roomId: string]: { players: Set<string>; cards: number };
  } = {};
  ticketsData?.forEach((ticket) => {
    if (!roomStats[ticket.room_id]) {
      roomStats[ticket.room_id] = { players: new Set(), cards: 0 };
    }
    roomStats[ticket.room_id].players.add(ticket.player_user_id);
    roomStats[ticket.room_id].cards += 1;
  });

  return rooms.map((room) => {
    const stats = roomStats[room.id] || { players: new Set(), cards: 0 };
    const cardCount = stats.cards;
    const prize = Number(room.card_price) * cardCount;

    return {
      id: room.id,
      roomCode: room.room_code,
      prize,
      players: stats.players.size,
      cardCount,
    };
  });
}

// -----------------------------
// GameRoomView (Phase 1)
// -----------------------------

export type GameMode = "preview" | "waiting" | "running" | "finished";

export type GameRoomView = {
  mode: GameMode;
  room: {
    id: string | null;
    template_id: string;
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
};

export async function fetchGameRoomView(params: {
  roomId?: string;
  templateId?: string;
}): Promise<GameRoomView> {
  const search = new URLSearchParams();
  if (params.roomId) search.set("roomId", params.roomId);
  if (params.templateId) search.set("templateId", params.templateId);

  // گرفتن access token از Supabase برای احراز هویت در API داخلی
  const {
    data: { session },
  } = await supabase.auth.getSession();

  const token = session?.access_token || null;

  const res = await fetch(`/api/player/gameroom?${search.toString()}`, {
    method: "GET",
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });

  if (!res.ok) {
    throw new Error("failed to load game room");
  }

  return (await res.json()) as GameRoomView;
}

export interface LiveRoomSnapshot {
  room: {
    id: string;
    status: string | null;
    room_code: string | null;
    room_seed_hash?: string | null;
    card_price: number;
    currency: string;
    min_players: number | null;
    max_cards_per_player: number | null;
    started_at: string | null;
    next_draw_at?: string | null;
    line_reward_percentage: number;
    full_reward_percentage: number;
    commission_rate: number;
  };
  tournament?: {
    id: string;
    title: string | null;
    round_no: number | null;
  } | null;
  server_now?: string;
  draws: Array<{ number: number; created_at: string }>;
  cards: Array<{
    ticket_id: string;
    player_id: string | null;
    player_name: string;
    card_number: number | null;
    card: (number | null)[][];
    is_my_card: boolean;
  }>;
}

export async function fetchLiveRoomSnapshot(
  roomId: string
): Promise<LiveRoomSnapshot> {
  const search = new URLSearchParams();
  search.set("roomId", roomId);

  const {
    data: { session },
  } = await supabase.auth.getSession();
  const token = session?.access_token || null;

  const res = await fetch(`/api/player/live-room?${search.toString()}`, {
    method: "GET",
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });

  if (!res.ok) {
    throw new Error("failed to load live room data");
  }

  return (await res.json()) as LiveRoomSnapshot;
}

// Results dialog data
export type Winner = {
  id: string;
  avatarUrl: string;
  nickname: string;
  prizeAmount: number;
  ticketId?: string;
  drawNumber?: number;
};

export type RoomResultsResponse = {
  lineWinners: Winner[];
  fullWinners: Winner[];
  seed: string | null;
  commitHash: string | null;
  isTournament: boolean;
  tournamentId: string | null;
};

export async function fetchRoomResults(
  roomId: string
): Promise<RoomResultsResponse> {
  const search = new URLSearchParams();
  search.set("roomId", roomId);

  const {
    data: { session },
  } = await supabase.auth.getSession();
  const token = session?.access_token || null;

  const res = await fetch(`/api/player/room-results?${search.toString()}`, {
    method: "GET",
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });

  if (!res.ok) {
    throw new Error("failed to load room results");
  }

  return (await res.json()) as RoomResultsResponse;
}
