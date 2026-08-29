"use client";

import React from "react";
import panelStyles from "@/components/room/gameRoomPanels.module.css";

interface ActiveTableRowProps {
  prize: number;
  players: number;
  cardCount: number;
  roundNo?: number | null;
  tableNo?: number | null;
  winnerNames?: string[];
  isFinished?: boolean;
  onClick?: () => void;
}

const ROUND_TONE_COUNT = 6;

function tableRowToneClass(roundNo?: number | null): string {
  if (roundNo == null || !Number.isFinite(roundNo) || roundNo < 1) {
    return panelStyles.tableRowToneDefault;
  }
  const tone = ((Math.trunc(roundNo) - 1) % ROUND_TONE_COUNT) + 1;
  switch (tone) {
    case 1:
      return panelStyles.tableRowTone1;
    case 2:
      return panelStyles.tableRowTone2;
    case 3:
      return panelStyles.tableRowTone3;
    case 4:
      return panelStyles.tableRowTone4;
    case 5:
      return panelStyles.tableRowTone5;
    default:
      return panelStyles.tableRowTone6;
  }
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
  isFinished = false,
  onClick,
}: ActiveTableRowProps) {
  const formatNumber = (num: number): string => {
    return num.toLocaleString("fa-IR");
  };

  const hasWinners = Boolean(winnerNames && winnerNames.length > 0);
  const showResult = isFinished || hasWinners;
  const isClickable = Boolean(onClick);

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
      className={`${panelStyles.tableRow} ${tableRowToneClass(roundNo)} ${
        isClickable ? panelStyles.tableRowClickable : ""
      }`}
      onClick={isClickable ? onClick : undefined}
      role={isClickable ? "button" : undefined}
      tabIndex={isClickable ? 0 : undefined}
      onKeyDown={
        isClickable
          ? (e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onClick?.();
              }
            }
          : undefined
      }
    >
      <span className="text-gray-800 font-semibold text-sm shrink-0">{leftLabel}</span>
      {showResult ? (
        <span className="text-emerald-700 font-semibold text-sm text-left truncate">
          {hasWinners ? winnerNames!.join("، ") : "در حال تسویه..."}
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
