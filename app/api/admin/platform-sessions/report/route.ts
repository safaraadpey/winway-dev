import { NextRequest, NextResponse } from "next/server";
import { getAdminContextOrThrow } from "@/lib/supabaseServer";
import { getPlatformReportsSource } from "@/lib/platformReports/config";
import { fetchLegacySessionsReport } from "@/lib/platformReports/legacySessionsReport";
import { fetchPlatformSessionsReport } from "@/lib/platformReports/platformSessionsReport";
import {
  compareSessionsReports,
  logSessionsReportDiff,
} from "@/lib/platformReports/compare";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function getPeriodRange(period: string): { from: Date; to: Date } {
  const now = new Date();
  if (period === "day") {
    const from = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    return { from, to: now };
  }
  if (period === "week") {
    const dayOfWeek = now.getDay();
    const diff = now.getDate() - dayOfWeek + (dayOfWeek === 0 ? -6 : 1);
    const from = new Date(now.getFullYear(), now.getMonth(), diff);
    return { from, to: now };
  }
  const from = new Date(now.getFullYear(), now.getMonth(), 1);
  return { from, to: now };
}

/**
 * Stage 1 admin-only report: session shell + participants.
 * Servable from platform.game_sessions + platform.session_participants.
 *
 * Flag: PLATFORM_REPORTS_SOURCE=legacy|platform|compare (default legacy)
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
    const period = (searchParams.get("period") || "day").toLowerCase();
    const page = Math.max(parseInt(searchParams.get("page") || "1", 10) || 1, 1);
    const pageSizeRaw = parseInt(searchParams.get("pageSize") || "20", 10) || 20;
    const pageSize = Math.min(Math.max(pageSizeRaw, 1), 100);

    let from: Date;
    let to: Date;

    if (period === "range") {
      const fromStr = searchParams.get("from");
      const toStr = searchParams.get("to");
      if (!fromStr || !toStr) {
        return NextResponse.json(
          {
            ok: false,
            error: "validation_error",
            message: "برای بازه، تاریخ از/تا الزامی است.",
          },
          { status: 400 }
        );
      }
      from = new Date(`${fromStr}T00:00:00.000`);
      to = new Date(`${toStr}T23:59:59.999`);
      if (!Number.isFinite(from.getTime()) || !Number.isFinite(to.getTime()) || from > to) {
        return NextResponse.json(
          { ok: false, error: "validation_error", message: "بازه تاریخ نامعتبر است." },
          { status: 400 }
        );
      }
    } else if (period === "day" || period === "week" || period === "month") {
      const range = getPeriodRange(period);
      from = range.from;
      to = range.to;
    } else {
      return NextResponse.json(
        { ok: false, error: "validation_error", message: "period نامعتبر است." },
        { status: 400 }
      );
    }

    const mode = getPlatformReportsSource();
    const queryArgs = { from, to, page, pageSize };

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
              reportsSource: "platform",
            },
          },
          { status: 200 }
        );
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : "platform read failed";
        console.error("[PlatformReports] platform mode failed; refusing silent Bingo swap:", message);
        return NextResponse.json(
          {
            ok: false,
            error: "platform_unavailable",
            message:
              "خواندن Platform ممکن نیست. برای ادامه، PLATFORM_REPORTS_SOURCE=legacy تنظیم کنید.",
            detail: message,
          },
          { status: 503 }
        );
      }
    }

    // legacy + compare always compute legacy first (user-facing result)
    const legacy = await fetchLegacySessionsReport(supabase, queryArgs);

    if (mode === "compare") {
      try {
        const platform = await fetchPlatformSessionsReport(queryArgs);
        const diff = compareSessionsReports(legacy, platform);
        logSessionsReportDiff(diff);
        return NextResponse.json(
          {
            ok: true,
            data: {
              items: legacy.items,
              totalCount: legacy.totalCount,
              page: legacy.page,
              pageSize: legacy.pageSize,
              reportsSource: "compare",
              compare: {
                mismatchCount: diff.mismatchCount,
                rowCountMatch: diff.rowCountMatch,
                // mismatch details are logs-only for operators; summary for admin UI
                summary: {
                  legacyTotal: diff.legacyTotal,
                  platformTotal: diff.platformTotal,
                  missingOnPlatform: diff.missingOnPlatform.length,
                  missingOnLegacy: diff.missingOnLegacy.length,
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
        console.error("[PlatformReports] compare failed; returning legacy only:", message);
        return NextResponse.json(
          {
            ok: true,
            data: {
              items: legacy.items,
              totalCount: legacy.totalCount,
              page: legacy.page,
              pageSize: legacy.pageSize,
              reportsSource: "compare",
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
          reportsSource: "legacy",
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
    console.error("[GET /api/admin/platform-sessions/report] unexpected error:", err);
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
