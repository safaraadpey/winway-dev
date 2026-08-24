"use client";

import type {
  AutoBuySnapshot,
  AutoBuyStartResult,
} from "@/lib/autoBuy/types";
import { supabase } from "@/lib/supabaseClient";

async function authHeaders(): Promise<HeadersInit> {
  const {
    data: { session },
    error,
  } = await supabase.auth.getSession();
  if (error || !session?.access_token) {
    throw new Error("Authentication required");
  }
  return { Authorization: `Bearer ${session.access_token}` };
}

export async function fetchAutoBuySnapshot(
  templateId?: string
): Promise<AutoBuySnapshot> {
  const headers = await authHeaders();
  const query = templateId
    ? `?templateId=${encodeURIComponent(templateId)}`
    : "";
  const response = await fetch(`/api/player/auto-buy${query}`, {
    method: "GET",
    headers,
    cache: "no-store",
  });
  const payload = await response.json();
  if (!response.ok) {
    throw new Error(payload.message || "Failed to load auto-buy status");
  }
  return payload.data as AutoBuySnapshot;
}

export async function startAutoBuy(options: {
  templateId: string;
  fundAmount: number;
  cardCount: number;
  profitTarget: number;
  skipFirstJoin?: boolean;
  serialBuyEnabled?: boolean;
  anchorRoomId?: string;
  idempotencyKey?: string;
}): Promise<AutoBuyStartResult> {
  const headers = await authHeaders();
  const response = await fetch("/api/player/auto-buy", {
    method: "POST",
    headers: { ...headers, "Content-Type": "application/json" },
    body: JSON.stringify({
      action: "start",
      templateId: options.templateId,
      fundAmount: options.fundAmount,
      cardCount: options.cardCount,
      profitTarget: options.profitTarget,
      skipFirstJoin: Boolean(options.skipFirstJoin),
      serialBuyEnabled: Boolean(options.serialBuyEnabled),
      anchorRoomId: options.anchorRoomId ?? null,
      idempotencyKey: options.idempotencyKey,
    }),
  });
  const payload = await response.json();
  if (!response.ok) {
    throw new Error(payload.message || "Failed to start auto-buy");
  }
  return payload.data as AutoBuyStartResult;
}

export async function stopAutoBuy(options?: { templateId?: string }): Promise<void> {
  const headers = await authHeaders();
  const response = await fetch("/api/player/auto-buy", {
    method: "POST",
    headers: { ...headers, "Content-Type": "application/json" },
    body: JSON.stringify({
      action: "stop",
      templateId: options?.templateId ?? null,
    }),
  });
  const payload = await response.json();
  if (!response.ok) {
    throw new Error(payload.message || "Failed to stop auto-buy");
  }
}
