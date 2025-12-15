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

    // دریافت tickets فعال پلیر
    const { data: tickets, error: ticketsError } = await supabase
      .from("tickets")
      .select("room_id, reservation_status")
      .eq("player_user_id", user.id)
      // Include reserved tickets so waiting rooms also show up.
      .in("reservation_status", ["reserved", "confirmed", "consumed"]);

    if (ticketsError) {
      console.error("GET /api/player/my-active-rooms tickets error:", ticketsError);
      return NextResponse.json(
        { error: "internal_error", message: "Failed to load tickets." },
        { status: 500 }
      );
    }

    const activeRooms: ActiveRoom[] = [];

    if (tickets && tickets.length > 0) {
      // استخراج room_id های منحصر به فرد
      const roomIds = [...new Set(tickets.map((t) => t.room_id))];

      // دریافت اطلاعات روم‌ها
      const { data: rooms, error: roomsError } = await supabase
        .from("rooms")
        .select("id, room_code, status, card_price, currency")
        .in("id", roomIds)
        .in("status", ["waiting", "playing", "live", "settling"]);

      if (roomsError) {
        console.error("GET /api/player/my-active-rooms rooms error:", roomsError);
        return NextResponse.json(
          { error: "internal_error", message: "Failed to load rooms." },
          { status: 500 }
        );
      }

      if (rooms && rooms.length > 0) {
        // شمارش کارت‌های پلیر در هر روم
        const roomCardCounts = new Map<string, number>();
        tickets.forEach((ticket) => {
          const count = roomCardCounts.get(ticket.room_id) || 0;
          roomCardCounts.set(ticket.room_id, count + 1);
        });

        for (const room of rooms as any[]) {
          const cardCount = roomCardCounts.get(room.id) || 0;
          const cardPrice = Number(room.card_price || 0);
          const prize = cardPrice * cardCount;

          activeRooms.push({
            roomId: room.id,
            roomCode: room.room_code,
            status: room.status as "waiting" | "playing" | "live" | "settling",
            cardPrice,
            currency: room.currency || "IRR",
            cardCount,
            prize,
          });
        }
      }
    }

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

