"use client";

import React from 'react';

interface ActiveTableRowProps {
  prize: number;
  players: number;
  cardCount: number;
  roundNo?: number | null;
  tableNo?: number | null;
  winnerNames?: string[];
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
  tableNo,
  winnerNames,
  onClick,
}: ActiveTableRowProps) {
  const formatNumber = (num: number): string => {
    return num.toLocaleString("fa-IR");
  };

  const hasWinners = Boolean(winnerNames && winnerNames.length > 0);

  const leftLabel = (() => {
    if (roundNo != null) {
      const roundLabel = `راند ${roundNo.toLocaleString("fa-IR")}`;
      if (tableNo != null) {
        return `${roundLabel} · میز ${tableNo.toLocaleString("fa-IR")}`;
      }
      return roundLabel;
    }
    return formatNumber(prize);
  })();

  return (
    <div
      className={`
        bg-amber-50 rounded-lg px-3 py-1.5
        flex items-center justify-between gap-2
        ${onClick ? "cursor-pointer hover:bg-amber-100 active:bg-amber-200 transition-colors" : ""}
      `}
      onClick={onClick}
      role={onClick ? "button" : undefined}
      tabIndex={onClick ? 0 : undefined}
      onKeyDown={
        onClick
          ? (e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onClick();
              }
            }
          : undefined
      }
    >
      <span className="text-gray-800 font-semibold text-sm shrink-0">{leftLabel}</span>
      {hasWinners ? (
        <span className="text-emerald-700 font-semibold text-sm text-left truncate">
          {winnerNames!.join("، ")}
        </span>
      ) : (
        <div className="flex items-center gap-4 shrink-0">
          <span className="text-gray-600 text-sm">{players} نفر</span>
          <span className="text-gray-600 text-sm">{cardCount} برگ</span>
        </div>
      )}
    </div>
  );
}

