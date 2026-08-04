/**
 * Process observed on-chain transfers → PENDING → CONFIRMED + wallet credit.
 * Deposit identity: (network, tx_hash, event_index).
 */
import type { Pool } from "pg";
import {
  isSupportedDepositCurrency,
  quoteDepositToman,
} from "./cryptoPriceLock";
import { creditCryptoDepositWallet } from "./cryptoCredit";
import { notifyCryptoDepositConfirmed } from "./cryptoNotify";
import { getCryptoConfirmationRules } from "./cryptoXpubSettings";
import { normalizeEventIndex } from "./cryptoDepositIdentity";
import {
  clearConfirmIfNoPending,
  promoteUserToConfirmWatch,
  syncConfirmWatchFromPending,
} from "./cryptoWatch";
import type { ObservedChainTx } from "./cryptoScanners/etherscan";

export type ProcessResult = {
  txHash: string;
  eventIndex: number;
  action: "skipped_duplicate" | "inserted_pending" | "confirmed" | "failed";
  cryptoTxId?: string;
  tomanAmount?: number;
  error?: string;
};

async function findByDepositEvent(
  pool: Pool,
  opts: { network: string; txHash: string; eventIndex: number }
) {
  const { rows } = await pool.query(
    `
    SELECT id, status, user_id, toman_amount, network, currency, tx_hash, event_index
    FROM deposit.crypto_transactions
    WHERE network = $1::deposit.crypto_tx_network
      AND tx_hash = $2
      AND event_index = $3
    LIMIT 1
    `,
    [opts.network, opts.txHash, opts.eventIndex]
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
    preferPriceLock: boolean;
  }
): Promise<ProcessResult> {
  const { observed: obs, userId, preferPriceLock } = opts;
  const txHash = obs.txHash.trim();
  const eventIndex = normalizeEventIndex(obs.eventIndex, 0);
  if (!txHash) {
    return {
      txHash: "",
      eventIndex,
      action: "failed",
      error: "missing_tx_hash",
    };
  }

  const rules = await getCryptoConfirmationRules(pool);

  const existing = await findByDepositEvent(pool, {
    network: obs.network,
    txHash,
    eventIndex,
  });
  if (existing) {
    if (String(existing.status) === "CONFIRMED") {
      return {
        txHash,
        eventIndex,
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
        eventIndex: normalizeEventIndex(existing.event_index, eventIndex),
        confirmations: obs.confirmations,
      });
    }
    return {
      txHash,
      eventIndex,
      action: "skipped_duplicate",
      cryptoTxId: String(existing.id),
    };
  }

  if (!isSupportedDepositCurrency(obs.currency)) {
    console.log("[Payment] skip unsupported crypto deposit currency", {
      txHash,
      eventIndex,
      currency: obs.currency,
      cryptoAmount: obs.cryptoAmount,
    });
    return {
      txHash,
      eventIndex,
      action: "failed",
      error: `unsupported_currency:${obs.currency}`,
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
    console.error("[Payment] quote deposit toman failed", {
      txHash,
      eventIndex,
      message,
    });
    return { txHash, eventIndex, action: "failed", error: message };
  }

  const client = await pool.connect();
  let cryptoTxId: string;
  try {
    await client.query("BEGIN");

    const insert = await client.query(
      `
      INSERT INTO deposit.crypto_transactions (
        user_id, network, currency, tx_hash, event_index, from_address, to_address,
        crypto_amount, toman_amount, status, confirmations,
        price_source, price_lock_used, meta, observed_at
      ) VALUES (
        $1, $2::deposit.crypto_tx_network, $3, $4, $5, $6, $7,
        $8, $9, 'PENDING', $10,
        $11, $12, $13::jsonb, now()
      )
      ON CONFLICT (network, tx_hash, event_index) DO NOTHING
      RETURNING id
      `,
      [
        userId,
        obs.network,
        obs.currency,
        txHash,
        eventIndex,
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
          eventIndex,
        }),
      ]
    );

    if (!insert.rows[0]) {
      await client.query("ROLLBACK");
      return { txHash, eventIndex, action: "skipped_duplicate" };
    }

    cryptoTxId = String(insert.rows[0].id);
    await client.query("COMMIT");
    console.log("[Payment] crypto tx PENDING inserted", {
      cryptoTxId,
      txHash,
      eventIndex,
      tomanAmount: quote.tomanAmount,
      priceSource: quote.priceSource,
    });
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }

  void promoteUserToConfirmWatch(pool, userId).catch((err) => {
    console.error("[Payment] confirm watch promote failed", {
      userId,
      txHash,
      eventIndex,
      error: err instanceof Error ? err.message : String(err),
    });
  });

  if (!isConfirmed(obs, rules)) {
    return {
      txHash,
      eventIndex,
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
    eventIndex,
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
    eventIndex: number;
    confirmations: number | null;
  }
): Promise<ProcessResult> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const locked = await client.query(
      `
      SELECT id, status, toman_amount, wallet_tx_id, event_index, network, tx_hash
      FROM deposit.crypto_transactions
      WHERE id = $1
      FOR UPDATE
      `,
      [opts.cryptoTxId]
    );
    const row = locked.rows[0];
    if (!row) {
      await client.query("ROLLBACK");
      return {
        txHash: opts.txHash,
        eventIndex: opts.eventIndex,
        action: "failed",
        error: "not_found",
      };
    }
    if (row.status === "CONFIRMED") {
      await client.query("COMMIT");
      return {
        txHash: opts.txHash,
        eventIndex: opts.eventIndex,
        action: "skipped_duplicate",
        cryptoTxId: opts.cryptoTxId,
        tomanAmount: Number(row.toman_amount),
      };
    }
    if (row.status !== "PENDING") {
      await client.query("ROLLBACK");
      return {
        txHash: opts.txHash,
        eventIndex: opts.eventIndex,
        action: "failed",
        error: `bad_status:${row.status}`,
      };
    }

    const tomanAmount = Number(row.toman_amount);
    const eventIndex = normalizeEventIndex(row.event_index, opts.eventIndex);
    const walletTxId = await creditCryptoDepositWallet(client, {
      userId: opts.userId,
      tomanAmount,
      txHash: opts.txHash,
      eventIndex,
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
      eventIndex,
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

    void clearConfirmIfNoPending(pool, opts.userId).catch(() => undefined);

    return {
      txHash: opts.txHash,
      eventIndex,
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
  return syncConfirmWatchFromPending(pool);
}
