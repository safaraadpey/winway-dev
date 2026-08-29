"use client";

import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import PlayerPopupContentSlot from "@/components/player-popup-content/PlayerPopupContentSlot";
import TicTacToePopupBodyPreview from "@/components/player-popup-content/TicTacToePopupBodyPreview";
import type { PlayerPopupContentFeed } from "@/lib/player-popup-content/types";
import ticStyles from "@/components/tic-tac-toe/TicTacToeModal.module.css";
import styles from "./PlayerPopupFullPreviewOverlay.module.css";

type PlayerPopupFullPreviewOverlayProps = {
  open: boolean;
  onClose: () => void;
  popupContent: PlayerPopupContentFeed;
};

function CloseIcon() {
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

export default function PlayerPopupFullPreviewOverlay({
  open,
  onClose,
  popupContent,
}: PlayerPopupFullPreviewOverlayProps) {
  const modalRootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;

    const html = document.documentElement;
    const body = document.body;
    const savedHtmlOverflow = html.style.overflow;
    const savedBodyOverflow = body.style.overflow;
    const savedBodyOverflowY = body.style.overflowY;

    html.style.overflow = "hidden";
    body.style.overflow = "hidden";
    body.style.overflowY = "hidden";

    const preventBackgroundScroll = (event: Event) => {
      const modalRoot = modalRootRef.current;
      const target = event.target;
      if (modalRoot && target instanceof Node && modalRoot.contains(target)) {
        return;
      }
      event.preventDefault();
    };

    document.addEventListener("touchmove", preventBackgroundScroll, {
      passive: false,
    });
    document.addEventListener("wheel", preventBackgroundScroll, { passive: false });

    return () => {
      document.removeEventListener("touchmove", preventBackgroundScroll);
      document.removeEventListener("wheel", preventBackgroundScroll);
      html.style.overflow = savedHtmlOverflow;
      body.style.overflow = savedBodyOverflow;
      body.style.overflowY = savedBodyOverflowY;
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, onClose]);

  if (!open || typeof document === "undefined") {
    return null;
  }

  const popupDismissible = popupContent?.dismissible !== false;

  return createPortal(
    <div
      ref={modalRootRef}
      className={ticStyles.overlay}
      data-player-popup-full-preview
      onClick={onClose}
      role="presentation"
    >
      <div className={ticStyles.shellFrame}>
        <div
          className={`${ticStyles.modal} ${styles.previewModal}`}
          role="dialog"
          aria-modal="true"
          aria-labelledby="player-popup-full-preview-title"
          onClick={(event) => event.stopPropagation()}
        >
          <div className={styles.previewTopBar}>
            <p
              id="player-popup-full-preview-title"
              className={styles.previewBadge}
            >
              پیش‌نمایش کامل
            </p>
            {popupDismissible ? (
              <button
                type="button"
                className={`${ticStyles.closeButton} ${styles.previewCloseButton}`}
                onClick={onClose}
                aria-label="بستن پیش‌نمایش"
              >
                <CloseIcon />
              </button>
            ) : null}
          </div>

          <PlayerPopupContentSlot
            {...popupContent}
            className={ticStyles.popupContentSlot}
          />

          <TicTacToePopupBodyPreview />

          <p className={styles.previewFootnote}>
            بدنه دوz در این پیش‌نمایش ثابت است؛ slot بالا از نمونه Tournament Break
            تغذیه می‌شود.
          </p>
        </div>
      </div>
    </div>,
    document.body
  );
}
