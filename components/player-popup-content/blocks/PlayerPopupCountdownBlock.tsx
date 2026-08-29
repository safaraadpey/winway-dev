"use client";

import { useEffect, useState } from "react";
import panelStyles from "@/components/room/gameRoomPanels.module.css";
import type { PlayerPopupCountdownBlock } from "@/lib/player-popup-content/types";
import styles from "../PlayerPopupContentSlot.module.css";

function getRemainingSeconds(
  endsAt: string,
  nowMs: number
): { totalSeconds: number; expired: boolean } {
  const targetMs = Date.parse(endsAt);
  if (!Number.isFinite(targetMs)) {
    return { totalSeconds: 0, expired: true };
  }

  const remainingMs = Math.max(0, targetMs - nowMs);
  return {
    totalSeconds: Math.floor(remainingMs / 1000),
    expired: remainingMs <= 0,
  };
}

/** Same MM:SS formatting as tournament active-cards timer. */
function formatTournamentTimer(seconds: number): string {
  const safeSeconds = Math.max(0, Math.floor(seconds));
  const mins = Math.floor(safeSeconds / 60)
    .toString()
    .padStart(2, "0");
  const secs = (safeSeconds % 60).toString().padStart(2, "0");
  return `${mins}:${secs}`;
}

export default function PlayerPopupCountdownBlockView({
  block,
}: {
  block: PlayerPopupCountdownBlock;
}) {
  const [nowMs, setNowMs] = useState(() => Date.now());

  useEffect(() => {
    const timer = window.setInterval(() => {
      setNowMs(Date.now());
    }, 1000);
    return () => window.clearInterval(timer);
  }, []);

  const { totalSeconds, expired } = getRemainingSeconds(block.endsAt, nowMs);

  return (
    <div className={styles.countdownShell}>
      <div className={styles.countdownBlock}>
        {block.title ? (
          <p className={styles.countdownTitle}>{block.title}</p>
        ) : null}
        {expired ? (
          <p className={styles.countdownExpired}>
            {block.expiredLabel ?? "رویداد شروع شده است"}
          </p>
        ) : (
          <div
            className={`${panelStyles.activeCardsTimerWrap} ${styles.countdownTimerSlot}`}
          >
            <span
              className={panelStyles.activeCardsTimer}
              dir="ltr"
              aria-live="polite"
              aria-atomic="true"
            >
              {formatTournamentTimer(totalSeconds)}
            </span>
          </div>
        )}
      </div>
      {block.body ? <p className={styles.countdownBody}>{block.body}</p> : null}
    </div>
  );
}
