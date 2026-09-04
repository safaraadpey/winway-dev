/**
 * Pure replay of room-level pending Ding for player snapshots.
 * Mirrors apps/engines/bingo domain ding math (reserved tickets only).
 */

export const DEFAULT_DING_PER_NUMBER = 1;

export function resolveDingPerCard(
  roomDingPerNumber: number | null | undefined,
  templateDingPerNumber: number | null | undefined
): number {
  return Math.trunc(
    roomDingPerNumber ?? templateDingPerNumber ?? DEFAULT_DING_PER_NUMBER
  );
}

export function computePendingDingForUser(args: {
  userId: string;
  dingPerCard: number;
  tickets: readonly {
    id: string;
    player_user_id: string;
    reservation_status: string;
    cancelled_at: string | null;
  }[];
  marks: readonly { ticket_id: string; value: number }[];
  processedDrawNumbers: readonly number[];
}): number {
  if (args.processedDrawNumbers.length === 0 || args.dingPerCard <= 0) return 0;

  const ticketById = new Map(args.tickets.map((t) => [t.id, t]));
  const drawSet = new Set(args.processedDrawNumbers);
  let total = 0;

  for (const mark of args.marks) {
    if (!drawSet.has(mark.value)) continue;
    const ticket = ticketById.get(mark.ticket_id);
    if (!ticket || ticket.cancelled_at !== null) continue;
    if (ticket.reservation_status !== "reserved") continue;
    if (ticket.player_user_id !== args.userId) continue;
    total += args.dingPerCard;
  }

  return total;
}
