"use client";

import React from "react";
import ActiveTableRow from "@/components/ActiveTableRow";
import { ActiveTable, isActiveTableClickable } from "@/components/ActiveTablesPanel";
import panelStyles from "@/components/room/gameRoomPanels.module.css";

interface ActiveTablesSectionProps {
  title?: string;
  titleClassName?: string;
  emptyMessage?: string;
  tables?: ActiveTable[];
  onTableClick?: (tableId: string) => void;
  hideWinnerNames?: boolean;
  className?: string;
}

export default function ActiveTablesSection({
  title = "میزهای فعال",
  titleClassName,
  emptyMessage = "هیچ میز فعالی وجود ندارد",
  tables = [],
  onTableClick,
  hideWinnerNames = false,
  className,
}: ActiveTablesSectionProps) {
  const hasTables = tables.length > 0;
  const maxHeight = "146px";

  return (
    <div
      className={`${panelStyles.activeCardsPanelSurface} space-y-3 rounded-2xl px-3 pt-[4px] pb-[6px] min-h-[200px]${
        className ? ` ${className}` : ""
      }`}
      data-tour-id="game-room-active-tables"
    >
      <div className={panelStyles.activeTablesTitleWrap}>
        <span className={panelStyles.activeTablesTitleLine} aria-hidden="true" />
        <h3 className={titleClassName ?? panelStyles.activeTablesTitle}>{title}</h3>
        <span className={panelStyles.activeTablesTitleLine} aria-hidden="true" />
      </div>

      <div
        className="space-y-2 overflow-y-auto [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]"
        style={{ maxHeight }}
      >
        {hasTables ? (
          tables.map((table) => (
            <ActiveTableRow
              key={table.id}
              prize={table.prize}
              players={table.players}
              cardCount={table.cardCount}
              roundNo={table.roundNo}
              tableNo={table.tableNo}
              winnerNames={table.winnerNames}
              isFinished={table.isFinished}
              hideWinnerNames={hideWinnerNames}
              isPlayerTable={table.isPlayerTable}
              onClick={
                onTableClick && isActiveTableClickable(table)
                  ? () => onTableClick(table.id)
                  : undefined
              }
            />
          ))
        ) : (
          <div className={panelStyles.activeTablesEmpty}>{emptyMessage}</div>
        )}
      </div>
    </div>
  );
}
