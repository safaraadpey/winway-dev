import type { SessionReportRow, SessionsReportResult } from "./types";

export type SessionsReportDiff = {
  rowCountMatch: boolean;
  legacyTotal: number;
  platformTotal: number;
  legacyItemCount: number;
  platformItemCount: number;
  missingOnPlatform: string[];
  missingOnLegacy: string[];
  gameSlugMismatches: Array<{ sessionId: string; legacy: string; platform: string }>;
  statusMismatches: Array<{ sessionId: string; legacy: string; platform: string }>;
  participantCountMismatches: Array<{
    sessionId: string;
    legacy: number;
    platform: number;
  }>;
  amountMismatches: Array<{ sessionId: string; legacy: number; platform: number }>;
  timestampMismatches: Array<{
    sessionId: string;
    field: string;
    legacy: string | null;
    platform: string | null;
  }>;
  participantDetailMismatches: Array<{
    sessionId: string;
    userId: string;
    reason: string;
  }>;
  mismatchCount: number;
};

function tsKey(v: string | null | undefined): string | null {
  if (!v) return null;
  const t = new Date(v).getTime();
  return Number.isFinite(t) ? new Date(t).toISOString() : String(v);
}

/**
 * Compare legacy vs platform session reports (Stage 1).
 * Does not throw — callers log and still return legacy.
 */
export function compareSessionsReports(
  legacy: SessionsReportResult,
  platform: SessionsReportResult
): SessionsReportDiff {
  const legacyById = new Map(legacy.items.map((r) => [r.sessionId, r]));
  const platformById = new Map(platform.items.map((r) => [r.sessionId, r]));

  const missingOnPlatform: string[] = [];
  const missingOnLegacy: string[] = [];
  const gameSlugMismatches: SessionsReportDiff["gameSlugMismatches"] = [];
  const statusMismatches: SessionsReportDiff["statusMismatches"] = [];
  const participantCountMismatches: SessionsReportDiff["participantCountMismatches"] = [];
  const amountMismatches: SessionsReportDiff["amountMismatches"] = [];
  const timestampMismatches: SessionsReportDiff["timestampMismatches"] = [];
  const participantDetailMismatches: SessionsReportDiff["participantDetailMismatches"] = [];

  for (const id of legacyById.keys()) {
    if (!platformById.has(id)) missingOnPlatform.push(id);
  }
  for (const id of platformById.keys()) {
    if (!legacyById.has(id)) missingOnLegacy.push(id);
  }

  for (const [id, L] of legacyById) {
    const P = platformById.get(id);
    if (!P) continue;

    if ((L.gameSlug || "bingo") !== (P.gameSlug || "bingo")) {
      gameSlugMismatches.push({
        sessionId: id,
        legacy: L.gameSlug || "bingo",
        platform: P.gameSlug || "bingo",
      });
    }
    if (L.status !== P.status) {
      statusMismatches.push({ sessionId: id, legacy: L.status, platform: P.status });
    }
    if (L.participantCount !== P.participantCount) {
      participantCountMismatches.push({
        sessionId: id,
        legacy: L.participantCount,
        platform: P.participantCount,
      });
    }
    if (Math.abs(L.amountTotal - P.amountTotal) > 0.009) {
      amountMismatches.push({
        sessionId: id,
        legacy: L.amountTotal,
        platform: P.amountTotal,
      });
    }

    for (const field of ["createdAt", "startedAt", "finishedAt", "settledAt"] as const) {
      const lv = tsKey(L[field]);
      const pv = tsKey(P[field]);
      if (lv !== pv) {
        // createdAt should match closely; started/finished/settled may differ slightly by projection rules
        if (field === "createdAt" || (lv && pv)) {
          timestampMismatches.push({
            sessionId: id,
            field,
            legacy: lv,
            platform: pv,
          });
        } else if (Boolean(lv) !== Boolean(pv)) {
          timestampMismatches.push({
            sessionId: id,
            field,
            legacy: lv,
            platform: pv,
          });
        }
      }
    }

    compareParticipants(id, L, P, participantDetailMismatches);
  }

  const mismatchCount =
    (legacy.totalCount !== platform.totalCount ? 1 : 0) +
    (legacy.items.length !== platform.items.length ? 1 : 0) +
    missingOnPlatform.length +
    missingOnLegacy.length +
    gameSlugMismatches.length +
    statusMismatches.length +
    participantCountMismatches.length +
    amountMismatches.length +
    timestampMismatches.length +
    participantDetailMismatches.length;

  return {
    rowCountMatch:
      legacy.totalCount === platform.totalCount &&
      legacy.items.length === platform.items.length,
    legacyTotal: legacy.totalCount,
    platformTotal: platform.totalCount,
    legacyItemCount: legacy.items.length,
    platformItemCount: platform.items.length,
    missingOnPlatform,
    missingOnLegacy,
    gameSlugMismatches,
    statusMismatches,
    participantCountMismatches,
    amountMismatches,
    timestampMismatches,
    participantDetailMismatches,
    mismatchCount,
  };
}

