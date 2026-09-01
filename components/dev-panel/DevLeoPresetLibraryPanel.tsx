"use client";

import { useCallback, useEffect, useState } from "react";
import toast from "react-hot-toast";
import { profileLabel } from "@/components/dev-panel/leo-utils";
import {
  createLeoPresetFromUser,
  deleteLeoPreset,
  loadLeoPresets,
  renameLeoPreset,
} from "@/services/dev-panel/leo-client";
import type { LeoConfigPreset, LeoUserListRow } from "@/src/types/leo";

type Props = {
  users: LeoUserListRow[];
  submitting: boolean;
  onSubmittingChange: (value: boolean) => void;
  onChanged: () => void;
};

export default function DevLeoPresetLibraryPanel({
  users,
  submitting,
  onSubmittingChange,
  onChanged,
}: Props) {
  const [presets, setPresets] = useState<LeoConfigPreset[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [sourceUserId, setSourceUserId] = useState("");
  const [newName, setNewName] = useState("");
  const [selectedPresetId, setSelectedPresetId] = useState("");
  const [renameValue, setRenameValue] = useState("");

  const refreshPresets = useCallback(async () => {
    const rows = await loadLeoPresets();
    setPresets(rows);
    setSelectedPresetId((current) => {
      if (current && rows.some((row) => row.id === current)) return current;
      return "";
    });
  }, []);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    refreshPresets()
      .catch((error) => {
        if (!cancelled) {
          toast.error(error instanceof Error ? error.message : "خطا در بارگذاری پریست‌ها");
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [refreshPresets]);

  const selectedPreset = presets.find((preset) => preset.id === selectedPresetId) ?? null;

  useEffect(() => {
    setRenameValue(selectedPreset?.name ?? "");
  }, [selectedPreset?.id, selectedPreset?.name]);

  const busy = submitting || loading;

  const handleCreate = async () => {
    const name = newName.trim();
    if (!sourceUserId) {
      toast.error("یک پلیر منبع انتخاب کنید");
      return;
    }
    if (!name) {
      toast.error("نام پریست را وارد کنید");
      return;
    }

    onSubmittingChange(true);
    try {
      const created = await createLeoPresetFromUser({ name, sourceUserId });
      setNewName("");
      setSelectedPresetId(created.id);
      await refreshPresets();
      onChanged();
      toast.success(`پریست «${created.name}» ایجاد شد`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "خطا در ایجاد پریست");
    } finally {
      onSubmittingChange(false);
    }
  };

  const handleRename = async () => {
    if (!selectedPreset) {
      toast.error("یک پریست انتخاب کنید");
      return;
    }
    const name = renameValue.trim();
    if (!name) {
      toast.error("نام پریست را وارد کنید");
      return;
    }
    if (name === selectedPreset.name) {
      toast.success("نام تغییری نکرد");
      return;
    }

    onSubmittingChange(true);
    try {
      const renamed = await renameLeoPreset(selectedPreset.id, name);
      await refreshPresets();
      onChanged();
      toast.success(`نام پریست به «${renamed.name}» تغییر کرد`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "خطا در تغییر نام پریست");
    } finally {
      onSubmittingChange(false);
    }
  };

  const handleDelete = async () => {
    if (!selectedPreset) {
      toast.error("یک پریست انتخاب کنید");
      return;
    }

    onSubmittingChange(true);
    try {
      await deleteLeoPreset(selectedPreset.id);
      setSelectedPresetId("");
      await refreshPresets();
      onChanged();
      toast.success(`پریست «${selectedPreset.name}» حذف شد`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "خطا در حذف پریست");
    } finally {
      onSubmittingChange(false);
    }
  };

  return (
    <div className="overflow-hidden rounded-xl border border-gray-800 bg-[#151515]">
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        className="flex w-full items-center justify-between gap-3 px-4 py-3 text-right"
        aria-expanded={open}
      >
        <div className="min-w-0">
          <div className="text-sm font-medium text-white">مدیریت پریست‌ها</div>
          <p className="mt-0.5 truncate text-[11px] text-gray-500">
            <span className="numeric-text numeric-text--11 text-violet-300" dir="ltr">
              {presets.length.toLocaleString("en-US")}
            </span>{" "}
            پریست
          </p>
        </div>
        <span
          className={`shrink-0 text-gray-500 transition-transform ${open ? "rotate-180" : ""}`}
          aria-hidden
        >
          ▾
        </span>
      </button>

      {open ? (
        <div className="space-y-3 border-t border-gray-800 p-3">
          <p className="text-[11px] text-gray-500">
            از تنظیمات ذخیره‌شده یک پلیر پریست بسازید، نام را عوض کنید یا حذف کنید.
          </p>

      <div className="space-y-2 rounded-lg border border-gray-800 bg-[#1a1a1a] p-3">
        <div className="text-xs font-semibold text-gray-300">ایجاد</div>
        <select
          value={sourceUserId}
          disabled={busy || users.length === 0}
          onChange={(event) => setSourceUserId(event.target.value)}
          className="w-full rounded-lg border border-gray-700 bg-[#1f2933] px-3 py-2 text-sm text-white disabled:opacity-60"
        >
          <option value="">{users.length === 0 ? "پلیری در لیست نیست" : "پلیر منبع..."}</option>
          {users.map((user) => (
            <option key={user.userId} value={user.userId}>
              {user.displayName}
              {user.displayName !== user.username ? ` — ${user.username}` : ""}
            </option>
          ))}
        </select>
        <div className="grid gap-2 sm:grid-cols-[1fr_auto]">
          <input
            value={newName}
            disabled={busy}
            maxLength={80}
            onChange={(event) => setNewName(event.target.value)}
            placeholder="نام پریست جدید..."
            className="w-full rounded-lg border border-gray-700 bg-[#1f2933] px-3 py-2 text-sm text-white placeholder:text-gray-500"
          />
          <button
            type="button"
            disabled={busy || !sourceUserId}
            onClick={() => void handleCreate()}
            className="rounded-lg bg-violet-800 px-4 py-2 text-sm font-semibold text-white hover:bg-violet-700 disabled:opacity-60"
          >
            ایجاد
          </button>
        </div>
      </div>

      <div className="space-y-2 rounded-lg border border-gray-800 bg-[#1a1a1a] p-3">
        <div className="text-xs font-semibold text-gray-300">تغییر نام و حذف</div>
        <select
          value={selectedPresetId}
          disabled={busy || presets.length === 0}
          onChange={(event) => setSelectedPresetId(event.target.value)}
          className="w-full rounded-lg border border-gray-700 bg-[#1f2933] px-3 py-2 text-sm text-white disabled:opacity-60"
        >
          <option value="">
            {loading ? "در حال بارگذاری..." : presets.length === 0 ? "پریستی نیست" : "انتخاب پریست..."}
          </option>
          {presets.map((preset) => (
            <option key={preset.id} value={preset.id}>
              {preset.name}
              {preset.sourceDisplayName ? ` — ${preset.sourceDisplayName}` : ""}
            </option>
          ))}
        </select>

        {selectedPreset ? (
          <div className="rounded-lg border border-gray-800 bg-[#1f2933] px-3 py-2 text-[11px] text-gray-400">
            {profileLabel(selectedPreset.behaviorProfile)}
            {" · "}
            <span className="numeric-text numeric-text--11 text-gray-300" dir="ltr">
              {selectedPreset.activeTimeBands.length.toLocaleString("en-US")}
            </span>{" "}
            بازه
            {" · "}
            <span className="numeric-text numeric-text--11 text-gray-300" dir="ltr">
              {selectedPreset.preferredTemplateIds.length.toLocaleString("en-US")}
            </span>
            /
            <span className="numeric-text numeric-text--11 text-gray-300" dir="ltr">
              {selectedPreset.randomTemplateIds.length.toLocaleString("en-US")}
            </span>{" "}
            میز
          </div>
        ) : null}

        <div className="grid gap-2 sm:grid-cols-[1fr_auto]">
          <input
            value={renameValue}
            disabled={busy || !selectedPreset}
            maxLength={80}
            onChange={(event) => setRenameValue(event.target.value)}
            placeholder="نام جدید..."
            className="w-full rounded-lg border border-gray-700 bg-[#1f2933] px-3 py-2 text-sm text-white placeholder:text-gray-500"
          />
          <button
            type="button"
            disabled={busy || !selectedPreset}
            onClick={() => void handleRename()}
            className="rounded-lg bg-indigo-800 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-60"
          >
            ذخیره نام
          </button>
        </div>

        <button
          type="button"
          disabled={busy || !selectedPreset}
          onClick={() => void handleDelete()}
          className="w-full rounded-lg border border-red-900/60 px-3 py-2 text-xs font-semibold text-red-300 hover:bg-red-950/30 disabled:opacity-60"
        >
          حذف پریست انتخاب‌شده
        </button>
      </div>
        </div>
      ) : null}
    </div>
  );
}
