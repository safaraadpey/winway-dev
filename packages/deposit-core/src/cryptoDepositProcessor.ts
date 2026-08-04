/**
 * Process observed on-chain transfers → PENDING → CONFIRMED + wallet credit.
 */
import type { Pool } from "pg";
import { quoteDepositToman } from "./cryptoPriceLock";
import { creditCryptoDepositWallet } from "./cryptoCredit";
import { notifyCryptoDepositConfirmed } from "./cryptoNotify";
import { getCryptoConfirmationRules } from "./cryptoXpubSettings";
import type { ObservedChainTx } from "./cryptoScanners/etherscan";

export type ProcessResult = {
  txHash: string;
  action: "skipped_duplicate" | "inserted_pending" | "confirmed" | "failed";
  cryptoTxId?: string;
  tomanAmount?: number;
  error?: string;
};

async function findByTxHash(pool: Pool, txHash: string) {
  const { rows } = await pool.query(
    `
    SELECT id, status, user_id, toman_amount, network, currency, tx_hash
    FROM deposit.crypto_transactions
    WHERE tx_hash = $1
    LIMIT 1
    `,
    [txHash]
  );
  return rows[0] as Record<string, unknown> | undefined;
}

function isConfirmed(
  obs: ObservedChainTx,
  rules: { bep20Confirmations: number; tronConfirmations: number }
): boolean {
  if (obs.network === "BEP20") {
    return (obs.confirmations ?? 0) >= rules.bep20Confirmations;
  }
  // Tron: TronGrid "confirmed" counts as 1 confirmation; honor admin threshold.
  const conf =
    obs.confirmations != null
      ? obs.confirmations
      : obs.confirmed
        ? 1
        : 0;
  return conf >= rules.tronConfirmations && obs.confirmed !== false;
}

