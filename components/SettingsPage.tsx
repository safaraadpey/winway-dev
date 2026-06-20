"use client";

import React, { useEffect } from "react";
import { useHeaderVisibility } from "@/lib/contexts/HeaderVisibilityContext";
import { useTheme } from "@/lib/contexts/ThemeContext";
import type { AppTheme } from "@/lib/theme/types";
import styles from "./SettingsPage.module.css";

const THEME_OPTIONS: Array<{
  value: AppTheme;
  title: string;
  hint: string;
}> = [
  {
    value: "dark",
    title: "تم تیره",
    hint: "پس‌زمینه تیره و متن روشن (پیش‌فرض)",
  },
  {
    value: "light",
    title: "تم روشن",
    hint: "پس‌زمینه روشن‌تر برای محیط‌های پرنور",
  },
];

export default function SettingsPage() {
  const { setShowBackButton, setOnBackClick } = useHeaderVisibility();
  const { theme, setTheme } = useTheme();

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
    <div className={styles.container}>
      <div className={styles.content}>
        <h1 className={styles.title}>تنظیمات</h1>
        <p className={styles.subtitle}>شخصی‌سازی تجربه استفاده از اپلیکیشن</p>

        <section className={styles.section} aria-labelledby="theme-settings">
          <h2 id="theme-settings" className={styles.sectionLabel}>
            تنظیمات تم
          </h2>
          <p className={styles.sectionDescription}>
            ظاهر کلی اپلیکیشن را انتخاب کنید. انتخاب شما روی دستگاه ذخیره
            می‌شود.
          </p>
          <div className={styles.themeOptions} role="radiogroup" aria-label="انتخاب تم">
            {THEME_OPTIONS.map((option) => {
              const selected = theme === option.value;
              return (
                <button
                  key={option.value}
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  className={`${styles.themeOption} ${
                    selected ? styles.themeOptionSelected : ""
                  }`}
                  onClick={() => setTheme(option.value)}
                >
                  <span className={styles.themeOptionText}>
                    <span className={styles.themeOptionTitle}>{option.title}</span>
                    <span className={styles.themeOptionHint}>{option.hint}</span>
                  </span>
                  <span className={styles.themeOptionBadge} aria-hidden="true" />
                </button>
              );
            })}
          </div>
        </section>
      </div>
    </div>
  );
}
