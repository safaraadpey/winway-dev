"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
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

type Phase = "loading" | "playing" | "claiming" | "result";

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

const EMPTY_BOARD: MatchState["board"] = [
  null,
  null,
  null,
  null,
  null,
  null,
  null,
  null,
  null,
];

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
  const [phase, setPhase] = useState<Phase>("loading");
  const [difficulty, setDifficulty] = useState<TicTacToeDifficulty>("medium");
  const [matchId, setMatchId] = useState<string | null>(null);
  const [gameState, setGameState] = useState<MatchState | null>(null);
  const [playerMoves, setPlayerMoves] = useState<number[]>([]);
  const [claimResult, setClaimResult] = useState<ClaimMatchResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mounted, setMounted] = useState(false);
  const beginHandRef = useRef<(level?: TicTacToeDifficulty) => Promise<void>>(
    async () => {}
  );

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!open) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [open]);

  const resetLocal = useCallback(() => {
    setPhase("loading");
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

  const beginHand = useCallback(
    async (level: TicTacToeDifficulty = difficulty) => {
      try {
        setBusy(true);
        setError(null);
        setPhase("loading");
        setClaimResult(null);
        setPlayerMoves([]);
        setMatchId(null);
        setGameState(null);

        const started = await startTicTacToeMatch(level);
        const { state } = createGame({
          seed: started.seed,
          difficulty: started.difficulty,
        });

        setMatchId(started.matchId);
        setGameState(state);
        setDifficulty(started.difficulty);
        setPhase("playing");
      } catch (err) {
        setError(err instanceof Error ? err.message : "خطا در شروع بازی");
        setPhase("result");
      } finally {
        setBusy(false);
      }
    },
    [difficulty]
  );

  beginHandRef.current = beginHand;

  useEffect(() => {
    if (!open) return;
    const onHardExit = () => handleClose();
    window.addEventListener(HARD_EXIT_EVENT, onHardExit);
    return () => window.removeEventListener(HARD_EXIT_EVENT, onHardExit);
  }, [open, handleClose]);

  useEffect(() => {
    if (!open) {
      resetLocal();
      return;
    }

    let cancelled = false;
    void (async () => {
      await beginHandRef.current(difficulty);
      if (cancelled) return;
    })();

    return () => {
      cancelled = true;
    };
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

  const boardCells = gameState?.board ?? EMPTY_BOARD;
  const canPickDifficulty = phase === "result" || phase === "loading";
  const statusText =
    phase === "loading"
      ? "در حال آماده‌سازی بازی..."
      : phase === "claiming"
        ? "در حال ثبت نتیجه..."
        : phase === "playing"
          ? gameState?.currentTurn === "player"
            ? "نوبت شما"
            : "نوبت ماشین..."
          : "پایان دست";

  if (!open || !mounted || typeof document === "undefined") return null;

  return createPortal(
    <div
      className={styles.overlay}
      onClick={handleClose}
      role="presentation"
    >
      <div className={styles.shellFrame}>
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
                  disabled={busy || !canPickDifficulty}
                >
                  {DIFFICULTY_LABELS[level]}
                </button>
              )
            )}
          </div>

          <div className={styles.prizeRow}>
            <span>جایزه برد:</span>
            <span
              className={`${styles.prizeAmount} numeric-text numeric-text--16`}
              dir="ltr"
            >
              {winPrizeDing.toLocaleString("en-US")}
            </span>
            <span>دینگ</span>
          </div>

          <p className={styles.statusText}>{statusText}</p>

          <div className={styles.board}>
            {boardCells.map((mark, index) => (
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
                  gameState?.currentTurn !== "player"
                }
                aria-label={`خانه ${index + 1}`}
              >
                {mark ?? ""}
              </button>
            ))}
          </div>

          {phase === "result" && claimResult && resultMessage && (
            <div className={`${styles.resultBanner} ${resultClassName}`}>
              {resultMessage}
            </div>
          )}

          {error && <p className={styles.errorText}>{error}</p>}

          <div className={styles.actions}>
            {phase === "result" && (
              <button
                type="button"
                className={styles.primaryButton}
                onClick={() => void beginHand(difficulty)}
                disabled={busy}
              >
                {claimResult ? "دست بعدی" : "تلاش دوباره"}
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
    </div>,
    document.body
  );
}
