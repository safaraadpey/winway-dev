"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { loadActiveBannersForUser } from "@/services/entry-banner";
import type { EntryBanner } from "@/src/types/entry-banner";
import { useSession } from "@/lib/contexts/SessionContext";
import {
  filterEntryBannersForToday,
  snoozeEntryBannerForToday,
} from "@/lib/entry-banner-snooze";

type EntryBannerModalProps = {
  visibleOnPaths?: string[];
};

export default function EntryBannerModal({ visibleOnPaths }: EntryBannerModalProps) {
  const pathname = usePathname();
  const { userId } = useSession();
  const [banners, setBanners] = useState<EntryBanner[]>([]);
  const [currentBannerIndex, setCurrentBannerIndex] = useState(0);
  const [confirmed, setConfirmed] = useState(false);
  const [dontShowAgainToday, setDontShowAgainToday] = useState(false);
  const [loading, setLoading] = useState(true);
  const shouldShowOnThisPath =
    !visibleOnPaths ||
    visibleOnPaths.some(
      (basePath) => pathname === basePath || pathname.startsWith(`${basePath}/`)
    );

  useEffect(() => {
    if (!shouldShowOnThisPath) {
      setLoading(false);
      return;
    }

    let isMounted = true;

    async function fetchBanners() {
      try {
        setLoading(true);
        const activeBanners = await loadActiveBannersForUser();

        if (!isMounted) return;

        const visibleBanners = filterEntryBannersForToday(userId, activeBanners);

        setBanners(visibleBanners);
        if (visibleBanners.length > 0) {
          setCurrentBannerIndex(0);
          setConfirmed(false);
          setDontShowAgainToday(false);
        }
      } catch (error) {
        console.error("EntryBannerModal: error fetching banners", error);
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    }

    const timeoutId = setTimeout(() => {
      void fetchBanners();
    }, 300);

    return () => {
      isMounted = false;
      clearTimeout(timeoutId);
    };
  }, [shouldShowOnThisPath, userId]);

  const currentBanner = banners[currentBannerIndex];

  if (!shouldShowOnThisPath || loading || !currentBanner || banners.length === 0) {
    return null;
  }

  const handleClose = () => {
    if (dontShowAgainToday && userId) {
      snoozeEntryBannerForToday(userId, currentBanner.id);
    }

    if (currentBannerIndex < banners.length - 1) {
      setCurrentBannerIndex(currentBannerIndex + 1);
      setConfirmed(false);
      setDontShowAgainToday(false);
    } else {
      setBanners([]);
    }
  };

  const handleConfirm = () => {
    if (currentBanner.requireConfirmation && !confirmed) {
      return;
    }
    handleClose();
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50 p-4">
      <div className="bg-[#0b1120] rounded-2xl p-6 w-full max-w-md max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-semibold text-white">{currentBanner.title}</h2>
          {!currentBanner.requireConfirmation && (
            <button
              onClick={handleClose}
              className="text-gray-400 hover:text-white transition-colors"
              aria-label="بستن بنر"
            >
              <svg
                width="24"
                height="24"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          )}
        </div>

        <div className="mb-4">
          {currentBanner.contentType === "text" ? (
            <div className="text-gray-300 whitespace-pre-wrap">
              {currentBanner.textContent}
            </div>
          ) : currentBanner.imageUrl ? (
            <div>
              <img
                src={currentBanner.imageUrl}
                alt={currentBanner.title}
                className="w-full rounded-lg"
              />
            </div>
          ) : null}
        </div>

        {currentBanner.requireConfirmation && (
          <div className="mb-4">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={confirmed}
                onChange={(e) => setConfirmed(e.target.checked)}
                className="w-5 h-5 rounded bg-[#1f2933] border-gray-600 text-teal-600 focus:ring-teal-500"
              />
              <span className="text-sm text-gray-300">
                {currentBanner.confirmationText}
              </span>
            </label>
          </div>
        )}

        <div className="mb-4">
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={dontShowAgainToday}
              onChange={(e) => setDontShowAgainToday(e.target.checked)}
              className="w-5 h-5 rounded bg-[#1f2933] border-gray-600 text-teal-600 focus:ring-teal-500"
            />
            <span className="text-sm text-gray-300">دوباره نشان نده</span>
          </label>
        </div>

        <button
          onClick={handleConfirm}
          disabled={currentBanner.requireConfirmation && !confirmed}
          className="w-full py-3 rounded-xl bg-teal-600 text-white font-semibold hover:bg-teal-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {currentBanner.requireConfirmation
            ? confirmed
              ? "تایید و بستن"
              : "لطفاً تایید کنید"
            : "بستن"}
        </button>

        {banners.length > 1 && (
          <div className="mt-3 text-center text-sm text-gray-400">
            {currentBannerIndex + 1} از {banners.length}
          </div>
        )}
      </div>
    </div>
  );
}
