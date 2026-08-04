/**
 * Notify frontend of successful crypto deposit via Supabase Realtime broadcast.
 * Server-only — uses service role; never import from client components.
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let cached: SupabaseClient | null = null;

async function getServiceClient(): Promise<SupabaseClient> {
  if (cached) return cached;

  const url =
    process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || "";
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
  if (!url || !key) {
    throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL/SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  }

  const options: {
    auth: { autoRefreshToken: boolean; persistSession: boolean };
    realtime?: { transport: unknown };
  } = {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  };

  // Node 20 has no global WebSocket; Realtime still initializes on createClient.
  if (typeof (globalThis as { WebSocket?: unknown }).WebSocket === "undefined") {
    const { default: WS } = await import("ws");
    options.realtime = { transport: WS };
  }

  cached = createClient(url, key, options as Parameters<typeof createClient>[2]);
  return cached;
}

export async function notifyCryptoDepositConfirmed(payload: {
  userId: string;
  cryptoTxId: string;
  tomanAmount: number;
  currency: string;
  network: string;
  txHash: string;
}): Promise<void> {
  try {
    const supabase = await getServiceClient();
    const channel = supabase.channel(`crypto_deposit:${payload.userId}`);
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
    await supabase.removeChannel(channel);
    console.log("[Realtime] crypto deposit notified", {
      userId: payload.userId,
      cryptoTxId: payload.cryptoTxId,
    });
  } catch (err) {
    console.error("[Realtime] crypto deposit notify failed", err);
  }
}
