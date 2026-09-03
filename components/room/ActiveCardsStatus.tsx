"use client";

import React from "react";
import ActiveCardRow from "@/components/ActiveCardRow";
import panelStyles from "@/components/room/gameRoomPanels.module.css";

export interface ActiveCardStatus {
  id: string;
  title: string;
  count: number;
}

interface ActiveCardsStatusProps {
  cards: ActiveCardStatus[];
  secondsRemaining?: number;
  minPlayers?: number;
  waitingListMessage?: string;
  useLongCountdown?: boolean;
  loading?: boolean;
}

export default function ActiveCardsStatus({
  cards,
  secondsRemaining,
  minPlayers,
  waitingListMessage = "شما اولین نفر لیست انتظار خواهید بود",
  useLongCountdown = false,
  loading = false,
}: ActiveCardsStatusProps) {
  const totalCount = cards.reduce((sum, card) => sum + card.count, 0);
  const formatTime = (seconds: number): string => {
    const safeSeconds = Math.max(0, Math.floor(seconds));
    if (useLongCountdown) {
      const days = Math.floor(safeSeconds / 86400);
      const hours = Math.floor((safeSeconds % 86400) / 3600)
        .toString()
        .padStart(2, "0");
      const mins = Math.floor((safeSeconds % 3600) / 60)
        .toString()
        .padStart(2, "0");
      const secs = Math.floor(safeSeconds % 60)
        .toString()
        .padStart(2, "0");
      return `${days}:${hours}:${mins}:${secs}`;
    }
    const mins = Math.floor(safeSeconds / 60)
      .toString()
      .padStart(2, "0");
    const secs = (safeSeconds % 60).toString().padStart(2, "0");
    return `${mins}:${secs}`;
  };
  const timerLabel = formatTime(secondsRemaining ?? 0);

  return (
    <div
      className={`${panelStyles.activeCardsPanelSurface} space-y-3 rounded-2xl px-3 pt-5 pb-5 mt-3 h-[200px] min-h-[200px] flex flex-col`}
      data-tour-id="game-room-waiting-status"
    >
      <div className={panelStyles.activeCardsHeader}>
        <div className={panelStyles.activeCardsTimerWrap}>
          <span className={panelStyles.activeCardsTimer}>{timerLabel}</span>
          <svg
            className={panelStyles.activeCardsTimerIcon}
            viewBox="0 0 24 24"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
            aria-hidden="true"
          >
            <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="2" />
            <path
              d="M12 7v5l3 2"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </div>

        <div className={panelStyles.activeCardsMetaWrap}>
          {minPlayers != null && minPlayers > 0 && (
            <span className={panelStyles.activeCardsMeta}>
              شروع با {minPlayers} نفر
            </span>
          )}
          <span className={panelStyles.activeCardsMeta}>
            مجموع کارتها {totalCount}
          </span>
        </div>
      </div>

      <div className="flex-1 space-y-2 overflow-y-auto [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
        {cards.length === 0 ? (
          loading ? null : (
            <div className={panelStyles.activeCardsEmpty}>
              هیچ کارت فعالی وجود ندارد
            </div>
          )
        ) : (
          cards.map((card) => (
            <ActiveCardRow key={card.id} title={card.title} count={card.count} />
          ))
        )}
      </div>

      {cards.length === 0 && !loading && (
        <div className={panelStyles.activeCardsWaitingBanner}>
          <span className={panelStyles.activeCardsWaitingText}>
            {waitingListMessage}
          </span>
        </div>
      )}
    </div>
  );
}
