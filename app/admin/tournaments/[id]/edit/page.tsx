"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import { useHeaderVisibility } from "@/lib/contexts/HeaderVisibilityContext";
import { supabase } from "@/lib/supabaseClient";
import { parseWatchInviteBannerOverrideFromMeta } from "@/lib/watch-invite/bannerOverride";
import {
  prepareWatchInviteBannerPayload,
  stripWatchInviteBannerFields,
} from "@/lib/watch-invite/prepareBannerPayload";
import { useIsAdminZero } from "@/lib/admin/useIsAdminZero";
import { TournamentForm, TournamentFormValues, buildEqualPrizePercents } from "../../TournamentForm";

export default function AdminTournamentEditPage() {
  const router = useRouter();
  const params = useParams();
  const { setShowHeader, setShowBackButton, setOnBackClick } = useHeaderVisibility();
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [statusUpdating, setStatusUpdating] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [initialValues, setInitialValues] = useState<TournamentFormValues | null>(null);
  const { ready: adminZeroReady, isAdminZero } = useIsAdminZero();

  const tournamentId = typeof params?.id === "string" ? params.id : Array.isArray(params?.id) ? params?.id[0] : null;

  const mapRowToValues = useCallback(
    (data: any, prizeRules?: { rank: number; payout_type: string; payout_value: number }[]): TournamentFormValues => {
      const finalWinnersCount = data?.meta?.final_winners_count ?? 1;
      const percentRules = (prizeRules ?? [])
        .filter((r) => r.payout_type === "percent")
        .sort((a, b) => a.rank - b.rank);
      const prizePercentages =
        percentRules.length === finalWinnersCount
          ? percentRules.map((r) => Number(r.payout_value))
          : buildEqualPrizePercents(finalWinnersCount);

      return {
        title: data.title || "",
        status: data.status || "draft",
        start_at: data.start_at,
        currency: data.currency || "IRR",
        entry_currency: data?.meta?.entry_currency || "IRR",
        ticket_price: data.ticket_price ?? null,
        min_tickets_per_player: data.min_tickets_per_player ?? 1,
        max_tickets_per_player: data.max_tickets_per_player ?? 1,
        table_size_mode: data.table_size_mode || "fixed",
        table_size_fixed: data.table_size_fixed ?? null,
        table_size_min: data.table_size_min ?? null,
        table_size_max: data.table_size_max ?? null,
        later_round_table_size_mode:
          data.later_round_table_size_mode || data.table_size_mode || "fixed",
        later_round_table_size_fixed:
          data.later_round_table_size_fixed ?? data.table_size_fixed ?? null,
        later_round_table_size_min:
          data.later_round_table_size_min ?? data.table_size_min ?? null,
        later_round_table_size_max:
          data.later_round_table_size_max ?? data.table_size_max ?? null,
        remainder_policy: data.remainder_policy || "adaptive_tables",
        commission_rate: data.commission_rate ?? null,
        guaranteed_prize: data.guaranteed_prize ?? 0,
        min_players_to_start: data?.meta?.min_players_to_start ?? 3,
        registration_extend_enabled:
          data?.meta?.registration_extend_enabled !== false,
        registration_extend_minutes:
          data?.meta?.registration_extend_minutes ?? 60,
        break_between_rounds_minutes:
          data?.meta?.break_between_rounds_minutes ?? 0,
        final_winners_count: finalWinnersCount,
        prize_percentages: prizePercentages,
        is_test_tournament: data?.meta?.is_test_tournament === true,
        ...parseWatchInviteBannerOverrideFromMeta(data?.meta),
      };
    },
    []
  );

  useEffect(() => {
    setShowHeader(true);
    setShowBackButton(true);
    setOnBackClick(() => () => router.push("/admin/tournaments"));
  }, [router, setOnBackClick, setShowBackButton, setShowHeader]);

  useEffect(() => {
    if (!adminZeroReady || loading || !initialValues) return;
    if (!isAdminZero && initialValues.is_test_tournament) {
      router.replace("/admin/tournaments");
    }
  }, [adminZeroReady, initialValues, isAdminZero, loading, router]);

  useEffect(() => {
    let active = true;
    const load = async () => {
      if (!tournamentId) {
        setError("شناسه تورنومنت نامعتبر است");
        setLoading(false);
        return;
      }
      setLoading(true);
      setError(null);
      const { data, error } = await supabase
        .from("tournaments")
        .select("*")
        .eq("id", tournamentId)
        .maybeSingle();
      if (!active) return;
      if (error || !data) {
        setError(error?.message || "تورنومنت یافت نشد");
      } else {
        const { data: prizeRules } = await supabase
          .from("tournament_prize_rules")
          .select("rank, payout_type, payout_value")
          .eq("tournament_id", tournamentId)
          .order("rank", { ascending: true });
        if (!active) return;
        setInitialValues(mapRowToValues(data, prizeRules ?? []));
      }
      setLoading(false);
    };
    load();
    return () => {
      active = false;
    };
  }, [mapRowToValues, tournamentId]);

  const isLocked =
    initialValues?.status === "running" ||
    initialValues?.status === "settling" ||
    initialValues?.status === "finished" ||
    initialValues?.status === "cancelled";

  const handleSubmit = async (values: TournamentFormValues) => {
    if (!tournamentId || isLocked) return;
    setSubmitting(true);
    setError(null);

    let watchInviteBanner = null;
    try {
      watchInviteBanner = await prepareWatchInviteBannerPayload(values);
    } catch (err) {
      setSubmitting(false);
      setError(err instanceof Error ? err.message : "خطا در آماده‌سازی بنر دعوت");
      return;
    }

    const coreValues = stripWatchInviteBannerFields(values);
    const patch = {
      title: coreValues.title,
      start_at: coreValues.start_at,
      currency: coreValues.currency,
      ticket_price: coreValues.ticket_price,
      min_tickets_per_player: coreValues.min_tickets_per_player,
      max_tickets_per_player: coreValues.max_tickets_per_player,
      table_size_mode: coreValues.table_size_mode,
      table_size_fixed: coreValues.table_size_fixed,
      table_size_min: coreValues.table_size_min,
      table_size_max: coreValues.table_size_max,
      later_round_table_size_mode: coreValues.later_round_table_size_mode,
      later_round_table_size_fixed: coreValues.later_round_table_size_fixed,
      later_round_table_size_min: coreValues.later_round_table_size_min,
      later_round_table_size_max: coreValues.later_round_table_size_max,
      remainder_policy: coreValues.remainder_policy,
      commission_rate: coreValues.commission_rate,
      guaranteed_prize: coreValues.guaranteed_prize,
      prize_percentages: coreValues.prize_percentages,
      meta: {
        final_winners_count: coreValues.final_winners_count,
        min_players_to_start: coreValues.min_players_to_start,
        registration_extend_enabled: coreValues.registration_extend_enabled,
        registration_extend_minutes: coreValues.registration_extend_minutes ?? 60,
        break_between_rounds_minutes: coreValues.break_between_rounds_minutes ?? 0,
        entry_currency: coreValues.entry_currency,
        is_test_tournament: coreValues.is_test_tournament === true,
        watch_invite_banner: watchInviteBanner,
      },
    };

    const {
      data: { session },
    } = await supabase.auth.getSession();
    const token = session?.access_token;
    if (!token) {
      setSubmitting(false);
      setError("احراز هویت لازم است");
      return;
    }

    const response = await fetch(`/api/admin/tournaments/${tournamentId}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ patch }),
    });
    const result = await response.json().catch(() => null);
    setSubmitting(false);

    if (!response.ok) {
      setError(result?.message || "خطا در ذخیره تغییرات");
      return;
    }

    if (result?.data) {
      const { data: prizeRules } = await supabase
        .from("tournament_prize_rules")
        .select("rank, payout_type, payout_value")
        .eq("tournament_id", tournamentId)
        .order("rank", { ascending: true });
      setInitialValues(mapRowToValues(result.data, prizeRules ?? []));
    }
    router.push("/admin/tournaments");
  };

  const handleStatusChange = async (nextStatus: "registration_open" | "cancelled") => {
    if (!tournamentId) return;
    setStatusUpdating(true);
    setError(null);
    const { error, data } = await supabase.rpc("fn_admin_set_tournament_status", {
      p_tournament_id: tournamentId,
      p_status: nextStatus,
    });
    setStatusUpdating(false);

    if (error) {
      setError(error.message || "خطا در تغییر وضعیت");
      return;
    }

    if (data) {
      setInitialValues(mapRowToValues(data));
    }
  };

  const canOpenRegistration = initialValues?.status === "draft";
  const canCancel =
    initialValues?.status === "draft" || initialValues?.status === "registration_open" ? true : false;
  const lockedMessage = isLocked
    ? "تغییر تنظیمات در وضعیت‌های در حال اجرا / تسویه / پایان‌یافته امکان‌پذیر نیست."
    : undefined;
  const canDelete = initialValues?.status === "cancelled";

  const handleDelete = async () => {
    if (!tournamentId || !canDelete) return;
    setDeleting(true);
    setError(null);
    const {
      data: { session },
    } = await supabase.auth.getSession();
    const token = session?.access_token;
    if (!token) {
      setDeleting(false);
      setError("احراز هویت لازم است");
      return;
    }

    const response = await fetch(`/api/admin/tournaments/${tournamentId}`, {
      method: "DELETE",
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });
    const result = await response.json().catch(() => null);
    setDeleting(false);
    if (!response.ok) {
      setError(result?.message || "خطا در حذف تورنومنت");
      return;
    }
    router.push("/admin/tournaments");
  };

  return (
    <div className="min-h-screen bg-[#0E0E0F] p-4 text-white">
      <div className="max-w-3xl mx-auto space-y-4">
        <h1 className="text-2xl font-bold">ویرایش تورنومنت</h1>
        {loading && <div className="text-gray-300 text-sm">در حال بارگذاری...</div>}
        {error && <div className="text-red-400 text-sm">{error}</div>}
        {!loading && initialValues && (
          <div className="flex gap-2 text-sm">
            <div className="px-3 py-2 rounded-lg border border-gray-700 text-gray-200 bg-[#1f1f1f]">
              وضعیت فعلی: {initialValues.status}
            </div>
            {canOpenRegistration && (
              <button
                onClick={() => handleStatusChange("registration_open")}
                disabled={statusUpdating}
                className="px-3 py-2 rounded-lg bg-teal-700 hover:bg-teal-600 text-white disabled:opacity-60"
              >
                {statusUpdating ? "..." : "باز کردن ثبت‌نام"}
              </button>
            )}
            {canCancel && (
              <button
                onClick={() => handleStatusChange("cancelled")}
                disabled={statusUpdating}
                className="px-3 py-2 rounded-lg bg-red-700 hover:bg-red-600 text-white disabled:opacity-60"
              >
                {statusUpdating ? "..." : "لغو تورنومنت"}
              </button>
            )}
            {canDelete && (
              <button
                onClick={handleDelete}
                disabled={deleting}
                className="px-3 py-2 rounded-lg bg-red-800 hover:bg-red-700 text-white disabled:opacity-60"
              >
                {deleting ? "..." : "حذف تورنومنت"}
              </button>
            )}
          </div>
        )}
        {!loading && !error && initialValues && (
          <TournamentForm
            mode="edit"
            tournamentId={tournamentId}
            initialValues={initialValues}
            onSubmit={handleSubmit}
            submitting={submitting}
            readOnly={isLocked}
            lockedMessage={lockedMessage}
            showTestTournamentOption={isAdminZero}
          />
        )}
      </div>
    </div>
  );
}

