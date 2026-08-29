import type { PoolClient } from "pg";
import { randomBytes } from "node:crypto";
import { replayPlayerMoves } from "@dingmoney/tic-tac-toe-engine";
import type { TicTacToeDifficulty } from "@/lib/tic-tac-toe/constants";
import {
  DEFAULT_TIC_TAC_TOE_PLACEMENTS,
  TIC_TAC_TOE_PLACEMENTS,
  getTicTacToeWinPrizeDing,
  type TicTacToePlacement,
} from "@/lib/tic-tac-toe/constants";
import { withTransaction } from "@/lib/db/withTransaction";
import { connectPgWithRetry } from "@/lib/db/pgConnect";
import { pgPool } from "@/lib/pg";
import { supabaseServer } from "@/lib/supabaseServer";
import type {
  ClaimMatchResult,
  StartMatchResult,
  TicTacToeSettings,
} from "@/lib/tic-tac-toe/types";
import {
  applyOutcomeToProgress,
  EMPTY_TIC_TAC_TOE_PROGRESS_STATS,
  isDifficultySelectable,
  mapProgressStats,
  type TicTacToeProgressStats,
} from "@/lib/tic-tac-toe/progress";

export class TicTacToeRepositoryError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly status = 400
  ) {
    super(message);
    this.name = "TicTacToeRepositoryError";
  }
}

type SettingsRow = {
  is_enabled: boolean;
  win_prize_ding: string | number;
  daily_win_cap: number;
  placements: unknown;
};

function parsePlacements(raw: unknown): TicTacToePlacement[] {
  if (!Array.isArray(raw)) return [...DEFAULT_TIC_TAC_TOE_PLACEMENTS];
  const allowed = new Set<string>(TIC_TAC_TOE_PLACEMENTS);
  const parsed = raw.filter(
    (item): item is TicTacToePlacement =>
      typeof item === "string" && allowed.has(item)
  );
  return parsed.length > 0 ? parsed : [...DEFAULT_TIC_TAC_TOE_PLACEMENTS];
}

function mapSettings(row: SettingsRow): TicTacToeSettings {
  return {
    isEnabled: row.is_enabled,
    winPrizeDing: Number(row.win_prize_ding),
    dailyWinCap: row.daily_win_cap,
    placements: parsePlacements(row.placements),
  };
}

async function loadSettings(client: PoolClient): Promise<TicTacToeSettings> {
  const res = await client.query<SettingsRow>(
    `SELECT is_enabled, win_prize_ding, daily_win_cap, placements
     FROM tic_tac_toe.settings
     WHERE id = 1`
  );
  const row = res.rows[0];
  if (!row) {
    throw new TicTacToeRepositoryError(
      "Tic-Tac-Toe settings missing.",
      "settings_missing",
      500
    );
  }
  return mapSettings(row);
}

function assertDifficulty(value: unknown): TicTacToeDifficulty {
  if (value === "easy" || value === "medium" || value === "hard") {
    return value;
  }
  throw new TicTacToeRepositoryError(
    "Invalid difficulty.",
    "invalid_difficulty",
    400
  );
}

function assertPlayerMoves(value: unknown): number[] {
  if (!Array.isArray(value) || value.length === 0) {
    throw new TicTacToeRepositoryError(
      "playerMoves must be a non-empty array.",
      "invalid_moves",
      400
    );
  }
  for (const move of value) {
    if (!Number.isInteger(move) || move < 0 || move > 8) {
      throw new TicTacToeRepositoryError(
        "Invalid move index.",
        "invalid_moves",
        400
      );
    }
  }
  return value as number[];
}

function createSeed(): string {
  return randomBytes(16).toString("hex");
}

type ProgressRowDb = {
  easy_wins: number;
  easy_losses: number;
  easy_cleared: boolean;
  medium_wins: number;
  medium_losses: number;
  hard_wins: number;
  hard_losses: number;
};

function mapProgressRow(row: ProgressRowDb): TicTacToeProgressStats {
  return {
    easyWins: row.easy_wins,
    easyLosses: row.easy_losses,
    easyCleared: row.easy_cleared,
    mediumWins: row.medium_wins,
    mediumLosses: row.medium_losses,
    hardWins: row.hard_wins,
    hardLosses: row.hard_losses,
  };
}

