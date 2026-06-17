"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useHeaderVisibility } from "@/lib/contexts/HeaderVisibilityContext";
import { supabase } from "@/lib/supabaseClient";
import { hardExitFromCurrentPanel } from "@/lib/auth/hardExit";

export default function DevPanelAccountPage() {
  const router = useRouter();
  const { setShowHeader, setShowBackButton, setOnBackClick } = useHeaderVisibility();
  const [username, setUsername] = useState("");
  const [nickname, setNickname] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setShowHeader(true);
    setShowBackButton(true);
    setOnBackClick(() => () => router.push("/dev-panel/dashboard"));

    return () => {
      setShowBackButton(false);
      setOnBackClick(null);
    };
  }, [setShowHeader, setShowBackButton, setOnBackClick, router]);

  useEffect(() => {
    async function loadAccount() {
      try {
        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (!user) return;

        const roleInfo = await getCurrentUserRoleInfo();
        const { data: dbUser } = await supabase
          .from("users")
          .select("username, last_login_at")
          .eq("id", user.id)
          .maybeSingle();

        const { data: profile } = await supabase
          .from("user_profiles")
          .select("nickname")
          .eq("user_id", user.id)
          .maybeSingle();

        setUsername(dbUser?.username || "");
        setNickname(profile?.nickname || null);
      } catch (error) {
        console.error("Error loading dev panel account:", error);
      } finally {
        setLoading(false);
      }
    }

    loadAccount();
  }, []);

  const handleLogout = () => {
    hardExitFromCurrentPanel();
  };

  return (
    <div className="min-h-screen bg-[#0E0E0F] p-4">
      <div className="mx-auto max-w-2xl space-y-4">
        <h1 className="text-xl font-bold text-white">حساب کاربری</h1>

        <div className="rounded-2xl border border-gray-800 bg-[#151515] p-4 space-y-3">
          <div>
            <p className="text-xs text-gray-400">نام نمایشی</p>
            <p className="text-white">{loading ? "..." : nickname || username || "نامشخص"}</p>
          </div>
          <div>
            <p className="text-xs text-gray-400">نام کاربری</p>
            <p className="font-mono text-white">{loading ? "..." : username || "نامشخص"}</p>
          </div>
          <div>
            <p className="text-xs text-gray-400">نقش</p>
            <p className="text-violet-300">Dev Panel</p>
          </div>
        </div>

        <button
          onClick={handleLogout}
          className="w-full rounded-xl bg-red-700 px-4 py-3 text-sm font-semibold text-white hover:bg-red-600 active:bg-red-800"
        >
          خروج از حساب
        </button>
      </div>
    </div>
  );
}
