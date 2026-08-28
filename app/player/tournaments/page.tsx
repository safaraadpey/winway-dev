"use client";

import React, { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useHeaderVisibility } from "@/lib/contexts/HeaderVisibilityContext";
import { supabase } from "@/lib/supabaseClient";
import styles from "./tournaments.module.css";

type TournamentRow = {
  id: string;
  title: string | null;
  status: string | null;
  start_at: string | null;
  currency: string | null;
  ticket_price: number | null;
  guaranteed_prize: number | null;
  commission_rate: number | null;
  meta?: {
    min_players_to_start?: number | null;
    final_winners_count?: number | null;
    entry_currency?: string | null;
  } | null;
};

const RANK_LABELS = [
  "نفر اول",
  "نفر دوم",
  "نفر سوم",
  "نفر چهارم",
  "نفر پنجم",
  "نفر ششم",
  "نفر هفتم",
  "نفر هشتم",
];

function normalizeCommissionRate(value: number | null | undefined): number {
  if (value == null || Number.isNaN(value)) return 0;
  if (value < 0) return 0;
  if (value > 1) return value / 100;
  return value;
}

function buildEqualPrizePercents(count: number): number[] {
  if (count <= 0) return [];
  if (count === 1) return [100];
  const base = Math.floor(100 / count);
  const remainder = 100 - base * count;
  return Array.from({ length: count }, (_, i) => (i === 0 ? base + remainder : base));
}

function rankLabel(rank: number): string {
  return RANK_LABELS[rank - 1] ?? `نفر ${rank}`;
}

function formatPercent(value: number): string {
  const n = Number(value);
  if (!Number.isFinite(n)) return "-";
  return `${n.toLocaleString("en-US")}%`;
}

function formatLongCountdown(seconds: number): string {
  const safe = Math.max(0, Math.floor(seconds));
  const days = Math.floor(safe / 86400);
  const hours = Math.floor((safe % 86400) / 3600)
    .toString()
    .padStart(2, "0");
  const mins = Math.floor((safe % 3600) / 60)
    .toString()
    .padStart(2, "0");
  const secs = (safe % 60).toString().padStart(2, "0");
  return `${days}:${hours}:${mins}:${secs}`;
}

function remainingSecondsUntil(startAt: string | null, nowMs: number): number {
  if (!startAt) return 0;
  const startMs = new Date(startAt).getTime();
  if (!Number.isFinite(startMs)) return 0;
  return Math.max(0, Math.floor((startMs - nowMs) / 1000));
}

