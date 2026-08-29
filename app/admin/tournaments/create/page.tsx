"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useHeaderVisibility } from "@/lib/contexts/HeaderVisibilityContext";
import { TournamentForm, TournamentFormValues } from "../TournamentForm";
import {
  prepareWatchInviteBannerPayload,
  stripWatchInviteBannerFields,
} from "@/lib/watch-invite/prepareBannerPayload";
import { supabase } from "@/lib/supabaseClient";

export default function AdminTournamentCreatePage() {
  const router = useRouter();
  const { setShowHeader, setShowBackButton, setOnBackClick } = useHeaderVisibility();

  useEffect(() => {
    setShowHeader(true);
    setShowBackButton(true);
    setOnBackClick(() => () => router.push("/admin/tournaments"));
  }, [router, setOnBackClick, setShowBackButton, setShowHeader]);

  const handleSubmit = async (values: TournamentFormValues) => {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    const token = session?.access_token;
    if (!token) {
      alert("احراز هویت لازم است");
      return;
    }

    let watchInviteBanner = null;
    try {
      watchInviteBanner = await prepareWatchInviteBannerPayload(values);
    } catch (err) {
      alert(err instanceof Error ? err.message : "خطا در آماده‌سازی بنر دعوت");
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
      alert(result?.message || "خطا در ایجاد تورنومنت");
      return;
    }
    const row = result?.data;
    const createdId =
      row && typeof row === "object" && "id" in row ? String((row as { id: unknown }).id ?? "") : "";
    if (values.is_test_tournament && createdId) {
      router.push(`/admin/tournaments/${createdId}/edit`);
      return;
    }
    router.push("/admin/tournaments");
  };

  return (
    <div className="min-h-screen bg-[#0E0E0F] p-4 text-white">
      <div className="max-w-3xl mx-auto space-y-4">
        <h1 className="text-2xl font-bold">تورنومنت جدید</h1>
        <TournamentForm mode="create" onSubmit={handleSubmit} />
      </div>
    </div>
  );
}
