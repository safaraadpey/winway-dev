/**
 * Tournament tick eligibility — pure port of the SELECTION/decision logic inside
 * tournament.fn_tick_due_tournaments (the outer loop).
 *
 * This is the business decision-making layer of the tournament scheduler:
 *   - which tournaments are "due" (registration_open whose start_at has passed,
 *     or already running),
 *   - whether a registration_open tournament has enough players to start,
 *   - and what to do when it does not (defer start_at by registration_extend_minutes).
 *
 * The per-tournament STATE ADVANCE (fn_tick_tournament) and the heavy seating /
 * cycle operations remain atomic DB RPCs — this module only decides *whether*
 * and *which* of them to invoke, exactly as the SQL outer loop did.
 *
 * Verified against fn_tick_due_tournaments (live DB, 2026-05-31):
 *   min_players_to_start = GREATEST(COALESCE(NULLIF(meta->>'min_players_to_start','')::int, 3), 3)
 *   registration_open & distinct created players < min  → push start_at by extend minutes, skip tick
 *   otherwise (eligible registration_open, or running)   → tick
 */

export type TournamentStatus =
  | "draft"
  | "registration_open"
  | "running"
  | "finished"
  | "cancelled"
  | string;

export const TOURNAMENT_MIN_PLAYERS_FLOOR = 3;
/** Default when meta.registration_extend_minutes is missing (legacy: 1 hour). */
export const TOURNAMENT_DEFER_SECONDS = 3600;
export const TOURNAMENT_EXTEND_MINUTES_DEFAULT = 60;
export const TOURNAMENT_EXTEND_MINUTES_MIN = 1;
export const TOURNAMENT_EXTEND_MINUTES_MAX = 10080; // 7 days

export interface TournamentTickCandidate {
  id: string;
  status: TournamentStatus;
  startAt: string | null;
  meta: Record<string, unknown> | null;
}

export type TournamentTickAction =
  /** Not enough players: defer start_at by registration_extend_minutes, do not tick. */
  | { kind: "defer"; deferSeconds: number }
  /** Advance the tournament via fn_tick_tournament. */
  | { kind: "tick" }
  /** Not due / not actionable this pass. */
  | { kind: "skip" };

/**
 * Resolve min_players_to_start from meta with the SQL's floor of 3.
 * GREATEST(COALESCE(NULLIF(meta->>'min_players_to_start','')::int, 3), 3).
 */
export function resolveMinPlayersToStart(
  meta: Record<string, unknown> | null
): number {
  const raw = meta?.["min_players_to_start"];
  let parsed = TOURNAMENT_MIN_PLAYERS_FLOOR;
  if (raw !== null && raw !== undefined && `${raw}`.trim() !== "") {
    const n = Number.parseInt(`${raw}`, 10);
    if (Number.isFinite(n)) parsed = n;
  }
  return Math.max(parsed, TOURNAMENT_MIN_PLAYERS_FLOOR);
}

/**
 * Resolve registration defer interval from meta.registration_extend_minutes.
 * Matches SQL: clamp(coalesce(nullif(...), 60), 1, 10080) * 60 seconds.
 */
export function resolveRegistrationExtendSeconds(
  meta: Record<string, unknown> | null
): number {
  const raw = meta?.["registration_extend_minutes"];
  let minutes = TOURNAMENT_EXTEND_MINUTES_DEFAULT;
  if (raw !== null && raw !== undefined && `${raw}`.trim() !== "") {
    const n = Number.parseInt(`${raw}`, 10);
    if (Number.isFinite(n)) minutes = n;
  }
  minutes = Math.min(
    Math.max(minutes, TOURNAMENT_EXTEND_MINUTES_MIN),
    TOURNAMENT_EXTEND_MINUTES_MAX
  );
  return minutes * 60;
}

/**
 * Decide the action for one candidate. `distinctCreatedPlayers` is the count of
 * distinct user_id with entry status 'created' (only needed/queried for
 * registration_open candidates).
 */
export function decideTournamentTick(
  candidate: TournamentTickCandidate,
  nowMs: number,
  distinctCreatedPlayers: number
): TournamentTickAction {
  if (candidate.status === "running") {
    return { kind: "tick" };
  }

  if (candidate.status === "registration_open") {
    // Outer query already requires start_at != null && start_at <= now, but
    // re-check defensively to mirror the SQL guard.
    const startMs = candidate.startAt ? Date.parse(candidate.startAt) : null;
    if (startMs === null || startMs > nowMs) return { kind: "skip" };

    const minPlayers = resolveMinPlayersToStart(candidate.meta);
    if (distinctCreatedPlayers < minPlayers) {
      return {
        kind: "defer",
        deferSeconds: resolveRegistrationExtendSeconds(candidate.meta),
      };
    }
    return { kind: "tick" };
  }

  return { kind: "skip" };
}
