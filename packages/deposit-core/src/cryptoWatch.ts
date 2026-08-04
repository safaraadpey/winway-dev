/**
 * Hot / Warm / Confirmation watch membership for crypto deposit scanning.
 *
 * Priority (exclusive): Confirmation > Hot > Warm > Cold
 * Cold = allocated DB addresses not in Confirmation/Hot/Warm.
 */
import type { Pool } from "pg";
import {
  CRYPTO_REDIS_KEYS,
  CRYPTO_TTL,
  getCryptoRedis,
} from "./cryptoRedis";

export type CryptoWatchTarget = {
  userId: string;
  bep20Address: string;
  trc20Address: string;
  expiresAt?: string;
  tier: "confirm" | "hot" | "warm" | "cold";
};

/** Online window for Warm Watch (matches lobby presence view). */
export const WARM_ONLINE_WINDOW_SQL = `interval '2 minutes'`;

async function loadUserAddresses(
  pool: Pool,
  userId: string
): Promise<{ bep20Address: string; trc20Address: string } | null> {
  const { rows } = await pool.query(
    `
    SELECT bep20_address, trc20_address
    FROM deposit.user_crypto_addresses
    WHERE user_id = $1
    LIMIT 1
    `,
    [userId]
  );
  const row = rows[0];
  if (!row) return null;
  return {
    bep20Address: String(row.bep20_address),
    trc20Address: String(row.trc20_address),
  };
}

async function listSetMembersWithMeta(
  setKey: string,
  metaKey: (userId: string) => string
): Promise<CryptoWatchTarget[]> {
  const redis = getCryptoRedis();
  const userIds = await redis.smembers(setKey);
  const out: CryptoWatchTarget[] = [];

  for (const userId of userIds) {
    const meta = await redis.getJson<CryptoWatchTarget>(metaKey(userId));
    if (!meta?.bep20Address || !meta?.trc20Address) {
      await redis.srem(setKey, userId);
      continue;
    }
    if (meta.expiresAt && new Date(meta.expiresAt).getTime() <= Date.now()) {
      await redis.srem(setKey, userId);
      await redis.del(metaKey(userId));
      continue;
    }
    out.push({
      userId,
      bep20Address: meta.bep20Address,
      trc20Address: meta.trc20Address,
      expiresAt: meta.expiresAt,
      tier: meta.tier,
    });
  }

  return out;
}

/**
 * Touch Hot Watch (1h sliding TTL from last deposit-page activity).
 * Does not override Confirmation membership at scan time (Confirm wins).
 */
export async function touchHotWatch(opts: {
  userId: string;
  bep20Address: string;
  trc20Address: string;
}): Promise<CryptoWatchTarget> {
  const redis = getCryptoRedis();

  // Exclusive: Confirmation wins — refresh confirm safety TTL instead of joining Hot.
  const confirmMeta = await redis.getJson<CryptoWatchTarget>(
    CRYPTO_REDIS_KEYS.confirmMeta(opts.userId)
  );
  const confirmMembers = await redis.smembers(CRYPTO_REDIS_KEYS.CONFIRM_SET);
  if (confirmMembers.includes(opts.userId) || confirmMeta) {
    const expiresAt = new Date(
      Date.now() + CRYPTO_TTL.CONFIRM_WATCH_SEC * 1000
    ).toISOString();
    const payload: CryptoWatchTarget = {
      userId: opts.userId,
      bep20Address: opts.bep20Address,
      trc20Address: opts.trc20Address,
      expiresAt,
      tier: "confirm",
    };
    await redis.sadd(CRYPTO_REDIS_KEYS.CONFIRM_SET, opts.userId);
    await redis.setJson(
      CRYPTO_REDIS_KEYS.confirmMeta(opts.userId),
      payload,
      CRYPTO_TTL.CONFIRM_WATCH_SEC
    );
    console.log("[Payment] hot touch deferred — confirm watch active", {
      userId: opts.userId,
    });
    return payload;
  }

  const expiresAt = new Date(
    Date.now() + CRYPTO_TTL.HOT_WATCH_SEC * 1000
  ).toISOString();

  const payload: CryptoWatchTarget = {
    userId: opts.userId,
    bep20Address: opts.bep20Address,
    trc20Address: opts.trc20Address,
    expiresAt,
    tier: "hot",
  };

  await redis.sadd(CRYPTO_REDIS_KEYS.HOT_SET, opts.userId);
  await redis.setJson(
    CRYPTO_REDIS_KEYS.hotMeta(opts.userId),
    payload,
    CRYPTO_TTL.HOT_WATCH_SEC
  );
  await redis.srem(CRYPTO_REDIS_KEYS.WARM_SET, opts.userId);
  await redis.del(CRYPTO_REDIS_KEYS.warmMeta(opts.userId));

  console.log("[Payment] hot watch touched", {
    userId: opts.userId,
    expiresAt,
    backend: redis.backend,
  });

  return payload;
}

