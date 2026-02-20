"use client";

import React, { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useHeaderVisibility } from "@/lib/contexts/HeaderVisibilityContext";
import { supabase } from "@/lib/supabaseClient";
import tournamentBg from "@/src/assets/tournament/10.png";
import myActiveGameBg from "@/src/assets/logo/MyActiveGame.png";

type TournamentRow = {
  id: string;
  title: string | null;
  status: string | null;
  start_at: string | null;
  currency: string | null;
  ticket_price: number | null;
  guaranteed_prize: number | null;
  meta?: {
    min_players_for_guarantee?: number | null;
    final_winners_count?: number | null;
    entry_currency?: string | null;
  } | null;
  tournament_entries?: { count: number }[] | null;
};

export default function TournamentsPage() {
  const router = useRouter();
  const { setShowBackButton, setOnBackClick } = useHeaderVisibility();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [rows, setRows] = useState<TournamentRow[]>([]);
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
        "id,title,status,start_at,currency,ticket_price,guaranteed_prize,meta,tournament_entries(count)"
      )
      .in("status", ["registration_open", "running", "settling", "finished"])
      .order("start_at", { ascending: false })
      .order("created_at", { ascending: false });

    if (error) {
      setError(error.message || "خطا در دریافت لیست تورنومنت‌ها");
      setRows([]);
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
    <div className="h-full bg-[#0E0E0F] bg-cover bg-center bg-no-repeat flex justify-center overflow-hidden">
      <div className="w-full max-w-md h-full px-4 py-6 flex flex-col min-h-0">
        <div className="space-y-4 flex-shrink-0">
          <div className="flex items-center justify-between text-white">
            <div>
              <h1 className="text-2xl font-bold">تورنومنت‌ها</h1>
            </div>
            <button
              onClick={() => void fetchTournaments()}
              className="px-3 py-1.5 text-sm rounded-lg bg-[#1F2937] text-gray-100 hover:bg-[#111827] transition"
            >
              بروزرسانی
            </button>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setViewMode("active")}
              className={`px-3 py-1.5 text-sm rounded-full border transition ${
                viewMode === "active"
                  ? "text-white border-transparent"
                  : "bg-[#111827] text-white border-gray-700 hover:bg-[#1F2937]"
              }`}
              style={
                viewMode === "active"
                  ? {
                      backgroundImage: `url(${myActiveGameBg.src})`,
                      backgroundRepeat: "no-repeat",
                      backgroundPosition: "center center",
                      backgroundSize: "100% 100%",
                    }
                  : undefined
              }
            >
              در حال اجرا
            </button>
            <button
              onClick={() => setViewMode("finished")}
              className={`px-3 py-1.5 text-sm rounded-full border transition ${
                viewMode === "finished"
                  ? "text-white border-transparent"
                  : "bg-[#111827] text-white border-gray-700 hover:bg-[#1F2937]"
              }`}
              style={
                viewMode === "finished"
                  ? {
                      backgroundImage: `url(${myActiveGameBg.src})`,
                      backgroundRepeat: "no-repeat",
                      backgroundPosition: "center center",
                      backgroundSize: "100% 100%",
                    }
                  : undefined
              }
            >
              پایان یافته
            </button>
          </div>
        </div>

        <div className="mt-4 flex-1 min-h-0 overflow-y-auto space-y-3 pr-1 [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
          {loading ? (
            <div className="flex flex-col items-center justify-center text-white py-16 gap-3">
              <div className="w-8 h-8 border-4 border-gray-700 border-t-emerald-400 rounded-full animate-spin" />
              <p className="text-gray-300 text-sm">در حال بارگذاری تورنومنت‌ها...</p>
            </div>
          ) : (
            <>
              {error && (
                <div className="rounded-lg border border-red-500/40 bg-red-500/10 text-red-100 px-3 py-2 text-sm">
                  {error}
                </div>
              )}

              {!error && filteredRows.length === 0 && (
                <div className="rounded-lg border border-gray-700 bg-[#111827] text-gray-200 px-4 py-6 text-center">
                  {viewMode === "active"
                    ? "فعلاً تورنومنت فعالی وجود ندارد."
                    : "فعلاً تورنومنت پایان یافته‌ای وجود ندارد."}
                </div>
              )}

              {!error && filteredRows.length > 0 && (
                <div className="space-y-3">
                  {filteredRows.map((t) => {
                    const entriesCount = t.tournament_entries?.[0]?.count ?? 0;
                    const minPlayersForGuarantee =
                      t.meta?.min_players_for_guarantee ?? null;
                    const finalWinnersCount = t.meta?.final_winners_count ?? null;
                    const entryCurrency =
                      (t.meta?.entry_currency || t.currency || "IRR").toString();

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
                        className="rounded-xl border border-transparent px-4 py-3 text-white shadow-lg shadow-black/30 cursor-pointer transition transform hover:scale-[1.01] focus:outline-none focus:ring-2 focus:ring-emerald-400/60"
                        style={{
                          backgroundImage: `url(${tournamentBg.src})`,
                          backgroundRepeat: "no-repeat",
                          backgroundPosition: "center center",
                          backgroundSize: "100% 100%",
                          backgroundColor: "#111827",
                        }}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <div className="font-extrabold text-xl text-[#212121]">
                            {t.title || "بدون عنوان"}
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="text-xs px-2 py-1 rounded-full border border-gray-500/60 bg-black/40 font-medium text-gray-100">
                              {t.start_at
                                ? new Date(t.start_at).toLocaleString("fa-IR")
                                : "نامشخص"}
                            </span>
                            <span className="text-xs px-2 py-1 rounded-full bg-[rgba(0,255,170,0.6)] text-[rgba(49,63,56,1)] border border-[rgba(0,0,0,0.3)] font-semibold">
                              {statusLabel(t.status)}
                            </span>
                          </div>
                        </div>

                        <div
                          className="mt-2 grid gap-x-3 gap-y-1 text-sm text-gray-200"
                          style={{ gridTemplateColumns: "repeat(3, 1fr)" }}
                        >
                          <div className="flex flex-col gap-0.5">
                            <span className="text-[#212121] text-xs font-bold">قیمت بلیت</span>
                            <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full border border-gray-500/60 bg-black/40 font-medium text-gray-100">
                              {t.ticket_price != null
                                ? `${t.ticket_price.toLocaleString("fa-IR")} ${entryCurrency}`
                                : "-"}
                            </span>
                          </div>
                          <div className="flex flex-col gap-0.5">
                            <span className="text-[#212121] text-xs font-bold">تعداد شرکت‌کننده</span>
                            <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full border border-gray-500/60 bg-black/40 font-medium text-gray-100">
                              {entriesCount.toLocaleString("fa-IR")}
                            </span>
                          </div>
                          <div className="flex flex-col gap-0.5">
                            <span className="text-xs font-bold text-[#212121]">تعداد برنده نهایی</span>
                            <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full border border-gray-500/60 bg-black/40 font-medium text-gray-100">
                              {finalWinnersCount != null
                                ? finalWinnersCount.toLocaleString("fa-IR")
                                : "-"}
                            </span>
                          </div>
                          <div className="flex flex-col gap-0.5">
                            <span className="text-xs font-bold text-[#212121]">جایزه تضمینی</span>
                            <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full border border-gray-500/60 bg-black/40 font-medium text-gray-100">
                              {t.guaranteed_prize != null
                                ? `${t.guaranteed_prize.toLocaleString("fa-IR")} ${t.currency ?? ""}`
                                : "-"}
                            </span>
                          </div>
                          <div className="flex flex-col gap-0.5">
                            <span className="text-xs font-bold text-[#212121]">حداقل بازیکن</span>
                            <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full border border-gray-500/60 bg-black/40 font-medium text-gray-100">
                              {minPlayersForGuarantee != null
                                ? minPlayersForGuarantee.toLocaleString("fa-IR")
                                : "-"}
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

