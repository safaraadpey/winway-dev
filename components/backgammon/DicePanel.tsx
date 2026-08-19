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

function DieFace({ value }: { value: number | null }) {
  if (value === null) {
    return <span className={styles.dieEmpty} aria-hidden />;
  }

  const pipClass = styles.diePip;
  const pips: Record<number, number[]> = {
    1: [5],
    2: [1, 9],
    3: [1, 5, 9],
    4: [1, 3, 7, 9],
    5: [1, 3, 5, 7, 9],
    6: [1, 3, 4, 6, 7, 9],
  };

  return (
    <span className={styles.die} aria-label={`Die ${value}`}>
      {pips[value]?.map((slot) => (
        <span key={slot} className={[pipClass, styles[`diePip${slot}`]].join(" ")} />
      ))}
    </span>
  );
}

export default function DicePanel({
  snapshot,
  onRoll,
  onEndTurn,
  busy,
}: Props) {
  const [dieA, dieB] = snapshot.dice.values ?? [null, null];
  const showDice = snapshot.dice.rolled && dieA !== null && dieB !== null;

  const canEndTurn =
    snapshot.isMyTurn &&
    snapshot.dice.rolled &&
    snapshot.legalMoves.length === 0;

  const turnSeat =
    snapshot.currentTurnSeat === "white" ? "سفید" : "مشکی";

  return (
    <div className={styles.dicePanel}>
      <div className={styles.statusBlock}>
        <div className={styles.turnLabel}>
          {snapshot.isMyTurn ? "نوبت شما" : `نوبت ${turnSeat}`}
        </div>
        <div className={styles.diceRow}>
          {showDice ? (
            <>
              <DieFace value={dieA} />
              <DieFace value={dieB} />
            </>
          ) : (
            <span className={styles.dicePlaceholder}>تاس بیندازید</span>
          )}
        </div>
      </div>

      <div className={styles.actions}>
        <button
          type="button"
          className={styles.rollButton}
          disabled={!snapshot.canRoll || busy}
          onClick={() => void onRoll()}
        >
          تاس
        </button>
        <button
          type="button"
          className={styles.endTurnButton}
          disabled={!canEndTurn || busy}
          onClick={() => void onEndTurn()}
        >
          پایان نوبت
        </button>
      </div>
    </div>
  );
}
