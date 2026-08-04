/**
 * Notify frontend of successful crypto deposit via Supabase Realtime broadcast.
 */
import { supabaseServer } from "@/lib/supabaseServer";

export async function notifyCryptoDepositConfirmed(payload: {
  userId: string;
  cryptoTxId: string;
  tomanAmount: number;
  currency: string;
  network: string;
  txHash: string;
}): Promise<void> {
  try {
    const channel = supabaseServer.channel(`crypto_deposit:${payload.userId}`);
    await channel.subscribe();
    await channel.send({
      type: "broadcast",
      event: "deposit_confirmed",
      payload: {
        cryptoTxId: payload.cryptoTxId,
        tomanAmount: payload.tomanAmount,
        currency: payload.currency,
        network: payload.network,
        txHash: payload.txHash,
        at: new Date().toISOString(),
      },
    });
    await supabaseServer.removeChannel(channel);
    console.log("[Realtime] crypto deposit notified", {
      userId: payload.userId,
      cryptoTxId: payload.cryptoTxId,
    });
  } catch (err) {
    console.error("[Realtime] crypto deposit notify failed", err);
  }
}
