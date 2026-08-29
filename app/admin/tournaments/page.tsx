"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useHeaderVisibility } from "@/lib/contexts/HeaderVisibilityContext";
import { supabase } from "@/lib/supabaseClient";
import { TournamentFormValues, buildEqualPrizePercents } from "./TournamentForm";

type TournamentRow = {
  id: string;
  title: string;
  status: string;
  start_at: string | null;
  currency: string | null;
  ticket_price: number | null;
  min_tickets_per_player: number | null;
  max_tickets_per_player: number | null;
  table_size_mode: string | null;
  table_size_fixed: number | null;
  table_size_min: number | null;
  table_size_max: number | null;
  later_round_table_size_mode?: string | null;
  later_round_table_size_fixed?: number | null;
  later_round_table_size_min?: number | null;
  later_round_table_size_max?: number | null;
  remainder_policy: string | null;
  commission_rate: number | null;
  guaranteed_prize: number | null;
  created_at: string | null;
  optimizer_weights?: Record<string, unknown> | null;
  bye_compensation_rule?: Record<string, unknown> | null;
  meta?: Record<string, unknown> | null;
};

function mapToFormValues(row: TournamentRow): TournamentFormValues {
  const finalWinnersCount = (row.meta as any)?.final_winners_count ?? 1;
  return {
    title: row.title || "",
    status: row.status || "draft",
    start_at: row.start_at,
    currency: row.currency || "IRR",
    entry_currency: (row.meta as any)?.entry_currency || "IRR",
    ticket_price: row.ticket_price ?? null,
    min_tickets_per_player: row.min_tickets_per_player ?? 1,
    max_tickets_per_player: row.max_tickets_per_player ?? 1,
    table_size_mode: row.table_size_mode || "fixed",
    table_size_fixed: row.table_size_fixed ?? null,
    table_size_min: row.table_size_min ?? null,
    table_size_max: row.table_size_max ?? null,
    later_round_table_size_mode:
      row.later_round_table_size_mode || row.table_size_mode || "fixed",
    later_round_table_size_fixed:
      row.later_round_table_size_fixed ?? row.table_size_fixed ?? null,
    later_round_table_size_min:
      row.later_round_table_size_min ?? row.table_size_min ?? null,
    later_round_table_size_max:
      row.later_round_table_size_max ?? row.table_size_max ?? null,
    remainder_policy: row.remainder_policy || "adaptive_tables",
    commission_rate: row.commission_rate ?? 0,
    guaranteed_prize: row.guaranteed_prize ?? 0,
    min_players_to_start:
      (row.meta as any)?.min_players_to_start ?? 3,
    final_winners_count: finalWinnersCount,
    prize_percentages: buildEqualPrizePercents(finalWinnersCount),
    is_test_tournament: (row.meta as any)?.is_test_tournament === true,
    registration_extend_enabled:
      (row.meta as any)?.registration_extend_enabled !== false,
    registration_extend_minutes:
      (row.meta as any)?.registration_extend_minutes ?? 60,
    break_between_rounds_minutes:
      (row.meta as any)?.break_between_rounds_minutes ?? 0,
  };
}

const statusDisplay = (status: string | null) => {
  switch (status) {
    case "draft":
      return { label: "پیش‌نویس", className: "bg-gray-700/70 text-gray-50 border-gray-500/50" };
    case "registration_open":
      return { label: "ثبت‌نام باز", className: "bg-emerald-500/20 text-emerald-200 border-emerald-400/50" };
    case "running":
      return { label: "در حال اجرا", className: "bg-blue-500/20 text-blue-200 border-blue-400/50" };
    case "settling":
      return { label: "در حال تسویه", className: "bg-amber-500/20 text-amber-200 border-amber-400/50" };
    case "finished":
      return { label: "پایان‌یافته", className: "bg-slate-600/40 text-slate-100 border-slate-400/50" };
    case "cancelled":
      return { label: "لغوشده", className: "bg-red-600/20 text-red-100 border-red-500/60" };
    default:
      return { label: status || "-", className: "bg-gray-600/30 text-gray-100 border-gray-500/50" };
  }
};

