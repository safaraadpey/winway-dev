"use client";

import React from "react";
import type { BackgammonPublicSnapshot } from "@/lib/backgammon/useBackgammonSession";
import styles from "./DicePanel.module.css";

type Props = {
  snapshot: BackgammonPublicSnapshot;
  onRoll: () => Promise<void>;
  onEndTurn: () => Promise<void>;
  busy?: boolean;
};

export default function DicePanel({
  snapshot,
  onRoll,
  onEndTurn,
  busy,
}: Props) {
  const diceText =
    snapshot.dice.values && snapshot.dice.rolled
      ? `${snapshot.dice.values[0]} / ${snapshot.dice.values[1]}`
      : "—";

  const canEndTurn =
    snapshot.isMyTurn &&
    snapshot.dice.rolled &&
    snapshot.legalMoves.length === 0;

  return (
    <div>
      <div className={styles.dicePanel}>
        <div>
          <div className={styles.turnLabel}>
            Turn:{" "}
            {snapshot.currentTurnSeat
              ? snapshot.currentTurnSeat.toUpperCase()
              : "—"}
            {snapshot.isMyTurn ? " (you)" : ""}
          </div>
          <div className={styles.diceValues} dir="ltr">
            {diceText}
          </div>
        </div>
        <div className={styles.actions}>
          <button
            type="button"
            className={styles.rollButton}
            disabled={!snapshot.canRoll || busy}
            onClick={() => void onRoll()}
          >
            Roll
          </button>
          <button
            type="button"
            className={styles.endTurnButton}
            disabled={!canEndTurn || busy}
            onClick={() => void onEndTurn()}
          >
            End turn
          </button>
        </div>
      </div>

      {snapshot.legalMoves.length > 0 ? (
        <div className={styles.legalMoves}>
          Legal moves:
          <ul>
            {snapshot.legalMoves.slice(0, 8).map((move) => (
              <li key={`${move.from}-${move.to}-${move.dieUsed}`}>
                <span className={styles.legalMoveItem} dir="ltr">
                  {String(move.from)} → {String(move.to)} ({move.dieUsed})
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
