"use client";

import type { ReactNode } from "react";
import PlayerPopupContentSlot from "@/components/player-popup-content/PlayerPopupContentSlot";
import type { PlayerPopupContentFeed } from "@/lib/player-popup-content/types";
import styles from "./PlayerPopupShell.module.css";

export type PlayerPopupShellVariant = "default" | "tournament_break";

export type PlayerPopupShellProps = {
  title: string;
  icon?: ReactNode;
  popupContent?: PlayerPopupContentFeed;
  children?: ReactNode;
  variant?: PlayerPopupShellVariant;
  showCloseButton?: boolean;
  onClose?: () => void;
  bodyPlaceholder?: string;
};

function DefaultCloseIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M18 6L6 18M6 6l12 12"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
      />
    </svg>
  );
}

export default function PlayerPopupShell({
  title,
  icon,
  popupContent,
  children,
  variant = "default",
  showCloseButton = false,
  onClose,
  bodyPlaceholder,
}: PlayerPopupShellProps) {
  return (
    <div
      className={`${styles.shell} ${
        variant === "tournament_break" ? styles.shellTournamentBreak : ""
      }`}
      role="group"
      aria-label={title}
    >
      <div className={styles.header}>
        <div className={styles.titleGroup}>
          {icon ? <span className={styles.titleIcon}>{icon}</span> : null}
          <h2 className={styles.title}>{title}</h2>
        </div>
        {showCloseButton ? (
          <button
            type="button"
            className={styles.closeButton}
            onClick={onClose}
            aria-label="بستن"
          >
            <DefaultCloseIcon />
          </button>
        ) : null}
      </div>

      <PlayerPopupContentSlot {...popupContent} />

      <div className={styles.body}>
        {children}
        {bodyPlaceholder ? (
          <div className={styles.bodyPlaceholder}>{bodyPlaceholder}</div>
        ) : null}
      </div>
    </div>
  );
}
