"use client";

import { useEffect, useState } from "react";
import toast from "react-hot-toast";
import type { WatchInviteBanner } from "@/lib/watch-invite/types";
import {
  loadWatchInviteBannerSettings,
  saveWatchInviteBannerSettings,
} from "@/services/watch-invite-banner";

export default function WatchInviteBannerSettingsSection() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [current, setCurrent] = useState<WatchInviteBanner | null>(null);
  const [title, setTitle] = useState("");
  const [caption, setCaption] = useState("");
  const [isEnabled, setIsEnabled] = useState(false);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    const load = async () => {
      setLoading(true);
      try {
        const banner = await loadWatchInviteBannerSettings();
        if (!active) return;
        setCurrent(banner);
        setTitle(banner?.title ?? "");
        setCaption(banner?.caption ?? "");
        setIsEnabled(banner?.isEnabled ?? false);
        setPreviewUrl(banner?.imageUrl ?? null);
      } catch (err) {
        console.error("[WatchInvite] admin settings load error:", err);
        toast.error("خطا در بارگذاری بنر دعوت");
      } finally {
        if (active) setLoading(false);
      }
    };
    void load();
    return () => {
      active = false;
    };
  }, []);

  const handleImageChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0] ?? null;
    setImageFile(file);
    if (file) {
      setPreviewUrl(URL.createObjectURL(file));
    }
  };

  const handleSave = async (event: React.FormEvent) => {
    event.preventDefault();
    if (saving) return;
    setSaving(true);
    try {
      const result = await saveWatchInviteBannerSettings(
        {
          title,
          caption,
          isEnabled,
          imageFile,
          keepExistingImage: !imageFile && Boolean(current?.imageUrl),
        },
        current
      );
      if (!result.success) {
        toast.error(result.error || "خطا در ذخیره");
        return;
      }
      setCurrent(result.banner ?? current);
      setImageFile(null);
      if (result.banner?.imageUrl) {
        setPreviewUrl(result.banner.imageUrl);
      }
      toast.success("تنظیمات بنر دعوت ذخیره شد");
    } catch (err) {
      console.error("[WatchInvite] admin settings save error:", err);
      toast.error("خطا در ذخیره");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div id="watch-invite-banner" className="bg-[#3a3a3a] rounded-lg p-4 mb-4">
      <h2 className="text-lg font-semibold text-white mb-2">بنر دعوت به تماشا</h2>
      <p className="text-sm text-gray-400 mb-4">
        این بنر در لینک تماشای مهمان و متن اشتراک‌گذاری پلیر نمایش داده می‌شود.
      </p>

      {loading ? (
        <div className="text-white text-sm">در حال بارگذاری...</div>
      ) : (
        <form onSubmit={(e) => void handleSave(e)} className="space-y-4">
          <label className="flex items-center gap-2 text-white text-sm">
            <input
              type="checkbox"
              checked={isEnabled}
              onChange={(e) => setIsEnabled(e.target.checked)}
            />
            فعال
          </label>

          <div>
            <label htmlFor="watch-invite-title" className="block text-sm text-gray-300 mb-2">
              عنوان
            </label>
            <input
              id="watch-invite-title"
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full px-4 py-2 bg-[#1f2933] text-white rounded-lg border border-gray-600 focus:border-teal-500 focus:outline-none"
            />
          </div>

          <div>
            <label htmlFor="watch-invite-caption" className="block text-sm text-gray-300 mb-2">
              متن زیر تصویر
            </label>
            <textarea
              id="watch-invite-caption"
              value={caption}
              onChange={(e) => setCaption(e.target.value)}
              rows={3}
              className="w-full px-4 py-2 bg-[#1f2933] text-white rounded-lg border border-gray-600 focus:border-teal-500 focus:outline-none"
            />
          </div>

          <div>
            <label htmlFor="watch-invite-image" className="block text-sm text-gray-300 mb-2">
              تصویر بنر (حداکثر 1MB، 1000x1300)
            </label>
            <input
              id="watch-invite-image"
              type="file"
              accept="image/*"
              onChange={handleImageChange}
              className="w-full text-sm text-gray-300"
            />
            {previewUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={previewUrl}
                alt="پیش‌نمایش بنر"
                className="mt-3 max-h-48 w-full rounded-lg object-cover"
              />
            ) : null}
          </div>

          <button
            type="submit"
            disabled={saving}
            className="w-full px-4 py-2 bg-teal-600 text-white rounded-lg hover:bg-teal-700 disabled:opacity-50 font-semibold"
          >
            {saving ? "در حال ذخیره..." : "ذخیره بنر دعوت"}
          </button>
        </form>
      )}
    </div>
  );
}
