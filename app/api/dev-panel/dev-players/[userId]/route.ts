import { NextRequest, NextResponse } from "next/server";
import { getDevPanelContextOrThrow, logAdminAction } from "@/lib/supabaseServer";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

function normalizePlayWindows(raw: unknown): Array<{ start: string; end: string }> {
  if (!Array.isArray(raw)) return [];
  const windows: Array<{ start: string; end: string }> = [];

  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const start = String((item as any).start || "").trim();
    const end = String((item as any).end || "").trim();
    if (!TIME_RE.test(start) || !TIME_RE.test(end)) continue;
    if (start >= end) continue;
    windows.push({ start, end });
  }

  return windows;
}

function parseOptionalPrice(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const num = Number(value);
  if (!Number.isFinite(num) || num < 0) return null;
  return num;
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: { userId: string } }
) {
  try {
    const { session, supabase } = await getDevPanelContextOrThrow(request);
    const userId = params.userId;

    if (!userId) {
      return NextResponse.json(
        { ok: false, error: "invalid_payload", message: "user_id is required" },
        { status: 400 }
      );
    }

    const body = await request.json();
    const {
      is_enabled,
      play_windows,
      min_room_price,
      max_room_price,
      max_ticket_count,
    } = body ?? {};

    const { data: targetUser, error: targetError } = await supabase
      .from("users")
      .select("id, role, username")
      .eq("id", userId)
      .single();

    if (targetError || !targetUser) {
      return NextResponse.json(
        { ok: false, error: "user_not_found", message: "user not found" },
        { status: 404 }
      );
    }

    if (targetUser.role !== "player") {
      return NextResponse.json(
        { ok: false, error: "validation_error", message: "only player users can be dev players" },
        { status: 400 }
      );
    }

    if (is_enabled === false) {
      const { error: deleteError } = await supabase
        .from("dev_player_configs")
        .delete()
        .eq("user_id", userId);

      if (deleteError) {
        console.error("dev-panel dev player disable error:", deleteError);
        return NextResponse.json(
          { ok: false, error: "database_error", message: deleteError.message },
          { status: 500 }
        );
      }

      await logAdminAction(
        supabase,
        session.user.id,
        "dev_panel_disable_dev_player",
        "dev_player_configs",
        userId,
        { username: targetUser.username },
        request
      );

      return NextResponse.json({ ok: true, data: { devPlayerConfig: null } });
    }

    const playWindows = normalizePlayWindows(play_windows);
    const minRoomPrice = parseOptionalPrice(min_room_price);
    const maxRoomPrice = parseOptionalPrice(max_room_price);
    const maxTicketCount = Number(max_ticket_count);

    if (!Number.isInteger(maxTicketCount) || maxTicketCount < 1 || maxTicketCount > 50) {
      return NextResponse.json(
        { ok: false, error: "validation_error", message: "max_ticket_count must be 1..50" },
        { status: 400 }
      );
    }

    if (
      minRoomPrice !== null &&
      maxRoomPrice !== null &&
      minRoomPrice > maxRoomPrice
    ) {
      return NextResponse.json(
        { ok: false, error: "validation_error", message: "min_room_price cannot exceed max_room_price" },
        { status: 400 }
      );
    }

    const { data: existingConfig } = await supabase
      .from("dev_player_configs")
      .select("user_id")
      .eq("user_id", userId)
      .maybeSingle();

    const upsertPayload: Record<string, unknown> = {
      user_id: userId,
      is_enabled: true,
      play_windows: playWindows,
      min_room_price: minRoomPrice,
      max_room_price: maxRoomPrice,
      max_ticket_count: maxTicketCount,
      updated_by: session.user.id,
    };

    if (!existingConfig) {
      upsertPayload.created_by = session.user.id;
    }

    const { data: saved, error: upsertError } = await supabase
      .from("dev_player_configs")
      .upsert(upsertPayload, { onConflict: "user_id" })
      .select("*")
      .single();

    if (upsertError) {
      console.error("dev-panel dev player upsert error:", upsertError);
      return NextResponse.json(
        { ok: false, error: "database_error", message: upsertError.message },
        { status: 500 }
      );
    }

    await logAdminAction(
      supabase,
      session.user.id,
      "dev_panel_upsert_dev_player",
      "dev_player_configs",
      userId,
      {
        username: targetUser.username,
        play_windows: playWindows,
        min_room_price: minRoomPrice,
        max_room_price: maxRoomPrice,
        max_ticket_count: maxTicketCount,
      },
      request
    );

    return NextResponse.json({
      ok: true,
      data: {
        devPlayerConfig: {
          userId: saved.user_id,
          isEnabled: saved.is_enabled,
          playWindows: saved.play_windows ?? [],
          minRoomPrice:
            saved.min_room_price === null ? null : Number(saved.min_room_price),
          maxRoomPrice:
            saved.max_room_price === null ? null : Number(saved.max_room_price),
          maxTicketCount: Number(saved.max_ticket_count),
          updatedAt: saved.updated_at,
        },
      },
    });
  } catch (err: any) {
    if (err.message === "UNAUTHORIZED") {
      return NextResponse.json(
        { ok: false, error: "unauthorized", message: "missing or invalid session" },
        { status: 401 }
      );
    }
    if (err.message === "FORBIDDEN" || err.message === "FORBIDDEN_DEV_PANEL") {
      return NextResponse.json(
        { ok: false, error: "forbidden", message: "dev panel access required" },
        { status: 403 }
      );
    }

    console.error("PATCH /api/dev-panel/dev-players/[userId] error:", err);
    return NextResponse.json(
      { ok: false, error: "unexpected_error", message: err?.message || "unexpected error" },
      { status: 500 }
    );
  }
}
