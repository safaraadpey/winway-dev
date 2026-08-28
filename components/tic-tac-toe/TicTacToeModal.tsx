"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  createGame,
  playFullTurn,
  type MatchState,
} from "@dingmoney/tic-tac-toe-engine";
import { HARD_EXIT_EVENT } from "@/lib/auth/hardExit";
import { useBalancesContext } from "@/lib/contexts/BalancesContext";
import type { TicTacToeDifficulty } from "@/lib/tic-tac-toe/constants";
import {
  claimTicTacToeMatch,
  startTicTacToeMatch,
} from "@/lib/tic-tac-toe/client";
import type { ClaimMatchResult } from "@/lib/tic-tac-toe/types";
import styles from "./TicTacToeModal.module.css";

type Phase = "setup" | "playing" | "claiming" | "result";

type TicTacToeModalProps = {
  open: boolean;
  onClose: () => void;
  winPrizeDing: number;
};

const DIFFICULTY_LABELS: Record<TicTacToeDifficulty, string> = {
  easy: "آسان",
  medium: "متوسط",
  hard: "سخت",
};

function CloseIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M18 6L6 18M6 6l12 12"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
      />
    </svg>
  );
}

export default function TicTacToeModal({
  open,
  onClose,
  winPrizeDing,
}: TicTacToeModalProps) {
  const { refreshAllBalances } = useBalancesContext();
  const [phase, setPhase] = useState<Phase>("setup");
  const [difficulty, setDifficulty] = useState<TicTacToeDifficulty>("medium");
  const [matchId, setMatchId] = useState<string | null>(null);
  const [gameState, setGameState] = useState<MatchState | null>(null);
  const [playerMoves, setPlayerMoves] = useState<number[]>([]);
  const [claimResult, setClaimResult] = useState<ClaimMatchResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const resetLocal = useCallback(() => {
    setPhase("setup");
    setMatchId(null);
    setGameState(null);
    setPlayerMoves([]);
    setClaimResult(null);
    setBusy(false);
    setError(null);
  }, []);

  const handleClose = useCallback(() => {
    resetLocal();
    onClose();
  }, [onClose, resetLocal]);

  useEffect(() => {
    if (!open) return;
    const onHardExit = () => handleClose();
    window.addEventListener(HARD_EXIT_EVENT, onHardExit);
    return () => window.removeEventListener(HARD_EXIT_EVENT, onHardExit);
  }, [open, handleClose]);

  useEffect(() => {
    if (!open) {
      resetLocal();
    }
  }, [open, resetLocal]);

  const resultMessage = useMemo(() => {
    if (!claimResult) return null;
    if (claimResult.outcome === "win") {
      if (claimResult.paidDing > 0) {
        return `بردید! ${claimResult.paidDing.toLocaleString("en-US")} دینگ به حساب شما اضافه شد.`;
      }
      return "بردید! امروز سقف جایزه پر شده — دینگی اضافه نشد.";
    }
    if (claimResult.outcome === "draw") return "مساوی! جایزه‌ای پرداخت نشد.";
    return "باختید. جایزه‌ای پرداخت نشد.";
  }, [claimResult]);

  const resultClassName = useMemo(() => {
    if (!claimResult) return styles.resultDraw;
    if (claimResult.outcome === "win") return styles.resultWin;
    if (claimResult.outcome === "lose") return styles.resultLose;
    return styles.resultDraw;
  }, [claimResult]);

  const startHand = async () => {
    try {
      setBusy(true);
      setError(null);
      const started = await startTicTacToeMatch(difficulty);
      const { state } = createGame({
        seed: started.seed,
        difficulty: started.difficulty,
      });
      setMatchId(started.matchId);
      setGameState(state);
      setPlayerMoves([]);
      setClaimResult(null);
      setPhase("playing");
    } catch (err) {
      setError(err instanceof Error ? err.message : "خطا در شروع بازی");
    } finally {
      setBusy(false);
    }
  };

  const settleHand = async (moves: number[], currentMatchId: string) => {
    try {
      setPhase("claiming");
      setBusy(true);
      const result = await claimTicTacToeMatch({
        matchId: currentMatchId,
        playerMoves: moves,
      });
      setClaimResult(result);
      if (result.paidDing > 0) {
        await refreshAllBalances?.();
      }
      setPhase("result");
    } catch (err) {
      setError(err instanceof Error ? err.message : "خطا در ثبت نتیجه");
      setPhase("result");
    } finally {
      setBusy(false);
    }
  };

  const handleCellClick = async (cell: number) => {
    if (phase !== "playing" || !gameState || !matchId || busy) return;
    if (gameState.board[cell] !== null) return;

    try {
      setBusy(true);
      setError(null);
      const nextMoves = [...playerMoves, cell];
      const { state } = playFullTurn(gameState, cell);
      setGameState(state);
      setPlayerMoves(nextMoves);

      if (state.status === "finished") {
        await settleHand(nextMoves, matchId);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "حرکت نامعتبر");
    } finally {
      setBusy(false);
    }
  };

  if (!open) return null;

  return (
    <div
      className={styles.overlay}
      onClick={handleClose}
      role="presentation"
    >
      <div
        className={styles.modal}
        role="dialog"
        aria-modal="true"
        aria-labelledby="tic-tac-toe-title"
        onClick={(event) => event.stopPropagation()}
      >
        <div className={styles.header}>
          <h2 id="tic-tac-toe-title" className={styles.title}>
            دوز (Tic-Tac-Toe)
          </h2>
          <button
            type="button"
            className={styles.closeButton}
            onClick={handleClose}
            aria-label="بستن"
          >
            <CloseIcon />
          </button>
        </div>

        <p className={styles.subtitle}>
          Player vs Machine — شما X هستید، ماشین O.
        </p>

        {(phase === "setup" || phase === "result") && (
          <>
            <div className={styles.difficultyRow}>
              {(Object.keys(DIFFICULTY_LABELS) as TicTacToeDifficulty[]).map(
                (level) => (
                  <button
                    key={level}
                    type="button"
                    className={`${styles.difficultyButton} ${
                      difficulty === level ? styles.difficultyButtonActive : ""
                    }`}
                    onClick={() => setDifficulty(level)}
                    disabled={busy}
                  >
                    {DIFFICULTY_LABELS[level]}
                  </button>
                )
              )}
            </div>

            <div className={styles.prizeRow}>
              <span>جایزه برد:</span>
              <span className={`${styles.prizeAmount} numeric-text numeric-text--16`} dir="ltr">
                {winPrizeDing.toLocaleString("en-US")}
              </span>
              <span>دینگ</span>
            </div>
          </>
        )}

        {(phase === "playing" || phase === "claiming" || phase === "result") &&
          gameState && (
            <>
              <p className={styles.statusText}>
                {phase === "claiming"
                  ? "در حال ثبت نتیجه..."
                  : phase === "playing"
                    ? gameState.currentTurn === "player"
                      ? "نوبت شما"
                      : "نوبت ماشین..."
                    : "پایان دست"}
              </p>
              <div className={styles.board}>
                {gameState.board.map((mark, index) => (
                  <button
                    key={index}
                    type="button"
                    className={`${styles.cell} ${
                      mark === "X"
                        ? styles.cellPlayer
                        : mark === "O"
                          ? styles.cellMachine
                          : ""
                    }`}
                    onClick={() => void handleCellClick(index)}
                    disabled={
                      busy ||
                      phase !== "playing" ||
                      mark !== null ||
                      gameState.currentTurn !== "player"
                    }
                    aria-label={`خانه ${index + 1}`}
                  >
                    {mark ?? ""}
                  </button>
                ))}
              </div>
            </>
          )}

        {phase === "result" && claimResult && resultMessage && (
          <div className={`${styles.resultBanner} ${resultClassName}`}>
            {resultMessage}
          </div>
        )}

        {error && <p className={styles.errorText}>{error}</p>}

        <div className={styles.actions}>
          {phase === "setup" && (
            <button
              type="button"
              className={styles.primaryButton}
              onClick={() => void startHand()}
              disabled={busy}
            >
              شروع بازی
            </button>
          )}

          {phase === "result" && (
            <button
              type="button"
              className={styles.primaryButton}
              onClick={() => {
                resetLocal();
              }}
              disabled={busy}
            >
              دست بعدی
            </button>
          )}

          <button
            type="button"
            className={styles.secondaryButton}
            onClick={handleClose}
            disabled={busy && phase === "claiming"}
          >
            بستن
          </button>
        </div>
      </div>
    </div>
  );
}
