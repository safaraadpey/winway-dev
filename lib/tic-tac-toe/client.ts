"use client";

import { useCallback, useEffect, useSyncExternalStore } from "react";
import { useSession } from "@/lib/contexts/SessionContext";
import { supabase } from "@/lib/supabaseClient";
import type { TicTacToeDifficulty } from "@/lib/tic-tac-toe/constants";
import type {
  ClaimMatchResult,
  StartMatchResult,
  TicTacToePublicSettings,
} from "@/lib/tic-tac-toe/types";

type SettingsStore = {
  userId: string | null;
  settings: TicTacToePublicSettings | null;
  loading: boolean;
  error: string | null;
};

const settingsListeners = new Set<() => void>();
let settingsStore: SettingsStore = {
  userId: null,
  settings: null,
  loading: false,
  error: null,
};
let settingsInflight: Promise<void> | null = null;

function emitSettingsChange() {
  for (const listener of settingsListeners) {
    listener();
  }
}

function subscribeSettings(listener: () => void) {
  settingsListeners.add(listener);
  return () => settingsListeners.delete(listener);
}

function getSettingsSnapshot(): SettingsStore {
  return settingsStore;
}

export class TicTacToeRequestError extends Error {
  constructor(
    message: string,
    public readonly code: string
  ) {
    super(message);
    this.name = "TicTacToeRequestError";
  }
}

async function authFetch<T>(path: string, init?: RequestInit): Promise<T> {
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
    throw new TicTacToeRequestError(
      payload.message || "Request failed.",
      typeof payload.error === "string" ? payload.error : "request_failed"
    );
  }

  return payload.data as T;
}

async function loadTicTacToeSettings(userId: string, force = false) {
  if (
    !force &&
    settingsInflight &&
    settingsStore.userId === userId
  ) {
    return settingsInflight;
  }

  settingsStore = {
    ...settingsStore,
    userId,
    loading: true,
    error: null,
  };
  emitSettingsChange();

  settingsInflight = (async () => {
    try {
      const data = await authFetch<TicTacToePublicSettings>(
        "/api/player/tic-tac-toe/settings"
      );
      settingsStore = {
        userId,
        settings: data,
        loading: false,
        error: null,
      };
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to load Tic-Tac-Toe settings.";
      settingsStore = {
        userId,
        settings: null,
        loading: false,
        error: message,
      };
      if (process.env.NODE_ENV !== "production") {
        console.error("[TicTacToe] settings load failed:", err);
      }
    } finally {
      settingsInflight = null;
      emitSettingsChange();
    }
  })();

  return settingsInflight;
}

export function useTicTacToeSettings() {
  const session = useSession();
  const snapshot = useSyncExternalStore(
    subscribeSettings,
    getSettingsSnapshot,
    getSettingsSnapshot
  );

  const refresh = useCallback(async () => {
    if (!session.authReady || !session.userId) {
      settingsStore = {
        userId: null,
        settings: null,
        loading: false,
        error: null,
      };
      emitSettingsChange();
      return;
    }

    await loadTicTacToeSettings(session.userId, true);
  }, [session.authReady, session.userId]);

  useEffect(() => {
    if (!session.authReady) {
      return;
    }

    if (!session.userId) {
      settingsStore = {
        userId: null,
        settings: null,
        loading: false,
        error: null,
      };
      emitSettingsChange();
      return;
    }

    if (
      settingsStore.userId === session.userId &&
      settingsStore.settings &&
      !settingsStore.error
    ) {
      return;
    }

    void loadTicTacToeSettings(session.userId);
  }, [
    session.authReady,
    session.userId,
    session.tokenVersion,
  ]);

  return {
    settings: snapshot.settings,
    loading: !session.authReady || snapshot.loading,
    error: snapshot.error,
    refresh,
  };
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
