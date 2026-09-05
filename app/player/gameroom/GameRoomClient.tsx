"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import GameRoomScreen from "@/src/screens/GameRoomScreen";
import LiveRoomScreen from "@/src/screens/LiveRoomScreen";
import { useHeaderVisibility } from "@/lib/contexts/HeaderVisibilityContext";
import { useTour } from "@/lib/contexts/TourContext";
import { rememberGameRoomPath } from "@/lib/tour/lastGameRoomPath";
import { GAME_ROOM_TOUR_ID } from "@/lib/tour/configs/gameRoomTour";
import { fetchAutoBuySnapshot } from "@/lib/autoBuy/client";
import { fetchGameRoomView, resolveTournamentIdForRoom } from "@/services/rooms";
import { isHardExiting } from "@/lib/auth/hardExit";
import {
  ACTIVE_GAME_ENTER_LIVE_PARAM,
  MY_ACTIVE_GAME_CHIP_EVENT,
  type MyActiveGameChipDetail,
  isLiveActiveGameStatus,
} from "@/lib/activeGames/myActiveGameNavigation";
import { useActiveGamesContext } from "@/lib/contexts/ActiveGamesContext";

function playerTournamentHref(tournamentId: string): string {
  const id = encodeURIComponent(tournamentId);
  return `/player/tournaments/${id}?tournamentId=${id}&templateId=${id}`;
}

export default function GameRoomClient() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const { setShowBackButton, setOnBackClick } = useHeaderVisibility();
  const roomId = searchParams.get("roomId") ?? undefined;
  const templateId = searchParams.get("templateId") ?? undefined;
  const spectate = searchParams.get("spectate") === "1";
  const queryTournamentId = searchParams.get("tournamentId");
  const priceHintRaw = searchParams.get("price");
  const priceHint =
    priceHintRaw != null && priceHintRaw !== ""
      ? Number(priceHintRaw)
      : undefined;
  const roomNameHint = searchParams.get("roomName") ?? undefined;
  const enterLiveFromChip =
    searchParams.get(ACTIVE_GAME_ENTER_LIVE_PARAM) === "1";
  const { rooms: activeRooms } = useActiveGamesContext();
  const [liveRoomId, setLiveRoomId] = useState<string | null>(null);
  const [resolvedTournamentId, setResolvedTournamentId] = useState<string | null>(
    null
  );
  const liveRoomIdRef = useRef<string | null>(null);
  const { activeTourId } = useTour();
  const pendingLiveRoomIdRef = useRef<string | null>(null);

  useEffect(() => {
    liveRoomIdRef.current = liveRoomId;
  }, [liveRoomId]);

  useEffect(() => {
    setResolvedTournamentId(queryTournamentId);
  }, [queryTournamentId, roomId]);

  const handleResolvedTournamentId = useCallback((tournamentId: string | null) => {
    setResolvedTournamentId((prev) => tournamentId ?? prev ?? queryTournamentId);
  }, [queryTournamentId]);

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

  useEffect(() => {
    if (!roomId) return;
    let cancelled = false;
    void resolveTournamentIdForRoom(roomId).then((tournamentId) => {
      if (cancelled || !tournamentId) return;
      handleResolvedTournamentId(tournamentId);
    });
    return () => {
      cancelled = true;
    };
  }, [roomId, handleResolvedTournamentId]);

  // Tournament tables always return to that tournament page (player or watch).
  // Normal rooms still return to the lobby.
  useEffect(() => {
    setShowBackButton(true);
    setOnBackClick(() => () => {
      setLiveRoomId(null);
      pendingLiveRoomIdRef.current = null;
      const knownId = (resolvedTournamentId || queryTournamentId)?.trim() || null;
      const go = (tournamentId: string | null) => {
        if (tournamentId) {
          console.info("[Room] Back to tournament", {
            tournamentId,
            roomId,
            spectate,
          });
          router.push(playerTournamentHref(tournamentId));
          return;
        }
        console.info("[Room] Back to lobby", { roomId, spectate });
        router.push("/player/lobby");
      };
      if (knownId || !roomId) {
        go(knownId);
        return;
      }
      void resolveTournamentIdForRoom(roomId).then(go);
    });
    return () => {
      setShowBackButton(false);
      setOnBackClick(null);
    };
  }, [
    router,
    setShowBackButton,
    setOnBackClick,
    spectate,
    resolvedTournamentId,
    queryTournamentId,
    roomId,
  ]);

  // قفل اسکرول بدنه فقط برای صفحه خرید/انتظار؛ لایو روم اسکرول تمام‌صفحه دارد
  useEffect(() => {
    const isLive = Boolean(roomId && liveRoomId === roomId);
    if (isLive) return;

    const originalOverflow = document.body.style.overflow;
    const originalOverflowY = document.body.style.overflowY;

    document.body.style.overflow = "hidden";
    document.body.style.overflowY = "hidden";

    return () => {
      document.body.style.overflow = originalOverflow;
      document.body.style.overflowY = originalOverflowY;
    };
  }, [roomId, liveRoomId]);

  useEffect(() => {
    if (!roomId || !enterLiveFromChip) return;

    console.info("[Room] Enter live from active-game chip query", { roomId });
    handleEnterLive(roomId);

    const cleanUrl = `/player/gameroom?roomId=${encodeURIComponent(roomId)}`;
    router.replace(cleanUrl, { scroll: false });
  }, [roomId, enterLiveFromChip, handleEnterLive, router]);

  // When the room transitions to live, leave the buy/waiting screen automatically.
  useEffect(() => {
    if (!roomId || liveRoomId === roomId) return;

    const activeRoom = activeRooms.find((room) => room.roomId === roomId);
    if (!activeRoom || !isLiveActiveGameStatus(activeRoom.status)) return;

    console.info("[Room] Auto enter live from active-games status", {
      roomId,
      status: activeRoom.status,
    });
    handleEnterLive(roomId);
  }, [roomId, activeRooms, liveRoomId, handleEnterLive]);

  useEffect(() => {
    if (!roomId) return;

    const onActiveGameChip = (event: Event) => {
      const detail = (event as CustomEvent<MyActiveGameChipDetail>).detail;
      if (!detail || detail.roomId !== roomId) return;
      if (!isLiveActiveGameStatus(detail.status)) return;

      pendingLiveRoomIdRef.current = null;
      console.info("[Room] Enter live from active-game chip", { roomId });
      setLiveRoomId(roomId);
    };

    window.addEventListener(MY_ACTIVE_GAME_CHIP_EVENT, onActiveGameChip);
    return () => {
      window.removeEventListener(MY_ACTIVE_GAME_CHIP_EVENT, onActiveGameChip);
    };
  }, [roomId]);

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
    return null;
  }

  if (roomId && liveRoomId === roomId) {
    return (
      <LiveRoomScreen
        roomId={roomId}
        onResolvedTournamentId={handleResolvedTournamentId}
      />
    );
  }

  return (
    <GameRoomScreen
      roomId={roomId}
      templateId={templateId}
      priceHint={
        priceHint != null && Number.isFinite(priceHint) && priceHint > 0
          ? priceHint
          : undefined
      }
      roomNameHint={roomNameHint}
      spectate={spectate}
      onEnterLive={handleEnterLive}
    />
  );
}
