import type { TicTacToeDifficulty } from "@/lib/tic-tac-toe/constants";
import {
  TIC_TAC_TOE_HARD_MILESTONE_BONUS_DING,
  TIC_TAC_TOE_MILESTONE_WINS,
} from "@/lib/tic-tac-toe/constants";

export type TicTacToeProgressStats = {
  easyWins: number;
  easyLosses: number;
  easyCleared: boolean;
  mediumWins: number;
  mediumLosses: number;
  hardWins: number;
  hardLosses: number;
};

export type TicTacToeDifficultyStats = {
  wins: number;
  losses: number;
  locked: boolean;
  selectable: boolean;
};

export type TicTacToeUserProgress = {
  easy: TicTacToeDifficultyStats;
  medium: TicTacToeDifficultyStats;
  hard: TicTacToeDifficultyStats;
  suggestedDifficulty: TicTacToeDifficulty;
};

export type TicTacToeProgressionEvent =
  | "easy_completed"
  | "medium_completed"
  | "medium_penalty_reopen_easy"
  | "hard_milestone"
  | "hard_penalty_reset";

export const EMPTY_TIC_TAC_TOE_PROGRESS_STATS: TicTacToeProgressStats = {
  easyWins: 0,
  easyLosses: 0,
  easyCleared: false,
  mediumWins: 0,
  mediumLosses: 0,
  hardWins: 0,
  hardLosses: 0,
};

export function mapProgressStats(
  stats: TicTacToeProgressStats
): TicTacToeUserProgress {
  const easyLocked = stats.easyWins >= TIC_TAC_TOE_MILESTONE_WINS;
  const mediumLocked = stats.mediumWins >= TIC_TAC_TOE_MILESTONE_WINS;
  const easyPathUnlocked = stats.easyCleared;

  return {
    easy: {
      wins: Math.min(stats.easyWins, TIC_TAC_TOE_MILESTONE_WINS),
      losses: stats.easyLosses,
      locked: easyLocked,
      selectable: !easyLocked,
    },
    medium: {
      wins: Math.min(stats.mediumWins, TIC_TAC_TOE_MILESTONE_WINS),
      losses: stats.mediumLosses,
      locked: mediumLocked,
      selectable: easyPathUnlocked && !mediumLocked,
    },
    hard: {
      wins: Math.min(stats.hardWins, TIC_TAC_TOE_MILESTONE_WINS),
      losses: stats.hardLosses,
      locked: false,
      selectable: easyPathUnlocked,
    },
    suggestedDifficulty: !easyLocked
      ? "easy"
      : !mediumLocked
        ? "medium"
        : "hard",
  };
}

export function isDifficultySelectable(
  progress: TicTacToeUserProgress,
  difficulty: TicTacToeDifficulty
): boolean {
  return progress[difficulty].selectable;
}

export type ApplyOutcomeResult = {
  stats: TicTacToeProgressStats;
  event: TicTacToeProgressionEvent | null;
  milestoneBonusDing: number;
};

export function applyOutcomeToProgress(
  stats: TicTacToeProgressStats,
  difficulty: TicTacToeDifficulty,
  outcome: "win" | "lose" | "draw"
): ApplyOutcomeResult {
  if (outcome === "draw") {
    return { stats, event: null, milestoneBonusDing: 0 };
  }

  const next: TicTacToeProgressStats = { ...stats };
  let event: TicTacToeProgressionEvent | null = null;
  let milestoneBonusDing = 0;

  if (difficulty === "easy") {
    if (outcome === "win") {
      next.easyWins += 1;
      if (next.easyWins >= TIC_TAC_TOE_MILESTONE_WINS) {
        next.easyCleared = true;
        event = "easy_completed";
      }
    } else {
      next.easyLosses += 1;
    }
  } else if (difficulty === "medium") {
    if (outcome === "win") {
      next.mediumWins += 1;
      if (next.mediumWins >= TIC_TAC_TOE_MILESTONE_WINS) {
        event = "medium_completed";
      }
    } else {
      next.mediumLosses += 1;
      if (next.mediumLosses >= TIC_TAC_TOE_MILESTONE_WINS) {
        event = "medium_penalty_reopen_easy";
        next.easyWins = 0;
        next.mediumLosses = 0;
      }
    }
  } else if (outcome === "win") {
    next.hardWins += 1;
    if (next.hardWins >= TIC_TAC_TOE_MILESTONE_WINS) {
      event = "hard_milestone";
      milestoneBonusDing = TIC_TAC_TOE_HARD_MILESTONE_BONUS_DING;
      next.hardWins = 0;
    }
  } else {
    next.hardLosses += 1;
    if (next.hardLosses >= TIC_TAC_TOE_MILESTONE_WINS) {
      event = "hard_penalty_reset";
      next.easyWins = 0;
      next.mediumWins = 0;
      next.easyCleared = false;
      next.hardLosses = 0;
    }
  }

  return { stats: next, event, milestoneBonusDing };
}

export function difficultyAfterProgressionEvent(
  event: TicTacToeProgressionEvent | null
): TicTacToeDifficulty | null {
  switch (event) {
    case "easy_completed":
      return "medium";
    case "medium_completed":
    case "hard_milestone":
      return "hard";
    case "medium_penalty_reopen_easy":
    case "hard_penalty_reset":
      return "easy";
    default:
      return null;
  }
}
