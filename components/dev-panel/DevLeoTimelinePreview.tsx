"use client";

import type { LeoPreviewResult } from "@/src/types/leo";
import { formatLeoScheduleTime } from "@/components/dev-panel/leo-utils";

type Props = {
  preview: LeoPreviewResult | null;
  loading: boolean;
};

const EVENT_LABELS: Record<string, string> = {
  enter: "ورود",
  session_start: "شروع سشن",
  round_join: "پیوستن به دست",
  break: "استراحت",
  exit: "خروج",
  skip: "رد دست",
};

const POOL_LABELS: Record<string, string> = {
  preferred: "pool همیشگی",
  random: "pool تصادفی",
};

export default function DevLeoTimelinePreview({ preview, loading }: Props) {
  if (loading) {
    return (
      <div className="rounded-2xl border border-gray-800 bg-[#151515] p-4 text-center text-xs text-gray-500">
        در حال تولید Timeline...
      </div>
    );
  }

  if (!preview?.events.length) {
    return null;
  }

  return (
    <div className="rounded-2xl border border-gray-800 bg-[#151515] p-4">
      <h2 className="mb-1 text-sm font-semibold text-white">پیش‌نمایش Timeline</h2>
      <p className="mb-3 text-xs text-gray-400">
        {preview.timeBandLabel} — {preview.windowDate}
      </p>
      <div className="max-h-72 space-y-2 overflow-y-auto">
        {preview.events.map((event) => (
          <div
            key={`${event.sequence}-${event.scheduledAt}`}
            className="flex items-start justify-between gap-2 rounded-lg border border-gray-800 bg-[#1f2933] px-3 py-2 text-xs"
          >
            <div className="min-w-0">
              <span className="font-medium text-white">
                {event.label ?? EVENT_LABELS[event.eventType] ?? event.eventType}
              </span>
              {event.eventType === "session_start" && event.tablePoolSource ? (
                <span className="mr-2 text-gray-500">
                  ({POOL_LABELS[event.tablePoolSource] ?? event.tablePoolSource})
                </span>
              ) : null}
              {event.templateName ? (
                <span className="mt-0.5 block text-violet-200">{event.templateName}</span>
              ) : null}
              {event.cardCount != null ? (
                <span className="block text-gray-500">
                  کارت:{" "}
                  <span className="numeric-text numeric-text--11 text-violet-200" dir="ltr">
                    {event.cardCount.toLocaleString("en-US")}
                  </span>
                </span>
              ) : null}
            </div>
            <span className="numeric-text numeric-text--12 shrink-0 text-violet-200" dir="ltr">
              {formatLeoScheduleTime(event.scheduledAt)}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