export async function registerConfirmWatch(opts: {
  userId: string;
  bep20Address: string;
  trc20Address: string;
}): Promise<CryptoWatchTarget> {
  const redis = getCryptoRedis();
  const expiresAt = new Date(
    Date.now() + CRYPTO_TTL.CONFIRM_WATCH_SEC * 1000
  ).toISOString();

  const payload: CryptoWatchTarget = {
    userId: opts.userId,
    bep20Address: opts.bep20Address,
    trc20Address: opts.trc20Address,
    expiresAt,
    tier: "confirm",
  };

  await redis.sadd(CRYPTO_REDIS_KEYS.CONFIRM_SET, opts.userId);
  await redis.setJson(
    CRYPTO_REDIS_KEYS.confirmMeta(opts.userId),
    payload,
    CRYPTO_TTL.CONFIRM_WATCH_SEC
  );
  // Exclusive: leave Hot/Warm scan sets (Confirm has priority).
  await redis.srem(CRYPTO_REDIS_KEYS.HOT_SET, opts.userId);
  await redis.del(CRYPTO_REDIS_KEYS.hotMeta(opts.userId));
  await redis.srem(CRYPTO_REDIS_KEYS.WARM_SET, opts.userId);
  await redis.del(CRYPTO_REDIS_KEYS.warmMeta(opts.userId));

  console.log("[Payment] confirm watch registered", {
    userId: opts.userId,
    backend: redis.backend,
  });

  return payload;
}

export async function unregisterConfirmWatch(userId: string): Promise<void> {
  const redis = getCryptoRedis();
  await redis.srem(CRYPTO_REDIS_KEYS.CONFIRM_SET, userId);
  await redis.del(CRYPTO_REDIS_KEYS.confirmMeta(userId));
  console.log("[Payment] confirm watch cleared", { userId });
}

/**
 * Ensure every PENDING crypto deposit user is on Confirmation Watch.
 * DB is source of truth; Redis is the fast scan set.
 */
export async function syncConfirmWatchFromPending(pool: Pool): Promise<number> {
  const { rows } = await pool.query(
    `
    SELECT DISTINCT ON (t.user_id)
      t.user_id,
      a.bep20_address,
      a.trc20_address
    FROM deposit.crypto_transactions t
    JOIN deposit.user_crypto_addresses a ON a.user_id = t.user_id
    WHERE t.status = 'PENDING'
    ORDER BY t.user_id, t.created_at DESC
    `
  );

  const pendingIds = new Set(rows.map((r) => String(r.user_id)));
  for (const r of rows) {
    await registerConfirmWatch({
      userId: String(r.user_id),
      bep20Address: String(r.bep20_address),
      trc20Address: String(r.trc20_address),
    });
  }

  // Drop confirm members with no remaining PENDING rows.
  const redis = getCryptoRedis();
  const members = await redis.smembers(CRYPTO_REDIS_KEYS.CONFIRM_SET);
  for (const userId of members) {
    if (!pendingIds.has(userId)) {
      await unregisterConfirmWatch(userId);
    }
  }

  return pendingIds.size;
}

