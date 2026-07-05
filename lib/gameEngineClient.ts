/**
 * Browser client for the Railway Game Engine command API (Phase 1).
 *
 * Hot paths: lobby snapshot, gameroom view, live room snapshot, join room.
 * Falls back to legacy Supabase/Vercel when NEXT_PUBLIC_USE_GAME_ENGINE !== "true".
 */

import { supabase } from "@/lib/supabaseClient";
import { getGameEngineBaseUrl, isGameEngineEnabled } from "@/lib/gameEngine/config";

export type JoinOrCreateResult = {
  room_id: string;
  starts_at: string | null;
  ticket_ids: string[];
};

export type GameRoomView = {
  mode: "preview" | "waiting" | "running" | "finished";
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

export type LobbySnapshotResponse = {
  roomGroups: {
    groups: Array<{
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
    }>;
  };
  onlineCount: { onlinePlayers: number };
};

/** Matches /api/player/live-room and LiveRoomSnapshot in services/rooms.ts */
export type LiveRoomEngineResponse = {
  room: {
    id: string;
    status: string | null;
    room_code?: string | null;
    room_seed_hash?: string | null;
    card_price?: number;
    currency?: string;
    min_players?: number | null;
    max_cards_per_player?: number | null;
    started_at?: string | null;
    next_draw_at?: string | null;
    line_reward_percentage?: number;
    full_reward_percentage?: number;
    commission_rate?: number;
    ding_per_number?: number;
    draw_interval_sec?: number;
  };
  tournament?: {
    id: string;
    title: string | null;
    round_no: number | null;
  } | null;
  server_now?: string;
  draws: Array<{
    id: string;
    number: number;
    created_at: string;
    processed_at: string;
  }>;
  cards?: Array<{
    ticket_id: string;
    player_id: string | null;
    player_name: string;
    card_number: number | null;
    card: (number | null)[][];
    is_my_card: boolean;
  }>;
};

const LIVE_ROOM_ENGINE_TIMEOUT_MS = 12_000;

export class GameEngineApiError extends Error {
  constructor(
    message: string,
    public statusCode?: number
  ) {
    super(message);
    this.name = "GameEngineApiError";
  }
}

async function getAccessToken(): Promise<string> {
  const {
    data: { session },
    error,
  } = await supabase.auth.getSession();

  if (error || !session?.access_token) {
    throw new GameEngineApiError("Authentication required.", 401);
  }

  return session.access_token;
}

async function callGameEngine<T>(
  path: string,
  options: { method?: "GET" | "POST"; body?: unknown; timeoutMs?: number } = {}
): Promise<T> {
  const baseUrl = getGameEngineBaseUrl();
  if (!baseUrl) {
    throw new GameEngineApiError("NEXT_PUBLIC_GAME_ENGINE_URL is not configured.");
  }

  const token = await getAccessToken();
  const method = options.method ?? "GET";
  const timeoutMs = options.timeoutMs ?? 0;

  const controller = timeoutMs > 0 ? new AbortController() : null;
  const timeoutId =
    controller && timeoutMs > 0
      ? setTimeout(() => controller.abort(), timeoutMs)
      : null;

  try {
    const res = await fetch(`${baseUrl}${path}`, {
      method,
      cache: "no-store",
      signal: controller?.signal,
      headers: {
        Authorization: `Bearer ${token}`,
        ...(options.body ? { "Content-Type": "application/json" } : {}),
      },
      ...(options.body ? { body: JSON.stringify(options.body) } : {}),
    });

    let payload: unknown = null;
    try {
      payload = await res.json();
    } catch {
      payload = null;
    }

    if (!res.ok) {
      const message =
        (payload as { error?: string; message?: string } | null)?.error ??
        (payload as { message?: string } | null)?.message ??
        `Game Engine request failed (${res.status})`;
      throw new GameEngineApiError(message, res.status);
    }

    return payload as T;
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") {
      throw new GameEngineApiError("Game Engine request timed out", 408);
    }
    throw err;
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
  }
}

export function isValidLiveRoomPayload(
  payload: unknown
): payload is LiveRoomEngineResponse {
  if (!payload || typeof payload !== "object") return false;
  const p = payload as LiveRoomEngineResponse;
  if (!p.room || typeof p.room.id !== "string") return false;
  if (!Array.isArray(p.draws)) return false;
  return true;
}

