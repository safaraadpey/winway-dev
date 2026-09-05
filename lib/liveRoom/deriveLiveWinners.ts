import { getCompleteRows } from "@/lib/bingo-logic";
import type { LiveRoomSnapshot } from "@/services/rooms";

export type DerivedCardWinner = {
  ticketId: string;
  userId: string;
  drawNumber: number;
};

/**
 * Display-only first line winners from snapshot cards + draw order.
 * Used when joining mid-game or when engine RAM winners are not on the payload yet.
 * Settlement truth stays on the server.
 */
export function deriveFirstLineWinners(
  cards: LiveRoomSnapshot["cards"] | null | undefined,
  calledInOrder: readonly number[]
): DerivedCardWinner[] {
  if (!cards?.length || !calledInOrder.length) return [];

  for (let i = 0; i < calledInOrder.length; i += 1) {
    const prefix = calledInOrder.slice(0, i + 1);
    const winners: DerivedCardWinner[] = [];
    for (const card of cards) {
      if (!card.ticket_id) continue;
      if (getCompleteRows(card.card, prefix).length === 0) continue;
      winners.push({
        ticketId: card.ticket_id,
        userId: card.player_id ?? "",
        drawNumber: calledInOrder[i]!,
      });
    }
    if (winners.length > 0) return winners;
  }

  return [];
}

export function revealReadyWinners(
  winners: readonly DerivedCardWinner[] | null | undefined,
  calledInOrder: readonly number[]
): DerivedCardWinner[] {
  if (!winners?.length) return [];
  return winners.filter(
    (w) =>
      w.drawNumber == null ||
      w.drawNumber === 0 ||
      calledInOrder.includes(w.drawNumber)
  );
}

export function resolveDisplayLineWinners(args: {
  snapshot: LiveRoomSnapshot | null | undefined;
  calledInOrder: readonly number[];
  dbLineWinners: DerivedCardWinner[];
}): DerivedCardWinner[] {
  const { snapshot, calledInOrder, dbLineWinners } = args;
  if (!snapshot || snapshot.tournament?.id) return [];

  const isRam =
    snapshot.source === "engine_ram" ||
    snapshot.room.gameplay_persist_mode === "manifest_ram";

  if (!isRam) {
    return revealReadyWinners(dbLineWinners, calledInOrder);
  }

  const ramReady = revealReadyWinners(snapshot.line_winners, calledInOrder);
  if (ramReady.length > 0) return ramReady;

  return deriveFirstLineWinners(snapshot.cards, calledInOrder);
}
