"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useHeaderVisibility } from "@/lib/contexts/HeaderVisibilityContext";
import {
  getFeatureUsers,
  updateFeature,
  addFeatureUser,
  removeFeatureUser,
  listFeatures,
} from "@/lib/featureFlags/adminClient";
import { filterManagedUsers, loadManagedUsers } from "@/services/users";
import type { FeatureRow, FeatureUserOverrideRow } from "@/src/types/feature-flags";
import type { ManagedUserRoleFilter, ManagedUserSummary } from "@/src/types/users";

type PageProps = {
  params: { featureId: string };
};

const ROLE_TABS: { key: ManagedUserRoleFilter; label: string }[] = [
  { key: "player", label: "پلیر" },
  { key: "agent", label: "ایجنت" },
  { key: "super", label: "سوپر" },
  { key: "all", label: "همه" },
];

function getStatusLabel(feature: FeatureRow | null): string {
  if (!feature) return "نامشخص";
  if (!feature.is_enabled) return "غیرفعال (Kill Switch)";
  if (feature.default_enabled) return "فعال برای همه";
  if (feature.rollout_percentage > 0) return `Rollout ${feature.rollout_percentage}%`;
  if (feature.enabledOverrideCount > 0) return "فعال برای کاربران انتخابی";
  return "فعال (بدون دسترسی پیش‌فرض)";
}

function renderUserLabel(user: ManagedUserSummary) {
  const username = String(user.username || "").trim();
  const nickname = String(user.nickname || "").trim();
  if (!username) return <span>کاربر</span>;
  return (
    <span className="inline-flex items-center gap-1" dir="ltr">
      <span>{username}</span>
      {nickname ? <span className="text-gray-300">({nickname})</span> : null}
    </span>
  );
}

