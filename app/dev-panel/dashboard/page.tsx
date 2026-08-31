"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useHeaderVisibility } from "@/lib/contexts/HeaderVisibilityContext";
import { supabase } from "@/lib/supabaseClient";
import { getCurrentUserRoleInfo } from "@/lib/auth-helpers";
import { hardExitFromCurrentPanel } from "@/lib/auth/hardExit";

const DEV_MENU_ITEMS = [
  { label: "تنظیمات", path: "/dev-panel/settings" },
  { label: "گزارش مالی", path: "/dev-panel/finance" },
  { label: "کاربران", path: "/dev-panel/users" },
  { label: "ثبت نام تورنومنت", path: "/dev-panel/tournament-register" },
  { label: "مدیریت لئو", path: "/dev-panel/leo" },
  { label: "حساب کاربری", path: "/dev-panel/account" },
] as const;

export default function DevPanelDashboardPage() {
  const router = useRouter();
  const { setShowHeader, setShowBackButton, setOnBackClick } = useHeaderVisibility();
  const [displayName, setDisplayName] = useState("Dev Panel");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setShowHeader(true);
    setShowBackButton(false);
    setOnBackClick(null);
  }, [setShowHeader, setShowBackButton, setOnBackClick]);

  useEffect(() => {
    async function loadUser() {
      try {
        const roleInfo = await getCurrentUserRoleInfo();
        const {
          data: { user },
        } = await supabase.auth.getUser();

        if (roleInfo?.role === "admin") {
          const { data: dbUser } = await supabase
            .from("users")
            .select("username")
            .eq("id", user?.id ?? "")
            .maybeSingle();

          const { data: profile } = await supabase
            .from("user_profiles")
            .select("nickname")
            .eq("user_id", user?.id ?? "")
            .maybeSingle();

          setDisplayName(
            profile?.nickname || dbUser?.username || user?.email || "Dev Panel"
          );
        }
      } catch (error) {
        console.error("Error loading dev panel user:", error);
      } finally {
        setLoading(false);
      }
    }

    loadUser();
  }, []);

  const handleLogout = () => {
    hardExitFromCurrentPanel();
  };

  return (
    <div className="min-h-screen bg-[#0E0E0F] p-4">
      <div className="max-w-2xl mx-auto">
        <div className="mb-6 rounded-2xl border border-violet-900/60 bg-[#151515] p-4">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="flex h-14 w-14 items-center justify-center rounded-full bg-gradient-to-tr from-violet-600 to-indigo-700 text-xl font-bold text-white">
                {displayName[0]?.toUpperCase() || "D"}
              </div>
              <div className="flex flex-col">
                <span className="text-lg font-semibold text-white">
                  {loading ? "..." : displayName}
                </span>
                <span className="text-xs text-violet-300">Dev Panel</span>
              </div>
            </div>
            <button
              onClick={handleLogout}
              className="whitespace-nowrap rounded-xl bg-red-700 px-4 py-2 text-sm font-semibold text-white hover:bg-red-600 active:bg-red-800"
            >
              خروج
            </button>
          </div>
        </div>

        <div className="space-y-3">
          {DEV_MENU_ITEMS.map((item) => (
            <button
              key={item.path}
              onClick={() => router.push(item.path)}
              className="flex w-full items-center justify-between rounded-xl bg-[#1f2933] px-4 py-3 text-base text-white"
            >
              <span>{item.label}</span>
              <span className="text-xl">›</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
