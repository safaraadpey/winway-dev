import { NextRequest, NextResponse } from "next/server";
import { getDevPanelContextOrThrow, logAdminAction } from "@/lib/supabaseServer";

const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

function normalizePlayWindows(raw: unknown): Array<{ start: string; end: string }> {
  if (!Array.isArray(raw)) return [];
  const windows: Array<{ start: string; end: string }> = [];

  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const start = String((item as any).start || "").trim();
    const end = String((item as any).end || "").trim();
    if (!TIME_RE.test(start) || !TIME_RE.test(end)) continue;
    if (start >= end) continue;
    windows.push({ start, end });
  }

  return windows;
}

function parseOptionalInt(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const num = Number(value);
  if (!Number.isInteger(num) || num < 0) return null;
  return num;
}

function normalizeTemplateLimits(raw: unknown): Array<{
  template_id: string;
  min_active_rooms: number | null;
  max_active_rooms: number | null;
  join_interval_seconds: number;
  max_joins_per_tick: number;
  min_normal_players_per_room: number | null;
  max_dev_players_per_room: number | null;
  quick_fill_enabled: boolean;
}> {
  if (!Array.isArray(raw)) return [];

  const limits: Array<{
    template_id: string;
    min_active_rooms: number | null;
    max_active_rooms: number | null;
    join_interval_seconds: number;
    max_joins_per_tick: number;
    min_normal_players_per_room: number | null;
    max_dev_players_per_room: number | null;
    quick_fill_enabled: boolean;
  }> = [];

  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const templateId = String((item as any).template_id || "").trim();
    if (!templateId) continue;

    const minActiveRooms = parseOptionalInt((item as any).min_active_rooms);
    const maxActiveRooms = parseOptionalInt((item as any).max_active_rooms);
    const minNormalPlayersPerRoom = parseOptionalInt((item as any).min_normal_players_per_room);
    const maxDevPlayersPerRoom = parseOptionalInt((item as any).max_dev_players_per_room);
    const joinIntervalSeconds = Number((item as any).join_interval_seconds);
    const maxJoinsPerTick = Number((item as any).max_joins_per_tick);

    if (
      minActiveRooms !== null &&
      maxActiveRooms !== null &&
      minActiveRooms > maxActiveRooms
    ) {
      throw new Error("TEMPLATE_ROOM_LIMIT_RANGE_INVALID");
    }

    if (
      !Number.isInteger(joinIntervalSeconds) ||
      joinIntervalSeconds < 5 ||
      joinIntervalSeconds > 7200
    ) {
      throw new Error("TEMPLATE_JOIN_INTERVAL_INVALID");
    }

    if (
      !Number.isInteger(maxJoinsPerTick) ||
      maxJoinsPerTick < 1 ||
      maxJoinsPerTick > 100
    ) {
      throw new Error("TEMPLATE_MAX_JOINS_INVALID");
    }

    limits.push({
      template_id: templateId,
      min_active_rooms: minActiveRooms,
      max_active_rooms: maxActiveRooms,
      join_interval_seconds: joinIntervalSeconds,
      max_joins_per_tick: maxJoinsPerTick,
      min_normal_players_per_room: minNormalPlayersPerRoom,
      max_dev_players_per_room: maxDevPlayersPerRoom,
      quick_fill_enabled: Boolean((item as any).quick_fill_enabled),
    });
  }

  return limits;
}

async function savePresetTemplateLimits(
  supabase: any,
  presetId: string,
  limits: Array<{
    template_id: string;
    min_active_rooms: number | null;
    max_active_rooms: number | null;
    join_interval_seconds: number;
    max_joins_per_tick: number;
    min_normal_players_per_room: number | null;
    max_dev_players_per_room: number | null;
    quick_fill_enabled: boolean;
  }>
) {
  const { error: deleteError } = await supabase
    .from("dev_player_join_preset_template_limits")
    .delete()
    .eq("preset_id", presetId);

  if (deleteError) throw deleteError;

  if (limits.length === 0) return;

  const { error: insertError } = await supabase
    .from("dev_player_join_preset_template_limits")
    .insert(
      limits.map((limit) => ({
        preset_id: presetId,
        template_id: limit.template_id,
        min_active_rooms: limit.min_active_rooms,
        max_active_rooms: limit.max_active_rooms,
        join_interval_seconds: limit.join_interval_seconds,
        max_joins_per_tick: limit.max_joins_per_tick,
        min_normal_players_per_room: limit.min_normal_players_per_room,
        max_dev_players_per_room: limit.max_dev_players_per_room,
        quick_fill_enabled: limit.quick_fill_enabled,
      }))
    );

  if (insertError) throw insertError;
}

