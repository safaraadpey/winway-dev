"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import toast from "react-hot-toast";
import {
  deleteDevPlayerProfile,
  loadDevPlayerProfile,
  loadDevPlayerProfileOperators,
  loadDevPlayerProfilePlayers,
  loadDevPlayerProfiles,
  saveDevPlayerProfile,
} from "@/services/dev-panel/dev-player-profiles";
import type {
  DevPlayerPlayWindow,
  DevPlayerProfile,
  DevPlayerProfileOperator,
  DevPlayerProfilePlayerOption,
} from "@/src/types/dev-player-profiles";
import type { DevPlayerTemplateOption } from "@/src/types/dev-player-settings";

type ProfileDraft = {
  id: string | null;
  name: string;
  playWindows: DevPlayerPlayWindow[];
  allowedPrices: number[];
  memberUserIds: string[];
  operatorId: string;
};

function emptyDraft(): ProfileDraft {
  return {
    id: null,
    name: "",
    playWindows: [{ start: "10:00", end: "22:00" }],
    allowedPrices: [],
    memberUserIds: [],
    operatorId: "",
  };
}

function profileToDraft(profile: DevPlayerProfile): ProfileDraft {
  return {
    id: profile.id,
    name: profile.name,
    playWindows:
      profile.playWindows.length > 0
        ? profile.playWindows.map((window) => ({ ...window }))
        : [{ start: "10:00", end: "22:00" }],
    allowedPrices: [...profile.allowedPrices],
    memberUserIds: [],
    operatorId: "",
  };
}

function formatPlayWindows(windows: DevPlayerPlayWindow[]): string {
  if (windows.length === 0) return "—";
  return windows.map((window) => `${window.start}-${window.end}`).join(" · ");
}

const PROFILE_TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
const PROFILE_HOUR_OPTIONS = Array.from({ length: 24 }, (_, index) =>
  String(index).padStart(2, "0")
);
const PROFILE_MINUTE_OPTIONS = Array.from({ length: 60 }, (_, index) =>
  String(index).padStart(2, "0")
);

function normalizeProfileTimeInput(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return trimmed;

  const match = trimmed.match(/^(\d{1,2}):(\d{1,2})$/);
  if (!match) return trimmed;

  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (!Number.isInteger(hours) || !Number.isInteger(minutes)) return trimmed;
  if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) return trimmed;

  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}

function parseProfileTime(value: string): { hour: string; minute: string } {
  const normalized = normalizeProfileTimeInput(value);
  if (PROFILE_TIME_RE.test(normalized)) {
    const [hour, minute] = normalized.split(":");
    return { hour, minute };
  }
  return { hour: "10", minute: "00" };
}

