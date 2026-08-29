"use client";

import React from "react";
import { useRouter } from "next/navigation";
import panelStyles from "@/components/room/gameRoomPanels.module.css";
import styles from "./WatchInviteGuestPanel.module.css";

type WatchInviteGuestPanelProps = {
  signupPath: string;
};

export default function WatchInviteGuestPanel({ signupPath }: WatchInviteGuestPanelProps) {
  const router = useRouter();

  return (
    <div className={styles.root}>
      <button
        type="button"
        className={`${panelStyles.tournamentConfirmButton} ${styles.signupButton}`}
        onClick={() => router.push(signupPath)}
      >
        <span className={styles.signupButtonContent}>
          <span className={styles.signupButtonIcon} aria-hidden="true">
            🏆
          </span>
          <span className={styles.signupButtonText}>
            ثبت‌نام کن، شاید برنده بعدی تو باشی
          </span>
          <span className={styles.signupButtonIcon} aria-hidden="true">
            🏆
          </span>
        </span>
      </button>
    </div>
  );
}
