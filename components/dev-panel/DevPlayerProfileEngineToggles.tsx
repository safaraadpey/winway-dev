"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  loadDevPlayerProfiles,
  setDevPlayerProfileEngineEnabled,
} from "@/services/dev-panel/dev-player-profiles";
import { saveDevPlayerTemplateJoinSettings } from "@/services/dev-panel/dev-player-settings";
import {
  findOverlappingRhythmWindows,
  isRhythmWindowActive,
  MAX_TEMPLATE_RHYTHM_WINDOWS,
} from "@/lib/dev-panel/devPlayerRhythmWindows";
import type { DevPlayerProfile } from "@/src/types/dev-player-profiles";
import {
  DEFAULT_TEMPLATE_JOIN_DELAY_MAX_SECONDS,
  MAX_TEMPLATE_MAX_DEV_PLAYERS_PER_ROOM,
  MIN_TEMPLATE_MAX_DEV_PLAYERS_PER_ROOM,
  TEMPLATE_JOIN_DELAY_PRESETS,
  formatJoinDelayPresetLabel,
  isTemplateJoinDelayPreset,
  type DevPlayerTemplateOption,
  type TemplateRhythmWindow,
} from "@/src/types/dev-player-settings";
import toast from "react-hot-toast";

const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
const HOUR_OPTIONS = Array.from({ length: 24 }, (_, index) => String(index).padStart(2, "0"));
const MINUTE_OPTIONS = Array.from({ length: 60 }, (_, index) => String(index).padStart(2, "0"));
const SUGGESTED_WINDOWS = [
  { start: "06:00", end: "12:00" },
  { start: "17:00", end: "23:00" },
  { start: "12:00", end: "17:00" },
] as const;

type RhythmWindowDraft = {
  start: string;
  end: string;
  delay: string;
  cap: string;
};

type TemplateJoinDraft = {
  delay: string;
  cap: string;
  windows: RhythmWindowDraft[];
};

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

function parseClock(value: string): { hour: string; minute: string } {
  if (TIME_RE.test(value)) {
    const [hour, minute] = value.split(":");
    return { hour, minute };
  }
  return { hour: "10", minute: "00" };
}

