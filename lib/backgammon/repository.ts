import type { PoolClient } from "pg";
import {
  createGame,
  joinGame,
  rollDice,
  makeMove,
  finishTurn,
  getLegalMoves,
  deserializeMatchState,
  type SerializedMatchState,
} from "@dingmoney/backgammon-engine";
import { DomainError } from "@dingmoney/backgammon-engine";
import type { Move, Seat } from "@dingmoney/backgammon-engine";
import { NodeDiceProvider } from "@dingmoney/backgammon-engine";
import { withTransaction } from "@/lib/db/withTransaction";
import {
  BACKGAMMON_CAPACITY,
  BACKGAMMON_ENGINE_ID,
  BACKGAMMON_GAME_ID,
} from "@/lib/backgammon/constants";
import { notifyBackgammonSessionChanged } from "@/lib/backgammon/notify";
import type { SessionParticipantRow } from "@/lib/backgammon/guards";
import { randomInt } from "node:crypto";

export class StaleStateError extends Error {
  constructor(public readonly expectedVersion: number) {
    super("Stale game state version");
    this.name = "StaleStateError";
  }
}

export class BackgammonRepositoryError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly status = 400
  ) {
    super(message);
    this.name = "BackgammonRepositoryError";
  }
}

type LockedSession = {
  sessionId: string;
  status: string;
  participantCount: number;
  stateVersion: number;
  matchState: SerializedMatchState;
  participants: SessionParticipantRow[];
  eventSeq: number;
};

const diceProvider = new NodeDiceProvider();

async function loadLockedSession(
  client: PoolClient,
  sessionId: string,
  expectedVersion?: number
): Promise<LockedSession> {
  const sessionRes = await client.query<{
    id: string;
    status: string;
    participant_count: number;
  }>(
    `SELECT id, status, participant_count
     FROM platform.game_sessions
     WHERE id = $1::uuid AND game_id = $2::uuid
     FOR UPDATE`,
    [sessionId, BACKGAMMON_GAME_ID]
  );

  const sessionRow = sessionRes.rows[0];
  if (!sessionRow) {
    throw new BackgammonRepositoryError("Game not found.", "game_not_found", 404);
  }

  const stateRes = await client.query<{ state_version: string }>(
    `SELECT state_version
     FROM platform.session_state
     WHERE session_id = $1::uuid
     FOR UPDATE`,
    [sessionId]
  );
  const stateVersion = Number(stateRes.rows[0]?.state_version ?? 0);

  if (
    expectedVersion !== undefined &&
    expectedVersion !== stateVersion
  ) {
    throw new StaleStateError(stateVersion);
  }

  const matchRes = await client.query<{ state: SerializedMatchState }>(
    `SELECT state FROM backgammon.match_state WHERE session_id = $1::uuid`,
    [sessionId]
  );
  if (!matchRes.rows[0]) {
    throw new BackgammonRepositoryError("Match state missing.", "state_missing", 500);
  }

  const participantsRes = await client.query<SessionParticipantRow>(
    `SELECT user_id, seat_no, status
     FROM platform.session_participants
     WHERE session_id = $1::uuid
     ORDER BY seat_no ASC`,
    [sessionId]
  );

  const seqRes = await client.query<{ next_seq: string }>(
    `SELECT COALESCE(MAX(seq), -1) + 1 AS next_seq
     FROM platform.session_events
     WHERE session_id = $1::uuid`,
    [sessionId]
  );

  return {
    sessionId,
    status: sessionRow.status,
    participantCount: sessionRow.participant_count,
    stateVersion,
    matchState: deserializeMatchState(matchRes.rows[0].state),
    participants: participantsRes.rows,
    eventSeq: Number(seqRes.rows[0]?.next_seq ?? 0),
  };
}

async function persistMatchState(
  client: PoolClient,
  locked: LockedSession,
  nextMatchState: SerializedMatchState,
  events: Array<{ type: string; payload: Record<string, unknown> }>,
  sessionPatch?: {
    status?: string;
    participantCount?: number;
    startedAt?: boolean;
    finishedAt?: boolean;
  }
): Promise<number> {
  await client.query(
    `UPDATE backgammon.match_state
     SET state = $2::jsonb, updated_at = now()
     WHERE session_id = $1::uuid`,
    [locked.sessionId, JSON.stringify(nextMatchState)]
  );

  const nextVersion = locked.stateVersion + 1;
  await client.query(
    `UPDATE platform.session_state
     SET state_version = $2, updated_at = now()
     WHERE session_id = $1::uuid`,
    [locked.sessionId, nextVersion]
  );

  let seq = locked.eventSeq;
  for (const event of events) {
    await client.query(
      `INSERT INTO platform.session_events (session_id, seq, event_type, payload)
       VALUES ($1::uuid, $2, $3, $4::jsonb)`,
      [locked.sessionId, seq, event.type, JSON.stringify(event.payload)]
    );
    seq += 1;
  }

  if (sessionPatch?.status || sessionPatch?.participantCount !== undefined) {
    await client.query(
      `UPDATE platform.game_sessions
       SET status = COALESCE($2, status),
           participant_count = COALESCE($3, participant_count),
           started_at = CASE WHEN $4 THEN now() ELSE started_at END,
           finished_at = CASE WHEN $5 THEN now() ELSE finished_at END,
           updated_at = now()
       WHERE id = $1::uuid`,
      [
        locked.sessionId,
        sessionPatch.status ?? null,
        sessionPatch.participantCount ?? null,
        sessionPatch.startedAt ?? false,
        sessionPatch.finishedAt ?? false,
      ]
    );
  }

  return nextVersion;
}

