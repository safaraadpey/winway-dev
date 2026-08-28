"use client";

import React, { useEffect } from "react";
import { useHeaderVisibility } from "@/lib/contexts/HeaderVisibilityContext";
import { useTheme } from "@/lib/contexts/ThemeContext";
import { getThemeOptions } from "@/lib/theme/registry";
import FeatureGate from "@/components/features/FeatureGate";
import TicTacToeSettingsEntry from "@/components/tic-tac-toe/TicTacToeSettingsEntry";
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

        <FeatureGate featureKey="sample_beta_badge">
          <section className={styles.section} aria-labelledby="beta-badge-settings">
            <h2 id="beta-badge-settings" className={styles.sectionLabel}>
              Beta
            </h2>
            <p className={styles.sectionDescription}>
              شما به Feature نمونه Feature Management دسترسی دارید.
            </p>
            <div className={styles.themeOptions}>
              <div className={styles.themeOption}>
                <span className={styles.themeOptionText}>
                  <span className={styles.themeOptionTitle}>Sample Beta Badge</span>
                  <span className={styles.themeOptionHint}>
                    فقط برای تست end-to-end زیرساخت Feature Flag
                  </span>
                </span>
                <span className="rounded-full bg-amber-500/20 px-2 py-1 text-xs text-amber-300">
                  BETA
                </span>
              </div>
            </div>
          </section>
        </FeatureGate>

        <section className={styles.section} aria-labelledby="mini-game-settings">
          <h2 id="mini-game-settings" className={styles.sectionLabel}>
            مینی‌گیم‌ها
          </h2>
          <p className={styles.sectionDescription}>
            بازی‌های کوتاه برای سرگرمی بین دست‌های اصلی.
          </p>
          <TicTacToeSettingsEntry />
        </section>

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
