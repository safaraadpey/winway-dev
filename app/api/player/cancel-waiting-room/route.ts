import { NextResponse } from "next/server";
import { createServiceClient, getUserFromRequest } from "@/lib/supabaseServer";

export async function POST(request: Request) {
  try {
    const user = await getUserFromRequest(request);

    if (!user) {
      return NextResponse.json(
        { error: "unauthorized", message: "Authentication required." },
        { status: 401 }
      );
    }

    let body: { roomId?: string } = {};
    try {
      body = await request.json();
    } catch {
      // ignore, handled below
    }

    if (!body.roomId) {
      return NextResponse.json(
        { error: "missing_parameters", message: "roomId is required." },
        { status: 400 }
      );
    }

    const supabase = createServiceClient();

    const { data, error } = await supabase.rpc("fn_cancel_waiting_room", {
      p_room: body.roomId,
      p_by_admin: false,
      p_user: user.id,
    });

    if (error) {
      console.error("fn_cancel_waiting_room error:", error);
      return NextResponse.json(
        {
          error: "cancel_failed",
          message: error.message || "Failed to cancel waiting room.",
        },
        { status: 400 }
      );
    }

    return NextResponse.json({
      cancelled_rooms: typeof data === "number" ? data : 0,
    });
  } catch (err: any) {
    console.error("POST /api/player/cancel-waiting-room error:", err);
    return NextResponse.json(
      { error: "internal_error", message: "Failed to cancel waiting room." },
      { status: 500 }
    );
  }
}

