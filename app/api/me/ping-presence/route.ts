import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getUserFromRequest } from "@/lib/supabaseServer";

export async function POST(request: Request) {
  try {
    // Require auth
    const user = await getUserFromRequest(request);
    if (!user) {
      return NextResponse.json(
        { error: "unauthorized", message: "Authentication required." },
        { status: 401 }
      );
    }

    // Use anon client WITH the user's JWT so auth.uid() works inside fn_ping_presence()
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!supabaseUrl || !supabaseAnonKey) {
      return NextResponse.json(
        { error: "internal_error", message: "Missing Supabase env." },
        { status: 500 }
      );
    }

    const authHeader =
      request.headers.get("authorization") ?? request.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return NextResponse.json(
        { error: "unauthorized", message: "Missing bearer token." },
        { status: 401 }
      );
    }

    const token = authHeader.replace("Bearer ", "");

    const authedAnon = createClient(supabaseUrl, supabaseAnonKey, {
      global: {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      },
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const { error } = await authedAnon.rpc("fn_ping_presence");
    if (error) {
      console.error("POST /api/me/ping-presence rpc error:", error);
      return NextResponse.json(
        { error: "internal_error", message: "Failed to ping presence." },
        { status: 500 }
      );
    }

    return new NextResponse(null, { status: 204 });
  } catch (err: any) {
    console.error("POST /api/me/ping-presence error:", err);
    return NextResponse.json(
      { error: "internal_error", message: err?.message || "Failed to ping presence." },
      { status: 500 }
    );
  }
}


