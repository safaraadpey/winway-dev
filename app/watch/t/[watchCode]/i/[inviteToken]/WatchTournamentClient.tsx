"use client";

import React from "react";
import TournamentRoomScreen from "@/src/screens/TournamentRoomScreen";
import type { WatchInviteBanner } from "@/lib/watch-invite/types";

type WatchTournamentClientProps = {
  tournamentId: string;
  watchCode: number;
  isGuest: boolean;
  signupPath: string;
  banner: WatchInviteBanner | null;
};

export default function WatchTournamentClient({
  tournamentId,
  watchCode,
  isGuest,
  signupPath,
  banner,
}: WatchTournamentClientProps) {
  if (isGuest) {
    return (
      <TournamentRoomScreen
        mode="guest"
        watchCode={watchCode}
        guestSignupPath={signupPath}
        watchBanner={banner}
      />
    );
  }

  return (
    <TournamentRoomScreen
      tournamentId={tournamentId}
      mode="player"
      watchCode={watchCode}
    />
  );
}
