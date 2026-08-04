/**
 * Credit IRR wallet for confirmed crypto deposits via fn_wallet_apply_delta.
 * Idempotent on deposit:crypto:{tx_hash}.
 */
import type { PoolClient } from "pg";

export async function creditCryptoDepositWallet(
  client: PoolClient,
  opts: {
    userId: string;
    tomanAmount: number;
    txHash: string;
    cryptoTxId: string;
    network: string;
    currency: string;
  }
): Promise<string> {
  const idempotencyKey = `deposit:crypto:${opts.txHash}`;

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
    walletTxId,
  });
  return walletTxId;
}
