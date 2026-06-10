import { NextRequest, NextResponse } from "next/server";
import { getDevPanelContextOrThrow, logAdminAction } from "@/lib/supabaseServer";

function parseOptionalPauseSeconds(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const num = Number(value);
  if (!Number.isInteger(num) || num < 5 || num > 86400) return null;
  return num;
}

function mapSettingsRow(row: any) {
  return {
    systemEnabled: Boolean(row.system_enabled),
    schedulerEnabled: Boolean(row.scheduler_enabled),
    schedulerTickIntervalSeconds: Number(row.scheduler_tick_interval_seconds ?? 60),
    processorTickIntervalSeconds: Number(row.processor_tick_interval_seconds ?? 60),
    schedulerPauseAfterSeconds:
      row.scheduler_pause_after_seconds === null ||
      row.scheduler_pause_after_seconds === undefined
        ? null
        : Number(row.scheduler_pause_after_seconds),
    schedulerPauseDurationSeconds:
      row.scheduler_pause_duration_seconds === null ||
      row.scheduler_pause_duration_seconds === undefined
        ? null
        : Number(row.scheduler_pause_duration_seconds),
    timezone: row.timezone || "Asia/Tehran",
    activeJoinPresetId: row.active_join_preset_id ? String(row.active_join_preset_id) : null,
    updatedAt: row.updated_at ?? null,
  };
}

function mapJoinPresetRow(
  row: any,
  limits: Array<{
    template_id: string;
    min_active_rooms: number | null;
    max_active_rooms: number | null;
    join_interval_seconds: number | null;
    max_joins_per_tick: number | null;
    min_normal_players_per_room: number | null;
    max_dev_players_per_room: number | null;
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
    })),
    updatedAt: row.updated_at ?? null,
  };
}

async function ensureSettingsRow(supabase: any) {
  const { error } = await supabase.from("dev_player_settings").upsert(
    { id: true },
    { onConflict: "id" }
  );

  if (error) throw error;
}

