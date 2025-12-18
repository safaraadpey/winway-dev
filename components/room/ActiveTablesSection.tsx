"use client";

import React from "react";
import ActiveTableRow from "@/components/ActiveTableRow";
import { ActiveTable } from "@/components/ActiveTablesPanel";
import activeCardsBg from "@/src/assets/logo/ActiveCardsBG.png";

interface ActiveTablesSectionProps {
  title?: string;
  emptyMessage?: string;
  tables?: ActiveTable[];
  onTableClick?: (tableId: string) => void;
}

export default function ActiveTablesSection({
  title = "میزهای فعال",
  emptyMessage = "هیچ میز فعالی وجود ندارد",
  tables = [],
  onTableClick,
}: ActiveTablesSectionProps) {
  const hasTables = tables.length > 0;
  const maxHeight = "146px"; // 3.5 rows based on existing spacing

  return (
    <div
      className="space-y-3 border border-transparent rounded-lg px-3 pt-[4px] pb-[6px] mt-[9px] min-h-[200px]"
      style={{
        backgroundImage: `url(${activeCardsBg.src})`,
        backgroundRepeat: "no-repeat",
        backgroundPosition: "center",
        backgroundSize: "100% 100%",
        backgroundColor: "#171A26",
      }}
    >
      <h3 className="text-green-400 font-semibold text-base text-center">
        {title}
      </h3>

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
              onClick={onTableClick ? () => onTableClick(table.id) : undefined}
            />
          ))
        ) : (
          <div className="bg-amber-50 rounded-lg px-4 py-8 text-center text-gray-500">
            {emptyMessage}
          </div>
        )}
      </div>
    </div>
  );
}
