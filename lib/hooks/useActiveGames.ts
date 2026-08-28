"use client";

import { useState, useEffect, useRef, useCallback, useSyncExternalStore, type MutableRefObject } from "react";
import { supabase } from "../supabaseClient";
import { useSession } from "@/lib/contexts/SessionContext";
import { traceFetch } from "@/lib/debug/netTrace";
import {
  activeGamesMetrics,
  installActiveGamesMetricsOnWindow,
  type ActiveGamesFetchSource,
} from "@/lib/metrics/activeGamesMetrics";
import { getActiveGamesOrchestrator } from "@/lib/activeGames/ActiveGamesOrchestrator";

export interface ActiveRoom {
  roomId: string;
  roomCode: string | null;
  status: "waiting" | "playing" | "live" | "settling";
  cardPrice: number;
  currency: string;
  cardCount: number;
  prize: number;
  roomType?: string; // نوع روم: 'normal' | 'tournament' | ...
  templateId?: string | null;
  /** 1-based index among currently active rooms of the same template. */
  templateTableIndex?: number;
  /** Tournament round number; null for non-tournament rooms. */
  roundNo?: number | null;
}

export interface ActiveGames {
  rooms: ActiveRoom[];
  loading: boolean;
  error: string | null;
  /** برای به‌روزرسانی فوری لیست بازی‌های فعال (مثلاً بعد از خرید کارت) */
  invalidate?: () => void;
  /** نمایش فوری چیپ بعد از join؛ snapshot بعدی لیست را اصلاح می‌کند */
  upsertOptimistic?: (room: ActiveRoom) => void;
}

import {
  ACTIVE_GAMES_EMPTY_BACKOFF_MS,
  ACTIVE_GAMES_POLL_MS,
} from "@/lib/activeGames/constants";
import {
  patchActiveRoomsFromRoomUpdate,
  syncRoomStatusMap,
} from "@/lib/activeGames/activeRoomPatch";

const REALTIME_REFETCH_DEBOUNCE_MS = 150;

/**
 * Hook برای دریافت روم‌های فعال پلیر
 * شامل realtime subscription و polling fallback
 */