async function loadSettingsBundle(supabase: any) {
  await ensureSettingsRow(supabase);

  const { data: settingsRow, error: settingsError } = await supabase
    .from("dev_player_settings")
    .select("*")
    .eq("id", true)
    .single();

  if (settingsError) throw settingsError;

  const { data: activeConfigs, error: activeError } = await supabase
    .from("dev_player_configs")
    .select("user_id, play_windows, min_room_price, max_room_price, max_ticket_count, updated_at")
    .eq("is_enabled", true)
    .order("updated_at", { ascending: false });

  if (activeError) throw activeError;

  const userIds = (activeConfigs || []).map((c: any) => c.user_id);
  const usersMap = new Map<string, { username: string | null }>();
  const profilesMap = new Map<string, string>();

  if (userIds.length > 0) {
    const [{ data: users }, { data: profiles }] = await Promise.all([
      supabase.from("users").select("id, username").in("id", userIds),
      supabase.from("user_profiles").select("user_id, nickname").in("user_id", userIds),
    ]);

    for (const user of users || []) {
      usersMap.set(user.id, { username: user.username });
    }
    for (const profile of profiles || []) {
      if (profile.nickname) {
        profilesMap.set(profile.user_id, profile.nickname);
      }
    }
  }

  const { data: templateRows, error: templatesError } = await supabase
    .from("room_templates")
    .select("id, name, price, currency, status, room_type, vip")
    .in("status", ["active", "draining"])
    .order("name", { ascending: true });

  if (templatesError) throw templatesError;

  const { data: presetRows, error: presetsError } = await supabase
    .from("dev_player_join_presets")
    .select("*")
    .order("name", { ascending: true });

  if (presetsError) throw presetsError;

  const presetIds = (presetRows || []).map((row: any) => row.id);
  const { data: presetLimitRows, error: presetLimitsError } =
    presetIds.length > 0
      ? await supabase
          .from("dev_player_join_preset_template_limits")
          .select(
            "preset_id, template_id, min_active_rooms, max_active_rooms, join_interval_seconds, max_joins_per_tick, min_normal_players_per_room, max_dev_players_per_room"
          )
          .in("preset_id", presetIds)
      : { data: [], error: null };

  if (presetLimitsError) throw presetLimitsError;

  const presetLimitsByPresetId = new Map<string, any[]>();
  for (const row of presetLimitRows || []) {
    const list = presetLimitsByPresetId.get(row.preset_id) ?? [];
    list.push(row);
    presetLimitsByPresetId.set(row.preset_id, list);
  }

  const joinPresets = (presetRows || []).map((row: any) =>
    mapJoinPresetRow(row, presetLimitsByPresetId.get(row.id) ?? [])
  );

  const activePresetId = settingsRow.active_join_preset_id
    ? String(settingsRow.active_join_preset_id)
    : null;
  const activePreset =
    joinPresets.find((preset: { id: string }) => preset.id === activePresetId) ??
    joinPresets[0] ??
    null;

  const limitsMap = new Map<
    string,
    {
      min_active_rooms: number | null;
      max_active_rooms: number | null;
      join_interval_seconds: number | null;
      max_joins_per_tick: number | null;
      min_normal_players_per_room: number | null;
      max_dev_players_per_room: number | null;
    }
  >();
  for (const limit of activePreset?.templateLimits ?? []) {
    limitsMap.set(limit.templateId, {
      min_active_rooms: limit.minActiveRooms,
      max_active_rooms: limit.maxActiveRooms,
      join_interval_seconds: limit.joinIntervalSeconds,
      max_joins_per_tick: limit.maxJoinsPerTick,
      min_normal_players_per_room: limit.minNormalPlayersPerRoom,
      max_dev_players_per_room: limit.maxDevPlayersPerRoom,
    });
  }

  const templates = (templateRows || []).map((row: any) => {
    const limit = limitsMap.get(row.id);
    return {
      id: row.id,
      name: row.name || "بدون نام",
      price: Number(row.price ?? 0),
      currency: row.currency || "IRR",
      status: row.status || "active",
      roomType: row.room_type || "normal",
      vip: Boolean(row.vip),
      minActiveRooms: limit?.min_active_rooms ?? null,
      maxActiveRooms: limit?.max_active_rooms ?? null,
      joinIntervalSeconds: limit?.join_interval_seconds ?? null,
      maxJoinsPerTick: limit?.max_joins_per_tick ?? null,
      minNormalPlayersPerRoom: limit?.min_normal_players_per_room ?? null,
      maxDevPlayersPerRoom: limit?.max_dev_players_per_room ?? null,
    };
  });

  const activePlayers = (activeConfigs || []).map((config: any) => {
    const user = usersMap.get(config.user_id);
    const nickname = profilesMap.get(config.user_id) ?? null;
    const username = user?.username || "نامشخص";
    return {
      userId: config.user_id,
      username,
      nickname,
      displayName: nickname?.trim() || username,
      playWindows: Array.isArray(config.play_windows) ? config.play_windows : [],
      minRoomPrice:
        config.min_room_price === null || config.min_room_price === undefined
          ? null
          : Number(config.min_room_price),
      maxRoomPrice:
        config.max_room_price === null || config.max_room_price === undefined
          ? null
          : Number(config.max_room_price),
      maxTicketCount: Number(config.max_ticket_count ?? 1),
      updatedAt: config.updated_at ?? null,
    };
  });

  return {
    settings: mapSettingsRow(settingsRow),
    activePlayers,
    activePlayerCount: activePlayers.length,
    templates,
    joinPresets,
  };
}

