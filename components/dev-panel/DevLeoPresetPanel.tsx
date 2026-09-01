"use client";

import { useCallback, useEffect, useState } from "react";
import toast from "react-hot-toast";
import { profileLabel } from "@/components/dev-panel/leo-utils";
import { loadLeoPresets } from "@/services/dev-panel/leo-client";
import type { LeoConfigPreset, LeoSaveUserConfigPayload } from "@/src/types/leo";

type Props = {
  onApplyPreset: (config: LeoSaveUserConfigPayload, presetName: string) => void;
  disabled?: boolean;
  presetsRevision?: number;
};

export default function DevLeoPresetPanel({
  onApplyPreset,
  disabled = false,
  presetsRevision = 0,
}: Props) {
  const [presets, setPresets] = useState<LeoConfigPreset[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedPresetId, setSelectedPresetId] = useState("");

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
  }, [refreshPresets, presetsRevision]);

  const selectedPreset = presets.find((preset) => preset.id === selectedPresetId) ?? null;

  const handleApply = () => {
    if (!selectedPreset) {
      toast.error("یک پریست انتخاب کنید");
      return;
    }

    onApplyPreset(
      {
        isEnabled: selectedPreset.isEnabled,
        activeTimeBands: selectedPreset.activeTimeBands,
        behaviorProfile: selectedPreset.behaviorProfile,
        sessionBudget: selectedPreset.sessionBudget,
        hardStopLoss: selectedPreset.hardStopLoss,
        maxConcurrentTables: selectedPreset.maxConcurrentTables,
        preferredTemplateIds: selectedPreset.preferredTemplateIds,
        randomTemplateIds: selectedPreset.randomTemplateIds,
        appliedPresetName: selectedPreset.name,
      },
      selectedPreset.name
    );
  };

  return (
    <div className="space-y-3 rounded-xl border border-gray-700 bg-[#121820] p-3">
      <div>
        <h2 className="text-sm font-semibold text-white">اعمال پریست</h2>
        <p className="mt-1 text-[11px] text-gray-500">
          پریست ذخیره‌شده را روی این پلیر اعمال کنید
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
    </div>
  );
}
