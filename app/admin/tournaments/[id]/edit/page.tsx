"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import { useHeaderVisibility } from "@/lib/contexts/HeaderVisibilityContext";
import { supabase } from "@/lib/supabaseClient";
import { TournamentForm, TournamentFormValues } from "../../TournamentForm";

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

  const tournamentId = typeof params?.id === "string" ? params.id : Array.isArray(params?.id) ? params?.id[0] : null;

  const mapRowToValues = useCallback((data: any): TournamentFormValues => {
    return {
      title: data.title || "",
      status: data.status || "draft",
      start_at: data.start_at,
      currency: data.currency || "IRR",
      ticket_price: data.ticket_price ?? null,
      min_tickets_per_player: data.min_tickets_per_player ?? 1,
      max_tickets_per_player: data.max_tickets_per_player ?? 1,
      table_size_mode: data.table_size_mode || "fixed",
      table_size_fixed: data.table_size_fixed ?? null,
      table_size_min: data.table_size_min ?? null,
      table_size_max: data.table_size_max ?? null,
      remainder_policy: data.remainder_policy || "adaptive_tables",
      guaranteed_prize: data.guaranteed_prize ?? 0,
    };
  }, []);

  useEffect(() => {
    setShowHeader(true);
    setShowBackButton(true);
    setOnBackClick(() => () => router.push("/admin/tournaments"));
  }, [router, setOnBackClick, setShowBackButton, setShowHeader]);

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
        setInitialValues(mapRowToValues(data));
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

    const patch = {
      title: values.title,
      start_at: values.start_at,
      currency: values.currency,
      ticket_price: values.ticket_price,
      min_tickets_per_player: values.min_tickets_per_player,
      max_tickets_per_player: values.max_tickets_per_player,
      table_size_mode: values.table_size_mode,
      table_size_fixed: values.table_size_fixed,
      table_size_min: values.table_size_min,
      table_size_max: values.table_size_max,
      remainder_policy: values.remainder_policy,
      guaranteed_prize: values.guaranteed_prize,
    };

    const { error, data } = await supabase.rpc("fn_admin_update_tournament", {
      p_tournament_id: tournamentId,
      p_patch: patch,
    });

    setSubmitting(false);

    if (error) {
      setError(error.message || "خطا در ذخیره تغییرات");
      return;
    }

    if (data) {
      setInitialValues(mapRowToValues(data));
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
    const { error } = await supabase.rpc("fn_admin_delete_tournament", {
      p_tournament_id: tournamentId,
    });
    setDeleting(false);
    if (error) {
      setError(error.message || "خطا در حذف تورنومنت");
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
            initialValues={initialValues}
            onSubmit={handleSubmit}
            submitting={submitting}
            readOnly={isLocked}
            lockedMessage={lockedMessage}
          />
        )}
      </div>
    </div>
  );
}

