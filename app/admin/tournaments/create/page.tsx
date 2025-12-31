"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useHeaderVisibility } from "@/lib/contexts/HeaderVisibilityContext";
import { TournamentForm, TournamentFormValues } from "../TournamentForm";
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
    const { error } = await supabase.rpc("fn_admin_create_tournament", {
      p_payload: values,
    });

    if (error) {
      alert(error.message || "خطا در ایجاد تورنومنت");
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

