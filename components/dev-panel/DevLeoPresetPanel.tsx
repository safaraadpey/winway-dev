"use client";

import { useCallback, useEffect, useState } from "react";
import toast from "react-hot-toast";
import { profileLabel } from "@/components/dev-panel/leo-utils";
import {
  deleteLeoPreset,
  loadLeoPresets,
  saveLeoPreset,
} from "@/services/dev-panel/leo-client";
import type { LeoConfigPreset, LeoSaveUserConfigPayload } from "@/src/types/leo";

type Props = {
  sourceUserId: string;
  getCurrentConfig: () => LeoSaveUserConfigPayload;
  onApplyPreset: (config: LeoSaveUserConfigPayload) => void;
  disabled?: boolean;
};

export default function DevLeoPresetPanel({
  sourceUserId,
  getCurrentConfig,
  onApplyPreset,
  disabled = false,
}: Props) {
  const [presets, setPresets] = useState<LeoConfigPreset[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedPresetId, setSelectedPresetId] = useState("");
  const [presetName, setPresetName] = useState("");
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const refreshPresets = useCallback(async () => {
    const rows = await loadLeoPresets();
    setPresets(rows);
    setSelectedPresetId((current) =>
      current && rows.some((row) => row.id === current) ? current : ""
    );
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

  const handleApply = () => {
    if (!selectedPreset) {
      toast.error("یک پریست انتخاب کنید");
      return;
    }

    onApplyPreset({
      isEnabled: selectedPreset.isEnabled,
      activeTimeBands: selectedPreset.activeTimeBands,
      behaviorProfile: selectedPreset.behaviorProfile,
      sessionBudget: selectedPreset.sessionBudget,
      hardStopLoss: selectedPreset.hardStopLoss,
      maxConcurrentTables: selectedPreset.maxConcurrentTables,
      preferredTemplateIds: selectedPreset.preferredTemplateIds,
      randomTemplateIds: selectedPreset.randomTemplateIds,
    });
    toast.success(`پریست «${selectedPreset.name}» اعمال شد`);
  };

  const handleSave = async () => {
    const name = presetName.trim();
    if (!name) {
      toast.error("نام پریست را وارد کنید");
      return;
    }

    setSaving(true);
    try {
      const saved = await saveLeoPreset({
        name,
        sourceUserId,
        ...getCurrentConfig(),
      });
      setPresetName("");
      setSelectedPresetId(saved.id);
      await refreshPresets();
      toast.success(`پریست «${saved.name}» ذخیره شد`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "خطا در ذخیره پریست");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!selectedPreset) {
      toast.error("یک پریست انتخاب کنید");
      return;
    }

    setDeleting(true);
    try {
      await deleteLeoPreset(selectedPreset.id);
      setSelectedPresetId("");
      await refreshPresets();
      toast.success(`پریست «${selectedPreset.name}» حذف شد`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "خطا در حذف پریست");
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="space-y-3 rounded-xl border border-gray-700 bg-[#121820] p-3">
      <div>
        <h2 className="text-sm font-semibold text-white">پریست تنظیمات</h2>
        <p className="mt-1 text-[11px] text-gray-500">
          تنظیمات فعلی را ذخیره کنید یا پریست ذخیره‌شده را روی این کاربر اعمال کنید
        </p>
      </div>

      <div className="grid gap-2 sm:grid-cols-[1fr_auto]">
        <select
          value={selectedPresetId}
          disabled={disabled || loading || presets.length === 0}
          onChange={(e) => setSelectedPresetId(e.target.value)}
          className="w-full rounded-lg border border-gray-700 bg-[#1f2933] px-3 py-2 text-sm text-white disabled:opacity-60"
        >
          <option value="">
            {loading ? "در حال بارگذاری پریست‌ها..." : "انتخاب پریست..."}
          </option>
          {presets.map((preset) => (
            <option key={preset.id} value={preset.id}>
              {preset.name}
              {preset.sourceDisplayName ? ` — ${preset.sourceDisplayName}` : ""}
            </option>
          ))}
        </select>
        <button
          type="button"
          disabled={disabled || !selectedPresetId || loading}
          onClick={handleApply}
          className="rounded-lg bg-indigo-700 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-600 disabled:opacity-60"
        >
          اعمال
        </button>
      </div>

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
          value={presetName}
          disabled={disabled || saving}
          onChange={(e) => setPresetName(e.target.value)}
          placeholder="نام پریست جدید..."
          className="w-full rounded-lg border border-gray-700 bg-[#1f2933] px-3 py-2 text-sm text-white placeholder:text-gray-500"
        />
        <button
          type="button"
          disabled={disabled || saving}
          onClick={() => void handleSave()}
          className="rounded-lg bg-violet-800 px-4 py-2 text-sm font-semibold text-white hover:bg-violet-700 disabled:opacity-60"
        >
          ذخیره پریست
        </button>
      </div>

      {selectedPreset ? (
        <button
          type="button"
          disabled={disabled || deleting}
          onClick={() => void handleDelete()}
          className="w-full rounded-lg border border-red-900/60 px-3 py-2 text-xs font-semibold text-red-300 hover:bg-red-950/30 disabled:opacity-60"
        >
          حذف پریست انتخاب‌شده
        </button>
      ) : null}
    </div>
  );
}
