"use client";

import React from "react";
import { useRouter } from "next/navigation";
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
        className={styles.signupButton}
        onClick={() => router.push(signupPath)}
      >
        دعوت به ثبت‌نام
      </button>
    </div>
  );
}
