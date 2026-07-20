"use client";

import React, { useEffect, useRef, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { useHeaderVisibility } from "@/lib/contexts/HeaderVisibilityContext";
import LobbyRoomCard from '@/components/LobbyRoomCard';
import toast from 'react-hot-toast';
import styles from './lobby.module.css';
import { supabase } from "@/lib/supabaseClient";
import { useSession } from "@/lib/contexts/SessionContext";
import { traceFetch } from "@/lib/debug/netTrace";
import { isHardExiting } from "@/lib/auth/hardExit";
import { getLobby, isGameEngineEnabled } from "@/lib/gameEngineClient";
import { useAutoStartTour } from "@/lib/hooks/useAutoStartTour";
import { GAME_BROWSER_TOUR_ID } from "@/lib/tour/configs/gameBrowserTour";

interface RoomPriceGroup {
  price: number;
  currency: string;
  roomName?: string | null;
  waitingRooms: number;
  playingRooms: number;
  totalRooms: number;
  players: number;
  waitingPlayers: number;
  playingPlayers: number;
  templateId?: string | null;
  entryRoomId?: string | null;
}

/**
 * صفحه لابی - نمایش روم‌های بازی بر اساس قیمت تیکت
 */
export default function LobbyPage() {
  const router = useRouter();
  const pathname = usePathname();
  const sessionSnap = useSession();
  const { setShowBackButton, setOnBackClick } = useHeaderVisibility();
  const [roomGroups, setRoomGroups] = useState<RoomPriceGroup[]>([]);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  useAutoStartTour(
    GAME_BROWSER_TOUR_ID,
    !loading && !errorMessage && roomGroups.length > 0,
    { preferQueuedIntent: true }
  );

  const hasToken = Boolean(sessionSnap.authReady && sessionSnap.accessToken);
  const visibilityState = typeof document !== "undefined" ? document.visibilityState : "visible";

  // Smart polling refs (Phase 1.2)
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const stableCountRef = useRef(0);
  const lastSnapshotHashRef = useRef<string | null>(null);
  const nextDelayMsRef = useRef<number>(10000);

  const clearTimer = () => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  };

  const computeSnapshotHash = (groups: RoomPriceGroup[]): string => {
    const parts: string[] = [];
    // Keep it deterministic and cheap; include all fields that affect UI.
    for (const g of groups) {
      parts.push(
        [
          g.templateId ?? "",
          String(g.price ?? 0),
          g.currency ?? "",
          g.roomName ?? "",
          String(g.waitingRooms ?? 0),
          String(g.playingRooms ?? 0),
          String(g.totalRooms ?? 0),
          String(g.players ?? 0),
          String(g.waitingPlayers ?? 0),
          String(g.playingPlayers ?? 0),
        ].join("|")
      );
    }
    return parts.join(";");
  };

  // فعال کردن دکمه back در header
  useEffect(() => {
    setShowBackButton(true);
    setOnBackClick(() => () => {
      router.push('/player/home');
    });
    return () => {
      setShowBackButton(false);
      setOnBackClick(null);
    };
  }, [setShowBackButton, setOnBackClick, router]);

  useEffect(() => {
    let stopped = false;

    const schedule = (delayMs: number, reason: string) => {
      if (stopped) return;
      clearTimer();

      // Pause polling while tab is hidden.
      if (typeof document !== "undefined" && document.visibilityState === "hidden") {
        return;
      }

      nextDelayMsRef.current = delayMs;
      timerRef.current = setTimeout(() => {
        void tick(reason, delayMs);
      }, delayMs);
    };

    async function tick(reason: string, delayMs: number) {
      if (stopped || isHardExiting()) return;
      if (typeof document !== "undefined" && document.visibilityState === "hidden") {
        clearTimer();
        return;
      }

      // If no token, do NOT fetch. Keep rescheduling to check again.
      // Important: avoid infinite loading UI while waiting for auth/token.
      if (!sessionSnap.authReady || !sessionSnap.accessToken) {
        traceFetch("LobbyPage:lobby-snapshot", {
          reason: "no-token",
          delayMs,
          visibilityState: typeof document !== "undefined" ? document.visibilityState : "unknown",
          hasToken: false,
        });
        setErrorMessage(null);
        setLoading(false);
        schedule(5000, "no-token");
        return;
      }

      let nextError: string | null = null;
      try {
        traceFetch("LobbyPage:lobby-snapshot", {
          reason,
          delayMs,
          visibilityState: typeof document !== "undefined" ? document.visibilityState : "unknown",
          hasToken: true,
        });

        let json: {
          roomGroups?: { groups?: RoomPriceGroup[] };
          onlineCount?: { onlinePlayers?: number };
        };

        if (isGameEngineEnabled()) {
          json = await getLobby();
        } else {
          console.info("[LEGACY_PATH] LobbyPage → Vercel /api/player/lobby-snapshot");
          const res = await fetch("/api/player/lobby-snapshot", {
            method: "GET",
            headers: { Authorization: `Bearer ${sessionSnap.accessToken}` },
            cache: "no-store",
          });

          if (!res.ok) {
            console.error("fetchRooms: lobby-snapshot failed", res.status);
            nextError = "خطا در دریافت اطلاعات لابی";
            setRoomGroups([]);
            stableCountRef.current = Math.min(stableCountRef.current + 1, 2);
            schedule(stableCountRef.current === 1 ? 30000 : 60000, "error");
            return;
          }

          json = (await res.json()) as typeof json;
        }

        const groups = Array.isArray(json?.roomGroups?.groups) ? (json.roomGroups!.groups as RoomPriceGroup[]) : [];
        const sortedGroups = [...groups].sort((a, b) => a.price - b.price);
        setRoomGroups(sortedGroups);

        // Backoff logic based on snapshot stability
        const hash = computeSnapshotHash(sortedGroups);
        const prev = lastSnapshotHashRef.current;
        const unchanged = Boolean(prev) && prev === hash;
        lastSnapshotHashRef.current = hash;

        if (unchanged) {
          stableCountRef.current += 1;
          const nextDelay = stableCountRef.current === 1 ? 30000 : 60000;
          schedule(nextDelay, "stable");
        } else {
          stableCountRef.current = 0;
          schedule(10000, "changed");
        }
      } catch (error) {
        console.error('Error in fetchRooms:', error);
        setRoomGroups([]);
        nextError = 'خطای غیرمنتظره در بارگذاری لابی';
        stableCountRef.current = Math.min(stableCountRef.current + 1, 2);
        schedule(stableCountRef.current === 1 ? 30000 : 60000, "exception");
      } finally {
        setErrorMessage(nextError);
        setLoading(false);
      }
    }

    // start immediately
    schedule(0, "mount");

    const onVisibilityChange = () => {
      if (stopped) return;
      if (typeof document === "undefined") return;
      if (document.visibilityState === "hidden") {
        clearTimer();
        return;
      }
      // When visible again, run immediately.
      schedule(0, "visible");
    };
    if (typeof document !== "undefined") {
      document.addEventListener("visibilitychange", onVisibilityChange);
    }

    return () => {
      stopped = true;
      clearTimer();
      if (typeof document !== "undefined") {
        document.removeEventListener("visibilitychange", onVisibilityChange);
      }
    };
  }, [pathname, sessionSnap.authReady, sessionSnap.accessToken, sessionSnap.tokenVersion]);

  // Presence ping: update last_seen_at periodically while user is on lobby
  useEffect(() => {
    let stopped = false;
    let interval: any = null;

    async function ping() {
      try {
        const token = sessionSnap.accessToken || null;
        if (!token) return;
        await fetch("/api/me/ping-presence", {
          method: "POST",
          headers: { Authorization: `Bearer ${token}` },
        });
      } catch (e) {
        // silent - we don't want to spam UI
      }
    }

    void ping();
    interval = setInterval(() => {
      if (!stopped) void ping();
    }, 60000);

    return () => {
      stopped = true;
      if (interval) clearInterval(interval);
    };
  }, [sessionSnap.accessToken]);

  // تابع برای کلیک روی روم
  const handleRoomClick = async (
    price: number,
    templateId?: string | null,
    entryRoomId?: string | null
  ) => {
    if (entryRoomId) {
      router.push(`/player/gameroom?roomId=${entryRoomId}`);
      return;
    }

    if (!templateId) {
      console.error("Template ID is required");
      return;
    }

    try {
      // Fallback: اگر روم waiting پیدا نشود، resolver در API مسیر درست را انتخاب می‌کند
      router.push(`/player/gameroom?templateId=${templateId}`);
    } catch (error: any) {
      console.error("Error in handleRoomClick:", error);
      toast.error(error.message || "خطا در ورود به اتاق");
    }
  };

  if (loading) {
    return (
      <div className={styles.lobbyContainer}>
        <div className={styles.loadingContainer}>
          <div className={styles.loadingSpinner}></div>
          <p className={styles.loadingText}>در حال بارگذاری...</p>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.lobbyContainer}>
      {errorMessage && (
        <div className={styles.errorMessage}>
          {errorMessage}
        </div>
      )}

      {/* لیست روم‌ها */}
      <div
        className={styles.roomsList}
        data-tour-id="game-browser-room-list"
      >
        {roomGroups.length === 0 ? (
          <div className={styles.emptyState}>
            <p className={styles.emptyText}>هیچ روم فعالی وجود ندارد</p>
          </div>
        ) : (
          roomGroups.map((group, index) => (
            <LobbyRoomCard
              key={`${group.price}_${group.currency}`}
              listIndex={index}
              price={group.price}
              currency={group.currency}
              roomName={group.roomName}
              waitingRooms={group.waitingRooms}
              playingRooms={group.playingRooms}
              totalRooms={group.totalRooms}
              players={group.players}
              waitingPlayers={group.waitingPlayers}
              playingPlayers={group.playingPlayers}
              templateId={group.templateId}
              entryRoomId={group.entryRoomId}
              variant="minimal" // TODO: از تنظیمات ادمین بگیرید
              onClick={handleRoomClick}
              dataTourId={
                index === 0 ? "game-browser-first-room" : undefined
              }
              statsDataTourId={
                index === 0 ? "game-browser-first-room-stats" : undefined
              }
            />
          ))
        )}
      </div>
    </div>
  );
}

