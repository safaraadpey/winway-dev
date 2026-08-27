"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  loadDevPlayerProfiles,
  setDevPlayerProfileEngineEnabled,
} from "@/services/dev-panel/dev-player-profiles";
import { saveDevPlayerTemplateJoinSettings } from "@/services/dev-panel/dev-player-settings";
import type { DevPlayerProfile } from "@/src/types/dev-player-profiles";
import {
  DEFAULT_TEMPLATE_JOIN_DELAY_MAX_SECONDS,
  MAX_TEMPLATE_JOIN_DELAY_MAX_SECONDS,
  MIN_TEMPLATE_JOIN_DELAY_MAX_SECONDS,
  type DevPlayerTemplateOption,
} from "@/src/types/dev-player-settings";
import toast from "react-hot-toast";

function ToggleSwitch({
  checked,
  disabled,
  loading,
  onChange,
  ariaLabel,
}: {
  checked: boolean;
  disabled?: boolean;
  loading?: boolean;
  onChange: (value: boolean) => void;
  ariaLabel: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={ariaLabel}
      disabled={disabled || loading}
      onClick={() => onChange(!checked)}
      className={`relative mt-0.5 h-6 w-12 shrink-0 rounded-full transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
        checked ? "bg-violet-600" : "bg-gray-600"
      }`}
    >
      <span
        className={`absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${
          checked ? "translate-x-6" : "translate-x-0"
        } ${loading ? "opacity-70" : ""}`}
      />
    </button>
  );
}

function formatPlayWindows(windows: DevPlayerProfile["playWindows"]): string {
  if (windows.length === 0) return "—";
  return windows.map((window) => `${window.start}–${window.end}`).join(" · ");
}

function isEngineTemplate(template: DevPlayerTemplateOption): boolean {
  return template.roomType !== "tournament" && ["active", "draining"].includes(template.status);
}

function CollapsibleGroup({
  title,
  children,
  defaultExpanded = false,
}: {
  title: string;
  children: React.ReactNode;
  defaultExpanded?: boolean;
}) {
  const [expanded, setExpanded] = useState(defaultExpanded);

  return (
    <div className="overflow-hidden rounded-xl border border-gray-800 bg-[#1a1a1a]">
      <button
        type="button"
        onClick={() => setExpanded((prev) => !prev)}
        aria-expanded={expanded}
        className="flex w-full items-center justify-between gap-2 px-3 py-3 text-right"
      >
        <span className="text-sm font-medium text-violet-100">{title}</span>
        <span
          className={`shrink-0 text-xs text-gray-400 transition-transform ${expanded ? "rotate-180" : ""}`}
        >
          ▼
        </span>
      </button>
      {expanded ? (
        <div className="space-y-3 border-t border-gray-800 px-3 pb-3 pt-3">{children}</div>
      ) : null}
    </div>
  );
}

type DevPlayerProfileEngineTogglesProps = {
  templates: DevPlayerTemplateOption[];
};

