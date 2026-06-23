"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useHeaderVisibility } from "@/lib/contexts/HeaderVisibilityContext";
import {
  loadDevPlayerSettings,
  saveDevPlayerJoinPreset,
  saveDevPlayerSettings,
  type SaveDevPlayerJoinPresetPayload,
  type SaveDevPlayerSettingsPayload,
} from "@/services/dev-panel/dev-player-settings";
import type { DevPlayWindow } from "@/src/types/dev-players";
import {
  DEFAULT_DEV_PLAYER_SETTINGS,
  DEFAULT_DEV_PLAYER_RUNTIME_STATS,
  DEFAULT_JOIN_PRESET_PLAY_WINDOWS,
  DEFAULT_PROCESSOR_TICK_INTERVAL_SECONDS,
  DEFAULT_SCHEDULER_TICK_INTERVAL_SECONDS,
  MAX_PROCESSOR_TICK_INTERVAL_SECONDS,
  MAX_SCHEDULER_TICK_INTERVAL_SECONDS,
  MIN_PROCESSOR_TICK_INTERVAL_SECONDS,
  MIN_SCHEDULER_TICK_INTERVAL_SECONDS,
  MIN_SCHEDULER_PAUSE_SECONDS,
  MAX_SCHEDULER_PAUSE_SECONDS,
  DEFAULT_TEMPLATE_JOIN_INTERVAL_SECONDS,
  DEFAULT_TEMPLATE_MAX_JOINS_PER_TICK,
  type DevPlayerActiveRow,
  type DevPlayerJoinPreset,
  type DevPlayerRuntimeStats,
  type DevPlayerSettings,
  type DevPlayerTemplateOption,
} from "@/src/types/dev-player-settings";
import toast from "react-hot-toast";

const NEW_JOIN_PRESET_VALUE = "__new__";

type DraftState = {
  systemEnabled: boolean;
  schedulerEnabled: boolean;
  schedulerTickIntervalSeconds: string;
  processorTickIntervalSeconds: string;
  schedulerPauseAfterSeconds: string;
  schedulerPauseDurationSeconds: string;
  timezone: string;
};

type JoinPresetDraft = {
  presetId: string | null;
  selectedKey: string;
  name: string;
  playWindows: DevPlayWindow[];
  templateRoomLimits: Record<string, TemplateLimitDraft>;
  templateRoomLimitEnabledIds: string[];
  minWalletBalance: string;
  excludeVip: boolean;
  excludeTournament: boolean;
  autoApproveSchedules: boolean;
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

function draftToPayload(
  draft: DraftState,
  activeJoinPresetId?: string | null
): SaveDevPlayerSettingsPayload {
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
    active_join_preset_id: activeJoinPresetId,
  };
}

function joinDraftToPayload(
  joinDraft: JoinPresetDraft,
  configurableTemplateIds: Set<string>
): SaveDevPlayerJoinPresetPayload {
  const enabledTemplateIds = joinDraft.templateRoomLimitEnabledIds.filter((templateId) =>
    configurableTemplateIds.has(templateId)
  );

  return {
    id: joinDraft.presetId ?? undefined,
    name: joinDraft.name.trim(),
    template_room_limits: enabledTemplateIds.map((template_id) => {
      const limits = joinDraft.templateRoomLimits[template_id] ?? emptyTemplateLimitDraft();
      return {
        template_id,
        min_active_rooms: limits.min ? Number(limits.min) : null,
        max_active_rooms: limits.max ? Number(limits.max) : null,
        join_interval_seconds:
          Number(limits.joinIntervalSeconds) || DEFAULT_TEMPLATE_JOIN_INTERVAL_SECONDS,
        max_joins_per_tick:
          Number(limits.maxJoinsPerTick) || DEFAULT_TEMPLATE_MAX_JOINS_PER_TICK,
        min_normal_players_per_room:
          limits.minNormalPlayersPerRoom.trim() !== ""
            ? Number(limits.minNormalPlayersPerRoom)
            : null,
        max_dev_players_per_room:
          limits.maxDevPlayersPerRoom.trim() !== ""
            ? Number(limits.maxDevPlayersPerRoom)
            : null,
        quick_fill_enabled: limits.quickFillEnabled,
      };
    }),
    template_room_limit_enabled_ids: enabledTemplateIds,
    play_windows: joinDraft.playWindows,
    min_wallet_balance: Number(joinDraft.minWalletBalance) || 0,
    exclude_vip: joinDraft.excludeVip,
    exclude_tournament: joinDraft.excludeTournament,
    auto_approve_schedules: joinDraft.autoApproveSchedules,
    set_active: true,
  };
}

