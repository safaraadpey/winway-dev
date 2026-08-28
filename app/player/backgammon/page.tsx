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

const LOBBY_POLL_MS = 5000;

function gameTitle(game: GameListItem): string {
  if (game.mySeat !== null) {
    return game.status === "waiting" ? "بازی شما — در انتظار حریف" : "بازی شما";
  }
  if (game.canJoin) return "در انتظار حریف";
  return "در حال اجرا";
}

function gameAction(game: GameListItem): string {
  if (game.mySeat !== null) return "ادامه";
  if (game.canJoin) return "ورود";
  return "تماشا";
}

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
    const poll = setInterval(() => {
      if (document.visibilityState === "visible") {
        void refresh();
      }
    }, LOBBY_POLL_MS);
    return () => clearInterval(poll);
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

  const handleOpen = async (game: GameListItem) => {
    try {
      setBusy(true);
      setError(null);
      if (game.canJoin) {
        await joinBackgammonGame(game.sessionId);
      }
      router.push(`/player/backgammon/${game.sessionId}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to open game");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className={styles.page}>
      <div>
        <h1 className={styles.title}>تخته‌نرد</h1>
        <p className={styles.subtitle}>
          بازی بسازید، به میز باز بپیوندید، یا بازی‌های در حال اجرا را تماشا کنید.
        </p>
      </div>

      <button
        type="button"
        className={styles.primaryButton}
        disabled={busy}
        onClick={() => void handleCreate()}
      >
        ساخت بازی
      </button>

      <button
        type="button"
        className={styles.secondaryButton}
        disabled={busy}
        onClick={() => void refresh()}
      >
        به‌روزرسانی لیست
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
            onClick={() => void handleOpen(game)}
          >
            <div className={styles.listItemRow}>
              <span>{gameTitle(game)}</span>
              <span className={styles.listAction}>{gameAction(game)}</span>
            </div>
            <div className={styles.meta} dir="ltr">
              players {game.participantCount}/2
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}
