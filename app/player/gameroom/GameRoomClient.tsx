"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import PageLoading from "@/components/PageLoading";
import GameRoomScreen from "@/src/screens/GameRoomScreen";
import LiveRoomScreen from "@/src/screens/LiveRoomScreen";
import { useHeaderVisibility } from "@/lib/contexts/HeaderVisibilityContext";
import { useTour } from "@/lib/contexts/TourContext";
import { rememberGameRoomPath } from "@/lib/tour/lastGameRoomPath";
import { GAME_ROOM_TOUR_ID } from "@/lib/tour/configs/gameRoomTour";
import { fetchAutoBuySnapshot } from "@/lib/autoBuy/client";
import { fetchGameRoomView } from "@/services/rooms";
import { isHardExiting } from "@/lib/auth/hardExit";

export default function GameRoomClient() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const { setShowBackButton, setOnBackClick } = useHeaderVisibility();
  const roomId = searchParams.get("roomId") ?? undefined;
  const templateId = searchParams.get("templateId") ?? undefined;
  const [liveRoomId, setLiveRoomId] = useState<string | null>(null);
  const liveRoomIdRef = useRef<string | null>(null);
  const { activeTourId } = useTour();
  const pendingLiveRoomIdRef = useRef<string | null>(null);

  useEffect(() => {
    liveRoomIdRef.current = liveRoomId;
  }, [liveRoomId]);

  const handleEnterLive = useCallback(
    (nextRoomId: string) => {
      if (activeTourId === GAME_ROOM_TOUR_ID) {
        pendingLiveRoomIdRef.current = nextRoomId;
        console.info("[Tour][GameRoom] Deferred live enter during tour", {
          roomId: nextRoomId,
        });
        return;
      }
      setLiveRoomId(nextRoomId);
    },
    [activeTourId]
  );

  useEffect(() => {
    if (activeTourId === GAME_ROOM_TOUR_ID) return;
    const pending = pendingLiveRoomIdRef.current;
    if (!pending) return;
    pendingLiveRoomIdRef.current = null;
    console.info("[Tour][GameRoom] Applying deferred live enter", {
      roomId: pending,
    });
    setLiveRoomId(pending);
  }, [activeTourId]);

  // roomId in URL changed → leave live view for the new lobby session
  useEffect(() => {
    if (!roomId) {
      setLiveRoomId(null);
      pendingLiveRoomIdRef.current = null;
      return;
    }
    setLiveRoomId((current) =>
      current && current !== roomId ? null : current
    );
    pendingLiveRoomIdRef.current = null;
  }, [roomId]);

  useEffect(() => {
    if (!roomId && !templateId) return;
    rememberGameRoomPath(
      `${window.location.pathname}${window.location.search}`
    );
  }, [roomId, templateId]);

  // Back always returns to lobby (lobby or live phase, any entry path).
  useEffect(() => {
    setShowBackButton(true);
    setOnBackClick(() => () => {
      setLiveRoomId(null);
      pendingLiveRoomIdRef.current = null;
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

  useEffect(() => {
    if (!roomId || typeof document === "undefined") return;

    const syncLiveAfterForeground = async () => {
      if (isHardExiting()) return;
      if (document.visibilityState !== "visible") return;
      if (liveRoomIdRef.current !== roomId) return;

      try {
        const view = await fetchGameRoomView({ roomId });
        const templateIdForRoom = view.room.template_id;
        if (!templateIdForRoom) return;

        const snapshot = await fetchAutoBuySnapshot(templateIdForRoom);
        if (!snapshot.active || !snapshot.lastRoomId) return;
        if (snapshot.lastRoomId === roomId) return;

        setLiveRoomId(null);
        router.replace(`/player/gameroom?roomId=${snapshot.lastRoomId}`);
      } catch (err) {
        console.warn("[Room] live foreground auto-buy sync failed", err);
      }
    };

    const onVisible = () => {
      if (document.visibilityState === "visible") {
        void syncLiveAfterForeground();
      }
    };

    const onPageShow = (event: PageTransitionEvent) => {
      if (event.persisted) {
        void syncLiveAfterForeground();
      }
    };

    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("pageshow", onPageShow);
    window.addEventListener("focus", onVisible);

    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("pageshow", onPageShow);
      window.removeEventListener("focus", onVisible);
    };
  }, [roomId, router]);

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
