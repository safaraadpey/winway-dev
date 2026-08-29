"use client";

import React from "react";
import { useRouter } from "next/navigation";
import styles from "./WatchInviteGuestModals.module.css";

type WatchInviteGuestLiveBlockModalProps = {
  open: boolean;
  signupPath: string;
  onClose: () => void;
};

export default function WatchInviteGuestLiveBlockModal({
  open,
  signupPath,
  onClose,
}: WatchInviteGuestLiveBlockModalProps) {
  const router = useRouter();

  if (!open) return null;

  return (
    <div
      className={styles.overlay}
      role="presentation"
      onClick={onClose}
    >
      <div
        className={styles.modal}
        role="dialog"
        aria-modal="true"
        aria-labelledby="watch-guest-live-block-title"
        onClick={(e) => e.stopPropagation()}
      >
        <p id="watch-guest-live-block-title" className={styles.message}>
          ظرفیت تماشای مهمان تکمیل شده. برای دیدن بازی زنده ثبت‌نام کنید.
        </p>
        <button
          type="button"
          className={styles.signupButton}
          onClick={() => router.push(signupPath)}
        >
          دعوت به ثبت‌نام
        </button>
      </div>
    </div>
  );
}
