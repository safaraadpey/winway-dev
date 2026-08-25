import { NextRequest, NextResponse } from "next/server";
import { createServiceClient, getUserFromRequest } from "@/lib/supabaseServer";
import { assertFeature, featureDisabledResponse } from "@/lib/featureFlags/requireFeature";
import {
  parseAutoBuySnapshot,
  parseAutoBuyStartResult,
} from "@/lib/autoBuy/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const AUTO_BUY_FEATURE = "auto_buy";

function mapAutoBuyError(message: string): { status: number; message: string } {
  const lower = message.toLowerCase();
  if (lower.includes("insufficient balance")) {
    return { status: 400, message: "موجودی کافی برای صندوق نیست." };
  }
  if (lower.includes("global registration locked")) {
    return { status: 403, message: "ثبت نام بازی موقتاً قفل است." };
  }
  if (lower.includes("password rooms")) {
    return { status: 400, message: "خرید اتوماتیک برای اتاق رمزی فعال نیست." };
  }
  if (lower.includes("tournament")) {
    return { status: 400, message: "خرید اتوماتیک برای تورنومنت فعال نیست." };
  }
  if (lower.includes("already running for template")) {
    return { status: 409, message: "برای این سایز اتاق یک خرید اتوماتیک فعال دارید." };
  }
  if (lower.includes("already running")) {
    return { status: 409, message: "یک خرید اتوماتیک فعال دارید." };
  }
  if (lower.includes("profit target")) {
    return { status: 400, message: "سقف برد باید بیشتر از صفر باشد." };
  }
  if (lower.includes("fund must cover")) {
    return { status: 400, message: "صندوق باید حداقل یک دور بازی را پوشش دهد." };
  }
  return { status: 400, message: message || "درخواست نامعتبر است." };
}

