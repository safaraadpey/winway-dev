import { NextResponse } from "next/server";
import { createServiceClient, getUserFromRequest } from "@/lib/supabaseServer";

type LiveRoomResponse = {
  room: {
    id: string;
    status: string | null;
    room_code: string | null;
    card_price: number;
    currency: string;
    min_players: number | null;
    max_cards_per_player: number | null;
    started_at: string | null;
    next_draw_at: string | null;
    line_reward_percentage: number;
    full_reward_percentage: number;
    commission_rate: number;
  };
  server_now: string;
  draws: Array<{ number: number; created_at: string }>;
  cards: Array<{
    ticket_id: string;
    player_id: string | null;
    player_name: string;
    card_number: number | null;
    card: Array<Array<number | null>>;
    is_my_card: boolean;
  }>;
};

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const roomId = url.searchParams.get("roomId");

    if (!roomId) {
      return NextResponse.json(
        { error: "missing_parameters", message: "roomId is required." },
        { status: 400 }
      );
    }

    const user = await getUserFromRequest(request);

    if (!user) {
      return NextResponse.json(
        { error: "unauthorized", message: "Authentication required." },
        { status: 401 }
      );
    }

    const supabase = createServiceClient();

    const { data: room, error: roomError } = await supabase
      .from("rooms")
      .select(
        `
        id,
        status,
        room_code,
        card_price,
        currency,
        min_players,
        max_cards_per_player,
        starts_at,
        next_draw_at,
        line_reward_percentage,
        full_reward_percentage,
        commission_rate,
        room_template_id
      `
      )
      .eq("id", roomId)
      .single();

    if (roomError || !room) {
      return NextResponse.json(
        { error: "room_not_found", message: "Room not found." },
        { status: 404 }
      );
    }

    let template: {
      line_reward_percentage: number | null;
      full_reward_percentage: number | null;
      commission_rate: number | null;
    } | null = null;

    if (room.room_template_id) {
      const { data: templateRow } = await supabase
        .from("room_templates")
        .select(
          `
          line_reward_percentage,
          full_reward_percentage,
          commission_rate
        `
        )
        .eq("id", room.room_template_id)
        .single();

      template = templateRow ?? null;
    }

    const resolvedCommissionRateRaw =
      room.commission_rate ??
      template?.commission_rate ??
      0;
    const resolvedCommissionRate =
      resolvedCommissionRateRaw > 1
        ? resolvedCommissionRateRaw / 100
        : resolvedCommissionRateRaw;

    let resolvedLinePct =
      room.line_reward_percentage ??
      template?.line_reward_percentage ??
      0.5;
    let resolvedFullPct =
      room.full_reward_percentage ??
      template?.full_reward_percentage ??
      0.5;

    if (resolvedLinePct === 0 && resolvedFullPct === 0) {
      resolvedLinePct = 0.5;
      resolvedFullPct = 0.5;
    }

    if (resolvedLinePct + resolvedFullPct > 1) {
      const sum = resolvedLinePct + resolvedFullPct;
      resolvedLinePct = resolvedLinePct / sum;
      resolvedFullPct = 1 - resolvedLinePct;
    }

    const { data: draws, error: drawsError } = await supabase
      .from("draws")
      .select("number, created_at")
      .eq("room_id", roomId)
      .order("created_at", { ascending: true });

    if (drawsError) {
      console.error("live-room fetch draws error:", drawsError);
    }

    const { data: tickets, error: ticketsError } = await supabase
      .from("tickets")
      .select("id, player_user_id, pool_card_id, card_no")
      .eq("room_id", roomId)
      .in("reservation_status", ["reserved", "confirmed", "consumed"]);

    if (ticketsError) {
      console.error("live-room fetch tickets error:", ticketsError);
    }

    const playerIds = Array.from(
      new Set(
        (tickets || [])
          .map((t) => t.player_user_id)
          .filter((id): id is string => !!id)
      )
    );

    const { data: users } = playerIds.length
      ? await supabase
          .from("users")
          .select("id, username, user_profiles(nickname)")
          .in("id", playerIds)
      : { data: [] as any[] };

    const userMap = new Map<
      string,
      { username: string | null; nickname: string | null }
    >();
    (users || []).forEach((u: any) => {
      const nickname = Array.isArray(u.user_profiles)
        ? u.user_profiles[0]?.nickname
        : u.user_profiles?.nickname;
      userMap.set(u.id, {
        username: u.username ?? null,
        nickname: nickname ?? null,
      });
    });

    const poolIds = Array.from(
      new Set(
        (tickets || [])
          .map((t) => t.pool_card_id)
          .filter((id): id is string => !!id)
      )
    );

    const { data: cardNumbers } = poolIds.length
      ? await supabase
          .from("card_numbers")
          .select("pool_card_id, row_no, col_no, value")
          .in("pool_card_id", poolIds)
      : { data: [] as any[] };

    const cardNumberMap = new Map<
      string,
      Array<{ row_no: number; col_no: number; value: number | null }>
    >();
    (cardNumbers || []).forEach((cn: any) => {
      if (!cardNumberMap.has(cn.pool_card_id)) {
        cardNumberMap.set(cn.pool_card_id, []);
      }
      cardNumberMap.get(cn.pool_card_id)!.push({
        row_no: cn.row_no,
        col_no: cn.col_no,
        value: cn.value,
      });
    });

    const cards =
      tickets?.map((ticket: any) => {
        const grid = Array.from({ length: 3 }, () =>
          Array(9).fill(null) as Array<number | null>
        );
        const positions = cardNumberMap.get(ticket.pool_card_id) || [];
        positions.forEach((pos) => {
          const rowIndex = pos.row_no - 1; // 1,2,3 → 0,1,2
          const colIndex = pos.col_no - 1; // 1..9   → 0..8
          if (
            rowIndex >= 0 && rowIndex < 3 &&
            colIndex >= 0 && colIndex < 9
          ) {
            grid[rowIndex][colIndex] = pos.value;
          }
        });

        const displayName =
          userMap.get(ticket.player_user_id || "")?.nickname ||
          userMap.get(ticket.player_user_id || "")?.username ||
          ticket.player_user_id ||
          "player";

        return {
          ticket_id: ticket.id,
          player_id: ticket.player_user_id,
          player_name: displayName,
          card_number: ticket.card_no,
          card: grid,
          is_my_card: ticket.player_user_id === user.id,
        };
      }) ?? [];

    const response: LiveRoomResponse = {
      room: {
        id: room.id,
        status: room.status,
        room_code: room.room_code,
        card_price: Number(room.card_price || 0),
        currency: room.currency || "IRR",
        min_players: room.min_players,
        max_cards_per_player: room.max_cards_per_player,
        started_at: room.starts_at,
        next_draw_at: room.next_draw_at ?? null,
        line_reward_percentage: resolvedLinePct,
        full_reward_percentage: resolvedFullPct,
        commission_rate: resolvedCommissionRate,
      },
      server_now: new Date().toISOString(),
      draws: (draws || []).map((d: any) => ({
        number: d.number,
        created_at: d.created_at,
      })),
      cards,
    };

    return NextResponse.json(response);
  } catch (error) {
    console.error("GET /api/player/live-room error:", error);
    return NextResponse.json(
      { error: "internal_error", message: "Failed to load live room state." },
      { status: 500 }
    );
  }
}
