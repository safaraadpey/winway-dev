import { NextResponse } from "next/server";
import { createServiceClient, getUserFromRequest } from "@/lib/supabaseServer";
import {
  computeActiveRoomsEtag,
  ifNoneMatchHits,
  mapRpcToActiveRooms,
  parseIfNoneMatch,
  type ActiveRoomRow,
} from "@/lib/activeGames/myActiveRoomsApi";
import {
  getCachedActiveRooms,
  setCachedActiveRooms,
} from "@/lib/activeGames/myActiveRoomsCache";

// This route uses Node.js APIs (e.g. Buffer for ETag). Force Node runtime to avoid Edge limitations.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const user = await getUserFromRequest(request);
    if (!user) {
      return NextResponse.json(
        { error: "unauthorized", message: "Authentication required." },
        { status: 401 }
      );
    }

    const ifNoneMatch = request.headers.get("If-None-Match");
    const candidates = parseIfNoneMatch(ifNoneMatch);

    // Fast path: client ETag matches fresh in-memory cache → 304 without DB.
    const cached = getCachedActiveRooms(user.id);
    if (cached && candidates.length > 0 && ifNoneMatchHits(candidates, cached.etag)) {
      const notModified = new NextResponse(null, { status: 304 });
      notModified.headers.set("ETag", `"${cached.etag}"`);
      notModified.headers.set("X-Active-Rooms-Cache", "hit");
      return notModified;
    }

    const supabase = createServiceClient();

    const { data: rooms, error: roomsError } = await supabase.rpc("fn_my_active_rooms", {
      p_user_id: user.id,
    });

    if (roomsError) {
      console.error("GET /api/player/my-active-rooms rpc error:", roomsError);
      return NextResponse.json(
        { error: "internal_error", message: "Failed to load active rooms." },
        { status: 500 }
      );
    }

    const activeRooms = mapRpcToActiveRooms((rooms ?? []) as ActiveRoomRow[]);
    const etagValue = computeActiveRoomsEtag(activeRooms);
    const etagHeader = `"${etagValue}"`;

    setCachedActiveRooms(user.id, etagValue, activeRooms);

    if (candidates.length > 0 && ifNoneMatchHits(candidates, etagValue)) {
      const notModified = new NextResponse(null, { status: 304 });
      notModified.headers.set("ETag", etagHeader);
      notModified.headers.set("X-Active-Rooms-Cache", "revalidated");
      return notModified;
    }

    const response = NextResponse.json({ rooms: activeRooms });
    response.headers.set("ETag", etagHeader);
    return response;
  } catch (err: any) {
    console.error("GET /api/player/my-active-rooms error:", err);
    return NextResponse.json(
      { error: "internal_error", message: err?.message || "Failed to load active rooms." },
      { status: 500 }
    );
  }
}
