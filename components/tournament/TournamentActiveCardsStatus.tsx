"use client";

import React from "react";
import Image from "next/image";
import ActiveCardRow from "@/components/ActiveCardRow";
import panelStyles from "@/components/room/gameRoomPanels.module.css";
import hourglassPng from "@/src/assets/logo/hourglass.png";

export interface TournamentActiveCardStatus {
  id: string;
  title: string;
  count: number;
}

interface TournamentActiveCardsStatusProps {
  cards: TournamentActiveCardStatus[];
  secondsRemaining?: number;
  countdownKind?: "tournament_start" | "round_break" | null;
  tournamentStatus?: string | null;
  currentRoundNo?: number | null;
  waitingListMessage?: string;
  useLongCountdown?: boolean;
}

export default function TournamentActiveCardsStatus({
  cards,
  secondsRemaining,
  countdownKind = null,
  tournamentStatus,
  currentRoundNo,
  waitingListMessage = "اولین نفر باشید که در تورنومنت ثبت نام میکنید",
  useLongCountdown = false,
}: TournamentActiveCardsStatusProps) {
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
  const safeSeconds = secondsRemaining ?? 0;
  const isFinished =
    tournamentStatus === "finished" || tournamentStatus === "settling";
  const showRoundStatus = safeSeconds <= 0;
  const timerLabel = formatTime(safeSeconds);
  const roundLabel = currentRoundNo != null ? `راند ${currentRoundNo}` : "راند";
  const statusLabel = isFinished
    ? "پایان یافته"
    : showRoundStatus
      ? `${roundLabel} درحال اجرا`
      : timerLabel;
  const countdownAnnouncement =
    countdownKind === "round_break"
      ? "زمان استراحت بین راندها"
      : countdownKind === "tournament_start"
        ? "زمان شروع تورنومنت"
        : null;

  return (
    <div
      className={`${panelStyles.activeCardsPanelSurface} space-y-3 rounded-2xl px-3 pt-5 pb-5 h-[200px] min-h-[200px] flex flex-col`}
    >
      <div className={panelStyles.activeCardsHeader}>
        <div className={panelStyles.activeCardsTimerWrap}>
          <span
            className={panelStyles.activeCardsTimer}
            dir={!showRoundStatus ? "ltr" : undefined}
          >
            {statusLabel}
          </span>
          {!showRoundStatus && (
            <Image
              src={hourglassPng}
              alt=""
              width={24}
              height={24}
              className="w-6 h-6"
              priority={false}
            />
          )}
        </div>

        {countdownAnnouncement ? (
          <span className={panelStyles.activeCardsAnnouncement}>
            {countdownAnnouncement}
          </span>
        ) : null}
      </div>

      <div className="flex-1 space-y-2 overflow-y-auto [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
        {cards.length === 0 ? (
          <div className={panelStyles.activeCardsEmpty}>
            هیچ کارت فعالی وجود ندارد
          </div>
        ) : (
          cards.map((card) => (
            <ActiveCardRow key={card.id} title={card.title} count={card.count} />
          ))
        )}
      </div>

      {cards.length === 0 && !isFinished && (
        <div className={panelStyles.activeCardsWaitingBanner}>
          <span className={panelStyles.activeCardsWaitingText}>
            {waitingListMessage}
          </span>
        </div>
      )}
    </div>
  );
}
