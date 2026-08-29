"use client";

import React from "react";
import { useRouter } from "next/navigation";
import panelStyles from "@/components/room/gameRoomPanels.module.css";
import styles from "./WatchInviteGuestPanel.module.css";

type WatchInviteGuestSignupButtonProps = {
  signupPath: string;
  label?: string;
};

const DEFAULT_SIGNUP_LABEL = "همین الان ثبت‌نام کن و از دبرنا لذت ببر";

export default function WatchInviteGuestSignupButton({
  signupPath,
  label = DEFAULT_SIGNUP_LABEL,
}: WatchInviteGuestSignupButtonProps) {
  const router = useRouter();

  return (
    <button
      type="button"
      className={`${panelStyles.tournamentConfirmButton} ${styles.signupButton}`}
      onClick={() => router.push(signupPath)}
    >
      <span className={styles.signupButtonContent}>
        <span className={styles.signupButtonIcon} aria-hidden="true">
          🏆
        </span>
        <span className={styles.signupButtonText}>{label}</span>
        <span className={styles.signupButtonIcon} aria-hidden="true">
          🏆
        </span>
      </span>
    </button>
  );
}
