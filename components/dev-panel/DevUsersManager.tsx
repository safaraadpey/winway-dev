"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useHeaderVisibility } from "@/lib/contexts/HeaderVisibilityContext";
import { loadDevPanelUsers } from "@/services/dev-panel/dev-players";
import type { DevPanelUserRow } from "@/src/types/dev-players";
import toast from "react-hot-toast";

type RoleFilter = "all" | "player" | "agent" | "super" | "admin";

const ROLE_LABELS: Record<DevPanelUserRow["role"], string> = {
  player: "پلیر",
  agent: "ایجنت",
  super: "سوپر",
  admin: "ادمین",
};

function formatUplineSubtitle(user: DevPanelUserRow): string {
  if (user.role === "super" || user.role === "admin") {
    return "بدون بالاسری";
  }

  if (user.role === "agent") {
    return user.superName ? `سوپر: ${user.superName}` : "سوپر: نامشخص";
  }

  const agentLabel = user.agentName ? `ایجنت: ${user.agentName}` : "ایجنت: نامشخص";
  const superLabel = user.superName ? `سوپر: ${user.superName}` : "سوپر: نامشخص";
  return `${agentLabel} · ${superLabel}`;
}

export default function DevUsersManager() {
  const router = useRouter();
  const { setShowHeader, setShowBackButton, setOnBackClick } = useHeaderVisibility();
  const [users, setUsers] = useState<DevPanelUserRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState<RoleFilter>("all");

  useEffect(() => {
    setShowHeader(true);
    setShowBackButton(true);
    setOnBackClick(() => () => router.push("/dev-panel/dashboard"));

    return () => {
      setShowBackButton(false);
      setOnBackClick(null);
    };
  }, [router, setShowHeader, setShowBackButton, setOnBackClick]);

  const fetchUsers = useCallback(async () => {
    try {
      setLoading(true);
      const result = await loadDevPanelUsers({
        search: search.trim() || undefined,
        role: roleFilter,
        limit: 300,
      });
      setUsers(result.users);
    } catch (error) {
      console.error("loadDevPanelUsers error:", error);
      toast.error("خطا در بارگذاری کاربران");
    } finally {
      setLoading(false);
    }
  }, [search, roleFilter]);

  useEffect(() => {
    const timer = setTimeout(() => {
      fetchUsers();
    }, 250);
    return () => clearTimeout(timer);
  }, [fetchUsers]);

  const devPlayerCount = useMemo(
    () => users.filter((u) => u.devPlayerConfig?.isEnabled).length,
    [users]
  );

  return (
    <div className="min-h-screen bg-[#0E0E0F] p-4 pb-24">
      <div className="mx-auto max-w-2xl">
        <div className="mb-4">
          <h1 className="text-xl font-bold text-white">کاربران</h1>
          <p className="mt-1 text-sm text-gray-400">
            نشان Dev فقط برای پلیرهای اساین‌شده در پروفایل — {devPlayerCount} نفر
          </p>
          <button
            type="button"
            onClick={() => router.push("/dev-panel/settings")}
            className="mt-2 text-xs text-violet-300"
          >
            تنظیم پروفایل Dev Player
          </button>
        </div>

        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="جستجو نام کاربری یا شناسه..."
          className="mb-3 w-full rounded-xl border border-gray-700 bg-[#1f2933] px-4 py-3 text-white placeholder:text-gray-500"
        />

        <div className="mb-4 grid grid-cols-5 gap-1 rounded-xl bg-[#151515] p-1 text-xs">
          {(["all", "player", "agent", "super", "admin"] as RoleFilter[]).map((role) => (
            <button
              key={role}
              onClick={() => setRoleFilter(role)}
              className={`rounded-lg py-2 ${
                roleFilter === role
                  ? "bg-violet-600 text-white"
                  : "text-gray-300 hover:bg-[#1f2933]"
              }`}
            >
              {role === "all" ? "همه" : ROLE_LABELS[role]}
            </button>
          ))}
        </div>

        {loading ? (
          <div className="flex justify-center py-16">
            <div className="h-8 w-8 animate-spin rounded-full border-4 border-gray-300 border-r-transparent" />
          </div>
        ) : users.length === 0 ? (
          <div className="rounded-xl border border-gray-800 bg-[#151515] p-6 text-center text-gray-400">
            کاربری یافت نشد
          </div>
        ) : (
          <div className="space-y-2">
            {users.map((user) => {
              const isDevPlayer = Boolean(user.devPlayerConfig?.isEnabled);

              return (
                <div
                  key={user.id}
                  className="rounded-xl border border-gray-800 bg-[#151515] px-3 py-3"
                >
                  <div className="flex min-w-0 items-center justify-between gap-3">
                    <div className="min-w-0">
                      <div className="truncate text-sm">
                        <span className="text-white">
                          {user.nickname?.trim() || "بدون نام نمایشی"}
                        </span>
                        <span className="text-gray-500"> · </span>
                        <span className="text-gray-300">{user.username || "نامشخص"}</span>
                      </div>
                      <div className="truncate text-xs text-gray-400">
                        {formatUplineSubtitle(user)}
                      </div>
                    </div>
                    {isDevPlayer ? (
                      <span className="shrink-0 rounded-full bg-violet-900/60 px-2 py-0.5 text-[10px] text-violet-200">
                        Dev
                      </span>
                    ) : null}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
