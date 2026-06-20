"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useSession } from "@/lib/contexts/SessionContext";
import { supabase } from "@/lib/supabaseClient";
import { isHardExiting } from "@/lib/auth/hardExit";

type LobbySnapshotGroup = { players?: number };

export type MenuLiveCounts = {
  gameRoomActivePlayers: number;
  tournamentRegistrants: number;
};

const POLL_MS = 15000;

export function useMenuLiveCounts(): MenuLiveCounts {
  const session = useSession();
  const [counts, setCounts] = useState<MenuLiveCounts>({
    gameRoomActivePlayers: 0,
    tournamentRegistrants: 0,
  });
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearTimer = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  useEffect(() => {
    let stopped = false;

    const schedule = (delayMs: number) => {
      clearTimer();
      if (stopped) return;
      timerRef.current = setTimeout(() => {
        void tick();
      }, delayMs);
    };

    async function fetchTournamentRegistrants(): Promise<number> {
      const { data: tournaments, error: tournamentsError } = await supabase
        .from("tournaments")
        .select("id")
        .eq("status", "registration_open");

      if (tournamentsError || !tournaments?.length) {
        return 0;
      }

      const tournamentIds = tournaments.map((row) => row.id);
      const { data: entries, error: entriesError } = await supabase
        .from("tournament_entries")
        .select("id")
        .in("tournament_id", tournamentIds)
        .eq("status", "created");

      if (entriesError || !entries?.length) {
        return 0;
      }

      return entries.length;
    }

    async function fetchLobbyActivePlayers(accessToken: string): Promise<number> {
      const res = await fetch("/api/player/lobby-snapshot", {
        method: "GET",
        headers: { Authorization: `Bearer ${accessToken}` },
        cache: "no-store",
      });

      if (!res.ok) {
        return 0;
      }

      const json = (await res.json()) as {
        roomGroups?: { groups?: LobbySnapshotGroup[] };
      };
      const groups = json?.roomGroups?.groups ?? [];
      return groups.reduce((sum, group) => sum + (Number(group.players) || 0), 0);
    }

    async function tick() {
      if (stopped || isHardExiting()) return;
      if (typeof document !== "undefined" && document.visibilityState === "hidden") {
        schedule(POLL_MS);
        return;
      }

      try {
        const [gameRoomActivePlayers, tournamentRegistrants] = await Promise.all([
          session.authReady && session.accessToken
            ? fetchLobbyActivePlayers(session.accessToken)
            : Promise.resolve(0),
          fetchTournamentRegistrants(),
        ]);

        if (!stopped) {
          setCounts({ gameRoomActivePlayers, tournamentRegistrants });
        }
      } catch (error) {
        console.error("[useMenuLiveCounts] fetch failed:", error);
      } finally {
        schedule(POLL_MS);
      }
    }

    void tick();

    const onVisibility = () => {
      if (document.visibilityState === "visible") {
        void tick();
      }
    };
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      stopped = true;
      clearTimer();
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [clearTimer, session.accessToken, session.authReady]);

  return counts;
}
