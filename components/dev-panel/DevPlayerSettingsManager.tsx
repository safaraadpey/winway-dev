"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useHeaderVisibility } from "@/lib/contexts/HeaderVisibilityContext";
import DevPlayerProfileEngineToggles from "@/components/dev-panel/DevPlayerProfileEngineToggles";
import DevPlayerProfilesManager from "@/components/dev-panel/DevPlayerProfilesManager";
import {
  loadDevPlayerSettings,
  saveDevPlayerSettings,
  type SaveDevPlayerSettingsPayload,
} from "@/services/dev-panel/dev-player-settings";
import {
  DEFAULT_DEV_PLAYER_SETTINGS,
  DEFAULT_DEV_PLAYER_RUNTIME_STATS,
  DEFAULT_PROCESSOR_TICK_INTERVAL_SECONDS,
  DEFAULT_SCHEDULER_TICK_INTERVAL_SECONDS,
  MAX_PROCESSOR_TICK_INTERVAL_SECONDS,
  MAX_SCHEDULER_TICK_INTERVAL_SECONDS,
  MIN_PROCESSOR_TICK_INTERVAL_SECONDS,
  MIN_SCHEDULER_TICK_INTERVAL_SECONDS,
  MIN_SCHEDULER_PAUSE_SECONDS,
  MAX_SCHEDULER_PAUSE_SECONDS,
  type DevPlayerRuntimeStats,
  type DevPlayerSettings,
  type DevPlayerTemplateOption,
} from "@/src/types/dev-player-settings";
import toast from "react-hot-toast";

type DraftState = {
  systemEnabled: boolean;
  schedulerEnabled: boolean;
  schedulerTickIntervalSeconds: string;
  processorTickIntervalSeconds: string;
  schedulerPauseAfterSeconds: string;
  schedulerPauseDurationSeconds: string;
  timezone: string;
};

function settingsToDraft(settings: DevPlayerSettings): DraftState {
  return {
    systemEnabled: settings.systemEnabled,
    schedulerEnabled: settings.schedulerEnabled,
    schedulerTickIntervalSeconds: String(settings.schedulerTickIntervalSeconds),
    processorTickIntervalSeconds: String(settings.processorTickIntervalSeconds),
    schedulerPauseAfterSeconds:
      settings.schedulerPauseAfterSeconds === null
        ? ""
        : String(settings.schedulerPauseAfterSeconds),
    schedulerPauseDurationSeconds:
      settings.schedulerPauseDurationSeconds === null
        ? ""
        : String(settings.schedulerPauseDurationSeconds),
    timezone: settings.timezone,
  };
}

function draftToPayload(draft: DraftState): SaveDevPlayerSettingsPayload {
  return {
    system_enabled: draft.systemEnabled,
    scheduler_enabled: draft.schedulerEnabled,
    scheduler_tick_interval_seconds:
      Number(draft.schedulerTickIntervalSeconds) ||
      DEFAULT_SCHEDULER_TICK_INTERVAL_SECONDS,
    processor_tick_interval_seconds:
      Number(draft.processorTickIntervalSeconds) ||
      DEFAULT_PROCESSOR_TICK_INTERVAL_SECONDS,
    scheduler_pause_after_seconds: draft.schedulerPauseAfterSeconds.trim()
      ? Number(draft.schedulerPauseAfterSeconds)
      : null,
    scheduler_pause_duration_seconds: draft.schedulerPauseDurationSeconds.trim()
      ? Number(draft.schedulerPauseDurationSeconds)
      : null,
    timezone: draft.timezone.trim() || "Asia/Tehran",
  };
}

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

