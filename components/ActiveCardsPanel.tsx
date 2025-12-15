"use client";

import React from 'react';
import ActiveCardRow from './ActiveCardRow';

export interface ActiveCard {
  id: string;
  title: string;
  count: number;
}

interface ActiveCardsPanelProps {
  cards: ActiveCard[];
  totalCount: number;
  secondsRemaining?: number;
  waitingListMessage?: string;
}

/**
 * پنل نمایش کارت‌های فعال با شمارنده معکوس ادغام شده
 */
export default function ActiveCardsPanel({ 
  cards, 
  totalCount,
  secondsRemaining,
  waitingListMessage = "شما اولین نفر لیست انتظار خواهید بود"
}: ActiveCardsPanelProps) {
  // ارتفاع تقریبی هر ردیف: 36px (py-1.5 = 6px top + 6px bottom + محتوای 24px)
  // فاصله بین ردیف‌ها: space-y-2 = 8px
  // 3.5 ردیف = (3 × 36px) + (0.5 × 36px) + (2.5 × 8px) = 108 + 18 + 20 = 146px
  const maxHeight = '146px'; // 3.5 ردیف

  return (
    <div className="space-y-3 bg-gray-800 rounded-2xl p-4">
      {/* بخش بالایی: شمارنده معکوس + تعداد کارت فعال */}
      <div className="flex items-center justify-between">
        {/* شمارنده معکوس در سمت چپ */}
        <div className="flex items-center gap-2">
          <span className="text-green-500 font-bold text-3xl">
            {secondsRemaining !== undefined ? secondsRemaining : 0}
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

        {/* تعداد کارت فعال در سمت راست */}
        <span className="text-white text-sm font-medium">
          تعداد کارت فعال {totalCount}
        </span>
      </div>

      {/* لیست کارت‌های فعال */}
      <div 
        className="space-y-2 overflow-y-auto [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]"
        style={{ maxHeight }}
      >
        {cards.length === 0 ? (
          <div className="bg-white rounded-lg px-4 py-8 text-center text-gray-500">
            هیچ کارت فعالی وجود ندارد
          </div>
        ) : (
          cards.map((card) => (
            <ActiveCardRow
              key={card.id}
              title={card.title}
              count={card.count}
            />
          ))
        )}
      </div>

      {/* باکس پیام لیست انتظار */}
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