const PROGRESS_SELECT =
  "easy_wins, easy_losses, easy_cleared, medium_wins, medium_losses, hard_wins, hard_losses";

async function ensureUserProgress(
  client: PoolClient,
  userId: string
): Promise<TicTacToeProgressStats> {
  const res = await client.query<ProgressRowDb>(
    `INSERT INTO tic_tac_toe.user_progress (user_id)
     VALUES ($1::uuid)
     ON CONFLICT (user_id) DO NOTHING
     RETURNING ${PROGRESS_SELECT}`,
    [userId]
  );

  if (res.rows[0]) {
    return mapProgressRow(res.rows[0]);
  }

  const existing = await client.query<ProgressRowDb>(
    `SELECT ${PROGRESS_SELECT}
     FROM tic_tac_toe.user_progress
     WHERE user_id = $1::uuid`,
    [userId]
  );

  const row = existing.rows[0];
  if (!row) {
    return { ...EMPTY_TIC_TAC_TOE_PROGRESS_STATS };
  }

  return mapProgressRow(row);
}

async function loadUserProgressForUpdate(
  client: PoolClient,
  userId: string
): Promise<TicTacToeProgressStats> {
  await client.query(
    `INSERT INTO tic_tac_toe.user_progress (user_id)
     VALUES ($1::uuid)
     ON CONFLICT (user_id) DO NOTHING`,
    [userId]
  );

  const res = await client.query<ProgressRowDb>(
    `SELECT ${PROGRESS_SELECT}
     FROM tic_tac_toe.user_progress
     WHERE user_id = $1::uuid
     FOR UPDATE`,
    [userId]
  );

  const row = res.rows[0];
  if (!row) {
    return { ...EMPTY_TIC_TAC_TOE_PROGRESS_STATS };
  }

  return mapProgressRow(row);
}

async function saveUserProgress(
  client: PoolClient,
  userId: string,
  stats: TicTacToeProgressStats
): Promise<void> {
  await client.query(
    `UPDATE tic_tac_toe.user_progress
     SET easy_wins = $2,
         easy_losses = $3,
         easy_cleared = $4,
         medium_wins = $5,
         medium_losses = $6,
         hard_wins = $7,
         hard_losses = $8,
         updated_at = now()
     WHERE user_id = $1::uuid`,
    [
      userId,
      stats.easyWins,
      stats.easyLosses,
      stats.easyCleared,
      stats.mediumWins,
      stats.mediumLosses,
      stats.hardWins,
      stats.hardLosses,
    ]
  );
}

export async function getTicTacToeUserProgress(
  userId: string
): Promise<TicTacToeProgressStats> {
  if (pgPool) {
    try {
      const client = await connectPgWithRetry(pgPool);
      try {
        return await ensureUserProgress(client, userId);
      } finally {
        client.release();
      }
    } catch (err) {
      console.error("[TicTacToe] pg progress load failed:", err);
    }
  }

  return { ...EMPTY_TIC_TAC_TOE_PROGRESS_STATS };
}

async function countPaidWinsToday(
  client: PoolClient,
  userId: string
): Promise<number> {
  const res = await client.query<{ count: string }>(
    `SELECT COUNT(*)::text AS count
     FROM tic_tac_toe.matches
     WHERE user_id = $1::uuid
       AND paid_ding > 0
       AND paid_at >= date_trunc('day', now() AT TIME ZONE 'UTC')`,
    [userId]
  );
  return Number(res.rows[0]?.count ?? 0);
}

async function loadSettingsFromSupabase(): Promise<TicTacToeSettings> {
  const { data, error } = await supabaseServer
    .schema("tic_tac_toe")
    .from("settings")
    .select("is_enabled, win_prize_ding, daily_win_cap, placements")
    .eq("id", 1)
    .maybeSingle();

  if (error || !data) {
    throw new TicTacToeRepositoryError(
      error?.message || "Tic-Tac-Toe settings missing.",
      "settings_missing",
      500
    );
  }

  return mapSettings(data as SettingsRow);
}