function DevPlayerRuntimeReport({
  stats,
  systemEnabled,
  schedulerEnabled,
  activePlayerCount,
  refreshing,
  onRefresh,
}: {
  stats: DevPlayerRuntimeStats;
  systemEnabled: boolean;
  schedulerEnabled: boolean;
  activePlayerCount: number;
  refreshing: boolean;
  onRefresh: () => void;
}) {
  const statItems = [
    { label: "روم فعال", value: stats.activeRoomsCount },
    { label: "پلیر آماده", value: stats.idleDevPlayersCount },
    { label: "job در صف", value: stats.pendingSchedulesCount },
  ];

  return (
    <div className="rounded-xl border border-violet-900/40 bg-violet-950/10 px-3 py-3">
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="text-sm font-medium text-violet-100">گزارش Dev Mode</div>
          <p className="mt-1 text-xs text-gray-400">
            {systemEnabled
              ? `${activePlayerCount.toLocaleString("fa-IR")} پلیر با پروفایل`
              : "سیستم خاموش است — آمار زنده به‌روز نمی‌شود."}
          </p>
        </div>
        <button
          type="button"
          onClick={onRefresh}
          disabled={refreshing || !systemEnabled}
          aria-label="بروزرسانی گزارش"
          className="shrink-0 rounded-lg border border-gray-700 px-2 py-1 text-xs text-violet-200 transition hover:bg-gray-800 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {refreshing ? "..." : "↻"}
        </button>
      </div>

      {systemEnabled ? (
        <>
          <div className="mt-3 grid grid-cols-2 gap-2">
            <div className="rounded-lg border border-gray-800 bg-[#151515] px-3 py-2">
              <div className="text-[11px] text-gray-400">روم فعال</div>
              <div className="mt-0.5 text-lg font-semibold text-white">
                <span className="numeric-text numeric-text--18" dir="ltr">
                  {stats.activeRoomsCount.toLocaleString("en-US")}
                </span>
              </div>
            </div>
            <div className="rounded-lg border border-gray-800 bg-[#151515] px-3 py-2">
              <div className="text-[11px] text-gray-400">پلیر مشغول</div>
              <div className="mt-1 space-y-1">
                <div className="flex items-center justify-between gap-2 text-xs text-gray-300">
                  <span>Dev Panel</span>
                  <span className="numeric-text numeric-text--14 font-semibold text-white" dir="ltr">
                    {stats.busyDevPlayersCount.toLocaleString("en-US")}
                  </span>
                </div>
                <div className="flex items-center justify-between gap-2 text-xs text-gray-300">
                  <span>غیر پنل</span>
                  <span className="numeric-text numeric-text--14 font-semibold text-white" dir="ltr">
                    {stats.busyNormalPlayersCount.toLocaleString("en-US")}
                  </span>
                </div>
              </div>
            </div>
            {statItems.slice(1).map((item) => (
              <div
                key={item.label}
                className="rounded-lg border border-gray-800 bg-[#151515] px-3 py-2"
              >
                <div className="text-[11px] text-gray-400">{item.label}</div>
                <div className="mt-0.5 text-lg font-semibold text-white">
                  <span className="numeric-text numeric-text--18" dir="ltr">
                    {item.value.toLocaleString("en-US")}
                  </span>
                </div>
              </div>
            ))}
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px] text-gray-500">
            {schedulerEnabled && stats.schedulerPhase ? (
              <span
                className={`rounded-full px-2 py-0.5 ${
                  stats.schedulerPhase === "work"
                    ? "bg-emerald-900/40 text-emerald-200"
                    : "bg-amber-900/40 text-amber-200"
                }`}
              >
                Scheduler: {stats.schedulerPhase === "work" ? "فعالیت" : "وقفه"}
              </span>
            ) : null}
            <span>
              آخرین بروزرسانی:{" "}
              {new Date(stats.updatedAt).toLocaleTimeString("fa-IR", {
                hour: "2-digit",
                minute: "2-digit",
                second: "2-digit",
              })}
            </span>
          </div>
        </>
      ) : null}
    </div>
  );
}

function ToggleRow({
  label,
  description,
  checked,
  disabled,
  loading,
  onChange,
}: {
  label: string;
  description?: string;
  checked: boolean;
  disabled?: boolean;
  loading?: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <div className="flex items-start justify-between gap-3 rounded-xl border border-gray-800 bg-[#1a1a1a] px-3 py-3">
      <div className="min-w-0 flex-1">
        <div className="text-sm font-medium text-white">{label}</div>
        {description && <div className="mt-1 text-xs text-gray-400">{description}</div>}
      </div>
      <ToggleSwitch
        checked={checked}
        disabled={disabled}
        loading={loading}
        ariaLabel={label}
        onChange={onChange}
      />
    </div>
  );
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
      {expanded ? <div className="space-y-3 border-t border-gray-800 px-3 pb-3 pt-3">{children}</div> : null}
    </div>
  );
}

