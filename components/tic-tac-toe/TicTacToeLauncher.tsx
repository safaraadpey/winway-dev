"use client";

import React from "react";
import type { TicTacToePlacement } from "@/lib/tic-tac-toe/constants";
import { openTicTacToeModal } from "@/lib/tic-tac-toe/openTicTacToe";
import { useTicTacToeSettings } from "@/lib/tic-tac-toe/client";
import type { TicTacToePublicSettings } from "@/lib/tic-tac-toe/types";
import styles from "./TicTacToeLauncher.module.css";

type TicTacToeLauncherProps = {
  placement: TicTacToePlacement;
  compact?: boolean;
  /** When true (default), hide launcher if user lacks the feature flag. */
  requireFeature?: boolean;
  settings?: TicTacToePublicSettings | null;
};

export default function TicTacToeLauncher({
  placement,
  compact = false,
  requireFeature = true,
  settings: settingsProp,
}: TicTacToeLauncherProps) {
  const fetched = useTicTacToeSettings();
  const settings = settingsProp ?? fetched.settings;
  const loading = settingsProp ? false : fetched.loading;

  if (loading || !settings) return null;
  if (!settings.isEnabled) return null;
  if (requireFeature && !settings.featureEnabled) return null;
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
