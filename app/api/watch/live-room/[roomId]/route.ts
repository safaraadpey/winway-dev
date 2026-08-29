import { NextRequest, NextResponse } from "next/server";
import { loadWatchLiveRoomSnapshot } from "@/lib/watch-invite/loadWatchLiveRoomSnapshot";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  request: NextRequest,
  context: { params: { roomId: string } }
) {
  try {
    const watchCodeRaw = request.nextUrl.searchParams.get("watchCode");
    const scope = request.nextUrl.searchParams.get("scope");
    const watchCode = Number(watchCodeRaw);
    const roomId = context.params.roomId;

    if (!roomId || !Number.isFinite(watchCode) || watchCode <= 0) {
      return NextResponse.json(
        { error: "invalid_parameters", message: "watchCode and roomId are required." },
        { status: 400 }
      );
    }

    const snapshot = await loadWatchLiveRoomSnapshot(watchCode, roomId, {
      scope: scope === "draws" ? "draws" : "full",
    });

    return NextResponse.json(snapshot, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (message === "watch_room_not_allowed" || message === "room_not_found") {
      return NextResponse.json(
        { error: "not_found", message: "Finished room not available for guest watch." },
        { status: 404 }
      );
    }
    console.error("[WatchInvite] GET /api/watch/live-room error:", err);
    return NextResponse.json(
      { error: "internal_error", message: "Failed to load live room snapshot." },
      { status: 500 }
    );
  }
}
