import { callDevPanelApi } from "@/lib/devPanelApiClient";
import type {
  LeoBandCap,
  LeoBandCapsSaveResult,
  LeoConfigPreset,
  LeoOverview,
  LeoPreviewPayload,
  LeoPreviewResult,
  LeoSaveUserConfigPayload,
  LeoSettings,
  LeoTemplateOption,
  LeoUserDetail,
  LeoUserListRow,
} from "@/src/types/leo";

export async function loadLeoOverview(): Promise<LeoOverview> {
  return callDevPanelApi<LeoOverview>("/api/dev-panel/leo");
}

export async function patchLeoSettings(payload: {
  systemEnabled?: boolean;
  schedulerEnabled?: boolean;
}): Promise<LeoSettings> {
  return callDevPanelApi<LeoSettings>("/api/dev-panel/leo", {
    method: "PATCH",
    body: payload,
  });
}

export async function saveLeoBandCaps(
  bands: LeoBandCap[],
  maxLeoPlayersPerWaitingRoom: number,
  maxLeoCardsPerJoin: number
): Promise<LeoBandCapsSaveResult> {
  return callDevPanelApi<LeoBandCapsSaveResult>("/api/dev-panel/leo/band-caps", {
    method: "PUT",
    body: { bands, maxLeoPlayersPerWaitingRoom, maxLeoCardsPerJoin },
  });
}

export async function loadLeoUsers(params?: {
  search?: string;
  operatorId?: string;
  limit?: number;
}): Promise<LeoUserListRow[]> {
  const query = new URLSearchParams();
  if (params?.search) query.set("search", params.search);
  if (params?.operatorId) query.set("operatorId", params.operatorId);
  if (params?.limit) query.set("limit", String(params.limit));
  const suffix = query.toString() ? `?${query.toString()}` : "";
  return callDevPanelApi<LeoUserListRow[]>(`/api/dev-panel/leo/users${suffix}`);
}

export async function loadLeoUserDetail(userId: string): Promise<LeoUserDetail> {
  return callDevPanelApi<LeoUserDetail>(`/api/dev-panel/leo/users/${userId}`);
}

export async function saveLeoUserConfig(
  userId: string,
  payload: LeoSaveUserConfigPayload
): Promise<LeoUserDetail> {
  return callDevPanelApi<LeoUserDetail>(`/api/dev-panel/leo/users/${userId}`, {
    method: "PATCH",
    body: payload,
  });
}

export async function loadLeoTemplates(): Promise<LeoTemplateOption[]> {
  return callDevPanelApi<LeoTemplateOption[]>("/api/dev-panel/leo/templates");
}

export async function previewLeoTimeline(payload: LeoPreviewPayload): Promise<LeoPreviewResult> {
  return callDevPanelApi<LeoPreviewResult>("/api/dev-panel/leo/preview", {
    method: "POST",
    body: payload,
  });
}

export async function loadLeoPresets(): Promise<LeoConfigPreset[]> {
  return callDevPanelApi<LeoConfigPreset[]>("/api/dev-panel/leo/presets");
}

export async function saveLeoPreset(payload: {
  name: string;
  sourceUserId?: string;
} & LeoSaveUserConfigPayload): Promise<LeoConfigPreset> {
  return callDevPanelApi<LeoConfigPreset>("/api/dev-panel/leo/presets", {
    method: "POST",
    body: payload,
  });
}

export async function createLeoPresetFromUser(payload: {
  name: string;
  sourceUserId: string;
}): Promise<LeoConfigPreset> {
  return callDevPanelApi<LeoConfigPreset>("/api/dev-panel/leo/presets", {
    method: "POST",
    body: payload,
  });
}

export async function renameLeoPreset(
  presetId: string,
  name: string
): Promise<LeoConfigPreset> {
  return callDevPanelApi<LeoConfigPreset>(`/api/dev-panel/leo/presets/${presetId}`, {
    method: "PATCH",
    body: { name },
  });
}

export async function deleteLeoPreset(presetId: string): Promise<void> {
  await callDevPanelApi(`/api/dev-panel/leo/presets/${presetId}`, {
    method: "DELETE",
  });
}
