"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useHeaderVisibility } from "@/lib/contexts/HeaderVisibilityContext";
import { loadDevPanelUsers, saveDevPlayerConfig } from "@/services/dev-panel/dev-players";
import {
  DEFAULT_DEV_PLAYER_CONFIG,
  type DevPlayWindow,
  type DevPanelUserRow,
} from "@/src/types/dev-players";
import toast from "react-hot-toast";

type RoleFilter = "all" | "player" | "agent" | "super" | "admin";

const ROLE_LABELS: Record<DevPanelUserRow["role"], string> = {
  player: "پلیر",
  agent: "ایجنت",
  super: "سوپر",
  admin: "ادمین",
};

type DraftConfig = {
  playWindows: DevPlayWindow[];
  minRoomPrice: string;
  maxRoomPrice: string;
  maxTicketCount: string;
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

function buildDraftFromUser(user: DevPanelUserRow): DraftConfig {
  const config = user.devPlayerConfig;
  if (!config) {
    return {
      playWindows: [...DEFAULT_DEV_PLAYER_CONFIG.playWindows],
      minRoomPrice:
        DEFAULT_DEV_PLAYER_CONFIG.minRoomPrice === null
          ? ""
          : String(DEFAULT_DEV_PLAYER_CONFIG.minRoomPrice),
      maxRoomPrice:
        DEFAULT_DEV_PLAYER_CONFIG.maxRoomPrice === null
          ? ""
          : String(DEFAULT_DEV_PLAYER_CONFIG.maxRoomPrice),
      maxTicketCount: String(DEFAULT_DEV_PLAYER_CONFIG.maxTicketCount),
    };
  }

  return {
    playWindows:
      config.playWindows.length > 0
        ? config.playWindows.map((w) => ({ ...w }))
        : [...DEFAULT_DEV_PLAYER_CONFIG.playWindows],
    minRoomPrice: config.minRoomPrice === null ? "" : String(config.minRoomPrice),
    maxRoomPrice: config.maxRoomPrice === null ? "" : String(config.maxRoomPrice),
    maxTicketCount: String(config.maxTicketCount),
  };
}

export default function DevUsersManager() {
  const router = useRouter();
  const { setShowHeader, setShowBackButton, setOnBackClick } = useHeaderVisibility();
  const [users, setUsers] = useState<DevPanelUserRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState<RoleFilter>("all");
  const [expandedUserId, setExpandedUserId] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Record<string, DraftConfig>>({});
  const [savingUserId, setSavingUserId] = useState<string | null>(null);
  const [togglingUserId, setTogglingUserId] = useState<string | null>(null);

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

  const ensureDraft = (user: DevPanelUserRow): DraftConfig => {
    if (drafts[user.id]) return drafts[user.id];
    return buildDraftFromUser(user);
  };

  const updateDraft = (userId: string, patch: Partial<DraftConfig>) => {
    setDrafts((prev) => {
      const user = users.find((u) => u.id === userId);
      const base = prev[userId] || (user ? buildDraftFromUser(user) : null);
      if (!base) return prev;
      return { ...prev, [userId]: { ...base, ...patch } };
    });
  };

  const handleToggleDevPlayer = async (user: DevPanelUserRow, enabled: boolean) => {
    if (user.role !== "player") {
      toast.error("فقط پلیرها می‌توانند Dev Player شوند");
      return;
    }

    setTogglingUserId(user.id);
    try {
      if (!enabled) {
        const result = await saveDevPlayerConfig(user.id, {
          is_enabled: false,
          play_windows: [],
          min_room_price: null,
          max_room_price: null,
          max_ticket_count: 1,
        });
        setUsers((prev) =>
          prev.map((u) =>
            u.id === user.id ? { ...u, devPlayerConfig: result.devPlayerConfig } : u
          )
        );
        if (expandedUserId === user.id) setExpandedUserId(null);
        toast.success("Dev Player غیرفعال شد");
        return;
      }

      const draft = ensureDraft(user);
      const result = await saveDevPlayerConfig(user.id, {
        is_enabled: true,
        play_windows: draft.playWindows,
        min_room_price: draft.minRoomPrice ? Number(draft.minRoomPrice) : null,
        max_room_price: draft.maxRoomPrice ? Number(draft.maxRoomPrice) : null,
        max_ticket_count: Number(draft.maxTicketCount) || DEFAULT_DEV_PLAYER_CONFIG.maxTicketCount,
      });

      setUsers((prev) =>
        prev.map((u) =>
          u.id === user.id ? { ...u, devPlayerConfig: result.devPlayerConfig } : u
        )
      );
      setExpandedUserId(user.id);
      toast.success("کاربر به Dev Player تبدیل شد");
    } catch (error: any) {
      console.error("toggle dev player error:", error);
      toast.error(error?.message || "خطا در تغییر وضعیت Dev Player");
    } finally {
      setTogglingUserId(null);
    }
  };

  const handleSaveConfig = async (user: DevPanelUserRow) => {
    if (!user.devPlayerConfig?.isEnabled) return;

    const draft = ensureDraft(user);
    setSavingUserId(user.id);

    try {
      const result = await saveDevPlayerConfig(user.id, {
        is_enabled: true,
        play_windows: draft.playWindows,
        min_room_price: draft.minRoomPrice ? Number(draft.minRoomPrice) : null,
        max_room_price: draft.maxRoomPrice ? Number(draft.maxRoomPrice) : null,
        max_ticket_count: Number(draft.maxTicketCount) || DEFAULT_DEV_PLAYER_CONFIG.maxTicketCount,
      });

      setUsers((prev) =>
        prev.map((u) =>
          u.id === user.id ? { ...u, devPlayerConfig: result.devPlayerConfig } : u
        )
      );
      toast.success("تنظیمات Dev Player ذخیره شد");
    } catch (error: any) {
      console.error("save dev player config error:", error);
      toast.error(error?.message || "خطا در ذخیره تنظیمات");
    } finally {
      setSavingUserId(null);
    }
  };

  const handleRowClick = (user: DevPanelUserRow) => {
    if (user.role !== "player") return;
    setExpandedUserId((prev) => (prev === user.id ? null : user.id));
    if (!drafts[user.id]) {
      setDrafts((prev) => ({ ...prev, [user.id]: buildDraftFromUser(user) }));
    }
  };

  return (
    <div className="min-h-screen bg-[#0E0E0F] p-4 pb-24">
      <div className="mx-auto max-w-2xl">
        <div className="mb-4">
          <h1 className="text-xl font-bold text-white">کاربران</h1>
          <p className="mt-1 text-sm text-gray-400">
            فعال‌سازی و ویرایش هر پلیر — {devPlayerCount} فعال
          </p>
          <button
            type="button"
            onClick={() => router.push("/dev-panel/settings")}
            className="mt-2 text-xs text-violet-300"
          >
            تنظیمات سراسری Dev Player
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
              const isExpanded = expandedUserId === user.id;
              const canBeDevPlayer = user.role === "player";
              const draft = ensureDraft(user);

              return (
                <div
                  key={user.id}
                  className="overflow-hidden rounded-xl border border-gray-800 bg-[#151515]"
                >
                  <div className="flex items-center gap-3 px-3 py-3">
                    <input
                      type="checkbox"
                      checked={isDevPlayer}
                      disabled={!canBeDevPlayer || togglingUserId === user.id}
                      onChange={(e) => {
                        e.stopPropagation();
                        handleToggleDevPlayer(user, e.target.checked);
                      }}
                      className="h-5 w-5 rounded border-gray-600 bg-[#1f2933] text-violet-600"
                      title={canBeDevPlayer ? "فعال‌سازی Dev Player" : "فقط پلیر"}
                    />

                    <button
                      type="button"
                      onClick={() => handleRowClick(user)}
                      className="flex min-w-0 flex-1 items-center justify-between text-right"
                      disabled={!canBeDevPlayer}
                    >
                      <div className="min-w-0">
                        <div className="truncate text-sm">
                          <span className="text-white">
                            {user.nickname?.trim() || "بدون نام نمایشی"}
                          </span>
                          <span className="text-gray-500"> · </span>
                          <span className="text-gray-300">
                            {user.username || "نامشخص"}
                          </span>
                        </div>
                        <div className="truncate text-xs text-gray-400">
                          {formatUplineSubtitle(user)}
                        </div>
                      </div>
                      <div className="flex items-center gap-2 pl-2">
                        {isDevPlayer && (
                          <span className="rounded-full bg-violet-900/60 px-2 py-0.5 text-[10px] text-violet-200">
                            Dev
                          </span>
                        )}
                        {canBeDevPlayer && (
                          <span className={`text-gray-400 transition ${isExpanded ? "rotate-180" : ""}`}>
                            ▼
                          </span>
                        )}
                      </div>
                    </button>
                  </div>

                  {isExpanded && canBeDevPlayer && (
                    <div className="border-t border-gray-800 px-3 py-4 space-y-4">
                      <div>
                        <div className="mb-2 flex items-center justify-between">
                          <span className="text-sm font-semibold text-white">بازه‌های بازی</span>
                          <button
                            type="button"
                            onClick={() =>
                              updateDraft(user.id, {
                                playWindows: [
                                  ...draft.playWindows,
                                  { start: "10:00", end: "12:00" },
                                ],
                              })
                            }
                            className="text-xs text-violet-300"
                          >
                            + بازه جدید
                          </button>
                        </div>

                        <div className="space-y-2">
                          {draft.playWindows.map((window, index) => (
                            <div key={`${user.id}-window-${index}`} className="grid grid-cols-[1fr_1fr_auto] gap-2">
                              <input
                                type="time"
                                value={window.start}
                                onChange={(e) => {
                                  const next = [...draft.playWindows];
                                  next[index] = { ...next[index], start: e.target.value };
                                  updateDraft(user.id, { playWindows: next });
                                }}
                                className="rounded-lg border border-gray-700 bg-[#1f2933] px-2 py-2 text-sm text-white"
                              />
                              <input
                                type="time"
                                value={window.end}
                                onChange={(e) => {
                                  const next = [...draft.playWindows];
                                  next[index] = { ...next[index], end: e.target.value };
                                  updateDraft(user.id, { playWindows: next });
                                }}
                                className="rounded-lg border border-gray-700 bg-[#1f2933] px-2 py-2 text-sm text-white"
                              />
                              <button
                                type="button"
                                onClick={() => {
                                  const next = draft.playWindows.filter((_, i) => i !== index);
                                  updateDraft(user.id, {
                                    playWindows:
                                      next.length > 0
                                        ? next
                                        : [...DEFAULT_DEV_PLAYER_CONFIG.playWindows],
                                  });
                                }}
                                className="rounded-lg border border-red-900/60 px-2 text-red-300"
                              >
                                حذف
                              </button>
                            </div>
                          ))}
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-3">
                        <label className="space-y-1">
                          <span className="text-xs text-gray-400">حداقل قیمت میز</span>
                          <input
                            type="number"
                            min={0}
                            value={draft.minRoomPrice}
                            onChange={(e) =>
                              updateDraft(user.id, { minRoomPrice: e.target.value })
                            }
                            placeholder="بدون محدودیت"
                            className="w-full rounded-lg border border-gray-700 bg-[#1f2933] px-3 py-2 text-sm text-white"
                          />
                        </label>
                        <label className="space-y-1">
                          <span className="text-xs text-gray-400">حداکثر قیمت میز</span>
                          <input
                            type="number"
                            min={0}
                            value={draft.maxRoomPrice}
                            onChange={(e) =>
                              updateDraft(user.id, { maxRoomPrice: e.target.value })
                            }
                            placeholder="بدون محدودیت"
                            className="w-full rounded-lg border border-gray-700 bg-[#1f2933] px-3 py-2 text-sm text-white"
                          />
                        </label>
                      </div>

                      <label className="block space-y-1">
                        <span className="text-xs text-gray-400">حداکثر تعداد کارت</span>
                        <input
                          type="number"
                          min={1}
                          max={50}
                          value={draft.maxTicketCount}
                          onChange={(e) =>
                            updateDraft(user.id, { maxTicketCount: e.target.value })
                          }
                          className="w-full rounded-lg border border-gray-700 bg-[#1f2933] px-3 py-2 text-sm text-white"
                        />
                      </label>

                      <button
                        type="button"
                        disabled={!isDevPlayer || savingUserId === user.id}
                        onClick={() => handleSaveConfig(user)}
                        className="w-full rounded-xl bg-violet-700 py-3 text-sm font-semibold text-white disabled:opacity-50"
                      >
                        {savingUserId === user.id ? "در حال ذخیره..." : "ذخیره تنظیمات Dev Player"}
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