export async function GET(request: NextRequest) {
  try {
    const { supabase } = await getDevPanelContextOrThrow(request);
    const data = await loadSettingsBundle(supabase);
    return NextResponse.json({ ok: true, data });
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

    console.error("GET /api/dev-panel/settings error:", err);
    return NextResponse.json(
      { ok: false, error: "unexpected_error", message: err?.message || "unexpected error" },
      { status: 500 }
    );
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const { session, supabase } = await getDevPanelContextOrThrow(request);
    const body = await request.json();

    await ensureSettingsRow(supabase);

    const schedulerTickIntervalSeconds = Number(body?.scheduler_tick_interval_seconds);
    const processorTickIntervalSeconds = Number(body?.processor_tick_interval_seconds);
    const schedulerPauseAfterSeconds = parseOptionalPauseSeconds(
      body?.scheduler_pause_after_seconds
    );
    const schedulerPauseDurationSeconds = parseOptionalPauseSeconds(
      body?.scheduler_pause_duration_seconds
    );
    const timezone = String(body?.timezone || "Asia/Tehran").trim() || "Asia/Tehran";
    const activeJoinPresetId =
      body?.active_join_preset_id === null || body?.active_join_preset_id === undefined
        ? undefined
        : String(body.active_join_preset_id).trim() || null;

    if (
      !Number.isInteger(schedulerTickIntervalSeconds) ||
      schedulerTickIntervalSeconds < 5 ||
      schedulerTickIntervalSeconds > 3600
    ) {
      return NextResponse.json(
        {
          ok: false,
          error: "validation_error",
          message: "scheduler_tick_interval_seconds must be 5..3600",
        },
        { status: 400 }
      );
    }

    if (
      !Number.isInteger(processorTickIntervalSeconds) ||
      processorTickIntervalSeconds < 5 ||
      processorTickIntervalSeconds > 3600
    ) {
      return NextResponse.json(
        {
          ok: false,
          error: "validation_error",
          message: "processor_tick_interval_seconds must be 5..3600",
        },
        { status: 400 }
      );
    }

    const pauseAfterProvided =
      body?.scheduler_pause_after_seconds !== undefined &&
      body?.scheduler_pause_after_seconds !== null &&
      body?.scheduler_pause_after_seconds !== "";
    const pauseDurationProvided =
      body?.scheduler_pause_duration_seconds !== undefined &&
      body?.scheduler_pause_duration_seconds !== null &&
      body?.scheduler_pause_duration_seconds !== "";

    if (pauseAfterProvided !== pauseDurationProvided) {
      return NextResponse.json(
        {
          ok: false,
          error: "validation_error",
          message: "scheduler pause after/duration must both be set or both empty",
        },
        { status: 400 }
      );
    }

    if (pauseAfterProvided) {
      if (schedulerPauseAfterSeconds === null || schedulerPauseDurationSeconds === null) {
        return NextResponse.json(
          {
            ok: false,
            error: "validation_error",
            message: "scheduler pause after/duration must be 5..86400 seconds",
          },
          { status: 400 }
        );
      }
    }

    const updatePayload: Record<string, unknown> = {
      system_enabled: Boolean(body?.system_enabled),
      scheduler_enabled: Boolean(body?.scheduler_enabled),
      scheduler_tick_interval_seconds: schedulerTickIntervalSeconds,
      processor_tick_interval_seconds: processorTickIntervalSeconds,
      scheduler_pause_after_seconds: pauseAfterProvided ? schedulerPauseAfterSeconds : null,
      scheduler_pause_duration_seconds: pauseDurationProvided
        ? schedulerPauseDurationSeconds
        : null,
      timezone,
      updated_by: session.user.id,
    };

    if (activeJoinPresetId !== undefined) {
      updatePayload.active_join_preset_id = activeJoinPresetId;
    }

    const { data: saved, error: saveError } = await supabase
      .from("dev_player_settings")
      .update(updatePayload)
      .eq("id", true)
      .select("*")
      .single();

    if (saveError) {
      console.error("dev-panel settings save error:", saveError);
      return NextResponse.json(
        { ok: false, error: "database_error", message: saveError.message },
        { status: 500 }
      );
    }

    await logAdminAction(
      supabase,
      session.user.id,
      "dev_panel_update_settings",
      "dev_player_settings",
      "true",
      {
        system_enabled: updatePayload.system_enabled,
        scheduler_enabled: updatePayload.scheduler_enabled,
        active_join_preset_id: activeJoinPresetId ?? null,
      },
      request
    );

    const bundle = await loadSettingsBundle(supabase);

    return NextResponse.json({
      ok: true,
      data: {
        ...bundle,
        settings: mapSettingsRow(saved),
      },
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

    console.error("PATCH /api/dev-panel/settings error:", err);
    return NextResponse.json(
      { ok: false, error: "unexpected_error", message: err?.message || "unexpected error" },
      { status: 500 }
    );
  }
}
