"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import Image from "next/image";
import {
  createGame,
  playFullTurn,
  type MatchState,
} from "@dingmoney/tic-tac-toe-engine";
import dingCoinIcon from "@/src/assets/icons/ding-coin.png";
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
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M18 6L6 18M6 6l12 12"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
      />
    </svg>
  );
}

function GridIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <rect x="3" y="3" width="6" height="6" rx="1.5" fill="#2f9bff" />
      <rect x="9" y="3" width="6" height="6" rx="1.5" fill="#ff5f7d" />
      <rect x="15" y="3" width="6" height="6" rx="1.5" fill="#ffffff" opacity="0.85" />
      <rect x="3" y="9" width="6" height="6" rx="1.5" fill="#ffffff" opacity="0.85" />
      <rect x="9" y="9" width="6" height="6" rx="1.5" fill="#2f9bff" />
      <rect x="15" y="9" width="6" height="6" rx="1.5" fill="#ff5f7d" />
      <rect x="3" y="15" width="6" height="6" rx="1.5" fill="#ff5f7d" />
      <rect x="9" y="15" width="6" height="6" rx="1.5" fill="#ffffff" opacity="0.85" />
      <rect x="15" y="15" width="6" height="6" rx="1.5" fill="#2f9bff" />
    </svg>
  );
}

function TrophyIcon() {
  return (
    <svg
      className={styles.resultIcon}
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
    >
      <path d="M8 4h8v2a4 4 0 0 1-8 0V4Z" fill="#fbbf24" />
      <path
        d="M6 4H4a2 2 0 0 0 2 3m14-3h2a2 2 0 0 1-2 3M8 20h8M10 16h4v4h-4v-4Z"
        stroke="#fbbf24"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function PlayIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M9 7.5v9l8-4.5-8-4.5Z" fill="currentColor" />
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

  const instructionText = useMemo(() => {
    if (phase === "loading") return "در حال آماده‌سازی بازی...";
    if (phase === "claiming") return "در حال ثبت نتیجه...";
    if (phase === "result" && !claimResult) return "برای شروع دوباره تلاش کنید.";
    if (phase === "playing") {
      if (gameState?.currentTurn === "player") {
        return playerMoves.length === 0 ? "بازی رو شروع کن!" : "نوبت شما";
      }
      return "نوبت ماشین...";
    }
    return "پایان دست";
  }, [claimResult, gameState?.currentTurn, phase, playerMoves.length]);

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
  const showResultBanner = phase === "result" && claimResult && resultMessage;
  const showPrimaryAction = phase === "result";

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
            <div className={styles.titleGroup}>
              <span className={styles.titleIcon}>
                <GridIcon />
              </span>
              <h2 id="tic-tac-toe-title" className={styles.title}>
                دوز (Tic-Tac-Toe)
              </h2>
            </div>
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
            <span>جایزه برد</span>
            <Image
              src={dingCoinIcon}
              alt=""
              width={22}
              height={22}
              className={styles.prizeCoin}
              aria-hidden="true"
            />
            <span
              className={`${styles.prizeAmount} numeric-text numeric-text--16`}
              dir="ltr"
            >
              {winPrizeDing.toLocaleString("en-US")}
            </span>
            <span>دینگ</span>
          </div>

          {!showResultBanner && (
            <p className={styles.instructionText}>{instructionText}</p>
          )}

          <div
            className={`${styles.board} ${
              phase === "loading" || phase === "claiming" ? styles.boardLoading : ""
            }`}
          >
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

          {showResultBanner && (
            <div className={`${styles.resultBanner} ${resultClassName}`}>
              <TrophyIcon />
              <span>{resultMessage}</span>
            </div>
          )}

          {error && <p className={styles.errorText}>{error}</p>}

          <div className={styles.actions}>
            {showPrimaryAction && (
              <button
                type="button"
                className={styles.primaryButton}
                onClick={() => void beginHand(difficulty)}
                disabled={busy}
              >
                <PlayIcon />
                <span>{claimResult ? "دست بعدی" : "تلاش دوباره"}</span>
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
