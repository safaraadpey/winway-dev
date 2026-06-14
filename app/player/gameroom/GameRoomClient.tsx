"use client";

import React, { useCallback, useEffect, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import PageLoading from "@/components/PageLoading";
import GameRoomScreen from "@/src/screens/GameRoomScreen";
import LiveRoomScreen from "@/src/screens/LiveRoomScreen";
import { useHeaderVisibility } from "@/lib/contexts/HeaderVisibilityContext";

export default function GameRoomClient() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const { setShowBackButton, setOnBackClick } = useHeaderVisibility();
  const roomId = searchParams.get("roomId") ?? undefined;
  const templateId = searchParams.get("templateId") ?? undefined;
  const [liveRoomId, setLiveRoomId] = useState<string | null>(null);

  const handleEnterLive = useCallback((nextRoomId: string) => {
    setLiveRoomId(nextRoomId);
  }, []);

  // roomId in URL changed → leave live view for the new lobby session
  useEffect(() => {
    setLiveRoomId((current) =>
      current && roomId && current !== roomId ? null : current
    );
  }, [roomId]);

  // Back always returns to lobby (lobby or live phase, any entry path).
  useEffect(() => {
    setShowBackButton(true);
    setOnBackClick(() => () => {
      setLiveRoomId(null);
      router.push("/player/lobby");
    });
    return () => {
      setShowBackButton(false);
      setOnBackClick(null);
    };
  }, [router, setShowBackButton, setOnBackClick]);

  // غیرفعال کردن اسکرول عمودی برای این صفحه
  useEffect(() => {
    const originalOverflow = document.body.style.overflow;
    const originalOverflowY = document.body.style.overflowY;

    document.body.style.overflow = "hidden";
    document.body.style.overflowY = "hidden";

    return () => {
      document.body.style.overflow = originalOverflow;
      document.body.style.overflowY = originalOverflowY;
    };
  }, []);

  useEffect(() => {
    if (!roomId && !templateId) {
      router.push("/player/lobby");
    }
  }, [roomId, templateId, router]);

  if (!roomId && !templateId) {
    return <PageLoading />;
  }

  if (roomId && liveRoomId === roomId) {
    return <LiveRoomScreen roomId={roomId} />;
  }

  return (
    <GameRoomScreen
      roomId={roomId}
      templateId={templateId}
      onEnterLive={handleEnterLive}
    />
  );
}
