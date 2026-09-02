import { callDevPanelApi } from "@/lib/devPanelApiClient";
import type { DevPlayWindow } from "@/src/types/dev-players";
import type {
  DevPlayerJoinPreset,
  DevPlayerSettingsResult,
  DevPlayerTemplateRoomLimitPayload,
} from "@/src/types/dev-player-settings";

export type SaveDevPlayerSettingsPayload = {
  system_enabled: boolean;
  scheduler_enabled: boolean;
  scheduler_tick_interval_seconds: number;
  processor_tick_interval_seconds: number;
  scheduler_pause_after_seconds?: number | null;
  scheduler_pause_duration_seconds?: number | null;
  timezone: string;
  active_join_preset_id?: string | null;
};

export type SaveDevPlayerJoinPresetPayload = {
  id?: string;
  name: string;
  play_windows: DevPlayWindow[];
  template_room_limits: DevPlayerTemplateRoomLimitPayload[];
  template_room_limit_enabled_ids: string[];
  min_wallet_balance: number;
  exclude_vip: boolean;
  exclude_tournament: boolean;
  auto_approve_schedules: boolean;
  set_active?: boolean;
};

export async function loadDevPlayerSettings(): Promise<DevPlayerSettingsResult> {
  return callDevPanelApi<DevPlayerSettingsResult>("/api/dev-panel/settings");
}

export async function saveDevPlayerSettings(
  payload: SaveDevPlayerSettingsPayload
): Promise<DevPlayerSettingsResult> {
  return callDevPanelApi<DevPlayerSettingsResult>("/api/dev-panel/settings", {
    method: "PATCH",
    body: payload,
  });
}

export async function saveDevPlayerJoinPreset(
  payload: SaveDevPlayerJoinPresetPayload
): Promise<DevPlayerJoinPreset> {
  return callDevPanelApi<DevPlayerJoinPreset>("/api/dev-panel/join-presets", {
    method: "POST",
    body: payload,
  });
}

export type SaveDevPlayerTemplateJoinSettingPayload = {
  template_id: string;
  join_delay_max_seconds: number;
  max_dev_players_per_room: number | null;
};

export async function saveDevPlayerTemplateJoinSettings(
  settings: SaveDevPlayerTemplateJoinSettingPayload[]
): Promise<
  Array<{
    templateId: string;
    joinDelayMaxSeconds: number;
    maxDevPlayersPerRoom: number | null;
    updatedAt: string | null;
  }>
> {
  return callDevPanelApi<
    Array<{
      templateId: string;
      joinDelayMaxSeconds: number;
      maxDevPlayersPerRoom: number | null;
      updatedAt: string | null;
    }>
  >("/api/dev-panel/template-join-settings", {
    method: "PUT",
    body: { settings },
  });
}
