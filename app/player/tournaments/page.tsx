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

function normalizeCommissionRate(value: number | null | undefined): number {
  if (value == null || Number.isNaN(value)) return 0;
  if (value < 0) return 0;
  if (value > 1) return value / 100;
  return value;
}

export default function TournamentsPage() {
  const router = useRouter();
  const { setShowBackButton, setOnBackClick } = useHeaderVisibility();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [rows, setRows] = useState<TournamentRow[]>([]);
  const [entryCounts, setEntryCounts] = useState<Record<string, number>>({});
  const [ticketTotals, setTicketTotals] = useState<Record<string, number>>({});
  const [viewMode, setViewMode] = useState<"active" | "finished">("active");

  useEffect(() => {
    setShowBackButton(true);
    setOnBackClick(() => () => router.push("/player/home"));
    return () => {
      setShowBackButton(false);
      setOnBackClick(null);
    };
  }, [router, setOnBackClick, setShowBackButton]);

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
      } else {
        const { data: entriesData, error: entriesError } = await supabase
          .from("tournament_entries")
          .select("tournament_id,user_id,tickets_count")
          .in("tournament_id", tournamentIds)
          .eq("status", "created");

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
                    const minPlayersToStart =
                      t.meta?.min_players_to_start ?? 3;
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
                          <div className={styles.cardBadges}>
                            <span className={styles.statusBadge}>
                              {statusLabel(t.status)}
                            </span>
                            <span className={styles.dateBadge}>
                              {t.start_at
                                ? `${new Date(t.start_at).toLocaleDateString("fa-IR")}، ${new Date(
                                    t.start_at
                                  ).toLocaleTimeString("fa-IR", {
                                    hour: "2-digit",
                                    minute: "2-digit",
                                  })}`
                                : "نامشخص"}
                            </span>
                          </div>
                        </div>

                        <div className={styles.detailsGrid}>
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
                          <div className={styles.field}>
                            <span className={styles.fieldLabel}>جایزه تضمینی</span>
                            <span className={styles.fieldValue}>
                              {t.guaranteed_prize != null
                                ? t.guaranteed_prize.toLocaleString("en-US")
                                : "-"}
                            </span>
                          </div>
                          <div className={styles.field}>
                            <span className={styles.fieldLabel}>مبلغ جمع شده</span>
                            <span className={styles.fieldValue} dir="ltr">
                              {collectedAmount.toLocaleString("en-US")}
                            </span>
                          </div>
                          <div className={styles.field}>
                            <span className={styles.fieldLabel}>حداقل بازیکن</span>
                            <span className={styles.fieldValue}>
                              {minPlayersToStart.toLocaleString("en-US")}
                            </span>
                          </div>
                        </div>
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