export async function GET(request: NextRequest) {
  try {
    const user = await getUserFromRequest(request);
    if (!user) {
      return NextResponse.json(
        { ok: false, error: "unauthorized", message: "Authentication required." },
        { status: 401 }
      );
    }

    await assertFeature(user.id, AUTO_BUY_FEATURE);

    const templateId = request.nextUrl.searchParams.get("templateId");
    const scope = request.nextUrl.searchParams.get("scope");
    const supabase = createServiceClient();

    if (scope === "lobby") {
      try {
        await assertFeature(user.id, AUTO_BUY_FEATURE);
      } catch (err) {
        if (err instanceof Error && err.name === "FeatureDisabledError") {
          return NextResponse.json({ ok: true, data: { sessions: {} } });
        }
        throw err;
      }

      const { data, error } = await supabase
        .from("player_auto_buy_sessions")
        .select(
          "id, template_id, status, card_count, fund_initial, fund_remaining, profit_target, last_room_id, serial_buy_enabled, anchor_room_id, serial_next_room_id, stop_reason, started_at, stopped_at"
        )
        .eq("user_id", user.id)
        .eq("status", "running");

      if (error) {
        console.error("[AutoBuy] lobby snapshots error:", error);
        return NextResponse.json(
          { ok: false, error: "snapshot_failed", message: error.message },
          { status: 500 }
        );
      }

      const sessions: Record<string, ReturnType<typeof parseAutoBuySnapshot>> = {};
      for (const row of data ?? []) {
        const snapshot = parseAutoBuySnapshot({
          active: true,
          session_id: row.id,
          template_id: row.template_id,
          status: row.status,
          card_count: row.card_count,
          fund_initial: row.fund_initial,
          fund_remaining: row.fund_remaining,
          profit_target: row.profit_target,
          last_room_id: row.last_room_id,
          serial_buy_enabled: row.serial_buy_enabled,
          anchor_room_id: row.anchor_room_id,
          serial_next_room_id: row.serial_next_room_id,
          stop_reason: row.stop_reason,
          started_at: row.started_at,
          stopped_at: row.stopped_at,
        });
        if (snapshot.templateId) {
          sessions[snapshot.templateId] = snapshot;
        }
      }

      return NextResponse.json({ ok: true, data: { sessions } });
    }

    const { data, error } = await supabase.rpc("fn_player_auto_buy_snapshot", {
      p_user_id: user.id,
      p_template_id: templateId || null,
    });

    if (error) {
      console.error("[AutoBuy] snapshot error:", error);
      return NextResponse.json(
        { ok: false, error: "snapshot_failed", message: error.message },
        { status: 500 }
      );
    }

    const snapshot = parseAutoBuySnapshot((data ?? {}) as Record<string, unknown>);
    return NextResponse.json({ ok: true, data: snapshot });
  } catch (err) {
    if (err instanceof Error && err.name === "FeatureDisabledError") {
      return featureDisabledResponse(AUTO_BUY_FEATURE);
    }
    console.error("[AutoBuy] GET error:", err);
    return NextResponse.json(
      { ok: false, error: "unexpected_error", message: "Unexpected error." },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await getUserFromRequest(request);
    if (!user) {
      return NextResponse.json(
        { ok: false, error: "unauthorized", message: "Authentication required." },
        { status: 401 }
      );
    }

    await assertFeature(user.id, AUTO_BUY_FEATURE);

    let body: {
      action?: string;
      templateId?: string;
      fundAmount?: number;
      cardCount?: number;
      profitTarget?: number;
      skipFirstJoin?: boolean;
      serialBuyEnabled?: boolean;
      anchorRoomId?: string | null;
      idempotencyKey?: string;
    };

    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        { ok: false, error: "invalid_json", message: "Invalid JSON body." },
        { status: 400 }
      );
    }

    const action = String(body.action || "").trim();
    const supabase = createServiceClient();

    if (action === "stop") {
      const stopTemplateId = body.templateId
        ? String(body.templateId).trim()
        : null;
      const { data, error } = await supabase.rpc("fn_player_auto_buy_stop", {
        p_user_id: user.id,
        p_template_id: stopTemplateId,
      });
      if (error) {
        console.error("[AutoBuy] stop error:", error);
        return NextResponse.json(
          { ok: false, error: "stop_failed", message: error.message },
          { status: 400 }
        );
      }
      console.info("[AutoBuy] stopped", { userId: user.id, result: data });
      return NextResponse.json({ ok: true, data });
    }

    if (action !== "start") {
      return NextResponse.json(
        { ok: false, error: "invalid_action", message: "action must be start or stop." },
        { status: 400 }
      );
    }

    const templateId = String(body.templateId || "").trim();
    const fundAmount = Number(body.fundAmount);
    const cardCount = Number(body.cardCount);
    const profitTarget = Number(body.profitTarget);
    const skipFirstJoin = Boolean(body.skipFirstJoin);
    const serialBuyEnabled = Boolean(body.serialBuyEnabled);
    const anchorRoomId = body.anchorRoomId
      ? String(body.anchorRoomId).trim()
      : null;
    const idempotencyKey = body.idempotencyKey
      ? String(body.idempotencyKey).trim()
      : null;

    if (!templateId) {
      return NextResponse.json(
        { ok: false, error: "missing_template", message: "templateId is required." },
        { status: 400 }
      );
    }

    if (!Number.isFinite(fundAmount) || fundAmount <= 0) {
      return NextResponse.json(
        { ok: false, error: "invalid_fund", message: "fundAmount must be positive." },
        { status: 400 }
      );
    }

    if (!Number.isInteger(cardCount) || cardCount < 1) {
      return NextResponse.json(
        { ok: false, error: "invalid_card_count", message: "cardCount must be >= 1." },
        { status: 400 }
      );
    }

    if (!Number.isFinite(profitTarget) || profitTarget <= 0) {
      return NextResponse.json(
        {
          ok: false,
          error: "invalid_profit_target",
          message: "سقف برد باید بیشتر از صفر باشد.",
        },
        { status: 400 }
      );
    }

    const { data, error } = await supabase.rpc("fn_player_auto_buy_start", {
      p_user_id: user.id,
      p_template_id: templateId,
      p_fund: fundAmount,
      p_card_count: cardCount,
      p_profit_target: profitTarget,
      p_idempotency_key: idempotencyKey,
      p_skip_first_join: skipFirstJoin,
      p_serial_buy: serialBuyEnabled,
      p_anchor_room_id: anchorRoomId,
    });

    if (error) {
      console.error("[AutoBuy] start error:", error);
      const mapped = mapAutoBuyError(error.message);
      return NextResponse.json(
        { ok: false, error: "start_failed", message: mapped.message },
        { status: mapped.status }
      );
    }

    const result = parseAutoBuyStartResult((data ?? {}) as Record<string, unknown>);
    console.info("[AutoBuy] started", {
      userId: user.id,
      templateId,
      sessionId: result.sessionId,
      fundRemaining: result.fundRemaining,
      skipFirstJoin,
      serialBuyEnabled,
      anchorRoomId,
    });

    return NextResponse.json({ ok: true, data: result });
  } catch (err) {
    if (err instanceof Error && err.name === "FeatureDisabledError") {
      return featureDisabledResponse(AUTO_BUY_FEATURE);
    }
    console.error("[AutoBuy] POST error:", err);
    return NextResponse.json(
      { ok: false, error: "unexpected_error", message: "Unexpected error." },
      { status: 500 }
    );
  }
}
