"use client";

import React, { useEffect } from "react";
import Link from "next/link";
import installStyles from "@/components/InstallAppButton.module.css";
import styles from "@/components/support/SupportPage.module.css";
import { useHeaderVisibility } from "@/lib/contexts/HeaderVisibilityContext";

const supportLinks = [
  {
    href: "/player/support/draw-review",
    title: "بررسی قرعه",
    description: "تأیید provably fair با JSON پایان بازی",
  },
] as const;

export default function SupportPage() {
  const { setShowBackButton, setOnBackClick } = useHeaderVisibility();

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
        </nav>
      </div>
    </div>
  );
}
