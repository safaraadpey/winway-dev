"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { useSession } from "@/lib/contexts/SessionContext";
import { traceFetch } from "@/lib/debug/netTrace";
import { useActiveGamesContext } from "@/lib/contexts/ActiveGamesContext";
import GameResultsDialog, { type Winner } from "@/components/GameResultsDialog";
import {
  fetchRoomResultsWhenPrizesReady,
  type RoomResultsResponse,
} from "@/services/rooms";
import { useBalancesContext } from "@/lib/contexts/BalancesContext";
import {
  buildGameResultsKey,
  hasSeenGameResults,
  markSeenGameResults,
  type GameEndStatus,
} from "@/lib/gameResultsDedupe";
import { HARD_EXIT_EVENT, isHardExiting } from "@/lib/auth/hardExit";

type ActiveRoomLite = {
  roomId: string;
  roomCode: string | null;
  cardPrice: number;
};

type RoomResults = RoomResultsResponse;

const ACTIVE_ROOMS_POLL_MS = 12000;

function normalizeRoomName(roomCode: string | null, cardPrice: number): string {
  const code = (roomCode ?? "").trim();
  if (code) return code;
  return String(cardPrice);
}

export default function GameEndResultsListener() {
  const pathname = usePathname();
  const router = useRouter();
  const session = useSession();
  let activeGames: ReturnType<typeof useActiveGamesContext> | null = null;
  try {
    activeGames = useActiveGamesContext();
  } catch {
    // If provider is missing, fail-safe to no-op.
    activeGames = null;
  }
  const activeRoomsFromContext = activeGames?.rooms ?? [];
  const source = process.env.NEXT_PUBLIC_ACTIVE_GAMES_SOURCE ?? "orchestrator";

  // Keep this listener lightweight on auth/public routes
  const enabled = Boolean(session.authReady && session.userId && session.accessToken);

  const [queue, setQueue] = useState<
    Array<{
      roomId: string;
      roomName: string;
      status: GameEndStatus;
      finishedAtHint: string | number | null;
    }>
  >([]);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [dialogRoomName, setDialogRoomName] = useState<string | null>(null);
  const [results, setResults] = useState<RoomResults | null>(null);

  const activeRoomsRef = useRef<Map<string, ActiveRoomLite>>(new Map());
  const roomChannelsRef = useRef<Map<string, ReturnType<typeof supabase.channel>>>(new Map());
  const ticketsChannelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const pollTimerRef = useRef<NodeJS.Timeout | null>(null);
  const refreshDebounceRef = useRef<NodeJS.Timeout | null>(null);
  const isMountedRef = useRef(false);
  const pollEnabledRef = useRef(false);

  const currentUserId = session.userId;
  const { scheduleWalletBalanceSync } = useBalancesContext();

  const shouldSuppressBecauseLiveRoomAlreadyHandlesIt = useMemo(() => {
    // GameRoom (and LiveRoomScreen inside it) already shows results dialog on finish.
    // We still keep global dedupe, but suppressing here reduces double-overlay risk.
    return pathname?.startsWith("/player/gameroom") ?? false;
  }, [pathname]);

  // Important: when suppressed, DO NOT mark dedupe keys (otherwise LiveRoomScreen won't show).
  const suppressRef = useRef(false);
  useEffect(() => {
    suppressRef.current = shouldSuppressBecauseLiveRoomAlreadyHandlesIt;
    // Also clear any queued popups that were collected before we entered the game room route.
    if (suppressRef.current) {
      setQueue([]);
      setDialogOpen(false);
      setDialogRoomName(null);
      setResults(null);
    }
  }, [shouldSuppressBecauseLiveRoomAlreadyHandlesIt]);

  useEffect(() => {
    const cleanupListenerResources = () => {
      setQueue([]);
      setDialogOpen(false);
      setDialogRoomName(null);
      setResults(null);
      if (pollTimerRef.current) {
        clearInterval(pollTimerRef.current);
        pollTimerRef.current = null;
      }
      pollEnabledRef.current = false;
      if (refreshDebounceRef.current) {
        clearTimeout(refreshDebounceRef.current);
        refreshDebounceRef.current = null;
      }
      if (ticketsChannelRef.current) {
        try {
          supabase.removeChannel(ticketsChannelRef.current);
        } catch {
          // ignore
        }
        ticketsChannelRef.current = null;
      }
      for (const ch of Array.from(roomChannelsRef.current.values())) {
        try {
          supabase.removeChannel(ch);
        } catch {
          // ignore
        }
      }
      roomChannelsRef.current.clear();
      activeRoomsRef.current.clear();
    };

    const onHardExit = () => cleanupListenerResources();
    window.addEventListener(HARD_EXIT_EVENT, onHardExit);
    return () => window.removeEventListener(HARD_EXIT_EVENT, onHardExit);
  }, []);

  const enqueueIfNew = (evt: {
    roomId: string;
    roomName: string;
    status: GameEndStatus;
    finishedAtHint: string | number | null;
  }) => {
    if (suppressRef.current) return;

    const key = buildGameResultsKey({
      roomName: evt.roomName,
      // Treat settling/finished as the same "game ended" signal to avoid duplicate popups.
      status: "finished",
      // Rely on roomName short-term uniqueness to avoid churn from updated_at changes.
      finishedAtHint: null,
    });

    if (hasSeenGameResults(key)) return;
    markSeenGameResults(key);

    setQueue((prev) => {
      // avoid duplicates in memory as well
      if (prev.some((p) => p.roomId === evt.roomId && p.status === evt.status && String(p.finishedAtHint) === String(evt.finishedAtHint))) {
        return prev;
      }
      return [...prev, evt];
    });
  };

  const syncRoomSubscriptions = (rooms: ActiveRoomLite[]) => {
    const nextMap = new Map<string, ActiveRoomLite>();
    for (const r of rooms) nextMap.set(r.roomId, r);
    activeRoomsRef.current = nextMap;

    // Polling must be 100% dormant when there are no active rooms.
    const hasActiveRooms = nextMap.size > 0;
    if (!hasActiveRooms) {
      if (pollTimerRef.current) {
        clearInterval(pollTimerRef.current);
        pollTimerRef.current = null;
      }
      pollEnabledRef.current = false;
      if (refreshDebounceRef.current) {
        clearTimeout(refreshDebounceRef.current);
        refreshDebounceRef.current = null;
      }
    }

    // unsubscribe removed rooms
    for (const [roomId, ch] of Array.from(roomChannelsRef.current.entries())) {
      if (!nextMap.has(roomId)) {
        try {
          supabase.removeChannel(ch);
        } catch {
          // ignore
        }
        roomChannelsRef.current.delete(roomId);
      }
    }

    // subscribe new rooms
    for (const [roomId, room] of Array.from(nextMap.entries())) {
      if (roomChannelsRef.current.has(roomId)) continue;

      const channel = supabase
        .channel(`game_end_rooms_${roomId}`)
        .on(
          "postgres_changes",
          {
            event: "UPDATE",
            schema: "public",
            table: "rooms",
            filter: `id=eq.${roomId}`,
          },
          (payload) => {
            if (suppressRef.current) return;

            const newStatusRaw = String((payload.new as any)?.status ?? "").trim().toLowerCase();
            if (newStatusRaw !== "settling" && newStatusRaw !== "finished") return;

            const status = newStatusRaw as GameEndStatus;
            const updatedAt =
              (payload.new as any)?.updated_at ??
              (payload.new as any)?.ends_at ??
              (payload.new as any)?.prize_paid_at ??
              (payload as any)?.commit_timestamp ??
              null;

            const roomCode = (payload.new as any)?.room_code ?? room.roomCode ?? null;
            const cardPrice = Number((payload.new as any)?.card_price ?? room.cardPrice ?? 0);
            const roomName = normalizeRoomName(roomCode, cardPrice);

            activeGames?.invalidate?.();
            enqueueIfNew({ roomId, roomName, status, finishedAtHint: updatedAt });
          }
        )
        .subscribe();

      roomChannelsRef.current.set(roomId, channel);
    }

    // Start polling only when we actually have active rooms.
    // (If the user has no active rooms, this listener should be fully dormant.)
    if (source !== "orchestrator" && hasActiveRooms && !pollEnabledRef.current) {
      pollEnabledRef.current = true;
      if (pollTimerRef.current) {
        clearInterval(pollTimerRef.current);
        pollTimerRef.current = null;
      }
      pollTimerRef.current = setInterval(() => {
        scheduleRefreshRooms(0);
      }, ACTIVE_ROOMS_POLL_MS);
    } else if (source === "orchestrator") {
      // In orchestrator mode, polling must stay off.
      pollEnabledRef.current = false;
      if (pollTimerRef.current) {
        clearInterval(pollTimerRef.current);
        pollTimerRef.current = null;
      }
    }
  };

  const activeRoomsFromContextLite = useMemo<ActiveRoomLite[]>(() => {
    return activeRoomsFromContext.map((r) => ({
      roomId: String(r.roomId),
      roomCode: r.roomCode ?? null,
      cardPrice: Number(r.cardPrice ?? 0),
    }));
  }, [activeRoomsFromContext]);

  const fetchActiveRooms = async (): Promise<ActiveRoomLite[]> => {
    if (isHardExiting()) return [];
    // Orchestrator path: consume shared state, no fetch/poll.
    if (source === "orchestrator") {
      return activeRoomsFromContextLite;
    }

    if (!session.authReady || !session.userId || !session.accessToken) return [];
    traceFetch("GameEndResultsListener:fetch", {
      action: "my-active-rooms",
      pathname,
      userId: session.userId,
    });
    const res = await fetch("/api/player/my-active-rooms", {
      headers: { Authorization: `Bearer ${session.accessToken}` },
      cache: "no-store",
    });
    if (!res.ok) return [];
    const json = (await res.json()) as { rooms?: Array<any> };
    const rooms = Array.isArray(json?.rooms) ? json.rooms : [];
    return rooms.map((r) => ({
      roomId: String(r.roomId),
      roomCode: (r.roomCode ?? null) as string | null,
      cardPrice: Number(r.cardPrice ?? 0),
    }));
  };

  const scheduleRefreshRooms = (delayMs: number) => {
    if (isHardExiting()) return;
    // Orchestrator owns snapshot fetching; listener must not fetch.
    if (source === "orchestrator") return;
    if (!enabled) return;
    if (!session.authReady || !session.userId || !session.accessToken) return;
    if (refreshDebounceRef.current) {
      clearTimeout(refreshDebounceRef.current);
      refreshDebounceRef.current = null;
    }
    refreshDebounceRef.current = setTimeout(async () => {
      refreshDebounceRef.current = null;
      if (!isMountedRef.current) return;
      if (!enabled) return;
      if (!session.authReady || !session.userId || !session.accessToken) return;
      traceFetch("GameEndResultsListener:fetch", {
        action: "my-active-rooms",
        pathname,
        reason: "scheduleRefreshRooms",
        delayMs,
      });
      const rooms = await fetchActiveRooms();
      if (!isMountedRef.current) return;
      syncRoomSubscriptions(rooms);
    }, delayMs);
  };

  // lifecycle: setup polling + tickets subscription + per-room subscriptions
  useEffect(() => {
    if (source === "orchestrator") return;
    isMountedRef.current = true;

    if (!enabled) {
      // cleanup if auth is gone
      setQueue([]);
      setDialogOpen(false);
      setDialogRoomName(null);
      setResults(null);
      return () => {
        isMountedRef.current = false;
      };
    }

    // initial load
    scheduleRefreshRooms(0);

    // tickets realtime: any change in tickets => refresh active rooms list immediately
    if (ticketsChannelRef.current) {
      try {
        supabase.removeChannel(ticketsChannelRef.current);
      } catch {
        // ignore
      }
      ticketsChannelRef.current = null;
    }
    ticketsChannelRef.current = supabase
      .channel(`game_end_tickets_${session.userId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "tickets",
          filter: `player_user_id=eq.${session.userId}`,
        },
        () => {
          scheduleRefreshRooms(250);
        }
      )
      .subscribe();

    return () => {
      isMountedRef.current = false;

      if (pollTimerRef.current) {
        clearInterval(pollTimerRef.current);
        pollTimerRef.current = null;
      }
      pollEnabledRef.current = false;
      if (refreshDebounceRef.current) {
        clearTimeout(refreshDebounceRef.current);
        refreshDebounceRef.current = null;
      }
      if (ticketsChannelRef.current) {
        try {
          supabase.removeChannel(ticketsChannelRef.current);
        } catch {
          // ignore
        }
        ticketsChannelRef.current = null;
      }
      for (const ch of Array.from(roomChannelsRef.current.values())) {
        try {
          supabase.removeChannel(ch);
        } catch {
          // ignore
        }
      }
      roomChannelsRef.current.clear();
      activeRoomsRef.current.clear();
    };
    // Re-init on identity/token changes
  }, [enabled, session.userId, session.accessToken, session.tokenVersion]);

  // Orchestrator path: react to shared state, no direct fetch/poll.
  useEffect(() => {
    if (source !== "orchestrator") return;
    isMountedRef.current = true;

    if (!enabled) {
      setQueue([]);
      setDialogOpen(false);
      setDialogRoomName(null);
      setResults(null);
      return () => {
        isMountedRef.current = false;
        if (pollTimerRef.current) {
          clearInterval(pollTimerRef.current);
          pollTimerRef.current = null;
        }
        pollEnabledRef.current = false;
        if (refreshDebounceRef.current) {
          clearTimeout(refreshDebounceRef.current);
          refreshDebounceRef.current = null;
        }
        for (const ch of Array.from(roomChannelsRef.current.values())) {
          try {
            supabase.removeChannel(ch);
          } catch {
            // ignore
          }
        }
        roomChannelsRef.current.clear();
        activeRoomsRef.current.clear();
      };
    }

    syncRoomSubscriptions(activeRoomsFromContextLite);

    return () => {
      isMountedRef.current = false;
      if (pollTimerRef.current) {
        clearInterval(pollTimerRef.current);
        pollTimerRef.current = null;
      }
      pollEnabledRef.current = false;
      if (refreshDebounceRef.current) {
        clearTimeout(refreshDebounceRef.current);
        refreshDebounceRef.current = null;
      }
      for (const ch of Array.from(roomChannelsRef.current.values())) {
        try {
          supabase.removeChannel(ch);
        } catch {
          // ignore
        }
      }
      roomChannelsRef.current.clear();
      activeRoomsRef.current.clear();
    };
  }, [
    source,
    enabled,
    activeRoomsFromContextLite,
    session.userId,
    session.accessToken,
    session.tokenVersion,
  ]);

  // queue consumer: show one popup at a time
  useEffect(() => {
    if (!enabled) return;
    if (dialogOpen) return;
    if (queue.length === 0) return;
    if (shouldSuppressBecauseLiveRoomAlreadyHandlesIt) return;

    const next = queue[0];
    setDialogRoomName(next.roomName);
    setResults(null);
    setDialogOpen(true);

    traceFetch("GameEndResultsListener:fetch", {
      action: "room-results",
      roomId: next.roomId,
      pathname,
    });
    fetchRoomResultsWhenPrizesReady(next.roomId)
      .then((r) => {
        if (!isMountedRef.current) return;
        setResults(r);
        scheduleWalletBalanceSync?.(`room-settled:${next.roomId}`);
      })
      .catch(() => {
        if (!isMountedRef.current) return;
        setResults({
          lineWinners: [],
          fullWinners: [],
          seed: null,
          commitHash: null,
          drawVerification: null,
          isTournament: false,
          tournamentId: null,
        });
      });
  }, [
    enabled,
    dialogOpen,
    queue,
    shouldSuppressBecauseLiveRoomAlreadyHandlesIt,
    scheduleWalletBalanceSync,
  ]);

  const handleClose = () => {
    setDialogOpen(false);
    setDialogRoomName(null);
    setResults(null);
    setQueue((prev) => prev.slice(1));
    if (results?.isTournament && results?.tournamentId) {
      const tournamentId = results.tournamentId;
      router.push(
        `/player/tournaments/${tournamentId}?tournamentId=${tournamentId}&templateId=${tournamentId}`
      );
    }
  };

  if (!enabled) return null;
  // If ActiveGames context is absent (e.g., mis-wrapped tree), fail-safe.
  if (!activeGames) return null;

  // Render the global dialog (overlay) on top of any page
  return (
    <>
      <GameResultsDialog
        isOpen={dialogOpen}
        onClose={handleClose}
        primaryActionLabel="بستن"
        onPrimaryAction={handleClose}
        currentUserId={currentUserId}
        lineWinners={results?.lineWinners ?? []}
        fullWinners={results?.fullWinners ?? []}
        isTournament={results?.isTournament ?? false}
        title={
          dialogRoomName ? (
            <span dir="rtl">
              نتیجه بازی شماره :{" "}
              <span dir="ltr" className="latin-number">
                {dialogRoomName}
              </span>
            </span>
          ) : undefined
        }
        proofSeed={results?.seed ?? null}
        proofCommitHash={results?.commitHash ?? null}
        drawVerification={results?.drawVerification ?? null}
      />
    </>
  );
}