function mapPresetRow(
  row: any,
  limits: Array<{
    template_id: string;
    min_active_rooms: number | null;
    max_active_rooms: number | null;
    join_interval_seconds: number | null;
    max_joins_per_tick: number | null;
    min_normal_players_per_room: number | null;
    max_dev_players_per_room: number | null;
    quick_fill_enabled: boolean;
  }>
) {
  return {
    id: row.id,
    name: row.name,
    playWindows: Array.isArray(row.play_windows) ? row.play_windows : [],
    templateRoomLimitEnabledIds: Array.isArray(row.template_room_limit_enabled_ids)
      ? row.template_room_limit_enabled_ids.map(String)
      : [],
    minWalletBalance: Number(row.min_wallet_balance ?? 0),
    excludeVip: Boolean(row.exclude_vip),
    excludeTournament: Boolean(row.exclude_tournament),
    autoApproveSchedules: Boolean(row.auto_approve_schedules),
    templateLimits: limits.map((limit) => ({
      templateId: limit.template_id,
      minActiveRooms:
        limit.min_active_rooms === null || limit.min_active_rooms === undefined
          ? null
          : Number(limit.min_active_rooms),
      maxActiveRooms:
        limit.max_active_rooms === null || limit.max_active_rooms === undefined
          ? null
          : Number(limit.max_active_rooms),
      joinIntervalSeconds:
        limit.join_interval_seconds === null || limit.join_interval_seconds === undefined
          ? null
          : Number(limit.join_interval_seconds),
      maxJoinsPerTick:
        limit.max_joins_per_tick === null || limit.max_joins_per_tick === undefined
          ? null
          : Number(limit.max_joins_per_tick),
      minNormalPlayersPerRoom:
        limit.min_normal_players_per_room === null ||
        limit.min_normal_players_per_room === undefined
          ? null
          : Number(limit.min_normal_players_per_room),
      maxDevPlayersPerRoom:
        limit.max_dev_players_per_room === null ||
        limit.max_dev_players_per_room === undefined
          ? null
          : Number(limit.max_dev_players_per_room),
      quickFillEnabled: Boolean(limit.quick_fill_enabled),
    })),
    updatedAt: row.updated_at ?? null,
  };
}

