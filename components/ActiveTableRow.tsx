"use client";

import React from 'react';

interface ActiveTableRowProps {
  prize: number;
  players: number;
  cardCount: number;
  roundNo?: number | null;
  onClick?: () => void;
}

/**
 * ردیف نمایش میز فعال
 */
export default function ActiveTableRow({ 
  prize, 
  players, 
  cardCount,
  roundNo,
  onClick 
}: ActiveTableRowProps) {
  const formatNumber = (num: number): string => {
    return num.toLocaleString('fa-IR');
  };

  return (
    <div 
      className={`
        bg-amber-50 rounded-lg px-3 py-1.5 
        flex items-center justify-between
        ${onClick ? 'cursor-pointer hover:bg-amber-100 active:bg-amber-200 transition-colors' : ''}
      `}
      onClick={onClick}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      onKeyDown={onClick ? (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onClick();
        }
      } : undefined}
    >
      <span className="text-gray-800 font-semibold text-sm">
        {roundNo != null ? `راند ${roundNo.toLocaleString("fa-IR")}` : formatNumber(prize)}
      </span>
      <div className="flex items-center gap-4">
        <span className="text-gray-600 text-sm">{players} نفر</span>
        <span className="text-gray-600 text-sm">{cardCount} برگ</span>
      </div>
    </div>
  );
}

