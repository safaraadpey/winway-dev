import { NextResponse } from "next/server";
import { getAdminContextOrThrow, logAdminAction } from "@/lib/supabaseServer";
import { pgPool } from "@/lib/pg";
import type { AdminKycListItem } from "@/src/types/kyc";

export const runtime = "nodejs";

type ListRow = {
  id: string;
  user_id: string;
  username: string;
  kyc_code: string;
  declaration_text: string;
  image_mime_type: string;
  image_base64: string;
  created_at: string;
  agent_username: string | null;
  super_username: string | null;
};

/**
 * GET /api/admin/kyc — pending KYC submissions for admin review.
 */
export async function GET(request: Request) {
  try {
    const { session } = await getAdminContextOrThrow(request);
    if (session.role !== "admin") {
      return NextResponse.json(
        { error: "forbidden", message: "Admin access required." },
        { status: 403 }
      );
    }

    if (!pgPool) {
      console.error("[KYC] Admin list: pgPool unavailable");
      return NextResponse.json(
        { error: "db_unavailable", message: "Database unavailable." },
        { status: 503 }
      );
    }

    console.log("[KYC] Admin list started");

    const result = await pgPool.query<ListRow>(
      `SELECT
         k.id,
         k.user_id,
         u.username,
         k.kyc_code,
         k.declaration_text,
         k.image_mime_type,
         encode(k.image_data, 'base64') AS image_base64,
         k.created_at,
         agent_u.username AS agent_username,
         super_u.username AS super_username
       FROM public.kyc_submissions k
       JOIN public.users u ON u.id = k.user_id
       LEFT JOIN public.player_affiliation pa ON pa.user_id = k.user_id
       LEFT JOIN public.users agent_u ON agent_u.id = pa.agent_id
       LEFT JOIN public.users super_u ON super_u.id = pa.super_id
       WHERE k.status = 'pending_review'
       ORDER BY k.created_at ASC
       LIMIT 100`
    );

    const items: AdminKycListItem[] = result.rows.map((row) => ({
      id: row.id,
      userId: row.user_id,
      username: row.username,
      kycCode: row.kyc_code,
      agentUsername: row.agent_username,
      superUsername: row.super_username,
      imageMimeType: row.image_mime_type,
      imageDataUrl: `data:${row.image_mime_type};base64,${row.image_base64}`,
      createdAt: row.created_at,
      declarationText: row.declaration_text,
    }));

    console.log("[KYC] Admin list source=postgresql", { count: items.length });

    return NextResponse.json({ items } satisfies { items: AdminKycListItem[] });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "";
    if (message === "UNAUTHORIZED") {
      return NextResponse.json(
        { error: "unauthorized", message: "Authentication required." },
        { status: 401 }
      );
    }
    if (message === "FORBIDDEN") {
      return NextResponse.json(
        { error: "forbidden", message: "Admin access required." },
        { status: 403 }
      );
    }
    console.error("[KYC] Admin list failed", err);
    return NextResponse.json(
      { error: "internal_error", message: "Failed to load KYC queue." },
      { status: 500 }
    );
  }
}
