"use client";

import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { useHeaderVisibility } from "@/lib/contexts/HeaderVisibilityContext";
import { useTheme } from "@/lib/contexts/ThemeContext";
import LobbyRoomCard from '@/components/LobbyRoomCard';
import MenuItem from "@/components/theme/MenuItem";
import FeatureGate from "@/components/features/FeatureGate";
import { BACKGAMMON_FEATURE_KEY } from "@/lib/backgammon/constants";
import styles from './lobby.module.css';
import { useSession } from "@/lib/contexts/SessionContext";
import { traceFetch } from "@/lib/debug/netTrace";
import { isHardExiting } from "@/lib/auth/hardExit";
import { getLobby, isGameEngineEnabled } from "@/lib/gameEngineClient";
import { fetchAutoBuyLobbySnapshots } from "@/lib/autoBuy/client";
import type { AutoBuySnapshot } from "@/lib/autoBuy/types";
import { formatAutoBuyFundDisplay } from "@/lib/autoBuy/formatFundDisplay";
import { useAutoStartTour } from "@/lib/hooks/useAutoStartTour";
import { GAME_BROWSER_TOUR_ID } from "@/lib/tour/configs/gameBrowserTour";
import {
  getStaticLobbyShell,
  lobbyRoomGroupKey,
  readLobbyShellCache,
  writeLobbyShellCache,
  type LobbyRoomGroupShell,
} from "@/lib/lobby/lobbyShell";

/**
 * صفحه لابی - نمایش روم‌های بازی بر اساس قیمت تیکت
 */
