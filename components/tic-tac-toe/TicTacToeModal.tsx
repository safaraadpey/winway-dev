"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import Image from "next/image";
import { AnimatePresence, motion } from "framer-motion";
import {
  createGame,
  playFullTurn,
  type MatchState,
} from "@dingmoney/tic-tac-toe-engine";
import dingCoinIcon from "@/src/assets/icons/ding-coin.png";
import { HARD_EXIT_EVENT } from "@/lib/auth/hardExit";
import { useBalancesContext } from "@/lib/contexts/BalancesContext";
import {
  getTicTacToeWinPrizeDing,
  TIC_TAC_TOE_HARD_MILESTONE_BONUS_DING,
  type TicTacToeDifficulty,
} from "@/lib/tic-tac-toe/constants";
import {
  claimTicTacToeMatch,
  startTicTacToeMatch,
  TicTacToeRequestError,
  useTicTacToeSettings,
} from "@/lib/tic-tac-toe/client";
import {
  applyOutcomeToProgress,
  difficultyAfterProgressionEvent,
  mapProgressStats,
  type TicTacToeProgressStats,
  type TicTacToeProgressionEvent,
} from "@/lib/tic-tac-toe/progress";
import type { ClaimMatchResult } from "@/lib/tic-tac-toe/types";
import styles from "./TicTacToeModal.module.css";

type Phase = "playing" | "result";

type TicTacToeModalProps = {
  open: boolean;
  onClose: () => void;
};

const DIFFICULTY_LABELS: Record<TicTacToeDifficulty, string> = {
  easy: "آسان",
  medium: "متوسط",
  hard: "سخت",
};

const DIFFICULTY_ORDER: TicTacToeDifficulty[] = ["hard", "medium", "easy"];

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

const WIN_NEXT_HAND_MS = 1500;
const LOSE_NEXT_HAND_MS = 900;
const DRAW_MESSAGE_MS = 1800;
const MILESTONE_NEXT_HAND_MS = 3200;
const PENALTY_MESSAGE_MS = 1400;
const COIN_FLY_DELAY_MS = 120;
const COIN_FLY_DURATION_MS = 720;

type TierCelebrationKind = "easy_completed" | "hard_milestone";

type FlyCoinState = {
  startX: number;
  startY: number;
  endX: number;
  endY: number;
};

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

function CellCrossIcon() {
  return (
    <svg
      className={styles.cellIcon}
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
    >
      <path
        d="M7 7l10 10M17 7L7 17"
        stroke="currentColor"
        strokeWidth="3.5"
        strokeLinecap="round"
      />
    </svg>
  );
}

function CellCircleIcon() {
  return (
    <svg
      className={styles.cellIcon}
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
    >
      <circle
        cx="12"
        cy="12"
        r="8"
        stroke="currentColor"
        strokeWidth="3.5"
        fill="none"
      />
    </svg>
  );
}

function CellMarkIcon({ mark }: { mark: "X" | "O" }) {
  return mark === "X" ? <CellCrossIcon /> : <CellCircleIcon />;
}

