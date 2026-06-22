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
  tournamentStatus?: string | null;
  currentRoundNo?: number | null;
  waitingListMessage?: string;
  useLongCountdown?: boolean; // روز:ساعت:دقیقه:ثانیه
}

export default function TournamentActiveCardsStatus({
  cards,
  secondsRemaining,
  tournamentStatus,
  currentRoundNo,
  waitingListMessage = "اولین نفر باشید که در تورنومنت ثبت نام میکنید",
  useLongCountdown = false,
}: TournamentActiveCardsStatusProps) {
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
  const safeSeconds = secondsRemaining ?? 0;
  const isFinished = tournamentStatus === "finished";
  const showRoundStatus = safeSeconds <= 0;
  const timerLabel = formatTime(safeSeconds);
  const roundLabel = currentRoundNo != null ? `راند ${currentRoundNo}` : "راند";
  const statusLabel = isFinished
    ? "پایان یافته"
    : showRoundStatus
      ? `${roundLabel} درحال اجرا`
      : timerLabel;

  return (
    <div
      className={`${panelStyles.activeCardsPanelSurface} space-y-3 rounded-2xl px-3 pt-5 pb-5 mt-3 h-[200px] min-h-[200px] flex flex-col`}
    >
      <div className="flex items-center justify-between h-[39px] max-h-[40px]">
        <div className="flex items-center gap-2">
          <span className="text-green-500 font-medium text-[20px]">
            {statusLabel}
          </span>
          {!showRoundStatus && (
            <Image
              src={hourglassPng}
              alt="hourglass"
              width={24}
              height={24}
              className="w-6 h-6"
              priority={false}
            />
          )}
        </div>

        <span className="text-white text-sm font-medium">
          مجموع کارتها {totalCount}
        </span>
      </div>

      <div
        className="flex-1 space-y-2 overflow-y-auto [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]"
      >
        {cards.length === 0 ? (
          <div className="bg-white rounded-lg px-4 py-2 text-center text-gray-500">
            هیچ کارت فعالی وجود ندارد
          </div>
        ) : (
          cards.map((card) => (
            <ActiveCardRow key={card.id} title={card.title} count={card.count} />
          ))
        )}
      </div>

      {cards.length === 0 && (
        <div className="bg-gray-300 rounded-xl px-4 py-[13px] text-center !mt-0">
          <span className="text-[#2d2f36] text-sm font-medium">
            {waitingListMessage}
          </span>
        </div>
      )}
    </div>
  );
}


