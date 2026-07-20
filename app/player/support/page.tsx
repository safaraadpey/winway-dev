"use client";

import React, { useEffect } from "react";
import Link from "next/link";
import installStyles from "@/components/InstallAppButton.module.css";
import styles from "@/components/support/SupportPage.module.css";
import { useHeaderVisibility } from "@/lib/contexts/HeaderVisibilityContext";
import { useTour } from "@/lib/contexts/TourContext";
import { GAME_BROWSER_TOUR_ID } from "@/lib/tour/configs/gameBrowserTour";
import { GAME_ROOM_TOUR_ID } from "@/lib/tour/configs/gameRoomTour";
import { MAIN_PAGE_TOUR_ID } from "@/lib/tour/configs/mainPageTour";

const supportLinks = [
  {
    href: "/player/support/draw-review",
    title: "بررسی قرعه",
    description: "تأیید provably fair با JSON پایان بازی",
  },
] as const;

export default function SupportPage() {
  const { setShowBackButton, setOnBackClick } = useHeaderVisibility();
  const { restartTour } = useTour();

  useEffect(() => {
    setShowBackButton(true);
    setOnBackClick(() => () => {
      window.history.back();
    });
    return () => {
      setShowBackButton(false);
      setOnBackClick(null);
    };
  }, [setShowBackButton, setOnBackClick]);

  return (
    <div className={styles.page}>
      <div className={styles.inner}>
        <header className={styles.header}>
          <h1 className={styles.title}>پشتیبانی</h1>
          <p className={styles.subtitle}>راهنما و ابزارهای کمکی</p>
        </header>

        <nav className={styles.nav} aria-label="منوی پشتیبانی">
          {supportLinks.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              dir="rtl"
              className={installStyles.actionLink}
            >
              <span>{item.title}</span>
              <span className={installStyles.actionLinkDescription}>
                {item.description}
              </span>
            </Link>
          ))}
          <button
            type="button"
            dir="rtl"
            className={installStyles.actionLink}
            onClick={() => void restartTour(MAIN_PAGE_TOUR_ID)}
          >
            <span>مشاهده دوباره آموزش صفحه اصلی</span>
            <span className={installStyles.actionLinkDescription}>
              راهنمای معرفی بخش‌های اصلی DingMoney را دوباره مشاهده کنید.
            </span>
          </button>
          <button
            type="button"
            dir="rtl"
            className={installStyles.actionLink}
            onClick={() => void restartTour(GAME_ROOM_TOUR_ID)}
          >
            <span>آموزش اتاق بازی</span>
            <span className={installStyles.actionLinkDescription}>
              راهنمای خرید کارت و وضعیت اتاق قبل از شروع بازی
            </span>
          </button>
          <button
            type="button"
            dir="rtl"
            className={installStyles.actionLink}
            onClick={() => void restartTour(GAME_BROWSER_TOUR_ID)}
          >
            <span>آموزش مرورگر بازی</span>
            <span className={installStyles.actionLinkDescription}>
              شروع دوباره راهنمای انتخاب اتاق
            </span>
          </button>
        </nav>
      </div>
    </div>
  );
}
