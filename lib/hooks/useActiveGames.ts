"use client";

import { useState, useEffect, useRef } from "react";
import { supabase } from "../supabaseClient";
import { useSession } from "@/lib/contexts/SessionContext";
import {
  activeGamesMetrics,
  installActiveGamesMetricsOnWindow,
  type ActiveGamesFetchSource,
} from "@/lib/metrics/activeGamesMetrics";

export interface ActiveRoom {
  roomId: string;
  roomCode: string | null;
  status: "waiting" | "playing" | "live" | "settling";
  cardPrice: number;
  currency: string;
  cardCount: number;
  prize: number;
}

export interface ActiveGames {
  rooms: ActiveRoom[];
  loading: boolean;
  error: string | null;
}

const POLLING_INTERVAL = 12000; // 12 seconds
const EMPTY_BACKOFF_STEPS_MS = [60000, 120000, 300000] as const;

/**
 * Hook برای دریافت روم‌های فعال پلیر
 * شامل realtime subscription و polling fallback
 */
export function useActiveGames(): ActiveGames {
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
  const etagRef = useRef<string | null>(null);
  const trackedRoomIdsRef = useRef<Set<string>>(new Set());

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
          emptyBackoffStepRef.current = Math.min(emptyBackoffStepRef.current + 1, EMPTY_BACKOFF_STEPS_MS.length);
          const delay = EMPTY_BACKOFF_STEPS_MS[Math.max(0, emptyBackoffStepRef.current - 1)] ?? EMPTY_BACKOFF_STEPS_MS[0];
          scheduleNextPoll(delay, "etag-304-empty");
        } else {
          emptyBackoffStepRef.current = 0;
          scheduleNextPoll(POLLING_INTERVAL, "etag-304-nonempty");
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
        setRooms(nextRooms);
        setError(null);
        setLoading(false);
        if (newEtag) {
          etagRef.current = newEtag;
        }

        // Track current rooms so `rooms` realtime doesn't wake us when empty.
        trackedRoomIdsRef.current = new Set(nextRooms.map((r) => r.roomId).filter(Boolean));

        activeGamesMetrics.patch({
          reason: "fetch-success",
          roomsCount: Array.isArray(data?.rooms) ? data.rooms.length : null,
          hasEtag: Boolean(newEtag),
        });

        // Adjust polling: when empty -> heavy backoff; when non-empty -> normal polling.
        const count = nextRooms.length;
        if (count === 0) {
          emptyBackoffStepRef.current = Math.min(emptyBackoffStepRef.current + 1, EMPTY_BACKOFF_STEPS_MS.length);
          const delay = EMPTY_BACKOFF_STEPS_MS[Math.max(0, emptyBackoffStepRef.current - 1)] ?? EMPTY_BACKOFF_STEPS_MS[0];
          scheduleNextPoll(delay, "empty-backoff");
        } else {
          emptyBackoffStepRef.current = 0;
          scheduleNextPoll(POLLING_INTERVAL, "nonempty");
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

  // Setup subscription
  useEffect(() => {
    console.log('[useActiveGames] useEffect triggered - setting up...');
    installActiveGamesMetricsOnWindow();
    activeGamesMetrics.lifecycle("mount");
    activeGamesMetrics.init();
    isMountedRef.current = true;

    const setupSubscription = async () => {
      console.log('[useActiveGames] setupSubscription started');
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

      console.log('[useActiveGames] User found, fetching active rooms...');
      // Initial fetch
      await fetchActiveRooms(true, "initial");

      // Setup realtime subscription
      const channel = supabase
        .channel(`my_active_rooms_${session.userId}`)
        .on(
          "postgres_changes",
          {
            event: "*",
            schema: "public",
            table: "tickets",
            filter: `player_user_id=eq.${session.userId}`,
          },
          (payload) => {
            console.log("[useActiveGames] Tickets change detected:", payload.eventType);
            // Debounce: wait 500ms before refetching
            setTimeout(() => {
              if (isMountedRef.current) {
                // Realtime event is a strong signal; bypass ETag to avoid 304 collisions/stale validators.
                void fetchActiveRooms(true, "realtime");
              }
            }, 500);
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
            const roomId = (payload.new as any)?.id;
            const newStatus = (payload.new as any)?.status;
            const oldStatus = (payload.old as any)?.status;
            
            // فقط اگر status تغییر کرده باشد
            if (roomId && newStatus && newStatus !== oldStatus) {
              // Only react to rooms we currently track; prevents waking when rooms list is empty.
              if (!trackedRoomIdsRef.current.has(roomId)) return;
              const isActiveStatus = ["waiting", "playing", "live", "settling"].includes(newStatus);
              const wasActiveStatus = oldStatus && ["waiting", "playing", "live", "settling"].includes(oldStatus);
              
              // اگر روم به حالت فعال رفت یا از حالت فعال خارج شد، refetch کن
              if (isActiveStatus || wasActiveStatus) {
                console.log("[useActiveGames] Room status change detected:", roomId, oldStatus, "→", newStatus);
                setTimeout(() => {
                  if (isMountedRef.current) {
                    // Realtime event is a strong signal; bypass ETag to avoid 304 collisions/stale validators.
                    void fetchActiveRooms(true, "realtime");
                  }
                }, 500);
              }
            }
          }
        )
        .subscribe((status) => {
          console.log("[useActiveGames] Subscription status:", status);
        });

      subscriptionRef.current = channel;
      activeGamesMetrics.channelAdded({ name: `my_active_rooms_${session.userId}` });
    };

    setupSubscription();

    return () => {
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
  };
}

// Also expose as default export to avoid any named-export interop issues in bundlers.
export default useActiveGames;

