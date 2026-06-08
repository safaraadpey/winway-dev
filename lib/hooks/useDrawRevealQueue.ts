"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export type ProcessedDraw = { number: number; created_at: string };

const DEFAULT_REVEAL_MS = 3000;

function sortDraws(draws: ProcessedDraw[]): ProcessedDraw[] {
  return [...draws].sort(
    (a, b) =>
      a.created_at.localeCompare(b.created_at) ||
      a.number - b.number
  );
}

/**
 * Reveals processed draws one-by-one at a fixed pace even when the server
 * delivers several at once (engine backlog / polling batch).
 */
export function useDrawRevealQueue(
  revealIntervalMs = DEFAULT_REVEAL_MS,
  onReveal?: (number: number) => void
) {
  const [calledNumbers, setCalledNumbers] = useState<number[]>([]);
  const queueRef = useRef<ProcessedDraw[]>([]);
  const knownNumbersRef = useRef<Set<number>>(new Set());
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

  const revealNext = useCallback(() => {
    const next = queueRef.current.shift();
    if (!next) {
      timerRef.current = null;
      return;
    }

    lastRevealAtRef.current = Date.now();
    setCalledNumbers((prev) =>
      prev.includes(next.number) ? prev : [...prev, next.number]
    );
    onRevealRef.current?.(next.number);

    if (queueRef.current.length > 0) {
      timerRef.current = setTimeout(revealNext, revealIntervalMs);
    } else {
      timerRef.current = null;
    }
  }, [revealIntervalMs]);

  const scheduleDrain = useCallback(() => {
    if (queueRef.current.length === 0) return;
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
    queueRef.current = [];
    knownNumbersRef.current.clear();
    initialSyncDoneRef.current = false;
    lastRevealAtRef.current = 0;
    setCalledNumbers([]);
  }, []);

  const syncFromServer = useCallback(
    (draws: ProcessedDraw[]) => {
      const sorted = sortDraws(draws);

      if (!initialSyncDoneRef.current) {
        initialSyncDoneRef.current = true;
        for (const d of sorted) {
          knownNumbersRef.current.add(d.number);
        }
        if (sorted.length > 0) {
          lastRevealAtRef.current = Date.now();
          setCalledNumbers(sorted.map((d) => d.number));
        }
        return;
      }

      let added = false;
      for (const d of sorted) {
        if (knownNumbersRef.current.has(d.number)) continue;
        knownNumbersRef.current.add(d.number);
        queueRef.current.push(d);
        added = true;
      }

      if (!added) return;

      queueRef.current.sort(
        (a, b) =>
          a.created_at.localeCompare(b.created_at) ||
          a.number - b.number
      );
      scheduleDrain();
    },
    [scheduleDrain]
  );

  useEffect(() => () => clearTimer(), []);

  return { calledNumbers, syncFromServer, reset };
}
