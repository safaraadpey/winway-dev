import { NextResponse } from "next/server";
import {
  loadActiveCardPoolMetaFromPg,
  loadCardDefinitionByCardNoFromPg,
} from "@/lib/cardPool/cardPoolSnapshotPg";
import type { CardPoolDefinition, CardPoolVersionMeta } from "@/lib/cardPool/types";
import { createServiceClient, getUserFromRequest } from "@/lib/supabaseServer";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_CARD_NO = 10000;

function normalizeCardGrid(raw: unknown): (number | null)[][] | null {
  if (!Array.isArray(raw) || raw.length === 0) return null;

  if (Array.isArray(raw[0])) {
    const grid = raw as unknown[][];
    if (grid.length !== 3) return null;
    return grid.map((row) =>
      (Array.isArray(row) ? row : []).map((cell) =>
        cell == null || cell === "" ? null : Number(cell)
      )
    ) as (number | null)[][];
  }

  if (raw.length === 27 && typeof raw[0] !== "object") {
    const flat = raw as unknown[];
    const grid: (number | null)[][] = Array.from({ length: 3 }, () => Array(9).fill(null));
    for (let i = 0; i < 27; i++) {
      const row = Math.floor(i / 9);
      const col = i % 9;
      const cell = flat[i];
      grid[row]![col] = cell == null || cell === "" ? null : Number(cell);
    }
    return grid;
  }

  return null;
}

function parseCardNo(raw: string | null): number | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  if (!/^\d{1,5}$/.test(trimmed)) return null;
  const n = Number(trimmed);
  if (!Number.isInteger(n) || n < 1 || n > MAX_CARD_NO) return null;
  return n;
}

async function loadActivePoolMetaFallback(): Promise<CardPoolVersionMeta | null> {
  const supabase = createServiceClient();
  const { data: poolRow, error } = await supabase
    .from("card_pools")
    .select("id, commit_hash, prng_version, card_count")
    .eq("is_active", true)
    .maybeSingle();

  if (error || !poolRow) return null;

  return {
    poolId: poolRow.id as string,
    commitHash: poolRow.commit_hash as string,
    prngVersion: poolRow.prng_version as string,
    cardCount: Number(poolRow.card_count ?? 0),
  };
}

async function loadCardFromSupabase(
  poolId: string,
  cardNo: number
): Promise<CardPoolDefinition | null> {
  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from("card_pool_cards")
    .select("id, card_no, card_data")
    .eq("pool_id", poolId)
    .eq("card_no", cardNo)
    .maybeSingle();

  if (error) {
    console.error("[CardPoolCache] supabase card lookup error:", error);
    return null;
  }
  if (!data) return null;

  const grid = normalizeCardGrid(data.card_data);
  if (!grid) return null;

  return {
    poolCardId: String(data.id),
    cardNo: data.card_no as number,
    card: grid,
  };
}

export async function GET(request: Request) {
  try {
    const user = await getUserFromRequest(request);
    if (!user) {
      return NextResponse.json(
        { ok: false, error: "unauthorized", message: "Authentication required." },
        { status: 401 }
      );
    }

    const url = new URL(request.url);
    const cardNo = parseCardNo(url.searchParams.get("cardNo"));
    if (cardNo == null) {
      return NextResponse.json(
        {
          ok: false,
          error: "invalid_card_no",
          message: "شماره کارت نامعتبر است.",
        },
        { status: 400 }
      );
    }

    let meta = await loadActiveCardPoolMetaFromPg();
    let source: "pg" | "supabase" = "pg";
    if (!meta) {
      meta = await loadActivePoolMetaFallback();
      source = "supabase";
    }

    if (!meta) {
      return NextResponse.json(
        { ok: false, error: "pool_not_found", message: "استخر کارت فعال پیدا نشد." },
        { status: 404 }
      );
    }

    if (meta.cardCount > 0 && cardNo > meta.cardCount) {
      return NextResponse.json(
        {
          ok: false,
          error: "card_not_found",
          message: `شماره کارت باید بین 1 و ${meta.cardCount} باشد.`,
          pool: { poolId: meta.poolId, cardCount: meta.cardCount },
        },
        { status: 404 }
      );
    }

    let definition = await loadCardDefinitionByCardNoFromPg(meta.poolId, cardNo);
    if (!definition) {
      definition = await loadCardFromSupabase(meta.poolId, cardNo);
      if (definition) source = "supabase";
    }

    if (!definition) {
      console.info(
        "[CardPoolCache] lookup miss",
        JSON.stringify({ cardNo, poolId: meta.poolId, source })
      );
      return NextResponse.json(
        {
          ok: false,
          error: "card_not_found",
          message: "کارتی با این شماره در استخر فعال پیدا نشد.",
          pool: { poolId: meta.poolId, cardCount: meta.cardCount },
        },
        { status: 404 }
      );
    }

    console.info(
      "[CardPoolCache] lookup served",
      JSON.stringify({
        cardNo: definition.cardNo,
        poolId: meta.poolId,
        poolCardId: definition.poolCardId,
        source,
      })
    );

    return NextResponse.json(
      {
        ok: true,
        cardNo: definition.cardNo,
        poolCardId: definition.poolCardId,
        card: definition.card,
        pool: { poolId: meta.poolId, cardCount: meta.cardCount },
      },
      {
        status: 200,
        headers: { "Cache-Control": "no-store" },
      }
    );
  } catch (error) {
    console.error("[CardPoolCache] GET /api/player/card-pool/lookup error:", error);
    return NextResponse.json(
      { ok: false, error: "internal_error", message: "بارگذاری کارت ناموفق بود." },
      { status: 500 }
    );
  }
}
