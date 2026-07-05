import { NextRequest, NextResponse } from "next/server";
import { getAdminContextOrThrow, logAdminAction } from "@/lib/supabaseServer";

type RuntimeLockRow = {
  global_registration_locked: boolean | null;
  global_registration_locked_at: string | null;
  global_registration_locked_by: string | null;
  global_registration_lock_reason: string | null;
  updated_at: string | null;
};

async function ensureRuntimeFlagsRow(supabase: any) {
  const { error } = await supabase.from("app_runtime_flags").upsert(
    {
      id: true,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "id" }
  );

  if (error && (error as any).code !== "42P01") {
    throw error;
  }
}

async function readLockState(supabase: any): Promise<RuntimeLockRow> {
  const { data, error } = await supabase
    .from("app_runtime_flags")
    .select(
      `
      global_registration_locked,
      global_registration_locked_at,
      global_registration_locked_by,
      global_registration_lock_reason,
      updated_at
    `
    )
    .eq("id", true)
    .maybeSingle();

  if (error) {
    if ((error as any).code === "42P01") {
      return {
        global_registration_locked: false,
        global_registration_locked_at: null,
        global_registration_locked_by: null,
        global_registration_lock_reason: null,
        updated_at: null,
      };
    }
    throw error;
  }

  return {
    global_registration_locked: Boolean((data as any)?.global_registration_locked),
    global_registration_locked_at: (data as any)?.global_registration_locked_at ?? null,
    global_registration_locked_by: (data as any)?.global_registration_locked_by ?? null,
    global_registration_lock_reason: (data as any)?.global_registration_lock_reason ?? null,
    updated_at: (data as any)?.updated_at ?? null,
  };
}

export async function GET(request: NextRequest) {
  try {
    const { session, supabase } = await getAdminContextOrThrow(request);
    if (session.role !== "admin") {
      return NextResponse.json(
        { ok: false, error: "forbidden", message: "only admin can access this endpoint" },
        { status: 403 }
      );
    }
    await ensureRuntimeFlagsRow(supabase);
    const state = await readLockState(supabase);

    return NextResponse.json({
      ok: true,
      data: state,
    });
  } catch (err: any) {
    if (err.message === "UNAUTHORIZED") {
      return NextResponse.json(
        { ok: false, error: "unauthorized", message: "missing or invalid session" },
        { status: 401 }
      );
    }
    if (err.message === "FORBIDDEN") {
      return NextResponse.json(
        { ok: false, error: "forbidden", message: "insufficient permissions" },
        { status: 403 }
      );
    }

    console.error("GET /api/admin/runtime/global-registration-lock error:", err);
    return NextResponse.json(
      { ok: false, error: "unexpected_error", message: err?.message || "unexpected error" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const { session, supabase } = await getAdminContextOrThrow(request);
    if (session.role !== "admin") {
      return NextResponse.json(
        { ok: false, error: "forbidden", message: "only admin can change this lock" },
        { status: 403 }
      );
    }
    const body = await request.json();

    const locked = Boolean(body?.locked);
    const reasonRaw = typeof body?.reason === "string" ? body.reason.trim() : "";
    const reason = reasonRaw.length > 0 ? reasonRaw.slice(0, 500) : null;
    const nowIso = new Date().toISOString();

    await ensureRuntimeFlagsRow(supabase);

    type RuntimeFlagsUpsert = {
      id: boolean;
      global_registration_locked: boolean;
      global_registration_locked_at: string | null;
      global_registration_locked_by: string | null;
      global_registration_lock_reason: string | null;
      updated_at: string;
    };

    const updatePayload: RuntimeFlagsUpsert = locked
      ? {
          id: true,
          global_registration_locked: true,
          global_registration_locked_at: nowIso,
          global_registration_locked_by: session.user.id,
          global_registration_lock_reason: reason,
          updated_at: nowIso,
        }
      : {
          id: true,
          global_registration_locked: false,
          global_registration_locked_at: null,
          global_registration_locked_by: null,
          global_registration_lock_reason: null,
          updated_at: nowIso,
        };

    const { error } = await supabase
      .from("app_runtime_flags")
      .upsert(updatePayload, { onConflict: "id" });

    if (error) {
      throw error;
    }

    await logAdminAction(
      supabase,
      session.user.id,
      locked ? "enable_global_registration_lock" : "disable_global_registration_lock",
      "app_runtime_flags",
      "true",
      {
        locked,
        reason,
      },
      request
    );

    const state = await readLockState(supabase);
    return NextResponse.json({ ok: true, data: state });
  } catch (err: any) {
    if (err.message === "UNAUTHORIZED") {
      return NextResponse.json(
        { ok: false, error: "unauthorized", message: "missing or invalid session" },
        { status: 401 }
      );
    }
    if (err.message === "FORBIDDEN") {
      return NextResponse.json(
        { ok: false, error: "forbidden", message: "insufficient permissions" },
        { status: 403 }
      );
    }

    console.error("POST /api/admin/runtime/global-registration-lock error:", err);
    return NextResponse.json(
      { ok: false, error: "unexpected_error", message: err?.message || "unexpected error" },
      { status: 500 }
    );
  }
}
