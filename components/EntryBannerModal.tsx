"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import {
  peekCachedActiveBanners,
  prefetchActiveBannersForUser,
} from "@/services/entry-banner";
import type { EntryBanner } from "@/src/types/entry-banner";
import { useSession } from "@/lib/contexts/SessionContext";
import {
  confirmEntryBanner,
  filterEntryBannersForToday,
  snoozeEntryBannerForToday,
} from "@/lib/entry-banner-snooze";
import { setEntryBannerGate } from "@/lib/entry-banner-gate";

type EntryBannerModalProps = {
  visibleOnPaths?: string[];
};

const IMAGE_PRELOAD_TIMEOUT_MS = 2000;

function preloadImage(url: string, timeoutMs = IMAGE_PRELOAD_TIMEOUT_MS): Promise<void> {
  return new Promise((resolve) => {
    const img = new Image();
    let settled = false;
    const done = () => {
      if (settled) return;
      settled = true;
      resolve();
    };
    const timer = window.setTimeout(done, timeoutMs);
    img.onload = () => {
      window.clearTimeout(timer);
      done();
    };
    img.onerror = () => {
      window.clearTimeout(timer);
      done();
    };
    img.src = url;
  });
}

function BannerCloseIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="27"
      height="27"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  );
}

export default function EntryBannerModal({ visibleOnPaths }: EntryBannerModalProps) {
  const pathname = usePathname();
  const { userId, authReady } = useSession();
  const cached = peekCachedActiveBanners();
  const [banners, setBanners] = useState<EntryBanner[]>(() =>
    cached ? filterEntryBannersForToday(userId, cached) : []
  );
  const [currentBannerIndex, setCurrentBannerIndex] = useState(0);
  const [confirmed, setConfirmed] = useState(false);
  const [dontShowAgainToday, setDontShowAgainToday] = useState(false);
  const [loading, setLoading] = useState(() => cached == null);
  const revealedRef = useRef(cached != null);
  const shouldShowOnThisPath =
    !visibleOnPaths ||
    visibleOnPaths.some(
      (basePath) => pathname === basePath || pathname.startsWith(`${basePath}/`)
    );

  useEffect(() => {
    if (!authReady) return;

    let isMounted = true;

    async function fetchBanners() {
      try {
        if (!revealedRef.current) {
          console.log("[EntryBanner] Started");
        }
        const activeBanners = await prefetchActiveBannersForUser();
        if (!isMounted) return;

        const visibleBanners = filterEntryBannersForToday(userId, activeBanners);
        const first = visibleBanners[0];
        if (
          !revealedRef.current &&
          first?.contentType === "image" &&
          first.imageUrl
        ) {
          await preloadImage(first.imageUrl);
        }
        if (!isMounted) return;

        setBanners(visibleBanners);
        if (!revealedRef.current && visibleBanners.length > 0) {
          setCurrentBannerIndex(0);
          setConfirmed(false);
          setDontShowAgainToday(false);
        }
        if (!revealedRef.current) {
          console.log("[EntryBanner] Loaded", {
            count: visibleBanners.length,
            source: "supabase",
          });
        }
        revealedRef.current = true;
      } catch (error) {
        console.error("[EntryBanner] Load failed", error);
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    }

    void fetchBanners();

    return () => {
      isMounted = false;
    };
  }, [authReady, userId]);

  useEffect(() => {
    const nextBanner = banners[currentBannerIndex + 1];
    if (nextBanner?.contentType === "image" && nextBanner.imageUrl) {
      void preloadImage(nextBanner.imageUrl);
    }
  }, [banners, currentBannerIndex]);

  const currentBanner = banners[currentBannerIndex];
  const blockingOnThisPath =
    shouldShowOnThisPath && (loading || banners.length > 0);

  useLayoutEffect(() => {
    setEntryBannerGate({ settled: true, blocking: blockingOnThisPath });
  }, [blockingOnThisPath]);

  if (!shouldShowOnThisPath) {
    return null;
  }

  if (!currentBanner || banners.length === 0) {
    if (!loading) return null;
    return (
      <div
        className="fixed inset-0 z-[10050] bg-black/65"
        data-entry-banner-open="true"
        aria-busy="true"
        aria-hidden="true"
      />
    );
  }

  const handleClose = () => {
    if (userId) {
      if (currentBanner.requireConfirmation) {
        confirmEntryBanner(userId, currentBanner.id, currentBanner.updatedAt);
      } else if (dontShowAgainToday) {
        snoozeEntryBannerForToday(userId, currentBanner.id);
      }
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

  const isImageBanner = currentBanner.contentType === "image" && Boolean(currentBanner.imageUrl);
  const showCloseButton = currentBanner.showCloseButton !== false;
  const showDontShowAgain =
    !currentBanner.requireConfirmation && currentBanner.showDontShowAgain !== false;
  const closeDisabled = currentBanner.requireConfirmation && !confirmed;
  const showFooter =
    currentBanner.requireConfirmation ||
    showDontShowAgain ||
    showCloseButton ||
    banners.length > 1;

  return (
    <div
      className="fixed inset-0 z-[10050] bg-black/65 flex items-center justify-center p-4"
      data-entry-banner-open="true"
    >
      <div
        className={`relative bg-black rounded-2xl w-full max-w-md max-h-[90vh] overflow-y-auto ${
          isImageBanner ? "" : "p-6"
        }`}
      >
        {!showCloseButton && (
          <button
            type="button"
            onClick={handleConfirm}
            disabled={closeDisabled}
            aria-label="بستن"
            className="absolute top-3 left-3 z-10 flex h-12 w-12 items-center justify-center rounded-full bg-black/60 text-white hover:bg-black/80 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <BannerCloseIcon />
          </button>
        )}

        {currentBanner.showTitle && (
          <div
            className={`flex items-center mb-4 ${isImageBanner ? "px-6 pt-6" : ""} ${
              !showCloseButton ? "pl-16" : ""
            }`}
          >
            <h2 className="text-xl font-semibold text-white">{currentBanner.title}</h2>
          </div>
        )}

        {!showCloseButton && !currentBanner.showTitle && !isImageBanner && (
          <div className="h-12 mb-2" />
        )}

        {currentBanner.contentType === "text" ? (
          <div className="mb-4">
            <div className="text-gray-300 whitespace-pre-wrap">
              {currentBanner.textContent}
            </div>
          </div>
        ) : currentBanner.imageUrl ? (
          <div style={{ padding: 4 }}>
            <img
              src={currentBanner.imageUrl}
              alt={currentBanner.title}
              className="w-full rounded-lg"
              fetchPriority="high"
              decoding="async"
              width={currentBanner.imageWidth || undefined}
              height={currentBanner.imageHeight || undefined}
            />
          </div>
        ) : null}

        {showFooter && (
          <div className={isImageBanner ? "px-6 pb-6 pt-3" : ""}>
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

            {showDontShowAgain && (
              <div className="mb-4">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={dontShowAgainToday}
                    onChange={(e) => setDontShowAgainToday(e.target.checked)}
                    className="w-5 h-5 rounded bg-[#1f2933] border-gray-600 text-teal-600 focus:ring-teal-500"
                  />
                  <span className="text-sm text-gray-300">دیگر این بنر را نمایش نده</span>
                </label>
              </div>
            )}

            {showCloseButton && (
              <button
                onClick={handleConfirm}
                disabled={closeDisabled}
                className="w-full h-12 rounded-xl bg-[#2a2a2a]/40 text-white text-lg font-bold hover:bg-[#2a2a2a]/55 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {currentBanner.requireConfirmation
                  ? confirmed
                    ? "تایید و بستن"
                    : "لطفاً تایید کنید"
                  : "بستن"}
              </button>
            )}

            {banners.length > 1 && (
              <div className={`${showCloseButton ? "mt-3" : ""} text-center text-sm text-gray-400`}>
                {currentBannerIndex + 1} از {banners.length}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
