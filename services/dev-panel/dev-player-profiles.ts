import { callDevPanelApi } from "@/lib/devPanelApiClient";
import type {
  DevPlayerProfile,
  DevPlayerProfileOperator,
  DevPlayerProfilePlayerOption,
  SaveDevPlayerProfilePayload,
} from "@/src/types/dev-player-profiles";

export async function loadDevPlayerProfiles(): Promise<DevPlayerProfile[]> {
  return callDevPanelApi<DevPlayerProfile[]>("/api/dev-panel/profiles");
}

export async function saveDevPlayerProfile(
  payload: SaveDevPlayerProfilePayload
): Promise<DevPlayerProfile> {
  if (payload.id) {
    return callDevPanelApi<DevPlayerProfile>(`/api/dev-panel/profiles/${payload.id}`, {
      method: "PATCH",
      body: payload,
    });
  }

  return callDevPanelApi<DevPlayerProfile>("/api/dev-panel/profiles", {
    method: "POST",
    body: payload,
  });
}

export async function loadDevPlayerProfile(profileId: string): Promise<DevPlayerProfile & { memberUserIds: string[] }> {
  return callDevPanelApi<DevPlayerProfile & { memberUserIds: string[] }>(
    `/api/dev-panel/profiles/${profileId}`
  );
}

export async function deleteDevPlayerProfile(profileId: string): Promise<void> {
  await callDevPanelApi<{ deleted: true }>(`/api/dev-panel/profiles/${profileId}`, {
    method: "DELETE",
  });
}

export async function setDevPlayerProfileEngineEnabled(
  profileId: string,
  engineEnabled: boolean
): Promise<{ id: string; engineEnabled: boolean }> {
  return callDevPanelApi<{ id: string; engineEnabled: boolean }>(
    `/api/dev-panel/profiles/${profileId}/engine`,
    {
      method: "PATCH",
      body: { engine_enabled: engineEnabled },
    }
  );
}

export async function loadDevPlayerProfileOperators(): Promise<DevPlayerProfileOperator[]> {
  return callDevPanelApi<DevPlayerProfileOperator[]>("/api/dev-panel/profiles/operators");
}

export async function loadDevPlayerProfilePlayers(params: {
  operatorId: string;
  profileId?: string;
}): Promise<DevPlayerProfilePlayerOption[]> {
  const query = new URLSearchParams({ operatorId: params.operatorId });
  if (params.profileId) query.set("profileId", params.profileId);
  return callDevPanelApi<DevPlayerProfilePlayerOption[]>(
    `/api/dev-panel/profiles/players?${query.toString()}`
  );
}
