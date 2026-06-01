/**
 * Game-data repositories.
 *
 * Typed data access for the tables the engine owns/writes in `engine` mode
 * (rooms, draws, marks, results) and reads for orchestration (tickets,
 * card_numbers, room_templates). Ledger tables are NOT touched here — money
 * moves only through the finance adapter's RPC wrappers.
 *
 * All methods are thin and side-effect-explicit so domain orchestrators stay
 * readable and the SQL→TS mapping is obvious.
 */

import type { SupabaseAdmin } from "../db/supabase-admin.js";
import type {
  CardNumberRow,
  DrawRow,
  ResultRow,
  RoomRow,
  TicketRow,
} from "./types.js";

/** PostgREST returns bytea as a `\x`-prefixed hex string; decode to Buffer. */
export function parseBytea(value: string | null): Buffer | null {
  if (!value) return null;
  if (value.startsWith("\\x")) return Buffer.from(value.slice(2), "hex");
  // Some drivers hand back base64; fall back to that.
  return Buffer.from(value, "base64");
}

function fail(op: string, message: string): never {
  throw new Error(`repo ${op}: ${message}`);
}

export class GameRepo {
  constructor(private readonly db: SupabaseAdmin) {}

  // ---- rooms -------------------------------------------------------------

  async getWaitingRoomsDue(limit: number, nowIso: string): Promise<RoomRow[]> {
    const { data, error } = await this.db
      .from("rooms")
      .select(
        "id,status,currency,room_seed,room_template_id,next_draw_at,starts_at,min_players,countdown_sec,first_line_draw_number,line_reward_percentage,full_reward_percentage,ding_per_number,meta"
      )
      .eq("status", "waiting")
      .not("starts_at", "is", null)
      .lte("starts_at", nowIso)
      .order("starts_at", { ascending: true })
      .limit(limit);
    if (error) fail("getWaitingRoomsDue", error.message);
    return (data ?? []) as RoomRow[];
  }

  async getPlayingRoomsDue(limit: number, nowIso: string): Promise<RoomRow[]> {
    const { data, error } = await this.db
      .from("rooms")
      .select(
        "id,status,currency,room_seed,room_template_id,next_draw_at,starts_at,min_players,countdown_sec,first_line_draw_number,line_reward_percentage,full_reward_percentage,ding_per_number,meta"
      )
      .eq("status", "playing")
      .not("next_draw_at", "is", null)
      .lte("next_draw_at", nowIso)
      .limit(limit);
    if (error) fail("getPlayingRoomsDue", error.message);
    return (data ?? []) as RoomRow[];
  }

  async getRoom(roomId: string): Promise<RoomRow | null> {
    const { data, error } = await this.db
      .from("rooms")
      .select(
        "id,status,currency,room_seed,room_template_id,next_draw_at,starts_at,min_players,countdown_sec,first_line_draw_number,line_reward_percentage,full_reward_percentage,ding_per_number,meta"
      )
      .eq("id", roomId)
      .maybeSingle();
    if (error) fail("getRoom", error.message);
    return (data as RoomRow) ?? null;
  }

  async setRoomPlaying(roomId: string, nextDrawAtIso: string, nowIso: string): Promise<boolean> {
    const { data, error } = await this.db
      .from("rooms")
      .update({ status: "playing", next_draw_at: nextDrawAtIso, updated_at: nowIso })
      .eq("id", roomId)
      .eq("status", "waiting")
      .select("id");
    if (error) fail("setRoomPlaying", error.message);
    return (data?.length ?? 0) > 0;
  }

  async extendRoomCountdown(roomId: string, startsAtIso: string, nowIso: string): Promise<void> {
    const { error } = await this.db
      .from("rooms")
      .update({ starts_at: startsAtIso, updated_at: nowIso })
      .eq("id", roomId)
      .eq("status", "waiting");
    if (error) fail("extendRoomCountdown", error.message);
  }

  async setRoomFinished(roomId: string, nowIso: string): Promise<void> {
    const { error } = await this.db
      .from("rooms")
      .update({ status: "finished", updated_at: nowIso })
      .eq("id", roomId);
    if (error) fail("setRoomFinished", error.message);
  }

  async setRoomSettling(roomId: string, nowIso: string): Promise<void> {
    const { error } = await this.db
      .from("rooms")
      .update({ status: "settling", updated_at: nowIso })
      .eq("id", roomId)
      .not("status", "in", "(finished,settling)");
    if (error) fail("setRoomSettling", error.message);
  }

  async setNextDrawAt(roomId: string, nextDrawAtIso: string, nowIso: string): Promise<void> {
    const { error } = await this.db
      .from("rooms")
      .update({ next_draw_at: nextDrawAtIso, updated_at: nowIso })
      .eq("id", roomId);
    if (error) fail("setNextDrawAt", error.message);
  }

  async setFirstLineDrawNumber(roomId: string, drawNumber: number): Promise<void> {
    const { error } = await this.db
      .from("rooms")
      .update({ first_line_draw_number: drawNumber })
      .eq("id", roomId)
      .is("first_line_draw_number", null);
    if (error) fail("setFirstLineDrawNumber", error.message);
  }

