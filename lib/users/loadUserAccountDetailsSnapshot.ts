import { pgPool } from "@/lib/pg";
import { loadPerformanceDailyStatsSum } from "@/lib/dashboard/loadPerformanceDailyStatsSum";
import type { PerformanceLifetimeRole } from "@/lib/dashboard/loadPerformanceLifetimeStats";
import { getTehranWeekSnapshotDateRange } from "@/lib/dashboard/tehranAccountingWindow";
import type { AdminSubRole } from "@/lib/auth-helpers";
import type {
  UserAccountActivity,
  UserAccountData,
  UserAccountInfo,
  UserAccountPeriod,
  UserAccountTransaction,
} from "@/src/types/user-account";
import {
  getWithdrawalStatusLabel,
  type WithdrawalRequestStatus,
} from "@/src/types/withdrawal";

export type LoadUserAccountDetailsSnapshotParams = {
  targetUserId: string;
  viewerUserId: string;
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
  const n = Number(value ?? 0);
  return Number.isFinite(n) ? n : 0;
}

function emptyUserAccountActivity(period: UserAccountPeriod): UserAccountActivity {
  return {
    period,
    gamesPlayed: 0,
    lineWins: 0,
    fullWins: 0,
    commission: 0,
    commissionTotal: null,
    deposits: 0,
    withdrawals: 0,
    net: 0,
  };
}

function mapWeekActivity(data: Awaited<ReturnType<typeof loadPerformanceDailyStatsSum>>): UserAccountActivity {
  return {
    period: "week",
    gamesPlayed: data.gamesPlayed,
    lineWins: data.lineWins,
    fullWins: data.fullWins,
    playerWinnings: data.playerWinnings,
    playerPurchases: data.playerPurchases,
    commission: data.commission,
    commissionTotal: data.commissionTotal,
    deposits: data.deposits,
    withdrawals: data.withdrawals,
    net: data.net,
  };
}

function classifyDepositDomainTitle(
  idempotencyKey: string | null | undefined,
  sourceKind?: string | null
): {
  category: "gateway_deposit" | "crypto_deposit";
  title: string;
} {
  if (sourceKind === "crypto_deposit") {
    return { category: "crypto_deposit", title: "خرید تتری" };
  }
  const key = String(idempotencyKey ?? "");
  if (key.startsWith("deposit:tron:") || key.startsWith("deposit:crypto:")) {
    return { category: "crypto_deposit", title: "خرید تتری" };
  }
  if (key.startsWith("deposit:fiat:")) {
    return { category: "gateway_deposit", title: "خرید درگاه" };
  }
  return { category: "gateway_deposit", title: "خرید درگاه" };
}

type ProfileRow = {
  id: string;
  username: string | null;
  role: string;
  last_login_at: string | null;
  parent_id: string | null;
  status: string | null;
  admin_sub_role: string | null;
  ding_balance: string | number | null;
  toman_balance: string | number | null;
  nickname: string | null;
  agent_commission: string | number | null;
  super_commission: string | number | null;
  agent_id: string | null;
  super_id: string | null;
  aff_agent_username: string | null;
  aff_super_username: string | null;
  parent_username: string | null;
  parent_role: string | null;
  parent_parent_id: string | null;
  parent_super_id: string | null;
  parent_super_username: string | null;
  personal_note: string | null;
};

function resolveUplineFromProfile(row: ProfileRow): {
  agentId: string | null;
  agentUsername: string | null;
  agentShortId: string | null;
  superId: string | null;
  superUsername: string | null;
  superShortId: string | null;
} {
  let agentId: string | null = row.agent_id;
  let agentUsername: string | null = row.aff_agent_username;
  let superId: string | null = row.super_id;
  let superUsername: string | null = row.aff_super_username;

  if (row.role === "player" && !row.agent_id && !row.super_id && row.parent_id) {
    if (row.parent_role === "agent") {
      agentId = row.parent_id;
      agentUsername = row.parent_username;
      if (row.parent_super_id) {
        superId = row.parent_super_id;
        superUsername = row.parent_super_username;
      }
    } else if (row.parent_role === "super") {
      superId = row.parent_id;
      superUsername = row.parent_username;
    }
  }

  if (row.role === "agent" && !superId && row.parent_id && row.parent_role === "super") {
    superId = row.parent_id;
    superUsername = row.parent_username;
  }

  return {
    agentId,
    agentUsername,
    agentShortId: agentId ? makeShortIdFromUuid(agentId) : null,
    superId,
    superUsername,
    superShortId: superId ? makeShortIdFromUuid(superId) : null,
  };
}

