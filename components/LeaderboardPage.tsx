"use client";

import React, { useEffect, useState } from "react";
import { useHeaderVisibility } from "@/lib/contexts/HeaderVisibilityContext";
import { loadLeaderboardData } from "@/services/leaderboard";
import { loadPlayerGamesReport } from "@/services/games-report";
import type { LeaderboardData } from "@/src/types/leaderboard";
import type { PlayerGameReportItem } from "@/src/types/games-report";
import toast from "react-hot-toast";
import styles from "./LeaderboardPage.module.css";

/**
 * فرمت کردن مبلغ به صورت فارسی
 */
function formatAmount(amount: number): string {
  return new Intl.NumberFormat("en-US").format(amount);
}

function formatPlayedAt(iso: string) {
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return "-";
  return new Intl.DateTimeFormat("fa-IR-u-ca-persian", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(d);
}

export default function LeaderboardPage() {
  const { setShowBackButton, setOnBackClick } = useHeaderVisibility();
  const [data, setData] = useState<LeaderboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<"history" | "ranking" | "games">("history");
  const [activePeriod, setActivePeriod] = useState<"daily" | "weekly" | "monthly">("daily");
  const [gamesReports, setGamesReports] = useState<PlayerGameReportItem[]>([]);
  const [gamesTotalCount, setGamesTotalCount] = useState(0);
  const [gamesPage, setGamesPage] = useState(1);
  const [gamesLoading, setGamesLoading] = useState(false);
  const [gamesError, setGamesError] = useState<string | null>(null);
  const gamesPageSize = 20;

  useEffect(() => {
    setShowBackButton(true);
    setOnBackClick(() => () => {
      window.history.back();
    });
    return () => {
      setShowBackButton(false);
      setOnBackClick(() => () => {});
    };
  }, [setShowBackButton, setOnBackClick]);

  useEffect(() => {
    async function fetchData() {
      try {
        setLoading(true);
        const leaderboardData = await loadLeaderboardData();
        setData(leaderboardData);
      } catch (error: any) {
        console.error("Error loading leaderboard data:", error);
        toast.error(error.message || "خطا در بارگذاری داده‌ها");
      } finally {
        setLoading(false);
      }
    }

    fetchData();
  }, []);

  useEffect(() => {
    if (activeTab !== "games") return;

    let cancelled = false;

    async function fetchGamesReport() {
      try {
        setGamesLoading(true);
        setGamesError(null);
        const result = await loadPlayerGamesReport({
          page: gamesPage,
          pageSize: gamesPageSize,
          maxAgeMs: 30_000,
        });
        if (cancelled) return;
        setGamesReports(result.items);
        setGamesTotalCount(result.totalCount);
      } catch (error: unknown) {
        if (cancelled) return;
        const message = error instanceof Error ? error.message : "خطا در بارگذاری گزارش بازی‌ها";
        setGamesError(message);
        setGamesReports([]);
        setGamesTotalCount(0);
      } finally {
        if (!cancelled) {
          setGamesLoading(false);
        }
      }
    }

    void fetchGamesReport();

    return () => {
      cancelled = true;
    };
  }, [activeTab, gamesPage]);

  const gamesTotalPages = Math.max(Math.ceil(gamesTotalCount / gamesPageSize), 1);

  if (loading) {
    return (
      <div className={styles.container}>
        <div className={styles.content}>
          <div className={styles.loading}>در حال بارگذاری...</div>
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className={styles.container}>
        <div className={styles.content}>
          <div className={styles.emptyState}>داده‌ای یافت نشد</div>
        </div>
      </div>
    );
  }

  const { leaderboard, stats } = data;
  
  // انتخاب آمار بر اساس بازه زمانی انتخاب شده
  const currentStats = stats[activePeriod];

  return (
    <div className={styles.container}>
      <div className={styles.content}>
        {/* تب‌های سوابق و رتبه‌بندی */}
        <div className={styles.tabs}>
          <button
            onClick={() => setActiveTab("history")}
            className={`${styles.tab} ${
              activeTab === "history" ? styles.tabActive : ""
            }`}
          >
            <span className={styles.tabIcon} aria-hidden="true">
              📋
            </span>
            سوابق من
          </button>
          <button
            onClick={() => setActiveTab("ranking")}
            className={`${styles.tab} ${
              activeTab === "ranking" ? styles.tabActive : ""
            }`}
          >
            <span className={styles.tabIcon} aria-hidden="true">
              🏆
            </span>
            رتبه بندی
          </button>
          <button
            onClick={() => {
              setActiveTab("games");
              setGamesPage(1);
            }}
            className={`${styles.tab} ${activeTab === "games" ? styles.tabActive : ""}`}
          >
            <span className={styles.tabIcon} aria-hidden="true">
              🎮
            </span>
            بازی ها
          </button>
        </div>

        {activeTab === "history" && (
          <>
            {/* تب‌های بازه زمانی */}
            <div className={styles.periodTabs}>
              <button
                onClick={() => setActivePeriod("daily")}
                className={`${styles.periodTab} ${
                  activePeriod === "daily" ? styles.periodTabActive : ""
                }`}
              >
                <span className={styles.periodTabIcon} aria-hidden="true">
                  📅
                </span>
                روزانه
              </button>
              <button
                onClick={() => setActivePeriod("weekly")}
                className={`${styles.periodTab} ${
                  activePeriod === "weekly" ? styles.periodTabActive : ""
                }`}
              >
                <span className={styles.periodTabIcon} aria-hidden="true">
                  📅
                </span>
                هفتگی
              </button>
              <button
                onClick={() => setActivePeriod("monthly")}
                className={`${styles.periodTab} ${
                  activePeriod === "monthly" ? styles.periodTabActive : ""
                }`}
              >
                <span className={styles.periodTabIcon} aria-hidden="true">
                  📅
                </span>
                ماهیانه
              </button>
            </div>

            {/* نمایش آمار بر اساس بازه زمانی */}
            <div className={styles.statsGrid}>
              <div className={styles.statCard}>
                <span className={styles.statIcon} aria-hidden="true">
                  📈
                </span>
                <div className={styles.statCardMain}>
                  <div className={styles.statLabel}>مجموع برد</div>
                  <div className={styles.statValue}>
                    {formatAmount(currentStats.totalWinnings)}
                  </div>
                </div>
              </div>
              <div className={styles.statCard}>
                <span className={styles.statIcon} aria-hidden="true">
                  🏆
                </span>
                <div className={styles.statCardMain}>
                  <div className={styles.statLabel}>مجموع برد تورنومنت</div>
                  <div className={styles.statValue}>
                    {formatAmount(currentStats.tournamentWinnings)}
                  </div>
                </div>
              </div>
              <div className={styles.statCard}>
                <span className={styles.statIcon} aria-hidden="true">
                  🛒
                </span>
                <div className={styles.statCardMain}>
                  <div className={styles.statLabel}>مجموع خرید</div>
                  <div className={styles.statValue}>
                    {formatAmount(currentStats.totalPurchases)}
                  </div>
                </div>
              </div>
              <div className={styles.statCard}>
                <span className={styles.statIcon} aria-hidden="true">
                  💳
                </span>
                <div className={styles.statCardMain}>
                  <div className={styles.statLabel}>تعداد کارت</div>
                  <div className={styles.statValue}>
                    {formatAmount(currentStats.cardCount)}
                  </div>
                </div>
              </div>
              <div className={styles.statCard}>
                <span className={styles.statIcon} aria-hidden="true">
                  📈
                </span>
                <div className={styles.statCardMain}>
                  <div className={styles.statLabel}>تعداد برد خطی</div>
                  <div className={styles.statValue}>
                    {formatAmount(currentStats.lineWinsCount)}
                  </div>
                </div>
              </div>
              <div className={styles.statCard}>
                <span className={styles.statIcon} aria-hidden="true">
                  👥
                </span>
                <div className={styles.statCardMain}>
                  <div className={styles.statLabel}>تعداد برد پر</div>
                  <div className={styles.statValue}>
                    {formatAmount(currentStats.fullWinsCount)}
                  </div>
                </div>
              </div>
            </div>
          </>
        )}

        {activeTab === "ranking" && (
          <div className={styles.rankingSection}>
            <div className={styles.rankingTable}>
              <div className={styles.rankingHeader}>
                <div className={styles.rankingHeaderCell}>تعداد کارت</div>
                <div className={styles.rankingHeaderCell}>مجموع برد</div>
                <div className={styles.rankingHeaderCell}>نام بازیکن</div>
                <div className={styles.rankingHeaderCell}>ردیف</div>
              </div>
              {leaderboard.length === 0 ? (
                <div className={styles.emptyRanking}>هیچ بازیکنی یافت نشد</div>
              ) : (
                <div className={styles.rankingBody}>
                  {leaderboard.map((entry) => (
                    <div key={entry.playerId} className={styles.rankingRow}>
                      <div className={styles.rankingCellNumeric}>{entry.cardCount}</div>
                      <div className={styles.rankingCellNumeric}>
                        {formatAmount(entry.totalWins)}
                      </div>
                      <div className={styles.rankingCell}>
                        <div className={styles.playerInfo}>
                          <span className={styles.playerName}>
                            {entry.displayName || entry.playerName}
                          </span>
                        </div>
                      </div>
                      <div className={styles.rankingCellNumeric}>{entry.rank}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {activeTab === "games" && (
          <div className={styles.gamesSection}>
            <div className={styles.gamesWindowHint}>گزارش ۲۴ ساعت گذشته</div>

            {gamesLoading ? (
              <div className={styles.loading}>در حال بارگذاری...</div>
            ) : gamesError ? (
              <div className={styles.gamesError}>{gamesError}</div>
            ) : gamesReports.length === 0 ? (
              <div className={styles.emptyState}>در ۲۴ ساعت گذشته بازی ثبت‌شده‌ای ندارید.</div>
            ) : (
              <div className={styles.gamesList}>
                {gamesReports.map((item) => (
                  <div key={item.id} className={styles.gameCard}>
                    <div className={styles.gameCardGrid}>
                      <span className={styles.gameLabel}>بازی</span>
                      <span className={styles.gameValue}>
                        {item.roomTitle}
                        {item.roomCode ? ` (${item.roomCode})` : ""}
                      </span>

                      <span className={styles.gameLabel}>مبلغ میز</span>
                      <span className={`${styles.gameValue} numeric-text numeric-text--14`} dir="ltr">
                        {item.roomAmount.toLocaleString("en-US")}
                      </span>

                      <span className={styles.gameLabel}>تعداد تیکت‌های من</span>
                      <span className={`${styles.gameValue} numeric-text numeric-text--14`} dir="ltr">
                        {item.myTicketsCount.toLocaleString("en-US")}
                      </span>

                      <span className={styles.gameLabel}>زمان بازی</span>
                      <span className={`${styles.gameValue} numeric-text numeric-text--14`} dir="ltr">
                        {formatPlayedAt(item.playedAt)}
                      </span>

                      <span className={styles.gameLabel}>برنده‌های فول</span>
                      <span className={styles.gameValue}>
                        {item.fullWinnerNames.length > 0
                          ? item.fullWinnerNames.join("، ")
                          : "نامشخص"}
                      </span>

                      <span className={styles.gameLabel}>برنده‌های لاین</span>
                      <span className={styles.gameValue}>
                        {item.lineWinnerNames.length > 0
                          ? item.lineWinnerNames.join("، ")
                          : "نامشخص"}
                      </span>
                    </div>

                    <div className={styles.gameResultBox}>
                      <div className={styles.gameResultTitle}>نتیجه بازی</div>
                      <div className={styles.gameResultRow}>
                        <span className={styles.gameResultRowLabel}>پاداش لاین</span>
                        <span className={`${styles.gameResultRowValue} numeric-text numeric-text--14`} dir="ltr">
                          {item.lineReward.toLocaleString("en-US")}
                        </span>
                      </div>
                      <div className={styles.gameResultRow}>
                        <span className={styles.gameResultRowLabel}>پاداش فول</span>
                        <span className={`${styles.gameResultRowValue} numeric-text numeric-text--14`} dir="ltr">
                          {item.fullReward.toLocaleString("en-US")}
                        </span>
                      </div>
                      <div className={styles.gameResultRow}>
                        <span className={styles.gameResultRowLabel}>پاداش کل</span>
                        <span className={`${styles.gameResultRowValue} numeric-text numeric-text--14`} dir="ltr">
                          {item.totalReward.toLocaleString("en-US")}
                        </span>
                      </div>
                    </div>

                    <div className={styles.gameMyResultBox}>
                      <div className={styles.gameResultTitle}>پاداش شما</div>
                      <div className={styles.gameResultRow}>
                        <span className={styles.gameResultRowLabel}>لاین</span>
                        <span className={`${styles.gameResultRowValue} numeric-text numeric-text--14`} dir="ltr">
                          {item.myLineReward.toLocaleString("en-US")}
                        </span>
                      </div>
                      <div className={styles.gameResultRow}>
                        <span className={styles.gameResultRowLabel}>فول</span>
                        <span className={`${styles.gameResultRowValue} numeric-text numeric-text--14`} dir="ltr">
                          {item.myFullReward.toLocaleString("en-US")}
                        </span>
                      </div>
                      <div className={styles.gameResultRow}>
                        <span className={styles.gameResultRowLabel}>جمع</span>
                        <span className={`${styles.gameResultRowValue} numeric-text numeric-text--14`} dir="ltr">
                          {item.myTotalReward.toLocaleString("en-US")}
                        </span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {!gamesLoading && gamesReports.length > 0 && (
              <div className={styles.gamesPagination}>
                <button
                  type="button"
                  onClick={() => setGamesPage((p) => Math.max(1, p - 1))}
                  disabled={gamesPage <= 1 || gamesLoading}
                  className={styles.gamesPageButton}
                >
                  قبلی
                </button>
                <div className={`${styles.gamesPageInfo} numeric-text numeric-text--14`} dir="ltr">
                  {gamesPage.toLocaleString("en-US")} / {gamesTotalPages.toLocaleString("en-US")}
                </div>
                <button
                  type="button"
                  onClick={() => setGamesPage((p) => Math.min(gamesTotalPages, p + 1))}
                  disabled={gamesPage >= gamesTotalPages || gamesLoading}
                  className={styles.gamesPageButton}
                >
                  بعدی
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}