export default function AdminFeatureDetailPage({ params }: PageProps) {
  const router = useRouter();
  const featureId = params.featureId;
  const { setShowHeader, setShowBackButton, setOnBackClick } = useHeaderVisibility();

  const [feature, setFeature] = useState<FeatureRow | null>(null);
  const [assignedUsers, setAssignedUsers] = useState<FeatureUserOverrideRow[]>([]);
  const [baseUsers, setBaseUsers] = useState<ManagedUserSummary[]>([]);
  const [usersLoading, setUsersLoading] = useState(true);
  const [roleFilter, setRoleFilter] = useState<ManagedUserRoleFilter>("player");
  const [search, setSearch] = useState("");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setShowHeader(true);
    setShowBackButton(true);
    setOnBackClick(() => () => router.push("/admin/features"));

    return () => {
      setShowBackButton(false);
      setOnBackClick(null);
    };
  }, [router, setShowBackButton, setOnBackClick, setShowHeader]);

  const assignedUserIds = useMemo(
    () => new Set(assignedUsers.map((user) => user.userId)),
    [assignedUsers]
  );

  const loadFeatureData = useCallback(async () => {
    const usersResult = await getFeatureUsers(featureId);
    setAssignedUsers(usersResult.assignedUsers);

    const listResult = await listFeatures();
    const current = listResult.features.find((item) => item.id === featureId) || null;
    setFeature(current);
  }, [featureId]);

  const loadUsers = useCallback(async () => {
    try {
      setUsersLoading(true);
      const result = await loadManagedUsers({
        roleFilter: "all",
        search: "",
        maxAgeMs: 30_000,
      });
      setBaseUsers(result.users);
    } catch (err) {
      console.error("[Feature] load managed users error:", err);
      setError(err instanceof Error ? err.message : "خطا در بارگذاری کاربران");
    } finally {
      setUsersLoading(false);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function init() {
      try {
        setLoading(true);
        setError(null);
        await Promise.all([loadFeatureData(), loadUsers()]);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "خطا در بارگذاری Feature");
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    void init();

    return () => {
      cancelled = true;
    };
  }, [loadFeatureData, loadUsers]);

  const usersFiltered = useMemo(() => {
    return filterManagedUsers(baseUsers, { roleFilter, search });
  }, [baseUsers, roleFilter, search]);

  useEffect(() => {
    setSelectedIds((prev) => {
      const next = new Set<string>();
      usersFiltered.forEach((user) => {
        if (prev.has(user.id) && !assignedUserIds.has(user.id)) {
          next.add(user.id);
        }
      });
      return next;
    });
  }, [usersFiltered, assignedUserIds]);

  const selectableUsers = useMemo(
    () => usersFiltered.filter((user) => !assignedUserIds.has(user.id)),
    [usersFiltered, assignedUserIds]
  );

  const totalUsers = usersFiltered.length;
  const selectedCount = selectedIds.size;
  const allSelectableSelected =
    selectableUsers.length > 0 &&
    selectableUsers.every((user) => selectedIds.has(user.id));

  const handleToggle = async (
    field: "is_enabled" | "default_enabled",
    value: boolean
  ) => {
    if (!feature) return;
    try {
      setSaving(true);
      setError(null);
      const result = await updateFeature(feature.id, { [field]: value });
      setFeature(result.feature);
      await loadFeatureData();
    } catch (err) {
      setError(err instanceof Error ? err.message : "خطا در ذخیره تغییرات");
    } finally {
      setSaving(false);
    }
  };

  const handleRemoveUser = async (userId: string) => {
    try {
      setSaving(true);
      setError(null);
      await removeFeatureUser(featureId, userId);
      await loadFeatureData();
    } catch (err) {
      setError(err instanceof Error ? err.message : "خطا در حذف کاربر");
    } finally {
      setSaving(false);
    }
  };

  const toggleSelect = (userId: string) => {
    if (assignedUserIds.has(userId)) return;
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(userId)) {
        next.delete(userId);
      } else {
        next.add(userId);
      }
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (allSelectableSelected) {
      setSelectedIds(new Set());
      return;
    }
    setSelectedIds(new Set(selectableUsers.map((user) => user.id)));
  };

  const handleAddSelected = async () => {
    if (selectedIds.size === 0) {
      setError("حداقل یک کاربر را انتخاب کنید.");
      return;
    }

    try {
      setSaving(true);
      setError(null);

      const userIds = Array.from(selectedIds);
      for (const userId of userIds) {
        await addFeatureUser(featureId, { userId, isEnabled: true });
      }

      setSelectedIds(new Set());
      await loadFeatureData();
    } catch (err) {
      setError(err instanceof Error ? err.message : "خطا در افزودن کاربران");
    } finally {
      setSaving(false);
    }
  };

  if (loading && !feature) {
    return (
      <div className="min-h-screen bg-[#0E0E0F] text-white p-4">
        <div className="max-w-md mx-auto text-center py-8 text-gray-400">
          در حال بارگذاری...
        </div>
      </div>
    );
  }

  if (!feature) {
    return (
      <div className="min-h-screen bg-[#0E0E0F] text-white p-4">
        <div className="max-w-md mx-auto text-center py-8 text-gray-400">
          Feature یافت نشد.
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0E0E0F] text-white p-4 pb-28">
      <div className="max-w-md mx-auto space-y-4">
        <div>
          <h1 className="text-2xl font-bold">{feature.name}</h1>
          <p className="text-sm text-gray-400 mt-1">{feature.key}</p>
          {feature.description && (
            <p className="text-sm text-gray-300 mt-2">{feature.description}</p>
          )}
        </div>

        <div className="rounded-xl bg-[#1f2933] p-4 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-sm">وضعیت</span>
            <span
              className={`rounded-full px-2 py-1 text-xs ${
                feature.is_enabled
                  ? "bg-emerald-900/60 text-emerald-300"
                  : "bg-red-900/60 text-red-300"
              }`}
            >
              {getStatusLabel(feature)}
            </span>
          </div>

          <label className="flex items-center justify-between gap-3 text-sm">
            <span>Global Enable (Kill Switch معکوس)</span>
            <input
              type="checkbox"
              checked={feature.is_enabled}
              disabled={saving}
              onChange={(e) => void handleToggle("is_enabled", e.target.checked)}
            />
          </label>

          <label className="flex items-center justify-between gap-3 text-sm">
            <span>Default Enabled For All</span>
            <input
              type="checkbox"
              checked={feature.default_enabled}
              disabled={saving || !feature.is_enabled}
              onChange={(e) => void handleToggle("default_enabled", e.target.checked)}
            />
          </label>

          <div className="text-xs text-gray-400">
            کاربران با Override فعال:{" "}
            <span className="numeric-text numeric-text--14" dir="ltr">
              {feature.enabledOverrideCount.toLocaleString("en-US")}
            </span>
            {" / "}
            <span className="numeric-text numeric-text--14" dir="ltr">
              {feature.assignedUserCount.toLocaleString("en-US")}
            </span>
          </div>
        </div>

        <div className="rounded-xl bg-[#1f2933] p-4 space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-semibold">انتخاب کاربران</h2>
            <span className="text-xs text-gray-400">
              <span className="numeric-text numeric-text--14" dir="ltr">
                {totalUsers.toLocaleString("en-US")}
              </span>{" "}
              کاربر
            </span>
          </div>

          <div className="flex rounded-2xl bg-[#111827] overflow-hidden text-sm font-semibold">
            {ROLE_TABS.map((tab) => (
              <button
                key={tab.key}
                type="button"
                onClick={() => setRoleFilter(tab.key)}
                className={`flex-1 py-2 ${
                  roleFilter === tab.key ? "bg-teal-500 text-black" : "text-gray-300"
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={toggleSelectAll}
              disabled={saving || selectableUsers.length === 0}
              className={`w-5 h-[21px] rounded-md border-2 flex items-center justify-center flex-shrink-0 disabled:opacity-50 ${
                allSelectableSelected
                  ? "border-teal-400 bg-[#0f766e]"
                  : "border-gray-500 bg-transparent"
              }`}
            >
              {allSelectableSelected && <div className="w-3 h-3 rounded-sm bg-white" />}
            </button>

            <div className="relative flex-1">
              <input
                type="text"
                placeholder="Search Member"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full rounded-2xl bg-[#111827] text-sm text-white px-4 py-3 pr-10 outline-none border border-transparent focus:border-teal-500 placeholder:text-gray-400"
              />
              <div className="absolute inset-y-0 right-0 flex items-center pr-3 text-gray-400">
                🔍
              </div>
            </div>
          </div>

          <div className="max-h-72 overflow-y-auto space-y-2">
            {usersLoading ? (
              <div className="py-6 text-center text-gray-400 text-sm">در حال بارگذاری...</div>
            ) : usersFiltered.length === 0 ? (
              <div className="py-6 text-center text-gray-400 text-sm">
                کاربری برای نمایش وجود ندارد
              </div>
            ) : (
              usersFiltered.map((user) => {
                const alreadyAssigned = assignedUserIds.has(user.id);
                const checked = alreadyAssigned || selectedIds.has(user.id);

                return (
                  <div
                    key={user.id}
                    className="flex items-center justify-between bg-[#111827] rounded-2xl px-3 py-3"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <button
                        type="button"
                        onClick={() => toggleSelect(user.id)}
                        disabled={saving || alreadyAssigned}
                        className={`w-5 h-[21px] rounded-md border-2 flex items-center justify-center flex-shrink-0 disabled:opacity-60 ${
                          checked
                            ? "border-teal-400 bg-[#0f766e]"
                            : "border-gray-500 bg-transparent"
                        }`}
                      >
                        {checked && <div className="w-3 h-3 rounded-sm bg-white" />}
                      </button>

                      <div className="min-w-0">
                        <div className="text-sm font-semibold truncate">
                          {renderUserLabel(user)}
                        </div>
                        <div className="text-xs text-gray-400 mt-0.5">
                          {user.role === "player"
                            ? "پلیر"
                            : user.role === "agent"
                              ? "ایجنت"
                              : user.role === "super"
                                ? "سوپر"
                                : "ادمین"}
                        </div>
                      </div>
                    </div>

                    {alreadyAssigned ? (
                      <span className="text-xs text-emerald-300 flex-shrink-0">اضافه شده</span>
                    ) : null}
                  </div>
                );
              })
            )}
          </div>

          {selectedCount > 0 && (
            <div className="text-xs text-gray-400 text-center">
              <span className="numeric-text numeric-text--14" dir="ltr">
                {selectedCount.toLocaleString("en-US")}
              </span>{" "}
              کاربر انتخاب شده
            </div>
          )}
        </div>

        <div className="rounded-xl bg-[#1f2933] p-4 space-y-3">
          <h2 className="text-base font-semibold">کاربران دارای دسترسی (Override)</h2>
          {assignedUsers.length === 0 ? (
            <div className="text-sm text-gray-400">هنوز کاربری اضافه نشده است.</div>
          ) : (
            <div className="space-y-2">
              {assignedUsers.map((user) => (
                <div
                  key={user.userId}
                  className="flex items-center justify-between rounded-lg bg-[#111827] px-3 py-2 text-sm"
                >
                  <div>
                    <div>{user.displayName}</div>
                    <div className="text-xs text-gray-400">{user.username}</div>
                    <div className="text-xs mt-1">
                      {user.isEnabled ? (
                        <span className="text-emerald-300">Allow</span>
                      ) : (
                        <span className="text-red-300">Deny</span>
                      )}
                    </div>
                  </div>
                  <button
                    type="button"
                    disabled={saving}
                    onClick={() => void handleRemoveUser(user.userId)}
                    className="rounded-md bg-red-800 px-2 py-1 text-xs disabled:opacity-50"
                  >
                    حذف
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {error && (
          <div className="rounded-lg bg-red-900/40 border border-red-700 px-3 py-2 text-sm">
            {error}
          </div>
        )}
      </div>

      <div className="fixed bottom-0 left-0 right-0 z-50 bg-[#0E0E0F] border-t border-gray-800 py-3">
        <div className="max-w-md mx-auto px-4">
          <button
            type="button"
            onClick={() => void handleAddSelected()}
            disabled={saving || selectedCount === 0}
            className="w-full py-3 rounded-2xl bg-teal-500 text-black font-semibold text-base disabled:opacity-60"
          >
            {saving ? "در حال افزودن..." : "افزودن کاربران انتخاب‌شده"}
          </button>
        </div>
      </div>
    </div>
  );
}