function mapProfileRow(
  row: ProfileRow,
  subordinateAssets: UserAccountInfo["subordinateAssets"]
): UserAccountInfo {
  const username = row.username || "نامشخص";
  const displayName = (row.nickname || "").trim() || username;
  const upline = resolveUplineFromProfile(row);

  let commissionPercent: number | null = null;
  if (row.role === "agent" && row.agent_commission != null) {
    commissionPercent = toAmount(row.agent_commission) * 100;
  } else if (row.role === "super" && row.super_commission != null) {
    commissionPercent = toAmount(row.super_commission) * 100;
  }

  return {
    id: row.id,
    shortId: makeShortIdFromUuid(row.id),
    username,
    displayName,
    role: row.role as UserAccountInfo["role"],
    adminSubRole: (row.admin_sub_role as AdminSubRole | null) ?? null,
    parentId: row.parent_id,
    dingBalance: toAmount(row.ding_balance),
    tomanBalance: toAmount(row.toman_balance),
    lastLoginAt: row.last_login_at,
    agentId: upline.agentId,
    agentUsername: upline.agentUsername,
    agentShortId: upline.agentShortId,
    superId: upline.superId,
    superUsername: upline.superUsername,
    superShortId: upline.superShortId,
    personalNote: row.personal_note,
    isSuspended: row.status === "suspended",
    commissionPercent,
    subordinateAssets,
  };
}

async function loadProfileRow(
  targetUserId: string,
  viewerUserId: string
): Promise<ProfileRow | null> {
  if (!pgPool) {
    console.error("[UserAccount] profile skipped: no PostgreSQL pool");
    return null;
  }

  const result = await pgPool.query<ProfileRow>(
    `
    SELECT
      u.id,
      u.username,
      u.role,
      u.last_login_at,
      u.parent_id,
      u.status,
      u.admin_sub_role,
      COALESCE(db.balance, 0) AS ding_balance,
      COALESCE(w.balance, 0) AS toman_balance,
      up.nickname,
      uc.agent_commission,
      uc.super_commission,
      pa.agent_id,
      pa.super_id,
      aff_agent.username AS aff_agent_username,
      aff_super.username AS aff_super_username,
      parent.username AS parent_username,
      parent.role AS parent_role,
      parent.parent_id AS parent_parent_id,
      parent_super.id AS parent_super_id,
      parent_super.username AS parent_super_username,
      un.note AS personal_note
    FROM public.users u
    LEFT JOIN public.ding_balances db ON db.user_id = u.id
    LEFT JOIN public.wallets w ON w.user_id = u.id AND w.currency = 'IRR'
    LEFT JOIN public.user_profiles up ON up.user_id = u.id
    LEFT JOIN public.user_commissions uc ON uc.user_id = u.id
    LEFT JOIN public.player_affiliation pa ON pa.user_id = u.id
    LEFT JOIN public.users aff_agent ON aff_agent.id = pa.agent_id
    LEFT JOIN public.users aff_super ON aff_super.id = pa.super_id
    LEFT JOIN public.users parent ON parent.id = u.parent_id
    LEFT JOIN public.users parent_super
      ON parent_super.id = parent.parent_id
     AND parent_super.role = 'super'
    LEFT JOIN public.user_notes un
      ON un.user_id = u.id
     AND un.author_id = $2::uuid
    WHERE u.id = $1::uuid
    LIMIT 1
    `,
    [targetUserId, viewerUserId]
  );

  return result.rows[0] ?? null;
}

