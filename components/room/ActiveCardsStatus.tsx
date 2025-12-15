"use client";

import React from "react";
import ActiveCardRow from "@/components/ActiveCardRow";

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
  const maxHeight = "146px"; // 3.5 rows based on existing spacing
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
    <div className="space-y-3 bg-[#161A26] border border-[rgba(98,103,111,1)] rounded-2xl p-3 mt-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-green-500 font-medium text-[2.5rem]">
            {timerLabel}
          </span>
          <svg
            className="w-6 h-6 text-white"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
            />
          </svg>
        </div>

        <span className="text-white text-sm font-medium">
          تعداد کارت فعال {totalCount}
        </span>
      </div>

      <div
        className="space-y-2 overflow-y-auto [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]"
        style={{ maxHeight }}
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
        <div className="bg-gray-300 rounded-xl px-4 py-3 text-center">
          <span className="text-[#2d2f36] text-sm font-medium">
            {waitingListMessage}
          </span>
        </div>
      )}
    </div>
  );
}
