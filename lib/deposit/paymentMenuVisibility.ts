/**
 * Player payment menu visibility — PostgreSQL source of truth.
 * wallet_buy: reports/wallet «خرید» entry
 * buy_rial: «خرید ریالی» under wallet buy
 */
import type { Pool, PoolClient } from "pg";

export const PAYMENT_MENU_KEYS = ["wallet_buy", "buy_rial"] as const;
export type PaymentMenuKey = (typeof PAYMENT_MENU_KEYS)[number];
export type PaymentMenuMode = "all" | "allowlist";
export type OperatorRole = "agent" | "super";

export type PaymentMenuOperator = {
  id: string;
  username: string;
  nickname: string | null;
  role: OperatorRole;
};

export type PaymentMenuPolicyState = {
  mode: PaymentMenuMode;
  operatorIds: string[];
};

export type PaymentMenuAdminSnapshot = {
  operators: PaymentMenuOperator[];
  menus: Record<PaymentMenuKey, PaymentMenuPolicyState>;
};

export type PlayerPaymentMenus = {
  walletBuy: boolean;
  buyRial: boolean;
};

type Queryable = Pool | PoolClient;

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const CACHE_TTL_MS = 5_000;
const MAX_CACHE_ENTRIES = 512;

type CacheEntry = {
  menus: PlayerPaymentMenus;
  expiresAtMs: number;
};

const playerMenuCache = new Map<string, CacheEntry>();

function pruneCacheIfNeeded() {
  if (playerMenuCache.size <= MAX_CACHE_ENTRIES) return;
  const oldestKey = playerMenuCache.keys().next().value;
  if (oldestKey) playerMenuCache.delete(oldestKey);
}

export function invalidatePlayerPaymentMenus(userId?: string | null) {
  if (userId) {
    playerMenuCache.delete(userId);
    return;
  }
  playerMenuCache.clear();
}

function emptyMenus(): Record<PaymentMenuKey, PaymentMenuPolicyState> {
  return {
    wallet_buy: { mode: "all", operatorIds: [] },
    buy_rial: { mode: "all", operatorIds: [] },
  };
}

function isMenuKey(value: unknown): value is PaymentMenuKey {
  return (
    typeof value === "string" &&
    (PAYMENT_MENU_KEYS as readonly string[]).includes(value)
  );
}

export function isPaymentMenuKey(value: unknown): value is PaymentMenuKey {
  return isMenuKey(value);
}

export async function listPaymentMenuAdminSnapshot(
  db: Queryable
): Promise<PaymentMenuAdminSnapshot> {
  const [operatorsRes, policyRes, allowRes] = await Promise.all([
    db.query<{
      id: string;
      username: string | null;
      nickname: string | null;
      role: string;
    }>(
      `
      SELECT u.id::text AS id,
             u.username,
             p.nickname,
             u.role::text AS role
      FROM public.users u
      LEFT JOIN public.user_profiles p ON p.user_id = u.id
      WHERE u.role::text IN ('agent', 'super')
      ORDER BY CASE WHEN u.role::text = 'super' THEN 0 ELSE 1 END,
               COALESCE(p.nickname, u.username, '') ASC
      `
    ),
    db.query<{ menu_key: string; mode: string }>(
      `SELECT menu_key, mode FROM deposit.payment_menu_policy`
    ),
    db.query<{ menu_key: string; operator_id: string }>(
      `SELECT menu_key, operator_id::text AS operator_id
       FROM deposit.payment_menu_operators`
    ),
  ]);

  const menus = emptyMenus();
  for (const row of policyRes.rows) {
    if (!isMenuKey(row.menu_key)) continue;
    menus[row.menu_key].mode =
      row.mode === "allowlist" ? "allowlist" : "all";
  }
  for (const row of allowRes.rows) {
    if (!isMenuKey(row.menu_key)) continue;
    menus[row.menu_key].operatorIds.push(row.operator_id);
  }

  const operators: PaymentMenuOperator[] = operatorsRes.rows
    .filter((r) => r.role === "agent" || r.role === "super")
    .map((r) => ({
      id: r.id,
      username: r.username ?? "",
      nickname: r.nickname,
      role: r.role === "super" ? "super" : "agent",
    }));

  return { operators, menus };
}

