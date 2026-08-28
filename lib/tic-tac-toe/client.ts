"use client";

import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import type { TicTacToeDifficulty } from "@/lib/tic-tac-toe/constants";
import type {
  ClaimMatchResult,
  StartMatchResult,
  TicTacToePublicSettings,
} from "@/lib/tic-tac-toe/types";

async function authFetch<T>(
  path: string,
  init?: RequestInit
): Promise<T> {
  const {
    data: { session },
    error,
  } = await supabase.auth.getSession();

  if (error || !session) {
    throw new Error("Authentication required.");
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
    throw new Error(payload.message || "Request failed.");
  }

  return payload.data as T;
}

export function useTicTacToeSettings() {
  const [settings, setSettings] = useState<TicTacToePublicSettings | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      setLoading(true);
      const data = await authFetch<TicTacToePublicSettings>(
        "/api/player/tic-tac-toe/settings"
      );
      setSettings(data);
    } catch {
      setSettings(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return { settings, loading, refresh };
}

export async function startTicTacToeMatch(
  difficulty: TicTacToeDifficulty
): Promise<StartMatchResult> {
  return authFetch<StartMatchResult>("/api/player/tic-tac-toe/start", {
    method: "POST",
    body: JSON.stringify({ difficulty }),
  });
}

export async function claimTicTacToeMatch(input: {
  matchId: string;
  playerMoves: number[];
}): Promise<ClaimMatchResult> {
  return authFetch<ClaimMatchResult>("/api/player/tic-tac-toe/claim", {
    method: "POST",
    body: JSON.stringify(input),
  });
}
