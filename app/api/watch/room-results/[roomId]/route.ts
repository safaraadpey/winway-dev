import { NextRequest, NextResponse } from "next/server";
import { loadWatchRoomResults } from "@/lib/watch-invite/loadWatchRoomResults";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  request: NextRequest,
  context: { params: { roomId: string } }
) {
  try {
    const watchCodeRaw = request.nextUrl.searchParams.get("watchCode");
    const watchCode = Number(watchCodeRaw);
    const roomId = context.params.roomId;

    if (!roomId || !Number.isFinite(watchCode) || watchCode <= 0) {
      return NextResponse.json(
        { error: "invalid_parameters", message: "watchCode and roomId are required." },
        { status: 400 }
      );
    }

    const results = await loadWatchRoomResults(watchCode, roomId);
    if (!results) {
      return NextResponse.json(
        { error: "not_found", message: "Room results not available." },
        { status: 404 }
      );
    }

    return NextResponse.json(results, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (err) {
    console.error("[WatchInvite] GET /api/watch/room-results error:", err);
    return NextResponse.json(
      { error: "internal_error", message: "Failed to load room results." },
      { status: 500 }
    );
  }
}