type MenuInput = {
  mode: PaymentMenuMode;
  operatorIds: string[];
};

export async function replacePaymentMenuPolicies(
  db: Pool,
  input: Record<PaymentMenuKey, MenuInput>,
  actorUserId: string
): Promise<PaymentMenuAdminSnapshot> {
  for (const key of PAYMENT_MENU_KEYS) {
    const menu = input[key];
    if (!menu || (menu.mode !== "all" && menu.mode !== "allowlist")) {
      throw new Error("invalid_mode");
    }
    if (!Array.isArray(menu.operatorIds)) {
      throw new Error("operator_ids_required");
    }
    if (menu.operatorIds.length > 2000) {
      throw new Error("too_many_operators");
    }
    for (const id of menu.operatorIds) {
      if (typeof id !== "string" || !UUID_RE.test(id)) {
        throw new Error("invalid_operator_id");
      }
    }
  }

  const client = await db.connect();
  try {
    await client.query("BEGIN");

    const allIds = [
      ...new Set(
        PAYMENT_MENU_KEYS.flatMap((k) => input[k].operatorIds)
      ),
    ];

    const roleById = new Map<string, OperatorRole>();
    if (allIds.length > 0) {
      const { rows } = await client.query<{ id: string; role: string }>(
        `
        SELECT id::text AS id, role::text AS role
        FROM public.users
        WHERE id = ANY($1::uuid[])
          AND role::text IN ('agent', 'super')
        `,
        [allIds]
      );
      for (const row of rows) {
        if (row.role === "agent" || row.role === "super") {
          roleById.set(row.id, row.role);
        }
      }
      if (roleById.size !== allIds.length) {
        throw new Error("invalid_operator_id");
      }
    }

    for (const key of PAYMENT_MENU_KEYS) {
      const menu = input[key];
      await client.query(
        `
        INSERT INTO deposit.payment_menu_policy (menu_key, mode, updated_at, updated_by)
        VALUES ($1, $2, now(), $3::uuid)
        ON CONFLICT (menu_key) DO UPDATE
          SET mode = EXCLUDED.mode,
              updated_at = now(),
              updated_by = EXCLUDED.updated_by
        `,
        [key, menu.mode, actorUserId]
      );

      await client.query(
        `DELETE FROM deposit.payment_menu_operators WHERE menu_key = $1`,
        [key]
      );

      const uniqueIds = [...new Set(menu.operatorIds)];
      for (const operatorId of uniqueIds) {
        const role = roleById.get(operatorId);
        if (!role) continue;
        await client.query(
          `
          INSERT INTO deposit.payment_menu_operators (
            menu_key, operator_id, operator_role, created_by
          ) VALUES ($1, $2::uuid, $3, $4::uuid)
          `,
          [key, operatorId, role, actorUserId]
        );
      }
    }

    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }

  invalidatePlayerPaymentMenus();
  return listPaymentMenuAdminSnapshot(db);
}

