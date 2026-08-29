import { NextRequest, NextResponse } from "next/server";
import {
  getWatchInviteBanner,
  getWatchInviteBannerForTournamentId,
  getWatchInviteBannerForWatchCode,
} from "@/lib/watch-invite/repository";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const watchCodeRaw = request.nextUrl.searchParams.get("watchCode");
    const tournamentId = request.nextUrl.searchParams.get("tournamentId");

    let banner = await getWatchInviteBanner();

    if (watchCodeRaw) {
      const watchCode = Number(watchCodeRaw);
      if (Number.isFinite(watchCode) && watchCode > 0) {
        banner = await getWatchInviteBannerForWatchCode(watchCode);
      }
    } else if (tournamentId) {
      banner = await getWatchInviteBannerForTournamentId(tournamentId);
    }

    if (!banner.isEnabled) {
      return NextResponse.json(
        { banner: null },
        { headers: { "Cache-Control": "no-store" } }
      );
    }
    return NextResponse.json(
      { banner },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (err) {
    console.error("[WatchInvite] GET /api/watch/banner error:", err);
    return NextResponse.json(
      { error: "internal_error", message: "Failed to load banner." },
      { status: 500 }
    );
  }
}
