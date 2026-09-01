"use client";

import { useEffect, useMemo, useState } from "react";
import toast from "react-hot-toast";
import DevLeoPresetPanel from "@/components/dev-panel/DevLeoPresetPanel";
import DevLeoTimelinePreview from "@/components/dev-panel/DevLeoTimelinePreview";
import {
  ALL_PROFILES,
  ALL_TIME_BANDS,
  bandLabel,
  profileLabel,
  stakeLabel,
  stakeTierFromPrice,
} from "@/components/dev-panel/leo-utils";
import { previewLeoTimeline, saveLeoUserConfig } from "@/services/dev-panel/leo-client";
import type {
  LeoBehaviorProfile,
  LeoPreviewResult,
  LeoSaveUserConfigPayload,
  LeoTemplateOption,
  LeoTimeBand,
  LeoUserDetail,
} from "@/src/types/leo";
import { LEO_PROFILE_LABELS } from "@/src/types/leo";

type Props = {
  user: LeoUserDetail;
  templates: LeoTemplateOption[];
  submitting: boolean;
  inline?: boolean;
  presetsRevision?: number;
  onSubmittingChange: (value: boolean) => void;
  onSaved: (user: LeoUserDetail) => void;
  onBack?: () => void;
};

export default function DevLeoUserEditor({
  user,
  templates,
  submitting,
  inline = false,
  presetsRevision = 0,
  onSubmittingChange,
  onSaved,
  onBack,
}: Props) {
  const [isEnabled, setIsEnabled] = useState(user.isEnabled);
  const [activeTimeBands, setActiveTimeBands] = useState<LeoTimeBand[]>(user.activeTimeBands);
  const [behaviorProfile, setBehaviorProfile] = useState<LeoBehaviorProfile>(user.behaviorProfile);
  const [sessionBudget, setSessionBudget] = useState(String(user.sessionBudget));
  const [hardStopLoss, setHardStopLoss] = useState(String(user.hardStopLoss));
  const [maxConcurrentTables, setMaxConcurrentTables] = useState(String(user.maxConcurrentTables));
  const [preferredTemplateIds, setPreferredTemplateIds] = useState<string[]>(
    user.preferredTemplateIds
  );
  const [randomTemplateIds, setRandomTemplateIds] = useState<string[]>(user.randomTemplateIds);
  const [appliedPresetName, setAppliedPresetName] = useState<string | null>(user.appliedPresetName);
  const [previewBand, setPreviewBand] = useState<LeoTimeBand>(
    user.activeTimeBands[0] ?? "afternoon"
  );
  const [preview, setPreview] = useState<LeoPreviewResult | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);

  useEffect(() => {
    setIsEnabled(user.isEnabled);
  }, [user.isEnabled]);

  useEffect(() => {
    setAppliedPresetName(user.appliedPresetName);
  }, [user.appliedPresetName]);

  const applyPreset = (config: LeoSaveUserConfigPayload, presetName: string) => {
    if (config.isEnabled && user.devPlayerActive) {
      toast.error(user.conflictMessage ?? "تداخل با Dev Player");
      return;
    }

    setIsEnabled(config.isEnabled);
    setActiveTimeBands(config.activeTimeBands);
    setBehaviorProfile(config.behaviorProfile);
    setSessionBudget(String(config.sessionBudget));
    setHardStopLoss(String(config.hardStopLoss));
    setMaxConcurrentTables(String(config.maxConcurrentTables));
    setPreferredTemplateIds(config.preferredTemplateIds);
    setRandomTemplateIds(config.randomTemplateIds);
    setAppliedPresetName(presetName);
    setPreviewBand(config.activeTimeBands[0] ?? "afternoon");
    setPreview(null);

    console.log(`[Leo] apply preset user=${user.userId} name=${presetName}`);
    onSubmittingChange(true);
    void saveLeoUserConfig(user.userId, {
      ...config,
      appliedPresetName: presetName,
    })
      .then((saved) => {
        toast.success(`پریست «${presetName}» اعمال شد`);
        onSaved(saved);
      })
      .catch((error) => {
        toast.error(error instanceof Error ? error.message : "خطا در اعمال پریست");
      })
      .finally(() => {
        onSubmittingChange(false);
      });
  };

  const templateMap = useMemo(
    () => new Map(templates.map((t) => [t.id, t])),
    [templates]
  );

  const toggleBand = (band: LeoTimeBand) => {
    setActiveTimeBands((prev) =>
      prev.includes(band) ? prev.filter((b) => b !== band) : [...prev, band]
    );
    setPreview(null);
  };

  const handleSave = async () => {
    if (isEnabled && user.devPlayerActive) {
      toast.error(user.conflictMessage ?? "تداخل با Dev Player");
      return;
    }

    onSubmittingChange(true);
    try {
      const saved = await saveLeoUserConfig(user.userId, {
        isEnabled,
        activeTimeBands,
        behaviorProfile,
        sessionBudget: Number(sessionBudget) || 0,
        hardStopLoss: Number(hardStopLoss) || 0,
        maxConcurrentTables: Number(maxConcurrentTables) || 0,
        preferredTemplateIds,
        randomTemplateIds,
        appliedPresetName,
      });
      toast.success("تنظیمات لئو ذخیره شد");
      onSaved(saved);
    } catch (error) {
      const message = error instanceof Error ? error.message : "خطا در ذخیره";
      toast.error(message);
    } finally {
      onSubmittingChange(false);
    }
  };

  const handlePreview = async () => {
    if (!previewBand) {
      toast.error("یک بازه زمانی برای پیش‌نمایش انتخاب کنید");
      return;
    }

    setPreviewLoading(true);
    try {
      const result = await previewLeoTimeline({
        userId: user.userId,
        behaviorProfile,
        sessionBudget: Number(sessionBudget) || 0,
        hardStopLoss: Number(hardStopLoss) || 0,
        maxConcurrentTables: Number(maxConcurrentTables) || 0,
        preferredTemplateIds,
        randomTemplateIds,
        timeBand: previewBand,
      });
      setPreview(result);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "خطا در پیش‌نمایش");
    } finally {
      setPreviewLoading(false);
    }
  };

  return (
    <div className="space-y-4">
      {!inline ? (
        <div className="flex items-center justify-between gap-2">
          <div>
            <h1 className="text-xl font-bold text-white">{user.displayName}</h1>
            <p className="text-xs text-gray-500">{user.username}</p>
          </div>
          {onBack ? (
            <button
              type="button"
              onClick={onBack}
              className="rounded-xl border border-gray-700 px-3 py-2 text-xs font-semibold text-gray-200 hover:bg-gray-800"
            >
              بازگشت
            </button>
          ) : null}
        </div>
      ) : null}

      {user.devPlayerActive ? (
        <div className="rounded-xl border border-amber-700/60 bg-amber-950/30 p-3 text-xs text-amber-200">
          {user.conflictMessage}
        </div>
      ) : null}

      <DevLeoPresetPanel
        onApplyPreset={applyPreset}
        disabled={submitting || previewLoading}
        presetsRevision={presetsRevision}
      />

      <div
        className={`space-y-4 ${inline ? "rounded-xl border border-violet-900/40 bg-[#151515] p-3" : "rounded-2xl border border-violet-900/60 bg-[#151515] p-4"}`}
      >
        <section>
          <h2 className="mb-2 text-xs font-semibold text-gray-400">۱. زمان فعالیت</h2>
          <div className="flex flex-wrap gap-2">
            {ALL_TIME_BANDS.map((band) => {
              const active = activeTimeBands.includes(band);
              return (
                <button
                  key={band}
                  type="button"
                  onClick={() => toggleBand(band)}
                  className={`rounded-lg px-3 py-2 text-xs font-medium ${
                    active
                      ? "bg-violet-700 text-white"
                      : "border border-gray-700 bg-[#1f2933] text-gray-300"
                  }`}
                >
                  {bandLabel(band)}
                </button>
              );
            })}
          </div>
        </section>

        <section>
          <h2 className="mb-2 text-xs font-semibold text-gray-400">۲. پروفایل رفتاری</h2>
          <select
            value={behaviorProfile}
            onChange={(e) => {
              setBehaviorProfile(e.target.value as LeoBehaviorProfile);
              setPreview(null);
            }}
            className="w-full rounded-lg border border-gray-700 bg-[#1f2933] px-3 py-2 text-sm text-white"
          >
            {ALL_PROFILES.map((profile) => (
              <option key={profile} value={profile}>
                {profileLabel(profile)} — {LEO_PROFILE_LABELS[profile].description}
              </option>
            ))}
          </select>
        </section>

        <section>
          <h2 className="mb-2 text-xs font-semibold text-gray-400">۳. بودجه و ریسک</h2>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block space-y-1">
              <span className="text-xs text-gray-500">Session Budget</span>
              <input
                type="number"
                min={0}
                value={sessionBudget}
                onChange={(e) => setSessionBudget(e.target.value)}
                className="numeric-text numeric-text--14 w-full rounded-lg border border-gray-700 bg-[#1f2933] px-3 py-2 text-white"
                dir="ltr"
              />
            </label>
            <label className="block space-y-1">
              <span className="text-xs text-gray-500">Hard Stop-Loss</span>
              <input
                type="number"
                min={0}
                value={hardStopLoss}
                onChange={(e) => setHardStopLoss(e.target.value)}
                className="numeric-text numeric-text--14 w-full rounded-lg border border-gray-700 bg-[#1f2933] px-3 py-2 text-white"
                dir="ltr"
              />
            </label>
          </div>
        </section>

        <section>
          <h2 className="mb-2 text-xs font-semibold text-gray-400">۴. میزها</h2>
          <p className="mb-2 text-xs text-gray-500">
            Engine در هر سشن pool جدا انتخاب می‌کند و در هر دست می‌تواند هم‌زمان روی چند میز
            با فاصله کوتاه بنشیند.
          </p>
          <label className="mb-3 block space-y-1">
            <span className="text-xs text-gray-500">حداکثر میز هم‌زمان</span>
            <input
              type="number"
              min={0}
              value={maxConcurrentTables}
              onChange={(e) => {
                setMaxConcurrentTables(e.target.value);
                setPreview(null);
              }}
              placeholder="۰ = همه میزهای pool فعال"
              className="numeric-text numeric-text--14 w-full rounded-lg border border-gray-700 bg-[#1f2933] px-3 py-2 text-white"
              dir="ltr"
            />
            <span className="text-[10px] text-gray-600">
              ۰ یعنی تا سقف میزهای انتخاب‌شده در pool همان سشن؛ عدد مشخص = سقف دستی
            </span>
          </label>
          <div className="space-y-3">
            <TemplateMultiSelect
              title="میزهای همیشگی (Preferred)"
              templates={templates}
              selected={preferredTemplateIds}
              templateMap={templateMap}
              showStakePresets
              onChangeSelected={(ids) => {
                setPreferredTemplateIds(ids);
                setPreview(null);
              }}
            />
            <TemplateMultiSelect
              title="میزهای تصادفی (Random Pool)"
              templates={templates}
              selected={randomTemplateIds}
              templateMap={templateMap}
              onChangeSelected={(ids) => {
                setRandomTemplateIds(ids);
                setPreview(null);
              }}
            />
          </div>
        </section>

        <section>
          <h2 className="mb-2 text-xs font-semibold text-gray-400">۵. Preview</h2>
          <div className="flex flex-wrap gap-2">
            <select
              value={previewBand}
              onChange={(e) => setPreviewBand(e.target.value as LeoTimeBand)}
              className="rounded-lg border border-gray-700 bg-[#1f2933] px-3 py-2 text-sm text-white"
            >
              {(activeTimeBands.length ? activeTimeBands : ALL_TIME_BANDS).map((band) => (
                <option key={band} value={band}>
                  {bandLabel(band)}
                </option>
              ))}
            </select>
            <button
              type="button"
              disabled={previewLoading || submitting}
              onClick={() => void handlePreview()}
              className="rounded-xl bg-indigo-700 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-600 disabled:opacity-60"
            >
              تولید Timeline آزمایشی
            </button>
          </div>
        </section>

        <button
          type="button"
          disabled={submitting}
          onClick={() => void handleSave()}
          className="w-full rounded-xl bg-violet-700 py-3 text-sm font-semibold text-white hover:bg-violet-600 disabled:opacity-60"
        >
          ذخیره تنظیمات
        </button>
      </div>

      <DevLeoTimelinePreview preview={preview} loading={previewLoading} />
    </div>
  );
}

