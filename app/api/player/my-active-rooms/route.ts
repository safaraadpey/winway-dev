import { NextResponse } from "next/server";
import { createServiceClient, getUserFromRequest } from "@/lib/supabaseServer";
import { createHash } from "crypto";

// This route uses Node.js APIs (e.g. Buffer for ETag). Force Node runtime to avoid Edge limitations.
export const runtime = "nodejs";

type ActiveRoom = {
  roomId: string;
  roomCode: string | null;
  status: "waiting" | "playing" | "live" | "settling";
  cardPrice: number;
  currency: string;
  cardCount: number;
  prize: number; // تخمین جایزه: cardPrice * cardCount
};

function parseIfNoneMatch(header: string | null): string[] {
  if (!header) return [];

  // Can be a comma-separated list, may include weak validators: W/"..."
  return header
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .map((tag) => {
      let t = tag;
      if (t.startsWith("W/")) t = t.slice(2).trim();
      if (t.startsWith('"') && t.endsWith('"') && t.length >= 2) {
        t = t.slice(1, -1);
      }
      return t;
    });
}

export async function GET(request: Request) {
  try {
    const user = await getUserFromRequest(request);
    if (!user) {
      return NextResponse.json(
        { error: "unauthorized", message: "Authentication required." },
        { status: 401 }
      );
    }

    // Check ETag from request
    const ifNoneMatch = request.headers.get("If-None-Match");

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

    const activeRooms: ActiveRoom[] = (rooms ?? []).map((room: any) => ({
      roomId: room.room_id,
      roomCode: room.room_code,
      status: room.status as "waiting" | "playing" | "live" | "settling",
      cardPrice: Number(room.card_price || 0),
      currency: room.currency || "IRR",
      cardCount: Number(room.card_count || 0),
      prize: Number(room.prize || 0),
    }));

    // Sort: live/playing اول، سپس waiting، سپس settling
    const statusOrder = { live: 0, playing: 1, waiting: 2, settling: 3 };
    activeRooms.sort((a, b) => statusOrder[a.status] - statusOrder[b.status]);

    // ETag برای polling optimization
    // Use a stable, low-collision strong validator (sha256 over response payload).
    const payload = JSON.stringify(activeRooms);
    const etagValue = createHash("sha256").update(payload).digest("hex").slice(0, 32);
    const etagHeader = `"${etagValue}"`;

    // اگر ETag match کند، 304 Not Modified برگردان
    const candidates = parseIfNoneMatch(ifNoneMatch);
    if (candidates.includes(etagValue) || candidates.includes(etagHeader)) {
      const notModified = new NextResponse(null, { status: 304 });
      notModified.headers.set("ETag", etagHeader);
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

