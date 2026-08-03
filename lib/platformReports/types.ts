export type SessionParticipantReportRow = {
  userId: string;
  status: string;
  ticketCount: number;
  amountTotal: number;
  joinedAt: string | null;
  leftAt: string | null;
  sourceUpdatedAt: string | null;
};

export type SessionReportRow = {
  sessionId: string;
  status: string;
  createdAt: string;
  startedAt: string | null;
  finishedAt: string | null;
  settledAt: string | null;
  participantCount: number;
  amountTotal: number;
  participants: SessionParticipantReportRow[];
};

export type SessionsReportResult = {
  items: SessionReportRow[];
  totalCount: number;
  page: number;
  pageSize: number;
  source: "legacy" | "platform";
};

/** Mirror of platform.fn_shadow_map_lifecycle for legacy compare. */
export function mapBingoRoomLifecycle(
  status: string,
  leaseOwner: string | null | undefined
): string {
  const s = String(status || "");
  if (s === "cancelled") return "cancelled";
  if (s === "idle") return "archived";
  if (s === "finished") return "settled";
  if (s === "settling") return "finished";
  if (s === "playing" || s === "live") return "running";
  if (s === "waiting" && leaseOwner && String(leaseOwner).trim()) return "claimed";
  if (s === "waiting") return "waiting";
  return "created";
}

export function mapTicketParticipantStatus(args: {
  activeTickets: number;
  hasHeld: boolean;
  hasLive: boolean;
}): string {
  if (args.activeTickets <= 0) return "left";
  if (args.hasLive) return "active";
  if (args.hasHeld) return "joined";
  return "joined";
}
