"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useHeaderVisibility } from "@/lib/contexts/HeaderVisibilityContext";
import { useIsAdminZero } from "@/lib/admin/useIsAdminZero";
import { TournamentForm, TournamentFormValues } from "../TournamentForm";
import {
  prepareWatchInviteBannerPayload,
  stripWatchInviteBannerFields,
} from "@/lib/watch-invite/prepareBannerPayload";
import { supabase } from "@/lib/supabaseClient";

export default function AdminTournamentCreatePage() {
  const router = useRouter();
  const { setShowHeader, setShowBackButton, setOnBackClick } = useHeaderVisibility();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { isAdminZero } = useIsAdminZero();

  useEffect(() => {
    setShowHeader(true);
    setShowBackButton(true);
    setOnBackClick(() => () => router.push("/admin/tournaments"));
  }, [router, setOnBackClick, setShowBackButton, setShowHeader]);

  const handleSubmit = async (values: TournamentFormValues) => {
    setSubmitting(true);
    setError(null);

    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      const token = session?.access_token;
      if (!token) {
        setError("احراز هویت لازم است");
        return;
      }

      let watchInviteBanner = null;
      try {
        watchInviteBanner = await prepareWatchInviteBannerPayload(values);
      } catch (err) {
        setError(err instanceof Error ? err.message : "خطا در آماده‌سازی بنر دعوت");
        return;
      }

      const coreValues = stripWatchInviteBannerFields(values);
      const payload = {
        ...coreValues,
        ...(watchInviteBanner ? { watch_invite_banner: watchInviteBanner } : {}),
      };

      const response = await fetch("/api/admin/tournaments", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ payload }),
      });

      const result = await response.json().catch(() => null);
      if (!response.ok) {
        setError(result?.message || "خطا در ایجاد تورنومنت");
        return;
      }

      const row = result?.data;
      const createdId =
        row && typeof row === "object" && "id" in row
          ? String((row as { id: unknown }).id ?? "")
          : "";
      if (values.is_test_tournament && createdId) {
        router.push(`/admin/tournaments/${createdId}/edit`);
        return;
      }
      router.push("/admin/tournaments");
    } catch (err) {
      setError(err instanceof Error ? err.message : "خطای غیرمنتظره در ایجاد تورنومنت");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#0E0E0F] p-4 text-white">
      <div className="max-w-3xl mx-auto space-y-4">
        <h1 className="text-2xl font-bold">تورنومنت جدید</h1>
        <TournamentForm
          mode="create"
          onSubmit={handleSubmit}
          submitting={submitting}
          externalError={error}
          showTestTournamentOption={isAdminZero}
        />
      </div>
    </div>
  );
}
