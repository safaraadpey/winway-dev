"use client";

import React from "react";
import type { BackgammonPublicSnapshot } from "@/lib/backgammon/useBackgammonSession";
import styles from "./WinnerOverlay.module.css";

type Props = {
  snapshot: BackgammonPublicSnapshot;
  onClose: () => void;
};

export default function WinnerOverlay({ snapshot, onClose }: Props) {
  if (snapshot.matchStatus !== "finished" || snapshot.winner === null || snapshot.canUndo) {
    return null;
  }

  const winnerLabel = snapshot.winner === snapshot.mySeat ? "You win!" : "Opponent wins";
  const seatLabel = snapshot.winner === 0 ? "White" : "Black";

  return (
    <div className={styles.overlay}>
      <div className={styles.card}>
        <div className={styles.title}>{winnerLabel}</div>
        <div className={styles.subtitle}>{seatLabel} won the match.</div>
        {snapshot.winKind ? (
          <div className={styles.winKind} dir="ltr">
            Result: {snapshot.winKind}
          </div>
        ) : null}
        <button type="button" className={styles.button} onClick={onClose}>
          Back to list
        </button>
      </div>
    </div>
  );
}
