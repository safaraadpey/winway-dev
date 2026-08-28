"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Move } from "@dingmoney/backgammon-engine";
import type { BackgammonPublicSnapshot } from "@/lib/backgammon/useBackgammonSession";
import styles from "./BackgammonBoard.module.css";

type Props = {
  snapshot: BackgammonPublicSnapshot;
  onMove: (move: Move) => Promise<void>;
  disabled?: boolean;
};

const TOP_LEFT = [13, 14, 15, 16, 17, 18] as const;
const TOP_RIGHT = [19, 20, 21, 22, 23, 24] as const;
const BOTTOM_LEFT = [12, 11, 10, 9, 8, 7] as const;
const BOTTOM_RIGHT = [6, 5, 4, 3, 2, 1] as const;

const MAX_VISIBLE_CHECKERS = 5;
const CHECKER_SIZE = 20;
const MAX_STACK_HEIGHT = 100;

function endpointKey(value: Move["from"] | Move["to"]): string {
  return String(value);
}

/** Play the highest die available from this checker (tap-to-move). */
function pickAutoMove(moves: Move[]): Move | null {
  if (moves.length === 0) return null;
  return moves.reduce((best, m) => (m.dieUsed > best.dieUsed ? m : best));
}

function pickMoveTo(moves: Move[], to: Move["to"]): Move | null {
  const matches = moves.filter((m) => m.to === to);
  if (matches.length === 0) return null;
  return matches.reduce((best, m) => (m.dieUsed > best.dieUsed ? m : best));
}

const JUMP_MS = 260;