export default function TournamentsPage() {
  const router = useRouter();
  const { setShowBackButton, setOnBackClick } = useHeaderVisibility();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [rows, setRows] = useState<TournamentRow[]>([]);
  const [entryCounts, setEntryCounts] = useState<Record<string, number>>({});
  const [ticketTotals, setTicketTotals] = useState<Record<string, number>>({});
  const [prizePercents, setPrizePercents] = useState<Record<string, number[]>>({});
  const [openPrizeSplitIds, setOpenPrizeSplitIds] = useState<Record<string, boolean>>({});
  const [viewMode, setViewMode] = useState<"active" | "finished">("active");
  const [nowMs, setNowMs] = useState(() => Date.now());

  useEffect(() => {
    setShowBackButton(true);
    setOnBackClick(() => () => router.push("/player/home"));
    return () => {
      setShowBackButton(false);
      setOnBackClick(null);
    };
  }, [router, setOnBackClick, setShowBackButton]);

  useEffect(() => {
    const timerId = window.setInterval(() => {
      setNowMs(Date.now());
    }, 1000);
    const onHardExit = () => {
      window.clearInterval(timerId);
    };
    window.addEventListener("app:hard-exit", onHardExit);
    return () => {
      window.clearInterval(timerId);
      window.removeEventListener("app:hard-exit", onHardExit);
    };
  }, []);

  const statusLabel = (status: string | null) => {
    switch (status) {
      case "registration_open":
        return "ثبت نام";
      case "running":
        return "در حال اجرا";
      case "settling":
        return "در حال تسویه";
      case "finished":
        return "پایان‌یافته";
      case "draft":
        return "پیش‌نویس";
      default:
        return status || "-";
    }
  };

  const fetchTournaments = async () => {
    setLoading(true);
    setError(null);
    const { data, error } = await supabase
      .from("tournaments")
      .select(
        "id,title,status,start_at,currency,ticket_price,guaranteed_prize,commission_rate,meta"
      )
      .in("status", ["registration_open", "running", "settling", "finished"])
      .order("start_at", { ascending: false })
      .order("created_at", { ascending: false });

    if (error) {
      setError(error.message || "خطا در دریافت لیست تورنومنت‌ها");
      setRows([]);
      setEntryCounts({});
      setTicketTotals({});
      setPrizePercents({});
    } else {
      const items = ((data as TournamentRow[]) ?? []).slice();
      const statusPriority: Record<string, number> = {
        registration_open: 0,
        running: 1,
        settling: 2,
        finished: 3,
        draft: 4,
      };
      items.sort((a, b) => {
        const pa = statusPriority[a.status ?? ""] ?? 99;
        const pb = statusPriority[b.status ?? ""] ?? 99;
        if (pa !== pb) return pa - pb;
        const sa = a.start_at ? new Date(a.start_at).getTime() : Number.MIN_SAFE_INTEGER;
        const sb = b.start_at ? new Date(b.start_at).getTime() : Number.MIN_SAFE_INTEGER;
        if (sa !== sb) return sb - sa;
        return 0;
      });
      setRows(items);

      const tournamentIds = items.map((i) => i.id);
      if (tournamentIds.length === 0) {
        setEntryCounts({});
        setTicketTotals({});
        setPrizePercents({});
      } else {
        const [
          { data: entriesData, error: entriesError },
          { data: prizeRulesData },
        ] = await Promise.all([
          supabase
            .from("tournament_entries")
            .select("tournament_id,user_id,tickets_count")
            .in("tournament_id", tournamentIds)
            .eq("status", "created"),
          supabase
            .from("tournament_prize_rules")
            .select("tournament_id, rank, payout_type, payout_value")
            .in("tournament_id", tournamentIds)
            .eq("payout_type", "percent")
            .order("rank", { ascending: true }),
        ]);

        const percentsByTournament: Record<string, number[]> = {};
        for (const rule of (prizeRulesData as {
          tournament_id: string;
          rank: number;
          payout_type: string;
          payout_value: number | string | null;
        }[]) ?? []) {
          const value = Number(rule.payout_value);
          if (!Number.isFinite(value)) continue;
          if (!percentsByTournament[rule.tournament_id]) {
            percentsByTournament[rule.tournament_id] = [];
          }
          percentsByTournament[rule.tournament_id].push(value);
        }
        const nextPercents: Record<string, number[]> = {};
        for (const item of items) {
          const winnersCount = item.meta?.final_winners_count ?? 1;
          const fromRules = percentsByTournament[item.id];
          nextPercents[item.id] =
            fromRules && fromRules.length > 0
              ? fromRules
              : buildEqualPrizePercents(winnersCount);
        }
        setPrizePercents(nextPercents);

        if (entriesError) {
          setEntryCounts({});
          setTicketTotals({});
        } else {
          const usersByTournament: Record<string, Set<string>> = {};
          const ticketsByTournament: Record<string, number> = {};
          for (const row of (entriesData as {
            tournament_id: string;
            user_id: string;
            tickets_count: number | null;
          }[]) ?? []) {
            if (!usersByTournament[row.tournament_id]) {
              usersByTournament[row.tournament_id] = new Set<string>();
            }
            usersByTournament[row.tournament_id].add(row.user_id);
            ticketsByTournament[row.tournament_id] =
              (ticketsByTournament[row.tournament_id] ?? 0) +
              (Number(row.tickets_count) || 0);
          }
          const nextCounts: Record<string, number> = {};
          const nextTickets: Record<string, number> = {};
          for (const id of tournamentIds) {
            nextCounts[id] = usersByTournament[id]?.size ?? 0;
            nextTickets[id] = ticketsByTournament[id] ?? 0;
          }
          setEntryCounts(nextCounts);
          setTicketTotals(nextTickets);
        }
      }
    }
    setLoading(false);
  };

  useEffect(() => {
    void fetchTournaments();
  }, []);

  const { activeRows, finishedRows } = useMemo(() => {
    const active = rows.filter((row) =>
      ["registration_open", "running", "settling"].includes(row.status ?? "")
    );
    const finished = rows.filter((row) => row.status === "finished");
    return { activeRows: active, finishedRows: finished };
  }, [rows]);

  const filteredRows = viewMode === "active" ? activeRows : finishedRows;

  const handleTournamentClick = (id: string) => {
    router.push(`/player/tournaments/${id}?tournamentId=${id}&templateId=${id}`);
  };

  return (
    <div className={styles.page}>
      <div className={styles.inner}>
        <div className={styles.headerBlock}>
          <div className={styles.titleRow}>
            <h1 className={styles.title}>تورنومنت‌ها</h1>
            <button
              type="button"
              onClick={() => void fetchTournaments()}
              className={styles.refreshButton}
            >
              بروزرسانی
            </button>
          </div>

          <div className={styles.tabs}>
            <button
              type="button"
              onClick={() => setViewMode("active")}
              className={`${styles.tab} ${
                viewMode === "active" ? styles.tabActive : styles.tabInactive
              }`}
            >
              در حال اجرا
            </button>
            <button
              type="button"
              onClick={() => setViewMode("finished")}
              className={`${styles.tab} ${
                viewMode === "finished" ? styles.tabActive : styles.tabInactive
              }`}
            >
              پایان یافته
            </button>
          </div>
        </div>

        <div className={styles.list}>
          {loading ? (
            <div className={styles.loading}>
              <div className={styles.loadingSpinner} aria-hidden="true" />
              <p className={styles.loadingText}>در حال بارگذاری تورنومنت‌ها...</p>
            </div>
          ) : (
            <>
              {error && <div className={styles.errorBox}>{error}</div>}

              {!error && filteredRows.length === 0 && (
                <div className={styles.emptyBox}>
                  {viewMode === "active"
                    ? "فعلاً تورنومنت فعالی وجود ندارد."
                    : "فعلاً تورنومنت پایان یافته‌ای وجود ندارد."}
                </div>
              )}

              {!error && filteredRows.length > 0 && (
                <div className={styles.cards}>
                  {filteredRows.map((t) => {
                    const entriesCount = entryCounts[t.id] ?? 0;
                    const finalWinnersCount = t.meta?.final_winners_count ?? null;
                    const entryCurrency = (
                      t.meta?.entry_currency ||
                      t.currency ||
                      "IRR"
                    ).toString();
                    const totalTickets = ticketTotals[t.id] ?? 0;
                    const price = Number(t.ticket_price) || 0;
                    const commissionRate = normalizeCommissionRate(
                      t.commission_rate
                    );
                    const prizePoolGross =
                      entryCurrency === "DING" ? 0 : price * totalTickets;
                    const collectedAmount = Math.max(
                      0,
                      prizePoolGross * (1 - commissionRate)
                    );
                    const guaranteedPrize = Number(t.guaranteed_prize) || 0;
                    const hasGuarantee = guaranteedPrize > 0;
                    const prizeLabel = hasGuarantee
                      ? "جایزه گارانتی"
                      : "جایزه جمع شده";
                    const prizeAmount = hasGuarantee
                      ? Math.max(guaranteedPrize, collectedAmount)
                      : collectedAmount;
                    const winnerPercents = prizePercents[t.id] ?? [];
                    return (
                      <div
                        key={t.id}
                        role="button"
                        tabIndex={0}
                        onClick={() => handleTournamentClick(t.id)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault();
                            handleTournamentClick(t.id);
                          }
                        }}
                        className={styles.card}
                      >
                        <div className={styles.cardHeader}>
                          <div className={styles.cardTitle}>
                            {t.title || "بدون عنوان"}
                          </div>
                        </div>

                        <div className={styles.detailsGrid}>
                          <div className={styles.detailsRow}>
                            <div className={styles.field}>
                              <span className={styles.fieldLabel}>{prizeLabel}</span>
                              <span className={styles.fieldValue} dir="ltr">
                                {prizeAmount.toLocaleString("en-US")}
                              </span>
                            </div>
                            <div className={styles.field}>
                              <span className={styles.fieldLabel}>زمان شروع</span>
                              <span className={styles.startTimeValue}>
                                {t.start_at
                                  ? `${new Date(t.start_at).toLocaleDateString("fa-IR")}، ${new Date(
                                      t.start_at
                                    ).toLocaleTimeString("fa-IR", {
                                      hour: "2-digit",
                                      minute: "2-digit",
                                    })}`
                                  : "-"}
                              </span>
                            </div>
                            <div className={styles.field}>
                              <span className={styles.fieldLabel}>وضعیت</span>
                              <span className={styles.statusBadge}>
                                {statusLabel(t.status)}
                              </span>
                            </div>
                          </div>
                          <div className={styles.detailsRow}>
                            <div className={styles.field}>
                              <span className={styles.fieldLabel}>
                                {entryCurrency === "DING"
                                  ? "ورودی(دینگ)"
                                  : "قیمت کارت(تومان)"}
                              </span>
                              <span className={styles.fieldValue}>
                                {t.ticket_price != null
                                  ? t.ticket_price <= 0
                                    ? "رایگان"
                                    : t.ticket_price.toLocaleString("en-US")
                                  : "-"}
                              </span>
                            </div>
                            <div className={styles.field}>
                              <span className={styles.fieldLabel}>تعداد شرکت‌کننده</span>
                              <span className={styles.fieldValue}>
                                {entriesCount.toLocaleString("en-US")}
                              </span>
                            </div>
                            <div className={styles.field}>
                              <span className={styles.fieldLabel}>تعداد برنده نهایی</span>
                              <span className={styles.fieldValue}>
                                {finalWinnersCount != null
                                  ? finalWinnersCount.toLocaleString("en-US")
                                  : "-"}
                              </span>
                            </div>
                          </div>
                        </div>

                        {(winnerPercents.length > 0 || t.start_at) && (
                          <div
                            className={styles.prizeSplit}
                            onClick={(e) => e.stopPropagation()}
                            onKeyDown={(e) => e.stopPropagation()}
                          >
                            <div className={styles.prizeSplitBar}>
                              {winnerPercents.length > 0 ? (
                                <button
                                  type="button"
                                  className={styles.prizeSplitTrigger}
                                  aria-expanded={Boolean(openPrizeSplitIds[t.id])}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setOpenPrizeSplitIds((prev) => ({
                                      ...prev,
                                      [t.id]: !prev[t.id],
                                    }));
                                  }}
                                >
                                  <span>درصد تقسیم جوایز</span>
                                  <span
                                    className={
                                      openPrizeSplitIds[t.id]
                                        ? styles.prizeSplitChevronOpen
                                        : styles.prizeSplitChevron
                                    }
                                    aria-hidden="true"
                                  >
                                    ▼
                                  </span>
                                </button>
                              ) : (
                                <div className={styles.prizeSplitTriggerSpacer} />
                              )}
                              <span
                                className={styles.prizeSplitTimer}
                                dir="ltr"
                              >
                                {formatLongCountdown(
                                  remainingSecondsUntil(t.start_at, nowMs)
                                )}
                              </span>
                            </div>
                            {winnerPercents.length > 0 && openPrizeSplitIds[t.id] ? (
                              <div className={styles.prizeSplitMenu} role="list">
                                {winnerPercents.map((pct, index) => (
                                  <div
                                    key={`${t.id}-prize-${index}`}
                                    className={styles.prizeSplitRow}
                                    role="listitem"
                                  >
                                    <span className={styles.prizeSplitRank}>
                                      {rankLabel(index + 1)}
                                    </span>
                                    <span
                                      className={`${styles.prizeSplitPercent} numeric-text numeric-text--14`}
                                      dir="ltr"
                                    >
                                      {formatPercent(pct)}
                                    </span>
                                  </div>
                                ))}
                              </div>
                            ) : null}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
