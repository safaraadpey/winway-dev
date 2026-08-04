import { NextResponse } from "next/server";
import { createServiceClient, getUserFromRequest } from "@/lib/supabaseServer";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const user = await getUserFromRequest(request);
    if (!user) {
      return NextResponse.json(
        { error: "unauthorized", message: "Authentication required." },
        { status: 401 }
      );
    }

    const supabase = createServiceClient();
    const { data, error } = await supabase
      .from("app_runtime_flags")
      .select("global_registration_locked, global_registration_lock_reason")
      .eq("id", true)
      .maybeSingle();

    if (error) {
      // Migration may not be present in some environments yet.
      if ((error as any).code === "42P01") {
        return NextResponse.json({
          global_registration_locked: false,
          global_registration_lock_reason: null,
        });
      }

      console.error("GET /api/player/runtime/global-registration-lock error:", error);
      return NextResponse.json(
        { error: "internal_error", message: "Failed to load registration lock state." },
        { status: 500 }
      );
    }

    return NextResponse.json({
      global_registration_locked: Boolean((data as any)?.global_registration_locked),
      global_registration_lock_reason:
        (data as any)?.global_registration_lock_reason ?? null,
    });
  } catch (err: any) {
    console.error("GET /api/player/runtime/global-registration-lock unexpected error:", err);
    return NextResponse.json(
      { error: "internal_error", message: "Failed to load registration lock state." },
      { status: 500 }
    );
  }
}

