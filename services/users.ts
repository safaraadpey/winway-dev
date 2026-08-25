// services/users.ts
//
// Service helpers برای صفحه مدیریت کاربران (admin / agent / super).

import { supabase } from "@/lib/supabaseClient";
import type {
  ManagedUserRole,
  ManagedUserRoleFilter,
  ManagedUserSummary,
  ManagedUsersResult,
} from "@/src/types/users";

// تبدیل UUID به ID ده‌رقمی
function makeShortIdFromUuid(id: string): string {
  let hash = 0;
  for (let i = 0; i < id.length; i++) {
    hash = Math.imul(31, hash) + id.charCodeAt(i);
  }
  const num = (hash >>> 0) % 1_000_000_0000; // 10^10
  return num.toString().padStart(10, "0");
}

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
};

const MANAGED_USERS_CACHE_VERSION = 4;

let managedUsersBaseCache: ManagedUsersBaseCache | null = null;

export function getCachedManagedUsersBase(): {
  currentUserRole: ManagedUserRole;
  usersAll: ManagedUserSummary[];
} | null {
  if (!managedUsersBaseCache || managedUsersBaseCache.version !== MANAGED_USERS_CACHE_VERSION) {
    return null;
  }
  return {
    currentUserRole: managedUsersBaseCache.currentUserRole,
    usersAll: managedUsersBaseCache.usersAll,
  };
}

export function clearManagedUsersCache() {
  managedUsersBaseCache = null;
}

async function loadNicknamesViaApi(userIds: string[]): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  if (userIds.length === 0) return map;

  const {
    data: { session },
    error: sessionError,
  } = await supabase.auth.getSession();

  if (sessionError || !session?.access_token) {
    return map;
  }

  try {
    const response = await fetch("/api/admin/users/nicknames", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({ user_ids: userIds }),
    });

    const payload = await response.json().catch(() => null);
    if (!response.ok || !payload?.ok || !Array.isArray(payload?.data)) {
      return map;
    }

    for (const row of payload.data as any[]) {
      const uid = String(row?.user_id || "").trim();
      const nickname = String(row?.nickname || "").trim();
      if (!uid || !nickname) continue;
      map.set(uid, nickname);
    }
  } catch {
    // fallback handled by caller
  }

  return map;
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

/**
 * گرفتن نقش کاربر فعلی از جدول users
 */
async function getCurrentUserRole(): Promise<{
  userId: string | null;
  role: ManagedUserRole;
}> {
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    console.error("getCurrentUserRole: auth error", authError);
    return { userId: null, role: "player" };
  }

  const { data: dbUser, error: dbError } = await supabase
    .from("users")
    .select("id, role")
    .eq("id", user.id)
    .single();

  if (dbError || !dbUser) {
    console.warn("getCurrentUserRole: users read error", dbError?.message);
    return { userId: user.id, role: "player" };
  }

  return {
    userId: dbUser.id,
    role: (dbUser.role as ManagedUserRole) || "player",
  };
}

/**
 * بارگذاری کاربران زیرمجموعه برای admin / agent / super
 *
 * - admin: همه کاربران (فعلاً ساده)
 * - super: همه players و agents که در player_affiliation زیر این super ثبت شده‌اند
 * - agent: همه players که agent آن‌ها کاربر فعلی است
 */