export function useActiveGames(): ActiveGames {
  /**
   * Phase C feature flag (same as context/provider):
   * dev default: orchestrator, prod default: legacy
   * Override via NEXT_PUBLIC_ACTIVE_GAMES_SOURCE.
   */
  const source =
    process.env.NEXT_PUBLIC_ACTIVE_GAMES_SOURCE ?? "orchestrator";

  // When orchestrator is enabled, this hook becomes a thin reader and must not
  // create its own fetch/poll/realtime side-effects.
  if (source === "orchestrator") {
    return useSyncExternalStore(
      getActiveGamesOrchestrator().subscribe,
      getActiveGamesOrchestrator().getSnapshot,
      getActiveGamesOrchestrator().getSnapshot
    );
  }

  const session = useSession();

  const didInitLogRef = useRef(false);
  useEffect(() => {
    if (didInitLogRef.current) return;
    didInitLogRef.current = true;
    console.log("[useActiveGames] Hook initialized");
  }, []);

  const [rooms, setRooms] = useState<ActiveRoom[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const isMountedRef = useRef<boolean>(false);
  const pollTimerRef = useRef<NodeJS.Timeout | null>(null);
  const emptyBackoffStepRef = useRef<number>(0);
  const subscriptionRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const setupGenerationRef = useRef(0);
  const etagRef = useRef<string | null>(null);
  const trackedRoomIdsRef = useRef<Set<string>>(new Set());
  const roomStatusByIdRef = useRef<Map<string, string>>(new Map());
  const roomsRef = useRef<ActiveRoom[]>([]);
  const fetchActiveRoomsRef = useRef<(skipEtag?: boolean, source?: ActiveGamesFetchSource) => Promise<number | null> | null>(null) as MutableRefObject<(skipEtag?: boolean, source?: ActiveGamesFetchSource) => Promise<number | null> | null>;

  const clearPollTimer = () => {
    if (pollTimerRef.current) {
      clearTimeout(pollTimerRef.current);
      pollTimerRef.current = null;
      activeGamesMetrics.pollingStop();
    }
  };

  const scheduleNextPoll = (delayMs: number, reason: string) => {
    clearPollTimer();
    pollTimerRef.current = setTimeout(() => {
      pollTimerRef.current = null;
      if (!isMountedRef.current) return;
      traceFetch("useActiveGames:fetch", {
        reason,
        delayMs,
        emptyBackoffStep: emptyBackoffStepRef.current,
        trackedRooms: trackedRoomIdsRef.current.size,
      });
      void fetchActiveRooms(false, "polling");
    }, delayMs);
    activeGamesMetrics.pollingStart(delayMs);
    if (process.env.NODE_ENV !== "production") {
      console.log("[useActiveGames] poll:scheduled", { delayMs, reason });
    }
  };

  // Fetch function
  const fetchActiveRooms = async (
    skipEtag = false,
    source: ActiveGamesFetchSource = "manual"
  ): Promise<number | null> => {
    activeGamesMetrics.fetchStart(source, { skipEtag });
    try {
      if (!session.authReady || !session.userId) {
        activeGamesMetrics.lifecycle("auth-missing", {
          stage: "fetchActiveRooms:session",
          userError: null,
        });
        if (isMountedRef.current) {
          setError("کاربر پیدا نشد");
          setRooms([]);
          setLoading(false);
          activeGamesMetrics.patch({ reason: "no-user", action: "setEmptyRooms" });
        }
        activeGamesMetrics.fetchEnd(source, 200, { note: "no-user-early-return" });
        clearPollTimer();
        return 0;
      }

      const token = session.accessToken || null;

      const headers: HeadersInit = {
        "Cache-Control": "no-cache",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      };
      if (!skipEtag && etagRef.current) {
        headers["If-None-Match"] = etagRef.current;
      }

      traceFetch("useActiveGames:fetch", {
        reason: source,
        skipEtag,
        emptyBackoffStep: emptyBackoffStepRef.current,
        trackedRooms: trackedRoomIdsRef.current.size,
      });
      const response = await fetch("/api/player/my-active-rooms", {
        headers,
        cache: "no-store",
      });

      // 304 Not Modified - no changes (Next.js API routes support this)
      if (response.status === 304) {
        console.log("[useActiveGames] No changes (304), skipping update");
        if (isMountedRef.current) {
          // ensure loading won't get stuck in edge cases
          setLoading(false);
        }
        activeGamesMetrics.fetchEnd(source, 304);
        const currentCount = trackedRoomIdsRef.current.size;
        // keep polling cadence consistent with current "empty/non-empty" state
        if (currentCount === 0) {
          emptyBackoffStepRef.current = Math.min(emptyBackoffStepRef.current + 1, ACTIVE_GAMES_EMPTY_BACKOFF_MS.length);
          const delay = ACTIVE_GAMES_EMPTY_BACKOFF_MS[Math.max(0, emptyBackoffStepRef.current - 1)] ?? ACTIVE_GAMES_EMPTY_BACKOFF_MS[0];
          scheduleNextPoll(delay, "etag-304-empty");
        } else {
          emptyBackoffStepRef.current = 0;
          scheduleNextPoll(ACTIVE_GAMES_POLL_MS, "etag-304-nonempty");
        }
        return currentCount;
      }

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const data = await response.json();
      const newEtag = response.headers.get("ETag");

      if (isMountedRef.current) {
        const nextRooms: ActiveRoom[] = data.rooms || [];
        roomsRef.current = nextRooms;
        setRooms(nextRooms);
        setError(null);
        setLoading(false);
        if (newEtag) {
          etagRef.current = newEtag;
        }

        trackedRoomIdsRef.current = new Set(nextRooms.map((r) => r.roomId).filter(Boolean));
        syncRoomStatusMap(nextRooms, roomStatusByIdRef.current);

        activeGamesMetrics.patch({
          reason: "fetch-success",
          roomsCount: Array.isArray(data?.rooms) ? data.rooms.length : null,
          hasEtag: Boolean(newEtag),
        });

        // Adjust polling: when empty -> heavy backoff; when non-empty -> normal polling.
        const count = nextRooms.length;
        if (count === 0) {
          emptyBackoffStepRef.current = Math.min(emptyBackoffStepRef.current + 1, ACTIVE_GAMES_EMPTY_BACKOFF_MS.length);
          const delay = ACTIVE_GAMES_EMPTY_BACKOFF_MS[Math.max(0, emptyBackoffStepRef.current - 1)] ?? ACTIVE_GAMES_EMPTY_BACKOFF_MS[0];
          scheduleNextPoll(delay, "empty-backoff");
        } else {
          emptyBackoffStepRef.current = 0;
          scheduleNextPoll(ACTIVE_GAMES_POLL_MS, "nonempty");
        }
      }
      activeGamesMetrics.fetchEnd(source, 200, {
        roomsCount: Array.isArray(data?.rooms) ? data.rooms.length : null,
      });
      return Array.isArray(data?.rooms) ? data.rooms.length : 0;
    } catch (err: any) {
      console.error("[useActiveGames] Fetch error:", err);
      if (isMountedRef.current) {
        setError(err.message || "خطا در دریافت روم‌های فعال");
        setLoading(false);
      }
      activeGamesMetrics.fetchEnd(source, "errored", { error: String(err?.message ?? err) });
      // On failures, keep current timer (don't tighten loops).
      return null;
    }
  };

  const invalidate = useCallback(() => {
    void fetchActiveRoomsRef.current?.(true, "manual");
  }, []);

  const upsertOptimistic = useCallback((room: ActiveRoom) => {
    if (!room?.roomId) return;
    setRooms((prev) => {
      const status = (["waiting", "playing", "live", "settling"] as const).includes(
        room.status as ActiveRoom["status"]
      )
        ? (room.status as ActiveRoom["status"])
        : "waiting";
      const cardCount = Math.max(1, Number(room.cardCount ?? 1));
      const cardPrice = Number(room.cardPrice ?? 0);
      const nextRoom: ActiveRoom = {
        roomId: room.roomId,
        roomCode: room.roomCode ?? null,
        status,
        cardPrice,
        currency: room.currency || "IRT",
        cardCount,
        prize: Number(room.prize ?? cardPrice * cardCount),
        roomType: room.roomType || "normal",
        templateId: room.templateId ?? null,
        templateTableIndex:
          typeof room.templateTableIndex === "number" && room.templateTableIndex > 0
            ? room.templateTableIndex
            : undefined,
        roundNo:
          typeof room.roundNo === "number" && room.roundNo > 0 ? room.roundNo : null,
      };
      const idx = prev.findIndex((r) => r.roomId === nextRoom.roomId);
      let next: ActiveRoom[];
      if (idx >= 0) {
        const existing = prev[idx]!;
        const mergedCount = Math.max(existing.cardCount, nextRoom.cardCount);
        next = [...prev];
        next[idx] = {
          ...existing,
          ...nextRoom,
          cardCount: mergedCount,
          prize:
            Number(room.prize ?? 0) > 0
              ? nextRoom.prize
              : nextRoom.cardPrice * mergedCount,
          templateId: nextRoom.templateId ?? existing.templateId ?? null,
          templateTableIndex:
            nextRoom.templateTableIndex ?? existing.templateTableIndex ?? 1,
          roundNo: nextRoom.roundNo ?? existing.roundNo ?? null,
        };
      } else {
        const siblingCount = prev.filter(
          (r) =>
            (nextRoom.templateId && r.templateId === nextRoom.templateId) ||
            (!nextRoom.templateId && r.cardPrice === nextRoom.cardPrice)
        ).length;
        next = [
          ...prev,
          {
            ...nextRoom,
            templateTableIndex: nextRoom.templateTableIndex ?? siblingCount + 1,
          },
        ];
      }
      roomsRef.current = next;
      trackedRoomIdsRef.current = new Set(next.map((r) => r.roomId).filter(Boolean));
      syncRoomStatusMap(next, roomStatusByIdRef.current);
      return next;
    });
    setLoading(false);
    setError(null);
    void fetchActiveRoomsRef.current?.(true, "manual");
  }, []);

  useEffect(() => {
    fetchActiveRoomsRef.current = fetchActiveRooms;
  });

  // Setup subscription
  useEffect(() => {
    const setupGeneration = ++setupGenerationRef.current;
    let cancelled = false;

    console.log("[useActiveGames] useEffect triggered - setting up...");
    installActiveGamesMetricsOnWindow();
    activeGamesMetrics.lifecycle("mount");
    activeGamesMetrics.init();
    isMountedRef.current = true;

    const setupSubscription = async () => {
      console.log("[useActiveGames] setupSubscription started");
      if (!session.authReady || !session.userId) {
        console.log("[useActiveGames] No user found (session not ready / missing userId)");
        activeGamesMetrics.lifecycle("auth-missing", {
          stage: "setupSubscription:session",
          userError: null,
        });
        if (isMountedRef.current) {
          setLoading(false);
        }
        return;
      }

      console.log("[useActiveGames] User found, fetching active rooms...");
      await fetchActiveRooms(true, "initial");

      if (
        cancelled ||
        setupGeneration !== setupGenerationRef.current ||
        !isMountedRef.current
      ) {
        return;
      }

      if (subscriptionRef.current) {
        supabase.removeChannel(subscriptionRef.current);
        subscriptionRef.current = null;
        activeGamesMetrics.channelRemoved();
      }

      const userId = session.userId;
      const channel = supabase
        .channel(`my_active_rooms_${userId}`)
        .on(
          "postgres_changes",
          {
            event: "*",
            schema: "public",
            table: "tickets",
            filter: `player_user_id=eq.${userId}`,
          },
          (payload) => {
            console.log("[useActiveGames] Tickets change detected:", payload.eventType);
            setTimeout(() => {
              if (isMountedRef.current) {
                void fetchActiveRooms(true, "realtime");
              }
            }, REALTIME_REFETCH_DEBOUNCE_MS);
          }
        )
        .on(
          "postgres_changes",
          {
            event: "UPDATE",
            schema: "public",
            table: "rooms",
          },
          (payload) => {
            const roomId = (payload.new as any)?.id as string | undefined;
            if (!roomId) return;
            if (!trackedRoomIdsRef.current.has(roomId) && !roomStatusByIdRef.current.has(roomId)) {
              return;
            }

            const patch = patchActiveRoomsFromRoomUpdate(
              roomsRef.current,
              roomStatusByIdRef.current,
              payload as { new?: Record<string, unknown> }
            );

            if (patch.changed) {
              roomsRef.current = patch.rooms;
              trackedRoomIdsRef.current = new Set(
                patch.rooms.map((r) => r.roomId).filter(Boolean)
              );
              if (isMountedRef.current) {
                setRooms(patch.rooms);
              }
              return;
            }

            if (patch.action === "resync") {
              setTimeout(() => {
                if (isMountedRef.current) {
                  void fetchActiveRooms(true, "realtime");
                }
              }, REALTIME_REFETCH_DEBOUNCE_MS);
            }
          }
        )
        .subscribe((status) => {
          console.log("[useActiveGames] Subscription status:", status);
        });

      if (
        cancelled ||
        setupGeneration !== setupGenerationRef.current ||
        !isMountedRef.current
      ) {
        supabase.removeChannel(channel);
        return;
      }

      subscriptionRef.current = channel;
      activeGamesMetrics.channelAdded({ name: `my_active_rooms_${userId}` });
    };

    void setupSubscription();

    return () => {
      cancelled = true;
      setupGenerationRef.current += 1;
      isMountedRef.current = false;
      activeGamesMetrics.lifecycle("cleanup");

      if (subscriptionRef.current) {
        supabase.removeChannel(subscriptionRef.current);
        subscriptionRef.current = null;
        activeGamesMetrics.channelRemoved();
      }

      clearPollTimer();
      activeGamesMetrics.lifecycle("unmount");
    };
  }, [session.authReady, session.userId]); // Session SSOT drives setup

  return {
    rooms,
    loading,
    error,
    invalidate,
    upsertOptimistic,
  };
}

// Also expose as default export to avoid any named-export interop issues in bundlers.
export default useActiveGames;

