import { NextRequest, NextResponse } from "next/server";
import { getAdminContextOrThrow } from "@/lib/supabaseServer";
import {
  getPlatformHistorySource,
  HISTORY_DEFAULT_STATUSES,
} from "@/lib/platformReports/config";
import { fetchLegacySessionsReport } from "@/lib/platformReports/legacySessionsReport";
import { fetchPlatformSessionsReport } from "@/lib/platformReports/platformSessionsReport";
import {
  compareSessionsReports,
  logSessionsHistoryDiff,
} from "@/lib/platformReports/compare";
import { parsePeriodParams, parseStatusList } from "@/lib/platformReports/period";

/**
 * Stage 2 — completed/cancelled (terminal) session history.
 * Flag: PLATFORM_HISTORY_SOURCE=legacy|platform|compare (default legacy)
 *
 * Reads: platform.game_sessions + platform.session_participants (platform mode)
 * Does not touch wallet / tournament / lobby / live / settlement writes.
 */
export async function GET(request: NextRequest) {
  try {
    const { session, supabase } = await getAdminContextOrThrow(request);

    if (!["admin", "super"].includes(session.role)) {
      return NextResponse.json(
        {
          ok: false,
          error: "forbidden",
          message: "فقط ادمین/سوپر می‌توانند این گزارش را ببینند.",
        },
        { status: 403 }
      );
    }

    const { searchParams } = new URL(request.url);
    const page = Math.max(parseInt(searchParams.get("page") || "1", 10) || 1, 1);
    const pageSizeRaw = parseInt(searchParams.get("pageSize") || "20", 10) || 20;
    const pageSize = Math.min(Math.max(pageSizeRaw, 1), 100);
    const statuses = parseStatusList(
      searchParams.get("status"),
      HISTORY_DEFAULT_STATUSES
    );

    const period = parsePeriodParams(searchParams);
    if ("error" in period) {
      return NextResponse.json(
        { ok: false, error: "validation_error", message: period.error },
        { status: 400 }
      );
    }

    const mode = getPlatformHistorySource();
    const queryArgs = {
      from: period.from,
      to: period.to,
      page,
      pageSize,
      statuses,
    };

    if (mode === "platform") {
      try {
        const platform = await fetchPlatformSessionsReport(queryArgs);
        return NextResponse.json(
          {
            ok: true,
            data: {
              items: platform.items,
              totalCount: platform.totalCount,
              page: platform.page,
              pageSize: platform.pageSize,
              statuses,
              historySource: "platform",
            },
          },
          { status: 200 }
        );
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : "platform read failed";
        console.error(
          "[PlatformHistory] history platform mode failed; refusing silent Bingo swap:",
          message
        );
        return NextResponse.json(
          {
            ok: false,
            error: "platform_unavailable",
            message:
              "خواندن Platform ممکن نیست. برای ادامه، PLATFORM_HISTORY_SOURCE=legacy تنظیم کنید.",
            detail: message,
          },
          { status: 503 }
        );
      }
    }

    const legacy = await fetchLegacySessionsReport(supabase, queryArgs);

    if (mode === "compare") {
      try {
        const platform = await fetchPlatformSessionsReport(queryArgs);
        const diff = compareSessionsReports(legacy, platform);
        logSessionsHistoryDiff(diff);
        return NextResponse.json(
          {
            ok: true,
            data: {
              items: legacy.items,
              totalCount: legacy.totalCount,
              page: legacy.page,
              pageSize: legacy.pageSize,
              statuses,
              historySource: "compare",
              compare: {
                mismatchCount: diff.mismatchCount,
                rowCountMatch: diff.rowCountMatch,
                summary: {
                  legacyTotal: diff.legacyTotal,
                  platformTotal: diff.platformTotal,
                  missingOnPlatform: diff.missingOnPlatform.length,
                  missingOnLegacy: diff.missingOnLegacy.length,
                  gameSlugMismatches: diff.gameSlugMismatches.length,
                  statusMismatches: diff.statusMismatches.length,
                  participantCountMismatches: diff.participantCountMismatches.length,
                  amountMismatches: diff.amountMismatches.length,
                  timestampMismatches: diff.timestampMismatches.length,
                  participantDetailMismatches: diff.participantDetailMismatches.length,
                },
              },
            },
          },
          { status: 200 }
        );
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : "compare failed";
        console.error(
          "[PlatformHistory] history compare failed; returning legacy only:",
          message
        );
        return NextResponse.json(
          {
            ok: true,
            data: {
              items: legacy.items,
              totalCount: legacy.totalCount,
              page: legacy.page,
              pageSize: legacy.pageSize,
              statuses,
              historySource: "compare",
              compare: { error: message, mismatchCount: -1 },
            },
          },
          { status: 200 }
        );
      }
    }

    return NextResponse.json(
      {
        ok: true,
        data: {
          items: legacy.items,
          totalCount: legacy.totalCount,
          page: legacy.page,
          pageSize: legacy.pageSize,
          statuses,
          historySource: "legacy",
        },
      },
      { status: 200 }
    );
  } catch (err: any) {
    if (err?.message === "UNAUTHORIZED") {
      return NextResponse.json(
        { ok: false, error: "unauthorized", message: "جلسه معتبر نیست." },
        { status: 401 }
      );
    }
    if (err?.message === "FORBIDDEN") {
      return NextResponse.json(
        { ok: false, error: "forbidden", message: "دسترسی کافی نیست." },
        { status: 403 }
      );
    }
    console.error("[GET /api/admin/platform-sessions/history] unexpected error:", err);
    return NextResponse.json(
      {
        ok: false,
        error: "unexpected_error",
        message: err?.message || "خطای غیرمنتظره",
      },
      { status: 500 }
    );
  }
}
