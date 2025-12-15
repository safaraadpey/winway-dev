"use client";

import React from 'react';
import styles from './TomanBalanceBar.module.css';

interface TomanBalanceBarProps {
  tomanBalance: number;
  loading?: boolean;
}

/**
 * کامپوننت نوار بیضی‌شکل نمایش موجودی تومان
 * این کامپوننت مستقل است و می‌تواند در هر جای مناسب استفاده شود
 */
export default function TomanBalanceBar({ tomanBalance, loading = false }: TomanBalanceBarProps) {
  const formatTomanBalance = (amount: number): string => {
    return amount.toLocaleString('fa-IR');
  };

  return (
    <div className={styles.balanceBar}>
      <div className={styles.balanceLabel}>موجودی</div>
      <div className={styles.balanceValue}>
        {loading ? (
          <span className={styles.loadingText}>...</span>
        ) : (
          <>
            <span className={styles.amount}>{formatTomanBalance(tomanBalance)}</span>
            <span className={styles.currency}>تومان</span>
          </>
        )}
      </div>
    </div>
  );
}

