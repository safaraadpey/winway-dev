import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { buildRegistrationLinkPath } from "@/lib/referral/buildRegistrationLink";
import {
  buildGuestCookiePayload,
  getWatchGuestCookieName,
  getWatchGuestCookieOptions,
  serializeWatchGuestCookie,
} from "@/lib/watch-invite/guestCookie";
import {
  getInviteTokenRow,
  getTournamentByWatchCode,
  resolveSignupReferralCodeForUser,
} from "@/lib/watch-invite/repository";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const url = new URL(request.url);
    const watchCode = Number(url.searchParams.get("watchCode"));
    const inviteToken = (url.searchParams.get("inviteToken") || "").trim().toUpperCase();

    if (!Number.isFinite(watchCode) || watchCode <= 0 || !inviteToken) {
      return NextResponse.json(
        { error: "invalid_parameters", message: "watchCode and inviteToken are required." },
        { status: 400 }
      );
    }

    const [tournament, tokenRow] = await Promise.all([
      getTournamentByWatchCode(watchCode),
      getInviteTokenRow(inviteToken),
    ]);

    if (!tournament || !tokenRow) {
      return NextResponse.json(
        { error: "not_found", message: "Invalid watch invite link." },
        { status: 404 }
      );
    }

    const referralCode = await resolveSignupReferralCodeForUser(tokenRow.user_id);
    if (!referralCode) {
      return NextResponse.json(
        {
          error: "referral_unavailable",
          message: "Signup referral is not available for this invite.",
        },
        { status: 409 }
      );
    }

    const signupPath = buildRegistrationLinkPath(referralCode);
    const setGuest = url.searchParams.get("setGuest") === "1";

    if (setGuest) {
      const payload = buildGuestCookiePayload(watchCode, inviteToken);
      cookies().set(
        getWatchGuestCookieName(),
        serializeWatchGuestCookie(payload),
        getWatchGuestCookieOptions()
      );
    }

    return NextResponse.json(
      {
        ok: true,
        watchCode,
        inviteToken,
        tournamentId: tournament.id,
        tournamentTitle: tournament.title,
        referralCode,
        signupPath,
      },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (err) {
    console.error("[WatchInvite] GET /api/watch/resolve error:", err);
    return NextResponse.json(
      { error: "internal_error", message: "Failed to resolve watch invite." },
      { status: 500 }
    );
  }
}
