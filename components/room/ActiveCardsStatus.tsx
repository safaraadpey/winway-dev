"use client";

import React from "react";
import Image from "next/image";
import ActiveCardRow from "@/components/ActiveCardRow";
import activeCardsBg from "@/src/assets/logo/ActiveCardsBG.png";
import hourglassPng from "@/src/assets/logo/hourglass.png";

export interface ActiveCardStatus {
  id: string;
  title: string;
  count: number;
}

interface ActiveCardsStatusProps {
  cards: ActiveCardStatus[];
  secondsRemaining?: number;
  waitingListMessage?: string;
}

export default function ActiveCardsStatus({
  cards,
  secondsRemaining,
  waitingListMessage = "شما اولین نفر لیست انتظار خواهید بود",
}: ActiveCardsStatusProps) {
  const totalCount = cards.reduce((sum, card) => sum + card.count, 0);
  const formatTime = (seconds: number): string => {
    const safeSeconds = Math.max(0, Math.floor(seconds));
    const mins = Math.floor(safeSeconds / 60)
      .toString()
      .padStart(2, "0");
    const secs = (safeSeconds % 60).toString().padStart(2, "0");
    return `${mins}:${secs}`;
  };
  const timerLabel = formatTime(secondsRemaining ?? 0);

  return (
    <div
      className="space-y-3 border border-transparent rounded-2xl px-3 pt-5 pb-5 mt-3 h-[200px] min-h-[200px] flex flex-col"
      style={{
        backgroundImage: `url(${activeCardsBg.src})`,
        backgroundRepeat: "no-repeat",
        backgroundPosition: "center",
        backgroundSize: "100% 100%",
        backgroundColor: "#161A26",
      }}
    >
      <div className="flex items-center justify-between h-[39px] max-h-[40px]">
        <div className="flex items-center gap-2">
          <span className="text-green-500 font-medium text-[2.5rem]">
            {timerLabel}
          </span>
          <Image
            src={hourglassPng}
            alt="hourglass"
            width={24}
            height={24}
            className="w-6 h-6"
            priority={false}
          />
        </div>

        <span className="text-white text-sm font-medium">
          تعداد کارت فعال {totalCount}
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
