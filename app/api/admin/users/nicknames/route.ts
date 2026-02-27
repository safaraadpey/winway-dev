import { NextRequest, NextResponse } from "next/server";
import { getAdminContextOrThrow } from "@/lib/supabaseServer";

export async function POST(request: NextRequest) {
  try {
    const { session, supabase } = await getAdminContextOrThrow(request);

    if (!["admin", "super", "agent"].includes(session.role)) {
      return NextResponse.json(
        { ok: false, error: "forbidden", message: "insufficient permissions" },
        { status: 403 }
      );
    }

    const body = await request.json().catch(() => ({}));
    const userIds = Array.isArray(body?.user_ids)
      ? body.user_ids
          .map((v: unknown) => String(v || "").trim())
          .filter((v: string) => v.length > 0)
      : [];

    if (userIds.length === 0) {
      return NextResponse.json({ ok: true, data: [] }, { status: 200 });
    }

    const cappedIds = userIds.slice(0, 2000);

    const { data, error } = await supabase
      .from("user_profiles")
      .select("user_id,nickname")
      .in("user_id", cappedIds);

    if (error) {
      return NextResponse.json(
        { ok: false, error: "database_error", message: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({ ok: true, data: data || [] }, { status: 200 });
  } catch (err: any) {
    if (err?.message === "UNAUTHORIZED") {
      return NextResponse.json(
        { ok: false, error: "unauthorized", message: "missing or invalid session" },
        { status: 401 }
      );
    }
    if (err?.message === "FORBIDDEN") {
      return NextResponse.json(
        { ok: false, error: "forbidden", message: "insufficient permissions" },
        { status: 403 }
      );
    }
    return NextResponse.json(
      { ok: false, error: "unexpected_error", message: err?.message || "unexpected error" },
      { status: 500 }
    );
  }
}