function domainEventsToRows(
  events: Array<{ type: string; [key: string]: unknown }>
): Array<{ type: string; payload: Record<string, unknown> }> {
  return events.map((event) => {
    const { type, ...rest } = event;
    return { type, payload: rest as Record<string, unknown> };
  });
}

function wrapDomainError(err: unknown): never {
  if (err instanceof DomainError) {
    throw new BackgammonRepositoryError(err.message, err.code, 409);
  }
  throw err;
}

export type BackgammonSnapshot = {
  sessionId: string;
  status: string;
  stateVersion: number;
  matchState: SerializedMatchState;
  participants: SessionParticipantRow[];
  legalMoves: Move[];
  mySeat: Seat | null;
};

export async function createBackgammonGame(creatorUserId: string): Promise<{
  sessionId: string;
  stateVersion: number;
}> {
  return withTransaction(async (client) => {
    const sessionRes = await client.query<{ id: string }>(
      `INSERT INTO platform.game_sessions (
         game_id, engine_id, status, capacity, entry_fee, participant_count, correlation_key
       ) VALUES ($1::uuid, $2::uuid, 'waiting', $3, 0, 1, gen_random_uuid()::text)
       RETURNING id`,
      [BACKGAMMON_GAME_ID, BACKGAMMON_ENGINE_ID, BACKGAMMON_CAPACITY]
    );
    const sessionId = sessionRes.rows[0].id;

    await client.query(
      `INSERT INTO platform.session_state (session_id, state_version, metadata)
       VALUES ($1::uuid, 0, '{}'::jsonb)`,
      [sessionId]
    );

    const created = createGame({ sessionId, creatorUserId });
    await client.query(
      `INSERT INTO platform.session_participants (session_id, user_id, seat_no, status)
       VALUES ($1::uuid, $2::uuid, 0, 'joined')`,
      [sessionId, creatorUserId]
    );

    await client.query(
      `INSERT INTO backgammon.match_state (session_id, state)
       VALUES ($1::uuid, $2::jsonb)`,
      [sessionId, JSON.stringify(created.state)]
    );

    await client.query(
      `INSERT INTO platform.session_events (session_id, seq, event_type, payload)
       VALUES ($1::uuid, 0, 'game_created', $2::jsonb)`,
      [sessionId, JSON.stringify({ creatorUserId, seat: 0 })]
    );

    console.log("[Backgammon] game created", { sessionId, creatorUserId });
    return { sessionId, stateVersion: 0 };
  });
}

export async function joinBackgammonGame(
  sessionId: string,
  userId: string
): Promise<{ stateVersion: number }> {
  return withTransaction(async (client) => {
    const locked = await loadLockedSession(client, sessionId);

    if (locked.participants.some((p) => p.user_id === userId)) {
      return { stateVersion: locked.stateVersion };
    }

    if (locked.participantCount >= BACKGAMMON_CAPACITY) {
      throw new BackgammonRepositoryError("Game is full.", "game_full", 409);
    }

    let result;
    try {
      result = joinGame(locked.matchState, {
        userId,
        startingSeat: randomInt(0, 2) as Seat,
      });
    } catch (err) {
      wrapDomainError(err);
    }

    await client.query(
      `INSERT INTO platform.session_participants (session_id, user_id, seat_no, status)
       VALUES ($1::uuid, $2::uuid, 1, 'active')`,
      [sessionId, userId]
    );

    const nextVersion = await persistMatchState(
      client,
      locked,
      result!.state,
      domainEventsToRows(result!.events),
      {
        status: "running",
        participantCount: 2,
        startedAt: true,
      }
    );

    console.log("[Backgammon] player joined", { sessionId, userId, nextVersion });
    await notifyBackgammonSessionChanged({ sessionId, stateVersion: nextVersion });
    return { stateVersion: nextVersion };
  });
}

export async function getBackgammonSnapshot(
  sessionId: string,
  userId: string
): Promise<BackgammonSnapshot> {
  return withTransaction(async (client) => {
    const locked = await loadLockedSession(client, sessionId);
    const participant = locked.participants.find((p) => p.user_id === userId);
    const mySeat =
      participant && (participant.seat_no === 0 || participant.seat_no === 1)
        ? (participant.seat_no as Seat)
        : null;

    const legalMoves =
      mySeat !== null && locked.matchState.status === "running"
        ? getLegalMoves(locked.matchState, mySeat)
        : [];

    return {
      sessionId,
      status: locked.status,
      stateVersion: locked.stateVersion,
      matchState: locked.matchState,
      participants: locked.participants,
      legalMoves,
      mySeat,
    };
  });
}

