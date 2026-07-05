import { NextResponse } from "next/server";
import {
  loadActiveCardPoolMetaFromPg,
  loadCardPoolDefinitionsFromPg,
  loadCardPoolMetaFromPg,
} from "@/lib/cardPool/cardPoolSnapshotPg";
import { buildCardPoolVersionKey } from "@/lib/cardPool/types";
import { createServiceClient, getUserFromRequest } from "@/lib/supabaseServer";

export const dynamic = "force-dynamic";

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
    const grid: (number | null)[][] = Array.from({ length: 3 }, () =>
      Array(9).fill(null)
    );
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

async function loadDefinitionsFromSupabase(poolId: string) {
  const supabase = createServiceClient();

  const { data: cards, error } = await supabase
    .from("card_pool_cards")
    .select("id, card_no, card_data")
    .eq("pool_id", poolId)
    .order("card_no", { ascending: true });

  if (error) {
    console.error("[CardPoolCache] supabase card_pool_cards error:", error);
    return null;
  }

  const definitions = (cards || [])
    .map((row) => {
      const grid = normalizeCardGrid(row.card_data);
      if (!grid) return null;
      return {
        poolCardId: String(row.id),
        cardNo: row.card_no as number,
        card: grid,
      };
    })
    .filter((row): row is NonNullable<typeof row> => row !== null);

  return definitions;
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
    const poolIdParam = url.searchParams.get("poolId");
    const ifVersion = url.searchParams.get("ifVersion");

    let meta = poolIdParam
      ? await loadCardPoolMetaFromPg(poolIdParam)
      : await loadActiveCardPoolMetaFromPg();

    if (!meta) {
      const supabase = createServiceClient();
      const query = supabase
        .from("card_pools")
        .select("id, commit_hash, prng_version, card_count");

      const { data: poolRow, error: poolError } = poolIdParam
        ? await query.eq("id", poolIdParam).maybeSingle()
        : await query.eq("is_active", true).maybeSingle();

      if (poolError || !poolRow) {
        return NextResponse.json(
          { ok: false, error: "pool_not_found", message: "Active card pool not found." },
          { status: 404 }
        );
      }

      meta = {
        poolId: poolRow.id as string,
        commitHash: poolRow.commit_hash as string,
        prngVersion: poolRow.prng_version as string,
        cardCount: Number(poolRow.card_count ?? 0),
      };
    }

    const versionKey = buildCardPoolVersionKey(meta);
    if (ifVersion && ifVersion === versionKey) {
      return new NextResponse(null, {
        status: 304,
        headers: {
          "X-Card-Pool-Version": versionKey,
          "Cache-Control": "no-store",
        },
      });
    }

    let definitions = await loadCardPoolDefinitionsFromPg(meta.poolId);
    if (!definitions || definitions.length === 0) {
      definitions = (await loadDefinitionsFromSupabase(meta.poolId)) ?? [];
    }

    if (definitions.length === 0) {
      return NextResponse.json(
        { ok: false, error: "definitions_not_found", message: "Card pool definitions not found." },
        { status: 404 }
      );
    }

    console.info(
      "[CardPoolCache] definitions served",
      JSON.stringify({
        poolId: meta.poolId,
        versionKey,
        definitionCount: definitions.length,
        source: "pg-first",
      })
    );

    return NextResponse.json(
      {
        ok: true,
        version: meta,
        versionKey,
        definitions,
      },
      {
        status: 200,
        headers: {
          "X-Card-Pool-Version": versionKey,
          "Cache-Control": "no-store",
        },
      }
    );
  } catch (error) {
    console.error("[CardPoolCache] GET /api/player/card-pool/definitions error:", error);
    return NextResponse.json(
      { ok: false, error: "internal_error", message: "Failed to load card pool definitions." },
      { status: 500 }
    );
  }
}