async function loadPlayerUpline(
  db: Queryable,
  userId: string
): Promise<{ agentId: string | null; superId: string | null }> {
  const aff = await db.query<{
    agent_id: string | null;
    super_id: string | null;
  }>(
    `
    SELECT agent_id::text AS agent_id, super_id::text AS super_id
    FROM public.player_affiliation
    WHERE user_id = $1::uuid
    LIMIT 1
    `,
    [userId]
  );
  if (aff.rows[0]) {
    return {
      agentId: aff.rows[0].agent_id,
      superId: aff.rows[0].super_id,
    };
  }

  const parent = await db.query<{
    parent_id: string | null;
    parent_role: string | null;
    grandparent_id: string | null;
    grandparent_role: string | null;
  }>(
    `
    SELECT p.id::text AS parent_id,
           p.role::text AS parent_role,
           gp.id::text AS grandparent_id,
           gp.role::text AS grandparent_role
    FROM public.users u
    LEFT JOIN public.users p ON p.id = u.parent_id
    LEFT JOIN public.users gp ON gp.id = p.parent_id
    WHERE u.id = $1::uuid
    LIMIT 1
    `,
    [userId]
  );
  const row = parent.rows[0];
  if (!row) return { agentId: null, superId: null };

  let agentId: string | null = null;
  let superId: string | null = null;
  if (row.parent_role === "agent") agentId = row.parent_id;
  if (row.parent_role === "super") superId = row.parent_id;
  if (row.grandparent_role === "super") superId = row.grandparent_id;
  return { agentId, superId };
}

function matchesAllowlist(
  upline: { agentId: string | null; superId: string | null },
  operatorIds: string[]
): boolean {
  const allowed = new Set(operatorIds);
  if (upline.agentId && allowed.has(upline.agentId)) return true;
  if (upline.superId && allowed.has(upline.superId)) return true;
  return false;
}

export async function getPlayerPaymentMenus(
  db: Queryable,
  userId: string,
  opts?: { fresh?: boolean }
): Promise<PlayerPaymentMenus> {
  if (!userId) {
    return { walletBuy: false, buyRial: false };
  }

  if (!opts?.fresh) {
    const cached = playerMenuCache.get(userId);
    if (cached && cached.expiresAtMs > Date.now()) {
      return cached.menus;
    }
  }

  const [policyRes, allowRes, upline] = await Promise.all([
    db.query<{ menu_key: string; mode: string }>(
      `SELECT menu_key, mode FROM deposit.payment_menu_policy`
    ),
    db.query<{ menu_key: string; operator_id: string }>(
      `SELECT menu_key, operator_id::text AS operator_id
       FROM deposit.payment_menu_operators`
    ),
    loadPlayerUpline(db, userId),
  ]);

  const policies = emptyMenus();
  for (const row of policyRes.rows) {
    if (!isMenuKey(row.menu_key)) continue;
    policies[row.menu_key].mode =
      row.mode === "allowlist" ? "allowlist" : "all";
  }
  for (const row of allowRes.rows) {
    if (!isMenuKey(row.menu_key)) continue;
    policies[row.menu_key].operatorIds.push(row.operator_id);
  }

  const evalMenu = (key: PaymentMenuKey): boolean => {
    const policy = policies[key];
    if (policy.mode !== "allowlist") return true;
    return matchesAllowlist(upline, policy.operatorIds);
  };

  const menus: PlayerPaymentMenus = {
    walletBuy: evalMenu("wallet_buy"),
    buyRial: evalMenu("buy_rial"),
  };

  playerMenuCache.set(userId, {
    menus,
    expiresAtMs: Date.now() + CACHE_TTL_MS,
  });
  pruneCacheIfNeeded();

  console.log("[Payment] menu visibility evaluate", {
    userId,
    walletBuy: menus.walletBuy,
    buyRial: menus.buyRial,
    agentId: upline.agentId,
    superId: upline.superId,
    source: "postgres",
  });

  return menus;
}

export async function assertPlayerPaymentMenu(
  db: Queryable,
  userId: string,
  menuKey: PaymentMenuKey
): Promise<void> {
  const menus = await getPlayerPaymentMenus(db, userId, { fresh: true });
  const allowed = menuKey === "buy_rial" ? menus.buyRial : menus.walletBuy;
  if (!allowed) {
    console.log("[Payment] menu visibility denied", { userId, menuKey });
    throw new Error("payment_menu_forbidden");
  }
}
