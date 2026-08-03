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
  image_base64: string | null;
  created_at: string;
  status: "pending_review" | "approved";
  agent_username: string | null;
  super_username: string | null;
};

/**
 * GET /api/admin/kyc — pending reviews + approved submissions that still have image bytes.
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
         CASE
           WHEN k.image_data IS NULL THEN NULL
           ELSE encode(k.image_data, 'base64')
         END AS image_base64,
         k.created_at,
         k.status,
         agent_u.username AS agent_username,
         super_u.username AS super_username
       FROM public.kyc_submissions k
       JOIN public.users u ON u.id = k.user_id
       LEFT JOIN public.player_affiliation pa ON pa.user_id = k.user_id
       LEFT JOIN public.users agent_u ON agent_u.id = pa.agent_id
       LEFT JOIN public.users super_u ON super_u.id = pa.super_id
       WHERE k.status = 'pending_review'
          OR (k.status = 'approved' AND k.image_data IS NOT NULL)
       ORDER BY
         CASE WHEN k.status = 'pending_review' THEN 0 ELSE 1 END,
         k.created_at ASC
       LIMIT 100`
    );

    const items: AdminKycListItem[] = result.rows
      .filter((row) => row.image_base64)
      .map((row) => ({
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
        status: row.status,
        hasImage: true,
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
