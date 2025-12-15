import { NextResponse } from "next/server";
import { createServiceClient, getUserFromRequest } from "@/lib/supabaseServer";

export async function GET(request: Request) {
  try {
    const user = await getUserFromRequest(request);
    if (!user) {
      return NextResponse.json(
        { error: "unauthorized", message: "Authentication required." },
        { status: 401 }
      );
    }

    const supabase = createServiceClient();
    const { data, error } = await supabase
      .from("v_lobby_online_players")
      .select("online_players")
      .maybeSingle();

    if (error) {
      console.error("GET /api/player/lobby-online-count db error:", error);
      return NextResponse.json(
        { error: "internal_error", message: "Failed to load online players." },
        { status: 500 }
      );
    }

    const onlinePlayers = Number((data as any)?.online_players ?? 0) || 0;
    return NextResponse.json({ onlinePlayers });
  } catch (err: any) {
    console.error("GET /api/player/lobby-online-count error:", err);
    return NextResponse.json(
      { error: "internal_error", message: err?.message || "Failed to load online players." },
      { status: 500 }
    );
  }
}