  // ---- draws -------------------------------------------------------------

  async getDrawnNumbers(roomId: string): Promise<number[]> {
    const { data, error } = await this.db
      .from("draws")
      .select("number")
      .eq("room_id", roomId);
    if (error) fail("getDrawnNumbers", error.message);
    return (data ?? []).map((d: { number: number }) => d.number);
  }

  async hasUnprocessedDraw(roomId: string): Promise<boolean> {
    const { count, error } = await this.db
      .from("draws")
      .select("id", { count: "exact", head: true })
      .eq("room_id", roomId)
      .is("processed_at", null);
    if (error) fail("hasUnprocessedDraw", error.message);
    return (count ?? 0) > 0;
  }

  async insertDraw(roomId: string, number: number, nowIso: string): Promise<void> {
    const { error } = await this.db.from("draws").insert({
      room_id: roomId,
      number,
      timestamp: nowIso,
      created_at: nowIso,
    });
    if (error) fail("insertDraw", error.message);
  }

  async getDraw(roomId: string, number: number): Promise<DrawRow | null> {
    const { data, error } = await this.db
      .from("draws")
      .select("id,room_id,number,processed_at,ding_aggregated_at")
      .eq("room_id", roomId)
      .eq("number", number)
      .maybeSingle();
    if (error) fail("getDraw", error.message);
    return (data as DrawRow) ?? null;
  }

  // ---- tickets / cards ---------------------------------------------------

  async getRoomTickets(roomId: string): Promise<TicketRow[]> {
    const { data, error } = await this.db
      .from("tickets")
      .select(
        "id,room_id,player_user_id,pool_card_id,price,reservation_status,cancelled_at"
      )
      .eq("room_id", roomId);
    if (error) fail("getRoomTickets", error.message);
    return (data ?? []) as TicketRow[];
  }

  async getCardNumbers(poolCardIds: string[]): Promise<CardNumberRow[]> {
    if (poolCardIds.length === 0) return [];
    const { data, error } = await this.db
      .from("card_numbers")
      .select("pool_card_id,value,row_no")
      .in("pool_card_id", poolCardIds);
    if (error) fail("getCardNumbers", error.message);
    return (data ?? []) as CardNumberRow[];
  }

  async countDistinctActivePlayers(roomId: string): Promise<number> {
    const { data, error } = await this.db
      .from("tickets")
      .select("player_user_id")
      .eq("room_id", roomId)
      .in("reservation_status", ["reserved", "confirmed"]);
    if (error) fail("countDistinctActivePlayers", error.message);
    return new Set((data ?? []).map((t: { player_user_id: string }) => t.player_user_id)).size;
  }

  // ---- marks -------------------------------------------------------------

  async getMarksForTickets(ticketIds: string[]): Promise<Map<string, Set<number>>> {
    const out = new Map<string, Set<number>>();
    if (ticketIds.length === 0) return out;
    const { data, error } = await this.db
      .from("marks")
      .select("ticket_id,value")
      .in("ticket_id", ticketIds);
    if (error) fail("getMarksForTickets", error.message);
    for (const m of (data ?? []) as { ticket_id: string; value: number }[]) {
      if (!out.has(m.ticket_id)) out.set(m.ticket_id, new Set());
      out.get(m.ticket_id)!.add(m.value);
    }
    return out;
  }

  async insertMarksForDraw(
    rows: { ticket_id: string; value: number }[],
    nowIso: string
  ): Promise<void> {
    if (rows.length === 0) return;
    const { error } = await this.db
      .from("marks")
      .upsert(
        rows.map((r) => ({ ticket_id: r.ticket_id, value: r.value, created_at: nowIso })),
        { onConflict: "ticket_id,value", ignoreDuplicates: true }
      );
    if (error) fail("insertMarksForDraw", error.message);
  }

  // ---- results -----------------------------------------------------------

  async getResults(roomId: string): Promise<ResultRow[]> {
    const { data, error } = await this.db
      .from("results")
      .select("id,room_id,user_id,ticket_id,win_type,reward_amount,draw_number,paid_at")
      .eq("room_id", roomId);
    if (error) fail("getResults", error.message);
    return (data ?? []) as ResultRow[];
  }

  async insertResults(
    rows: { room_id: string; user_id: string; ticket_id: string; win_type: string; draw_number: number }[]
  ): Promise<void> {
    if (rows.length === 0) return;
    const { error } = await this.db
      .from("results")
      .upsert(
        rows.map((r) => ({ ...r, reward_amount: 0 })),
        { onConflict: "ticket_id,win_type", ignoreDuplicates: true }
      );
    if (error) fail("insertResults", error.message);
  }

  // ---- ding --------------------------------------------------------------

  async stampDrawProcessed(roomId: string, number: number, nowIso: string): Promise<void> {
    const { error } = await this.db
      .from("draws")
      .update({ processed_at: nowIso })
      .eq("room_id", roomId)
      .eq("number", number)
      .is("processed_at", null);
    if (error) fail("stampDrawProcessed", error.message);
  }
}
