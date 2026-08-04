/**
 * Admin XPUB + confirmation threshold settings (PostgreSQL source of truth).
 */
import type { Pool, PoolClient } from "pg";
import {
  assertValidXpub,
  deriveUserCryptoAddresses,
} from "@/lib/deposit/cryptoHdDerive";

type Queryable = Pool | PoolClient;

export const DEFAULT_BEP20_CONFIRMATIONS = 12;
export const DEFAULT_TRON_CONFIRMATIONS = 1;

export type CryptoXpubSettings = {
  bep20Xpub: string | null;
  trc20Xpub: string | null;
  bep20Confirmations: number;
  tronConfirmations: number;
  updatedAt: string | null;
};

function clampConfirmations(n: number, fallback: number): number {
  if (!Number.isFinite(n)) return fallback;
  const v = Math.floor(n);
  if (v < 1) return 1;
  if (v > 256) return 256;
  return v;
}

function mapRow(r: Record<string, unknown> | undefined): CryptoXpubSettings {
  return {
    bep20Xpub: r?.bep20_xpub ? String(r.bep20_xpub) : null,
    trc20Xpub: r?.trc20_xpub ? String(r.trc20_xpub) : null,
    bep20Confirmations: clampConfirmations(
      Number(r?.bep20_confirmations ?? DEFAULT_BEP20_CONFIRMATIONS),
      DEFAULT_BEP20_CONFIRMATIONS
    ),
    tronConfirmations: clampConfirmations(
      Number(r?.tron_confirmations ?? DEFAULT_TRON_CONFIRMATIONS),
      DEFAULT_TRON_CONFIRMATIONS
    ),
    updatedAt: r?.updated_at ? String(r.updated_at) : null,
  };
}

export async function getCryptoXpubSettings(
  db: Queryable
): Promise<CryptoXpubSettings> {
  const { rows } = await db.query(
    `
    SELECT bep20_xpub, trc20_xpub, bep20_confirmations, tron_confirmations, updated_at
    FROM deposit.crypto_xpub_settings
    WHERE id = true
    LIMIT 1
    `
  );
  return mapRow(rows[0] as Record<string, unknown> | undefined);
}

export async function getCryptoConfirmationRules(db: Queryable): Promise<{
  bep20Confirmations: number;
  tronConfirmations: number;
}> {
  const s = await getCryptoXpubSettings(db);
  return {
    bep20Confirmations: s.bep20Confirmations,
    tronConfirmations: s.tronConfirmations,
  };
}

export async function saveCryptoXpubSettings(
  db: Queryable,
  input: {
    bep20Xpub: string;
    trc20Xpub: string;
    bep20Confirmations?: number;
    tronConfirmations?: number;
    updatedBy?: string | null;
  }
): Promise<CryptoXpubSettings> {
  assertValidXpub(input.bep20Xpub, "bep20_xpub");
  assertValidXpub(input.trc20Xpub, "trc20_xpub");

  const bep20 = input.bep20Xpub.trim();
  const trc20 = input.trc20Xpub.trim();
  const bep20Confirmations = clampConfirmations(
    Number(input.bep20Confirmations ?? DEFAULT_BEP20_CONFIRMATIONS),
    DEFAULT_BEP20_CONFIRMATIONS
  );
  const tronConfirmations = clampConfirmations(
    Number(input.tronConfirmations ?? DEFAULT_TRON_CONFIRMATIONS),
    DEFAULT_TRON_CONFIRMATIONS
  );

  // Smoke-test derivation at index 0 before persisting
  deriveUserCryptoAddresses(bep20, trc20, 0);

  const { rows } = await db.query(
    `
    INSERT INTO deposit.crypto_xpub_settings (
      id, bep20_xpub, trc20_xpub, bep20_confirmations, tron_confirmations, updated_by
    )
    VALUES (true, $1, $2, $3, $4, $5)
    ON CONFLICT (id) DO UPDATE SET
      bep20_xpub = EXCLUDED.bep20_xpub,
      trc20_xpub = EXCLUDED.trc20_xpub,
      bep20_confirmations = EXCLUDED.bep20_confirmations,
      tron_confirmations = EXCLUDED.tron_confirmations,
      updated_by = EXCLUDED.updated_by,
      updated_at = now()
    RETURNING bep20_xpub, trc20_xpub, bep20_confirmations, tron_confirmations, updated_at
    `,
    [
      bep20,
      trc20,
      bep20Confirmations,
      tronConfirmations,
      input.updatedBy ?? null,
    ]
  );

  console.log("[Payment] crypto XPUB/confirmation settings saved", {
    bep20Confirmations,
    tronConfirmations,
  });
  return mapRow(rows[0] as Record<string, unknown>);
}

export function maskXpub(xpub: string | null): string | null {
  if (!xpub) return null;
  if (xpub.length <= 16) return "****";
  return `${xpub.slice(0, 8)}…${xpub.slice(-8)}`;
}
