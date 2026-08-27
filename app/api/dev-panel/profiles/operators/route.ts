import { NextRequest, NextResponse } from "next/server";
import { getDevPanelContextOrThrow } from "@/lib/supabaseServer";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const LOG_PREFIX = "[DevPlayer]";

const ROLE_LABELS: Record<"super" | "agent", string> = {
  super: "سوپر",
  agent: "ایجنت",
};

export async function GET(request: NextRequest) {
  try {
    const { supabase } = await getDevPanelContextOrThrow(request);

    const { data: operatorRows, error } = await supabase
      .from("users")
      .select("id, username, role")
      .in("role", ["super", "agent"])
      .eq("status", "active")
      .order("username", { ascending: true });

    if (error) throw error;

    const operatorIds = (operatorRows ?? []).map((row: { id: string }) => row.id);
    const profilesMap = new Map<string, string>();

    if (operatorIds.length > 0) {
      const { data: profiles } = await supabase
        .from("user_profiles")
        .select("user_id, nickname")
        .in("user_id", operatorIds);

      for (const profile of profiles ?? []) {
        if (profile.nickname) {
          profilesMap.set(profile.user_id, profile.nickname);
        }
      }
    }

    const operators = (operatorRows ?? []).map((row: any) => {
      const nickname = profilesMap.get(row.id) ?? null;
      const username = row.username || "نامشخص";
      const role = row.role as "super" | "agent";
      const roleLabel = ROLE_LABELS[role];
      const displayName = nickname?.trim() || username;

      return {
        id: row.id,
        username,
        nickname,
        displayName: `${displayName} (${roleLabel})`,
        role,
      };
    });

    console.log(`${LOG_PREFIX} Loaded profile operators`, { count: operators.length });

    return NextResponse.json({ ok: true, data: operators });
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

    console.error(`${LOG_PREFIX} GET /api/dev-panel/profiles/operators error:`, err);
    return NextResponse.json(
      { ok: false, error: "unexpected_error", message: err?.message || "unexpected error" },
      { status: 500 }
    );
  }
}
