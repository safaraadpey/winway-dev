"use client";

import { useMemo } from "react";
import { createTournamentBreakSampleFeed } from "@/lib/player-popup-content/fixtures/tournament-break.sample";
import { PLAYER_POPUP_SURFACE } from "@/lib/player-popup-content/surfaces";
import PlayerPopupShell from "./PlayerPopupShell";
import styles from "./PlayerPopupShell.module.css";

function TournamentBreakIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M8 4h8v3a4 4 0 01-8 0V4zM6 6H4v1a4 4 0 004 4M18 6h2v1a4 4 0 01-4 4M9 14h6l1 4H8l1-4z"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function PopupSlotReferenceIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <rect x="4" y="4" width="16" height="16" rx="3" stroke="currentColor" strokeWidth="2" />
      <path d="M8 9h8M8 12h8M8 15h5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

/**
 * Admin/design preview: base popup shell, then Tournament Break copy below it.
 */
export default function PlayerPopupContentDesignLab() {
  const tournamentBreakFeed = useMemo(
    () => createTournamentBreakSampleFeed({ breakMinutes: 12 }),
    []
  );

  return (
    <div className={styles.previewStack}>
      <section className={styles.previewFrame}>
        <p className={styles.previewLabel}>Popup Content Slot (reference)</p>
        <PlayerPopupShell
          title="Popup Content Slot"
          icon={<PopupSlotReferenceIcon />}
          bodyPlaceholder="محتوای بازی / modal consumer در این ناحیه رندر می‌شود."
        />
      </section>

      <section className={styles.previewFrame}>
        <p className={styles.previewLabel}>
          Tournament Break popup — surface: {PLAYER_POPUP_SURFACE.TOURNAMENT_BREAK}
        </p>
        <PlayerPopupShell
          title="Tournament Break popup"
          icon={<TournamentBreakIcon />}
          variant="tournament_break"
          popupContent={tournamentBreakFeed}
          bodyPlaceholder="بازی یا محتوای اصلی پلیر در زمان break در این بخش ادامه دارد."
        />
      </section>
    </div>
  );
}