export default function AdminTournamentsPage() {
  const router = useRouter();
  const { setShowHeader, setShowBackButton, setOnBackClick } = useHeaderVisibility();
  const [loading, setLoading] = useState(false);
  const [rows, setRows] = useState<TournamentRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  useEffect(() => {
    setShowHeader(true);
    setShowBackButton(true);
    setOnBackClick(() => () => router.push("/admin/dashboard"));
  }, [router, setOnBackClick, setShowBackButton, setShowHeader]);

  useEffect(() => {
    let active = true;
    const load = async () => {
      setLoading(true);
      setError(null);
      const { data, error } = await supabase
        .from("tournaments")
        .select("*")
        .order("created_at", { ascending: false });
      if (!active) return;
      if (error) {
        setError(error.message || "خطا در بارگذاری تورنومنت‌ها");
      } else {
        setRows((data as TournamentRow[]) ?? []);
      }
      setLoading(false);
    };
    load();
    return () => {
      active = false;
    };
  }, []);

  const hasData = rows.length > 0;

  const renderSettings = (t: TournamentRow) => {
    const statusLabel = statusDisplay(t.status).label;

    const tableSizeModeLabel = (() => {
      switch (t.table_size_mode) {
        case "fixed":
          return "سایز ثابت";
        case "range":
          return "بازه‌ای";
        default:
          return t.table_size_mode || "-";
      }
    })();

    const remainderPolicyLabel = (() => {
      switch (t.remainder_policy) {
        case "adaptive_tables":
          return "تقسیم تطبیقی میزها";
        case "uniform_with_bye":
          return "یکنواخت + بای";
        case "uniform_with_ghost":
          return "یکنواخت + گوست";
        default:
          return t.remainder_policy || "-";
      }
    })();

    return (
      <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm text-gray-200">
        <div>
          <dt className="text-gray-400">وضعیت</dt>
          <dd className="font-semibold">{statusLabel}</dd>
        </div>
        <div>
          <dt className="text-gray-400">شروع</dt>
          <dd className="font-semibold">
            {t.start_at ? new Date(t.start_at).toLocaleString("fa-IR") : "نامشخص"}
          </dd>
        </div>
        <div>
          <dt className="text-gray-400">گارانتی</dt>
          <dd className="font-semibold">
            {t.guaranteed_prize != null ? t.guaranteed_prize.toLocaleString("en-US") : "-"}
          </dd>
        </div>
        <div>
          <dt className="text-gray-400">قیمت بلیت</dt>
          <dd className="font-semibold">
            {t.ticket_price != null ? t.ticket_price.toLocaleString("en-US") : "-"}
          </dd>
        </div>
        <div>
          <dt className="text-gray-400">ارز</dt>
          <dd className="font-semibold">{t.currency || "IRR"}</dd>
        </div>
        <div>
          <dt className="text-gray-400">حداقل بلیت/پلیر</dt>
          <dd className="font-semibold">{t.min_tickets_per_player ?? "-"}</dd>
        </div>
        <div>
          <dt className="text-gray-400">حداکثر بلیت/پلیر</dt>
          <dd className="font-semibold">{t.max_tickets_per_player ?? "-"}</dd>
        </div>
        <div>
          <dt className="text-gray-400">مد سایز میز</dt>
          <dd className="font-semibold">{tableSizeModeLabel}</dd>
        </div>
        <div>
          <dt className="text-gray-400">سایز ثابت</dt>
          <dd className="font-semibold">{t.table_size_fixed ?? "-"}</dd>
        </div>
        <div>
          <dt className="text-gray-400">سایز حداقل</dt>
          <dd className="font-semibold">{t.table_size_min ?? "-"}</dd>
        </div>
        <div>
          <dt className="text-gray-400">سایز حداکثر</dt>
          <dd className="font-semibold">{t.table_size_max ?? "-"}</dd>
        </div>
        <div>
          <dt className="text-gray-400">سیاست باقی‌مانده</dt>
          <dd className="font-semibold">{remainderPolicyLabel}</dd>
        </div>
      </dl>
    );
  };

  return (
    <div className="min-h-screen bg-[#0E0E0F] p-4 text-white">
      <div className="max-w-4xl mx-auto space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">تورنومنت‌ها</h1>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => router.push("/admin/tournaments/report")}
              className="px-4 py-2 rounded-xl bg-[#1f2933] hover:bg-[#27323f] active:bg-[#324052] text-white text-sm font-semibold"
            >
              گزارش انجام‌شده‌ها
            </button>
            <button
              onClick={() => router.push("/admin/tournaments/create")}
              className="px-4 py-2 rounded-xl bg-teal-600 hover:bg-teal-500 active:bg-teal-700 text-white text-sm font-semibold"
            >
              + تورنومنت جدید
            </button>
          </div>
        </div>

        {loading && <div className="text-gray-300">در حال بارگذاری...</div>}
        {error && <div className="text-red-400 text-sm">{error}</div>}

        {!loading && !hasData && !error && (
          <div className="text-gray-400 text-sm border border-gray-800 rounded-xl p-4">
            تورنومنتی ثبت نشده است.
          </div>
        )}

        {!loading && hasData && (
          <div className="space-y-3">
            {rows.map((t) => (
              <div
                key={t.id}
                className="rounded-2xl border border-gray-800 bg-[#151515] px-4 py-2 space-y-3"
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <div className="text-lg font-semibold">{t.title || "بدون عنوان"}</div>
                    {(t.meta as { is_test_tournament?: boolean } | null)?.is_test_tournament ===
                    true ? (
                      <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full border bg-amber-500/20 text-amber-200 border-amber-400/50">
                        تستی
                      </span>
                    ) : null}
                    {(() => {
                      const { label, className } = statusDisplay(t.status);
                      return (
                        <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full border ${className}`}>
                          {label}
                        </span>
                      );
                    })()}
                    <span className="text-xs text-gray-400">
                      شروع: {t.start_at ? new Date(t.start_at).toLocaleString("fa-IR") : "نامشخص"}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => router.push(`/admin/tournaments/${t.id}`)}
                      className="px-3 py-2 rounded-lg bg-[#1f2933] text-sm text-white hover:bg-[#27323f]"
                    >
                      جزئیات
                    </button>
                    <button
                      onClick={() => router.push(`/admin/tournaments/${t.id}/edit`)}
                      className="px-3 py-2 rounded-lg bg-[#27323f] text-sm text-white hover:bg-[#324052]"
                    >
                      ویرایش
                    </button>
                    <button
                      onClick={() =>
                        setExpanded((prev) => ({
                          ...prev,
                          [t.id]: !prev[t.id],
                        }))
                      }
                      aria-expanded={!!expanded[t.id]}
                      aria-label={expanded[t.id] ? "بستن تنظیمات" : "نمایش تنظیمات"}
                      className="px-3 py-2 rounded-lg border border-gray-700 text-sm text-gray-200 hover:border-gray-500"
                    >
                      {expanded[t.id] ? (
                        <svg
                          aria-hidden="true"
                          className="h-5 w-5"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        >
                          <path d="M18 15l-6-6-6 6" />
                        </svg>
                      ) : (
                        <svg
                          aria-hidden="true"
                          className="h-5 w-5"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        >
                          <path d="M6 9l6 6 6-6" />
                        </svg>
                      )}
                    </button>
                  </div>
                </div>
                {expanded[t.id] && (
                  <div className="border-t border-gray-800 pt-3">{renderSettings(t)}</div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

    </div>
  );
}

