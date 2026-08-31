"use client";

import React from 'react';
import ActiveTableRow from './ActiveTableRow';

export interface ActiveTable {
  id: string;
  prize: number;
  players: number;
  cardCount: number;
  roundNo?: number | null;
  tableNo?: number | null;
  winnerNames?: string[];
  isFinished?: boolean;
  status?: string | null;
  isPlayerTable?: boolean;
}

const CLICKABLE_TABLE_STATUSES = new Set([
  "waiting",
  "playing",
  "live",
  "running",
  "settling",
  "settled",
  "finished",
]);

export function isActiveTableClickable(table: ActiveTable): boolean {
  const status = (table.status || "").trim().toLowerCase();
  if (!status) return true;

  return CLICKABLE_TABLE_STATUSES.has(status);
}

interface ActiveTablesPanelProps {
  tables: ActiveTable[];
  onTableClick?: (tableId: string) => void;
}

/**
 * پنل نمایش میزهای فعال
 */
export default function ActiveTablesPanel({ 
  tables, 
  onTableClick 
}: ActiveTablesPanelProps) {
  // ارتفاع تقریبی هر ردیف: 36px (py-1.5 = 6px top + 6px bottom + محتوای 24px)
  // فاصله بین ردیف‌ها: space-y-2 = 8px
  // 3.5 ردیف = (3 × 36px) + (0.5 × 36px) + (2.5 × 8px) = 108 + 18 + 20 = 146px
  const maxHeight = '146px'; // 3.5 ردیف

  return (
    <div className="space-y-3 bg-gray-800 rounded-lg p-4">
      <h3 className="text-green-400 font-semibold text-base text-center">
        میزهای فعال
      </h3>
      <div 
        className="space-y-2 overflow-y-auto [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]"
        style={{ maxHeight }}
      >
        {tables.length === 0 ? (
          <div className="bg-amber-50 rounded-lg px-4 py-8 text-center text-gray-500">
            هیچ میز فعالی وجود ندارد
          </div>
        ) : (
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
              isPlayerTable={table.isPlayerTable}
              onClick={
                onTableClick && isActiveTableClickable(table)
                  ? () => onTableClick(table.id)
                  : undefined
              }
            />
          ))
        )}
      </div>
    </div>
  );
}

