"use client";

import React, { useEffect, useState } from "react";
import { useHeaderVisibility } from "@/lib/contexts/HeaderVisibilityContext";
import { loadLeaderboardData } from "@/services/leaderboard";
import type { LeaderboardData } from "@/src/types/leaderboard";
import toast from "react-hot-toast";
import styles from "./LeaderboardPage.module.css";
import { useRouter } from "next/navigation";

/**
 * فرمت کردن مبلغ به صورت فارسی
 */
function formatAmount(amount: number): string {
  return new Intl.NumberFormat("en-US").format(amount);
}

export default function LeaderboardPage() {
  const { setShowBackButton, setOnBackClick } = useHeaderVisibility();
  const router = useRouter();
  const [data, setData] = useState<LeaderboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<"history" | "ranking">("history");

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

  const { totalWinningsToday, totalPurchasesToday, wins, purchases, leaderboard } = data;

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
            سوابق من
          </button>
          <button
            onClick={() => setActiveTab("ranking")}
            className={`${styles.tab} ${
              activeTab === "ranking" ? styles.tabActive : ""
            }`}
          >
            رتبه بندی
          </button>
        </div>

        {activeTab === "history" && (
          <>
            {/* بخش مجموع مبلغ برد امروز */}
            <div className={styles.section}>
              <div className={styles.sectionHeader}>
                <span className={styles.sectionTitle}>مجموع مبلغ برد امروز</span>
                <span className={styles.sectionValue}>
                  {formatAmount(totalWinningsToday)}
                </span>
              </div>

              <div className={styles.table}>
                <div className={styles.tableHeader}>
                  <div className={styles.tableHeaderCell}>زمان بازی</div>
                  <div className={styles.tableHeaderCell}>مبلغ برد</div>
                  <div className={styles.tableHeaderCell}>نام اتاق</div>
                </div>
                {wins.length === 0 ? (
                  <div className={styles.emptyTable}>هیچ بردی ثبت نشده است</div>
                ) : (
                  <div className={styles.tableBody}>
                    {wins.map((win) => (
                      <div key={win.id} className={styles.tableRow}>
                        <div className={styles.tableCell}>{win.gameTime}</div>
                        <div className={styles.tableCell}>
                          {formatAmount(win.amountWon)}
                        </div>
                        <div className={styles.tableCell}>{win.roomName}</div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* بخش مجموع مبلغ خرید امروز */}
            <div className={styles.section}>
              <div className={styles.sectionHeader}>
                <span className={styles.sectionTitle}>مجموع مبلغ خرید امروز</span>
                <span className={styles.sectionValue}>
                  {formatAmount(totalPurchasesToday)}
                </span>
              </div>

              <div className={styles.table}>
                <div className={styles.tableHeader}>
                  <div className={styles.tableHeaderCell}>مبلغ خرید</div>
                  <div className={styles.tableHeaderCell}>تعداد برگ</div>
                  <div className={styles.tableHeaderCell}>نام اتاق</div>
                </div>
                {purchases.length === 0 ? (
                  <div className={styles.emptyTable}>هیچ خریدی ثبت نشده است</div>
                ) : (
                  <div className={styles.tableBody}>
                    {purchases.map((purchase) => (
                      <div key={purchase.id} className={styles.tableRow}>
                        <div className={styles.tableCell}>
                          {formatAmount(purchase.purchaseAmount)}
                        </div>
                        <div className={styles.tableCell}>
                          {purchase.cardCount}
                        </div>
                        <div className={styles.tableCell}>{purchase.roomName}</div>
                      </div>
                    ))}
                  </div>
                )}
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
                      <div className={styles.rankingCell}>{entry.cardCount}</div>
                      <div className={styles.rankingCell}>
                        {formatAmount(entry.totalWins)}
                      </div>
                      <div className={styles.rankingCell}>
                        <div className={styles.playerInfo}>
                          <span className={styles.playerName}>
                            {entry.displayName || entry.playerName}
                          </span>
                          {entry.avatarUrl ? (
                            <img
                              src={entry.avatarUrl}
                              alt={entry.displayName || entry.playerName}
                              className={styles.playerAvatar}
                            />
                          ) : (
                            <div className={styles.playerAvatarPlaceholder}>
                              <svg
                                width="24"
                                height="24"
                                viewBox="0 0 24 24"
                                fill="none"
                                stroke="currentColor"
                                strokeWidth="2"
                              >
                                <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                                <circle cx="12" cy="7" r="4" />
                              </svg>
                            </div>
                          )}
                        </div>
                      </div>
                      <div className={styles.rankingCell}>{entry.rank}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}


