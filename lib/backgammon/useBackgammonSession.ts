"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import type { Move } from "@dingmoney/backgammon-engine";
import { applyOptimisticMove } from "@/lib/backgammon/optimisticMove";
import type { BackgammonPublicSnapshot } from "@/lib/backgammon/publicSnapshot";

export type { BackgammonPublicSnapshot } from "@/lib/backgammon/publicSnapshot";

type MutationResponse = {
  stateVersion: number;
  snapshot?: BackgammonPublicSnapshot;
};

const POLL_MS = 2000;

export function useBackgammonSession(sessionId: string) {
  const [snapshot, setSnapshot] = useState<BackgammonPublicSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isMutating, setIsMutating] = useState(false);

  const inflightRef = useRef<Promise<void> | null>(null);
  const snapshotRef = useRef<BackgammonPublicSnapshot | null>(null);
  const tokenRef = useRef<string | null>(null);
  const mutationChainRef = useRef(Promise.resolve());
  const mutatingRef = useRef(false);

  useEffect(() => {
    snapshotRef.current = snapshot;
  }, [snapshot]);

  const authFetch = useCallback(async (path: string, init?: RequestInit) => {
    let token = tokenRef.current;
    if (!token) {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      token = session?.access_token ?? null;
      tokenRef.current = token;
    }
    if (!token) {
      throw new Error("Not authenticated");
    }

    const response = await fetch(path, {
      ...init,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
        ...(init?.headers ?? {}),
      },
      cache: "no-store",
    });

    if (response.status === 401) {
      tokenRef.current = null;
    }

    const payload = await response.json();
    if (!response.ok || payload.ok === false) {
      throw new Error(payload.message || "Request failed");
    }
    return payload.data as MutationResponse;
  }, []);

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
  }, [authFetch, sessionId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    const channel = supabase.channel(`backgammon:${sessionId}`);
    channel
      .on("broadcast", { event: "state_changed" }, (message) => {
        if (mutatingRef.current) return;

        const incomingVersion = (
          message.payload as { stateVersion?: number } | undefined
        )?.stateVersion;
        const currentVersion = snapshotRef.current?.stateVersion;
        if (
          typeof incomingVersion === "number" &&
          typeof currentVersion === "number" &&
          incomingVersion <= currentVersion
        ) {
          return;
        }

        void refresh();
      })
      .subscribe();

    const poll = setInterval(() => {
      if (document.visibilityState === "visible" && !mutatingRef.current) {
        void refresh();
      }
    }, POLL_MS);

    const onVisible = () => {
      if (document.visibilityState === "visible" && !mutatingRef.current) {
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

  const runMutation = useCallback(
    (
      path: string,
      body: Record<string, unknown>,
      optimistic?: (current: BackgammonPublicSnapshot) => BackgammonPublicSnapshot | null
    ) => {
      const task = mutationChainRef.current.then(async () => {
        const current = snapshotRef.current;
        if (!current) return;

        const rollback = current;
        if (optimistic) {
          const preview = optimistic(current);
          if (preview) {
            setSnapshot(preview);
          }
        }

        mutatingRef.current = true;
        setIsMutating(true);
        setError(null);

        try {
          const data = await authFetch(path, {
            method: "POST",
            body: JSON.stringify({
              ...body,
              sessionId,
              expectedVersion: current.stateVersion,
            }),
          });

          if (data.snapshot) {
            setSnapshot(data.snapshot);
          } else {
            await refresh();
          }
        } catch (err) {
          setSnapshot(rollback);
          setError(err instanceof Error ? err.message : "Request failed");
          throw err;
        } finally {
          mutatingRef.current = false;
          setIsMutating(false);
        }
      });

      mutationChainRef.current = task.catch(() => {});
      return task;
    },
    [authFetch, refresh, sessionId]
  );

  const roll = useCallback(async () => {
    await runMutation("/api/player/backgammon/roll", {});
  }, [runMutation]);

  const move = useCallback(
    async (m: Move) => {
      await runMutation(
        "/api/player/backgammon/move",
        {
          from: m.from,
          to: m.to,
          dieUsed: m.dieUsed,
        },
        (current) => applyOptimisticMove(current, m)
      );
    },
    [runMutation]
  );

  const endTurn = useCallback(async () => {
    await runMutation("/api/player/backgammon/end-turn", {});
  }, [runMutation]);

  const undo = useCallback(async () => {
    await runMutation("/api/player/backgammon/undo", {});
  }, [runMutation]);

  return {
    snapshot,
    loading,
    error,
    isMutating,
    refresh,
    roll,
    move,
    endTurn,
    undo,
  };
}

export async function createBackgammonGame(): Promise<{ sessionId: string }> {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session) throw new Error("Not authenticated");

  const response = await fetch("/api/player/backgammon/create", {
    method: "POST",
    body: "{}",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${session.access_token}`,
    },
  });
  const payload = await response.json();
  if (!response.ok || payload.ok === false) {
    throw new Error(payload.message || "Request failed");
  }
  return payload.data;
}

export async function joinBackgammonGame(sessionId: string): Promise<void> {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session) throw new Error("Not authenticated");

  const response = await fetch("/api/player/backgammon/join", {
    method: "POST",
    body: JSON.stringify({ sessionId }),
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${session.access_token}`,
    },
  });
  const payload = await response.json();
  if (!response.ok || payload.ok === false) {
    throw new Error(payload.message || "Request failed");
  }
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
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session) throw new Error("Not authenticated");

  const response = await fetch("/api/player/backgammon/list", {
    headers: {
      Authorization: `Bearer ${session.access_token}`,
    },
    cache: "no-store",
  });
  const payload = await response.json();
  if (!response.ok || payload.ok === false) {
    throw new Error(payload.message || "Request failed");
  }
  return payload.data.games;
}
