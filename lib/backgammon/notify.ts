import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let cached: SupabaseClient | null = null;

async function getServiceClient(): Promise<SupabaseClient> {
  if (cached) return cached;

  const url =
    process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || "";
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
  if (!url || !key) {
    throw new Error(
      "Missing NEXT_PUBLIC_SUPABASE_URL/SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY"
    );
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

  if (typeof (globalThis as { WebSocket?: unknown }).WebSocket === "undefined") {
    const { default: WS } = await import("ws");
    options.realtime = { transport: WS };
  }

  cached = createClient(url, key, options as Parameters<typeof createClient>[2]);
  return cached;
}

export async function notifyBackgammonSessionChanged(payload: {
  sessionId: string;
  stateVersion: number;
}): Promise<void> {
  try {
    const supabase = await getServiceClient();
    const channel = supabase.channel(`backgammon:${payload.sessionId}`);
    await channel.subscribe();
    await channel.send({
      type: "broadcast",
      event: "state_changed",
      payload: {
        sessionId: payload.sessionId,
        stateVersion: payload.stateVersion,
        at: new Date().toISOString(),
      },
    });
    await supabase.removeChannel(channel);
    console.log("[Realtime] backgammon state broadcast", {
      sessionId: payload.sessionId,
      stateVersion: payload.stateVersion,
    });
  } catch (err) {
    console.error("[Realtime] backgammon state broadcast failed", err);
  }
}