function unionIds(current: string[], extra: string[]): string[] {
  return Array.from(new Set([...current, ...extra]));
}

function StakeGroupToggle({
  label,
  templates,
  selected,
  onToggle,
}: {
  label: string;
  templates: LeoTemplateOption[];
  selected: string[];
  onToggle: () => void;
}) {
  const allSelected =
    templates.length > 0 && templates.every((template) => selected.includes(template.id));
  const someSelected =
    templates.some((template) => selected.includes(template.id)) && !allSelected;

  return (
    <label
      className={`flex min-h-[36px] items-center gap-2 ${
        templates.length === 0 ? "cursor-not-allowed opacity-40" : "cursor-pointer"
      }`}
    >
      <input
        type="checkbox"
        checked={allSelected}
        disabled={templates.length === 0}
        ref={(el) => {
          if (el) el.indeterminate = someSelected;
        }}
        onChange={onToggle}
        className="h-4 w-4 rounded border-gray-600 bg-[#1f2933] text-violet-600"
      />
      <span className="text-xs text-gray-400">{label}</span>
    </label>
  );
}

function TemplateMultiSelect({
  title,
  templates,
  selected,
  templateMap,
  onChangeSelected,
  showStakePresets = false,
}: {
  title: string;
  templates: LeoTemplateOption[];
  selected: string[];
  templateMap: Map<string, LeoTemplateOption>;
  onChangeSelected: (ids: string[]) => void;
  showStakePresets?: boolean;
}) {
  const allSelected = templates.length > 0 && selected.length === templates.length;
  const someSelected = selected.length > 0 && selected.length < templates.length;
  const lightTemplates = templates.filter((template) => stakeTierFromPrice(template.price) === "light");
  const mediumTemplates = templates.filter((template) => stakeTierFromPrice(template.price) === "medium");
  const heavyTemplates = templates.filter((template) => stakeTierFromPrice(template.price) === "heavy");

  const toggleAll = () => {
    onChangeSelected(allSelected ? [] : templates.map((t) => t.id));
  };

  const toggleGroup = (group: LeoTemplateOption[]) => {
    const ids = group.map((template) => template.id);
    const groupAllSelected = ids.length > 0 && ids.every((id) => selected.includes(id));
    onChangeSelected(
      groupAllSelected ? selected.filter((id) => !ids.includes(id)) : unionIds(selected, ids)
    );
  };

  const toggleOne = (id: string) => {
    onChangeSelected(
      selected.includes(id) ? selected.filter((x) => x !== id) : [...selected, id]
    );
  };

  return (
    <div>
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <span className="text-xs text-gray-400">{title}</span>
        {templates.length > 0 ? (
          <div className="flex flex-wrap items-center justify-end gap-x-3 gap-y-1">
            {showStakePresets ? (
              <>
                <StakeGroupToggle
                  label={stakeLabel("light")}
                  templates={lightTemplates}
                  selected={selected}
                  onToggle={() => toggleGroup(lightTemplates)}
                />
                <StakeGroupToggle
                  label={stakeLabel("medium")}
                  templates={mediumTemplates}
                  selected={selected}
                  onToggle={() => toggleGroup(mediumTemplates)}
                />
                <StakeGroupToggle
                  label={stakeLabel("heavy")}
                  templates={heavyTemplates}
                  selected={selected}
                  onToggle={() => toggleGroup(heavyTemplates)}
                />
              </>
            ) : null}
            <label className="flex min-h-[36px] cursor-pointer items-center gap-2">
              <input
                type="checkbox"
                checked={allSelected}
                ref={(el) => {
                  if (el) el.indeterminate = someSelected;
                }}
                onChange={toggleAll}
                className="h-4 w-4 rounded border-gray-600 bg-[#1f2933] text-violet-600"
              />
              <span className="text-xs text-gray-400">انتخاب همه</span>
              <span className="numeric-text numeric-text--11 text-violet-300" dir="ltr">
                {selected.length.toLocaleString("en-US")} / {templates.length.toLocaleString("en-US")}
              </span>
            </label>
          </div>
        ) : null}
      </div>
      {templates.length === 0 ? (
        <div className="text-xs text-gray-600">میزی یافت نشد</div>
      ) : (
        <div className="max-h-40 space-y-1 overflow-y-auto">
          {templates.map((template) => {
            const checked = selected.includes(template.id);
            return (
              <label
                key={template.id}
                className={`flex min-h-[40px] cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-xs ${
                  checked ? "border-violet-600 bg-violet-950/20" : "border-gray-800 bg-[#1f2933]"
                }`}
              >
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={() => toggleOne(template.id)}
                  className="h-4 w-4 rounded border-gray-600 text-violet-600"
                />
                <span className="text-white">{template.name}</span>
                <span className="numeric-text numeric-text--11 mr-auto text-gray-400" dir="ltr">
                  {template.price.toLocaleString("en-US")}
                </span>
              </label>
            );
          })}
        </div>
      )}
      {selected.length > 0 ? (
        <div className="mt-1 text-[10px] text-gray-600">
          {selected.length} انتخاب — {selected.map((id) => templateMap.get(id)?.name ?? id).join("، ")}
        </div>
      ) : null}
    </div>
  );
}
