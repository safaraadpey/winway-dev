"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useHeaderVisibility } from "@/lib/contexts/HeaderVisibilityContext";
import { loadEntryBanners } from "@/services/entry-banner";
import type { EntryBanner } from "@/src/types/entry-banner";

export default function EntryBannerPage() {
  const router = useRouter();
  const { setShowHeader, setShowBackButton, setOnBackClick } = useHeaderVisibility();
  const [banners, setBanners] = useState<EntryBanner[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setShowHeader(true);
    setShowBackButton(true);
    setOnBackClick(() => () => router.back());

    return () => {
      setShowBackButton(false);
      setOnBackClick(null);
    };
  }, [setShowHeader, setShowBackButton, setOnBackClick, router]);

  useEffect(() => {
    async function fetchBanners() {
      try {
        setLoading(true);
        const result = await loadEntryBanners();
        setBanners(result.banners);
      } catch (error) {
        console.error("Error loading banners:", error);
      } finally {
        setLoading(false);
      }
    }

    fetchBanners();
  }, []);

  const formatDate = (dateString: string | null): string => {
    if (!dateString) return "نامحدود";
    const date = new Date(dateString);
    const day = date.getDate().toString().padStart(2, "0");
    const month = (date.getMonth() + 1).toString().padStart(2, "0");
    const year = date.getFullYear();
    return `${day}-${month}-${year}`;
  };

  const getTargetAudienceLabel = (audience: string[]): string => {
    const labels: Record<string, string> = {
      admin: "ادمین",
      agent: "ایجنت",
      super: "سوپر",
      player: "پلیر",
    };
    if (audience.length === 0) return "همه";
    return audience.map((a) => labels[a] || a).join(", ");
  };

  return (
    <div className="min-h-screen bg-[#0E0E0F] text-white p-4">
      <div className="max-w-md mx-auto">
        <h1 className="text-2xl font-bold mb-4">بنر ورودی</h1>

        {loading ? (
          <div className="text-center py-8 text-gray-400">در حال بارگذاری...</div>
        ) : banners.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12">
            <div className="text-gray-400 mb-6 text-center">
              هنوز بنری ایجاد نشده است
            </div>
            <button
              onClick={() => router.push("/admin/entry-banner/create")}
              className="px-6 py-3 rounded-xl bg-teal-600 text-white font-semibold hover:bg-teal-700 transition-colors"
            >
              ایجاد بنر ورودی
            </button>
          </div>
        ) : (
          <>
            <div className="mb-4">
              <button
                onClick={() => router.push("/admin/entry-banner/create")}
                className="w-full px-4 py-3 rounded-xl bg-teal-600 text-white font-semibold hover:bg-teal-700 transition-colors"
              >
                ایجاد بنر جدید
              </button>
            </div>

            <div className="space-y-3">
              {banners.map((banner) => (
                <div
                  key={banner.id}
                  className="bg-[#1f2933] rounded-2xl p-4 cursor-pointer hover:bg-[#2a3441] transition-colors"
                  onClick={() => router.push(`/admin/entry-banner/${banner.id}`)}
                >
                  <div className="flex items-start justify-between mb-2">
                    <h3 className="text-lg font-semibold text-white">{banner.title}</h3>
                    <span
                      className={`px-2 py-1 rounded-lg text-xs ${
                        banner.isActive
                          ? "bg-green-600 text-white"
                          : "bg-gray-600 text-white"
                      }`}
                    >
                      {banner.isActive ? "فعال" : "غیرفعال"}
                    </span>
                  </div>
                  <div className="text-sm text-gray-400 space-y-1">
                    <div>نوع: {banner.contentType === "text" ? "متن" : "تصویر"}</div>
                    <div>بازه زمانی: {formatDate(banner.startDate)} تا {formatDate(banner.endDate)}</div>
                    <div>مخاطبان: {getTargetAudienceLabel(banner.targetAudience)}</div>
                    {banner.requireConfirmation && (
                      <div className="text-teal-400">نیاز به تایید: {banner.confirmationText}</div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