export async function getTicTacToeSettings(): Promise<TicTacToeSettings> {
  if (pgPool) {
    try {
      const client = await connectPgWithRetry(pgPool);
      try {
        return await loadSettings(client);
      } finally {
        client.release();
      }
    } catch (err) {
      console.error("[TicTacToe] pg settings load failed, trying supabase fallback:", err);
    }
  }

  return loadSettingsFromSupabase();
}

export async function updateTicTacToeSettings(input: {
  isEnabled: boolean;
  winPrizeDing: number;
  dailyWinCap: number;
  placements: TicTacToePlacement[];
}): Promise<TicTacToeSettings> {
  if (input.winPrizeDing < 0 || input.dailyWinCap < 0) {
    throw new TicTacToeRepositoryError(
      "Invalid settings values.",
      "invalid_settings",
      400
    );
  }

  return withTransaction(async (client) => {
    await client.query(
      `UPDATE tic_tac_toe.settings
       SET is_enabled = $1,
           win_prize_ding = $2,
           daily_win_cap = $3,
           placements = $4::jsonb,
           updated_at = now()
       WHERE id = 1`,
      [
        input.isEnabled,
        input.winPrizeDing,
        input.dailyWinCap,
        JSON.stringify(input.placements),
      ]
    );
    return loadSettings(client);
  });
}

export async function startTicTacToeMatch(
  userId: string,
  difficultyRaw: unknown
): Promise<StartMatchResult> {
  const difficulty = assertDifficulty(difficultyRaw);

  return withTransaction(async (client) => {
    const settings = await loadSettings(client);
    if (!settings.isEnabled) {
      throw new TicTacToeRepositoryError(
        "Tic-Tac-Toe mini game is disabled.",
        "game_disabled",
        403
      );
    }

    const progressStats = await ensureUserProgress(client, userId);
    const progress = mapProgressStats(progressStats);
    if (!isDifficultySelectable(progress, difficulty)) {
      throw new TicTacToeRepositoryError(
        "Difficulty is locked.",
        "difficulty_locked",
        403
      );
    }

    const seed = createSeed();
    const winPrizeDing = getTicTacToeWinPrizeDing(difficulty);
    const res = await client.query<{ id: string }>(
      `INSERT INTO tic_tac_toe.matches (
         user_id, seed, difficulty, prize_snapshot, status
       ) VALUES ($1::uuid, $2, $3, $4::bigint, 'pending')
       RETURNING id`,
      [userId, seed, difficulty, winPrizeDing]
    );

    const matchId = res.rows[0]?.id;
    if (!matchId) {
      throw new TicTacToeRepositoryError(
        "Failed to create match.",
        "create_failed",
        500
      );
    }

    console.log("[TicTacToe] Match started", {
      matchId,
      userId,
      difficulty,
      prize: winPrizeDing,
    });

    return {
      matchId,
      seed,
      difficulty,
      winPrizeDing,
      progress: progressStats,
    };
  });
}

