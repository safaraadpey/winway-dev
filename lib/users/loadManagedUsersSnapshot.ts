import { pgPool } from "@/lib/pg";
import type {
  ManagedUserRole,
  ManagedUserRoleFilter,
  ManagedUserRoleTotals,
  ManagedUserSummary,
  ManagedUsersResult,
} from "@/src/types/users";

export type LoadManagedUsersSnapshotParams = {
  viewerUserId: string;
  viewerRole: ManagedUserRole;
  roleFilter?: ManagedUserRoleFilter;
  search?: string;
};

type UserRow = {
  id: string;
  username: string | null;
  role: string;
  referral_code: string | null;
  parent_id: string | null;
  admin_sub_role: string | null;
  direct_managed_count: number | string | null;
  nickname: string | null;
};

type AffRow = {
  user_id: string;
  agent_id: string | null;
  super_id: string | null;
};

type WalletRow = {
  user_id: string;
  balance: string | number | null;
};

function makeShortIdFromUuid(id: string): string {
  let hash = 0;
  for (let i = 0; i < id.length; i++) {
    hash = Math.imul(31, hash) + id.charCodeAt(i);
  }
  const num = (hash >>> 0) % 1_000_000_0000;
  return num.toString().padStart(10, "0");
}

function toAmount(value: unknown): number {
  if (typeof value === "string") {
    const n = parseFloat(value);
    return Number.isFinite(n) ? n : 0;
  }
  const n = Number(value ?? 0);
  return Number.isFinite(n) ? n : 0;
}

function normalizeForSearch(s: string): string {
  return s.toLowerCase().replace(/[\s_]+/g, "");
}