async function loadSubordinateAssetsSum(
  userId: string,
  role: "super" | "agent"
): Promise<{ tomanBalance: number }> {
  if (!pgPool) {
    return { tomanBalance: 0 };
  }

  const sql =
    role === "agent"
      ? `
        WITH scoped AS (
          SELECT u.id
          FROM public.users u
          WHERE u.parent_id = $1::uuid
            AND u.role = 'player'
          UNION
          SELECT pa.user_id AS id
          FROM public.player_affiliation pa
          WHERE pa.agent_id = $1::uuid
            AND pa.user_id IS NOT NULL
        )
        SELECT
          COALESCE(SUM(w.balance), 0) AS subordinate_toman,
          COUNT(DISTINCT scoped.id) AS member_count
        FROM scoped
        LEFT JOIN public.wallets w
          ON w.user_id = scoped.id
         AND w.currency = 'IRR'
      `
      : `
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
            AND pa.user_id IS NOT NULL
          UNION
          SELECT pa.agent_id AS id
          FROM public.player_affiliation pa
          WHERE pa.super_id = $1::uuid
            AND pa.agent_id IS NOT NULL
        )
        SELECT
          COALESCE(SUM(w.balance), 0) AS subordinate_toman,
          COUNT(DISTINCT scoped.id) AS member_count
        FROM scoped
        LEFT JOIN public.wallets w
          ON w.user_id = scoped.id
         AND w.currency = 'IRR'
      `;

  const result = await pgPool.query<{ subordinate_toman: string | number; member_count: string | number }>(
    sql,
    [userId]
  );

  const row = result.rows[0];
  const tomanBalance = toAmount(row?.subordinate_toman);
  const memberCount = toAmount(row?.member_count);

  console.info("[UserAccount] subordinate assets loaded (pg)", {
    userId,
    role,
    memberCount,
    tomanBalance,
    source: "postgresql",
  });

  return { tomanBalance };
}

type PanelTxRow = {
  id: string;
  amount: string | number | null;
  type: string;
  source_kind: string;
  created_at: string;
  actor_id: string | null;
  actor_username: string | null;
  actor_role: string | null;
};

type DepositTxRow = {
  id: string;
  amount: string | number | null;
  created_at: string;
  idempotency_key: string | null;
  source_kind: string | null;
};

type WithdrawalTxRow = {
  id: string;
  amount: string | number | null;
  kind: string | null;
  created_at: string;
  crypto_symbol: string | null;
  network: string | null;
  status: string | null;
};

async function loadPanelTransactionsPg(userId: string): Promise<UserAccountTransaction[]> {
  if (!pgPool) return [];

  const result = await pgPool.query<PanelTxRow>(
    `
    SELECT
      t.id,
      t.amount,
      t.type,
      t.source_kind,
      t.created_at,
      actor.id AS actor_id,
      actor.username AS actor_username,
      actor.role AS actor_role
    FROM public.transactions t
    LEFT JOIN public.users actor ON actor.id = CASE
      WHEN t.source_kind = 'admin_panel_transfer' THEN NULLIF(t.meta->>'actor_id', '')::uuid
      ELSE NULLIF(t.source_ref, '')::uuid
    END
    WHERE t.source_kind IN ('manual_panel', 'admin_panel_transfer')
      AND t.type IN ('deposit', 'withdraw', 'transfer_in', 'transfer_out')
      AND (t.user_id = $1::uuid OR t.source_ref = $1::text)
      AND actor.id IS NOT NULL
    ORDER BY t.created_at DESC
    LIMIT 50
    `,
    [userId]
  );

  return result.rows.map((row) => {
    const mappedType: "deposit" | "withdraw" =
      row.type === "deposit" || row.type === "transfer_in" ? "deposit" : "withdraw";
    const actorId = row.actor_id as string;
    return {
      id: row.id,
      amount: toAmount(row.amount),
      type: mappedType,
      category: "panel" as const,
      title: mappedType === "deposit" ? "واریز پنل" : "برداشت پنل",
      actorRole: row.actor_role as "admin" | "agent" | "super",
      actorId,
      actorShortId: makeShortIdFromUuid(actorId),
      actorUsername: row.actor_username || "نامشخص",
      createdAt: row.created_at,
    };
  });
}

async function loadDepositTransactionsPg(userId: string): Promise<UserAccountTransaction[]> {
  if (!pgPool) return [];

  const result = await pgPool.query<DepositTxRow>(
    `
    SELECT id, amount, created_at, idempotency_key, source_kind
    FROM public.transactions
    WHERE user_id = $1::uuid
      AND type = 'deposit'
      AND source_kind IN ('deposit_domain', 'crypto_deposit')
    ORDER BY created_at DESC
    LIMIT 50
    `,
    [userId]
  );

  return result.rows.map((row) => {
    const { category, title } = classifyDepositDomainTitle(row.idempotency_key, row.source_kind);
    return {
      id: row.id,
      amount: toAmount(row.amount),
      type: "deposit" as const,
      category,
      title,
      createdAt: row.created_at,
    };
  });
}