export async function loadManagedUsers(
  params: LoadManagedUsersParams = {}
): Promise<ManagedUsersResult> {
  const { roleFilter = "all", search, maxAgeMs = 30_000, force = false } = params;

  const { userId: currentUserId, role: currentRole } = await getCurrentUserRole();

  if (!currentUserId) {
    return { currentUserRole: currentRole, users: [], totalCount: 0 };
  }

  let adminZeroId: string | null = null;
  let isAdminZero = false;
  if (currentRole === "admin") {
    const { data: adminZero } = await supabase
      .from("users")
      .select("id")
      .eq("username", "adminzero")
      .eq("role", "admin")
      .maybeSingle();
    adminZeroId = adminZero?.id ?? null;
    isAdminZero = !!adminZeroId && currentUserId === adminZeroId;
  }

  const hideAdminZeroFromViewer = !!adminZeroId && !isAdminZero;

  const cacheEligible =
    !force &&
    managedUsersBaseCache?.version === MANAGED_USERS_CACHE_VERSION &&
    managedUsersBaseCache?.currentUserId === currentUserId &&
    managedUsersBaseCache?.currentUserRole === currentRole &&
    Date.now() - managedUsersBaseCache.fetchedAtMs <= maxAgeMs;

  if (cacheEligible && managedUsersBaseCache) {
    const filtered = filterManagedUsers(managedUsersBaseCache.usersAll, {
      roleFilter,
      search,
    });
    return {
      currentUserRole: currentRole,
      users: filtered,
      totalCount: filtered.length,
    };
  }

  let targetUserIds: string[] = [];

  try {
    if (currentRole === "agent") {
      // agent: agents و players زیر این agent
      // 1. گرفتن agents مستقیم زیر این agent (parent_id = agent.id)
      const { data: directAgentsData, error: directAgentsError } = await supabase
        .from("users")
        .select("id")
        .eq("parent_id", currentUserId)
        .eq("role", "agent");

      if (directAgentsError) {
        console.error("loadManagedUsers: direct agents for agent error", directAgentsError);
      } else {
        const directAgentIds = (directAgentsData || []).map((a: any) => a.id);
        targetUserIds.push(...directAgentIds);
      }

      // 2. گرفتن players مستقیم زیر این agent (parent_id = agent.id)
      const { data: directPlayersData, error: directPlayersError } = await supabase
        .from("users")
        .select("id")
        .eq("parent_id", currentUserId)
        .eq("role", "player");

      if (directPlayersError) {
        console.error("loadManagedUsers: direct players for agent error", directPlayersError);
      } else {
        const directPlayerIds = (directPlayersData || []).map((p: any) => p.id);
        targetUserIds.push(...directPlayerIds);
      }

      // 3. همچنین از player_affiliation هم استفاده می‌کنیم (برای سازگاری)
      const { data: paRows, error: paError } = await supabase
        .from("player_affiliation")
        .select("user_id, agent_id")
        .eq("agent_id", currentUserId);

      if (!paError && paRows && paRows.length > 0) {
        const paPlayerIds = paRows.map((r: any) => r.user_id);
        const paAgentIds = paRows
          .map((r: any) => r.agent_id)
          .filter((id: string | null) => !!id);
        targetUserIds.push(...paPlayerIds, ...paAgentIds);
      }

      // حذف duplicates
      targetUserIds = Array.from(new Set(targetUserIds));
    } else if (currentRole === "super") {
      // super: agents و players زیر این super
      // 1. گرفتن agents که parent_id آن‌ها این super است
      const { data: agentsData, error: agentsError } = await supabase
        .from("users")
        .select("id")
        .eq("parent_id", currentUserId)
        .eq("role", "agent");

      if (agentsError) {
        console.error("loadManagedUsers: agents for super error", agentsError);
      } else {
        const agentIds = (agentsData || []).map((a: any) => a.id);
        targetUserIds.push(...agentIds);

        // 2. گرفتن players مستقیم زیر این super (parent_id = super.id)
        const { data: directPlayersData, error: directPlayersError } = await supabase
          .from("users")
          .select("id")
          .eq("parent_id", currentUserId)
          .eq("role", "player");

        if (directPlayersError) {
          console.error("loadManagedUsers: direct players for super error", directPlayersError);
        } else {
          const directPlayerIds = (directPlayersData || []).map((p: any) => p.id);
          targetUserIds.push(...directPlayerIds);
        }

        // 3. گرفتن players که parent_id آن‌ها یکی از agents زیر این super است
        if (agentIds.length > 0) {
          const { data: playersData, error: playersError } = await supabase
            .from("users")
            .select("id")
            .in("parent_id", agentIds)
            .eq("role", "player");

          if (playersError) {
            console.error("loadManagedUsers: players under agents for super error", playersError);
          } else {
            const playerIds = (playersData || []).map((p: any) => p.id);
            targetUserIds.push(...playerIds);
          }
        }

        // 4. همچنین از player_affiliation هم استفاده می‌کنیم (برای سازگاری)
        const { data: paRows, error: paError } = await supabase
          .from("player_affiliation")
          .select("user_id, agent_id")
          .eq("super_id", currentUserId);

        if (!paError && paRows && paRows.length > 0) {
          const paPlayerIds = paRows.map((r: any) => r.user_id);
          const paAgentIds = paRows
            .map((r: any) => r.agent_id)
            .filter((id: string | null) => !!id);
          targetUserIds.push(...paPlayerIds, ...paAgentIds);
        }

        // حذف duplicates
        targetUserIds = Array.from(new Set(targetUserIds));
      }
    } else if (currentRole === "admin") {
      // ادمین: همه کاربران (فعلاً ساده)
      const { data: allUsers, error: usersError } = await supabase
        .from("users")
        .select("id, admin_sub_role");

      if (usersError) {
        console.error("loadManagedUsers: users error (admin)", usersError);
      } else {
        targetUserIds = (allUsers || [])
          .filter((u: { id: string; admin_sub_role?: string | null }) => {
            if (hideAdminZeroFromViewer && u.id === adminZeroId) {
              return false;
            }
            return isAdminZero || u.admin_sub_role !== "dev_panel";
          })
          .map((u: { id: string }) => u.id);
      }
    }
  } catch (err) {
    console.error("loadManagedUsers: error building targetUserIds", err);
  }

  if (targetUserIds.length === 0) {
    return { currentUserRole: currentRole, users: [], totalCount: 0 };
  }

  // گرفتن اطلاعات کاربران (به‌همراه parent_id برای ساخت درخت)
  const { data: usersData, error: usersError } = await supabase
    .from("users")
    .select("id, username, role, referral_code, parent_id, admin_sub_role")
    .in("id", targetUserIds);

  if (usersError || !usersData) {
    console.error("loadManagedUsers: users details error", usersError);
    return { currentUserRole: currentRole, users: [], totalCount: 0 };
  }

  const visibleUsersData =
    currentRole === "admin" && !isAdminZero
      ? usersData.filter(
          (u: { id: string; admin_sub_role?: string | null }) =>
            u.admin_sub_role !== "dev_panel" &&
            !(hideAdminZeroFromViewer && u.id === adminZeroId)
        )
      : hideAdminZeroFromViewer
        ? usersData.filter((u: { id: string }) => u.id !== adminZeroId)
        : usersData;

  // گرفتن موجودی تومان برای همه این کاربران
  // فقط کیف‌پول با ارز IRR (تومان) را در نظر می‌گیریم
  const { data: wallets, error: walletsError } = await supabase
    .from("wallets")
    .select("user_id, balance, currency")
    .in("user_id", targetUserIds)
    .eq("currency", "IRR");

  if (walletsError) {
    console.warn("loadManagedUsers: wallets error", walletsError.message);
  }

  const walletMap = new Map<string, number>();
  (wallets || []).forEach((w: any) => {
    const uid = w.user_id as string;
    // تبدیل به number (ممکن است از دیتابیس به صورت string برگردانده شود)
    const bal = typeof w.balance === 'string' 
      ? parseFloat(w.balance) || 0 
      : (Number(w.balance) || 0);
    walletMap.set(uid, bal);
  });

  // گرفتن nickname از user_profiles برای همه کاربران (از API سروری برای عبور از RLS)
  const userIds = visibleUsersData.map((u: any) => u.id).filter((id: string) => id !== currentUserId);
  const profileMap = await loadNicknamesViaApi(userIds);
  if (profileMap.size === 0 && userIds.length > 0) {
    // fallback: query مستقیم (ممکن است به دلیل RLS ناقص باشد)
    const { data: profiles } = await supabase
      .from("user_profiles")
      .select("user_id, nickname")
      .in("user_id", userIds);
    (profiles || []).forEach((p: any) => {
      if (p.nickname) {
        profileMap.set(p.user_id, p.nickname);
      }
    });
  }

  // گرفتن اطلاعات affiliation برای ساخت رابطه بالاسری (agent/super)
  const { data: affiliations, error: affError } = await supabase
    .from("player_affiliation")
    .select("user_id, agent_id, super_id")
    .in("user_id", targetUserIds);

  if (affError) {
    console.warn("loadManagedUsers: player_affiliation error", affError.message);
  }

  const affiliationMap = new Map<
    string,
    { agent_id: string | null; super_id: string | null }
  >();
  (affiliations || []).forEach((row: any) => {
    affiliationMap.set(row.user_id as string, {
      agent_id: (row.agent_id as string) || null,
      super_id: (row.super_id as string) || null,
    });
  });

  // map نقش هر کاربر برای استفاده در منطق parent
  const roleById = new Map<string, ManagedUserRole>();
  const parentById = new Map<string, string | null>();
  const usernameById = new Map<string, string>();
  (visibleUsersData || []).forEach((u: any) => {
    const id = u.id as string;
    roleById.set(id, (u.role || "player") as ManagedUserRole);
    parentById.set(id, (u.parent_id as string | null) || null);
    const shortId = makeShortIdFromUuid(id);
    usernameById.set(id, (u.username || u.referral_code || shortId) as string);
  });

  const uplineIds = new Set<string>();
  affiliationMap.forEach((aff) => {
    if (aff.agent_id) uplineIds.add(aff.agent_id);
    if (aff.super_id) uplineIds.add(aff.super_id);
  });
  (visibleUsersData || []).forEach((u: any) => {
    if (u.parent_id) uplineIds.add(u.parent_id as string);
  });

  const mergeUplineRows = (rows: any[] | null) => {
    (rows || []).forEach((row: any) => {
      const id = row.id as string;
      roleById.set(id, (row.role || "player") as ManagedUserRole);
      parentById.set(id, (row.parent_id as string | null) || null);
      const shortId = makeShortIdFromUuid(id);
      usernameById.set(id, (row.username || row.referral_code || shortId) as string);
    });
  };

  const missingUplineIds = [...uplineIds].filter((id) => !usernameById.has(id));
  if (missingUplineIds.length > 0) {
    const { data: uplineUsers, error: uplineError } = await supabase
      .from("users")
      .select("id, username, role, referral_code, parent_id")
      .in("id", missingUplineIds);
    if (uplineError) {
      console.warn("[Users] loadManagedUsers upline names error", uplineError.message);
    } else {
      mergeUplineRows(uplineUsers);
      const missingParents = [
        ...new Set(
          (uplineUsers || [])
            .map((row: any) => row.parent_id as string | null)
            .filter((id: string | null): id is string => Boolean(id) && !usernameById.has(id))
        ),
      ];
      if (missingParents.length > 0) {
        const { data: parentUsers, error: parentError } = await supabase
          .from("users")
          .select("id, username, role, referral_code, parent_id")
          .in("id", missingParents);
        if (parentError) {
          console.warn("[Users] loadManagedUsers upline parent names error", parentError.message);
        } else {
          mergeUplineRows(parentUsers);
        }
      }
    }
  }

  function resolveUplineUsernames(u: any): {
    agentUsername: string | null;
    superUsername: string | null;
  } {
    const userId = u.id as string;
    const userRole = (u.role || "player") as ManagedUserRole;
    const parentId = (u.parent_id as string | null) || null;
    const aff = affiliationMap.get(userId) || null;

    let agentId: string | null = null;
    let superId: string | null = null;

    if (userRole === "player") {
      if (aff?.agent_id) agentId = aff.agent_id;
      else if (parentId && roleById.get(parentId) === "agent") agentId = parentId;

      if (aff?.super_id) superId = aff.super_id;
      if (!superId && agentId) {
        const agentParent = parentById.get(agentId) || null;
        if (agentParent && roleById.get(agentParent) === "super") superId = agentParent;
      }
      if (!superId && parentId && roleById.get(parentId) === "super") superId = parentId;
    } else if (userRole === "agent") {
      if (parentId && roleById.get(parentId) === "super") superId = parentId;
      else if (aff?.super_id) superId = aff.super_id;
    }

    return {
      agentUsername: agentId ? usernameById.get(agentId) || null : null,
      superUsername: superId ? usernameById.get(superId) || null : null,
    };
  }

  // Helper: تعیین بالاسری (parentUserId) برای هر کاربر بر اساس نقش بیننده
  function resolveParentId(u: any): string | null {
    const userId = u.id as string;
    const userRole = (u.role || "player") as ManagedUserRole;
    const parentIdFromUser = (u.parent_id as string | null) || null;
    const aff = affiliationMap.get(userId) || null;

    // Admin: نمایش کل ساختار (super > agent > player)
    if (currentRole === "admin") {
      if (userRole === "super" || userRole === "admin") {
        return null; // ریشه درخت
      }

      if (userRole === "agent") {
        // اگر parent_id سوپر است، همان را استفاده می‌کنیم
        if (parentIdFromUser && roleById.get(parentIdFromUser) === "super") {
          return parentIdFromUser;
        }
        return null;
      }

      // player: اولویت با agent، سپس super، سپس parent_id
      if (userRole === "player") {
        if (aff?.agent_id) return aff.agent_id;
        if (aff?.super_id) return aff.super_id;
        if (parentIdFromUser) return parentIdFromUser;
      }

      return null;
    }

    // Super: ریشه = خود سوپر، زیرش agents و players
    if (currentRole === "super") {
      if (userRole === "agent") {
        // همه ایجنت‌های زیر این سوپر مستقیماً زیر خود سوپر هستند
        return currentUserId;
      }
      if (userRole === "player") {
        // اگر agent زیرمجموعه این سوپر دارد، parent = آن agent، در غیر این صورت خود سوپر
        if (aff?.agent_id && targetUserIds.includes(aff.agent_id)) {
          return aff.agent_id;
        }
        return currentUserId;
      }
      return null;
    }

    // Agent: فعلاً درخت مسطح (همه پلیرها در یک سطح)
    if (currentRole === "agent") {
      if (userRole === "player" || userRole === "agent") {
        return currentUserId;
      }
      return null;
    }

    return null;
  }

  // مپ کردن به مدل ManagedUserSummary
  let mappedAll: ManagedUserSummary[] = visibleUsersData
    .filter((u: any) => u.id !== currentUserId) // حذف کاربر فعلی از لیست
    .map((u: any) => {
      const role = (u.role || "player") as ManagedUserRole;
      const shortId = makeShortIdFromUuid(u.id as string);
      const username: string = u.username || u.referral_code || shortId;
      const nickname = profileMap.get(u.id) || null;
      // برای سازگاری با بخش‌های دیگر UI
      const displayName = nickname || username;
      const tomanBalance = walletMap.get(u.id) || 0;
      const parentUserId = resolveParentId(u);
      const { agentUsername, superUsername } = resolveUplineUsernames(u);

      return {
        id: u.id,
        shortId,
        username,
        nickname,
        displayName,
        role,
        tomanBalance,
        parentUserId,
        agentUsername,
        superUsername,
      };
    });

  // محاسبه تعداد کاربران زیرمجموعه برای هر کاربر (بر اساس parentUserId)
  const childrenCount = new Map<string, number>();
  mappedAll.forEach((u) => {
    if (u.parentUserId) {
      const prev = childrenCount.get(u.parentUserId) || 0;
      childrenCount.set(u.parentUserId, prev + 1);
    }
  });

  mappedAll = mappedAll.map((u) => ({
    ...u,
    managedUserCount: childrenCount.get(u.id) || 0,
  }));

  // Cache the full list (unfiltered) for fast tab switching.
  managedUsersBaseCache = {
    version: MANAGED_USERS_CACHE_VERSION,
    currentUserId,
    currentUserRole: currentRole,
    fetchedAtMs: Date.now(),
    usersAll: mappedAll,
  };

  let mapped = filterManagedUsers(mappedAll, { roleFilter, search });

  // مرتب‌سازی: نقش سپس نام
  mapped.sort((a, b) => {
    if (a.role === b.role) {
      return a.username.localeCompare(b.username, "fa");
    }
    const order: ManagedUserRole[] = ["admin", "super", "agent", "player"];
    return order.indexOf(a.role) - order.indexOf(b.role);
  });

  return {
    currentUserRole: currentRole,
    users: mapped,
    totalCount: mapped.length,
  };
}


