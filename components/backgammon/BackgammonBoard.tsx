"use client";

import React, { useMemo, useState } from "react";
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

function endpointKey(value: Move["from"] | Move["to"]): string {
  return String(value);
}

function CheckerStack({
  count,
  color,
  fromTop,
}: {
  count: number;
  color: "white" | "black";
  fromTop: boolean;
}) {
  if (count <= 0) return null;

  const visible = Math.min(count, MAX_VISIBLE_CHECKERS);
  const checkerClass =
    color === "white" ? styles.checkerWhite : styles.checkerBlack;
  const overlapClass = fromTop
    ? styles.checkerOverlap
    : styles.checkerOverlapBottom;

  return (
    <>
      {Array.from({ length: visible }, (_, i) => (
        <span
          key={`${color}-${i}`}
          className={[checkerClass, i > 0 ? overlapClass : ""]
            .filter(Boolean)
            .join(" ")}
        />
      ))}
      {count > MAX_VISIBLE_CHECKERS ? (
        <span
          className={fromTop ? styles.stackCountTop : styles.stackCountBottom}
          dir="ltr"
        >
          {count}
        </span>
      ) : null}
    </>
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

  const stackClass = fromTop ? styles.checkerStackTop : styles.checkerStackBottom;

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
        <div className={stackClass}>
          {owner ? (
            <CheckerStack count={count} color={owner} fromTop={fromTop} />
          ) : null}
        </div>
      </button>
    </div>
  );
}

export default function BackgammonBoard({ snapshot, onMove, disabled }: Props) {
  const [selectedFrom, setSelectedFrom] = useState<string | null>(null);
  const flipped = snapshot.mySeat === 1;

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
      ? snapshot.board.bar.white
      : snapshot.mySeat === 1
        ? snapshot.board.bar.black
        : 0;
  const oppBarCount =
    snapshot.mySeat === 0
      ? snapshot.board.bar.black
      : snapshot.mySeat === 1
        ? snapshot.board.bar.white
        : 0;

  const myBorneOff =
    snapshot.mySeat === 0
      ? snapshot.board.borneOff.white
      : snapshot.mySeat === 1
        ? snapshot.board.borneOff.black
        : 0;
  const oppBorneOff =
    snapshot.mySeat === 0
      ? snapshot.board.borneOff.black
      : snapshot.mySeat === 1
        ? snapshot.board.borneOff.white
        : 0;

  const tryMove = async (fromKey: string, to: Move["to"]) => {
    const moves = legalByFrom.get(fromKey) ?? [];
    const match = moves.find((m) => m.to === to);
    if (!match) return false;
    setSelectedFrom(null);
    await onMove(match);
    return true;
  };

  const handlePointClick = async (point: number) => {
    if (disabled || !snapshot.isMyTurn) return;

    const fromKey = String(point);
    const stack = snapshot.board.points[point] ?? { white: 0, black: 0 };
    const myCount =
      snapshot.mySeat === 0 ? stack.white : snapshot.mySeat === 1 ? stack.black : 0;

    if (selectedFrom === fromKey) {
      setSelectedFrom(null);
      return;
    }

    if (selectedFrom && (await tryMove(selectedFrom, point))) {
      return;
    }

    if (myCount > 0 && legalByFrom.has(fromKey)) {
      setSelectedFrom(fromKey);
    }
  };

  const handleBearOffClick = async () => {
    if (!selectedFrom || disabled || !snapshot.isMyTurn) return;
    await tryMove(selectedFrom, "off");
  };

  const renderPoint = (point: number, fromTop: boolean) => (
    <PointCell
      key={point}
      point={point}
      snapshot={snapshot}
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
      <div className={styles.boardFrame}>
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

        <div className={styles.boardSurface}>
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
                  if (!barSelectable) return;
                  setSelectedFrom(selectedFrom === "bar" ? null : "bar");
                }}
                onKeyDown={(e) => {
                  if (!barSelectable) return;
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    setSelectedFrom(selectedFrom === "bar" ? null : "bar");
                  }
                }}
              >
                <span className={styles.barLabel}>BAR</span>
                <div className={styles.barStack}>
                  {Array.from({ length: Math.min(oppBarCount, 3) }, (_, i) => (
                    <span
                      key={`opp-bar-${i}`}
                      className={[
                        styles.barChecker,
                        oppCheckerOnBearOff,
                        i > 0 ? styles.barCheckerOverlap : "",
                      ]
                        .filter(Boolean)
                        .join(" ")}
                    />
                  ))}
                  {oppBarCount > 3 ? (
                    <span className={styles.barCount} dir="ltr">
                      {oppBarCount}
                    </span>
                  ) : null}
                </div>
                <div className={styles.barStack}>
                  {Array.from({ length: Math.min(myBarCount, 3) }, (_, i) => (
                    <span
                      key={`my-bar-${i}`}
                      className={[
                        styles.barChecker,
                        myCheckerOnBearOff,
                        i > 0 ? styles.barCheckerOverlap : "",
                      ]
                        .filter(Boolean)
                        .join(" ")}
                    />
                  ))}
                  {myBarCount > 3 ? (
                    <span className={styles.barCount} dir="ltr">
                      {myBarCount}
                    </span>
                  ) : null}
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
  );
}
