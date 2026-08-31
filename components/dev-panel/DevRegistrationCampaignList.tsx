"use client";

import type {
  DevRegistrationCampaignSummary,
  DevRegistrationScheduleRow,
} from "@/src/types/dev-tournament-register";
import {
  campaignModeLabel,
  campaignStatusClass,
  campaignStatusLabel,
  formatScheduleTime,
  formatTournamentStartAt,
} from "@/components/dev-panel/dev-tournament-register-utils";

type Props = {
  campaigns: DevRegistrationCampaignSummary[];
  expandedCampaignId: string | null;
  detailItems: DevRegistrationScheduleRow[];
  loadingDetail: boolean;
  submitting: boolean;
  onRefresh: () => void;
  onCreateNew: () => void;
  onExpand: (campaignId: string) => void;
  onCollapse: () => void;
  onCancel: (campaignId: string) => void;
};

export default function DevRegistrationCampaignList({
  campaigns,
  expandedCampaignId,
  detailItems,
  loadingDetail,
  submitting,
  onRefresh,
  onCreateNew,
  onExpand,
  onCollapse,
  onCancel,
}: Props) {
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-xl font-bold text-white">مدیریت ثبت‌نام تورنومنت</h1>
          <p className="mt-1 text-xs text-gray-400">
            چند کمپین ثبت‌نام را همزمان مدیریت کنید — هر تورنومنت و اپراتور یک کمپین جدا
          </p>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={onRefresh}
            disabled={submitting}
            className="rounded-xl border border-gray-700 px-3 py-2 text-xs font-semibold text-gray-200 hover:bg-gray-800 disabled:opacity-60"
          >
            بروزرسانی
          </button>
          <button
            type="button"
            onClick={onCreateNew}
            className="rounded-xl bg-violet-700 px-4 py-2 text-sm font-semibold text-white hover:bg-violet-600"
          >
            + ثبت‌نام جدید
          </button>
        </div>
      </div>

      {campaigns.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-gray-700 bg-[#151515] p-8 text-center">
          <p className="text-sm text-gray-400">هنوز کمپینی ثبت نشده.</p>
          <button
            type="button"
            onClick={onCreateNew}
            className="mt-4 rounded-xl bg-violet-700 px-4 py-2 text-sm font-semibold text-white hover:bg-violet-600"
          >
            اولین ثبت‌نام را بسازید
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          {campaigns.map((campaign) => {
            const isExpanded = expandedCampaignId === campaign.id;
            const canCancel =
              campaign.status === "active" &&
              campaign.mode === "scheduled" &&
              campaign.pending > 0;

            return (
              <div
                key={campaign.id}
                className="rounded-2xl border border-gray-800 bg-[#151515] p-4"
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="text-sm font-semibold text-white">{campaign.name}</h2>
                      <span
                        className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${campaignStatusClass(campaign.status)}`}
                      >
                        {campaignStatusLabel(campaign.status)}
                      </span>
                      <span className="rounded-full bg-indigo-900/40 px-2 py-0.5 text-[10px] font-semibold text-indigo-200">
                        {campaignModeLabel(campaign.mode)}
                      </span>
                    </div>
                    <div className="mt-2 text-xs text-gray-400">
                      تورنومنت: <span className="text-gray-200">{campaign.tournamentTitle}</span>
                      {campaign.operatorName ? (
                        <>
                          {" · "}
                          اپراتور: <span className="text-gray-200">{campaign.operatorName}</span>
                        </>
                      ) : null}
                    </div>
                    <div className="mt-1 text-xs text-gray-500">
                      شروع تورنومنت:{" "}
                      <span className="numeric-text numeric-text--11 text-gray-300" dir="ltr">
                        {formatTournamentStartAt(campaign.tournamentStartAt)}
                      </span>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    {campaign.mode === "scheduled" ? (
                      <button
                        type="button"
                        disabled={submitting}
                        onClick={() => (isExpanded ? onCollapse() : onExpand(campaign.id))}
                        className="rounded-lg border border-gray-700 px-3 py-1.5 text-xs font-semibold text-gray-200 hover:bg-gray-800 disabled:opacity-60"
                      >
                        {isExpanded ? "بستن جزئیات" : "جزئیات"}
                      </button>
                    ) : null}
                    {canCancel ? (
                      <button
                        type="button"
                        disabled={submitting}
                        onClick={() => onCancel(campaign.id)}
                        className="rounded-lg bg-red-800 px-3 py-1.5 text-xs font-semibold text-white hover:bg-red-700 disabled:opacity-60"
                      >
                        لغو pending
                      </button>
                    ) : null}
                  </div>
                </div>

                <div className="mt-3 flex flex-wrap gap-3 text-xs">
                  <Stat label="پلیر" value={campaign.playerCount} />
                  {campaign.mode === "scheduled" ? (
                    <Stat label="در صف" value={campaign.pending} tone="amber" />
                  ) : null}
                  <Stat label="ثبت‌شده" value={campaign.registered} tone="emerald" />
                  <Stat label="رد شده" value={campaign.skipped} />
                  <Stat label="خطا" value={campaign.failed} tone="red" />
                </div>

                {isExpanded ? (
                  <div className="mt-4 border-t border-gray-800 pt-4">
                    {loadingDetail ? (
                      <div className="py-4 text-center text-xs text-gray-500">در حال بارگذاری...</div>
                    ) : detailItems.length === 0 ? (
                      <div className="text-xs text-gray-500">آیتمی برای نمایش نیست.</div>
                    ) : (
                      <div className="max-h-64 space-y-2 overflow-y-auto">
                        {detailItems.map((item) => (
                          <div
                            key={item.id}
                            className="flex items-center justify-between rounded-lg border border-gray-800 bg-[#1f2933] px-3 py-2 text-xs"
                          >
                            <div>
                              <span className="text-white">{item.username}</span>
                              <span className="mr-2 text-gray-500">{item.status}</span>
                            </div>
                            <span className="numeric-text numeric-text--11 text-violet-200" dir="ltr">
                              {formatScheduleTime(item.scheduledAt)}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function Stat({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone?: "amber" | "emerald" | "red";
}) {
  const toneClass =
    tone === "amber"
      ? "text-amber-300"
      : tone === "emerald"
        ? "text-emerald-300"
        : tone === "red"
          ? "text-red-300"
          : "text-gray-300";

  return (
    <div className="text-gray-500">
      {label}{" "}
      <span className={`numeric-text numeric-text--12 ${toneClass}`} dir="ltr">
        {value.toLocaleString("en-US")}
      </span>
    </div>
  );
}
