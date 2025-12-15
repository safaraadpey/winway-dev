"use client";

import { useState } from "react";
import GameResultsDialog, { type Winner } from "@/components/GameResultsDialog";

const mockLine: Winner[] = [
  {
    id: "u1",
    avatarUrl: "https://placehold.co/96x96",
    nickname: "player7801",
    prizeAmount: 5000,
  },
  {
    id: "u2",
    avatarUrl: "https://placehold.co/96x96",
    nickname: "player7802",
    prizeAmount: 5000,
  },
];

const mockFull: Winner[] = [
  {
    id: "u3",
    avatarUrl: "https://placehold.co/96x96",
    nickname: "player7803",
    prizeAmount: 10000,
  },
];

export default function GameResultsPreview() {
  const [open, setOpen] = useState(true);

  return (
    <div className="min-h-screen bg-[#0E0E0F] text-white flex items-center justify-center">
      <button
        className="rounded-xl bg-blue-600 px-4 py-2 text-white font-bold"
        onClick={() => setOpen(true)}
      >
        نمایش دیالوگ نتایج
      </button>

      <GameResultsDialog
        isOpen={open}
        onClose={() => setOpen(false)}
        currentUserId={"u1"}
        lineWinners={mockLine}
        fullWinners={mockFull}
      />
    </div>
  );
}
