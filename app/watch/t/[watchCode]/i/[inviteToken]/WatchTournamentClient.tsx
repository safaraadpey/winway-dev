"use client";

import React, { useEffect } from "react";
import TournamentRoomScreen from "@/src/screens/TournamentRoomScreen";

type WatchTournamentClientProps = {
  watchCode: number;
  inviteToken: string;
  signupPath: string;
};

export default function WatchTournamentClient({
  watchCode,
  inviteToken,
  signupPath,
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
      inviteToken={inviteToken}
      guestSignupPath={signupPath}
    />
  );
}
