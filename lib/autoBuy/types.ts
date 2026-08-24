export type AutoBuyStatus =
  | "running"
  | "stopped"
  | "fund_empty"
  | "profit_hit";

export type AutoBuySnapshot = {
  active: boolean;
  sessionId?: string;
  templateId?: string;
  status?: AutoBuyStatus;
  cardCount?: number;
  fundInitial?: number;
  fundRemaining?: number;
  profitTarget?: number;
  lastRoomId?: string | null;
  serialBuyEnabled?: boolean;
  anchorRoomId?: string | null;
  serialNextRoomId?: string | null;
  stopReason?: string | null;
  startedAt?: string;
  stoppedAt?: string | null;
};

export type AutoBuyStartResult = {
  sessionId: string;
  status: AutoBuyStatus;
  fundRemaining: number;
  profitTarget: number;
  cardCount: number;
  fundInitial?: number;
  lastRoomId?: string | null;
  serialBuyEnabled?: boolean;
  anchorRoomId?: string | null;
  serialNextRoomId?: string | null;
};

export function parseAutoBuySnapshot(raw: Record<string, unknown>): AutoBuySnapshot {
  if (!raw || raw.active === false) {
    return { active: false };
  }
  return {
    active: Boolean(raw.active),
    sessionId: raw.session_id ? String(raw.session_id) : undefined,
    templateId: raw.template_id ? String(raw.template_id) : undefined,
    status: raw.status as AutoBuyStatus | undefined,
    cardCount: raw.card_count != null ? Number(raw.card_count) : undefined,
    fundInitial: raw.fund_initial != null ? Number(raw.fund_initial) : undefined,
    fundRemaining: raw.fund_remaining != null ? Number(raw.fund_remaining) : undefined,
    profitTarget: raw.profit_target != null ? Number(raw.profit_target) : undefined,
    lastRoomId: raw.last_room_id != null ? String(raw.last_room_id) : null,
    serialBuyEnabled: raw.serial_buy_enabled != null ? Boolean(raw.serial_buy_enabled) : undefined,
    anchorRoomId: raw.anchor_room_id != null ? String(raw.anchor_room_id) : null,
    serialNextRoomId:
      raw.serial_next_room_id != null ? String(raw.serial_next_room_id) : null,
    stopReason: raw.stop_reason != null ? String(raw.stop_reason) : null,
    startedAt: raw.started_at ? String(raw.started_at) : undefined,
    stoppedAt: raw.stopped_at != null ? String(raw.stopped_at) : null,
  };
}

export function parseAutoBuyStartResult(raw: Record<string, unknown>): AutoBuyStartResult {
  return {
    sessionId: String(raw.session_id ?? ""),
    status: (raw.status as AutoBuyStatus) ?? "running",
    fundRemaining: Number(raw.fund_remaining ?? 0),
    profitTarget: Number(raw.profit_target ?? 0),
    cardCount: Number(raw.card_count ?? 1),
    fundInitial: raw.fund_initial != null ? Number(raw.fund_initial) : undefined,
    lastRoomId: raw.last_room_id != null ? String(raw.last_room_id) : null,
    serialBuyEnabled:
      raw.serial_buy_enabled != null ? Boolean(raw.serial_buy_enabled) : undefined,
    anchorRoomId: raw.anchor_room_id != null ? String(raw.anchor_room_id) : null,
    serialNextRoomId:
      raw.serial_next_room_id != null ? String(raw.serial_next_room_id) : null,
  };
}