export async function processObservedDeposit(
  pool: Pool,
  opts: {
    userId: string;
    observed: ObservedChainTx;
    /** Use price lock when true (online check / active cron). Offline full scan should pass false. */
    preferPriceLock: boolean;
  }
): Promise<ProcessResult> {
  const { observed: obs, userId, preferPriceLock } = opts;
  const txHash = obs.txHash.trim();
  if (!txHash) {
    return { txHash: "", action: "failed", error: "missing_tx_hash" };
  }

  const rules = await getCryptoConfirmationRules(pool);

  const existing = await findByTxHash(pool, txHash);
  if (existing) {
    if (String(existing.status) === "CONFIRMED") {
      return {
        txHash,
        action: "skipped_duplicate",
        cryptoTxId: String(existing.id),
      };
    }
    if (String(existing.status) === "PENDING" && isConfirmed(obs, rules)) {
      return confirmPendingTx(pool, {
        cryptoTxId: String(existing.id),
        userId: String(existing.user_id),
        tomanAmount: Number(existing.toman_amount),
        network: String(existing.network),
        currency: String(existing.currency),
        txHash,
        confirmations: obs.confirmations,
      });
    }
    return {
      txHash,
      action: "skipped_duplicate",
      cryptoTxId: String(existing.id),
    };
  }

  let quote;
  try {
    quote = await quoteDepositToman({
      db: pool,
      userId,
      network: obs.network,
      currency: obs.currency,
      cryptoAmount: obs.cryptoAmount,
      preferLock: preferPriceLock,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "quote_failed";
    console.error("[Payment] quote deposit toman failed", { txHash, message });
    return { txHash, action: "failed", error: message };
  }

  const client = await pool.connect();
  let cryptoTxId: string;
  try {
    await client.query("BEGIN");

    const insert = await client.query(
      `
      INSERT INTO deposit.crypto_transactions (
        user_id, network, currency, tx_hash, from_address, to_address,
        crypto_amount, toman_amount, status, confirmations,
        price_source, price_lock_used, meta, observed_at
      ) VALUES (
        $1, $2::deposit.crypto_tx_network, $3, $4, $5, $6,
        $7, $8, 'PENDING', $9,
        $10, $11, $12::jsonb, now()
      )
      ON CONFLICT (tx_hash) DO NOTHING
      RETURNING id
      `,
      [
        userId,
        obs.network,
        obs.currency,
        txHash,
        obs.fromAddress || null,
        obs.toAddress,
        obs.cryptoAmount,
        quote.tomanAmount,
        obs.confirmations,
        quote.priceSource,
        quote.priceSource === "price_lock",
        JSON.stringify({
          usdAmount: quote.usdAmount,
          multiplier: quote.multiplier,
          bonusPercent: quote.bonusPercent,
          rates: quote.rates,
        }),
      ]
    );

    if (!insert.rows[0]) {
      await client.query("ROLLBACK");
      return { txHash, action: "skipped_duplicate" };
    }

    cryptoTxId = String(insert.rows[0].id);
    await client.query("COMMIT");
    console.log("[Payment] crypto tx PENDING inserted", {
      cryptoTxId,
      txHash,
      tomanAmount: quote.tomanAmount,
      priceSource: quote.priceSource,
    });
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }

  if (!isConfirmed(obs, rules)) {
    return {
      txHash,
      action: "inserted_pending",
      cryptoTxId,
      tomanAmount: quote.tomanAmount,
    };
  }

  return confirmPendingTx(pool, {
    cryptoTxId,
    userId,
    tomanAmount: quote.tomanAmount,
    network: obs.network,
    currency: obs.currency,
    txHash,
    confirmations: obs.confirmations,
  });
}

async function confirmPendingTx(
  pool: Pool,
  opts: {
    cryptoTxId: string;
    userId: string;
    tomanAmount: number;
    network: string;
    currency: string;
    txHash: string;
    confirmations: number | null;
  }
): Promise<ProcessResult> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const locked = await client.query(
      `
      SELECT id, status, toman_amount, wallet_tx_id
      FROM deposit.crypto_transactions
      WHERE id = $1
      FOR UPDATE
      `,
      [opts.cryptoTxId]
    );
    const row = locked.rows[0];
    if (!row) {
      await client.query("ROLLBACK");
      return { txHash: opts.txHash, action: "failed", error: "not_found" };
    }
    if (row.status === "CONFIRMED") {
      await client.query("COMMIT");
      return {
        txHash: opts.txHash,
        action: "skipped_duplicate",
        cryptoTxId: opts.cryptoTxId,
        tomanAmount: Number(row.toman_amount),
      };
    }
    if (row.status !== "PENDING") {
      await client.query("ROLLBACK");
      return {
        txHash: opts.txHash,
        action: "failed",
        error: `bad_status:${row.status}`,
      };
    }

    const tomanAmount = Number(row.toman_amount);
    const walletTxId = await creditCryptoDepositWallet(client, {
      userId: opts.userId,
      tomanAmount,
      txHash: opts.txHash,
      cryptoTxId: opts.cryptoTxId,
      network: opts.network,
      currency: opts.currency,
    });

    await client.query(
      `
      UPDATE deposit.crypto_transactions
      SET status = 'CONFIRMED',
          confirmations = COALESCE($2, confirmations),
          wallet_tx_id = $3::uuid,
          confirmed_at = now(),
          updated_at = now()
      WHERE id = $1
      `,
      [opts.cryptoTxId, opts.confirmations, walletTxId]
    );

    await client.query("COMMIT");

    console.log("[Settlement] crypto deposit CONFIRMED", {
      cryptoTxId: opts.cryptoTxId,
      txHash: opts.txHash,
      tomanAmount,
      walletTxId,
    });

    void notifyCryptoDepositConfirmed({
      userId: opts.userId,
      cryptoTxId: opts.cryptoTxId,
      tomanAmount,
      currency: opts.currency,
      network: opts.network,
      txHash: opts.txHash,
    });

    return {
      txHash: opts.txHash,
      action: "confirmed",
      cryptoTxId: opts.cryptoTxId,
      tomanAmount,
    };
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("[Settlement] confirm crypto deposit failed", err);
    throw err;
  } finally {
    client.release();
  }
}

export async function recheckPendingConfirmations(pool: Pool): Promise<number> {
  // Lightweight: pending rows older than a few minutes can be promoted when
  // scanners report confirmed later via processObservedDeposit duplicate path.
  const { rowCount } = await pool.query(
    `
    SELECT 1 FROM deposit.crypto_transactions
    WHERE status = 'PENDING'
    LIMIT 1
    `
  );
  return rowCount ?? 0;
}