function prefersReducedMotion(): boolean {
  return (
    typeof window !== "undefined" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

function endpointSelector(endpoint: Move["from"] | Move["to"]): string {
  return `[data-bg-endpoint="${String(endpoint)}"]`;
}

function cloneBoard(board: BackgammonPublicSnapshot["board"]) {
  return {
    points: board.points.map((stack) => ({ ...stack })),
    bar: { ...board.bar },
    borneOff: { ...board.borneOff },
  };
}

/** Hide checkers that are still flying so dest does not pop in early. */
function boardHidingArrivals(
  board: BackgammonPublicSnapshot["board"],
  hidden: Record<string, number>,
  color: "white" | "black"
): BackgammonPublicSnapshot["board"] {
  const keys = Object.keys(hidden);
  if (keys.length === 0) return board;
  const next = cloneBoard(board);
  for (const key of keys) {
    const n = hidden[key] ?? 0;
    if (n <= 0) continue;
    if (key === "bar") {
      next.bar[color] = Math.max(0, next.bar[color] - n);
    } else if (key === "off") {
      next.borneOff[color] = Math.max(0, next.borneOff[color] - n);
    } else {
      const point = Number(key);
      if (next.points[point]) {
        next.points[point][color] = Math.max(0, next.points[point][color] - n);
      }
    }
  }
  return next;
}

function measureEndpoint(
  frame: HTMLElement,
  endpoint: Move["from"] | Move["to"]
): { x: number; y: number } | null {
  const el = frame.querySelector(endpointSelector(endpoint));
  if (!(el instanceof HTMLElement)) return null;
  const frameRect = frame.getBoundingClientRect();
  const rect = el.getBoundingClientRect();
  const size = 20;
  return {
    x: rect.left + rect.width / 2 - frameRect.left - size / 2,
    y: rect.top + rect.height / 2 - frameRect.top - size / 2,
  };
}

function animateJumpDom(
  frame: HTMLElement,
  from: { x: number; y: number },
  to: { x: number; y: number },
  colorClass: string
): Promise<void> {
  if (prefersReducedMotion()) return Promise.resolve();

  const ghost = document.createElement("span");
  ghost.className = `${colorClass} ${styles.flyingChecker}`;
  ghost.style.left = `${from.x}px`;
  ghost.style.top = `${from.y}px`;
  ghost.setAttribute("aria-hidden", "true");
  frame.appendChild(ghost);

  const dx = to.x - from.x;
  const dy = to.y - from.y;

  return new Promise((resolve) => {
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      ghost.remove();
      resolve();
    };
    const timeoutId = window.setTimeout(finish, JUMP_MS + 80);
    try {
      const animation = ghost.animate(
        [
          { transform: "translate(0px, 0px) scale(1)", offset: 0 },
          {
            transform: `translate(${dx / 2}px, ${dy / 2 - 24}px) scale(1.15)`,
            offset: 0.45,
          },
          { transform: `translate(${dx}px, ${dy}px) scale(1)`, offset: 1 },
        ],
        {
          duration: JUMP_MS,
          easing: "cubic-bezier(0.22, 1, 0.36, 1)",
          fill: "forwards",
        }
      );
      animation.finished
        .then(finish)
        .catch(finish)
        .finally(() => window.clearTimeout(timeoutId));
    } catch {
      window.clearTimeout(timeoutId);
      finish();
    }
  });
}

function stackMetrics(count: number) {
  const visible = Math.min(count, MAX_VISIBLE_CHECKERS);
  if (visible <= 1) {
    return { visible, step: 0, height: CHECKER_SIZE };
  }

  const idealStep = 12;
  const maxStep = Math.floor(
    (MAX_STACK_HEIGHT - CHECKER_SIZE) / (visible - 1)
  );
  const step = Math.min(idealStep, maxStep);
  const height = CHECKER_SIZE + (visible - 1) * step;
  return { visible, step, height };
}

function VerticalCheckerStack({
  count,
  color,
  fromTop,
  size = CHECKER_SIZE,
}: {
  count: number;
  color: "white" | "black";
  fromTop: boolean;
  size?: number;
}) {
  if (count <= 0) return null;

  const { visible, step, height } = stackMetrics(count);
  const checkerClass =
    color === "white" ? styles.checkerWhite : styles.checkerBlack;
  const containerClass = fromTop
    ? styles.checkerStackTop
    : styles.checkerStackBottom;
  const frontOffset = (visible - 1) * step;

  return (
    <div
      className={containerClass}
      style={{ width: size, height, minWidth: size }}
    >
      {Array.from({ length: visible }, (_, i) => (
        <span
          key={`${color}-${i}`}
          className={[checkerClass, styles.checkerPlaced].join(" ")}
          style={{
            width: size,
            height: size,
            ...(fromTop ? { top: i * step } : { bottom: i * step }),
            zIndex: i + 1,
          }}
        />
      ))}
      {count > MAX_VISIBLE_CHECKERS ? (
        <span
          className={styles.stackCountBadge}
          style={{
            ...(fromTop
              ? { top: frontOffset + size / 2 - 8 }
              : { bottom: frontOffset + size / 2 - 8 }),
            zIndex: visible + 2,
          }}
          dir="ltr"
        >
          {count}
        </span>
      ) : null}
    </div>
  );
}

function PointCell({
  point,
  snapshot,
  fromTop,
  selectedFrom,
  legalByFrom,
  highlightTargets,
  disabled,
  onPointClick,
}: {
  point: number;
  snapshot: BackgammonPublicSnapshot;
  fromTop: boolean;
  selectedFrom: string | null;
  legalByFrom: Map<string, Move[]>;
  highlightTargets: Set<number>;
  disabled?: boolean;
  onPointClick: (point: number) => void;
}) {
  const stack = snapshot.board.points[point] ?? { white: 0, black: 0 };
  const fromKey = String(point);
  const isLight = point % 2 === 0;

  const mySeat = snapshot.mySeat;
  const myCount =
    mySeat === 0 ? stack.white : mySeat === 1 ? stack.black : 0;

  const canSelectFrom =
    snapshot.isMyTurn &&
    !disabled &&
    myCount > 0 &&
    legalByFrom.has(fromKey);

  const isTarget =
    highlightTargets.has(point) &&
    snapshot.isMyTurn &&
    !disabled;

  const isSelected = selectedFrom === fromKey;
  const interactive = canSelectFrom || isTarget;

  const owner: "white" | "black" | null =
    stack.white > 0 ? "white" : stack.black > 0 ? "black" : null;
  const count = stack.white > 0 ? stack.white : stack.black;

  const triangleClass = [
    fromTop ? styles.triangleDown : styles.triangleUp,
    isLight ? styles.triangleLight : styles.triangleDark,
    isSelected || isTarget ? styles.triangleHighlight : "",
  ]
    .filter(Boolean)
    .join(" ");

  const buttonClass = [
    fromTop ? styles.pointButtonTop : styles.pointButtonBottom,
    interactive ? styles.pointButtonInteractive : "",
    isSelected ? styles.pointButtonSelected : "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div className={fromTop ? styles.pointWrapTop : styles.pointWrapBottom}>
      <button
        type="button"
        className={buttonClass}
        disabled={!interactive && selectedFrom === null}
        onClick={() => onPointClick(point)}
        aria-label={`Point ${point}`}
      >
        <span className={triangleClass} aria-hidden />
        <span
          className={styles.checkerAnchor}
          data-bg-endpoint={point}
          aria-hidden
        />
        {owner ? (
          <VerticalCheckerStack count={count} color={owner} fromTop={fromTop} />
        ) : null}
      </button>
    </div>
  );
}

export default function BackgammonBoard({ snapshot, onMove, disabled }: Props) {
  const [selectedFrom, setSelectedFrom] = useState<string | null>(null);
  const [hiddenArrivals, setHiddenArrivals] = useState<Record<string, number>>(
    {}
  );
  const frameRef = useRef<HTMLDivElement | null>(null);
  const busyRef = useRef(false);
  const flipped = snapshot.mySeat === 1;
  const myColor: "white" | "black" = snapshot.mySeat === 1 ? "black" : "white";
  const myCheckerClass =
    myColor === "white" ? styles.checkerWhite : styles.checkerBlack;

  const displaySnapshot = useMemo(() => {
    if (Object.keys(hiddenArrivals).length === 0) return snapshot;
    return {
      ...snapshot,
      board: boardHidingArrivals(snapshot.board, hiddenArrivals, myColor),
    };
  }, [snapshot, hiddenArrivals, myColor]);

  const bumpArrival = useCallback((to: Move["to"], delta: number) => {
    const key = endpointKey(to);
    setHiddenArrivals((prev) => {
      const nextCount = Math.max(0, (prev[key] ?? 0) + delta);
      if (nextCount === 0) {
        if (!(key in prev)) return prev;
        const next = { ...prev };
        delete next[key];
        return next;
      }
      return { ...prev, [key]: nextCount };
    });
  }, []);

  const legalByFrom = useMemo(() => {
    const map = new Map<string, Move[]>();
    for (const move of snapshot.legalMoves) {
      const key = endpointKey(move.from);
      const list = map.get(key) ?? [];
      list.push(move);
      map.set(key, list);
    }
    return map;
  }, [snapshot.legalMoves]);

  useEffect(() => {
    setSelectedFrom(null);
  }, [snapshot.stateVersion]);

  const highlightTargets = useMemo(() => {
    if (!selectedFrom) return new Set<number>();
    const moves = legalByFrom.get(selectedFrom) ?? [];
    const targets = new Set<number>();
    for (const move of moves) {
      if (typeof move.to === "number") targets.add(move.to);
    }
    return targets;
  }, [legalByFrom, selectedFrom]);

  const canBearOff = useMemo(() => {
    if (!selectedFrom) return false;
    const moves = legalByFrom.get(selectedFrom) ?? [];
    return moves.some((m) => m.to === "off");
  }, [legalByFrom, selectedFrom]);

  const barMoves = legalByFrom.get("bar") ?? [];
  const barSelectable =
    snapshot.isMyTurn && !disabled && barMoves.length > 0;

  const myBarCount =
    snapshot.mySeat === 0
      ? displaySnapshot.board.bar.white
      : snapshot.mySeat === 1
        ? displaySnapshot.board.bar.black
        : 0;
  const oppBarCount =
    snapshot.mySeat === 0
      ? displaySnapshot.board.bar.black
      : snapshot.mySeat === 1
        ? displaySnapshot.board.bar.white
        : 0;

  const myBorneOff =
    snapshot.mySeat === 0
      ? displaySnapshot.board.borneOff.white
      : snapshot.mySeat === 1
        ? displaySnapshot.board.borneOff.black
        : 0;
  const oppBorneOff =
    snapshot.mySeat === 0
      ? displaySnapshot.board.borneOff.black
      : snapshot.mySeat === 1
        ? displaySnapshot.board.borneOff.white
        : 0;

  const commitMove = useCallback(
    (move: Move) => {
      if (busyRef.current || disabled) return;
      busyRef.current = true;
      setSelectedFrom(null);

      const frame = frameRef.current;
      const fromPos = frame ? measureEndpoint(frame, move.from) : null;
      const toPos = frame ? measureEndpoint(frame, move.to) : null;

      bumpArrival(move.to, 1);
      void onMove(move);
      busyRef.current = false;

      if (frame && fromPos && toPos) {
        void animateJumpDom(frame, fromPos, toPos, myCheckerClass).finally(() => {
          bumpArrival(move.to, -1);
        });
      } else {
        bumpArrival(move.to, -1);
      }
    },
    [bumpArrival, disabled, myCheckerClass, onMove]
  );

  const tryMove = (fromKey: string, to: Move["to"]) => {
    const match = pickMoveTo(legalByFrom.get(fromKey) ?? [], to);
    if (!match) return false;
    commitMove(match);
    return true;
  };

  const selectOrAutoMove = (fromKey: string) => {
    const auto = pickAutoMove(legalByFrom.get(fromKey) ?? []);
    if (auto) {
      commitMove(auto);
      return;
    }
    setSelectedFrom(fromKey);
  };

  const handlePointClick = (point: number) => {
    if (disabled || !snapshot.isMyTurn || busyRef.current) return;

    const fromKey = String(point);
    const stack = snapshot.board.points[point] ?? { white: 0, black: 0 };
    const myCount =
      snapshot.mySeat === 0 ? stack.white : snapshot.mySeat === 1 ? stack.black : 0;

    if (selectedFrom === fromKey) {
      setSelectedFrom(null);
      return;
    }

    if (selectedFrom && tryMove(selectedFrom, point)) {
      return;
    }

    if (myCount > 0 && legalByFrom.has(fromKey)) {
      selectOrAutoMove(fromKey);
    }
  };

  const handleBarClick = () => {
    if (!barSelectable || busyRef.current) return;
    if (selectedFrom === "bar") {
      setSelectedFrom(null);
      return;
    }
    selectOrAutoMove("bar");
  };

  const handleBearOffClick = () => {
    if (!selectedFrom || disabled || !snapshot.isMyTurn) return;
    tryMove(selectedFrom, "off");
  };

  const renderPoint = (point: number, fromTop: boolean) => (
    <PointCell
      key={point}
      point={point}
      snapshot={displaySnapshot}
      fromTop={fromTop}
      selectedFrom={selectedFrom}
      legalByFrom={legalByFrom}
      highlightTargets={highlightTargets}
      disabled={disabled}
      onPointClick={handlePointClick}
    />
  );

  const myCheckerOnBearOff =
    snapshot.mySeat === 0 ? styles.checkerWhite : styles.checkerBlack;
  const oppCheckerOnBearOff =
    snapshot.mySeat === 0 ? styles.checkerBlack : styles.checkerWhite;

  return (
    <div className={styles.boardShell}>
      <div className={styles.boardSurface}>
        <div className={styles.boardFrame} ref={frameRef}>
          <div className={styles.bearOffColumn}>
            <div className={styles.bearOffTray}>
              {Array.from({ length: Math.min(oppBorneOff, 4) }, (_, i) => (
                <span key={`opp-off-${i}`} className={oppCheckerOnBearOff} />
              ))}
              {oppBorneOff > 0 ? (
                <span className={styles.bearOffCount} dir="ltr">
                  {oppBorneOff}
                </span>
              ) : null}
            </div>
            <button
              type="button"
              className={[
                styles.bearOffTray,
                canBearOff ? styles.bearOffTrayActive : "",
              ]
                .filter(Boolean)
                .join(" ")}
              data-bg-endpoint="off"
              disabled={!canBearOff}
              onClick={() => void handleBearOffClick()}
              aria-label="Bear off"
            >
              {Array.from({ length: Math.min(myBorneOff, 4) }, (_, i) => (
                <span key={`my-off-${i}`} className={myCheckerOnBearOff} />
              ))}
              {myBorneOff > 0 ? (
                <span className={styles.bearOffCount} dir="ltr">
                  {myBorneOff}
                </span>
              ) : null}
            </button>
          </div>

          <div className={styles.boardPlayArea}>
            <div
              className={[
                styles.boardInner,
                flipped ? styles.boardInnerFlipped : "",
              ]
                .filter(Boolean)
                .join(" ")}
            >
              <div className={styles.boardGrid}>
                <div className={styles.halfBoard}>
                  <div className={styles.pointRow}>
                    {TOP_LEFT.map((p) => renderPoint(p, true))}
                  </div>
                  <div className={styles.pointRow}>
                    {BOTTOM_LEFT.map((p) => renderPoint(p, false))}
                  </div>
                </div>

                <div
                  className={
                    selectedFrom === "bar"
                      ? styles.barCellSelected
                      : barSelectable
                        ? styles.barCellSelectable
                        : styles.barCell
                  }
                  role="button"
                  tabIndex={barSelectable ? 0 : -1}
                  onClick={() => {
                    void handleBarClick();
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      void handleBarClick();
                    }
                  }}
                >
                  <span className={styles.barLabel}>BAR</span>
                  <div className={styles.barStackTop}>
                    <VerticalCheckerStack
                      count={oppBarCount}
                      color={snapshot.mySeat === 0 ? "black" : "white"}
                      fromTop
                      size={18}
                    />
                  </div>
                  <div className={styles.barStackBottom} data-bg-endpoint="bar">
                    <VerticalCheckerStack
                      count={myBarCount}
                      color={snapshot.mySeat === 0 ? "white" : "black"}
                      fromTop={false}
                      size={18}
                    />
                  </div>
                </div>

                <div className={styles.halfBoard}>
                  <div className={styles.pointRow}>
                    {TOP_RIGHT.map((p) => renderPoint(p, true))}
                  </div>
                  <div className={styles.pointRow}>
                    {BOTTOM_RIGHT.map((p) => renderPoint(p, false))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