function compareParticipants(
  sessionId: string,
  L: SessionReportRow,
  P: SessionReportRow,
  out: SessionsReportDiff["participantDetailMismatches"]
) {
  const lMap = new Map(L.participants.map((p) => [p.userId, p]));
  const pMap = new Map(P.participants.map((p) => [p.userId, p]));

  for (const [uid, lp] of lMap) {
    const pp = pMap.get(uid);
    if (!pp) {
      out.push({ sessionId, userId: uid, reason: "missing_on_platform" });
      continue;
    }
    if (lp.status !== pp.status) {
      out.push({
        sessionId,
        userId: uid,
        reason: `status legacy=${lp.status} platform=${pp.status}`,
      });
    }
    if (lp.ticketCount !== pp.ticketCount) {
      out.push({
        sessionId,
        userId: uid,
        reason: `ticketCount legacy=${lp.ticketCount} platform=${pp.ticketCount}`,
      });
    }
    if (Math.abs(lp.amountTotal - pp.amountTotal) > 0.009) {
      out.push({
        sessionId,
        userId: uid,
        reason: `amount legacy=${lp.amountTotal} platform=${pp.amountTotal}`,
      });
    }
    if (tsKey(lp.sourceUpdatedAt) !== tsKey(pp.sourceUpdatedAt)) {
      out.push({
        sessionId,
        userId: uid,
        reason: `sourceUpdatedAt legacy=${tsKey(lp.sourceUpdatedAt)} platform=${tsKey(pp.sourceUpdatedAt)}`,
      });
    }
  }

  for (const uid of pMap.keys()) {
    if (!lMap.has(uid)) {
      // Platform may retain left-only users; ignore left-only extras for compare noise
      const pp = pMap.get(uid)!;
      if (pp.status !== "left") {
        out.push({ sessionId, userId: uid, reason: "missing_on_legacy" });
      }
    }
  }
}

export function logSessionsReportDiff(diff: SessionsReportDiff): void {
  console.log(
    "[PlatformReports] compare",
    JSON.stringify({
      mismatchCount: diff.mismatchCount,
      rowCountMatch: diff.rowCountMatch,
      legacyTotal: diff.legacyTotal,
      platformTotal: diff.platformTotal,
      missingOnPlatform: diff.missingOnPlatform.slice(0, 20),
      missingOnLegacy: diff.missingOnLegacy.slice(0, 20),
      gameSlugMismatches: diff.gameSlugMismatches.slice(0, 20),
      statusMismatches: diff.statusMismatches.slice(0, 20),
      participantCountMismatches: diff.participantCountMismatches.slice(0, 20),
      amountMismatches: diff.amountMismatches.slice(0, 20),
      timestampMismatches: diff.timestampMismatches.slice(0, 20),
      participantDetailMismatches: diff.participantDetailMismatches.slice(0, 40),
    })
  );
}

export type SessionsAnalyticsDiff = {
  mismatchCount: number;
  sessionCountMatch: boolean;
  participantCountMatch: boolean;
  amountMatch: boolean;
  byStatusMismatches: Array<{ status: string; legacy: number; platform: number }>;
  legacy: { sessionCount: number; participantCount: number; amountTotal: number };
  platform: { sessionCount: number; participantCount: number; amountTotal: number };
};

export function compareSessionsAnalytics(
  legacy: import("./types").SessionsAnalyticsResult,
  platform: import("./types").SessionsAnalyticsResult
): SessionsAnalyticsDiff {
  const statuses = new Set([
    ...Object.keys(legacy.byStatus || {}),
    ...Object.keys(platform.byStatus || {}),
  ]);
  const byStatusMismatches: SessionsAnalyticsDiff["byStatusMismatches"] = [];
  for (const status of statuses) {
    const lv = legacy.byStatus[status] || 0;
    const pv = platform.byStatus[status] || 0;
    if (lv !== pv) byStatusMismatches.push({ status, legacy: lv, platform: pv });
  }

  const sessionCountMatch = legacy.sessionCount === platform.sessionCount;
  const participantCountMatch = legacy.participantCount === platform.participantCount;
  const amountMatch = Math.abs(legacy.amountTotal - platform.amountTotal) <= 0.009;

  const mismatchCount =
    (sessionCountMatch ? 0 : 1) +
    (participantCountMatch ? 0 : 1) +
    (amountMatch ? 0 : 1) +
    byStatusMismatches.length;

  return {
    mismatchCount,
    sessionCountMatch,
    participantCountMatch,
    amountMatch,
    byStatusMismatches,
    legacy: {
      sessionCount: legacy.sessionCount,
      participantCount: legacy.participantCount,
      amountTotal: legacy.amountTotal,
    },
    platform: {
      sessionCount: platform.sessionCount,
      participantCount: platform.participantCount,
      amountTotal: platform.amountTotal,
    },
  };
}

export function logSessionsAnalyticsDiff(diff: SessionsAnalyticsDiff): void {
  console.log("[PlatformHistory] analytics compare", JSON.stringify(diff));
}

export function logSessionsHistoryDiff(diff: SessionsReportDiff): void {
  console.log(
    "[PlatformHistory] history compare",
    JSON.stringify({
      mismatchCount: diff.mismatchCount,
      rowCountMatch: diff.rowCountMatch,
      legacyTotal: diff.legacyTotal,
      platformTotal: diff.platformTotal,
      missingOnPlatform: diff.missingOnPlatform.slice(0, 20),
      missingOnLegacy: diff.missingOnLegacy.slice(0, 20),
      gameSlugMismatches: diff.gameSlugMismatches.slice(0, 20),
      statusMismatches: diff.statusMismatches.slice(0, 20),
      participantCountMismatches: diff.participantCountMismatches.slice(0, 20),
      amountMismatches: diff.amountMismatches.slice(0, 20),
      timestampMismatches: diff.timestampMismatches.slice(0, 20),
      participantDetailMismatches: diff.participantDetailMismatches.slice(0, 40),
    })
  );
}
