"use client";

import React, { useMemo, useState } from "react";
import type { Move } from "@dingmoney/backgammon-engine";
import type { BackgammonPublicSnapshot } from "@/lib/backgammon/useBackgammonSession";
import BarAndOff from "./BarAndOff";
import styles from "./BackgammonBoard.module.css";

type Props = {
  snapshot: BackgammonPublicSnapshot;
  onMove: (move: Move) => Promise<void>;
  disabled?: boolean;
};

function endpointKey(value: Move["from"] | Move["to"]): string {
  return String(value);
}

export default function BackgammonBoard({ snapshot, onMove, disabled }: Props) {
  const [selectedFrom, setSelectedFrom] = useState<string | null>(null);

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

  const handlePointClick = async (point: number) => {
    if (disabled || !snapshot.isMyTurn) return;

    const fromKey = String(point);
    const myCount =
      snapshot.mySeat === 0
        ? snapshot.board.points[point]?.white ?? 0
        : snapshot.board.points[point]?.black ?? 0;

    if (selectedFrom === fromKey) {
      setSelectedFrom(null);
      return;
    }

    if (selectedFrom) {
      const moves = legalByFrom.get(selectedFrom) ?? [];
      const match = moves.find((m) => m.to === point);
      if (match) {
        setSelectedFrom(null);
        await onMove(match);
        return;
      }
    }

    if (myCount > 0 && legalByFrom.has(fromKey)) {
      setSelectedFrom(fromKey);
    }
  };

  const renderPoint = (point: number) => {
    const stack = snapshot.board.points[point] ?? { white: 0, black: 0 };
    const fromKey = String(point);
    const selectable =
      snapshot.isMyTurn &&
      !disabled &&
      (legalByFrom.has(fromKey) ||
        (selectedFrom !== null && (legalByFrom.get(selectedFrom) ?? []).some((m) => m.to === point)));

    const className =
      selectedFrom === fromKey
        ? styles.pointSelected
        : selectable
          ? styles.pointSelectable
          : styles.point;

    return (
      <button
        key={point}
        type="button"
        className={className}
        onClick={() => void handlePointClick(point)}
        disabled={!selectable && selectedFrom === null}
      >
        <span className={styles.pointLabel} dir="ltr">
          {point}
        </span>
        <div className={styles.stack}>
          {stack.white > 0 ? (
            <span className={styles.countBadge} dir="ltr">
              {stack.white}W
            </span>
          ) : null}
          {stack.black > 0 ? (
            <span className={styles.countBadge} dir="ltr">
              {stack.black}B
            </span>
          ) : null}
          {stack.white > 0 ? <span className={styles.checkerWhite} /> : null}
          {stack.black > 0 ? <span className={styles.checkerBlack} /> : null}
        </div>
      </button>
    );
  };

  const topRow = [13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24];
  const bottomRow = [12, 11, 10, 9, 8, 7, 6, 5, 4, 3, 2, 1];

  return (
    <div className={styles.backgammonBoard}>
      <BarAndOff
        snapshot={snapshot}
        selectedFrom={selectedFrom}
        legalByFrom={legalByFrom}
        onSelectFrom={setSelectedFrom}
        onMove={onMove}
        disabled={disabled}
      />

      <div>
        <div className={styles.halfLabel}>Black outer → home</div>
        <div className={styles.pointsGrid}>
          {topRow.slice(0, 6).map(renderPoint)}
        </div>
        <div className={styles.pointsGrid}>
          {topRow.slice(6).map(renderPoint)}
        </div>
      </div>

      <div>
        <div className={styles.halfLabel}>White home ← outer</div>
        <div className={styles.pointsGrid}>
          {bottomRow.slice(0, 6).map(renderPoint)}
        </div>
        <div className={styles.pointsGrid}>
          {bottomRow.slice(6).map(renderPoint)}
        </div>
      </div>
    </div>
  );
}
