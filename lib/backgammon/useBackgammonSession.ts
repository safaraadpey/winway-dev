"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import type { Move } from "@dingmoney/backgammon-engine";

export type BackgammonPublicSnapshot = {
  sessionId: string;
  status: string;
  stateVersion: number;
  matchStatus: string;
  currentTurn: 0 | 1 | null;
  currentTurnSeat: "white" | "black" | null;
  board: {
    points: Array<{ white: number; black: number }>;
    bar: { white: number; black: number };
    borneOff: { white: number; black: number };
  };
  dice: {
    values: [number, number] | null;
    remaining: number[];
    rolled: boolean;
  };
  winner: 0 | 1 | null;
  winKind: string | null;
  mySeat: 0 | 1 | null;
  myUserId: string;
  players: Array<{ userId: string; seat: number; seatLabel: string }>;
  opponentUserId: string | null;
  legalMoves: Move[];
  isMyTurn: boolean;
  canRoll: boolean;
  canUndo: boolean;
};

async function authFetch(path: string, init?: RequestInit) {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session) {
    throw new Error("Not authenticated");
  }

  const response = await fetch(path, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${session.access_token}`,
      ...(init?.headers ?? {}),
    },
    cache: "no-store",
  });

  const payload = await response.json();
  if (!response.ok || payload.ok === false) {
    throw new Error(payload.message || "Request failed");
  }
  return payload.data;
}

export function useBackgammonSession(sessionId: string) {
  const [snapshot, setSnapshot] = useState<BackgammonPublicSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const inflightRef = useRef<Promise<void> | null>(null);

  const refresh = useCallback(async () => {
    if (inflightRef.current) {
      await inflightRef.current;
      return;
    }

    const task = (async () => {
      try {
        setError(null);
        const data = await authFetch(
          `/api/player/backgammon/state?sessionId=${encodeURIComponent(sessionId)}`
        );
        setSnapshot(data as BackgammonPublicSnapshot);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load game");
      } finally {
        setLoading(false);
      }
    })();

    inflightRef.current = task;
    try {
      await task;
    } finally {
      inflightRef.current = null;
    }
  }, [sessionId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    const channel = supabase.channel(`backgammon:${sessionId}`);
    channel
      .on("broadcast", { event: "state_changed" }, () => {
        void refresh();
      })
      .subscribe();

    const poll = setInterval(() => {
      if (document.visibilityState === "visible") {
        void refresh();
      }
    }, 5000);

    const onVisible = () => {
      if (document.visibilityState === "visible") {
        void refresh();
      }
    };
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      clearInterval(poll);
      document.removeEventListener("visibilitychange", onVisible);
      void supabase.removeChannel(channel);
    };
  }, [sessionId, refresh]);

  const mutate = useCallback(
    async (path: string, body: Record<string, unknown>) => {
      await authFetch(path, {
        method: "POST",
        body: JSON.stringify(body),
      });
      await refresh();
    },
    [refresh]
  );

  const roll = useCallback(async () => {
    if (!snapshot) return;
    await mutate("/api/player/backgammon/roll", {
      sessionId,
      expectedVersion: snapshot.stateVersion,
    });
  }, [mutate, sessionId, snapshot]);

  const move = useCallback(
    async (m: Move) => {
      if (!snapshot) return;
      await mutate("/api/player/backgammon/move", {
        sessionId,
        expectedVersion: snapshot.stateVersion,
        from: m.from,
        to: m.to,
        dieUsed: m.dieUsed,
      });
    },
    [mutate, sessionId, snapshot]
  );

  const endTurn = useCallback(async () => {
    if (!snapshot) return;
    await mutate("/api/player/backgammon/end-turn", {
      sessionId,
      expectedVersion: snapshot.stateVersion,
    });
  }, [mutate, sessionId, snapshot]);

  const undo = useCallback(async () => {
    if (!snapshot) return;
    await mutate("/api/player/backgammon/undo", {
      sessionId,
      expectedVersion: snapshot.stateVersion,
    });
  }, [mutate, sessionId, snapshot]);

  return {
    snapshot,
    loading,
    error,
    refresh,
    roll,
    move,
    endTurn,
    undo,
  };
}

export async function createBackgammonGame(): Promise<{ sessionId: string }> {
  return authFetch("/api/player/backgammon/create", { method: "POST", body: "{}" });
}

export async function joinBackgammonGame(sessionId: string): Promise<void> {
  await authFetch("/api/player/backgammon/join", {
    method: "POST",
    body: JSON.stringify({ sessionId }),
  });
}

export async function listBackgammonGames(): Promise<
  Array<{
    sessionId: string;
    status: string;
    participantCount: number;
    stateVersion: number;
    createdAt: string;
    mySeat: 0 | 1 | null;
  }>
> {
  const data = await authFetch("/api/player/backgammon/list");
  return data.games;
}
