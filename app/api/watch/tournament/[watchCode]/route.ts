import { NextRequest, NextResponse } from "next/server";
import { loadWatchTournamentSnapshot } from "@/lib/watch-invite/repository";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  _request: NextRequest,
  context: { params: { watchCode: string } }
) {
  try {
    const watchCode = Number(context.params.watchCode);
    if (!Number.isFinite(watchCode) || watchCode <= 0) {
      return NextResponse.json(
        { error: "invalid_watch_code", message: "Invalid watch code." },
        { status: 400 }
      );
    }

    const snapshot = await loadWatchTournamentSnapshot(watchCode);
    if (!snapshot) {
      return NextResponse.json(
        { error: "not_found", message: "Tournament not found." },
        { status: 404 }
      );
    }

    return NextResponse.json(snapshot, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (err) {
    console.error("[WatchInvite] GET /api/watch/tournament error:", err);
    return NextResponse.json(
      { error: "internal_error", message: "Failed to load tournament snapshot." },
      { status: 500 }
    );
  }
}
