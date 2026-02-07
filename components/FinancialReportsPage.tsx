"use client";

import React, { useEffect, useState } from "react";
import { useHeaderVisibility } from "@/lib/contexts/HeaderVisibilityContext";
import { loadFinancialReports } from "@/services/financial-reports";
import type {
  FinancialReportsData,
  ReportPeriod,
} from "@/src/types/financial-reports";
import toast from "react-hot-toast";
import styles from "./FinancialReportsPage.module.css";

const PERIOD_LABELS: Record<ReportPeriod, string> = {
  day: "روز",
  week: "هفته",
  month: "ماه",
};

export default function FinancialReportsPage() {
  const { setShowBackButton, setOnBackClick } = useHeaderVisibility();
  const [data, setData] = useState<FinancialReportsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [activePeriod, setActivePeriod] = useState<ReportPeriod>("month");

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

  useEffect(() => {
    async function fetchData() {
      try {
        setLoading(true);
        const result = await loadFinancialReports(activePeriod);
        setData(result);
      } catch (error: any) {
        console.error("Error loading financial reports:", error);
        toast.error(error.message || "خطا در بارگذاری گزارشات مالی");
      } finally {
        setLoading(false);
      }
    }

    fetchData();
  }, [activePeriod]);

  const formatAmount = (amount: number): string => {
    return amount.toLocaleString("fa-IR");
  };

  const formatDate = (dateString: string): string => {
    const date = new Date(dateString);
    return new Intl.DateTimeFormat("fa-IR", {
      year: "numeric",
      month: "long",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    }).format(date);
  };

  const getRoleLabel = (role?: "admin" | "agent" | "super"): string => {
    switch (role) {
      case "admin":
        return "ادمین";
      case "agent":
        return "ایجنت";
      case "super":
        return "سوپر";
      default:
        return "نامشخص";
    }
  };

  const translateTransactionDescription = (description: string): string => {
    const normalized = description.trim();
    if (!normalized) return description;

    const lower = normalized.toLowerCase();
    if (lower.startsWith("panel transfer (deposit) by admin")) {
      return "واریز از پنل توسط ادمین";
    }
    if (lower.startsWith("panel transfer (withdraw) by admin")) {
      return "برداشت از پنل توسط ادمین";
    }
    if (lower === "hold for room join") {
      return "بلوکه برای ورود به روم";
    }
    if (lower === "room line prize payout") {
      return "پرداخت جایزه خطی روم";
    }
    if (lower === "room full prize payout") {
      return "پرداخت جایزه پر روم";
    }
    if (lower === "tournament commission payout") {
      return "پرداخت کمیسیون تورنومنت";
    }
    if (lower.startsWith("game payout: line win")) {
      return "پرداخت جایزه خطی";
    }
    if (lower.startsWith("game payout: full win")) {
      return "پرداخت جایزه پر";
    }

    return description;
  };

  if (loading) {
    return (
      <div className={styles.container}>
        <div className={styles.loadingContainer}>
          <div className={styles.loadingSpinner}></div>
          <p className={styles.loadingText}>در حال بارگذاری...</p>
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className={styles.container}>
        <div className={styles.errorContainer}>
          <p className={styles.errorText}>خطا در بارگذاری گزارشات مالی</p>
        </div>
      </div>
    );
  }

  const { summary, transactions, gameStats } = data;

  // Fallback برای gameStats در صورت undefined
  const safeGameStats = gameStats || {
    totalCardsPurchased: 0,
    totalPurchaseAmount: 0,
    lineWinsCount: 0,
    fullWinsCount: 0,
    winRate: 0,
    deposits: 0,
    withdrawals: 0,
    averageCardsPerGame: 0,
  };

  return (
    <div className={styles.container}>
      <div className={styles.content}>
        <h1 className={styles.title}>گزارشات مالی</h1>

        {/* تب‌های دوره زمانی */}
        <div className={styles.periodTabs}>
          {(["day", "week", "month"] as ReportPeriod[]).map((period) => (
            <button
              key={period}
              onClick={() => setActivePeriod(period)}
              className={`${styles.periodTab} ${
                activePeriod === period ? styles.periodTabActive : ""
              }`}
            >
              {PERIOD_LABELS[period]}
            </button>
          ))}
        </div>

        {/* آمار بازی */}
        <div className={styles.gameStatsSection}>
          <h2 className={styles.sectionTitle}>آمار بازی</h2>
          <div className={styles.statsList}>
            <div className={styles.statsItem}>
              <span className={styles.statsLabel}>مجموع کارت خریده شده</span>
              <span className={styles.statsValue}>
                {safeGameStats.totalCardsPurchased}
              </span>
            </div>
            <div className={styles.statsItem}>
              <span className={styles.statsLabel}>مجموع مبلغ خرید</span>
              <span className={styles.statsValue}>
                {formatAmount(safeGameStats.totalPurchaseAmount)} تومان
              </span>
            </div>
            <div className={styles.statsItem}>
              <span className={styles.statsLabel}>واریزی</span>
              <span className={`${styles.statsValue} ${styles.positive}`}>
                {formatAmount(safeGameStats.deposits)} تومان
              </span>
            </div>
            <div className={styles.statsItem}>
              <span className={styles.statsLabel}>برداشت</span>
              <span className={`${styles.statsValue} ${styles.negative}`}>
                {formatAmount(safeGameStats.withdrawals)} تومان
              </span>
            </div>
            <div className={styles.statsItem}>
              <span className={styles.statsLabel}>تعداد تراکنش‌ها</span>
              <span className={styles.statsValue}>
                {summary.transactionCount}
              </span>
            </div>
            <div className={styles.statsItem}>
              <span className={styles.statsLabel}>بیلان</span>
              <span
                className={`${styles.statsValue} ${
                  summary.netBalance >= 0 ? styles.positive : styles.negative
                }`}
              >
                {formatAmount(summary.netBalance)} تومان
              </span>
            </div>
          </div>
        </div>

        {/* لیست تراکنش‌ها */}
        <div className={styles.transactionsSection}>
          <h2 className={styles.sectionTitle}>تراکنش‌ها</h2>
          {transactions.length === 0 ? (
            <div className={styles.emptyState}>
              <p>تراکنشی در این دوره یافت نشد</p>
            </div>
          ) : (
            <div className={styles.transactionsList}>
              {transactions.map((tx) => (
                <div key={tx.id} className={styles.transactionItem}>
                  <div className={styles.transactionHeader}>
                    <div className={styles.transactionType}>
                      <span
                        className={`${styles.typeBadge} ${
                          tx.type === "deposit"
                            ? styles.typeDeposit
                            : styles.typeWithdraw
                        }`}
                      >
                        {tx.type === "deposit" ? "واریز" : "برداشت"}
                      </span>
                      <span className={styles.transactionAmount}>
                        {tx.type === "deposit" ? "+" : "-"}
                        {formatAmount(tx.amount)} تومان
                      </span>
                    </div>
                    <div className={styles.transactionDate}>
                      {formatDate(tx.createdAt)}
                    </div>
                  </div>
                  
                  {tx.actorName && (
                    <div className={styles.transactionActor}>
                      <span className={styles.actorLabel}>توسط:</span>
                      <span className={styles.actorName}>
                        {tx.actorName}
                      </span>
                      {tx.actorShortId && (
                        <span className={styles.actorId}>
                          (ID: {tx.actorShortId.slice(0, 5)}-{tx.actorShortId.slice(5)})
                        </span>
                      )}
                      {tx.actorRole && (
                        <span className={styles.actorRole}>
                          [{getRoleLabel(tx.actorRole)}]
                        </span>
                      )}
                    </div>
                  )}

                  {tx.description && (
                    <div className={styles.transactionDescription}>
                      {translateTransactionDescription(tx.description)}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