export async function claimTicTacToeMatch(
  userId: string,
  matchId: string,
  playerMovesRaw: unknown
): Promise<ClaimMatchResult> {
  const playerMoves = assertPlayerMoves(playerMovesRaw);

  return withTransaction(async (client) => {
    const matchRes = await client.query<{
      id: string;
      user_id: string;
      seed: string;
      difficulty: TicTacToeDifficulty;
      prize_snapshot: string | number;
      status: "pending" | "claimed" | "rejected";
      player_moves: number[] | null;
      outcome: "win" | "lose" | "draw" | null;
      paid_ding: string | number;
    }>(
      `SELECT id, user_id, seed, difficulty, prize_snapshot, status,
              player_moves, outcome, paid_ding
       FROM tic_tac_toe.matches
       WHERE id = $1::uuid AND user_id = $2::uuid
       FOR UPDATE`,
      [matchId, userId]
    );

    const match = matchRes.rows[0];
    if (!match) {
      throw new TicTacToeRepositoryError(
        "Match not found.",
        "match_not_found",
        404
      );
    }

    if (match.status !== "pending") {
      const progressStats = await ensureUserProgress(client, userId);
      console.log("[TicTacToe] Claim idempotent replay", {
        matchId,
        userId,
        status: match.status,
        outcome: match.outcome,
        paidDing: Number(match.paid_ding),
      });
      return {
        matchId,
        outcome: match.outcome ?? "lose",
        paidDing: Number(match.paid_ding),
        milestoneBonusDing: 0,
        alreadyClaimed: true,
        progressionEvent: null,
        progress: progressStats,
      };
    }

    const replay = replayPlayerMoves({
      seed: match.seed,
      difficulty: match.difficulty,
      playerMoves,
    });

    if (!replay.valid) {
      await client.query(
        `UPDATE tic_tac_toe.matches
         SET status = 'rejected',
             player_moves = $3::jsonb,
             claim_error = $4,
             claimed_at = now()
         WHERE id = $1::uuid AND user_id = $2::uuid`,
        [matchId, userId, JSON.stringify(playerMoves), replay.error]
      );

      console.warn("[TicTacToe] Claim rejected", {
        matchId,
        userId,
        code: replay.code,
        error: replay.error,
      });

      throw new TicTacToeRepositoryError(
        "Invalid game replay.",
        replay.code,
        400
      );
    }

    const outcome = replay.outcome;
    let paidDing = 0;
    let milestoneBonusDing = 0;

    const currentProgress = await loadUserProgressForUpdate(client, userId);
    const progressUpdate = applyOutcomeToProgress(
      currentProgress,
      match.difficulty,
      outcome
    );
    milestoneBonusDing = progressUpdate.milestoneBonusDing;

    if (outcome === "win") {
      const settings = await loadSettings(client);
      const winsToday = await countPaidWinsToday(client, userId);
      if (winsToday < settings.dailyWinCap) {
        paidDing = Number(match.prize_snapshot);
        console.log("[TicTacToe] Ding credited", {
          matchId,
          userId,
          paidDing,
          winsToday: winsToday + 1,
          cap: settings.dailyWinCap,
        });
      } else {
        console.log("[TicTacToe] Daily win cap reached — no hand prize paid", {
          matchId,
          userId,
          cap: settings.dailyWinCap,
        });
      }
    }

    if (milestoneBonusDing > 0) {
      paidDing += milestoneBonusDing;
      console.log("[TicTacToe] Hard milestone bonus credited", {
        matchId,
        userId,
        milestoneBonusDing,
      });
    }

    if (paidDing > 0) {
      await client.query(
        `INSERT INTO public.ding_balances (user_id, balance, updated_at, created_at)
         VALUES ($1::uuid, $2::bigint, now(), now())
         ON CONFLICT (user_id)
         DO UPDATE SET
           balance = public.ding_balances.balance + EXCLUDED.balance,
           updated_at = now()`,
        [userId, paidDing]
      );
    }

    await saveUserProgress(client, userId, progressUpdate.stats);

    if (progressUpdate.event) {
      console.log("[TicTacToe] Progression event", {
        matchId,
        userId,
        event: progressUpdate.event,
        progress: progressUpdate.stats,
      });
    }

    await client.query(
      `UPDATE tic_tac_toe.matches
       SET status = 'claimed',
           player_moves = $3::jsonb,
           outcome = $4,
           paid_ding = $5::bigint,
           paid_at = CASE WHEN $5::bigint > 0::bigint THEN now() ELSE NULL END,
           claimed_at = now(),
           claim_error = NULL
       WHERE id = $1::uuid AND user_id = $2::uuid`,
      [matchId, userId, JSON.stringify(playerMoves), outcome, paidDing]
    );

    console.log("[TicTacToe] Claim settled", {
      matchId,
      userId,
      outcome,
      paidDing,
      milestoneBonusDing,
      progressionEvent: progressUpdate.event,
    });

    return {
      matchId,
      outcome,
      paidDing,
      milestoneBonusDing,
      alreadyClaimed: false,
      progressionEvent: progressUpdate.event,
      progress: progressUpdate.stats,
    };
  });
}
