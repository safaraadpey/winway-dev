"use client";

import React, { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useHeaderVisibility } from "@/lib/contexts/HeaderVisibilityContext";
import {
  createBackgammonGame,
  joinBackgammonGame,
  listBackgammonGames,
} from "@/lib/backgammon/useBackgammonSession";
import styles from "./backgammon.module.css";

type GameListItem = Awaited<ReturnType<typeof listBackgammonGames>>[number];

export default function BackgammonLobbyPage() {
  const router = useRouter();
  const { setShowBackButton, setOnBackClick } = useHeaderVisibility();
  const [games, setGames] = useState<GameListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      setError(null);
      const rows = await listBackgammonGames();
      setGames(rows);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load games");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    setShowBackButton(true);
    setOnBackClick(() => () => router.push("/player/lobby"));
    return () => {
      setShowBackButton(false);
      setOnBackClick(null);
    };
  }, [router, setOnBackClick, setShowBackButton]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const handleCreate = async () => {
    try {
      setBusy(true);
      setError(null);
      const { sessionId } = await createBackgammonGame();
      router.push(`/player/backgammon/${sessionId}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create game");
    } finally {
      setBusy(false);
    }
  };

  const handleJoin = async (sessionId: string) => {
    try {
      setBusy(true);
      setError(null);
      await joinBackgammonGame(sessionId);
      router.push(`/player/backgammon/${sessionId}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to join game");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className={styles.page}>
      <div>
        <h1 className={styles.title}>Backgammon Beta</h1>
        <p className={styles.subtitle}>Create or join a 2-player match.</p>
      </div>

      <button
        type="button"
        className={styles.primaryButton}
        disabled={busy}
        onClick={() => void handleCreate()}
      >
        Create game
      </button>

      <button
        type="button"
        className={styles.secondaryButton}
        disabled={busy}
        onClick={() => void refresh()}
      >
        Refresh list
      </button>

      {error ? <div className={styles.error}>{error}</div> : null}
      {loading ? <div className={styles.loading}>Loading…</div> : null}

      <div className={styles.list}>
        {games.map((game) => (
          <button
            key={game.sessionId}
            type="button"
            className={styles.listItem}
            disabled={busy}
            onClick={() => void handleJoin(game.sessionId)}
          >
            <div>{game.status === "waiting" ? "Waiting room" : "Active match"}</div>
            <div className={styles.meta} dir="ltr">
              players {game.participantCount}/2 · v{game.stateVersion}
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}
