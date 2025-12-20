"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { useSession } from "@/lib/contexts/SessionContext";
import GameResultsDialog, { type Winner } from "@/components/GameResultsDialog";
import { fetchRoomResults } from "@/services/rooms";
import {
  buildGameResultsKey,
  hasSeenGameResults,
  markSeenGameResults,
  type GameEndStatus,
} from "@/lib/gameResultsDedupe";

type ActiveRoomLite = {
  roomId: string;
  roomCode: string | null;
  cardPrice: number;
};

type RoomResults = { lineWinners: Winner[]; fullWinners: Winner[] };

const ACTIVE_ROOMS_POLL_MS = 12000;

function normalizeRoomName(roomCode: string | null, cardPrice: number): string {
  const code = (roomCode ?? "").trim();
  if (code) return code;
  return String(cardPrice);
}

export default function GameEndResultsListener() {
  const pathname = usePathname();
  const session = useSession();

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

  const currentUserId = session.userId;

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

            enqueueIfNew({ roomId, roomName, status, finishedAtHint: updatedAt });
          }
        )
        .subscribe();

      roomChannelsRef.current.set(roomId, channel);
    }
  };

  const fetchActiveRooms = async (): Promise<ActiveRoomLite[]> => {
    if (!session.accessToken) return [];
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
    if (refreshDebounceRef.current) {
      clearTimeout(refreshDebounceRef.current);
      refreshDebounceRef.current = null;
    }
    refreshDebounceRef.current = setTimeout(async () => {
      refreshDebounceRef.current = null;
      if (!isMountedRef.current) return;
      if (!enabled) return;
      const rooms = await fetchActiveRooms();
      if (!isMountedRef.current) return;
      syncRoomSubscriptions(rooms);
    }, delayMs);
  };

  // lifecycle: setup polling + tickets subscription + per-room subscriptions
  useEffect(() => {
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

    // polling: keeps room list fresh if realtime fails
    pollTimerRef.current = setInterval(() => {
      scheduleRefreshRooms(0);
    }, ACTIVE_ROOMS_POLL_MS);

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

    fetchRoomResults(next.roomId)
      .then((r) => {
        if (!isMountedRef.current) return;
        setResults(r);
      })
      .catch(() => {
        if (!isMountedRef.current) return;
        setResults({ lineWinners: [], fullWinners: [] });
      });
  }, [enabled, dialogOpen, queue, shouldSuppressBecauseLiveRoomAlreadyHandlesIt]);

  const handleClose = () => {
    setDialogOpen(false);
    setDialogRoomName(null);
    setResults(null);
    setQueue((prev) => prev.slice(1));
  };

  if (!enabled) return null;

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
        title={dialogRoomName ? `نتیجه بازی ${dialogRoomName}` : undefined}
      />
    </>
  );
}


