import { NextRequest, NextResponse } from "next/server";
import { getUserFromRequest } from "@/lib/supabaseServer";
import { buildWatchInviteUrl } from "@/lib/watch-invite/buildWatchLink";
import {
  getOrCreateInviteTokenForUser,
  getTournamentByWatchCode,
  resolveSignupReferralCodeForUser,
} from "@/lib/watch-invite/repository";
import { pgPool } from "@/lib/pg";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  try {
    const user = await getUserFromRequest(request);
    if (!user) {
      return NextResponse.json(
        { error: "unauthorized", message: "Authentication required." },
        { status: 401 }
      );
    }

    if (!pgPool) {
      return NextResponse.json(
        { error: "database_error", message: "Database unavailable." },
        { status: 500 }
      );
    }

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      body = {};
    }

    const tournamentId =
      body &&
      typeof body === "object" &&
      "tournamentId" in body &&
      typeof (body as { tournamentId?: unknown }).tournamentId === "string"
        ? (body as { tournamentId: string }).tournamentId
        : null;

    if (!tournamentId) {
      return NextResponse.json(
        { error: "invalid_payload", message: "tournamentId is required." },
        { status: 400 }
      );
    }

    const { rows } = await pgPool.query<{ watch_code: number; title: string }>(
      `SELECT watch_code, title FROM public.tournaments WHERE id = $1 LIMIT 1`,
      [tournamentId]
    );
    const tournament = rows[0];
    if (!tournament?.watch_code) {
      return NextResponse.json(
        { error: "tournament_not_found", message: "Tournament not found." },
        { status: 404 }
      );
    }

    const referralCode = await resolveSignupReferralCodeForUser(user.id);
    if (!referralCode) {
      return NextResponse.json(
        {
          error: "referral_unavailable",
          message: "کد معرف برای اشتراک‌گذاری در دسترس نیست.",
        },
        { status: 409 }
      );
    }

    const inviteToken = await getOrCreateInviteTokenForUser(user.id);
    const shareUrl = buildWatchInviteUrl(tournament.watch_code, inviteToken);

    console.log("[WatchInvite] share link created", {
      userId: user.id,
      tournamentId,
      watchCode: tournament.watch_code,
      source: "postgresql",
    });

    return NextResponse.json(
      {
        shareUrl,
        watchCode: tournament.watch_code,
        inviteToken,
        tournamentTitle: tournament.title,
      },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (err) {
    console.error("[WatchInvite] POST /api/player/watch-invite error:", err);
    const message = err instanceof Error ? err.message : "Failed to create share link.";
    return NextResponse.json({ error: "internal_error", message }, { status: 500 });
  }
}
