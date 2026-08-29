import { notFound } from "next/navigation";
import { buildRegistrationLinkPath } from "@/lib/referral/buildRegistrationLink";
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

  const banner = await getWatchInviteBanner();
  const signupPath = buildRegistrationLinkPath(referralCode);

  return (
    <WatchTournamentClient
      watchCode={watchCode}
      inviteToken={inviteToken}
      signupPath={signupPath}
      banner={banner.isEnabled ? banner : null}
    />
  );
}