function SectionCard({
  title,
  children,
  collapsible = false,
  defaultExpanded = false,
  badge,
}: {
  title: string;
  children: React.ReactNode;
  collapsible?: boolean;
  defaultExpanded?: boolean;
  badge?: string;
}) {
  const [expanded, setExpanded] = useState(defaultExpanded);

  if (!collapsible) {
    return (
      <section className="rounded-xl border border-gray-800 bg-[#151515] p-4">
        <h2 className="mb-3 text-sm font-semibold text-violet-200">{title}</h2>
        <div className="space-y-3">{children}</div>
      </section>
    );
  }

  return (
    <section className="rounded-xl border border-gray-800 bg-[#151515] p-4">
      <button
        type="button"
        onClick={() => setExpanded((prev) => !prev)}
        aria-expanded={expanded}
        className="flex w-full items-center justify-between gap-2 text-right"
      >
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <h2 className="text-sm font-semibold text-violet-200">{title}</h2>
          {badge ? (
            <span className="shrink-0 rounded-full bg-violet-900/50 px-2 py-0.5 text-[10px] text-violet-200">
              {badge}
            </span>
          ) : null}
        </div>
        <span
          className={`shrink-0 text-xs text-gray-400 transition-transform ${expanded ? "rotate-180" : ""}`}
        >
          ▼
        </span>
      </button>
      {expanded ? <div className="mt-3 space-y-3">{children}</div> : null}
    </section>
  );
}

