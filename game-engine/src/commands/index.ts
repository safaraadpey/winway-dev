/**
 * High-level game commands invoked by HTTP API or internal workers.
 *
 * Planned commands:
 * - joinOrCreateRoom(userId, templateId, cardCount)
 * - cancelWaitingRoom(roomId, actorId)
 * - seatTournamentTable(tournamentId, roundNo, tableNo)
 * - settleRoom(roomId)
 */

export type CommandResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: string; code?: string };
