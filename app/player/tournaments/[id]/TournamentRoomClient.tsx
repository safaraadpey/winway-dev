"use client";

import React, { useEffect } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import TournamentRoomScreen from "@/src/screens/TournamentRoomScreen";

export default function TournamentRoomClient() {
  const params = useParams();
  const searchParams = useSearchParams();
  const router = useRouter();

  const tournamentId = Array.isArray(params?.id)
    ? params?.id?.[0]
    : (params?.id as string | undefined);

  const roomId = searchParams.get("roomId") ?? undefined;
  const templateIdParam = searchParams.get("templateId") ?? undefined;
  const templateId = templateIdParam ?? tournamentId ?? undefined;

  // If route param is missing, go back to tournaments list
  useEffect(() => {
    if (!tournamentId) {
      router.push("/player/tournaments");
    }
  }, [router, tournamentId]);

  if (!tournamentId) {
    return (
      <div className="min-h-screen bg-black/40 text-white flex items-center justify-center">
        <div className="text-center space-y-2">
          <div className="animate-pulse rounded-xl border border-white/10 bg-white/5 px-4 py-3">
            در حال بارگذاری تورنومنت...
          </div>
        </div>
      </div>
    );
  }

  return (
    <TournamentRoomScreen
      tournamentId={tournamentId}
      roomId={roomId}
      templateId={templateId}
    />
  );
}


