"use client";

import { useState, useEffect, useRef } from "react";
import { supabase } from "../supabaseClient";
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

/**
 * Hook برای دریافت روم‌های فعال پلیر
 * شامل realtime subscription و polling fallback
 */
export function useActiveGames(): ActiveGames {
  console.log('[useActiveGames] Hook initialized');
  
  const [rooms, setRooms] = useState<ActiveRoom[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const isMountedRef = useRef<boolean>(false);
  const pollingIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const subscriptionRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const etagRef = useRef<string | null>(null);

  // Fetch function
  const fetchActiveRooms = async (
    skipEtag = false,
    source: ActiveGamesFetchSource = "manual"
  ): Promise<void> => {
    activeGamesMetrics.fetchStart(source, { skipEtag });
    try {
      const { data: { user }, error: userError } = await supabase.auth.getUser();
      
      if (userError || !user) {
        activeGamesMetrics.lifecycle("auth-missing", {
          stage: "fetchActiveRooms:getUser",
          userError: userError ? String((userError as any)?.message ?? userError) : null,
        });
        if (isMountedRef.current) {
          setError("کاربر پیدا نشد");
          setRooms([]);
          setLoading(false);
          activeGamesMetrics.patch({ reason: "no-user", action: "setEmptyRooms" });
        }
        activeGamesMetrics.fetchEnd(source, 200, { note: "no-user-early-return" });
        return;
      }

      const {
        data: { session },
      } = await supabase.auth.getSession();
      const token = session?.access_token || null;

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
        return;
      }

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const data = await response.json();
      const newEtag = response.headers.get("ETag");

      if (isMountedRef.current) {
        setRooms(data.rooms || []);
        setError(null);
        setLoading(false);
        if (newEtag) {
          etagRef.current = newEtag;
        }
        activeGamesMetrics.patch({
          reason: "fetch-success",
          roomsCount: Array.isArray(data?.rooms) ? data.rooms.length : null,
          hasEtag: Boolean(newEtag),
        });
      }
      activeGamesMetrics.fetchEnd(source, 200, {
        roomsCount: Array.isArray(data?.rooms) ? data.rooms.length : null,
      });
    } catch (err: any) {
      console.error("[useActiveGames] Fetch error:", err);
      if (isMountedRef.current) {
        setError(err.message || "خطا در دریافت روم‌های فعال");
        setLoading(false);
      }
      activeGamesMetrics.fetchEnd(source, "errored", { error: String(err?.message ?? err) });
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
      const { data: { user }, error: userError } = await supabase.auth.getUser();
      
      if (userError || !user) {
        console.log('[useActiveGames] No user found:', userError);
        activeGamesMetrics.lifecycle("auth-missing", {
          stage: "setupSubscription:getUser",
          userError: userError ? String((userError as any)?.message ?? userError) : null,
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
        .channel(`my_active_rooms_${user.id}`)
        .on(
          "postgres_changes",
          {
            event: "*",
            schema: "public",
            table: "tickets",
            filter: `player_user_id=eq.${user.id}`,
          },
          (payload) => {
            console.log("[useActiveGames] Tickets change detected:", payload.eventType);
            // Debounce: wait 500ms before refetching
            setTimeout(() => {
              if (isMountedRef.current) {
                // Realtime event is a strong signal; bypass ETag to avoid 304 collisions/stale validators.
                fetchActiveRooms(true, "realtime");
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
              const isActiveStatus = ["waiting", "playing", "live", "settling"].includes(newStatus);
              const wasActiveStatus = oldStatus && ["waiting", "playing", "live", "settling"].includes(oldStatus);
              
              // اگر روم به حالت فعال رفت یا از حالت فعال خارج شد، refetch کن
              if (isActiveStatus || wasActiveStatus) {
                console.log("[useActiveGames] Room status change detected:", roomId, oldStatus, "→", newStatus);
                setTimeout(() => {
                  if (isMountedRef.current) {
                    // Realtime event is a strong signal; bypass ETag to avoid 304 collisions/stale validators.
                    fetchActiveRooms(true, "realtime");
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
      activeGamesMetrics.channelAdded({ name: `my_active_rooms_${user.id}` });

      // Setup polling as safety-net
      pollingIntervalRef.current = setInterval(() => {
        if (isMountedRef.current) {
          fetchActiveRooms(false, "polling");
        }
      }, POLLING_INTERVAL);
      activeGamesMetrics.pollingStart(POLLING_INTERVAL);
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
      
      if (pollingIntervalRef.current) {
        clearInterval(pollingIntervalRef.current);
        pollingIntervalRef.current = null;
        activeGamesMetrics.pollingStop();
      }
      activeGamesMetrics.lifecycle("unmount");
    };
  }, []); // Empty deps - setup once

  return {
    rooms,
    loading,
    error,
  };
}

// Also expose as default export to avoid any named-export interop issues in bundlers.
export default useActiveGames;

