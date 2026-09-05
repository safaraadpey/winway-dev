import { checkFullCardBingo, getCompleteRows } from "@/lib/bingo-logic";
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

export function deriveFirstFullWinners(
  cards: LiveRoomSnapshot["cards"] | null | undefined,
  calledInOrder: readonly number[]
): DerivedCardWinner[] {
  if (!cards?.length || !calledInOrder.length) return [];

  for (let i = 0; i < calledInOrder.length; i += 1) {
    const prefix = calledInOrder.slice(0, i + 1);
    const winners: DerivedCardWinner[] = [];
    for (const card of cards) {
      if (!card.ticket_id) continue;
      if (!checkFullCardBingo(card.card, prefix)) continue;
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

/** How many balls to show/read before stopping at the first full house. */
export function revealCountThroughFirstFullWin(
  cards: LiveRoomSnapshot["cards"] | null | undefined,
  calledInOrder: readonly number[]
): number | null {
  const winners = deriveFirstFullWinners(cards, calledInOrder);
  if (!winners.length) return null;
  const winBall = winners[0]!.drawNumber;
  const index = calledInOrder.indexOf(winBall);
  if (index < 0) return null;
  return index + 1;
}

export function shouldPollDrawsAfterStatus(
  status: string,
  needsCatchUp: boolean
): boolean {
  const normalized = (status || "").trim().toLowerCase();
  if (["running", "playing", "live"].includes(normalized)) return true;
  if (normalized === "settling") return true;
  if (normalized === "finished" && needsCatchUp) return true;
  return false;
}

/**
 * Display-only: room is terminal but no full house is visible on revealed balls yet.
 * Used to keep polling after RAM evict until PG snapshot restores the winning draw.
 */
export function needsTerminalFullHouseCatchUp(args: {
  status: string;
  cards: LiveRoomSnapshot["cards"] | null | undefined;
  revealedCalled: readonly number[];
}): boolean {
  const normalized = (args.status || "").trim().toLowerCase();
  if (normalized !== "settling" && normalized !== "finished") return false;
  if (!args.cards?.length) return false;
  return deriveFirstFullWinners(args.cards, args.revealedCalled).length === 0;
}

/** Once a card is already full on revealed balls, do not read the next number. */
export function shouldRevealNextLiveDraw(
  cards: LiveRoomSnapshot["cards"] | null | undefined,
  alreadyRevealed: readonly number[]
): boolean {
  if (!alreadyRevealed.length) return true;
  return deriveFirstFullWinners(cards, alreadyRevealed).length === 0;
}

export function canOpenLiveResultsDialog(
  fullWinners: readonly DerivedCardWinner[],
  status: string
): boolean {
  if (fullWinners.length === 0) return false;
  const normalized = (status || "").trim().toLowerCase();
  const terminal =
    normalized !== "" &&
    !["running", "playing", "live", "waiting"].includes(normalized);
  return terminal || fullWinners.length > 0;
}

export function revealReadyWinners(
  winners: readonly DerivedCardWinner[] | null | undefined,
  calledInOrder: readonly number[]
): DerivedCardWinner[] {
  if (!winners?.length) return [];
  return winners.filter((w) => {
    const draw = Number(w.drawNumber);
    if (!Number.isFinite(draw) || draw <= 0) return false;
    return calledInOrder.map(Number).includes(draw);
  });
}

export function isTournamentLiveSnapshot(
  snapshot: LiveRoomSnapshot | null | undefined
): boolean {
  if (!snapshot) return false;
  if (snapshot.is_tournament === true) return true;
  return Boolean(snapshot.tournament?.id);
}

export function resolveDisplayLineWinners(args: {
  snapshot: LiveRoomSnapshot | null | undefined;
  calledInOrder: readonly number[];
  dbLineWinners: DerivedCardWinner[];
}): DerivedCardWinner[] {
  const { snapshot, calledInOrder, dbLineWinners } = args;
  if (!snapshot || isTournamentLiveSnapshot(snapshot)) return [];

  const derived = deriveFirstLineWinners(snapshot.cards, calledInOrder);
  if (derived.length > 0) return derived;

  const isRam =
    snapshot.source === "engine_ram" ||
    snapshot.room.gameplay_persist_mode === "manifest_ram";
  const raw = isRam
    ? snapshot.line_winners?.length
      ? snapshot.line_winners
      : dbLineWinners
    : dbLineWinners;
  return revealReadyWinners(raw, calledInOrder);
}

export function resolveDisplayFullWinners(args: {
  snapshot: LiveRoomSnapshot | null | undefined;
  calledInOrder: readonly number[];
  dbFullWinners: DerivedCardWinner[];
}): DerivedCardWinner[] {
  const { snapshot, calledInOrder, dbFullWinners } = args;
  if (!snapshot) return [];

  const derived = deriveFirstFullWinners(snapshot.cards, calledInOrder);
  if (derived.length > 0) return derived;

  const isRam =
    snapshot.source === "engine_ram" ||
    snapshot.room.gameplay_persist_mode === "manifest_ram";
  const raw = isRam
    ? snapshot.full_winners?.length
      ? snapshot.full_winners
      : dbFullWinners
    : dbFullWinners;

  // Ball number can repeat-match too early (e.g. full win on ball 1).
  // Only accept RAM/DB winners once a card is actually full.
  return revealReadyWinners(raw, calledInOrder).filter((w) => {
    const card = snapshot.cards.find((c) => c.ticket_id === w.ticketId);
    if (!card) return false;
    return checkFullCardBingo(card.card, [...calledInOrder]);
  });
}
