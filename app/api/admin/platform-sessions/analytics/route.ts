import { NextRequest, NextResponse } from "next/server";
import { getAdminContextOrThrow } from "@/lib/supabaseServer";
import {
  getPlatformHistorySource,
  HISTORY_DEFAULT_STATUSES,
} from "@/lib/platformReports/config";
import { fetchLegacySessionsAnalytics } from "@/lib/platformReports/legacySessionsReport";
import { fetchPlatformSessionsAnalytics } from "@/lib/platformReports/platformSessionsReport";
import {
  compareSessionsAnalytics,
  logSessionsAnalyticsDiff,
} from "@/lib/platformReports/compare";
import { parsePeriodParams, parseStatusList } from "@/lib/platformReports/period";

/**
 * Stage 2 — non-financial history analytics summary.
 * Flag: PLATFORM_HISTORY_SOURCE=legacy|platform|compare (default legacy)
 *
 * Aggregates session/participant/entry shells only — no prize/commission.
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
      statuses,
    };

    if (mode === "platform") {
      try {
        const platform = await fetchPlatformSessionsAnalytics(queryArgs);
        return NextResponse.json(
          {
            ok: true,
            data: {
              ...platform,
              statuses,
              historySource: "platform",
            },
          },
          { status: 200 }
        );
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : "platform read failed";
        console.error(
          "[PlatformHistory] analytics platform mode failed; refusing silent Bingo swap:",
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

    const legacy = await fetchLegacySessionsAnalytics(supabase, queryArgs);

    if (mode === "compare") {
      try {
        const platform = await fetchPlatformSessionsAnalytics(queryArgs);
        const diff = compareSessionsAnalytics(legacy, platform);
        logSessionsAnalyticsDiff(diff);
        return NextResponse.json(
          {
            ok: true,
            data: {
              ...legacy,
              statuses,
              historySource: "compare",
              compare: {
                mismatchCount: diff.mismatchCount,
                summary: {
                  sessionCountMatch: diff.sessionCountMatch,
                  participantCountMatch: diff.participantCountMatch,
                  amountMatch: diff.amountMatch,
                  byStatusMismatches: diff.byStatusMismatches.length,
                },
              },
            },
          },
          { status: 200 }
        );
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : "compare failed";
        console.error(
          "[PlatformHistory] analytics compare failed; returning legacy only:",
          message
        );
        return NextResponse.json(
          {
            ok: true,
            data: {
              ...legacy,
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
          ...legacy,
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
    console.error(
      "[GET /api/admin/platform-sessions/analytics] unexpected error:",
      err
    );
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