export default function DevPlayerProfileEngineToggles({
  templates,
}: DevPlayerProfileEngineTogglesProps) {
  const [loading, setLoading] = useState(true);
  const [profiles, setProfiles] = useState<DevPlayerProfile[]>([]);
  const [togglingProfileId, setTogglingProfileId] = useState<string | null>(null);
  const [delayDrafts, setDelayDrafts] = useState<Record<string, string>>({});
  const [savingDelays, setSavingDelays] = useState(false);

  const fetchProfiles = useCallback(async () => {
    try {
      setLoading(true);
      const loaded = await loadDevPlayerProfiles();
      setProfiles(loaded);
    } catch (error) {
      console.error("loadDevPlayerProfiles error:", error);
      toast.error("خطا در بارگذاری پروفایل‌ها");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchProfiles();
  }, [fetchProfiles]);

  const enabledProfiles = useMemo(
    () => profiles.filter((profile) => profile.engineEnabled),
    [profiles]
  );

  const allowedPrices = useMemo(() => {
    const prices = new Set<number>();
    for (const profile of enabledProfiles) {
      for (const price of profile.allowedPrices) {
        prices.add(Number(price));
      }
    }
    return prices;
  }, [enabledProfiles]);

  const relevantTemplates = useMemo(
    () =>
      templates.filter(
        (template) => isEngineTemplate(template) && allowedPrices.has(template.price)
      ),
    [templates, allowedPrices]
  );

  useEffect(() => {
    setDelayDrafts((prev) => {
      const next: Record<string, string> = {};
      for (const template of relevantTemplates) {
        next[template.id] =
          prev[template.id] ??
          String(template.joinDelayMaxSeconds ?? DEFAULT_TEMPLATE_JOIN_DELAY_MAX_SECONDS);
      }
      return next;
    });
  }, [relevantTemplates]);

  const handleEngineToggle = async (profile: DevPlayerProfile, enabled: boolean) => {
    setTogglingProfileId(profile.id);
    setProfiles((prev) =>
      prev.map((item) =>
        item.id === profile.id ? { ...item, engineEnabled: enabled } : item
      )
    );

    try {
      await setDevPlayerProfileEngineEnabled(profile.id, enabled);
      toast.success(enabled ? "پروفایل در موتور فعال شد" : "پروفایل از موتور غیرفعال شد");
    } catch (error: any) {
      console.error("setDevPlayerProfileEngineEnabled error:", error);
      setProfiles((prev) =>
        prev.map((item) =>
          item.id === profile.id ? { ...item, engineEnabled: profile.engineEnabled } : item
        )
      );
      toast.error(error?.message || "خطا در تغییر وضعیت موتور");
    } finally {
      setTogglingProfileId(null);
    }
  };

  const handleSaveTemplateDelays = async () => {
    if (relevantTemplates.length === 0) return;

    for (const template of relevantTemplates) {
      const raw = delayDrafts[template.id]?.trim() ?? "";
      const value = Number(raw);
      if (
        !Number.isInteger(value) ||
        value < MIN_TEMPLATE_JOIN_DELAY_MAX_SECONDS ||
        value > MAX_TEMPLATE_JOIN_DELAY_MAX_SECONDS
      ) {
        toast.error(`حداکثر تأخیر ${template.name} باید بین ۰ تا ${MAX_TEMPLATE_JOIN_DELAY_MAX_SECONDS} باشد`);
        return;
      }
    }

    setSavingDelays(true);
    try {
      await saveDevPlayerTemplateJoinSettings(
        relevantTemplates.map((template) => ({
          template_id: template.id,
          join_delay_max_seconds: Number(delayDrafts[template.id]),
        }))
      );
      toast.success("تأخیر تصادفی join میزها ذخیره شد");
    } catch (error: any) {
      console.error("saveDevPlayerTemplateJoinSettings error:", error);
      toast.error(error?.message || "خطا در ذخیره تأخیر join");
    } finally {
      setSavingDelays(false);
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center py-6">
        <div className="h-6 w-6 animate-spin rounded-full border-4 border-gray-300 border-r-transparent" />
      </div>
    );
  }

  if (profiles.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-gray-700 bg-[#151515] p-4 text-center text-sm text-gray-400">
        هنوز پروفایلی ساخته نشده. از بخش «تنظیم پروفایل» پایین، پروفایل بسازید و پلیرها را
        اختصاص دهید.
      </div>
    );
  }

  const enabledCount = enabledProfiles.length;

  return (
    <div className="space-y-4">
      {enabledCount === 0 ? (
        <p className="rounded-lg border border-amber-900/40 bg-amber-950/20 px-3 py-2 text-xs text-amber-200">
          هیچ پروفایلی در موتور فعال نیست — scheduler تا زمان فعال‌سازی حداقل یک پروفایل،
          schedule نمی‌سازد.
        </p>
      ) : null}

      <div className="space-y-2">
        {profiles.map((profile) => (
          <div
            key={profile.id}
            className={`flex items-start justify-between gap-3 rounded-xl border px-3 py-3 ${
              profile.engineEnabled
                ? "border-violet-700/40 bg-violet-950/10"
                : "border-gray-800 bg-[#1a1a1a]"
            }`}
          >
            <div className="min-w-0 flex-1">
              <div className="text-sm font-medium text-white">{profile.name}</div>
              <div className="mt-1 text-xs text-gray-400">
                بازه:{" "}
                <span className="numeric-text numeric-text--12" dir="ltr">
                  {formatPlayWindows(profile.playWindows)}
                </span>
              </div>
              <div className="mt-1 text-xs text-gray-400">
                اعضا:{" "}
                <span className="numeric-text numeric-text--12" dir="ltr">
                  {profile.memberCount.toLocaleString("en-US")}
                </span>
              </div>
            </div>
            <ToggleSwitch
              checked={profile.engineEnabled}
              loading={togglingProfileId === profile.id}
              ariaLabel={`فعال‌سازی ${profile.name} در موتور`}
              onChange={(value) => void handleEngineToggle(profile, value)}
            />
          </div>
        ))}
      </div>

      <CollapsibleGroup title="ریتم ثبت نام">
        {enabledCount === 0 ? (
          <p className="text-xs text-gray-500">برای نمایش میزها، حداقل یک پروفایل را فعال کنید.</p>
        ) : relevantTemplates.length === 0 ? (
          <p className="text-xs text-gray-500">
            میزی با قیمت‌های پروفایل‌های فعال پیدا نشد.
          </p>
        ) : (
          <>
            <div className="space-y-2">
              {relevantTemplates.map((template) => (
                <div
                  key={template.id}
                  className="grid grid-cols-[1fr_88px] items-center gap-3 rounded-lg border border-gray-800 bg-[#151515] px-3 py-2.5"
                >
                  <div className="min-w-0">
                    <div className="truncate text-sm text-white">{template.name}</div>
                    <div className="mt-0.5 text-[11px] text-gray-400">
                      <span className="numeric-text numeric-text--12" dir="ltr">
                        {template.price.toLocaleString("en-US")}
                      </span>{" "}
                      {template.currency}
                    </div>
                  </div>
                  <label className="space-y-1">
                    <span className="block text-[10px] text-gray-500">حداکثر (ثانیه)</span>
                    <input
                      type="number"
                      min={MIN_TEMPLATE_JOIN_DELAY_MAX_SECONDS}
                      max={MAX_TEMPLATE_JOIN_DELAY_MAX_SECONDS}
                      value={delayDrafts[template.id] ?? String(DEFAULT_TEMPLATE_JOIN_DELAY_MAX_SECONDS)}
                      onChange={(e) =>
                        setDelayDrafts((prev) => ({
                          ...prev,
                          [template.id]: e.target.value,
                        }))
                      }
                      className="numeric-text numeric-text--14 w-full rounded-lg border border-gray-700 bg-[#1f2933] px-2 py-1.5 text-white"
                      dir="ltr"
                    />
                  </label>
                </div>
              ))}
            </div>

            <button
              type="button"
              disabled={savingDelays}
              onClick={() => void handleSaveTemplateDelays()}
              className="w-full rounded-xl border border-violet-700 bg-violet-950/40 py-2.5 text-sm font-semibold text-violet-100 disabled:opacity-50"
            >
              {savingDelays ? "در حال ذخیره..." : "ذخیره ریتم ثبت نام"}
            </button>
          </>
        )}
      </CollapsibleGroup>
    </div>
  );
}