function normalizeJoinResult(data: unknown): JoinOrCreateResult {
  if (Array.isArray(data) && data.length > 0) {
    return data[0] as JoinOrCreateResult;
  }

  if (data && typeof data === "object" && "room_id" in data) {
    return data as JoinOrCreateResult;
  }

  return {
    room_id: "",
    starts_at: null,
    ticket_ids: [],
  };
}

export function mapJoinEngineError(error: unknown): Error {
  const message =
    error instanceof GameEngineApiError
      ? error.message
      : error instanceof Error
        ? error.message
        : "join failed";

  if (message.includes("invalid room password")) {
    return new Error("رمز اتاق اشتباه است");
  }
  if (message.includes("max_cards_per_player exceeded")) {
    return new Error("سقف تعداد کارت برای این اتاق را رد کرده‌اید");
  }
  if (message.includes("room is full")) {
    return new Error("اتاق پر است و ظرفیت بازیکنان تکمیل شده");
  }
  if (message.includes("no active card pool")) {
    return new Error("هیچ card pool فعالی برای ایجاد اتاق موجود نیست");
  }
  if (message.includes("insufficient balance")) {
    return new Error("موجودی کافی نیست");
  }
  if (message.includes("player account suspended")) {
    return new Error(
      "اکانت شما در حالت تعلیق است و فعلاً امکان ورود به اتاق وجود ندارد"
    );
  }
  if (
    message.includes("agent account suspended") ||
    message.includes("super account suspended")
  ) {
    return new Error(
      "به دلیل تعلیق ایجنت یا سوپر شما، فعلاً امکان ورود به اتاق وجود ندارد"
    );
  }
  if (message.includes("global registration locked")) {
    return new Error(
      "ثبت نام بازی توسط ادمین موقتاً قفل شده است. لطفاً بعداً دوباره تلاش کنید."
    );
  }

  return error instanceof Error ? error : new Error(message);
}

/** Lobby snapshot — GET /v1/lobby */
export async function getLobby(): Promise<LobbySnapshotResponse> {
  console.info("[ENGINE_PATH] getLobby → Game Engine /v1/lobby");
  return callGameEngine<LobbySnapshotResponse>("/v1/lobby");
}

/** Game room view by roomId — GET /v1/gameroom?roomId= */
export async function getRoomState(roomId: string): Promise<GameRoomView> {
  const search = new URLSearchParams({ roomId });
  console.info("[ENGINE_PATH] getRoomState → Game Engine /v1/gameroom", {
    roomId,
  });
  return callGameEngine<GameRoomView>(`/v1/gameroom?${search.toString()}`);
}

/** Game room view by templateId — GET /v1/gameroom?templateId= */
export async function getGameRoomViewByTemplate(
  templateId: string
): Promise<GameRoomView> {
  const search = new URLSearchParams({ templateId });
  console.info("[ENGINE_PATH] getGameRoomViewByTemplate → Game Engine /v1/gameroom", {
    templateId,
  });
  return callGameEngine<GameRoomView>(`/v1/gameroom?${search.toString()}`);
}

/** Live room snapshot — GET /v1/live-room */
export async function getLiveRoom(
  roomId: string,
  scope?: "full" | "draws"
): Promise<LiveRoomEngineResponse> {
  const search = new URLSearchParams({ roomId });
  if (scope === "draws") {
    search.set("scope", "draws");
  }

  console.info("[ENGINE_PATH] live-room → Game Engine /v1/live-room", {
    roomId,
    scope: scope ?? "full",
  });

  const payload = await callGameEngine<unknown>(
    `/v1/live-room?${search.toString()}`,
    { timeoutMs: LIVE_ROOM_ENGINE_TIMEOUT_MS }
  );

  if (!isValidLiveRoomPayload(payload)) {
    throw new GameEngineApiError("Invalid live-room payload from Game Engine", 502);
  }

  return payload;
}

/** Join or create room — POST /v1/rooms/join */
export async function joinOrCreateRoomViaEngine(options: {
  templateId: string;
  cardCount: number;
  password?: string;
}): Promise<JoinOrCreateResult> {
  console.info("[ENGINE_PATH] joinOrCreateRoom → Game Engine /v1/rooms/join", {
    templateId: options.templateId,
    cardCount: options.cardCount,
    hasPassword: Boolean(options.password),
  });

  const data = await callGameEngine<unknown>("/v1/rooms/join", {
    method: "POST",
    body: {
      templateId: options.templateId,
      cardCount: options.cardCount,
      password: options.password ?? null,
    },
  });

  return normalizeJoinResult(data);
}

export { isGameEngineEnabled };
