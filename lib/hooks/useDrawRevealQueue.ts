"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  sortDraws,
  type ProcessedDraw,
} from "@/lib/draw-order";

export type { ProcessedDraw };

export type SyncFromServerOptions = {
  /** Skip pacing and reveal every draw immediately (rare; e.g. explicit flush). */
  revealAll?: boolean;
};

const DEFAULT_REVEAL_MS = 3000;

/**
 * Reveals processed draws one-by-one at a fixed pace.
 *
 * Display order is always a prefix of the server-sorted authoritative list
 * (processed_at → created_at → id). revealedIndex only moves forward.
 */
export function useDrawRevealQueue(
  revealIntervalMs = DEFAULT_REVEAL_MS,
  onReveal?: (number: number) => void
) {
  const [calledNumbers, setCalledNumbers] = useState<number[]>([]);
  const authoritativeRef = useRef<ProcessedDraw[]>([]);
  const revealedCountRef = useRef(0);
  const initialSyncDoneRef = useRef(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastRevealAtRef = useRef(0);
  const onRevealRef = useRef(onReveal);

  useEffect(() => {
    onRevealRef.current = onReveal;
  }, [onReveal]);

  const clearTimer = () => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  };

  const syncCalledNumbersFromAuthoritative = useCallback(() => {
    const draws = authoritativeRef.current;
    const n = Math.min(revealedCountRef.current, draws.length);
    setCalledNumbers(draws.slice(0, n).map((d) => d.number));
  }, []);

  const revealNext = useCallback(() => {
    const total = authoritativeRef.current.length;
    if (revealedCountRef.current >= total) {
      timerRef.current = null;
      return;
    }

    const next = authoritativeRef.current[revealedCountRef.current]!;
    revealedCountRef.current += 1;
    lastRevealAtRef.current = Date.now();
    syncCalledNumbersFromAuthoritative();
    onRevealRef.current?.(next.number);

    if (revealedCountRef.current < total) {
      timerRef.current = setTimeout(revealNext, revealIntervalMs);
    } else {
      timerRef.current = null;
    }
  }, [revealIntervalMs, syncCalledNumbersFromAuthoritative]);

  const scheduleDrain = useCallback(() => {
    if (revealedCountRef.current >= authoritativeRef.current.length) return;
    if (timerRef.current) return;

    const elapsed = Date.now() - lastRevealAtRef.current;
    const delay =
      lastRevealAtRef.current === 0 || elapsed >= revealIntervalMs
        ? 0
        : revealIntervalMs - elapsed;

    timerRef.current = setTimeout(revealNext, delay);
  }, [revealIntervalMs, revealNext]);

  const reset = useCallback(() => {
    clearTimer();
    authoritativeRef.current = [];
    revealedCountRef.current = 0;
    initialSyncDoneRef.current = false;
    lastRevealAtRef.current = 0;
    setCalledNumbers([]);
  }, []);

  const syncFromServer = useCallback(
    (draws: ProcessedDraw[], options?: SyncFromServerOptions) => {
      const sorted = sortDraws(draws);
      const prevRevealed = revealedCountRef.current;
      authoritativeRef.current = sorted;

      if (revealedCountRef.current > sorted.length) {
        revealedCountRef.current = sorted.length;
      }

      if (!initialSyncDoneRef.current) {
        initialSyncDoneRef.current = true;
        revealedCountRef.current = sorted.length;
        lastRevealAtRef.current = Date.now();
        syncCalledNumbersFromAuthoritative();
        return;
      }

      if (options?.revealAll) {
        clearTimer();
        revealedCountRef.current = sorted.length;
        syncCalledNumbersFromAuthoritative();
        return;
      }

      syncCalledNumbersFromAuthoritative();

      if (sorted.length > prevRevealed) {
        scheduleDrain();
      }
    },
    [scheduleDrain, syncCalledNumbersFromAuthoritative]
  );

  useEffect(() => () => clearTimer(), []);

  return { calledNumbers, syncFromServer, reset };
};
