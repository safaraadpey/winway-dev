"use client";

import React, { useEffect } from "react";
import { useHeaderVisibility } from "@/lib/contexts/HeaderVisibilityContext";
import { useTheme } from "@/lib/contexts/ThemeContext";
import { getThemeOptions } from "@/lib/theme/registry";
import styles from "./SettingsPage.module.css";

export default function SettingsPage() {
  const { setShowBackButton, setOnBackClick } = useHeaderVisibility();
  const { themeId, setThemeId } = useTheme();
  const themeOptions = getThemeOptions();

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
            {themeOptions.map((option) => {
              const selected = themeId === option.id;
              return (
                <button
                  key={option.id}
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  className={`${styles.themeOption} ${
                    selected ? styles.themeOptionSelected : ""
                  }`}
                  onClick={() => setThemeId(option.id)}
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
