/**
 * Credit IRR wallet for confirmed crypto deposits via fn_wallet_apply_delta.
 * Idempotent on deposit:crypto:{network}:{txHash}:{eventIndex}.
 */
import type { PoolClient } from "pg";
import { cryptoDepositIdempotencyKey } from "./cryptoDepositIdentity";

export async function creditCryptoDepositWallet(
  client: PoolClient,
  opts: {
    userId: string;
    tomanAmount: number;
    txHash: string;
    eventIndex: number;
    cryptoTxId: string;
    network: string;
    currency: string;
  }
): Promise<string> {
  const idempotencyKey = cryptoDepositIdempotencyKey({
    network: opts.network,
    txHash: opts.txHash,
    eventIndex: opts.eventIndex,
  });

  const { rows } = await client.query(
    `
    SELECT game_finance.fn_wallet_apply_delta(
      $1::uuid,
      'IRR',
      $2::numeric,
      'deposit'::public.transaction_type,
      'crypto_deposit',
      $3,
      $4,
      $5::jsonb,
      false,
      $6
    ) AS tx_id
    `,
    [
      opts.userId,
      opts.tomanAmount,
      opts.cryptoTxId,
      `واریز کریپتو ${opts.currency} (${opts.network})`,
      JSON.stringify({
        network: opts.network,
        currency: opts.currency,
        tx_hash: opts.txHash,
        event_index: opts.eventIndex,
        crypto_tx_id: opts.cryptoTxId,
      }),
      idempotencyKey,
    ]
  );

  const walletTxId = String(rows[0]?.tx_id);
  console.log("[Wallet] crypto deposit credited", {
    userId: opts.userId,
    tomanAmount: opts.tomanAmount,
    txHash: opts.txHash,
    eventIndex: opts.eventIndex,
    walletTxId,
    idempotencyKey,
  });
  return walletTxId;
}