export async function POST(request: NextRequest) {
  try {
    const { session, supabase } = await getDevPanelContextOrThrow(request);
    const body = await request.json();

    const name = String(body?.name || "").trim();
    if (!name) {
      return NextResponse.json(
        { ok: false, error: "validation_error", message: "preset name is required" },
        { status: 400 }
      );
    }

    const minWalletBalance = Number(body?.min_wallet_balance);
    if (!Number.isFinite(minWalletBalance) || minWalletBalance < 0) {
      return NextResponse.json(
        { ok: false, error: "validation_error", message: "min_wallet_balance must be >= 0" },
        { status: 400 }
      );
    }

    const playWindows = normalizePlayWindows(body?.play_windows);
    if (playWindows.length === 0) {
      return NextResponse.json(
        {
          ok: false,
          error: "validation_error",
          message: "at least one valid play window is required",
        },
        { status: 400 }
      );
    }

    const templateRoomLimitEnabledIds = Array.isArray(body?.template_room_limit_enabled_ids)
      ? body.template_room_limit_enabled_ids
          .map((id: unknown) => String(id).trim())
          .filter(Boolean)
      : [];

    let templateLimits: ReturnType<typeof normalizeTemplateLimits> = [];
    try {
      templateLimits = normalizeTemplateLimits(body?.template_room_limits);
    } catch (error: any) {
      if (error?.message === "TEMPLATE_ROOM_LIMIT_RANGE_INVALID") {
        return NextResponse.json(
          {
            ok: false,
            error: "validation_error",
            message: "template min_active_rooms cannot exceed max_active_rooms",
          },
          { status: 400 }
        );
      }
      if (error?.message === "TEMPLATE_JOIN_INTERVAL_INVALID") {
        return NextResponse.json(
          {
            ok: false,
            error: "validation_error",
            message: "template join_interval_seconds must be 5..7200",
          },
          { status: 400 }
        );
      }
      if (error?.message === "TEMPLATE_MAX_JOINS_INVALID") {
        return NextResponse.json(
          {
            ok: false,
            error: "validation_error",
            message: "template joins per work cycle must be 1..100",
          },
          { status: 400 }
        );
      }
      throw error;
    }

    const presetPayload = {
      name,
      play_windows: playWindows,
      template_room_limit_enabled_ids: templateRoomLimitEnabledIds,
      min_wallet_balance: minWalletBalance,
      exclude_vip: Boolean(body?.exclude_vip),
      exclude_tournament: Boolean(body?.exclude_tournament),
      auto_approve_schedules: Boolean(body?.auto_approve_schedules),
      updated_by: session.user.id,
    };

    const presetId = String(body?.id || "").trim();
    let savedPreset: any;

    if (presetId) {
      const { data, error } = await supabase
        .from("dev_player_join_presets")
        .update(presetPayload)
        .eq("id", presetId)
        .select("*")
        .single();

      if (error) {
        console.error("join preset update error:", error);
        return NextResponse.json(
          { ok: false, error: "database_error", message: error.message },
          { status: 500 }
        );
      }
      savedPreset = data;
    } else {
      const { data, error } = await supabase
        .from("dev_player_join_presets")
        .insert(presetPayload)
        .select("*")
        .single();

      if (error) {
        console.error("join preset insert error:", error);
        return NextResponse.json(
          { ok: false, error: "database_error", message: error.message },
          { status: 500 }
        );
      }
      savedPreset = data;
    }

    await savePresetTemplateLimits(supabase, savedPreset.id, templateLimits);

    const setActive = body?.set_active !== false;
    if (setActive) {
      const { error: activeError } = await supabase
        .from("dev_player_settings")
        .update({
          active_join_preset_id: savedPreset.id,
          updated_by: session.user.id,
        })
        .eq("id", true);

      if (activeError) throw activeError;
    }

    const { data: limitRows, error: limitsError } = await supabase
      .from("dev_player_join_preset_template_limits")
      .select(
        "template_id, min_active_rooms, max_active_rooms, join_interval_seconds, max_joins_per_tick, min_normal_players_per_room, max_dev_players_per_room, quick_fill_enabled"
      )
      .eq("preset_id", savedPreset.id);

    if (limitsError) throw limitsError;

    await logAdminAction(
      supabase,
      session.user.id,
      presetId ? "dev_panel_update_join_preset" : "dev_panel_create_join_preset",
      "dev_player_join_presets",
      savedPreset.id,
      {
        name,
        template_room_limits_count: templateLimits.length,
        set_active: setActive,
      },
      request
    );

    return NextResponse.json({
      ok: true,
      data: mapPresetRow(savedPreset, limitRows || []),
    });
  } catch (err: any) {
    if (err.message === "UNAUTHORIZED") {
      return NextResponse.json(
        { ok: false, error: "unauthorized", message: "missing or invalid session" },
        { status: 401 }
      );
    }
    if (err.message === "FORBIDDEN" || err.message === "FORBIDDEN_DEV_PANEL") {
      return NextResponse.json(
        { ok: false, error: "forbidden", message: "dev panel access required" },
        { status: 403 }
      );
    }

    console.error("POST /api/dev-panel/join-presets error:", err);
    return NextResponse.json(
      { ok: false, error: "unexpected_error", message: err?.message || "unexpected error" },
      { status: 500 }
    );
  }
}