export default function LobbyPage() {
  const router = useRouter();
  const pathname = usePathname();
  const { themeDefinition } = useTheme();
  const sessionSnap = useSession();
  const { setShowBackButton, setOnBackClick } = useHeaderVisibility();
  const [roomGroups, setRoomGroups] = useState<LobbyRoomGroupShell[]>(() =>
    getStaticLobbyShell()
  );
  const [autoBuyByTemplate, setAutoBuyByTemplate] = useState<
    Record<string, AutoBuySnapshot>
  >({});
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [hasLiveSnapshot, setHasLiveSnapshot] = useState(false);
  const shellSourceRef = useRef<"static" | "cache">("static");
  useAutoStartTour(
    GAME_BROWSER_TOUR_ID,
    hasLiveSnapshot && !errorMessage && roomGroups.length > 0,
    { preferQueuedIntent: true }
  );

  // Hydrate shell from localStorage before paint (SSR-safe initial state is static catalog).
  useLayoutEffect(() => {
    const cached = readLobbyShellCache();
    if (cached && cached.length > 0) {
      shellSourceRef.current = "cache";
      setRoomGroups(cached);
      console.info("[Lobby] Shell source: cache", { count: cached.length });
    } else {
      shellSourceRef.current = "static";
      console.info("[Lobby] Shell source: static", {
        count: getStaticLobbyShell().length,
      });
    }
  }, []);

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

  const computeSnapshotHash = (groups: LobbyRoomGroupShell[]): string => {
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

      // If no token, do NOT fetch. Keep rescheduling — UI stays on shell, no blocking spinner.
      if (!sessionSnap.authReady || !sessionSnap.accessToken) {
        traceFetch("LobbyPage:lobby-snapshot", {
          reason: "no-token",
          delayMs,
          visibilityState: typeof document !== "undefined" ? document.visibilityState : "unknown",
          hasToken: false,
        });
        schedule(500, "no-token");
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
        console.info("[Lobby] Fetching lobby-snapshot", { reason, delayMs });

        let json: {
          roomGroups?: { groups?: LobbyRoomGroupShell[] };
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
            console.error("[Lobby] lobby-snapshot failed", res.status);
            nextError = "خطا در دریافت اطلاعات لابی";
            stableCountRef.current = Math.min(stableCountRef.current + 1, 2);
            schedule(stableCountRef.current === 1 ? 30000 : 60000, "error");
            return;
          }

          json = (await res.json()) as typeof json;
        }

        const groups = Array.isArray(json?.roomGroups?.groups)
          ? (json.roomGroups!.groups as LobbyRoomGroupShell[])
          : [];
        const sortedGroups = [...groups].sort((a, b) => a.price - b.price);
        setRoomGroups(sortedGroups);
        setHasLiveSnapshot(true);
        writeLobbyShellCache(sortedGroups);
        console.info("[Lobby] Hydrated from snapshot", {
          count: sortedGroups.length,
          shellSource: shellSourceRef.current,
        });

        void fetchAutoBuyLobbySnapshots()
          .then((sessions) => {
            if (!stopped) {
              setAutoBuyByTemplate(sessions);
            }
          })
          .catch((autoBuyErr) => {
            console.warn("[AutoBuy] lobby snapshot refresh failed", autoBuyErr);
          });

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
        console.error("[Lobby] Error in fetchRooms:", error);
        nextError = 'خطای غیرمنتظره در بارگذاری لابی';
        stableCountRef.current = Math.min(stableCountRef.current + 1, 2);
        schedule(stableCountRef.current === 1 ? 30000 : 60000, "exception");
      } finally {
        setErrorMessage(nextError);
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

  const buildGameRoomHref = (params: {
    templateId?: string | null;
    entryRoomId?: string | null;
    price: number;
    roomName?: string | null;
  }) => {
    const search = new URLSearchParams();
    if (params.templateId) {
      search.set("templateId", params.templateId);
    }
    if (params.entryRoomId) {
      search.set("roomId", params.entryRoomId);
    }
    if (params.price > 0) {
      search.set("price", String(params.price));
    }
    const trimmedName = params.roomName?.trim();
    if (trimmedName) {
      search.set("roomName", trimmedName);
    }
    return `/player/gameroom?${search.toString()}`;
  };

  // تابع برای کلیک روی روم
  const handleRoomClick = async (
    price: number,
    templateId?: string | null,
    entryRoomId?: string | null,
    roomName?: string | null
  ) => {
    if (templateId) {
      router.push(
        buildGameRoomHref({ templateId, price, roomName })
      );
      return;
    }

    if (entryRoomId) {
      router.push(
        buildGameRoomHref({ entryRoomId, price, roomName })
      );
      return;
    }

    console.error("[Lobby] Template ID is required for navigation", { price });
  };

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
        {hasLiveSnapshot && roomGroups.length === 0 ? (
          <div className={styles.emptyState}>
            <p className={styles.emptyText}>هیچ روم فعالی وجود ندارد</p>
          </div>
        ) : (
          roomGroups.map((group, index) => {
            const autoBuySession =
              group.templateId != null
                ? autoBuyByTemplate[group.templateId]
                : undefined;
            const autoBuyFundDisplay =
              autoBuySession?.active &&
              autoBuySession.fundInitial != null &&
              autoBuySession.fundRemaining != null
                ? formatAutoBuyFundDisplay(
                    autoBuySession.fundInitial,
                    autoBuySession.fundRemaining,
                    autoBuySession.inPlayCost ?? 0
                  )
                : null;

            return (
            <LobbyRoomCard
              key={lobbyRoomGroupKey(group)}
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
              autoBuyFundDisplay={autoBuyFundDisplay}
              variant="minimal" // TODO: از تنظیمات ادمین بگیرید
              onClick={(price, templateId, entryRoomId) =>
                handleRoomClick(price, templateId, entryRoomId, group.roomName)
              }
              dataTourId={
                index === 0 ? "game-browser-first-room" : undefined
              }
              statsDataTourId={
                index === 0 ? "game-browser-first-room-stats" : undefined
              }
            />
            );
          })
        )}

        <FeatureGate featureKey={BACKGAMMON_FEATURE_KEY}>
          <div className={styles.backgammonEntry}>
            <MenuItem
              menuItemId="backgammon"
              presentation={themeDefinition.menuItems.backgammon}
              href="/player/backgammon"
              className={styles.backgammonMenuItem}
            />
          </div>
        </FeatureGate>
      </div>
    </div>
  );
}
