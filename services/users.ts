// services/users.ts
//
// Service helpers برای صفحه مدیریت کاربران (admin / agent / super).

import { callAdminApi } from "@/lib/adminApiClient";
import { supabase } from "@/lib/supabaseClient";
import type {
  ManagedUserRole,
  ManagedUserRoleFilter,
  ManagedUserRoleTotals,
  ManagedUserSummary,
  ManagedUsersResult,
} from "@/src/types/users";

export interface LoadManagedUsersParams {
  roleFilter?: ManagedUserRoleFilter;
  search?: string;
  maxAgeMs?: number;
  force?: boolean;
}

type ManagedUsersBaseCache = {
  version: number;
  currentUserId: string;
  currentUserRole: ManagedUserRole;
  fetchedAtMs: number;
  usersAll: ManagedUserSummary[];
  roleTotals: ManagedUserRoleTotals;
};

const MANAGED_USERS_CACHE_VERSION = 5;

let managedUsersBaseCache: ManagedUsersBaseCache | null = null;

export function getCachedManagedUsersBase(): {
  currentUserRole: ManagedUserRole;
  usersAll: ManagedUserSummary[];
  roleTotals: ManagedUserRoleTotals;
} | null {
  if (!managedUsersBaseCache || managedUsersBaseCache.version !== MANAGED_USERS_CACHE_VERSION) {
    return null;
  }
  return {
    currentUserRole: managedUsersBaseCache.currentUserRole,
    usersAll: managedUsersBaseCache.usersAll,
    roleTotals: managedUsersBaseCache.roleTotals,
  };
}

export function clearManagedUsersCache() {
  managedUsersBaseCache = null;
}

function normalizeForSearch(s: string) {
  return s.toLowerCase().replace(/[\s_]+/g, "");
}

export function filterManagedUsers(
  users: ManagedUserSummary[],
  params: { roleFilter?: ManagedUserRoleFilter; search?: string }
): ManagedUserSummary[] {
  const roleFilter = params.roleFilter ?? "all";
  const search = params.search ?? "";

  let mapped = users;

  if (roleFilter !== "all") {
    mapped = mapped.filter((u) => u.role === roleFilter);
  }

  if (search && search.trim().length > 0) {
    const q = search.trim().toLowerCase();
    const qNorm = normalizeForSearch(q);
    const qDigits = q.replace(/[^0-9]/g, "");
    mapped = mapped.filter(
      (u) =>
        normalizeForSearch(u.username).includes(qNorm) ||
        normalizeForSearch(u.displayName).includes(qNorm) ||
        (qDigits.length > 0 && u.shortId.includes(qDigits))
    );
  }

  return mapped;
}

async function fetchManagedUsersFromApi(params: {
  roleFilter: ManagedUserRoleFilter;
  search: string;
}): Promise<ManagedUsersResult & { roleTotals: ManagedUserRoleTotals }> {
  const query = new URLSearchParams();
  query.set("roleFilter", params.roleFilter);
  if (params.search) {
    query.set("search", params.search);
  }

  const data = await callAdminApi<ManagedUsersResult & { roleTotals: ManagedUserRoleTotals }>(
    `/api/admin/users/managed-list?${query.toString()}`,
    { method: "GET" }
  );

  return {
    currentUserRole: data.currentUserRole,
    users: Array.isArray(data.users) ? data.users : [],
    totalCount: Number(data.totalCount || 0),
    roleTotals: data.roleTotals ?? {
      all: 0,
      player: 0,
      agent: 0,
      super: 0,
    },
  };
}

/**
 * بارگذاری کاربران زیرمجموعه برای admin / agent / super (PostgreSQL snapshot API).
 */
export async function loadManagedUsers(
  params: LoadManagedUsersParams = {}
): Promise<ManagedUsersResult> {
  const { roleFilter = "all", search = "", maxAgeMs = 30_000, force = false } = params;
  const hasSearch = search.trim().length > 0;

  const {
    data: { user: authUser },
  } = await supabase.auth.getUser();
  const authUserId = authUser?.id ?? null;

  const cacheEligible =
    !force &&
    !hasSearch &&
    roleFilter === "all" &&
    managedUsersBaseCache?.version === MANAGED_USERS_CACHE_VERSION &&
    authUserId &&
    managedUsersBaseCache.currentUserId === authUserId &&
    Date.now() - managedUsersBaseCache.fetchedAtMs <= maxAgeMs;

  if (cacheEligible && managedUsersBaseCache) {
    const filtered = filterManagedUsers(managedUsersBaseCache.usersAll, { roleFilter, search });
    const roleTotals = managedUsersBaseCache.roleTotals;
    return {
      currentUserRole: managedUsersBaseCache.currentUserRole,
      users: filtered,
      totalCount: hasSearch ? filtered.length : roleTotals[roleFilter],
      roleTotals,
    };
  }

  if (hasSearch || roleFilter !== "all") {
    const remote = await fetchManagedUsersFromApi({ roleFilter, search });
    return remote;
  }

  const remote = await fetchManagedUsersFromApi({ roleFilter: "all", search: "" });

  managedUsersBaseCache = {
    version: MANAGED_USERS_CACHE_VERSION,
    currentUserId: authUserId ?? "unknown",
    currentUserRole: remote.currentUserRole,
    fetchedAtMs: Date.now(),
    usersAll: remote.users,
    roleTotals: remote.roleTotals ?? {
      all: remote.users.length,
      player: 0,
      agent: 0,
      super: 0,
    },
  };

  console.info("[Users] managed users base cache primed", {
    count: remote.users.length,
    roleTotals: managedUsersBaseCache.roleTotals,
    source: "api",
  });

  return {
    currentUserRole: remote.currentUserRole,
    users: remote.users,
    totalCount: remote.roleTotals?.all ?? remote.users.length,
    roleTotals: remote.roleTotals,
  };
}
