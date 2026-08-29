import { NextRequest, NextResponse } from "next/server";
import { getWatchInviteBanner } from "@/lib/watch-invite/repository";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const banner = await getWatchInviteBanner();
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