function filterUsers(
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

function computeRoleTotals(users: ManagedUserSummary[]): ManagedUserRoleTotals {
  return {
    all: users.length,
    player: users.filter((u) => u.role === "player").length,
    agent: users.filter((u) => u.role === "agent").length,
    super: users.filter((u) => u.role === "super").length,
  };
}

async function resolveAdminZeroId(): Promise<string | null> {
  if (!pgPool) return null;
  const result = await pgPool.query<{ id: string }>(
    `
    SELECT u.id
    FROM public.users u
    WHERE u.username = 'adminzero'
      AND u.role = 'admin'
    LIMIT 1
    `
  );
  return result.rows[0]?.id ?? null;
}

async function loadScopedUserIds(params: {
  viewerUserId: string;
  viewerRole: ManagedUserRole;
  adminZeroId: string | null;
  isAdminZero: boolean;
}): Promise<string[]> {
  if (!pgPool) return [];

  const { viewerUserId, viewerRole, adminZeroId, isAdminZero } = params;

  if (viewerRole === "admin") {
    const result = await pgPool.query<{ id: string }>(
      `
      SELECT u.id
      FROM public.users u
      WHERE ($1::boolean OR $2::uuid IS NULL OR u.id <> $2::uuid)
        AND ($3::boolean OR COALESCE(u.admin_sub_role::text, '') <> 'dev_panel')
      `,
      [isAdminZero, adminZeroId, isAdminZero]
    );
    return result.rows.map((r) => r.id);
  }

  if (viewerRole === "super") {
    const result = await pgPool.query<{ id: string }>(
      `
      WITH agent_ids AS (
        SELECT u.id
        FROM public.users u
        WHERE u.parent_id = $1::uuid
          AND u.role = 'agent'
      ),
      scoped AS (
        SELECT u.id
        FROM public.users u
        WHERE u.parent_id = $1::uuid
          AND u.role IN ('agent', 'player')
        UNION
        SELECT u.id
        FROM public.users u
        INNER JOIN agent_ids a ON u.parent_id = a.id
        WHERE u.role = 'player'
        UNION
        SELECT pa.user_id AS id
        FROM public.player_affiliation pa
        WHERE pa.super_id = $1::uuid
        UNION
        SELECT pa.agent_id AS id
        FROM public.player_affiliation pa
        WHERE pa.super_id = $1::uuid
          AND pa.agent_id IS NOT NULL
      )
      SELECT DISTINCT id FROM scoped WHERE id IS NOT NULL
      `,
      [viewerUserId]
    );
    return result.rows.map((r) => r.id);
  }

  if (viewerRole === "agent") {
    const result = await pgPool.query<{ id: string }>(
      `
      WITH scoped AS (
        SELECT u.id
        FROM public.users u
        WHERE u.parent_id = $1::uuid
          AND u.role IN ('agent', 'player')
        UNION
        SELECT pa.user_id AS id
        FROM public.player_affiliation pa
        WHERE pa.agent_id = $1::uuid
        UNION
        SELECT pa.agent_id AS id
        FROM public.player_affiliation pa
        WHERE pa.agent_id = $1::uuid
          AND pa.agent_id IS NOT NULL
      )
      SELECT DISTINCT id FROM scoped WHERE id IS NOT NULL
      `,
      [viewerUserId]
    );
    return result.rows.map((r) => r.id);
  }

  return [];
}

function resolveParentId(params: {
  viewerRole: ManagedUserRole;
  viewerUserId: string;
  userRole: ManagedUserRole;
  parentIdFromUser: string | null;
  aff: AffRow | null;
  roleById: Map<string, ManagedUserRole>;
  targetUserIds: Set<string>;
}): string | null {
  const { viewerRole, viewerUserId, userRole, parentIdFromUser, aff, roleById, targetUserIds } =
    params;

  if (viewerRole === "admin") {
    if (userRole === "super" || userRole === "admin") return null;
    if (userRole === "agent") {
      if (parentIdFromUser && roleById.get(parentIdFromUser) === "super") {
        return parentIdFromUser;
      }
      return null;
    }
    if (userRole === "player") {
      if (aff?.agent_id) return aff.agent_id;
      if (aff?.super_id) return aff.super_id;
      if (parentIdFromUser) return parentIdFromUser;
    }
    return null;
  }

  if (viewerRole === "super") {
    if (userRole === "agent") return viewerUserId;
    if (userRole === "player") {
      if (aff?.agent_id && targetUserIds.has(aff.agent_id)) return aff.agent_id;
      return viewerUserId;
    }
    return null;
  }

  if (viewerRole === "agent") {
    if (userRole === "player" || userRole === "agent") return viewerUserId;
    return null;
  }

  return null;
}

function resolveUplineUsernames(params: {
  userRole: ManagedUserRole;
  parentId: string | null;
  aff: AffRow | null;
  roleById: Map<string, ManagedUserRole>;
  parentById: Map<string, string | null>;
  usernameById: Map<string, string>;
}): { agentUsername: string | null; superUsername: string | null } {
  const { userRole, parentId, aff, roleById, parentById, usernameById } = params;

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

/**
 * PostgreSQL snapshot for managed users list (scope, wallets, denormalized counts).
 */
export async function loadManagedUsersSnapshot(
  params: LoadManagedUsersSnapshotParams
): Promise<ManagedUsersResult & { roleTotals: ManagedUserRoleTotals }> {
  const empty: ManagedUsersResult & { roleTotals: ManagedUserRoleTotals } = {
    currentUserRole: params.viewerRole,
    users: [],
    totalCount: 0,
    roleTotals: { all: 0, player: 0, agent: 0, super: 0 },
  };

  if (!pgPool) {
    console.error("[Users] managed-list skipped: no PostgreSQL pool");
    return empty;
  }

  const roleFilter = params.roleFilter ?? "all";
  const search = params.search ?? "";
  const viewerUserId = params.viewerUserId;
  const viewerRole = params.viewerRole;

  const adminZeroId = viewerRole === "admin" ? await resolveAdminZeroId() : null;
  const isAdminZero = !!adminZeroId && viewerUserId === adminZeroId;

  const scopedIds = await loadScopedUserIds({
    viewerUserId,
    viewerRole,
    adminZeroId,
    isAdminZero,
  });

  if (scopedIds.length === 0) {
    console.log("[Users] managed-list empty scope", { viewerRole, source: "postgresql" });
    return empty;
  }

  const [usersResult, affResult, walletResult] = await Promise.all([
    pgPool.query<UserRow>(
      `
      SELECT
        u.id,
        u.username,
        u.role::text AS role,
        u.referral_code,
        u.parent_id,
        u.admin_sub_role::text AS admin_sub_role,
        u.direct_managed_count,
        pr.nickname
      FROM public.users u
      LEFT JOIN public.user_profiles pr ON pr.user_id = u.id
      WHERE u.id = ANY($1::uuid[])
      `,
      [scopedIds]
    ),
    pgPool.query<AffRow>(
      `
      SELECT pa.user_id, pa.agent_id, pa.super_id
      FROM public.player_affiliation pa
      WHERE pa.user_id = ANY($1::uuid[])
      `,
      [scopedIds]
    ),
    pgPool.query<WalletRow>(
      `
      SELECT w.user_id, w.balance
      FROM public.wallets w
      WHERE w.user_id = ANY($1::uuid[])
        AND w.currency = 'IRR'
      `,
      [scopedIds]
    ),
  ]);

  const affiliationMap = new Map<string, AffRow>();
  affResult.rows.forEach((row) => affiliationMap.set(row.user_id, row));

  const walletMap = new Map<string, number>();
  walletResult.rows.forEach((row) => {
    walletMap.set(row.user_id, toAmount(row.balance));
  });

  const roleById = new Map<string, ManagedUserRole>();
  const parentById = new Map<string, string | null>();
  const usernameById = new Map<string, string>();

  usersResult.rows.forEach((u) => {
    roleById.set(u.id, (u.role || "player") as ManagedUserRole);
    parentById.set(u.id, u.parent_id);
    const shortId = makeShortIdFromUuid(u.id);
    usernameById.set(u.id, u.username || u.referral_code || shortId);
  });

  const uplineIds = new Set<string>();
  affiliationMap.forEach((aff) => {
    if (aff.agent_id) uplineIds.add(aff.agent_id);
    if (aff.super_id) uplineIds.add(aff.super_id);
  });
  usersResult.rows.forEach((u) => {
    if (u.parent_id) uplineIds.add(u.parent_id);
  });

  const missingUplineIds = [...uplineIds].filter((id) => !usernameById.has(id));
  if (missingUplineIds.length > 0) {
    const uplineResult = await pgPool.query<UserRow>(
      `
      SELECT u.id, u.username, u.role::text AS role, u.referral_code, u.parent_id,
             u.admin_sub_role::text AS admin_sub_role, u.direct_managed_count, NULL::text AS nickname
      FROM public.users u
      WHERE u.id = ANY($1::uuid[])
      `,
      [missingUplineIds]
    );
    uplineResult.rows.forEach((u) => {
      roleById.set(u.id, (u.role || "player") as ManagedUserRole);
      parentById.set(u.id, u.parent_id);
      usernameById.set(u.id, u.username || u.referral_code || makeShortIdFromUuid(u.id));
    });

    const missingParents = uplineResult.rows
      .map((u) => u.parent_id)
      .filter((id): id is string => !!id && !usernameById.has(id));
    if (missingParents.length > 0) {
      const parentResult = await pgPool.query<UserRow>(
        `
        SELECT u.id, u.username, u.role::text AS role, u.referral_code, u.parent_id,
               u.admin_sub_role::text AS admin_sub_role, u.direct_managed_count, NULL::text AS nickname
        FROM public.users u
        WHERE u.id = ANY($1::uuid[])
        `,
        [missingParents]
      );
      parentResult.rows.forEach((u) => {
        roleById.set(u.id, (u.role || "player") as ManagedUserRole);
        parentById.set(u.id, u.parent_id);
        usernameById.set(u.id, u.username || u.referral_code || makeShortIdFromUuid(u.id));
      });
    }
  }

  const targetUserIds = new Set(scopedIds);

  const mappedAll: ManagedUserSummary[] = usersResult.rows
    .filter((u) => u.id !== viewerUserId)
    .map((u) => {
      const role = (u.role || "player") as ManagedUserRole;
      const shortId = makeShortIdFromUuid(u.id);
      const username = u.username || u.referral_code || shortId;
      const nickname = u.nickname?.trim() || null;
      const aff = affiliationMap.get(u.id) || null;
      const parentUserId = resolveParentId({
        viewerRole,
        viewerUserId,
        userRole: role,
        parentIdFromUser: u.parent_id,
        aff,
        roleById,
        targetUserIds,
      });
      const { agentUsername, superUsername } = resolveUplineUsernames({
        userRole: role,
        parentId: u.parent_id,
        aff,
        roleById,
        parentById,
        usernameById,
      });

      return {
        id: u.id,
        shortId,
        username,
        nickname,
        displayName: nickname || username,
        role,
        tomanBalance: walletMap.get(u.id) || 0,
        parentUserId,
        agentUsername,
        superUsername,
        managedUserCount:
          role === "agent" || role === "super" ? toAmount(u.direct_managed_count) : 0,
      };
    });

  mappedAll.sort((a, b) => {
    if (a.role === b.role) {
      return a.username.localeCompare(b.username, "fa");
    }
    const order: ManagedUserRole[] = ["admin", "super", "agent", "player"];
    return order.indexOf(a.role) - order.indexOf(b.role);
  });

  const hasSearch = search.trim().length > 0;
  const roleTotals = computeRoleTotals(mappedAll);

  const filtered = filterUsers(mappedAll, { roleFilter, search });
  const totalCount = hasSearch ? filtered.length : roleTotals[roleFilter];

  console.log("[Users] managed-list loaded", {
    viewerRole,
    scopeSize: scopedIds.length,
    resultSize: filtered.length,
    source: "postgresql",
  });

  return {
    currentUserRole: viewerRole,
    users: filtered,
    totalCount,
    roleTotals,
  };
}