export default function DevPlayerSettingsManager() {
  const router = useRouter();
  const { setShowHeader, setShowBackButton, setOnBackClick } = useHeaderVisibility();
  const [loading, setLoading] = useState(true);
  const [savingToggle, setSavingToggle] = useState<"system" | "scheduler" | null>(null);
  const [draft, setDraft] = useState<DraftState>(settingsToDraft(DEFAULT_DEV_PLAYER_SETTINGS));
  const [activePlayerCount, setActivePlayerCount] = useState(0);
  const [runtimeStats, setRuntimeStats] = useState<DevPlayerRuntimeStats>(
    DEFAULT_DEV_PLAYER_RUNTIME_STATS
  );
  const [refreshingRuntime, setRefreshingRuntime] = useState(false);
  const [templates, setTemplates] = useState<DevPlayerTemplateOption[]>([]);

  useEffect(() => {
    setShowHeader(true);
    setShowBackButton(true);
    setOnBackClick(() => () => router.push("/dev-panel/dashboard"));

    return () => {
      setShowBackButton(false);
      setOnBackClick(null);
    };
  }, [router, setShowHeader, setShowBackButton, setOnBackClick]);

  const applySettingsResult = useCallback((result: Awaited<ReturnType<typeof loadDevPlayerSettings>>) => {
    setDraft(settingsToDraft(result.settings));
    setActivePlayerCount(result.activePlayerCount);
    setRuntimeStats(result.runtimeStats ?? DEFAULT_DEV_PLAYER_RUNTIME_STATS);
    setTemplates(result.templates ?? []);
  }, []);

  const fetchSettings = useCallback(async () => {
    try {
      setLoading(true);
      const result = await loadDevPlayerSettings();
      applySettingsResult(result);
    } catch (error) {
      console.error("loadDevPlayerSettings error:", error);
      toast.error("خطا در بارگذاری تنظیمات");
    } finally {
      setLoading(false);
    }
  }, [applySettingsResult]);

  const refreshRuntimeStats = useCallback(async (options?: { showSpinner?: boolean }) => {
    try {
      if (options?.showSpinner) {
        setRefreshingRuntime(true);
      }
      const result = await loadDevPlayerSettings();
      setRuntimeStats(result.runtimeStats ?? DEFAULT_DEV_PLAYER_RUNTIME_STATS);
      setActivePlayerCount(result.activePlayerCount);
    } catch (error) {
      console.error("refreshRuntimeStats error:", error);
      if (options?.showSpinner) {
        toast.error("خطا در بروزرسانی گزارش");
      }
    } finally {
      if (options?.showSpinner) {
        setRefreshingRuntime(false);
      }
    }
  }, []);

  useEffect(() => {
    fetchSettings();
  }, [fetchSettings]);

  useEffect(() => {
    if (!draft.systemEnabled) return;

    const intervalId = window.setInterval(() => {
      void refreshRuntimeStats();
    }, 15000);

    return () => window.clearInterval(intervalId);
  }, [draft.systemEnabled, refreshRuntimeStats]);

  const refreshRuntimeReport = () => refreshRuntimeStats({ showSpinner: true });

  const patchDraft = (patch: Partial<DraftState>) => {
    setDraft((prev) => ({ ...prev, ...patch }));
  };

  const persistSettings = async (
    nextDraft: DraftState,
    options: { successMessage?: string; toggle: "system" | "scheduler" }
  ) => {
    setSavingToggle(options.toggle);

    try {
      const result = await saveDevPlayerSettings(draftToPayload(nextDraft));
      applySettingsResult(result);
      if (options.successMessage) {
        toast.success(options.successMessage);
      }
      return true;
    } catch (error: any) {
      console.error("saveDevPlayerSettings error:", error);
      toast.error(error?.message || "خطا در ذخیره تنظیمات");
      return false;
    } finally {
      setSavingToggle(null);
    }
  };

  const handleSystemEnabledChange = async (value: boolean) => {
    const previous = draft.systemEnabled;
    const nextDraft = { ...draft, systemEnabled: value };
    patchDraft({ systemEnabled: value });

    const ok = await persistSettings(nextDraft, {
      toggle: "system",
      successMessage: value
        ? "سیستم Dev Player فعال شد و تنظیمات tick، وقفه و timezone اعمال شد"
        : "سیستم Dev Player خاموش شد",
    });
    if (!ok) {
      patchDraft({ systemEnabled: previous });
    }
  };

  const handleSchedulerEnabledChange = async (value: boolean) => {
    const previous = draft.schedulerEnabled;
    const nextDraft = { ...draft, schedulerEnabled: value };
    patchDraft({ schedulerEnabled: value });

    const ok = await persistSettings(nextDraft, {
      toggle: "scheduler",
      successMessage: value ? "Scheduler فعال شد" : "Scheduler خاموش شد",
    });
    if (!ok) {
      patchDraft({ schedulerEnabled: previous });
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#0E0E0F]">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-gray-300 border-r-transparent" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0E0E0F] p-4 pb-4">
      <div className="mx-auto max-w-2xl space-y-4">
        <SectionCard title="کنترل سیستم">
          <ToggleRow
            label="فعال‌سازی سیستم Dev Player"
            checked={draft.systemEnabled}
            loading={savingToggle === "system"}
            onChange={handleSystemEnabledChange}
          />
          <DevPlayerRuntimeReport
            stats={runtimeStats}
            systemEnabled={draft.systemEnabled}
            schedulerEnabled={draft.schedulerEnabled}
            activePlayerCount={activePlayerCount}
            refreshing={refreshingRuntime}
            onRefresh={refreshRuntimeReport}
          />
          <CollapsibleGroup title="زمانبندی انجین">
            <ToggleRow
              label="فعال‌سازی Scheduler"
              description="ساخت خودکار dev_room_schedules از پروفایل‌های engine-enabled و اعضای آن‌ها."
              checked={draft.schedulerEnabled}
              loading={savingToggle === "scheduler"}
              onChange={handleSchedulerEnabledChange}
            />
            <label className="block space-y-1">
              <span className="text-xs text-gray-400">فاصله tick اسکدولر (ثانیه)</span>
              <input
                type="number"
                min={MIN_SCHEDULER_TICK_INTERVAL_SECONDS}
                max={MAX_SCHEDULER_TICK_INTERVAL_SECONDS}
                disabled={draft.systemEnabled}
                value={draft.schedulerTickIntervalSeconds}
                onChange={(e) => patchDraft({ schedulerTickIntervalSeconds: e.target.value })}
                className="w-full rounded-lg border border-gray-700 bg-[#1f2933] px-3 py-2 text-sm text-white disabled:opacity-50"
              />
              <p className="text-[11px] text-gray-500">
                game-engine هر این‌قدر ثانیه یک‌بار پروفایل‌های فعال را بررسی و schedule می‌سازد (
                {MIN_SCHEDULER_TICK_INTERVAL_SECONDS} تا {MAX_SCHEDULER_TICK_INTERVAL_SECONDS}).
              </p>
            </label>
            <label className="block space-y-1">
              <span className="text-xs text-gray-400">فاصله tick پردازشگر (ثانیه)</span>
              <input
                type="number"
                min={MIN_PROCESSOR_TICK_INTERVAL_SECONDS}
                max={MAX_PROCESSOR_TICK_INTERVAL_SECONDS}
                disabled={draft.systemEnabled}
                value={draft.processorTickIntervalSeconds}
                onChange={(e) => patchDraft({ processorTickIntervalSeconds: e.target.value })}
                className="w-full rounded-lg border border-gray-700 bg-[#1f2933] px-3 py-2 text-sm text-white disabled:opacity-50"
              />
              <p className="text-[11px] text-gray-500">
                هر این‌قدر ثانیه jobهای approved اجرا می‌شوند؛ jobهای processing گیرکرده
                (بیش از ۱۲۰ث) دوباره به صف برمی‌گردند (
                {MIN_PROCESSOR_TICK_INTERVAL_SECONDS} تا {MAX_PROCESSOR_TICK_INTERVAL_SECONDS}).
              </p>
            </label>
            <div className="grid grid-cols-2 gap-3">
              <label className="block space-y-1">
                <span className="text-xs text-gray-400">شروع وقفه (ثانیه)</span>
                <input
                  type="number"
                  min={MIN_SCHEDULER_PAUSE_SECONDS}
                  max={MAX_SCHEDULER_PAUSE_SECONDS}
                  disabled={draft.systemEnabled}
                  value={draft.schedulerPauseAfterSeconds}
                  onChange={(e) => patchDraft({ schedulerPauseAfterSeconds: e.target.value })}
                  placeholder="—"
                  className="w-full rounded-lg border border-gray-700 bg-[#1f2933] px-3 py-2 text-sm text-white disabled:opacity-50"
                />
                <p className="text-[11px] text-gray-500">
                  سقف تصادفی فاز فعالیت (هر چرخه بین ۵۰ تا این مقدار).
                </p>
              </label>
              <label className="block space-y-1">
                <span className="text-xs text-gray-400">طول وقفه (ثانیه)</span>
                <input
                  type="number"
                  min={MIN_SCHEDULER_PAUSE_SECONDS}
                  max={MAX_SCHEDULER_PAUSE_SECONDS}
                  disabled={draft.systemEnabled}
                  value={draft.schedulerPauseDurationSeconds}
                  onChange={(e) => patchDraft({ schedulerPauseDurationSeconds: e.target.value })}
                  placeholder="—"
                  className="w-full rounded-lg border border-gray-700 bg-[#1f2933] px-3 py-2 text-sm text-white disabled:opacity-50"
                />
                <p className="text-[11px] text-gray-500">
                  سقف تصادفی وقفه (۵۰ تا این مقدار)؛ هر دو فیلد را پر کنید یا خالی بگذارید.
                </p>
              </label>
            </div>
            <label className="block space-y-1">
              <span className="text-xs text-gray-400">منطقه زمانی</span>
              <input
                value={draft.timezone}
                disabled={draft.systemEnabled}
                onChange={(e) => patchDraft({ timezone: e.target.value })}
                className="w-full rounded-lg border border-gray-700 bg-[#1f2933] px-3 py-2 text-sm text-white"
              />
            </label>
          </CollapsibleGroup>
        </SectionCard>

        <SectionCard title="رفتار Join">
          <DevPlayerProfileEngineToggles
            templates={templates}
            onJoinSettingsSaved={() => {
              void loadDevPlayerSettings()
                .then(applySettingsResult)
                .catch((error) => {
                  console.error("reload settings after join save:", error);
                });
            }}
          />
        </SectionCard>

        <SectionCard title="تنظیم پروفایل" collapsible>
          <DevPlayerProfilesManager templates={templates} />
        </SectionCard>
      </div>
    </div>
  );
}
