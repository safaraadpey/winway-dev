import { callDevPanelApi } from "@/lib/devPanelApiClient";
import type {
  DevPanelUsersListResult,
  DevPlayerConfig,
  DevPlayWindow,
} from "@/src/types/dev-players";

export async function loadDevPanelUsers(params?: {
  search?: string;
  role?: string;
  limit?: number;
  offset?: number;
}): Promise<DevPanelUsersListResult> {
  const query = new URLSearchParams();
  if (params?.search) query.set("search", params.search);
  if (params?.role) query.set("role", params.role);
  if (params?.limit) query.set("limit", String(params.limit));
  if (params?.offset) query.set("offset", String(params.offset));

  const suffix = query.toString() ? `?${query.toString()}` : "";
  return callDevPanelApi<DevPanelUsersListResult>(`/api/dev-panel/users${suffix}`);
}

export async function saveDevPlayerConfig(
  userId: string,
  payload: {
    is_enabled: boolean;
    play_windows: DevPlayWindow[];
    min_room_price: number | null;
    max_room_price: number | null;
    max_ticket_count: number;
  }
): Promise<{ devPlayerConfig: DevPlayerConfig | null }> {
  return callDevPanelApi<{ devPlayerConfig: DevPlayerConfig | null }>(
    `/api/dev-panel/dev-players/${userId}`,
    {
      method: "PATCH",
      body: payload,
    }
  );
}
