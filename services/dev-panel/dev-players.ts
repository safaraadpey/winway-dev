import { callDevPanelApi } from "@/lib/devPanelApiClient";
import type { DevPanelUsersListResult } from "@/src/types/dev-players";

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
