"use client";

import React, { useEffect } from "react";
import TournamentRoomScreen from "@/src/screens/TournamentRoomScreen";
import type { WatchInviteBanner } from "@/lib/watch-invite/types";

type WatchTournamentClientProps = {
  watchCode: number;
  inviteToken: string;
  signupPath: string;
  banner: WatchInviteBanner | null;
};

export default function WatchTournamentClient({
  watchCode,
  inviteToken,
  signupPath,
  banner,
}: WatchTournamentClientProps) {
  useEffect(() => {
    const search = new URLSearchParams({
      watchCode: String(watchCode),
      inviteToken,
      setGuest: "1",
    });
    void fetch(`/api/watch/resolve?${search.toString()}`, {
      method: "GET",
      cache: "no-store",
    }).catch(() => {
      // best-effort — page still renders if cookie set fails
    });
  }, [inviteToken, watchCode]);

  // Watch links are always spectator context: signup CTA from inviter's agent code.
  return (
    <TournamentRoomScreen
      mode="guest"
      watchCode={watchCode}
      guestSignupPath={signupPath}
      watchBanner={banner}
    />
  );
}