function TimeSelect({
  value,
  onChange,
  ariaLabel,
}: {
  value: string;
  onChange: (value: string) => void;
  ariaLabel: string;
}) {
  const { hour, minute } = parseClock(value);
  const selectClassName =
    "numeric-text numeric-text--14 min-w-0 flex-1 rounded-lg border border-gray-700 bg-[#1f2933] px-1.5 py-1.5 text-white";

  return (
    <div className="flex items-center gap-1" dir="ltr" aria-label={ariaLabel}>
      <select
        value={hour}
        onChange={(e) => onChange(`${e.target.value}:${minute}`)}
        className={selectClassName}
        aria-label={`${ariaLabel} — ساعت`}
      >
        {HOUR_OPTIONS.map((option) => (
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
        {MINUTE_OPTIONS.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>
    </div>
  );
}

function capToDraft(value: number | null | undefined): string {
  return value === null || value === undefined ? "" : String(value);
}

function windowToDraft(window: TemplateRhythmWindow): RhythmWindowDraft {
  return {
    start: window.start,
    end: window.end,
    delay: String(window.joinDelayMaxSeconds),
    cap: capToDraft(window.maxDevPlayersPerRoom),
  };
}

function templateToDraft(template: DevPlayerTemplateOption): TemplateJoinDraft {
  return {
    delay: String(template.joinDelayMaxSeconds ?? DEFAULT_TEMPLATE_JOIN_DELAY_MAX_SECONDS),
    cap: capToDraft(template.maxDevPlayersPerRoom),
    windows: (template.rhythmWindows ?? []).map(windowToDraft),
  };
}

function suggestWindow(existing: RhythmWindowDraft[]): { start: string; end: string } {
  const occupied = existing
    .filter((window) => TIME_RE.test(window.start) && TIME_RE.test(window.end) && window.start < window.end)
    .map((window) => ({ start: window.start, end: window.end, joinDelayMaxSeconds: 20, maxDevPlayersPerRoom: null }));

  for (const candidate of SUGGESTED_WINDOWS) {
    const next = { ...candidate, joinDelayMaxSeconds: 20, maxDevPlayersPerRoom: null };
    if (!occupied.some((window) => window.start < next.end && next.start < window.end)) {
      return candidate;
    }
  }
  return { start: "10:00", end: "12:00" };
}

function parseCapDraft(raw: string, templateName: string): number | null | undefined {
  const capRaw = raw.trim();
  if (capRaw === "") return null;
  const capValue = Number(capRaw);
  if (
    !Number.isInteger(capValue) ||
    capValue < MIN_TEMPLATE_MAX_DEV_PLAYERS_PER_ROOM ||
    capValue > MAX_TEMPLATE_MAX_DEV_PLAYERS_PER_ROOM
  ) {
    toast.error(
      `سقف Dev Player در روم ${templateName} باید خالی یا بین ${MIN_TEMPLATE_MAX_DEV_PLAYERS_PER_ROOM} تا ${MAX_TEMPLATE_MAX_DEV_PLAYERS_PER_ROOM} باشد`
    );
    return undefined;
  }
  return capValue;
}

function parseDelayDraft(
  raw: string,
  templateName: string,
  storedDelay: number
): number | undefined {
  const value = Number(raw.trim());
  if (!Number.isInteger(value) || (!isTemplateJoinDelayPreset(value) && value !== storedDelay)) {
    toast.error(`ریتم ${templateName} را از فهرست بازه‌ها انتخاب کنید`);
    return undefined;
  }
  return value;
}

function RhythmSelect({
  value,
  storedDelay,
  onChange,
  ariaLabel,
}: {
  value: string;
  storedDelay: number;
  onChange: (value: string) => void;
  ariaLabel: string;
}) {
  const delaySeconds = Number(value);
  const showLegacyDelay = Number.isInteger(delaySeconds) && !isTemplateJoinDelayPreset(delaySeconds);

  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="w-full rounded-lg border border-gray-700 bg-[#1f2933] px-2 py-1.5 text-sm text-white"
      aria-label={ariaLabel}
    >
      {showLegacyDelay ? <option value={String(storedDelay)}>فعلی · {storedDelay}</option> : null}
      {TEMPLATE_JOIN_DELAY_PRESETS.map((preset) => (
        <option key={preset.seconds} value={String(preset.seconds)}>
          {formatJoinDelayPresetLabel(preset.seconds, preset.label)}
        </option>
      ))}
    </select>
  );
}

function CapInput({
  value,
  onChange,
  ariaLabel,
}: {
  value: string;
  onChange: (value: string) => void;
  ariaLabel: string;
}) {
  return (
    <input
      type="number"
      min={MIN_TEMPLATE_MAX_DEV_PLAYERS_PER_ROOM}
      max={MAX_TEMPLATE_MAX_DEV_PLAYERS_PER_ROOM}
      placeholder="—"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="numeric-text numeric-text--14 w-full rounded-lg border border-gray-700 bg-[#1f2933] px-2 py-1.5 text-white"
      dir="ltr"
      aria-label={ariaLabel}
    />
  );
}

type DevPlayerProfileEngineTogglesProps = {
  templates: DevPlayerTemplateOption[];
  timezone?: string;
  onJoinSettingsSaved?: () => void;
};

export default function DevPlayerProfileEngineToggles({
  templates,
  timezone = "Asia/Tehran",
  onJoinSettingsSaved,
}: DevPlayerProfileEngineTogglesProps) {
  const [loading, setLoading] = useState(true);
  const [profiles, setProfiles] = useState<DevPlayerProfile[]>([]);
  const [togglingProfileId, setTogglingProfileId] = useState<string | null>(null);
  const [joinDrafts, setJoinDrafts] = useState<Record<string, TemplateJoinDraft>>({});
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
    setJoinDrafts((prev) => {
      const next: Record<string, TemplateJoinDraft> = {};
      for (const template of relevantTemplates) {
        next[template.id] = prev[template.id] ?? templateToDraft(template);
      }
      return next;
    });
  }, [relevantTemplates]);

  const patchDraft = (templateId: string, patch: Partial<TemplateJoinDraft>) => {
    setJoinDrafts((prev) => ({
      ...prev,
      [templateId]: {
        ...(prev[templateId] ?? {
          delay: String(DEFAULT_TEMPLATE_JOIN_DELAY_MAX_SECONDS),
          cap: "",
          windows: [],
        }),
        ...patch,
      },
    }));
  };

  const handleEngineToggle = async (profile: DevPlayerProfile, enabled: boolean) => {
    setTogglingProfileId(profile.id);
    setProfiles((prev) =>
      prev.map((item) => (item.id === profile.id ? { ...item, engineEnabled: enabled } : item))
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

    const payload: Array<{
      template_id: string;
      join_delay_max_seconds: number;
      max_dev_players_per_room: number | null;
      rhythm_windows: Array<{
        start: string;
        end: string;
        join_delay_max_seconds: number;
        max_dev_players_per_room: number | null;
      }>;
    }> = [];

    for (const template of relevantTemplates) {
      const draft = joinDrafts[template.id] ?? templateToDraft(template);
      const storedDelay = Number(
        template.joinDelayMaxSeconds ?? DEFAULT_TEMPLATE_JOIN_DELAY_MAX_SECONDS
      );
      const delay = parseDelayDraft(draft.delay, template.name, storedDelay);
      if (delay === undefined) return;
      const cap = parseCapDraft(draft.cap, template.name);
      if (cap === undefined) return;

      const windows: TemplateRhythmWindow[] = [];
      for (const [index, window] of draft.windows.entries()) {
        if (!TIME_RE.test(window.start) || !TIME_RE.test(window.end) || window.start >= window.end) {
          toast.error(`بازه ${index + 1} برای ${template.name} نامعتبر است`);
          return;
        }
        const windowDelay = parseDelayDraft(
          window.delay,
          `${template.name} (${window.start}–${window.end})`,
          storedDelay
        );
        if (windowDelay === undefined) return;
        const windowCap = parseCapDraft(window.cap, `${template.name} (${window.start}–${window.end})`);
        if (windowCap === undefined) return;
        windows.push({
          start: window.start,
          end: window.end,
          joinDelayMaxSeconds: windowDelay,
          maxDevPlayersPerRoom: windowCap,
        });
      }

      const overlap = findOverlappingRhythmWindows(windows);
      if (overlap) {
        toast.error(
          `بازه‌های ${template.name} روی هم افتاده‌اند: ${overlap[0].start}–${overlap[0].end} و ${overlap[1].start}–${overlap[1].end}`
        );
        return;
      }

      payload.push({
        template_id: template.id,
        join_delay_max_seconds: delay,
        max_dev_players_per_room: cap,
        rhythm_windows: windows.map((window) => ({
          start: window.start,
          end: window.end,
          join_delay_max_seconds: window.joinDelayMaxSeconds,
          max_dev_players_per_room: window.maxDevPlayersPerRoom,
        })),
      });
    }

    setSavingDelays(true);
    try {
      await saveDevPlayerTemplateJoinSettings(payload);
      toast.success("ریتم و سقف روم ذخیره شد");
      onJoinSettingsSaved?.();
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
  const now = new Date();

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
            <p className="text-[11px] text-gray-500">
              سقف خالی یعنی بدون محدودیت. ریتم، حداکثر تأخیر تصادفی join برای همان قالب است.
              بازه زمانی را با timezone انجین می‌سنجد
              {" "}
              <span className="numeric-text numeric-text--11" dir="ltr">
                ({timezone})
              </span>
              ؛ بیرون از بازه‌ها تنظیم پیش‌فرض اعمال می‌شود.
            </p>
            <div className="space-y-2">
              {relevantTemplates.map((template) => {
                const draft = joinDrafts[template.id] ?? templateToDraft(template);
                const storedDelay = Number(
                  template.joinDelayMaxSeconds ?? DEFAULT_TEMPLATE_JOIN_DELAY_MAX_SECONDS
                );

                return (
                  <div
                    key={template.id}
                    className="space-y-2 rounded-lg border border-gray-800 bg-[#151515] px-3 py-2.5"
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
                    <div className="grid grid-cols-[72px_minmax(0,1fr)] gap-2">
                      <label className="space-y-1">
                        <span className="block text-[10px] text-gray-500">سقف پیش‌فرض</span>
                        <CapInput
                          value={draft.cap}
                          onChange={(cap) => patchDraft(template.id, { cap })}
                          ariaLabel={`سقف پیش‌فرض Dev Player در روم ${template.name}`}
                        />
                      </label>
                      <label className="space-y-1">
                        <span className="block text-[10px] text-gray-500">ریتم پیش‌فرض</span>
                        <RhythmSelect
                          value={draft.delay}
                          storedDelay={storedDelay}
                          onChange={(delay) => patchDraft(template.id, { delay })}
                          ariaLabel={`ریتم پیش‌فرض ثبت نام ${template.name}`}
                        />
                      </label>
                    </div>

                    <div className="space-y-2 border-t border-gray-800 pt-2">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-[10px] text-gray-500">بازه‌های زمانی</span>
                        <button
                          type="button"
                          disabled={draft.windows.length >= MAX_TEMPLATE_RHYTHM_WINDOWS}
                          onClick={() => {
                            const suggested = suggestWindow(draft.windows);
                            patchDraft(template.id, {
                              windows: [
                                ...draft.windows,
                                {
                                  start: suggested.start,
                                  end: suggested.end,
                                  delay: draft.delay,
                                  cap: draft.cap,
                                },
                              ],
                            });
                          }}
                          className="text-[11px] text-violet-300 disabled:opacity-40"
                        >
                          + بازه
                        </button>
                      </div>

                      {draft.windows.length === 0 ? (
                        <p className="text-[11px] text-gray-600">
                          بدون بازه، همین ریتم پیش‌فرض تمام‌روز اعمال می‌شود.
                        </p>
                      ) : null}

                      {draft.windows.map((window, index) => {
                        const active = isRhythmWindowActive(window, now, timezone);
                        return (
                          <div
                            key={`${template.id}-window-${index}`}
                            className={`space-y-2 rounded-lg border px-2 py-2 ${
                              active
                                ? "border-violet-700/50 bg-violet-950/20"
                                : "border-gray-800 bg-[#1a1a1a]"
                            }`}
                          >
                            <div className="flex items-center justify-between gap-2">
                              <span className="text-[10px] text-gray-400">
                                {active ? "فعال الان" : `بازه ${index + 1}`}
                              </span>
                              <button
                                type="button"
                                onClick={() =>
                                  patchDraft(template.id, {
                                    windows: draft.windows.filter((_, itemIndex) => itemIndex !== index),
                                  })
                                }
                                className="text-[11px] text-red-300"
                              >
                                حذف
                              </button>
                            </div>
                            <div className="grid grid-cols-2 gap-2">
                              <label className="space-y-1">
                                <span className="block text-[10px] text-gray-500">از ساعت</span>
                                <TimeSelect
                                  value={window.start}
                                  ariaLabel={`${template.name} بازه ${index + 1} شروع`}
                                  onChange={(start) => {
                                    const windows = [...draft.windows];
                                    windows[index] = { ...windows[index], start };
                                    patchDraft(template.id, { windows });
                                  }}
                                />
                              </label>
                              <label className="space-y-1">
                                <span className="block text-[10px] text-gray-500">تا ساعت</span>
                                <TimeSelect
                                  value={window.end}
                                  ariaLabel={`${template.name} بازه ${index + 1} پایان`}
                                  onChange={(end) => {
                                    const windows = [...draft.windows];
                                    windows[index] = { ...windows[index], end };
                                    patchDraft(template.id, { windows });
                                  }}
                                />
                              </label>
                            </div>
                            <div className="grid grid-cols-[72px_minmax(0,1fr)] gap-2">
                              <label className="space-y-1">
                                <span className="block text-[10px] text-gray-500">سقف در روم</span>
                                <CapInput
                                  value={window.cap}
                                  onChange={(cap) => {
                                    const windows = [...draft.windows];
                                    windows[index] = { ...windows[index], cap };
                                    patchDraft(template.id, { windows });
                                  }}
                                  ariaLabel={`سقف بازه ${index + 1} برای ${template.name}`}
                                />
                              </label>
                              <label className="space-y-1">
                                <span className="block text-[10px] text-gray-500">ریتم</span>
                                <RhythmSelect
                                  value={window.delay}
                                  storedDelay={storedDelay}
                                  onChange={(delay) => {
                                    const windows = [...draft.windows];
                                    windows[index] = { ...windows[index], delay };
                                    patchDraft(template.id, { windows });
                                  }}
                                  ariaLabel={`ریتم بازه ${index + 1} برای ${template.name}`}
                                />
                              </label>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
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