type TemplateLimitDraft = {
  min: string;
  max: string;
  joinIntervalSeconds: string;
  maxJoinsPerTick: string;
  minNormalPlayersPerRoom: string;
  maxDevPlayersPerRoom: string;
  quickFillEnabled: boolean;
};

function emptyTemplateLimitDraft(): TemplateLimitDraft {
  return {
    min: "",
    max: "",
    joinIntervalSeconds: String(DEFAULT_TEMPLATE_JOIN_INTERVAL_SECONDS),
    maxJoinsPerTick: String(DEFAULT_TEMPLATE_MAX_JOINS_PER_TICK),
    minNormalPlayersPerRoom: "",
    maxDevPlayersPerRoom: "",
    quickFillEnabled: false,
  };
}

function buildEmptyTemplateRoomLimits(
  templates: DevPlayerTemplateOption[]
): Record<string, TemplateLimitDraft> {
  const limits: Record<string, TemplateLimitDraft> = {};
  for (const template of templates) {
    limits[template.id] = emptyTemplateLimitDraft();
  }
  return limits;
}

function buildTemplateRoomLimitsFromPreset(
  preset: DevPlayerJoinPreset,
  templates: DevPlayerTemplateOption[]
): Record<string, TemplateLimitDraft> {
  const limits = buildEmptyTemplateRoomLimits(templates);
  const limitsByTemplateId = new Map(
    preset.templateLimits.map((limit) => [limit.templateId, limit])
  );

  for (const template of templates) {
    const limit = limitsByTemplateId.get(template.id);
    if (!limit) continue;
    limits[template.id] = {
      min: limit.minActiveRooms === null ? "" : String(limit.minActiveRooms),
      max: limit.maxActiveRooms === null ? "" : String(limit.maxActiveRooms),
      joinIntervalSeconds:
        limit.joinIntervalSeconds === null
          ? String(DEFAULT_TEMPLATE_JOIN_INTERVAL_SECONDS)
          : String(limit.joinIntervalSeconds),
      maxJoinsPerTick:
        limit.maxJoinsPerTick === null
          ? String(DEFAULT_TEMPLATE_MAX_JOINS_PER_TICK)
          : String(limit.maxJoinsPerTick),
      minNormalPlayersPerRoom:
        limit.minNormalPlayersPerRoom === null
          ? ""
          : String(limit.minNormalPlayersPerRoom),
      maxDevPlayersPerRoom:
        limit.maxDevPlayersPerRoom === null ? "" : String(limit.maxDevPlayersPerRoom),
      quickFillEnabled: limit.quickFillEnabled,
    };
  }

  return limits;
}

function emptyJoinPresetDraft(templates: DevPlayerTemplateOption[] = []): JoinPresetDraft {
  return {
    presetId: null,
    selectedKey: NEW_JOIN_PRESET_VALUE,
    name: "",
    playWindows: [...DEFAULT_JOIN_PRESET_PLAY_WINDOWS],
    templateRoomLimits: buildEmptyTemplateRoomLimits(templates),
    templateRoomLimitEnabledIds: [],
    minWalletBalance: "0",
    excludeVip: true,
    excludeTournament: true,
    autoApproveSchedules: true,
  };
}

