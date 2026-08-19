import { callAdminApi } from "@/lib/adminApiClient";
import type {
  FeatureRow,
  FeatureUserOverrideRow,
  FeatureUserSearchRow,
  PlayerFeaturesSnapshot,
} from "@/src/types/feature-flags";

export async function listFeatures(): Promise<{ features: FeatureRow[] }> {
  return callAdminApi("/api/admin/features", { method: "GET" });
}

export async function createFeature(input: {
  key: string;
  name: string;
  description?: string | null;
}): Promise<{ feature: FeatureRow }> {
  return callAdminApi("/api/admin/features", {
    method: "POST",
    body: input,
  });
}

export async function updateFeature(
  featureId: string,
  input: Partial<{
    name: string;
    description: string | null;
    is_enabled: boolean;
    default_enabled: boolean;
    rollout_percentage: number;
    expires_at: string | null;
  }>
): Promise<{ feature: FeatureRow }> {
  return callAdminApi(`/api/admin/features/${featureId}`, {
    method: "PATCH",
    body: input,
  });
}

export async function deleteFeature(featureId: string): Promise<{ deleted: true }> {
  return callAdminApi(`/api/admin/features/${featureId}`, {
    method: "DELETE",
  });
}

export async function getFeatureUsers(
  featureId: string,
  search?: string
): Promise<{
  assignedUsers: FeatureUserOverrideRow[];
  searchResults: FeatureUserSearchRow[];
}> {
  const query = search?.trim() ? `?search=${encodeURIComponent(search.trim())}` : "";
  return callAdminApi(`/api/admin/features/${featureId}/users${query}`, {
    method: "GET",
  });
}

export async function addFeatureUser(
  featureId: string,
  input: {
    userId: string;
    isEnabled?: boolean;
    note?: string | null;
    expiresAt?: string | null;
  }
): Promise<{ override: FeatureUserOverrideRow }> {
  return callAdminApi(`/api/admin/features/${featureId}/users`, {
    method: "POST",
    body: input,
  });
}

export async function removeFeatureUser(
  featureId: string,
  userId: string
): Promise<{ removed: true }> {
  return callAdminApi(
    `/api/admin/features/${featureId}/users?userId=${encodeURIComponent(userId)}`,
    { method: "DELETE" }
  );
}

export async function fetchPlayerFeatures(): Promise<PlayerFeaturesSnapshot> {
  const { supabase } = await import("@/lib/supabaseClient");
  const {
    data: { session },
    error,
  } = await supabase.auth.getSession();

  if (error || !session) {
    throw new Error("UNAUTHORIZED");
  }

  const response = await fetch("/api/player/features", {
    method: "GET",
    headers: {
      Authorization: `Bearer ${session.access_token}`,
    },
    cache: "no-store",
  });

  const payload = await response.json();
  if (!response.ok || payload.ok === false) {
    throw new Error(payload.message || "Failed to load features");
  }

  return payload.data as PlayerFeaturesSnapshot;
}
