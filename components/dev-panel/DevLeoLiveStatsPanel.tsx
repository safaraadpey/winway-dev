"use client";

import type { LeoLiveStats } from "@/src/types/leo";

function StatItem({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: "violet" | "amber" | "sky";
}) {
  const toneClass =
    tone === "violet" ? "text-violet-300" : tone === "amber" ? "text-amber-300" : "text-sky-300";

  return (
    <div className="rounded-lg border border-gray-800 bg-[#1a1a1a] px-3 py-2">
      <div className="text-[11px] text-gray-500">{label}</div>
      <div className={`numeric-text numeric-text--18 mt-0.5 font-semibold ${toneClass}`} dir="ltr">
        {value.toLocaleString("en-US")}
      </div>
    </div>
  );
}

export default function DevLeoLiveStatsPanel({
  stats,
  pendingEventCount,
}: {
  stats: LeoLiveStats;
  pendingEventCount: number;
}) {
  return (
    <div className="space-y-2 rounded-xl border border-gray-800 bg-[#151515] p-3">
      <div className="text-sm font-medium text-white">گزارش زنده لئو</div>
      <div className="grid grid-cols-3 gap-2">
        <StatItem label="لئو در میز" value={stats.activeLeoPlayers} tone="violet" />
        <StatItem label="میز لئو‌دار" value={stats.leoRoomCount} tone="amber" />
        <StatItem label="غیر لئو در میز لئو" value={stats.nonLeoPlayersInLeoRooms} tone="sky" />
      </div>
      <div className="text-[11px] text-gray-500">
        رویداد در صف{" "}
        <span className="numeric-text numeric-text--11 text-gray-400" dir="ltr">
          {pendingEventCount.toLocaleString("en-US")}
        </span>
      </div>
    </div>
  );
}
