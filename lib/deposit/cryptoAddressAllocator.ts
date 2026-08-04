/**
 * Thread-safe per-user crypto deposit address allocation.
 */
import type { Pool, PoolClient } from "pg";
import { deriveUserCryptoAddresses } from "@/lib/deposit/cryptoHdDerive";
import { getCryptoXpubSettings } from "@/lib/deposit/cryptoXpubSettings";

/** Advisory lock key namespace for crypto address allocator */
const ALLOCATOR_LOCK_KEY = 8347291;

export type UserCryptoAddresses = {
  id: string;
  userId: string;
  derivationIndex: number;
  bep20Address: string;
  trc20Address: string;
  createdAt: string;
};

function mapRow(r: Record<string, unknown>): UserCryptoAddresses {
  return {
    id: String(r.id),
    userId: String(r.user_id),
    derivationIndex: Number(r.derivation_index),
    bep20Address: String(r.bep20_address),
    trc20Address: String(r.trc20_address),
    createdAt: String(r.created_at),
  };
}

async function fetchByUserId(
  client: PoolClient,
  userId: string
): Promise<UserCryptoAddresses | null> {
  const { rows } = await client.query(
    `
    SELECT id, user_id, derivation_index, bep20_address, trc20_address, created_at
    FROM deposit.user_crypto_addresses
    WHERE user_id = $1
    LIMIT 1
    `,
    [userId]
  );
  if (!rows[0]) return null;
  return mapRow(rows[0] as Record<string, unknown>);
}

async function allocateNewAddresses(
  client: PoolClient,
  userId: string
): Promise<UserCryptoAddresses> {
  await client.query(`SELECT pg_advisory_xact_lock($1)`, [ALLOCATOR_LOCK_KEY]);

  const settings = await getCryptoXpubSettings(client);
  if (!settings.bep20Xpub || !settings.trc20Xpub) {
    throw new Error("xpub_not_configured");
  }

  const idxRes = await client.query(
    `
    UPDATE deposit.crypto_derivation_state
    SET last_derivation_index = last_derivation_index + 1,
        updated_at = now()
    WHERE id = true
    RETURNING last_derivation_index
    `
  );
  const newIndex = Number(idxRes.rows[0]?.last_derivation_index);
  if (!Number.isInteger(newIndex) || newIndex < 0) {
    throw new Error("derivation_index_failed");
  }

  const { bep20Address, trc20Address } = deriveUserCryptoAddresses(
    settings.bep20Xpub,
    settings.trc20Xpub,
    newIndex
  );

  console.log("[Payment] allocating crypto addresses", {
    userId,
    derivationIndex: newIndex,
    bep20Address,
    trc20Address,
  });

  const { rows } = await client.query(
    `
    INSERT INTO deposit.user_crypto_addresses (
      user_id, derivation_index, bep20_address, trc20_address
    ) VALUES ($1, $2, $3, $4)
    RETURNING id, user_id, derivation_index, bep20_address, trc20_address, created_at
    `,
    [userId, newIndex, bep20Address, trc20Address]
  );

  return mapRow(rows[0] as Record<string, unknown>);
}

/**
 * Idempotent: returns existing addresses or allocates new ones under DB lock.
 */
export async function getOrGenerateUserAddresses(
  pool: Pool,
  userId: string
): Promise<UserCryptoAddresses> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const existing = await fetchByUserId(client, userId);
    if (existing) {
      await client.query("COMMIT");
      console.log("[Payment] crypto addresses cache hit", { userId });
      return existing;
    }

    const created = await allocateNewAddresses(client, userId);
    await client.query("COMMIT");
    return created;
  } catch (err: unknown) {
    await client.query("ROLLBACK");

    const pgErr = err as { code?: string };
    if (pgErr?.code === "23505") {
      const retryClient = await pool.connect();
      try {
        const again = await fetchByUserId(retryClient, userId);
        if (again) {
          console.log("[Payment] crypto addresses race resolved", { userId });
          return again;
        }
      } finally {
        retryClient.release();
      }
    }

    console.error("[Payment] getOrGenerateUserAddresses failed", err);
    throw err;
  } finally {
    client.release();
  }
}

export async function getUserCryptoAddressesByUserId(
  pool: Pool,
  userId: string
): Promise<UserCryptoAddresses | null> {
  const client = await pool.connect();
  try {
    return await fetchByUserId(client, userId);
  } finally {
    client.release();
  }
}