export async function rollBackgammonDice(
  sessionId: string,
  userId: string,
  expectedVersion: number
): Promise<{ stateVersion: number }> {
  return withTransaction(async (client) => {
    const locked = await loadLockedSession(client, sessionId, expectedVersion);
    const seat = locked.participants.find((p) => p.user_id === userId)?.seat_no;
    if (seat !== 0 && seat !== 1) {
      throw new BackgammonRepositoryError("Not a participant.", "not_a_participant", 403);
    }

    let result;
    try {
      result = rollDice(locked.matchState, {
        seat: seat as Seat,
        diceProvider,
      });
    } catch (err) {
      wrapDomainError(err);
    }

    const finished = result!.state.status === "finished";
    const nextVersion = await persistMatchState(
      client,
      locked,
      result!.state,
      domainEventsToRows(result!.events),
      finished ? { status: "finished", finishedAt: true } : undefined
    );

    console.log("[Backgammon] dice rolled", { sessionId, userId, nextVersion });
    await notifyBackgammonSessionChanged({ sessionId, stateVersion: nextVersion });
    return { stateVersion: nextVersion };
  });
}

export async function applyBackgammonMove(
  sessionId: string,
  userId: string,
  expectedVersion: number,
  move: Move
): Promise<{ stateVersion: number }> {
  return withTransaction(async (client) => {
    const locked = await loadLockedSession(client, sessionId, expectedVersion);
    const seat = locked.participants.find((p) => p.user_id === userId)?.seat_no;
    if (seat !== 0 && seat !== 1) {
      throw new BackgammonRepositoryError("Not a participant.", "not_a_participant", 403);
    }

    let result;
    try {
      result = makeMove(locked.matchState, { seat: seat as Seat, move });
    } catch (err) {
      wrapDomainError(err);
    }

    const finished = result!.state.status === "finished";
    const nextVersion = await persistMatchState(
      client,
      locked,
      result!.state,
      domainEventsToRows(result!.events),
      finished ? { status: "finished", finishedAt: true } : undefined
    );

    console.log("[Backgammon] move applied", { sessionId, userId, move, nextVersion });
    await notifyBackgammonSessionChanged({ sessionId, stateVersion: nextVersion });
    return { stateVersion: nextVersion };
  });
}

export async function endBackgammonTurn(
  sessionId: string,
  userId: string,
  expectedVersion: number
): Promise<{ stateVersion: number }> {
  return withTransaction(async (client) => {
    const locked = await loadLockedSession(client, sessionId, expectedVersion);
    const seat = locked.participants.find((p) => p.user_id === userId)?.seat_no;
    if (seat !== 0 && seat !== 1) {
      throw new BackgammonRepositoryError("Not a participant.", "not_a_participant", 403);
    }

    let result;
    try {
      result = finishTurn(locked.matchState, { seat: seat as Seat });
    } catch (err) {
      wrapDomainError(err);
    }

    const nextVersion = await persistMatchState(
      client,
      locked,
      result!.state,
      domainEventsToRows(result!.events)
    );

    console.log("[Backgammon] turn ended", { sessionId, userId, nextVersion });
    await notifyBackgammonSessionChanged({ sessionId, stateVersion: nextVersion });
    return { stateVersion: nextVersion };
  });
}

export type BackgammonListItem = {
  sessionId: string;
  status: string;
  participantCount: number;
  stateVersion: number;
  createdAt: string;
  mySeat: Seat | null;
};

export async function listBackgammonGames(userId: string): Promise<BackgammonListItem[]> {
  return withTransaction(async (client) => {
    const res = await client.query<{
      session_id: string;
      status: string;
      participant_count: number;
      state_version: string;
      created_at: string;
      my_seat: number | null;
    }>(
      `SELECT
         gs.id AS session_id,
         gs.status,
         gs.participant_count,
         ss.state_version,
         gs.created_at,
         sp_me.seat_no AS my_seat
       FROM platform.game_sessions gs
       JOIN platform.session_state ss ON ss.session_id = gs.id
       LEFT JOIN platform.session_participants sp_me
         ON sp_me.session_id = gs.id AND sp_me.user_id = $1::uuid
       WHERE gs.game_id = $2::uuid
         AND gs.status IN ('waiting', 'running')
         AND (
           gs.status = 'waiting'
           OR sp_me.user_id IS NOT NULL
         )
       ORDER BY gs.created_at DESC
       LIMIT 50`,
      [userId, BACKGAMMON_GAME_ID]
    );

    return res.rows.map((row) => ({
      sessionId: row.session_id,
      status: row.status,
      participantCount: row.participant_count,
      stateVersion: Number(row.state_version),
      createdAt: row.created_at,
      mySeat:
        row.my_seat === 0 || row.my_seat === 1 ? (row.my_seat as Seat) : null,
    }));
  });
}
