"use client";

import React, { useEffect } from "react";
import Link from "next/link";
import installStyles from "@/components/InstallAppButton.module.css";
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
    <div className="min-h-full bg-[#0E0E0F] px-4 pb-8 pt-2">
      <div className="mx-auto max-w-md space-y-5">
        <header className="text-center space-y-1">
          <h1 className="text-2xl font-extrabold text-[#FEEEB4]">پشتیبانی</h1>
          <p className="text-sm text-white/70">راهنما و ابزارهای کمکی</p>
        </header>

        <nav className="space-y-3 px-1" aria-label="منوی پشتیبانی">
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
