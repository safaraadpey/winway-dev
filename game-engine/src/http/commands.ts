/**
 * Command handlers — the business operations the frontend routes through the
 * engine instead of calling Supabase RPCs directly.
 *
 * Each command verifies the caller's JWT, then performs the operation with the
 * service-role client. Where a DB RPC currently relies on auth.uid(), the engine
 * substitutes the verified user id and calls the engine-facing variant (e.g.
 * fn_system_join_or_create_room rather than the client-facing fn_join_or_create_room).
 *
 * Behavior is preserved: same DB functions, same rows written; only the caller
 * (engine vs browser) and the auth check (verified JWT vs RLS) change.
 */

import type { SupabaseAdmin } from "../db/supabase-admin.js";
import type { AuthedUser } from "./auth.js";
import { buildGameRoomView } from "./gameroom-view.js";
import { buildLobbySnapshot } from "./lobby-snapshot.js";
import { buildLiveRoomSnapshot } from "./live-room-view.js";

export interface CommandResult {
  status: number;
  body: unknown;
}

function ok(body: unknown): CommandResult {
  return { status: 200, body };
}
function bad(message: string, status = 400): CommandResult {
  return { status, body: { error: message } };
}

/**
 * POST /v1/rooms/join
 * Body: { templateId, cardCount, password? }
 * Replaces client `supabase.rpc('fn_join_or_create_room', ...)`.
 * Engine path: fn_system_join_or_create_room(p_user_id=<verified>, ...).
 */
export async function joinOrCreateRoom(
  supabase: SupabaseAdmin,
  user: AuthedUser,
  body: Record<string, unknown>
): Promise<CommandResult> {
  const templateId = body.templateId ?? body.p_template_id;
  const cardCount = body.cardCount ?? body.p_card_count;
  const password = (body.password ?? body.p_password ?? null) as string | null;

  if (typeof templateId !== "string") return bad("templateId is required");
  if (typeof cardCount !== "number") return bad("cardCount must be a number");

  const { data, error } = await supabase.rpc("fn_system_join_or_create_room", {
    p_user_id: user.id,
    p_template_id: templateId,
    p_card_count: cardCount,
    p_password: password,
  });
  if (error) return bad(error.message, 422);
  return ok(data);
}

/**
 * GET /v1/rooms/:id/state — read-through to game_core.api_get_room_state.
 * Authenticated so the engine can later scope the payload to the caller.
 */
export async function getRoomState(
  supabase: SupabaseAdmin,
  _user: AuthedUser,
  roomId: string
): Promise<CommandResult> {
  const { data, error } = await supabase.rpc("api_get_room_state", {
    p_room_id: roomId,
  });
  if (error) return bad(error.message, 422);
  return ok(data);
}

/**
 * GET /v1/gameroom — GameRoomView snapshot (roomId or templateId query params).
 */
export async function getGameRoomView(
  supabase: SupabaseAdmin,
  user: AuthedUser,
  params: { roomId?: string | null; templateId?: string | null }
): Promise<CommandResult> {
  if (!params.roomId && !params.templateId) {
    return bad("Either roomId or templateId must be provided.");
  }

  const view = await buildGameRoomView(supabase, user.id, params);
  if (!view) {
    return {
      status: 404,
      body: {
        error: params.roomId ? "room_not_found" : "template_not_found",
        message: params.roomId ? "Room not found." : "Room template not found or inactive.",
      },
    };
  }

  return ok(view);
}

/**
 * GET /v1/lobby — lobby snapshot matching /api/player/lobby-snapshot.
 */
export async function getLobby(
  supabase: SupabaseAdmin,
  _user: AuthedUser
): Promise<CommandResult> {
  try {
    const snapshot = await buildLobbySnapshot(supabase);
    return ok(snapshot);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to load lobby snapshot.";
    return bad(message, 500);
  }
}

/**
 * GET /v1/live-room — live room snapshot matching /api/player/live-room.
 */
export async function getLiveRoom(
  supabase: SupabaseAdmin,
  user: AuthedUser,
  params: { roomId: string; scope?: "full" | "draws" }
): Promise<CommandResult> {
  if (!params.roomId) {
    return bad("roomId is required.");
  }

  const scope = params.scope === "draws" ? "draws" : "full";

  try {
    const snapshot = await buildLiveRoomSnapshot(
      supabase,
      user.id,
      params.roomId,
      scope
    );

    if (!snapshot) {
      return {
        status: 404,
        body: { error: "room_not_found", message: "Room not found." },
      };
    }

    return ok(snapshot);
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Failed to load live room state.";
    return bad(message, 500);
  }
}
