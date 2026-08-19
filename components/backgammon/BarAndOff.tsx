"use client";

import React from "react";
import type { Move } from "@dingmoney/backgammon-engine";
import type { BackgammonPublicSnapshot } from "@/lib/backgammon/useBackgammonSession";
import styles from "./BarAndOff.module.css";

type Props = {
  snapshot: BackgammonPublicSnapshot;
  selectedFrom: string | null;
  legalByFrom: Map<string, Move[]>;
  onSelectFrom: (value: string | null) => void;
  onMove: (move: Move) => Promise<void>;
  disabled?: boolean;
};

export default function BarAndOff({
  snapshot,
  selectedFrom,
  legalByFrom,
  onSelectFrom,
  onMove,
  disabled,
}: Props) {
  const myColor = snapshot.mySeat === 0 ? "white" : "black";
  const barCount =
    snapshot.mySeat === 0
      ? snapshot.board.bar.white
      : snapshot.board.bar.black;
  const offCount =
    snapshot.mySeat === 0
      ? snapshot.board.borneOff.white
      : snapshot.board.borneOff.black;

  const barMoves = legalByFrom.get("bar") ?? [];
  const barSelectable =
    snapshot.isMyTurn && !disabled && barMoves.length > 0;

  return (
    <div className={styles.barOffRow}>
      <button
        type="button"
        className={[
          styles.panel,
          barSelectable ? styles.clickable : "",
          selectedFrom === "bar" ? styles.selected : "",
        ]
          .filter(Boolean)
          .join(" ")}
        disabled={!barSelectable}
        onClick={() => {
          if (!barSelectable) return;
          onSelectFrom(selectedFrom === "bar" ? null : "bar");
        }}
      >
        <div className={styles.panelTitle}>Bar ({myColor})</div>
        <div className={styles.panelValue} dir="ltr">
          {barCount}
        </div>
      </button>

      <div className={styles.panel}>
        <div className={styles.panelTitle}>Dice left</div>
        <div className={styles.panelValue} dir="ltr">
          {snapshot.dice.remaining.join(", ") || "—"}
        </div>
      </div>

      <div className={styles.panel}>
        <div className={styles.panelTitle}>Borne off ({myColor})</div>
        <div className={styles.panelValue} dir="ltr">
          {offCount}
        </div>
      </div>

      {selectedFrom === "bar" && barMoves.length > 0 ? (
        <div className={styles.panel} style={{ gridColumn: "1 / -1" }}>
          <div className={styles.panelTitle}>Bar entry targets</div>
          {barMoves.map((move) => (
            <button
              key={`bar-${String(move.to)}-${move.dieUsed}`}
              type="button"
              className={styles.clickable}
              onClick={() => {
                onSelectFrom(null);
                void onMove(move);
              }}
            >
              <span className={styles.panelValue} dir="ltr">
                → {String(move.to)} ({move.dieUsed})
              </span>
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
