"use client";

import React from 'react';
import { useRouter } from 'next/navigation';
import styles from './DingHeader.module.css';
import BalanceCapsule, { BalanceType } from './BalanceCapsule';

interface DingHeaderProps {
  /** نوع موجودی برای نمایش: 'ding' یا 'toman' */
  balanceType?: BalanceType;
  /** موجودی دینگ (اختیاری - اگر context موجود باشد استفاده می‌شود) */
  dingBalance?: number;
  /** موجودی تومان (اختیاری - اگر hook موجود باشد استفاده می‌شود) */
  tomanBalance?: number;
  /** وضعیت loading */
  loading?: boolean;
  /** نمایش دکمه بازگشت */
  showBackButton?: boolean;
  /** Callback برای کلیک روی دکمه بازگشت */
  onBackClick?: () => void;
  /** وضعیت انیمیشن (اختیاری - اگر hook موجود باشد استفاده می‌شود) */
  isAnimating?: boolean;
  /** موجودی کم‌رنگ در هدر پنل‌های مدیریتی (ادمین / ایجنت / سوپر) */
  balanceMuted?: boolean;
  /** دکمه بارگذاری مجدد صفحه — فقط برای پنل Admin */
  showRefreshButton?: boolean;
}

/**
 * کامپوننت هدر با لوگوی dingmoney و نمایش موجودی (Ding یا تومان)
 * از Context/Hook استفاده می‌کند یا از props (fallback)
 */
export default function DingHeader({ 
  balanceType = 'ding',
  dingBalance: propDingBalance,
  tomanBalance: propTomanBalance,
  loading: propLoading = false,
  showBackButton = false,
  onBackClick,
  isAnimating: propIsAnimating,
  balanceMuted = false,
  showRefreshButton = false,
}: DingHeaderProps) {
  const router = useRouter();
  const [isReloading, setIsReloading] = React.useState(false);
  // DingHeader فقط از props تغذیه می‌شود تا منبع حقیقت یکتا باشد.
  const dingBalance = propDingBalance ?? 0;
  const tomanBalance = propTomanBalance ?? 0;
  const isAnimating = propIsAnimating ?? false;
  const loading = propLoading;
  
  const displayBalance = balanceType === 'ding' ? dingBalance : tomanBalance;

  const handleBackClick = () => {
    if (onBackClick) {
      onBackClick();
    } else {
      router.back();
    }
  };

  const handleRefreshClick = () => {
    if (isReloading) return;
    setIsReloading(true);
    console.info("[Admin] Full page reload requested");
    window.location.reload();
  };

  return (
    <div className={styles.dingHeader}>
      <div className={styles.leftSection}>
        <div className={styles.backButtonPlaceholder}>
          {showBackButton ? (
            <button 
              className={styles.backButton}
              onClick={handleBackClick}
              aria-label="بازگشت"
            >
              <svg 
                className={styles.backIcon}
                viewBox="0 0 24 24" 
                fill="none" 
                stroke="currentColor" 
                strokeWidth="2" 
                strokeLinecap="round" 
                strokeLinejoin="round"
              >
                <path d="M19 12H5M12 19l-7-7 7-7"/>
              </svg>
            </button>
          ) : null}
        </div>
        <div className={styles.logo}>dingmoney</div>
        {showRefreshButton ? (
          <button
            type="button"
            className={styles.refreshButton}
            onClick={handleRefreshClick}
            disabled={isReloading}
            aria-busy={isReloading}
            aria-label="بارگذاری مجدد صفحه"
            title="بارگذاری مجدد صفحه"
          >
            {isReloading ? (
              <span className={styles.refreshSpinner} aria-hidden="true" />
            ) : (
              <svg
                className={styles.refreshIcon}
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <path d="M21 12a9 9 0 1 1-3.15-6.74" />
                <path d="M21 3v6h-6" />
              </svg>
            )}
          </button>
        ) : null}
      </div>
      <BalanceCapsule 
        balance={displayBalance} 
        type={balanceType}
        loading={loading}
        isAnimating={isAnimating}
        muted={balanceMuted}
      />
    </div>
  );
}