function joinPresetToDraft(
  preset: DevPlayerJoinPreset,
  templates: DevPlayerTemplateOption[]
): JoinPresetDraft {
  return {
    presetId: preset.id,
    selectedKey: preset.id,
    name: preset.name,
    playWindows:
      preset.playWindows.length > 0
        ? preset.playWindows.map((window) => ({ ...window }))
        : [...DEFAULT_JOIN_PRESET_PLAY_WINDOWS],
    templateRoomLimits: buildTemplateRoomLimitsFromPreset(preset, templates),
    templateRoomLimitEnabledIds: preset.templateRoomLimitEnabledIds.filter((id) =>
      templates.some((template) => template.id === id && isJoinConfigurableTemplate(template))
    ),
    minWalletBalance: String(preset.minWalletBalance),
    excludeVip: preset.excludeVip,
    excludeTournament: preset.excludeTournament,
    autoApproveSchedules: preset.autoApproveSchedules,
  };
}

function formatPriceRange(min: number | null, max: number | null): string {
  if (min === null && max === null) return "بدون محدودیت";
  if (min !== null && max !== null) return `${min} – ${max}`;
  if (min !== null) return `از ${min}`;
  return `تا ${max}`;
}

function isJoinConfigurableTemplate(template: DevPlayerTemplateOption): boolean {
  return template.roomType !== "tournament";
}

function isTemplateLimitCustomized(limits: TemplateLimitDraft): boolean {
  if (limits.min.trim() !== "" || limits.max.trim() !== "") return true;

  const joinInterval = limits.joinIntervalSeconds.trim();
  if (
    joinInterval !== "" &&
    Number(joinInterval) !== DEFAULT_TEMPLATE_JOIN_INTERVAL_SECONDS
  ) {
    return true;
  }

  const maxJoins = limits.maxJoinsPerTick.trim();
  if (maxJoins !== "" && Number(maxJoins) !== DEFAULT_TEMPLATE_MAX_JOINS_PER_TICK) {
    return true;
  }

  if (limits.minNormalPlayersPerRoom.trim() !== "" || limits.maxDevPlayersPerRoom.trim() !== "") {
    return true;
  }

  if (limits.quickFillEnabled) {
    return true;
  }

  return false;
}