export default function TicTacToeModal({
  open,
  onClose,
}: TicTacToeModalProps) {
  const { refreshAllBalances, triggerDingCelebrate } = useBalancesContext();
  const { settings, refresh: refreshTicTacToeSettings } = useTicTacToeSettings();
  const [phase, setPhase] = useState<Phase>("playing");
  const [difficulty, setDifficulty] = useState<TicTacToeDifficulty>("easy");
  const [progressStats, setProgressStats] = useState<TicTacToeProgressStats | null>(
    null
  );
  const [handBootstrapped, setHandBootstrapped] = useState(false);
  const [matchId, setMatchId] = useState<string | null>(null);
  const [gameState, setGameState] = useState<MatchState | null>(null);
  const [playerMoves, setPlayerMoves] = useState<number[]>([]);
  const [claimResult, setClaimResult] = useState<ClaimMatchResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mounted, setMounted] = useState(false);
  const [showResultInPrizeRow, setShowResultInPrizeRow] = useState(false);
  const [flyCoin, setFlyCoin] = useState<FlyCoinState | null>(null);
  const [hidePrizeCoin, setHidePrizeCoin] = useState(false);
  const [winHighlightDismissed, setWinHighlightDismissed] = useState(false);
  const [showLoseFlash, setShowLoseFlash] = useState(false);
  const [tierCelebration, setTierCelebration] = useState<TierCelebrationKind | null>(
    null
  );
  const [prizeRowMessage, setPrizeRowMessage] = useState<string | null>(null);
  const resultPrizeRowTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const coinFlyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [flyCoinKey, setFlyCoinKey] = useState(0);
  const prizeCoinRef = useRef<HTMLSpanElement>(null);
  const beginHandRequestIdRef = useRef(0);
  const claimGenerationRef = useRef(0);
  const progressStatsRef = useRef<TicTacToeProgressStats | null>(null);
  const beginHandRef = useRef<(level?: TicTacToeDifficulty) => Promise<void>>(
    async () => {}
  );

  const clearResultPrizeRowTimer = useCallback(() => {
    if (resultPrizeRowTimerRef.current) {
      clearTimeout(resultPrizeRowTimerRef.current);
      resultPrizeRowTimerRef.current = null;
    }
  }, []);

  const clearCoinFlyTimer = useCallback(() => {
    if (coinFlyTimerRef.current) {
      clearTimeout(coinFlyTimerRef.current);
      coinFlyTimerRef.current = null;
    }
  }, []);

  useEffect(() => {
    setMounted(true);
  }, []);

  const modalRootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;

    const html = document.documentElement;
    const body = document.body;

    const savedHtmlOverflow = html.style.overflow;
    const savedBodyOverflow = body.style.overflow;
    const savedBodyOverflowY = body.style.overflowY;

    html.style.overflow = "hidden";
    body.style.overflow = "hidden";
    body.style.overflowY = "hidden";

    const lockedElements: Array<{
      el: HTMLElement;
      overflow: string;
      overflowY: string;
    }> = [];

    const lockScrollableElement = (el: HTMLElement) => {
      lockedElements.push({
        el,
        overflow: el.style.overflow,
        overflowY: el.style.overflowY,
      });
      el.style.overflow = "hidden";
      el.style.overflowY = "hidden";
    };

    const layoutRoot = document.querySelector(".player-layout-root");
    if (layoutRoot instanceof HTMLElement) {
      lockScrollableElement(layoutRoot);
      layoutRoot.querySelectorAll("*").forEach((node) => {
        if (!(node instanceof HTMLElement)) return;
        const { overflowY } = window.getComputedStyle(node);
        if (overflowY === "auto" || overflowY === "scroll") {
          lockScrollableElement(node);
        }
      });
    }

    const preventBackgroundScroll = (event: Event) => {
      const modalRoot = modalRootRef.current;
      const target = event.target;
      if (modalRoot && target instanceof Node && modalRoot.contains(target)) {
        return;
      }
      event.preventDefault();
    };

    document.addEventListener("touchmove", preventBackgroundScroll, {
      passive: false,
    });
    document.addEventListener("wheel", preventBackgroundScroll, { passive: false });

    return () => {
      document.removeEventListener("touchmove", preventBackgroundScroll);
      document.removeEventListener("wheel", preventBackgroundScroll);

      html.style.overflow = savedHtmlOverflow;
      body.style.overflow = savedBodyOverflow;
      body.style.overflowY = savedBodyOverflowY;

      for (const { el, overflow, overflowY } of lockedElements) {
        el.style.overflow = overflow;
        el.style.overflowY = overflowY;
      }
    };
  }, [open]);

  const resetLocal = useCallback(() => {
    beginHandRequestIdRef.current += 1;
    claimGenerationRef.current += 1;
    setPhase("playing");
    setMatchId(null);
    setGameState(null);
    setPlayerMoves([]);
    setClaimResult(null);
    setBusy(false);
    setError(null);
    setShowResultInPrizeRow(false);
    setFlyCoin(null);
    setHidePrizeCoin(false);
    setWinHighlightDismissed(false);
    setShowLoseFlash(false);
    setTierCelebration(null);
    setPrizeRowMessage(null);
    setProgressStats(null);
    setHandBootstrapped(false);
    clearResultPrizeRowTimer();
    clearCoinFlyTimer();
  }, [clearCoinFlyTimer, clearResultPrizeRowTimer]);

  const handleClose = useCallback(() => {
    resetLocal();
    onClose();
  }, [onClose, resetLocal]);

  const scheduleWinCoinFly = useCallback(() => {
    clearCoinFlyTimer();
    coinFlyTimerRef.current = setTimeout(() => {
      coinFlyTimerRef.current = null;
      const src = prizeCoinRef.current?.getBoundingClientRect();
      const tgt = document
        .querySelector("[data-wallet-ding-target]")
        ?.getBoundingClientRect();

      if (!src || !tgt) {
        setWinHighlightDismissed(true);
        setGameState(null);
        setPlayerMoves([]);
        triggerDingCelebrate?.();
        return;
      }

      setWinHighlightDismissed(true);
      setHidePrizeCoin(true);
      setFlyCoinKey((key) => key + 1);
      setFlyCoin({
        startX: src.left + src.width / 2,
        startY: src.top + src.height / 2,
        endX: tgt.left + tgt.width / 2 + 14,
        endY: tgt.top + tgt.height / 2,
      });
    }, COIN_FLY_DELAY_MS);
  }, [clearCoinFlyTimer, triggerDingCelebrate]);

  const beginHand = useCallback(
    async (level: TicTacToeDifficulty = difficulty) => {
      const requestId = ++beginHandRequestIdRef.current;
      claimGenerationRef.current += 1;
      clearResultPrizeRowTimer();
      clearCoinFlyTimer();

      try {
        setError(null);
        setClaimResult(null);
        setPlayerMoves([]);
        setMatchId(null);
        setGameState(null);
        setShowLoseFlash(false);
        setTierCelebration(null);
        setPrizeRowMessage(null);
        setFlyCoin(null);
        setHidePrizeCoin(false);
        setWinHighlightDismissed(true);

        const started = await startTicTacToeMatch(level);
        if (requestId !== beginHandRequestIdRef.current) return;

        const { state } = createGame({
          seed: started.seed,
          difficulty: started.difficulty,
        });

        setMatchId(started.matchId);
        setGameState(state);
        setDifficulty(started.difficulty);
        if (started.progress) {
          setProgressStats(started.progress);
        }
        setPhase("playing");
        setWinHighlightDismissed(false);
      } catch (err) {
        if (requestId !== beginHandRequestIdRef.current) return;

        if (
          err instanceof TicTacToeRequestError &&
          err.code === "difficulty_locked"
        ) {
          const stats = progressStatsRef.current;
          const fallback = stats
            ? mapProgressStats(stats).suggestedDifficulty
            : "easy";
          if (fallback !== level) {
            void beginHandRef.current(fallback);
            return;
          }
          console.warn("[TicTacToe] Start blocked for locked difficulty", {
            level,
            fallback,
          });
          return;
        }

        setError(err instanceof Error ? err.message : "خطا در شروع بازی");
        setPhase("result");
      }
    },
    [difficulty, clearCoinFlyTimer, clearResultPrizeRowTimer]
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

    void refreshTicTacToeSettings();
  }, [open, resetLocal, refreshTicTacToeSettings]);

  useEffect(() => {
    if (!open || handBootstrapped) return;
    const stats = settings?.progress;
    if (!stats) return;

    const suggested = mapProgressStats(stats).suggestedDifficulty;
    setProgressStats(stats);
    setDifficulty(suggested);
    setHandBootstrapped(true);

    let cancelled = false;
    void (async () => {
      await beginHandRef.current(suggested);
      if (cancelled) return;
    })();

    return () => {
      cancelled = true;
    };
  }, [open, handBootstrapped, settings?.progress]);

  const resultMessage = useMemo(() => {
    if (!claimResult || claimResult.outcome !== "draw") return null;
    return "مساوی! جایزه‌ای پرداخت نشد.";
  }, [claimResult]);

  const scheduleNextHand = useCallback(
    (delayMs: number, level?: TicTacToeDifficulty) => {
      clearResultPrizeRowTimer();
      resultPrizeRowTimerRef.current = setTimeout(() => {
        resultPrizeRowTimerRef.current = null;
        if (level) {
          setDifficulty(level);
        }
        void beginHandRef.current(level ?? difficulty);
      }, delayMs);
    },
    [clearResultPrizeRowTimer, difficulty]
  );

  const progressView = useMemo(
    () => (progressStats ? mapProgressStats(progressStats) : null),
    [progressStats]
  );

  progressStatsRef.current = progressStats;

  const scheduleProgressionHand = useCallback(
    (event: TicTacToeProgressionEvent) => {
      const next = difficultyAfterProgressionEvent(event);
      if (!next) return;

      clearResultPrizeRowTimer();
      let delay = WIN_NEXT_HAND_MS;
      if (
        event === "easy_completed" ||
        event === "medium_completed" ||
        event === "hard_milestone"
      ) {
        delay = MILESTONE_NEXT_HAND_MS;
      } else if (
        event === "hard_penalty_reset" ||
        event === "medium_penalty_reopen_easy"
      ) {
        delay = PENALTY_MESSAGE_MS;
      }

      scheduleNextHand(delay, next);
    },
    [clearResultPrizeRowTimer, scheduleNextHand]
  );

  useEffect(() => {
    if (phase !== "result") {
      setShowResultInPrizeRow(false);
    }
  }, [phase]);

  const finishHandLocally = useCallback(
    (
      moves: number[],
      currentMatchId: string,
      outcome: Exclude<MatchState["outcome"], null>
    ) => {
      const claimGeneration = ++claimGenerationRef.current;

      let progressionEvent: TicTacToeProgressionEvent | null = null;
      let milestoneBonusDing = 0;
      let nextDifficulty: TicTacToeDifficulty | undefined;
      let nextProgressStats = progressStats;

      if (progressStats) {
        const applied = applyOutcomeToProgress(progressStats, difficulty, outcome);
        nextProgressStats = applied.stats;
        progressionEvent = applied.event;
        milestoneBonusDing = applied.milestoneBonusDing;
        setProgressStats(applied.stats);
        const autoLevel = difficultyAfterProgressionEvent(progressionEvent);
        if (autoLevel) {
          nextDifficulty = autoLevel;
        }
      }

      const optimisticPaidDing =
        outcome === "win"
          ? getTicTacToeWinPrizeDing(difficulty) + milestoneBonusDing
          : 0;
      const isTierCelebration =
        progressionEvent === "easy_completed" ||
        progressionEvent === "hard_milestone";

      setError(null);
      setPhase("result");
      setClaimResult({
        matchId: currentMatchId,
        outcome,
        paidDing: optimisticPaidDing,
        milestoneBonusDing,
        alreadyClaimed: false,
        progressionEvent,
        progress: nextProgressStats ?? {
          easyWins: 0,
          easyLosses: 0,
          easyCleared: false,
          mediumWins: 0,
          mediumLosses: 0,
          hardWins: 0,
          hardLosses: 0,
        },
      });

      if (outcome === "lose") {
        setShowLoseFlash(true);
        setGameState(null);
        setPlayerMoves([]);
        if (progressionEvent === "hard_penalty_reset") {
          setPrizeRowMessage("۷ باخت سخت — پیشرفت آسان و متوسط پاک شد");
          setShowResultInPrizeRow(true);
        } else if (progressionEvent === "medium_penalty_reopen_easy") {
          setPrizeRowMessage("۷ باخت متوسط — سطح آسان دوباره باز شد");
          setShowResultInPrizeRow(true);
        } else if (!progressionEvent) {
          scheduleNextHand(LOSE_NEXT_HAND_MS, nextDifficulty);
        }
      } else if (outcome === "draw") {
        setShowResultInPrizeRow(true);
        scheduleNextHand(DRAW_MESSAGE_MS, nextDifficulty);
      } else if (outcome === "win") {
        setShowResultInPrizeRow(false);
        setPrizeRowMessage(null);
        setWinHighlightDismissed(false);
        if (isTierCelebration && progressionEvent) {
          setTierCelebration(progressionEvent);
        }
        scheduleWinCoinFly();
        if (!progressionEvent) {
          scheduleNextHand(WIN_NEXT_HAND_MS, nextDifficulty);
        }
      }

      void (async () => {
        try {
          const result = await claimTicTacToeMatch({
            matchId: currentMatchId,
            playerMoves: moves,
          });
          if (claimGeneration !== claimGenerationRef.current) return;
          setClaimResult(result);
          setProgressStats(result.progress);
          if (result.progressionEvent) {
            scheduleProgressionHand(result.progressionEvent);
          }
          if (result.paidDing > 0) {
            void refreshAllBalances?.();
          }
        } catch (err) {
          if (claimGeneration !== claimGenerationRef.current) return;
          console.error("[TicTacToe] background claim failed:", err);
          if (progressionEvent) {
            scheduleProgressionHand(progressionEvent);
          } else if (outcome === "win") {
            scheduleNextHand(WIN_NEXT_HAND_MS, nextDifficulty);
          } else if (outcome === "lose") {
            scheduleNextHand(LOSE_NEXT_HAND_MS, nextDifficulty);
          } else if (outcome === "draw") {
            scheduleNextHand(DRAW_MESSAGE_MS, nextDifficulty);
          }
        }
      })();
    },
    [
      difficulty,
      progressStats,
      refreshAllBalances,
      scheduleNextHand,
      scheduleProgressionHand,
      scheduleWinCoinFly,
    ]
  );

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

      if (state.status === "finished" && state.outcome) {
        finishHandLocally(nextMoves, matchId, state.outcome);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "حرکت نامعتبر");
    } finally {
      setBusy(false);
    }
  };

  const boardCells = gameState?.board ?? EMPTY_BOARD;
  const canPickDifficulty =
    phase === "result" ||
    (phase === "playing" && playerMoves.length === 0);
  const showResultBanner =
    phase === "result" &&
    showResultInPrizeRow &&
    ((claimResult?.outcome === "draw" && resultMessage) || prizeRowMessage);
  const winPrizeDing = getTicTacToeWinPrizeDing(difficulty);
  const displayPrizeDing =
    claimResult?.outcome === "win"
      ? winPrizeDing + (claimResult.milestoneBonusDing ?? 0)
      : winPrizeDing;
  const showModalMilestoneHighlight =
    tierCelebration !== null ||
    (phase === "result" &&
      (claimResult?.progressionEvent === "hard_milestone" ||
        claimResult?.progressionEvent === "easy_completed") &&
      !winHighlightDismissed);
  const activeTierCelebration =
    tierCelebration ??
    (phase === "result" &&
    (claimResult?.progressionEvent === "easy_completed" ||
      claimResult?.progressionEvent === "hard_milestone")
      ? claimResult.progressionEvent
      : null);
  const showBoardWinHighlight =
    gameState?.status === "finished" &&
    gameState.outcome === "win" &&
    !winHighlightDismissed;
  const showBoardLoseHighlight = showLoseFlash;

  const handleDifficultyPick = (level: TicTacToeDifficulty) => {
    if (busy) return;
    if (progressView && !progressView[level].selectable) return;

    const canRestartHand =
      phase === "result" ||
      (phase === "playing" && playerMoves.length === 0);
    if (!canRestartHand) return;
    if (phase === "playing" && level === difficulty) return;

    setDifficulty(level);

    if (phase === "result") {
      clearResultPrizeRowTimer();
      clearCoinFlyTimer();
      setShowResultInPrizeRow(false);
      setPrizeRowMessage(null);
      setFlyCoin(null);
      setHidePrizeCoin(false);
      setWinHighlightDismissed(false);
      setShowLoseFlash(false);
      setTierCelebration(null);
    }

    void beginHand(level);
  };

  if (!open || !mounted || typeof document === "undefined") return null;

  const flyCoinPortal =
    flyCoin &&
    createPortal(
      <AnimatePresence>
        <motion.div
          key={`tic-tac-toe-fly-coin-${flyCoinKey}`}
          className={styles.flyCoin}
          style={{
            left: flyCoin.startX,
            top: flyCoin.startY,
            x: "-50%",
            y: "-50%",
          }}
          initial={{ scale: 1, opacity: 1 }}
          animate={{
            left: flyCoin.endX,
            top: flyCoin.endY,
            scale: [1, 0.82, 0.32],
            opacity: [1, 0.92, 0],
          }}
          transition={{
            duration: COIN_FLY_DURATION_MS / 1000,
            ease: [0.22, 0.61, 0.36, 1],
          }}
          onAnimationComplete={() => {
            setFlyCoin(null);
            setHidePrizeCoin(false);
            setGameState(null);
            setPlayerMoves([]);
            triggerDingCelebrate?.();
          }}
        >
          <Image
            src={dingCoinIcon}
            alt=""
            width={22}
            height={22}
            className={styles.flyCoinImage}
            aria-hidden="true"
          />
        </motion.div>
      </AnimatePresence>,
      document.body
    );

  return (
    <>
      {flyCoinPortal}
      {createPortal(
    <div
      ref={modalRootRef}
      className={`${styles.overlay} ${
        showModalMilestoneHighlight ? styles.overlayTierCelebration : ""
      }`}
      data-tic-tac-toe-modal
      onClick={handleClose}
      role="presentation"
    >
      <div className={styles.shellFrame}>
        <div
          className={`${styles.modal} ${
            showModalMilestoneHighlight ? styles.modalMilestoneWinner : ""
          }`}
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
            {DIFFICULTY_ORDER.map((level) => {
              const levelStats = progressView?.[level];
              const isLocked = levelStats ? !levelStats.selectable : level !== "easy";

              return (
                <button
                  key={level}
                  type="button"
                  className={`${styles.difficultyButton} ${
                    difficulty === level ? styles.difficultyButtonActive : ""
                  } ${isLocked ? styles.difficultyButtonLocked : ""} ${
                    activeTierCelebration === "easy_completed" && level === "medium"
                      ? styles.difficultyButtonUnlockTarget
                      : ""
                  }`}
                  onClick={() => handleDifficultyPick(level)}
                  disabled={busy || !canPickDifficulty || isLocked}
                  aria-disabled={isLocked || busy || !canPickDifficulty}
                >
                  <span className={styles.difficultyLossStat}>
                    <span
                      className={`${styles.difficultyStatValue} numeric-text numeric-text--11`}
                      dir="ltr"
                    >
                      {(levelStats?.losses ?? 0).toLocaleString("en-US")}
                    </span>
                  </span>
                  <span className={styles.difficultyLabel}>
                    {DIFFICULTY_LABELS[level]}
                  </span>
                  <span className={styles.difficultyWinStat}>
                    <span
                      className={`${styles.difficultyStatValue} numeric-text numeric-text--11`}
                      dir="ltr"
                    >
                      {(levelStats?.wins ?? 0).toLocaleString("en-US")}
                    </span>
                  </span>
                </button>
              );
            })}
          </div>

          <div
            className={`${styles.prizeRow} ${
              showModalMilestoneHighlight ? styles.prizeRowTierCelebration : ""
            }`}
            role={showResultBanner || activeTierCelebration ? "status" : undefined}
            aria-live={showResultBanner || activeTierCelebration ? "polite" : undefined}
          >
            {showResultBanner ? (
              <span>{prizeRowMessage ?? resultMessage}</span>
            ) : activeTierCelebration === "easy_completed" && phase === "result" ? (
              <span className={styles.tierCelebrationMessage}>
                ۷ برد آسان — سطح متوسط باز شد!
              </span>
            ) : activeTierCelebration === "hard_milestone" && phase === "result" ? (
              <>
                <span>جایزه ویژه ۷ برد سخت</span>
                <span
                  ref={prizeCoinRef}
                  className={`${styles.prizeCoinWrap} ${
                    hidePrizeCoin ? styles.prizeCoinHidden : ""
                  }`}
                >
                  <Image
                    src={dingCoinIcon}
                    alt=""
                    width={22}
                    height={22}
                    className={styles.prizeCoin}
                    aria-hidden="true"
                  />
                </span>
                <span
                  className={`${styles.prizeAmount} numeric-text numeric-text--16`}
                  dir="ltr"
                >
                  {(
                    TIC_TAC_TOE_HARD_MILESTONE_BONUS_DING +
                    getTicTacToeWinPrizeDing("hard")
                  ).toLocaleString("en-US")}
                </span>
                <span>دینگ</span>
              </>
            ) : (
              <>
                <span>جایزه برد</span>
                <span
                  ref={prizeCoinRef}
                  className={`${styles.prizeCoinWrap} ${
                    hidePrizeCoin ? styles.prizeCoinHidden : ""
                  }`}
                >
                  <Image
                    src={dingCoinIcon}
                    alt=""
                    width={22}
                    height={22}
                    className={styles.prizeCoin}
                    aria-hidden="true"
                  />
                </span>
                <span
                  className={`${styles.prizeAmount} numeric-text numeric-text--16`}
                  dir="ltr"
                >
                  {displayPrizeDing.toLocaleString("en-US")}
                </span>
                <span>دینگ</span>
              </>
            )}
          </div>

          <div
            className={`${styles.boardFrame} ${
              showBoardWinHighlight
                ? styles.boardFrameWinner
                : showBoardLoseHighlight
                  ? styles.boardFrameLoser
                  : ""
            }`}
          >
            <div className={styles.board}>
              {boardCells.map((mark, index) => (
                <button
                  key={index}
                  type="button"
                  className={styles.cell}
                  onClick={() => void handleCellClick(index)}
                  disabled={
                    busy ||
                    phase !== "playing" ||
                    mark !== null ||
                    gameState?.currentTurn !== "player"
                  }
                  aria-label={
                    mark
                      ? `خانه ${index + 1} — ${mark === "X" ? "ضربدر" : "دایره"}`
                      : `خانه ${index + 1}`
                  }
                >
                  {mark ? (
                    <span
                      className={`${styles.cellMark} ${
                        mark === "X"
                          ? styles.cellPlayer
                          : styles.cellMachine
                      }`}
                      aria-hidden="true"
                    >
                      <CellMarkIcon mark={mark} />
                    </span>
                  ) : null}
                </button>
              ))}
            </div>
          </div>

          {error && <p className={styles.errorText}>{error}</p>}
        </div>
      </div>
    </div>,
    document.body
      )}
    </>
  );
}
