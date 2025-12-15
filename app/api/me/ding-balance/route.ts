import { NextResponse } from "next/server";
import { createServiceClient, getUserFromRequest } from "@/lib/supabaseServer";

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
      .from("ding_balances")
      .select("balance, updated_at")
      .eq("user_id", user.id)
      .maybeSingle();

    if (error) {
      console.error("GET /api/me/ding-balance db error:", error);
      return NextResponse.json(
        { error: "internal_error", message: "Failed to load ding balance." },
        { status: 500 }
      );
    }

    const balance = Number((data as any)?.balance ?? 0) || 0;
    const updated_at = (data as any)?.updated_at ?? null;

    return NextResponse.json({ balance, updated_at });
  } catch (err: any) {
    console.error("GET /api/me/ding-balance error:", err);
    return NextResponse.json(
      { error: "internal_error", message: err?.message || "Failed to load ding balance." },
      { status: 500 }
    );
  }
}


