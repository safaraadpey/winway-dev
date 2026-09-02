import { NextRequest, NextResponse } from "next/server";
import { getDevPanelContextOrThrow, logAdminAction } from "@/lib/supabaseServer";
import {
  MAX_TEMPLATE_JOIN_DELAY_MAX_SECONDS,
  MAX_TEMPLATE_MAX_DEV_PLAYERS_PER_ROOM,
  MIN_TEMPLATE_JOIN_DELAY_MAX_SECONDS,
  MIN_TEMPLATE_MAX_DEV_PLAYERS_PER_ROOM,
} from "@/src/types/dev-player-settings";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const LOG_PREFIX = "[DevPlayer]";

type TemplateJoinSettingPayload = {
  template_id: string;
  join_delay_max_seconds: number;
  max_dev_players_per_room: number | null;
};

function parseOptionalMaxDevPlayersPerRoom(value: unknown): number | null | undefined {
  if (value === null || value === undefined || value === "") return null;
  const num = Number(value);
  if (
    !Number.isInteger(num) ||
    num < MIN_TEMPLATE_MAX_DEV_PLAYERS_PER_ROOM ||
    num > MAX_TEMPLATE_MAX_DEV_PLAYERS_PER_ROOM
  ) {
    return undefined;
  }
  return num;
}

function normalizePayload(raw: unknown): TemplateJoinSettingPayload[] | null {
  if (!Array.isArray(raw)) return null;

  const settings: TemplateJoinSettingPayload[] = [];
  const seen = new Set<string>();

  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const templateId = String((item as TemplateJoinSettingPayload).template_id ?? "").trim();
    if (!templateId || seen.has(templateId)) continue;

    const joinDelayMaxSeconds = Number((item as TemplateJoinSettingPayload).join_delay_max_seconds);
    if (
      !Number.isInteger(joinDelayMaxSeconds) ||
      joinDelayMaxSeconds < MIN_TEMPLATE_JOIN_DELAY_MAX_SECONDS ||
      joinDelayMaxSeconds > MAX_TEMPLATE_JOIN_DELAY_MAX_SECONDS
    ) {
      return null;
    }

    const maxDevPlayersPerRoom = parseOptionalMaxDevPlayersPerRoom(
      (item as TemplateJoinSettingPayload).max_dev_players_per_room
    );
    if (maxDevPlayersPerRoom === undefined) {
      return null;
    }

    seen.add(templateId);
    settings.push({
      template_id: templateId,
      join_delay_max_seconds: joinDelayMaxSeconds,
      max_dev_players_per_room: maxDevPlayersPerRoom,
    });
  }

  return settings;
}

function mapJoinSettingRow(row: {
  template_id: string;
  join_delay_max_seconds: number | null;
  max_dev_players_per_room?: number | null;
  updated_at: string | null;
}) {
  const maxDev =
    row.max_dev_players_per_room === null || row.max_dev_players_per_room === undefined
      ? null
      : Number(row.max_dev_players_per_room);
  return {
    templateId: String(row.template_id),
    joinDelayMaxSeconds: Number(row.join_delay_max_seconds ?? 0),
    maxDevPlayersPerRoom: Number.isInteger(maxDev) ? maxDev : null,
    updatedAt: row.updated_at ?? null,
  };
}

export async function GET(request: NextRequest) {
  try {
    const { supabase } = await getDevPanelContextOrThrow(request);

    const { data, error } = await supabase
      .from("dev_player_template_join_settings")
      .select("template_id, join_delay_max_seconds, max_dev_players_per_room, updated_at");

    if (error) throw error;

    return NextResponse.json({
      ok: true,
      data: (data ?? []).map((row) => mapJoinSettingRow(row)),
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

    console.error(`${LOG_PREFIX} GET /api/dev-panel/template-join-settings error:`, err);
    return NextResponse.json(
      { ok: false, error: "unexpected_error", message: err?.message || "unexpected error" },
      { status: 500 }
    );
  }
}

export async function PUT(request: NextRequest) {
  try {
    const { session, supabase } = await getDevPanelContextOrThrow(request);
    const body = await request.json();
    const settings = normalizePayload(body?.settings);

    if (settings === null) {
      return NextResponse.json(
        {
          ok: false,
          error: "validation_error",
          message: `join_delay_max_seconds must be ${MIN_TEMPLATE_JOIN_DELAY_MAX_SECONDS}..${MAX_TEMPLATE_JOIN_DELAY_MAX_SECONDS}; max_dev_players_per_room must be empty or ${MIN_TEMPLATE_MAX_DEV_PLAYERS_PER_ROOM}..${MAX_TEMPLATE_MAX_DEV_PLAYERS_PER_ROOM}`,
        },
        { status: 400 }
      );
    }

    if (settings.length === 0) {
      return NextResponse.json({
        ok: true,
        data: [],
      });
    }

    const templateIds = settings.map((item) => item.template_id);
    const { data: templates, error: templatesError } = await supabase
      .from("room_templates")
      .select("id")
      .in("id", templateIds);

    if (templatesError) throw templatesError;

    const validTemplateIds = new Set((templates ?? []).map((row) => String(row.id)));
    const invalidTemplateId = templateIds.find((id) => !validTemplateIds.has(id));
    if (invalidTemplateId) {
      return NextResponse.json(
        { ok: false, error: "validation_error", message: "invalid template_id" },
        { status: 400 }
      );
    }

    const nowIso = new Date().toISOString();
    const { error: upsertError } = await supabase.from("dev_player_template_join_settings").upsert(
      settings.map((item) => ({
        template_id: item.template_id,
        join_delay_max_seconds: item.join_delay_max_seconds,
        max_dev_players_per_room: item.max_dev_players_per_room,
        updated_at: nowIso,
        updated_by: session.user.id,
      })),
      { onConflict: "template_id" }
    );

    if (upsertError) {
      console.error(`${LOG_PREFIX} template join settings save error:`, upsertError);
      return NextResponse.json(
        { ok: false, error: "database_error", message: upsertError.message },
        { status: 500 }
      );
    }

    await logAdminAction(
      supabase,
      session.user.id,
      "dev_panel_save_template_join_settings",
      "dev_player_template_join_settings",
      "bulk",
      { count: settings.length },
      request
    );

    console.log(`${LOG_PREFIX} Template join settings saved`, {
      count: settings.length,
      caps: settings.map((item) => ({
        templateId: item.template_id,
        maxDevPlayersPerRoom: item.max_dev_players_per_room,
      })),
    });

    const { data: savedRows, error: reloadError } = await supabase
      .from("dev_player_template_join_settings")
      .select("template_id, join_delay_max_seconds, max_dev_players_per_room, updated_at")
      .in("template_id", templateIds);

    if (reloadError) throw reloadError;

    return NextResponse.json({
      ok: true,
      data: (savedRows ?? []).map((row) => mapJoinSettingRow(row)),
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

    console.error(`${LOG_PREFIX} PUT /api/dev-panel/template-join-settings error:`, err);
    return NextResponse.json(
      { ok: false, error: "unexpected_error", message: err?.message || "unexpected error" },
      { status: 500 }
    );
  }
}
