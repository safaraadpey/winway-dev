/**
 * In-process mismatch reporting for dual-mode shadow validation.
 * Structured logs only — no new persistence layer (Phase 2 constraint).
 */

import type { Logger } from "../metrics/logger.js";
import type {
  DualModeValidationContext,
  DualModeValidationResult,
  MismatchDetail,
  MismatchKind,
} from "./dual-mode-validator.js";

export interface MismatchReporterStats {
  validations: number;
  mismatches: number;
  mismatchRate: number;
  byKind: Record<MismatchKind, number>;
  lastMismatchAt: string | null;
}

const LOG_EVENT = "marking_engine_parity_mismatch";
const LOG_SUMMARY = "marking_engine_parity_summary";

export class MismatchReporter {
  private validations = 0;
  private mismatchDraws = 0;
  private byKind = new Map<MismatchKind, number>();
  private lastMismatchAt: string | null = null;
  private drawsSinceSummary = 0;

  constructor(
    private readonly log: Logger,
    private readonly summaryEvery: number
  ) {}

  record(
    result: DualModeValidationResult,
    context: DualModeValidationContext
  ): void {
    this.validations += 1;
    this.drawsSinceSummary += 1;

    if (!result.parity) {
      this.mismatchDraws += 1;
      this.lastMismatchAt = new Date().toISOString();
      for (const m of result.mismatches) {
        this.byKind.set(m.kind, (this.byKind.get(m.kind) ?? 0) + 1);
      }
      this.logMismatch(result.mismatches, context);
    }

    if (this.drawsSinceSummary >= this.summaryEvery) {
      this.emitSummary();
      this.drawsSinceSummary = 0;
    }
  }

  getStats(): MismatchReporterStats {
    const byKind: Record<string, number> = {};
    for (const [kind, count] of this.byKind) byKind[kind] = count;
    return {
      validations: this.validations,
      mismatches: this.mismatchDraws,
      mismatchRate:
        this.validations > 0 ? this.mismatchDraws / this.validations : 0,
      byKind: byKind as Record<MismatchKind, number>,
      lastMismatchAt: this.lastMismatchAt,
    };
  }

  emitSummary(): void {
    const stats = this.getStats();
    this.log.info(LOG_SUMMARY, {
      MarkingParitySummary: {
        ...stats,
        mismatchRatePct: Math.round(stats.mismatchRate * 100000) / 1000,
        authoritative: "scan",
        shadow: "bitmask",
      },
    });
  }

  private logMismatch(
    mismatches: MismatchDetail[],
    context: DualModeValidationContext
  ): void {
    this.log.error(LOG_EVENT, {
      MarkingParityMismatch: {
        ...context,
        mismatchCount: mismatches.length,
        mismatches,
        authoritative: "scan",
        shadow: "bitmask",
      },
    });
  }
}

let globalReporter: MismatchReporter | null = null;

export function getMismatchReporter(
  log: Logger,
  summaryEvery = 500
): MismatchReporter {
  if (!globalReporter) {
    globalReporter = new MismatchReporter(log, summaryEvery);
  }
  return globalReporter;
}

/** Test hook */
export function resetMismatchReporterForTests(): void {
  globalReporter = null;
}
