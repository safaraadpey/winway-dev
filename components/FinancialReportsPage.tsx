"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
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

type TransactionFilter = "deposit" | "withdraw";

const TRANSACTION_FILTER_LABELS: Record<TransactionFilter, string> = {
  deposit: "واریزی‌ها",
  withdraw: "پرداختی‌ها",
};

export default function FinancialReportsPage() {
  const router = useRouter();
  const { setShowBackButton, setOnBackClick } = useHeaderVisibility();
  const [data, setData] = useState<FinancialReportsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [activePeriod, setActivePeriod] = useState<ReportPeriod>("month");
  const [transactionFilter, setTransactionFilter] =
    useState<TransactionFilter>("deposit");
  const [statsExpanded, setStatsExpanded] = useState(true);
  const periodCacheRef = useRef<Partial<Record<ReportPeriod, FinancialReportsData>>>({});
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  const updateStatsExpandedFromScroll = useCallback(() => {
    const container = scrollContainerRef.current;
    if (!container) return;

    const { scrollTop, scrollHeight, clientHeight } = container;
    const edgeThreshold = 24;
    const canScroll = scrollHeight - clientHeight > edgeThreshold;

    if (!canScroll) {
      setStatsExpanded(true);
      return;
    }

    const atTop = scrollTop <= edgeThreshold;
    const atBottom =
      scrollTop + clientHeight >= scrollHeight - edgeThreshold;

    if (atTop) {
      setStatsExpanded(true);
      return;
    }

    if (atBottom) {
      setStatsExpanded((wasExpanded) => {
        if (!wasExpanded) {
          requestAnimationFrame(() => {
            container.scrollTo({
              top: container.scrollHeight,
              behavior: "auto",
            });
          });
        }
        return true;
      });
      return;
    }

    setStatsExpanded(false);
  }, []);

  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container) return;

    const handleScroll = () => {
      updateStatsExpandedFromScroll();
    };

    container.addEventListener("scroll", handleScroll, { passive: true });
    return () => {
      container.removeEventListener("scroll", handleScroll);
    };
  }, [updateStatsExpandedFromScroll, data, activePeriod]);

  useEffect(() => {
    setStatsExpanded(true);
    scrollContainerRef.current?.scrollTo({ top: 0, behavior: "auto" });
  }, [activePeriod]);

  useEffect(() => {
    const raf = requestAnimationFrame(updateStatsExpandedFromScroll);
    return () => cancelAnimationFrame(raf);
  }, [data, updateStatsExpandedFromScroll]);

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
    const cached = periodCacheRef.current[activePeriod];
    if (cached) {
      setData(cached);
      setLoading(false);
      return;
    }

    let cancelled = false;
    async function fetchData() {
      try {
        setLoading(true);
        const result = await loadFinancialReports(activePeriod);
        periodCacheRef.current[activePeriod] = result;
        if (!cancelled) {
          setData(result);
        }
      } catch (error: any) {
        if (!cancelled) {
          console.error("Error loading financial reports:", error);
          toast.error(error.message || "خطا در بارگذاری گزارشات مالی");
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    fetchData();

    return () => {
      cancelled = true;
    };
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
      return "پرداخت برای ورود به روم";
    }
    if (lower === "room line prize payout") {
      return "واریز جایزه خطی روم";
    }
    if (lower === "room full prize payout") {
      return "واریز جایزه پر روم";
    }
    if (lower === "tournament commission payout") {
      return "پرداخت کمیسیون تورنومنت";
    }
    if (lower === "hold for tournament join") {
      return "پرداخت برای ورود به تورنومنت";
    }
    if (lower === "tournament prize payout") {
      return "واریز جایزه تورنومنت";
    }
    if (lower === "admin refund after tournament cancelled") {
      return "بازپرداخت ادمین پس از لغو تورنومنت";
    }
    if (lower.startsWith("manual withdraw by")) {
      return "برداشت دستی توسط سوپر";
    }
    if (lower.startsWith("game payout: line win")) {
      return "واریز جایزه خطی";
    }
    if (lower.startsWith("game payout: full win")) {
      return "واریز جایزه پر";
    }

    return description;
  };

  if (loading && !data) {
    return (
      <div className={styles.container} ref={scrollContainerRef}>
        <div className={styles.loadingContainer}>
          <div className={styles.loadingSpinner}></div>
          <p className={styles.loadingText}>در حال بارگذاری...</p>
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className={styles.container} ref={scrollContainerRef}>
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

  const manualDeposits = transactions.reduce((sum, tx) => {
    const description = String(tx.description || "").toLowerCase();
    const isManualPanelDepositByDescription =
      description.includes("panel transfer (deposit) by admin") ||
      description.includes("manual deposit by");

    if (
      tx.type === "deposit" &&
      (tx.actorRole === "admin" ||
        tx.actorRole === "agent" ||
        tx.actorRole === "super" ||
        isManualPanelDepositByDescription)
    ) {
      return sum + tx.amount;
    }
    return sum;
  }, 0);

  const manualWithdrawals = transactions.reduce((sum, tx) => {
    const description = String(tx.description || "").toLowerCase();
    const isManualPanelWithdrawByDescription =
      description.includes("panel transfer (withdraw) by admin") ||
      description.includes("manual withdraw by");

    if (
      tx.type === "withdraw" &&
      (tx.actorRole === "admin" ||
        tx.actorRole === "agent" ||
        tx.actorRole === "super" ||
        isManualPanelWithdrawByDescription)
    ) {
      return sum + tx.amount;
    }
    return sum;
  }, 0);

  const filteredTransactions = transactions.filter(
    (tx) => tx.type === transactionFilter
  );

  return (
    <div className={styles.container}>
      <div className={styles.pageHeader}>
        <div className={styles.headerActions} role="group" aria-label="عملیات مالی">
          <button
            type="button"
            className={`${styles.headerActionButton} ${styles.headerActionBuy}`}
            onClick={() => router.push("/player/wallet?action=buy")}
          >
            خرید
          </button>
          <button
            type="button"
            className={`${styles.headerActionButton} ${styles.headerActionWithdraw}`}
            onClick={() => router.push("/player/wallet?action=withdraw")}
          >
            برداشت
          </button>
        </div>

        <div className={styles.periodTabs}>
          {(["day", "week", "month"] as ReportPeriod[]).map((period) => (
            <button
              key={period}
              onClick={() => setActivePeriod(period)}
              className={`${styles.periodTab} ${
                activePeriod === period ? styles.periodTabActive : ""
              }`}
            >
              <span className={styles.periodTabIcon} aria-hidden="true">
                📅
              </span>
              {PERIOD_LABELS[period]}
            </button>
          ))}
        </div>
      </div>

      <div className={styles.scrollBody} ref={scrollContainerRef}>
        <div className={styles.content}>
        {/* آمار بازی */}
        <div
          className={`${styles.gameStatsSection} ${
            statsExpanded ? "" : styles.gameStatsSectionCollapsed
          }`}
        >
          <h2 className={styles.sectionTitle}>
            <span className={styles.sectionTitleIcon} aria-hidden="true">
              📊
            </span>
            آمار مالی
          </h2>
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
              <span className={styles.statsLabel}>جمع واریزی</span>
              <span className={`${styles.statsValue} ${styles.positive}`}>
                {formatAmount(manualDeposits)} تومان
              </span>
            </div>
            <div className={styles.statsItem}>
              <span className={styles.statsLabel}>جمع برداشت</span>
              <span className={`${styles.statsValue} ${styles.negative}`}>
                {formatAmount(manualWithdrawals)} تومان
              </span>
            </div>
            <div className={styles.statsItem}>
              <span className={styles.statsLabel}>بیلان</span>
              <span
                className={`${styles.statsValue} ${
                  manualDeposits - manualWithdrawals >= 0 ? styles.positive : styles.negative
                }`}
              >
                {formatAmount(manualDeposits - manualWithdrawals)} تومان
              </span>
            </div>
          </div>
        </div>

        {/* لیست تراکنش‌ها */}
        <div className={styles.transactionsSection}>
          <div className={styles.transactionsSectionHeader}>
            <h2 className={styles.sectionTitle}>
              <span className={styles.sectionTitleIcon} aria-hidden="true">
                💳
              </span>
              تراکنش‌ها
            </h2>
            <div
              className={styles.transactionFilterTabs}
              role="tablist"
              aria-label="فیلتر نوع تراکنش"
            >
              {(["deposit", "withdraw"] as TransactionFilter[]).map((filter) => (
                <button
                  key={filter}
                  type="button"
                  role="tab"
                  aria-selected={transactionFilter === filter}
                  onClick={() => setTransactionFilter(filter)}
                  className={`${styles.transactionFilterTab} ${
                    transactionFilter === filter
                      ? styles.transactionFilterTabActive
                      : ""
                  }`}
                >
                  {TRANSACTION_FILTER_LABELS[filter]}
                </button>
              ))}
            </div>
          </div>
          {filteredTransactions.length === 0 ? (
            <div className={styles.emptyState}>
              <p>
                {transactions.length === 0
                  ? "تراکنشی در این دوره یافت نشد"
                  : transactionFilter === "deposit"
                    ? "واریزی در این دوره یافت نشد"
                    : "پرداختی در این دوره یافت نشد"}
              </p>
            </div>
          ) : (
            <div className={styles.transactionsList}>
              {filteredTransactions.map((tx) => (
                <div
                  key={tx.id}
                  className={`${styles.transactionItem} ${
                    tx.type === "deposit"
                      ? styles.transactionItemDeposit
                      : styles.transactionItemWithdraw
                  }`}
                >
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
    </div>
  );
}

