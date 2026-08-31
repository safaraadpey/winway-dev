"use client";

import React, { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useHeaderVisibility } from "@/lib/contexts/HeaderVisibilityContext";
import { supabase } from "@/lib/supabaseClient";
import styles from "./tournaments.module.css";
import { getShamsiEventDateTimeParts } from "@/lib/format/shamsiDate";

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
    is_test_tournament?: boolean | null;
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
  return `${n.toLocaleString("en-US", { maximumFractionDigits: 2 })}%`;
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

function startAtMs(row: TournamentRow): number {
  if (!row.start_at) return Number.POSITIVE_INFINITY;
  const ms = new Date(row.start_at).getTime();
  return Number.isFinite(ms) ? ms : Number.POSITIVE_INFINITY;
}

export default function TournamentsPage() {
  const router = useRouter();
  const { setShowBackButton, setOnBackClick } = useHeaderVisibility();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [rows, setRows] = useState<TournamentRow[]>([]);
  const [entryCounts, setEntryCounts] = useState<Record<string, number>>({});
  const [ticketTotals, setTicketTotals] = useState<Record<string, number>>({});
  const [registeredIds, setRegisteredIds] = useState<Record<string, boolean>>(
    {}
  );
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

  const statusLabel = (status: string | null, isRegistered: boolean) => {
    if (status === "registration_open" && isRegistered) {
      return "ثبت نام شده";
    }
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
    const [{ data, error }, { data: authData }] = await Promise.all([
      supabase
        .from("tournaments")
        .select(
          "id,title,status,start_at,currency,ticket_price,guaranteed_prize,commission_rate,meta"
        )
        .in("status", ["registration_open", "running", "settling", "finished"])
        .order("start_at", { ascending: true })
        .order("created_at", { ascending: true }),
      supabase.auth.getUser(),
    ]);
    const myUserId = authData?.user?.id ?? null;

    if (error) {
      setError(error.message || "خطا در دریافت لیست تورنومنت‌ها");
      setRows([]);
      setEntryCounts({});
      setTicketTotals({});
      setRegisteredIds({});
      setPrizePercents({});
    } else {
      const items = ((data as TournamentRow[]) ?? []).slice();

      const tournamentIds = items.map((i) => i.id);
      if (tournamentIds.length === 0) {
        setRows([]);
        setEntryCounts({});
        setTicketTotals({});
        setRegisteredIds({});
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

        const usersByTournament: Record<string, Set<string>> = {};
        const ticketsByTournament: Record<string, number> = {};
        if (!entriesError) {
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
        }

        const visibleItems = items.filter((t) => {
          if (t.meta?.is_test_tournament !== true) return true;
          if (!myUserId) return false;
          return usersByTournament[t.id]?.has(myUserId) === true;
        });
        setRows(visibleItems);

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
        for (const item of visibleItems) {
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
          setRegisteredIds({});
        } else {
          const nextCounts: Record<string, number> = {};
          const nextTickets: Record<string, number> = {};
          const nextRegistered: Record<string, boolean> = {};
          for (const item of visibleItems) {
            nextCounts[item.id] = usersByTournament[item.id]?.size ?? 0;
            nextTickets[item.id] = ticketsByTournament[item.id] ?? 0;
            if (myUserId && usersByTournament[item.id]?.has(myUserId)) {
              nextRegistered[item.id] = true;
            }
          }
          setEntryCounts(nextCounts);
          setTicketTotals(nextTickets);
          setRegisteredIds(nextRegistered);
        }
      }
    }
    setLoading(false);
  };

  useEffect(() => {
    void fetchTournaments();
  }, []);

  const { activeRows, finishedRows } = useMemo(() => {
    const active = rows
      .filter((row) =>
        ["registration_open", "running", "settling"].includes(row.status ?? "")
      )
      .sort((a, b) => startAtMs(a) - startAtMs(b));
    const finished = rows
      .filter((row) => row.status === "finished")
      .sort((a, b) => startAtMs(b) - startAtMs(a));
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
            <div className={styles.titleActions}>
              <button
                type="button"
                onClick={() =>
                  setViewMode((mode) => (mode === "active" ? "finished" : "active"))
                }
                className={`${styles.refreshButton} ${
                  viewMode === "finished" ? styles.refreshButtonActive : ""
                }`}
              >
                {viewMode === "finished" ? "در حال اجرا" : "لیست پایان یافته‌ها"}
              </button>
              <button
                type="button"
                onClick={() => void fetchTournaments()}
                className={styles.refreshButton}
              >
                بروزرسانی
              </button>
            </div>
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
                    const isRegistered = Boolean(registeredIds[t.id]);
                    const showRegisteredBadge =
                      isRegistered && t.status === "registration_open";
                    const eventAt = t.start_at
                      ? getShamsiEventDateTimeParts(t.start_at)
                      : null;
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
                              <span className={styles.fieldLabel}>تاریخ برگزاری</span>
                              {!eventAt ? (
                                <span className={styles.startTimeValue}>-</span>
                              ) : (
                                <span className={styles.startTimeValue} dir="rtl">
                                  <span className={styles.startTimeDate}>
                                    <span
                                      className={`${styles.startTimeDay} numeric-text numeric-text--14`}
                                      dir="ltr"
                                    >
                                      {eventAt.day}
                                    </span>{" "}
                                    {eventAt.month}
                                  </span>
                                  <span
                                    className={`${styles.startTimeClock} numeric-text numeric-text--14`}
                                    dir="ltr"
                                  >
                                    {eventAt.time}
                                  </span>
                                </span>
                              )}
                            </div>
                            <div className={styles.field}>
                              <span className={styles.fieldLabel}>وضعیت</span>
                              <span
                                className={`${styles.statusBadge}${
                                  showRegisteredBadge
                                    ? ` ${styles.statusBadgeRegistered}`
                                    : ""
                                }`}
                              >
                                {statusLabel(t.status, isRegistered)}
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
                                    dir="rtl"
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
