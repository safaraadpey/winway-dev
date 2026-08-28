"use client";

import React from "react";
import type { TicTacToePlacement } from "@/lib/tic-tac-toe/constants";
import { openTicTacToeModal } from "@/lib/tic-tac-toe/openTicTacToe";
import { useTicTacToeSettings } from "@/lib/tic-tac-toe/client";
import styles from "./TicTacToeLauncher.module.css";

type TicTacToeLauncherProps = {
  placement: TicTacToePlacement;
  compact?: boolean;
};

export default function TicTacToeLauncher({
  placement,
  compact = false,
}: TicTacToeLauncherProps) {
  const { settings, loading } = useTicTacToeSettings();

  if (loading || !settings) return null;
  if (!settings.featureEnabled || !settings.isEnabled) return null;
  if (!settings.placements.includes(placement)) return null;

  return (
    <button
      type="button"
      className={`${styles.launcherButton} ${
        compact ? styles.launcherButtonCompact : ""
      }`}
      onClick={openTicTacToeModal}
      aria-label="بازی دوز"
      data-tour-id={`tic-tac-toe-launcher-${placement}`}
    >
      {compact ? (
        <span className={styles.launcherIcon} aria-hidden="true">
          #
        </span>
      ) : (
        <>
          <span className={styles.launcherText}>
            <span className={styles.launcherTitle}>مینی‌گیم دوز</span>
            <span className={styles.launcherSubtitle}>Player vs Machine</span>
          </span>
          <span className={`${styles.launcherPrize} numeric-text numeric-text--14`} dir="ltr">
            +{settings.winPrizeDing.toLocaleString("en-US")} Ding
          </span>
        </>
      )}
    </button>
  );
}
