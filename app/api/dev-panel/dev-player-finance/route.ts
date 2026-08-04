import { NextRequest, NextResponse } from "next/server";
import { getDevPanelContextOrThrow } from "@/lib/supabaseServer";
import type {
  DevPlayerFinancePeriod,
  DevPlayerFinanceSummary,
} from "@/src/types/dev-player-finance";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PERIOD_LABELS: Record<DevPlayerFinancePeriod, string> = {
  day: "روزانه",
  week: "هفتگی",
  month: "ماهانه",
};

const ALL_PERIODS: DevPlayerFinancePeriod[] = ["day", "week", "month"];

function isPeriod(value: string | null): value is DevPlayerFinancePeriod {
  return value === "day" || value === "week" || value === "month";
}

function mapRpcRow(period: DevPlayerFinancePeriod, row: Record<string, unknown>): DevPlayerFinanceSummary {
  return {
    period,
    periodLabel: PERIOD_LABELS[period],
    from: String(row.from ?? ""),
    to: String(row.to ?? ""),
    devPlayerCount: Number(row.dev_player_count ?? 0),
    cardsPurchased: Number(row.cards_purchased ?? 0),
    totalPurchaseAmount: Number(row.total_purchase_amount ?? 0),
    totalWinAmount: Number(row.total_win_amount ?? 0),
    totalCommissionAmount: Number(row.total_commission_amount ?? 0),
    totalLossAmount: Number(row.total_loss_amount ?? 0),
    currency: String(row.currency ?? "IRR"),
  };
}

async function loadSummaryForPeriod(
  supabase: Awaited<ReturnType<typeof getDevPanelContextOrThrow>>["supabase"],
  period: DevPlayerFinancePeriod,
  timezone: string
): Promise<DevPlayerFinanceSummary> {
  const { data, error } = await supabase.rpc("fn_dev_panel_dev_player_finance_summary", {
    p_period: period,
    p_timezone: timezone,
  });

  if (error) {
    throw new Error(error.message);
  }

  const row =
    data && typeof data === "object" && !Array.isArray(data)
      ? (data as Record<string, unknown>)
      : {};

  return mapRpcRow(period, row);
}

export async function GET(request: NextRequest) {
  try {
    const { supabase } = await getDevPanelContextOrThrow(request);
    const { searchParams } = new URL(request.url);
    const periodParam = searchParams.get("period");
    const timezone = (searchParams.get("timezone") || "Asia/Tehran").trim() || "Asia/Tehran";

    const periods = isPeriod(periodParam) ? [periodParam] : ALL_PERIODS;
    const summaries: DevPlayerFinanceSummary[] = [];

    for (const period of periods) {
      summaries.push(await loadSummaryForPeriod(supabase, period, timezone));
    }

    return NextResponse.json({
      ok: true,
      data: { summaries },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    if (message === "FORBIDDEN_DEV_PANEL") {
      return NextResponse.json(
        { ok: false, error: "forbidden", message: "Dev panel access required" },
        { status: 403 }
      );
    }
    console.error("GET /api/dev-panel/dev-player-finance error:", err);
    return NextResponse.json(
      { ok: false, error: "database_error", message },
      { status: 500 }
    );
  }
}