function ProfileTimeSelect({
  value,
  onChange,
  ariaLabel,
}: {
  value: string;
  onChange: (value: string) => void;
  ariaLabel: string;
}) {
  const { hour, minute } = parseProfileTime(value);
  const selectClassName =
    "numeric-text numeric-text--14 min-w-0 flex-1 rounded-lg border border-gray-700 bg-[#1f2933] px-2 py-2 text-white";

  return (
    <div className="flex items-center gap-1" dir="ltr" aria-label={ariaLabel}>
      <select
        value={hour}
        onChange={(e) => onChange(`${e.target.value}:${minute}`)}
        className={selectClassName}
        aria-label={`${ariaLabel} — ساعت`}
      >
        {PROFILE_HOUR_OPTIONS.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>
      <span className="numeric-text numeric-text--14 shrink-0 text-gray-400">:</span>
      <select
        value={minute}
        onChange={(e) => onChange(`${hour}:${e.target.value}`)}
        className={selectClassName}
        aria-label={`${ariaLabel} — دقیقه`}
      >
        {PROFILE_MINUTE_OPTIONS.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>
    </div>
  );
}

function formatPrices(prices: number[]): string {
  if (prices.length === 0) return "—";
  return prices.map((price) => price.toLocaleString("en-US")).join(" · ");
}

export default function DevPlayerProfilesManager({
  templates,
}: {
  templates: DevPlayerTemplateOption[];
}) {
  const [profiles, setProfiles] = useState<DevPlayerProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [draft, setDraft] = useState<ProfileDraft>(emptyDraft());
  const [operators, setOperators] = useState<DevPlayerProfileOperator[]>([]);
  const [players, setPlayers] = useState<DevPlayerProfilePlayerOption[]>([]);
  const [loadingPlayers, setLoadingPlayers] = useState(false);

  const templatePrices = useMemo(() => {
    const prices = new Map<number, string>();
    for (const template of templates) {
      if (!prices.has(template.price)) {
        prices.set(template.price, template.name);
      }
    }
    return Array.from(prices.entries())
      .sort((a, b) => a[0] - b[0])
      .map(([price, label]) => ({ price, label }));
  }, [templates]);

  const fetchProfiles = useCallback(async () => {
    try {
      setLoading(true);
      const result = await loadDevPlayerProfiles();
      setProfiles(result);
    } catch (error) {
      console.error("[DevPlayer] load profiles error:", error);
      toast.error("خطا در بارگذاری پروفایل‌ها");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchProfiles();
  }, [fetchProfiles]);

  useEffect(() => {
    loadDevPlayerProfileOperators()
      .then(setOperators)
      .catch((error) => {
        console.error("[DevPlayer] load operators error:", error);
      });
  }, []);

  useEffect(() => {
    if (!draft.operatorId) {
      setPlayers([]);
      return;
    }

    let cancelled = false;
    setLoadingPlayers(true);

    loadDevPlayerProfilePlayers({
      operatorId: draft.operatorId,
      profileId: draft.id ?? undefined,
    })
      .then((result) => {
        if (cancelled) return;
        setPlayers(result);
      })
      .catch((error) => {
        console.error("[DevPlayer] load players error:", error);
        toast.error("خطا در بارگذاری پلیرها");
      })
      .finally(() => {
        if (!cancelled) setLoadingPlayers(false);
      });

    return () => {
      cancelled = true;
    };
  }, [draft.operatorId, draft.id]);

  const openCreateForm = () => {
    setDraft(emptyDraft());
    setShowForm(true);
    setPlayers([]);
  };

  const openEditForm = async (profile: DevPlayerProfile) => {
    try {
      const detail = await loadDevPlayerProfile(profile.id);
      setDraft({
        ...profileToDraft(profile),
        memberUserIds: detail.memberUserIds,
      });
      setShowForm(true);
      setPlayers([]);
    } catch (error) {
      console.error("[DevPlayer] load profile detail error:", error);
      toast.error("خطا در بارگذاری پروفایل");
    }
  };

  const closeForm = () => {
    setShowForm(false);
    setDraft(emptyDraft());
    setPlayers([]);
  };

  const togglePrice = (price: number) => {
    setDraft((prev) => {
      const exists = prev.allowedPrices.includes(price);
      return {
        ...prev,
        allowedPrices: exists
          ? prev.allowedPrices.filter((item) => item !== price)
          : [...prev.allowedPrices, price].sort((a, b) => a - b),
      };
    });
  };

  const toggleMember = (userId: string) => {
    setDraft((prev) => {
      const exists = prev.memberUserIds.includes(userId);
      return {
        ...prev,
        memberUserIds: exists
          ? prev.memberUserIds.filter((id) => id !== userId)
          : [...prev.memberUserIds, userId],
      };
    });
  };

  const handleSave = async () => {
    if (!draft.name.trim()) {
      toast.error("عنوان پروفایل الزامی است");
      return;
    }
    if (draft.playWindows.length === 0) {
      toast.error("حداقل یک بازه زمانی لازم است");
      return;
    }
    for (const window of draft.playWindows) {
      const start = normalizeProfileTimeInput(window.start);
      const end = normalizeProfileTimeInput(window.end);
      if (!PROFILE_TIME_RE.test(start) || !PROFILE_TIME_RE.test(end)) {
        toast.error("ساعت‌ها باید با فرمت ۲۴ ساعته HH:MM باشند (مثلاً 14:30)");
        return;
      }
      if (start >= end) {
        toast.error("در هر بازه، ساعت شروع باید قبل از پایان باشد");
        return;
      }
    }
    if (draft.allowedPrices.length === 0) {
      toast.error("حداقل یک قیمت انتخاب کنید");
      return;
    }

    setSaving(true);
    try {
      await saveDevPlayerProfile({
        id: draft.id ?? undefined,
        name: draft.name.trim(),
        play_windows: draft.playWindows.map((window) => ({
          start: normalizeProfileTimeInput(window.start),
          end: normalizeProfileTimeInput(window.end),
        })),
        allowed_prices: draft.allowedPrices,
        member_user_ids: draft.memberUserIds,
      });
      toast.success(draft.id ? "پروفایل به‌روزرسانی شد" : "پروفایل ایجاد شد");
      closeForm();
      await fetchProfiles();
    } catch (error: any) {
      console.error("[DevPlayer] save profile error:", error);
      toast.error(error?.message || "خطا در ذخیره پروفایل");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!draft.id) return;
    if (!window.confirm("این پروفایل حذف شود؟")) return;

    setDeleting(true);
    try {
      await deleteDevPlayerProfile(draft.id);
      toast.success("پروفایل حذف شد");
      closeForm();
      await fetchProfiles();
    } catch (error: any) {
      console.error("[DevPlayer] delete profile error:", error);
      toast.error(error?.message || "خطا در حذف پروفایل");
    } finally {
      setDeleting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center py-8">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-gray-300 border-r-transparent" />
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {!showForm ? (
        <>
          {profiles.length === 0 ? (
            <div className="rounded-xl border border-dashed border-gray-700 bg-[#1a1a1a] p-4 text-center text-sm text-gray-400">
              هنوز پروفایلی ندارید. اولین پروفایل را بسازید.
            </div>
          ) : (
            <div className="space-y-2">
              {profiles.map((profile) => (
                <button
                  key={profile.id}
                  type="button"
                  onClick={() => openEditForm(profile)}
                  className="w-full rounded-xl border border-gray-800 bg-[#1a1a1a] px-3 py-3 text-right"
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <div className="truncate text-sm font-semibold text-white">{profile.name}</div>
                      <div className="mt-1 text-xs text-gray-400">
                        <span className="numeric-text numeric-text--12" dir="ltr">
                          {formatPlayWindows(profile.playWindows)}
                        </span>
                      </div>
                    </div>
                    <span className="shrink-0 rounded-full bg-violet-900/60 px-2 py-0.5 text-[10px] text-violet-200">
                      <span className="numeric-text numeric-text--11" dir="ltr">
                        {profile.memberCount.toLocaleString("en-US")}
                      </span>{" "}
                      عضو
                    </span>
                  </div>
                  <div className="mt-2 text-[11px] text-gray-400">
                    قیمت‌ها:{" "}
                    <span className="numeric-text numeric-text--12 text-gray-300" dir="ltr">
                      {formatPrices(profile.allowedPrices)}
                    </span>
                  </div>
                </button>
              ))}
            </div>
          )}

          <button
            type="button"
            onClick={openCreateForm}
            className="w-full rounded-xl border border-violet-700 bg-violet-950/40 py-2.5 text-sm font-semibold text-violet-100"
          >
            ایجاد پروفایل جدید
          </button>
        </>
      ) : (
        <div className="space-y-4 rounded-xl border border-gray-800 bg-[#1a1a1a] p-4">
          <div className="flex items-center justify-between gap-2">
            <h3 className="text-sm font-semibold text-white">
              {draft.id ? "ویرایش پروفایل" : "پروفایل جدید"}
            </h3>
            <button type="button" onClick={closeForm} className="text-xs text-gray-400">
              انصراف
            </button>
          </div>

          <label className="block space-y-1">
            <span className="text-xs text-gray-400">عنوان</span>
            <input
              value={draft.name}
              onChange={(e) => setDraft((prev) => ({ ...prev, name: e.target.value }))}
              className="w-full rounded-lg border border-gray-700 bg-[#1f2933] px-3 py-2 text-sm text-white"
              placeholder="مثلاً Night High Roller"
            />
          </label>

          <div>
            <div className="mb-2 flex items-center justify-between">
              <span className="text-xs text-gray-400">بازه‌های بازی</span>
              <button
                type="button"
                onClick={() =>
                  setDraft((prev) => ({
                    ...prev,
                    playWindows: [...prev.playWindows, { start: "10:00", end: "12:00" }],
                  }))
                }
                className="text-xs text-violet-300"
              >
                + بازه جدید
              </button>
            </div>
            <div className="space-y-2">
              {draft.playWindows.map((window, index) => (
                <div
                  key={`profile-window-${index}`}
                  className="grid grid-cols-[1fr_1fr_auto] gap-2"
                >
                  <label className="space-y-1">
                    <span className="text-[10px] text-gray-500">از ساعت</span>
                    <ProfileTimeSelect
                      value={window.start}
                      ariaLabel={`بازه ${index + 1} — شروع`}
                      onChange={(start) => {
                        const next = [...draft.playWindows];
                        next[index] = { ...next[index], start };
                        setDraft((prev) => ({ ...prev, playWindows: next }));
                      }}
                    />
                  </label>
                  <label className="space-y-1">
                    <span className="text-[10px] text-gray-500">تا ساعت</span>
                    <ProfileTimeSelect
                      value={window.end}
                      ariaLabel={`بازه ${index + 1} — پایان`}
                      onChange={(end) => {
                        const next = [...draft.playWindows];
                        next[index] = { ...next[index], end };
                        setDraft((prev) => ({ ...prev, playWindows: next }));
                      }}
                    />
                  </label>
                  <button
                    type="button"
                    onClick={() => {
                      const next = draft.playWindows.filter((_, i) => i !== index);
                      setDraft((prev) => ({
                        ...prev,
                        playWindows:
                          next.length > 0 ? next : [{ start: "10:00", end: "22:00" }],
                      }));
                    }}
                    className="mt-5 rounded-lg border border-red-900/60 px-2 text-red-300"
                  >
                    حذف
                  </button>
                </div>
              ))}
            </div>
          </div>

          <div>
            <div className="mb-2 text-xs text-gray-400">کارت‌های مجاز (قیمت تمپلیت)</div>
            {templatePrices.length === 0 ? (
              <div className="text-xs text-gray-500">تمپلیتی در پیش‌تنظیم Join فعال نیست.</div>
            ) : (
              <div className="grid grid-cols-2 gap-2">
                {templatePrices.map(({ price, label }) => {
                  const checked = draft.allowedPrices.includes(price);
                  return (
                    <label
                      key={price}
                      className={`flex min-h-[44px] cursor-pointer items-center gap-2 rounded-lg border px-2 py-2 ${
                        checked
                          ? "border-violet-600 bg-violet-950/40"
                          : "border-gray-700 bg-[#1f2933]"
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => togglePrice(price)}
                        className="h-4 w-4 rounded border-gray-600 bg-[#1f2933] text-violet-600"
                      />
                      <span className="min-w-0 text-xs text-white">
                        <span className="numeric-text numeric-text--12" dir="ltr">
                          {price.toLocaleString("en-US")}
                        </span>
                        <span className="block truncate text-[10px] text-gray-400">{label}</span>
                      </span>
                    </label>
                  );
                })}
              </div>
            )}
          </div>

          <label className="block space-y-1">
            <span className="text-xs text-gray-400">اپراتور (سوپر / ایجنت)</span>
            <select
              value={draft.operatorId}
              onChange={(e) =>
                setDraft((prev) => ({
                  ...prev,
                  operatorId: e.target.value,
                }))
              }
              className="w-full rounded-lg border border-gray-700 bg-[#1f2933] px-3 py-2 text-sm text-white"
            >
              <option value="">انتخاب اپراتور...</option>
              {operators.map((operator) => (
                <option key={operator.id} value={operator.id}>
                  {operator.displayName}
                </option>
              ))}
            </select>
          </label>

          {draft.operatorId ? (
            <div>
              <div className="mb-2 text-xs text-gray-400">اساین کاربر</div>
              {loadingPlayers ? (
                <div className="py-4 text-center text-xs text-gray-500">در حال بارگذاری...</div>
              ) : players.length === 0 ? (
                <div className="rounded-lg border border-dashed border-gray-700 p-3 text-xs text-gray-500">
                  پلیر فعالی برای این اپراتور یافت نشد.
                </div>
              ) : (
                <div className="max-h-56 space-y-2 overflow-y-auto">
                  {players.map((player) => {
                    const checked = draft.memberUserIds.includes(player.userId);
                    return (
                      <label
                        key={player.userId}
                        className={`flex min-h-[44px] cursor-pointer items-center gap-3 rounded-lg border px-3 py-2 ${
                          checked
                            ? "border-violet-600 bg-violet-950/30"
                            : "border-gray-700 bg-[#1f2933]"
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => toggleMember(player.userId)}
                          className="h-5 w-5 rounded border-gray-600 bg-[#1f2933] text-violet-600"
                        />
                        <span className="min-w-0 text-sm text-white">
                          {player.displayName}
                          <span className="block truncate text-xs text-gray-400">
                            {player.username}
                          </span>
                        </span>
                      </label>
                    );
                  })}
                </div>
              )}
            </div>
          ) : null}

          <div className="flex gap-2">
            <button
              type="button"
              disabled={saving}
              onClick={handleSave}
              className="flex-1 rounded-xl border border-violet-700 bg-violet-950/40 py-2.5 text-sm font-semibold text-violet-100 disabled:opacity-50"
            >
              {saving ? "در حال ذخیره..." : "ذخیره"}
            </button>
            {draft.id ? (
              <button
                type="button"
                disabled={deleting}
                onClick={handleDelete}
                className="rounded-xl border border-red-900/60 px-4 py-2.5 text-sm text-red-300 disabled:opacity-50"
              >
                {deleting ? "..." : "حذف"}
              </button>
            ) : null}
          </div>
        </div>
      )}
    </div>
  );
}
