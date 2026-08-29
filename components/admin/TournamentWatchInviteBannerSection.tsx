"use client";

import { useEffect, useMemo, useState } from "react";
import type { TournamentWatchInviteBannerForm } from "@/lib/watch-invite/bannerOverride";
import { loadWatchInviteBannerSettings } from "@/services/watch-invite-banner";
import type { WatchInviteBanner } from "@/lib/watch-invite/types";

type TournamentWatchInviteBannerSectionProps = {
  value: TournamentWatchInviteBannerForm;
  onChange: (next: TournamentWatchInviteBannerForm) => void;
  readOnly?: boolean;
};

export default function TournamentWatchInviteBannerSection({
  value,
  onChange,
  readOnly = false,
}: TournamentWatchInviteBannerSectionProps) {
  const [globalBanner, setGlobalBanner] = useState<WatchInviteBanner | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    void loadWatchInviteBannerSettings().then((banner) => {
      if (!active) return;
      setGlobalBanner(banner);
      setLoading(false);
    });
    return () => {
      active = false;
    };
  }, []);

  const previewUrl = useMemo(() => {
    if (value.watch_invite_clear_image) return null;
    if (value.watch_invite_image_file) {
      return URL.createObjectURL(value.watch_invite_image_file);
    }
    return value.watch_invite_image_url ?? globalBanner?.imageUrl ?? null;
  }, [
    globalBanner?.imageUrl,
    value.watch_invite_clear_image,
    value.watch_invite_image_file,
    value.watch_invite_image_url,
  ]);

  useEffect(() => {
    if (!value.watch_invite_image_file) return;
    const objectUrl = URL.createObjectURL(value.watch_invite_image_file);
    return () => URL.revokeObjectURL(objectUrl);
  }, [value.watch_invite_image_file]);

  const setField = <K extends keyof TournamentWatchInviteBannerForm>(
    key: K,
    fieldValue: TournamentWatchInviteBannerForm[K]
  ) => {
    onChange({ ...value, [key]: fieldValue });
  };

  return (
    <div className="rounded-lg border border-gray-700 bg-[#161616] p-4 space-y-4">
      <div>
        <div className="text-sm font-semibold text-gray-200">بنر دعوت به تماشا (اختصاصی تورنومنت)</div>
        <p className="text-xs text-gray-500 mt-1">
          اگر فیلدی را خالی بگذارید، از تنظیم پیش‌فرض در پنل ادمین استفاده می‌شود.
        </p>
      </div>

      <label className="flex items-center gap-2 text-sm text-gray-200">
        <input
          type="checkbox"
          checked={value.watch_invite_use_override}
          onChange={(e) => setField("watch_invite_use_override", e.target.checked)}
          disabled={readOnly}
        />
        استفاده از بنر اختصاصی این تورنومنت
      </label>

      {value.watch_invite_use_override ? (
        <div className="space-y-3">
          {loading ? (
            <div className="text-xs text-gray-400">در حال بارگذاری تنظیم پیش‌فرض...</div>
          ) : (
            <div className="text-xs text-gray-500 rounded-lg border border-gray-800 p-3">
              پیش‌فرض: {globalBanner?.title || "—"} /{" "}
              {globalBanner?.isEnabled ? "فعال" : "غیرفعال"}
            </div>
          )}

          <label className="flex flex-col gap-1 text-sm">
            <span>عنوان (اختیاری)</span>
            <input
              type="text"
              value={value.watch_invite_title}
              onChange={(e) => setField("watch_invite_title", e.target.value)}
              placeholder={globalBanner?.title || "عنوان پیش‌فرض"}
              className="w-full rounded-lg border border-gray-700 bg-[#1f2933] px-3 py-2 text-white"
              disabled={readOnly}
            />
          </label>

          <label className="flex flex-col gap-1 text-sm">
            <span>متن زیر تصویر (اختیاری)</span>
            <textarea
              value={value.watch_invite_caption}
              onChange={(e) => setField("watch_invite_caption", e.target.value)}
              placeholder={globalBanner?.caption || "متن پیش‌فرض"}
              rows={3}
              className="w-full rounded-lg border border-gray-700 bg-[#1f2933] px-3 py-2 text-white"
              disabled={readOnly}
            />
          </label>

          <label className="flex items-center gap-2 text-sm text-gray-200">
            <input
              type="checkbox"
              checked={value.watch_invite_is_enabled === true}
              onChange={(e) =>
                setField(
                  "watch_invite_is_enabled",
                  e.target.checked ? true : null
                )
              }
              disabled={readOnly}
            />
            فعال برای این تورنومنت (اگر تیک نزنید، از وضعیت پیش‌فرض پیروی می‌کند)
          </label>

          <label className="flex flex-col gap-1 text-sm">
            <span>تصویر بنر (حداکثر 1MB، 1000x1300)</span>
            <input
              type="file"
              accept="image/*"
              onChange={(e) => {
                const file = e.target.files?.[0] ?? null;
                onChange({
                  ...value,
                  watch_invite_image_file: file,
                  watch_invite_clear_image: false,
                });
              }}
              className="text-xs text-gray-300"
              disabled={readOnly}
            />
            {previewUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={previewUrl}
                alt="پیش‌نمایش بنر"
                className="mt-2 max-h-48 w-full rounded-lg object-cover"
              />
            ) : null}
            {(value.watch_invite_image_url || globalBanner?.imageUrl) && !readOnly ? (
              <button
                type="button"
                onClick={() =>
                  onChange({
                    ...value,
                    watch_invite_image_file: null,
                    watch_invite_image_url: null,
                    watch_invite_image_width: null,
                    watch_invite_image_height: null,
                    watch_invite_clear_image: true,
                  })
                }
                className="mt-2 self-start rounded-lg bg-[#1f2933] px-3 py-1 text-xs text-gray-200"
              >
                حذف تصویر (بازگشت به پیش‌فرض)
              </button>
            ) : null}
          </label>
        </div>
      ) : null}
    </div>
  );
}