function TemplateBadges({ template }: { template: DevPlayerTemplateOption }) {
  return (
    <>
      {template.vip && (
        <span className="rounded-full bg-amber-900/40 px-1.5 py-0.5 text-amber-200">
          VIP
        </span>
      )}
      {template.roomType === "tournament" && (
        <span className="rounded-full bg-blue-900/40 px-1.5 py-0.5 text-blue-200">
          تورنومنت
        </span>
      )}
      {template.status === "draining" && (
        <span className="rounded-full bg-gray-800 px-1.5 py-0.5 text-gray-300">
          draining
        </span>
      )}
    </>
  );
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
    { label: "پلیر مشغول", value: stats.busyDevPlayersCount },
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
              ? `${activePlayerCount.toLocaleString("fa-IR")} پلیر فعال در config`
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
            {statItems.map((item) => (
              <div
                key={item.label}
                className="rounded-lg border border-gray-800 bg-[#151515] px-3 py-2"
              >
                <div className="text-[11px] text-gray-400">{item.label}</div>
                <div className="mt-0.5 text-lg font-semibold text-white">
                  {item.value.toLocaleString("fa-IR")}
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

function PlayWindowsEditor({
  label,
  windows,
  fallbackWindows,
  onChange,
}: {
  label: string;
  windows: DevPlayWindow[];
  fallbackWindows: DevPlayWindow[];
  onChange: (windows: DevPlayWindow[]) => void;
}) {
  return (
    <div className="space-y-2 rounded-xl border border-gray-800 bg-[#151515] p-3">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs text-gray-400">{label}</span>
        <button
          type="button"
          onClick={() => onChange([...windows, { start: "10:00", end: "12:00" }])}
          className="text-xs text-violet-300"
        >
          + بازه جدید
        </button>
      </div>
      <div className="space-y-2">
        {windows.map((window, index) => (
          <div key={`play-window-${index}`} className="grid grid-cols-[1fr_1fr_auto] gap-2">
            <input
              type="time"
              value={window.start}
              onChange={(e) => {
                const next = [...windows];
                next[index] = { ...next[index], start: e.target.value };
                onChange(next);
              }}
              className="rounded-lg border border-gray-700 bg-[#1f2933] px-2 py-2 text-sm text-white"
            />
            <input
              type="time"
              value={window.end}
              onChange={(e) => {
                const next = [...windows];
                next[index] = { ...next[index], end: e.target.value };
                onChange(next);
              }}
              className="rounded-lg border border-gray-700 bg-[#1f2933] px-2 py-2 text-sm text-white"
            />
            <button
              type="button"
              onClick={() => {
                const next = windows.filter((_, i) => i !== index);
                onChange(next.length > 0 ? next : [...fallbackWindows]);
              }}
              className="rounded-lg border border-red-900/60 px-2 text-red-300"
            >
              حذف
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

function PriceRangeFields({
  minLabel,
  maxLabel,
  minValue,
  maxValue,
  onMinChange,
  onMaxChange,
  minPlaceholder = "بدون محدودیت",
  maxPlaceholder = "بدون محدودیت",
}: {
  minLabel: string;
  maxLabel: string;
  minValue: string;
  maxValue: string;
  onMinChange: (value: string) => void;
  onMaxChange: (value: string) => void;
  minPlaceholder?: string;
  maxPlaceholder?: string;
}) {
  return (
    <div className="grid grid-cols-2 gap-3">
      <label className="space-y-1">
        <span className="text-xs text-gray-400">{minLabel}</span>
        <input
          type="number"
          min={0}
          value={minValue}
          onChange={(e) => onMinChange(e.target.value)}
          placeholder={minPlaceholder}
          className="w-full rounded-lg border border-gray-700 bg-[#1f2933] px-3 py-2 text-sm text-white"
        />
      </label>
      <label className="space-y-1">
        <span className="text-xs text-gray-400">{maxLabel}</span>
        <input
          type="number"
          min={0}
          value={maxValue}
          onChange={(e) => onMaxChange(e.target.value)}
          placeholder={maxPlaceholder}
          className="w-full rounded-lg border border-gray-700 bg-[#1f2933] px-3 py-2 text-sm text-white"
        />
      </label>
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

function ActivePlayersTable({
  players,
  onManageUsers,
}: {
  players: DevPlayerActiveRow[];
  onManageUsers: () => void;
}) {
  if (players.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-gray-700 bg-[#1a1a1a] p-4 text-center text-sm text-gray-400">
        هنوز Dev Player فعالی ندارید.{" "}
        <button type="button" onClick={onManageUsers} className="text-violet-300 underline">
          از منوی کاربران فعال کنید
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {players.map((player) => (
        <div
          key={player.userId}
          className="rounded-xl border border-gray-800 bg-[#1a1a1a] px-3 py-3"
        >
          <div className="flex items-center justify-between gap-2">
            <div className="min-w-0">
              <div className="truncate text-sm text-white">{player.displayName}</div>
              <div className="truncate text-xs text-gray-400">{player.username}</div>
            </div>
            <span className="shrink-0 rounded-full bg-violet-900/60 px-2 py-0.5 text-[10px] text-violet-200">
              فعال
            </span>
          </div>
          <div className="mt-2 grid grid-cols-2 gap-2 text-[11px] text-gray-400">
            <span>قیمت: {formatPriceRange(player.minRoomPrice, player.maxRoomPrice)}</span>
            <span>حداکثر کارت: {player.maxTicketCount}</span>
            <span className="col-span-2">
              بازه‌ها:{" "}
              {player.playWindows.length > 0
                ? player.playWindows.map((w) => `${w.start}-${w.end}`).join(" · ")
                : "پیش‌فرض"}
            </span>
          </div>
        </div>
      ))}
      <button
        type="button"
        onClick={onManageUsers}
        className="w-full rounded-xl border border-gray-700 py-2 text-sm text-violet-300"
      >
        مدیریت در منوی کاربران
      </button>
    </div>
  );
}

export default function DevPlayerSettingsManager() {
  const router = useRouter();
  const { setShowHeader, setShowBackButton, setOnBackClick } = useHeaderVisibility();
  const [loading, setLoading] = useState(true);
  const [savingToggle, setSavingToggle] = useState<"system" | "scheduler" | null>(null);
  const [savingJoinPreset, setSavingJoinPreset] = useState(false);
  const [draft, setDraft] = useState<DraftState>(settingsToDraft(DEFAULT_DEV_PLAYER_SETTINGS));
  const [joinDraft, setJoinDraft] = useState<JoinPresetDraft>(emptyJoinPresetDraft());
  const [joinPresets, setJoinPresets] = useState<DevPlayerJoinPreset[]>([]);
  const [activeJoinPresetId, setActiveJoinPresetId] = useState<string | null>(null);
  const [activePlayers, setActivePlayers] = useState<DevPlayerActiveRow[]>([]);
  const [activePlayerCount, setActivePlayerCount] = useState(0);
  const [runtimeStats, setRuntimeStats] = useState<DevPlayerRuntimeStats>(
    DEFAULT_DEV_PLAYER_RUNTIME_STATS
  );
  const [refreshingRuntime, setRefreshingRuntime] = useState(false);
  const [templates, setTemplates] = useState<DevPlayerTemplateOption[]>([]);
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);
  const [expandedTemplateLimitId, setExpandedTemplateLimitId] = useState<string | null>(null);

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
    const loadedTemplates = result.templates ?? [];
    const loadedPresets = result.joinPresets ?? [];
    const activeId = result.settings.activeJoinPresetId;
    const activePreset =
      loadedPresets.find((preset) => preset.id === activeId) ?? loadedPresets[0] ?? null;

    setDraft(settingsToDraft(result.settings));
    setJoinPresets(loadedPresets);
    setActiveJoinPresetId(activeId);
    setJoinDraft(
      activePreset
        ? joinPresetToDraft(activePreset, loadedTemplates)
        : emptyJoinPresetDraft(loadedTemplates)
    );
    setActivePlayers(result.activePlayers);
    setActivePlayerCount(result.activePlayerCount);
    setRuntimeStats(result.runtimeStats ?? DEFAULT_DEV_PLAYER_RUNTIME_STATS);
    setTemplates(loadedTemplates);
    setUpdatedAt(result.settings.updatedAt);
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
      setActivePlayers(result.activePlayers);
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

  const patchJoinDraft = (patch: Partial<JoinPresetDraft>) => {
    setJoinDraft((prev) => ({ ...prev, ...patch }));
  };

  const handleSelectJoinPreset = async (selectedKey: string) => {
    if (selectedKey === NEW_JOIN_PRESET_VALUE) {
      setJoinDraft(emptyJoinPresetDraft(templates));
      setExpandedTemplateLimitId(null);
      return;
    }

    const preset = joinPresets.find((item) => item.id === selectedKey);
    if (!preset) return;

    setJoinDraft(joinPresetToDraft(preset, templates));
    setExpandedTemplateLimitId(null);

    if (activeJoinPresetId === preset.id) return;

    try {
      const result = await saveDevPlayerSettings(
        draftToPayload(draft, preset.id)
      );
      applySettingsResult(result);
    } catch (error: any) {
      console.error("set active join preset error:", error);
      toast.error(error?.message || "خطا در انتخاب پیش‌تنظیم");
    }
  };

  const toggleTemplateRoomLimitEnabled = (templateId: string, enabled: boolean) => {
    setJoinDraft((prev) => {
      const selected = new Set(prev.templateRoomLimitEnabledIds);
      const nextLimits = { ...prev.templateRoomLimits };
      if (enabled) {
        selected.add(templateId);
        if (!nextLimits[templateId]) {
          nextLimits[templateId] = emptyTemplateLimitDraft();
        }
      } else {
        selected.delete(templateId);
      }
      return {
        ...prev,
        templateRoomLimitEnabledIds: Array.from(selected),
        templateRoomLimits: nextLimits,
      };
    });
  };

  const joinConfigurableTemplates = templates.filter(isJoinConfigurableTemplate);
  const joinConfigurableTemplateIds = new Set(joinConfigurableTemplates.map((t) => t.id));

  const enabledTemplateLimitsCount = joinDraft.templateRoomLimitEnabledIds.filter((id) =>
    joinConfigurableTemplateIds.has(id)
  ).length;
  const configuredTemplateLimitsCount = joinConfigurableTemplates.filter((template) => {
    const limits = joinDraft.templateRoomLimits[template.id] ?? emptyTemplateLimitDraft();
    return isTemplateLimitCustomized(limits);
  }).length;

  const updateTemplateRoomLimit = (
    templateId: string,
    field: keyof TemplateLimitDraft,
    value: string | boolean
  ) => {
    setJoinDraft((prev) => ({
      ...prev,
      templateRoomLimits: {
        ...prev.templateRoomLimits,
        [templateId]: {
          ...(prev.templateRoomLimits[templateId] ?? emptyTemplateLimitDraft()),
          [field]: value,
        },
      },
    }));
  };

  const handleSaveJoinPreset = async () => {
    if (!joinDraft.name.trim()) {
      toast.error("نام پیش‌تنظیم را وارد کنید");
      return;
    }

    setSavingJoinPreset(true);
    try {
      await saveDevPlayerJoinPreset(
        joinDraftToPayload(joinDraft, joinConfigurableTemplateIds)
      );
      const result = await loadDevPlayerSettings();
      applySettingsResult(result);
      toast.success("پیش‌تنظیم Join ذخیره شد");
    } catch (error: any) {
      console.error("saveDevPlayerJoinPreset error:", error);
      toast.error(error?.message || "خطا در ذخیره پیش‌تنظیم");
    } finally {
      setSavingJoinPreset(false);
    }
  };

  const persistSettings = async (
    nextDraft: DraftState,
    options: { successMessage?: string; toggle: "system" | "scheduler" }
  ) => {
    setSavingToggle(options.toggle);

    try {
      const result = await saveDevPlayerSettings(
        draftToPayload(nextDraft, activeJoinPresetId)
      );
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
        <div>
          <h1 className="text-xl font-bold text-white">تنظیمات Dev Player</h1>
          <p className="mt-1 text-sm text-gray-400">
            کنترل سیستم و رفتار join — {activePlayerCount} پلیر فعال
          </p>
          {updatedAt && (
            <p className="mt-1 text-xs text-gray-500">
              آخرین بروزرسانی: {new Date(updatedAt).toLocaleString("fa-IR")}
            </p>
          )}
        </div>

        <SectionCard title="کنترل سیستم">
          <ToggleRow
            label="فعال‌سازی سیستم Dev Player"
            description="وقتی خاموش است، هیچ join خودکاری انجام نمی‌شود. tick، وقفه و timezone با روشن کردن ذخیره و اعمال می‌شوند."
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
          <ToggleRow
            label="فعال‌سازی Scheduler"
            description="ساخت خودکار dev_room_schedules از preset فعال و config بازیکنان."
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
              game-engine هر این‌قدر ثانیه یک‌بار preset را بررسی و schedule می‌سازد (
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
        </SectionCard>

        <SectionCard title="رفتار Join">
          <label className="block space-y-1">
            <span className="text-xs text-gray-400">نام پیش‌تنظیم</span>
            <input
              value={joinDraft.name}
              onChange={(e) => patchJoinDraft({ name: e.target.value })}
              placeholder="مثلاً: شب‌های آخر هفته"
              className="w-full rounded-lg border border-gray-700 bg-[#1f2933] px-3 py-2 text-sm text-white"
            />
          </label>

          <label className="block space-y-1">
            <span className="text-xs text-gray-400">انتخاب پیش‌تنظیم</span>
            <select
              value={joinDraft.selectedKey}
              onChange={(e) => handleSelectJoinPreset(e.target.value)}
              className="w-full rounded-lg border border-gray-700 bg-[#1f2933] px-3 py-2 text-sm text-white"
            >
              <option value={NEW_JOIN_PRESET_VALUE}>+ پیش‌تنظیم جدید</option>
              {joinPresets.map((preset) => (
                <option key={preset.id} value={preset.id}>
                  {preset.name}
                  {preset.id === activeJoinPresetId ? " (فعال)" : ""}
                </option>
              ))}
            </select>
          </label>

          <PlayWindowsEditor
            label="بازه‌های زمانی عملکرد"
            windows={joinDraft.playWindows}
            fallbackWindows={DEFAULT_JOIN_PRESET_PLAY_WINDOWS}
            onChange={(playWindows) => patchJoinDraft({ playWindows })}
          />

          <div className="space-y-2 rounded-xl border border-gray-800 bg-[#1a1a1a] p-3">
            <div className="flex items-center justify-between gap-2">
              <div>
                <div className="text-sm font-medium text-white">تنظیمات هر template</div>
                <p className="mt-1 text-xs text-gray-400">
                  برای هر template: میز فعال، پلیر عادی/dev در میز، فاصله join و حداکثر join
                  در هر tick.
                </p>
              </div>
              <span className="shrink-0 text-[11px] text-violet-300">
                {enabledTemplateLimitsCount} فعال · {configuredTemplateLimitsCount} تنظیم‌شده
              </span>
            </div>

            {joinConfigurableTemplates.length === 0 ? (
              <div className="rounded-xl border border-dashed border-gray-700 bg-[#151515] p-4 text-center text-sm text-gray-400">
                template فعالی برای نمایش نیست
              </div>
            ) : (
              <div className="space-y-1 rounded-xl border border-gray-800 bg-[#151515] p-1">
                {joinConfigurableTemplates.map((template) => {
                  const limits =
                    joinDraft.templateRoomLimits[template.id] ?? emptyTemplateLimitDraft();
                  const isEnabled = joinDraft.templateRoomLimitEnabledIds.includes(template.id);
                  const isCustomized = isTemplateLimitCustomized(limits);
                  const isExpanded = expandedTemplateLimitId === template.id;

                  return (
                    <div
                      key={`room-limit-${template.id}`}
                      className={`overflow-hidden rounded-lg border ${
                        isCustomized
                          ? "border-violet-700/40 bg-violet-950/10"
                          : "border-transparent bg-[#151515]"
                      }`}
                    >
                      <div className="flex items-center gap-2 px-3 py-2.5">
                        <input
                          type="checkbox"
                          checked={isEnabled}
                          onChange={(e) => {
                            toggleTemplateRoomLimitEnabled(template.id, e.target.checked);
                          }}
                          className="h-5 w-5 shrink-0 rounded border-gray-600 bg-[#1f2933] text-violet-600"
                          title="فعال‌سازی template در scheduler"
                        />

                        <div className="min-w-0 flex-1 text-right">
                          <div className="flex items-center justify-between gap-2">
                            <span className="truncate text-sm text-white">{template.name}</span>
                            {isCustomized && (
                              <span className="shrink-0 rounded-full bg-violet-900/50 px-1.5 py-0.5 text-[10px] text-violet-200">
                                تنظیم‌شده
                              </span>
                            )}
                          </div>
                          <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[11px] text-gray-400">
                            <span>
                              {template.price.toLocaleString("fa-IR")} {template.currency}
                            </span>
                            <TemplateBadges template={template} />
                          </div>
                        </div>

                        <button
                          type="button"
                          onClick={() =>
                            setExpandedTemplateLimitId((prev) =>
                              prev === template.id ? null : template.id
                            )
                          }
                          aria-expanded={isExpanded}
                          aria-label={isExpanded ? "بستن تنظیمات template" : "باز کردن تنظیمات template"}
                          className="shrink-0 rounded-lg p-2 text-gray-400 transition hover:bg-gray-800 hover:text-white"
                        >
                          <span
                            className={`block text-xs transition-transform ${isExpanded ? "rotate-180" : ""}`}
                          >
                            ▼
                          </span>
                        </button>
                      </div>

                      {isExpanded && (
                        <div className="space-y-3 border-t border-gray-800 px-3 pb-3 pt-2">
                          {!isEnabled && (
                            <p className="text-[11px] text-amber-300/90">
                              برای اعمال این تنظیمات در scheduler، checkbox را فعال کنید.
                            </p>
                          )}
                          <PriceRangeFields
                            minLabel="حداقل میز فعال"
                            maxLabel="حداکثر میز فعال"
                            minValue={limits.min}
                            maxValue={limits.max}
                            minPlaceholder="—"
                            maxPlaceholder="—"
                            onMinChange={(value) =>
                              updateTemplateRoomLimit(template.id, "min", value)
                            }
                            onMaxChange={(value) =>
                              updateTemplateRoomLimit(template.id, "max", value)
                            }
                          />
                          <PriceRangeFields
                            minLabel="حداقل پلیر عادی در میز"
                            maxLabel="حداکثر dev player"
                            minValue={limits.minNormalPlayersPerRoom}
                            maxValue={limits.maxDevPlayersPerRoom}
                            minPlaceholder="—"
                            maxPlaceholder="—"
                            onMinChange={(value) =>
                              updateTemplateRoomLimit(template.id, "minNormalPlayersPerRoom", value)
                            }
                            onMaxChange={(value) =>
                              updateTemplateRoomLimit(template.id, "maxDevPlayersPerRoom", value)
                            }
                          />
                          <PriceRangeFields
                            minLabel="فاصله بین joinها (ثانیه)"
                            maxLabel="تعداد join در هر دوره کاری"
                            minValue={limits.joinIntervalSeconds}
                            maxValue={limits.maxJoinsPerTick}
                            minPlaceholder={String(DEFAULT_TEMPLATE_JOIN_INTERVAL_SECONDS)}
                            maxPlaceholder={String(DEFAULT_TEMPLATE_MAX_JOINS_PER_TICK)}
                            onMinChange={(value) =>
                              updateTemplateRoomLimit(template.id, "joinIntervalSeconds", value)
                            }
                            onMaxChange={(value) =>
                              updateTemplateRoomLimit(template.id, "maxJoinsPerTick", value)
                            }
                          />
                          <ToggleRow
                            label="پر کردن سریع"
                            checked={limits.quickFillEnabled}
                            onChange={(value) =>
                              updateTemplateRoomLimit(template.id, "quickFillEnabled", value)
                            }
                          />
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <label className="block space-y-1">
            <span className="text-xs text-gray-400">حداقل موجودی کیف پول</span>
            <input
              type="number"
              min={0}
              value={joinDraft.minWalletBalance}
              onChange={(e) => patchJoinDraft({ minWalletBalance: e.target.value })}
              className="w-full rounded-lg border border-gray-700 bg-[#1f2933] px-3 py-2 text-sm text-white"
            />
          </label>

          <ToggleRow
            label="حذف میزهای VIP"
            checked={joinDraft.excludeVip}
            onChange={(value) => patchJoinDraft({ excludeVip: value })}
          />
          <ToggleRow
            label="حذف میزهای تورنومنت"
            checked={joinDraft.excludeTournament}
            onChange={(value) => patchJoinDraft({ excludeTournament: value })}
          />
          <ToggleRow
            label="تأیید خودکار schedule"
            description="jobها مستقیم با وضعیت approved ساخته می‌شوند."
            checked={joinDraft.autoApproveSchedules}
            onChange={(value) => patchJoinDraft({ autoApproveSchedules: value })}
          />

          <button
            type="button"
            disabled={savingJoinPreset}
            onClick={handleSaveJoinPreset}
            className="w-full rounded-xl border border-violet-700 bg-violet-950/40 py-2.5 text-sm font-semibold text-violet-100 disabled:opacity-50"
          >
            {savingJoinPreset ? "در حال ذخیره پیش‌تنظیم..." : "ذخیره پیش‌تنظیم Join"}
          </button>
        </SectionCard>

        <SectionCard
          title="Dev Playerهای فعال"
          collapsible
          badge={activePlayerCount > 0 ? `${activePlayerCount} نفر` : undefined}
        >
          <ActivePlayersTable
            players={activePlayers}
            onManageUsers={() => router.push("/dev-panel/users")}
          />
        </SectionCard>
      </div>
    </div>
  );
}