export async function listConfirmWatchTargets(): Promise<CryptoWatchTarget[]> {
  const targets = await listSetMembersWithMeta(
    CRYPTO_REDIS_KEYS.CONFIRM_SET,
    CRYPTO_REDIS_KEYS.confirmMeta
  );
  return targets.map((t) => ({ ...t, tier: "confirm" as const }));
}

export async function listHotWatchTargets(opts?: {
  excludeUserIds?: Set<string>;
}): Promise<CryptoWatchTarget[]> {
  const exclude = opts?.excludeUserIds ?? new Set<string>();
  const targets = await listSetMembersWithMeta(
    CRYPTO_REDIS_KEYS.HOT_SET,
    CRYPTO_REDIS_KEYS.hotMeta
  );
  return targets
    .filter((t) => !exclude.has(t.userId))
    .map((t) => ({ ...t, tier: "hot" as const }));
}

/**
 * Warm = online players with allocated addresses, not Hot/Confirm.
 * Presence: users.last_seen_at (player shell / lobby ping).
 */
export async function listWarmWatchTargets(
  pool: Pool,
  opts?: { excludeUserIds?: Set<string> }
): Promise<CryptoWatchTarget[]> {
  const exclude = opts?.excludeUserIds ?? new Set<string>();
  const { rows } = await pool.query(
    `
    SELECT a.user_id, a.bep20_address, a.trc20_address
    FROM deposit.user_crypto_addresses a
    JOIN public.users u ON u.id = a.user_id
    WHERE u.status = 'active'
      AND u.last_seen_at > now() - ${WARM_ONLINE_WINDOW_SQL}
    ORDER BY u.last_seen_at DESC
    `
  );

  return rows
    .map((r) => ({
      userId: String(r.user_id),
      bep20Address: String(r.bep20_address),
      trc20Address: String(r.trc20_address),
      tier: "warm" as const,
    }))
    .filter((t) => !exclude.has(t.userId));
}

export async function listColdScanTargets(
  pool: Pool,
  opts: {
    limit: number;
    offset: number;
    excludeUserIds: Set<string>;
  }
): Promise<CryptoWatchTarget[]> {
  const exclude = Array.from(opts.excludeUserIds);
  const { rows } = await pool.query(
    `
    SELECT user_id, bep20_address, trc20_address
    FROM deposit.user_crypto_addresses
    WHERE ($3::uuid[] IS NULL OR cardinality($3::uuid[]) = 0 OR user_id <> ALL($3::uuid[]))
    ORDER BY created_at ASC
    LIMIT $1 OFFSET $2
    `,
    [opts.limit, opts.offset, exclude.length ? exclude : null]
  );

  return rows.map((r) => ({
    userId: String(r.user_id),
    bep20Address: String(r.bep20_address),
    trc20Address: String(r.trc20_address),
    tier: "cold" as const,
  }));
}

/** After PENDING insert — promote user to Confirmation Watch. */
export async function promoteUserToConfirmWatch(
  pool: Pool,
  userId: string
): Promise<void> {
  const addrs = await loadUserAddresses(pool, userId);
  if (!addrs) {
    console.warn("[Payment] confirm watch skip — no addresses", { userId });
    return;
  }
  await registerConfirmWatch({ userId, ...addrs });
}

export async function clearConfirmIfNoPending(
  pool: Pool,
  userId: string
): Promise<void> {
  const { rows } = await pool.query(
    `
    SELECT 1 FROM deposit.crypto_transactions
    WHERE user_id = $1 AND status = 'PENDING'
    LIMIT 1
    `,
    [userId]
  );
  if (rows.length === 0) {
    await unregisterConfirmWatch(userId);
  }
}
