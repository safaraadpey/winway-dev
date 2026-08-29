import { NextResponse } from "next/server";
import { loadLiveRoomSnapshotForRoom } from "@/lib/liveRoom/loadLiveRoomSnapshotCore";
import { createServiceClient, getUserFromRequest } from "@/lib/supabaseServer";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const roomId = url.searchParams.get("roomId");
    const scope = url.searchParams.get("scope");
    const drawsOnly = scope === "draws";

    if (!roomId) {
      return NextResponse.json(
        { error: "missing_parameters", message: "roomId is required." },
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

    const snapshot = await loadLiveRoomSnapshotForRoom(roomId, {
      scope: drawsOnly ? "draws" : "full",
      currentUserId: user.id,
      anonymizePlayerNames: false,
    });

    return NextResponse.json(snapshot);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message === "room_not_found") {
      return NextResponse.json(
        { error: "room_not_found", message: "Room not found." },
        { status: 404 }
      );
    }
    console.error("GET /api/player/live-room error:", error);
    return NextResponse.json(
      { error: "internal_error", message: "Failed to load live room state." },
      { status: 500 }
    );
  }
}
