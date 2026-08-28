"use client";

import React from "react";
import TicTacToeLauncher from "@/components/tic-tac-toe/TicTacToeLauncher";
import { useTicTacToeSettings } from "@/lib/tic-tac-toe/client";
import styles from "./TicTacToeSettingsEntry.module.css";

export default function TicTacToeSettingsEntry() {
  const { settings, loading, error, refresh } = useTicTacToeSettings();

  if (loading) {
    return (
      <p className={styles.statusText} aria-live="polite">
        در حال بارگذاری مینی‌گیم‌ها...
      </p>
    );
  }

  if (error) {
    return (
      <div className={styles.statusBlock}>
        <p className={styles.statusText}>بارگذاری مینی‌گیم دوز ممکن نشد.</p>
        <button type="button" className={styles.retryButton} onClick={() => void refresh()}>
          تلاش مجدد
        </button>
      </div>
    );
  }

  if (!settings?.isEnabled) {
    return (
      <p className={styles.statusText}>
        مینی‌گیم دوز فعلاً توسط ادمین غیرفعال شده است.
      </p>
    );
  }

  if (!settings.placements.includes("player_settings")) {
    return (
      <p className={styles.statusText}>
        ورود مینی‌گیم دوز از تنظیمات غیرفعال است.
      </p>
    );
  }

  return (
    <TicTacToeLauncher
      placement="player_settings"
      requireFeature={false}
      settings={settings}
    />
  );
}