async function loadWithdrawalTransactionsPg(userId: string): Promise<UserAccountTransaction[]> {
  if (!pgPool) return [];

  const result = await pgPool.query<WithdrawalTxRow>(
    `
    SELECT id, amount, kind, created_at, crypto_symbol, network, status
    FROM public.withdrawal_requests
    WHERE player_id = $1::uuid
    ORDER BY created_at DESC
    LIMIT 50
    `,
    [userId]
  );

  return result.rows.map((row) => {
    const isCrypto = row.kind === "crypto";
    const symbol = String(row.crypto_symbol || "USDT").toUpperCase();
    const network = String(row.network || "").toUpperCase();
    const statusLabel = getWithdrawalStatusLabel(
      (row.status || "pending") as WithdrawalRequestStatus
    );
    const baseTitle = isCrypto
      ? network
        ? `برداشت ${symbol} (${network})`
        : `برداشت ${symbol}`
      : "درخواست برداشت";
    return {
      id: String(row.id),
      amount: toAmount(row.amount),
      type: "withdraw" as const,
      category: "withdrawal" as const,
      title: `${baseTitle} — ${statusLabel}`,
      createdAt: row.created_at,
    };
  });
}

async function loadTransactionsBundle(userId: string): Promise<UserAccountTransaction[]> {
  const [panelTransactions, depositTransactions, withdrawalTransactions] = await Promise.all([
    loadPanelTransactionsPg(userId),
    loadDepositTransactionsPg(userId),
    loadWithdrawalTransactionsPg(userId),
  ]);

  const merged = [...panelTransactions, ...depositTransactions, ...withdrawalTransactions].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );

  return merged.slice(0, 50);
}

async function loadWeekActivityBundle(
  userId: string,
  role: PerformanceLifetimeRole
): Promise<UserAccountActivity> {
  const { fromSnapshotDate, throughSnapshotDate } = getTehranWeekSnapshotDateRange();
  const stats = await loadPerformanceDailyStatsSum({
    userId,
    role,
    fromSnapshotDate,
    throughSnapshotDate,
  });
  return mapWeekActivity(stats);
}

/**
 * PostgreSQL snapshot for user account detail page (profile, week stats, transactions).
 */
export async function loadUserAccountDetailsSnapshot(
  params: LoadUserAccountDetailsSnapshotParams
): Promise<UserAccountData | null> {
  const startedAt = Date.now();
  const { targetUserId, viewerUserId } = params;

  if (!pgPool) {
    console.error("[UserAccount] details snapshot skipped: no PostgreSQL pool");
    return null;
  }

  const profileStarted = Date.now();
  const profileRow = await loadProfileRow(targetUserId, viewerUserId);
  const profileMs = Date.now() - profileStarted;

  if (!profileRow) {
    return null;
  }

  const role = profileRow.role as PerformanceLifetimeRole;
  if (role !== "player" && role !== "agent" && role !== "super" && role !== "admin") {
    console.warn("[UserAccount] details snapshot unsupported target role", {
      targetUserId,
      role,
    });
    return null;
  }

  const parallelStarted = Date.now();
  const [subordinateAssets, weekActivity, transactions] = await Promise.all([
    role === "super" || role === "agent"
      ? loadSubordinateAssetsSum(targetUserId, role)
      : Promise.resolve(null),
    loadWeekActivityBundle(targetUserId, role),
    loadTransactionsBundle(targetUserId),
  ]);
  const parallelMs = Date.now() - parallelStarted;

  const user = mapProfileRow(profileRow, subordinateAssets);

  const activities: Record<UserAccountPeriod, UserAccountActivity> = {
    day: emptyUserAccountActivity("day"),
    week: weekActivity,
    month: emptyUserAccountActivity("month"),
    overall: emptyUserAccountActivity("overall"),
  };

  console.info("[UserAccount] details snapshot loaded", {
    userId: targetUserId,
    role,
    profileMs,
    parallelMs,
    totalMs: Date.now() - startedAt,
    transactionCount: transactions.length,
    subordinateToman: subordinateAssets?.tomanBalance ?? null,
    source: "postgresql",
  });

  return {
    user,
    activities,
    transactions,
  };
}
