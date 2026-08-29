import { cookies } from "next/headers";
import { notFound } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
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
  getWatchInviteBanner,
  resolveSignupReferralCodeForUser,
} from "@/lib/watch-invite/repository";
import WatchTournamentClient from "./WatchTournamentClient";

export const dynamic = "force-dynamic";

type WatchPageProps = {
  params: {
    watchCode: string;
    inviteToken: string;
  };
};

export default async function WatchTournamentPage({ params }: WatchPageProps) {
  const watchCode = Number(params.watchCode);
  const inviteToken = decodeURIComponent(params.inviteToken || "")
    .trim()
    .toUpperCase();

  if (!Number.isFinite(watchCode) || watchCode <= 0 || !inviteToken) {
    notFound();
  }

  const [tournament, tokenRow] = await Promise.all([
    getTournamentByWatchCode(watchCode),
    getInviteTokenRow(inviteToken),
  ]);

  if (!tournament || !tokenRow) {
    notFound();
  }

  const referralCode = await resolveSignupReferralCodeForUser(tokenRow.user_id);
  if (!referralCode) {
    notFound();
  }

  const supabase = createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    const payload = buildGuestCookiePayload(watchCode, inviteToken);
    cookies().set(
      getWatchGuestCookieName(),
      serializeWatchGuestCookie(payload),
      getWatchGuestCookieOptions()
    );
    console.log("[WatchInvite] Guest session cookie set", {
      watchCode,
      source: "postgresql",
    });
  }

  const banner = await getWatchInviteBanner();
  const signupPath = buildRegistrationLinkPath(referralCode);

  return (
    <WatchTournamentClient
      tournamentId={tournament.id}
      watchCode={watchCode}
      isGuest={!user}
      signupPath={signupPath}
      banner={banner.isEnabled ? banner : null}
    />
  );
}
