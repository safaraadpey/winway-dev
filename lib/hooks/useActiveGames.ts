"use client";

import { useState, useEffect, useRef } from "react";
import { supabase } from "../supabaseClient";

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
  const fetchActiveRooms = async (skipEtag = false): Promise<void> => {
    try {
      const { data: { user }, error: userError } = await supabase.auth.getUser();
      
      if (userError || !user) {
        if (isMountedRef.current) {
          setError("کاربر پیدا نشد");
          setRooms([]);
          setLoading(false);
        }
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
      }
    } catch (err: any) {
      console.error("[useActiveGames] Fetch error:", err);
      if (isMountedRef.current) {
        setError(err.message || "خطا در دریافت روم‌های فعال");
        setLoading(false);
      }
    }
  };

  // Setup subscription
  useEffect(() => {
    console.log('[useActiveGames] useEffect triggered - setting up...');
    isMountedRef.current = true;

    const setupSubscription = async () => {
      console.log('[useActiveGames] setupSubscription started');
      const { data: { user }, error: userError } = await supabase.auth.getUser();
      
      if (userError || !user) {
        console.log('[useActiveGames] No user found:', userError);
        if (isMountedRef.current) {
          setLoading(false);
        }
        return;
      }

      console.log('[useActiveGames] User found, fetching active rooms...');
      // Initial fetch
      await fetchActiveRooms(true);

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
                fetchActiveRooms(true);
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
                    fetchActiveRooms(true);
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

      // Setup polling as safety-net
      pollingIntervalRef.current = setInterval(() => {
        if (isMountedRef.current) {
          fetchActiveRooms();
        }
      }, POLLING_INTERVAL);
    };

    setupSubscription();

    return () => {
      isMountedRef.current = false;
      
      if (subscriptionRef.current) {
        supabase.removeChannel(subscriptionRef.current);
        subscriptionRef.current = null;
      }
      
      if (pollingIntervalRef.current) {
        clearInterval(pollingIntervalRef.current);
        pollingIntervalRef.current = null;
      }
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

