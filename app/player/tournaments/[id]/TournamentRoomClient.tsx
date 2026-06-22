"use client";

import React, { useEffect } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import TournamentRoomScreen from "@/src/screens/TournamentRoomScreen";
import TournamentRoomLoadingFallback from "@/components/TournamentRoomLoadingFallback";

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

  useEffect(() => {
    if (!tournamentId) {
      router.push("/player/tournaments");
    }
  }, [router, tournamentId]);

  if (!tournamentId) {
    return (
      <TournamentRoomLoadingFallback message="در حال بارگذاری تورنومنت..." />
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
