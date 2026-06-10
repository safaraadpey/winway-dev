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

export { DevPlayerRepo } from "./devPlayerRepo.js";

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

  async getTemplateDingPerNumber(templateId: string): Promise<number | null> {
    const { data, error } = await this.db
      .from("room_templates")
      .select("ding_per_number")
      .eq("id", templateId)
      .maybeSingle();
    if (error) fail("getTemplateDingPerNumber", error.message);
    return (data as { ding_per_number: number | null } | null)?.ding_per_number ?? null;
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

  /** Full-house result exists but prizes not paid yet. */
  async hasUnpaidFullWinner(roomId: string): Promise<boolean> {
    const { data, error } = await this.db
      .from("results")
      .select("id")
      .eq("room_id", roomId)
      .eq("win_type", "full")
      .is("paid_at", null)
      .limit(1);
    if (error) fail("hasUnpaidFullWinner", error.message);
    return (data?.length ?? 0) > 0;
  }

  /** Room should run fn_finish_room_and_settle (new full win or stuck settling). */
  async roomNeedsSettlement(roomId: string): Promise<boolean> {
    const room = await this.getRoom(roomId);
    if (!room || room.status === "finished" || room.status === "cancelled") {
      return false;
    }
    if (room.status === "settling") return true;
    return this.hasUnpaidFullWinner(roomId);
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

  /** Queued or processing draw_jobs remain for this room. */
  async hasPendingDrawJobs(roomId: string): Promise<boolean> {
    const { count, error } = await this.db
      .from("draw_jobs")
      .select("id", { count: "exact", head: true })
      .eq("room_id", roomId)
      .in("status", ["queued", "processing"]);
    if (error) fail("hasPendingDrawJobs", error.message);
    return (count ?? 0) > 0;
  }

  /** Latest drawn ball number (by insert time). */
  async getLastDrawNumber(roomId: string): Promise<number | null> {
    const { data, error } = await this.db
      .from("draws")
      .select("number")
      .eq("room_id", roomId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) fail("getLastDrawNumber", error.message);
    const n = (data as { number: number } | null)?.number;
    return n == null ? null : Number(n);
  }

  async getUnprocessedDrawNumbers(roomId: string): Promise<number[]> {
    const { data, error } = await this.db
      .from("draws")
      .select("number")
      .eq("room_id", roomId)
      .is("processed_at", null);
    if (error) fail("getUnprocessedDrawNumbers", error.message);
    return (data ?? []).map((d: { number: number }) => d.number);
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

  /** Lock room row, enforce backpressure, insert draw + bump next_draw_at atomically. */
  async insertDrawIfReady(
    roomId: string,
    number: number,
    nowIso: string,
    drawIntervalSec: number
  ): Promise<"inserted" | "backpressure" | "duplicate" | "not_playing"> {
    const { data, error } = await this.db.rpc("rpc_insert_draw_if_ready", {
      p_room_id: roomId,
      p_number: number,
      p_now: nowIso,
      p_draw_interval_sec: drawIntervalSec,
    });
    if (error) fail("rpc_insert_draw_if_ready", error.message);
    const outcome = String(data ?? "");
    if (
      outcome === "inserted" ||
      outcome === "backpressure" ||
      outcome === "duplicate" ||
      outcome === "not_playing"
    ) {
      return outcome;
    }
    fail("rpc_insert_draw_if_ready", `unexpected outcome: ${outcome}`);
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

  async getCardNumbers(poolCardIds: (string | number)[]): Promise<CardNumberRow[]> {
    if (poolCardIds.length === 0) return [];
    const ids = [...new Set(poolCardIds.map((id) => String(id)))];
    const { data, error } = await this.db
      .from("card_numbers")
      .select("pool_card_id,value,row_no")
      .in("pool_card_id", ids);
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

  // ---- draw_jobs recovery ------------------------------------------------

  /** Requeue jobs stuck in `processing` (crash/OOM recovery). */
  async requeueStaleProcessingJobs(
    staleSec: number
  ): Promise<{ requeued: number; roomIds: string[] }> {
    const cutoff = new Date(Date.now() - staleSec * 1000).toISOString();
    const nowIso = new Date().toISOString();
    const { data, error } = await this.db
      .from("draw_jobs")
      .update({ status: "queued", updated_at: nowIso })
      .eq("status", "processing")
      .lt("updated_at", cutoff)
      .select("id,room_id");
    if (error) fail("requeueStaleProcessingJobs", error.message);
    const rows = (data ?? []) as { id: number; room_id: string }[];
    const roomIds = [...new Set(rows.map((r) => r.room_id))];
    return { requeued: rows.length, roomIds };
  }

  // ---- ding --------------------------------------------------------------

  /** Batch insert ding_transactions + balance bumps + ding_aggregated_at lock. */
  async applyDingCreditsForDraw(args: {
    roomId: string;
    drawNumber: number;
    dingPerCard: number;
    credits: { user_id: string; amount: number; matched_cards: number }[];
  }): Promise<number> {
    const { data, error } = await this.db.rpc("rpc_apply_ding_credits_for_draw", {
      p_room_id: args.roomId,
      p_draw_number: args.drawNumber,
      p_ding_per_card: args.dingPerCard,
      p_credits: args.credits,
    });
    if (error) fail("rpc_apply_ding_credits_for_draw", error.message);
    return typeof data === "number" ? data : Number(data ?? 0);
  }

  async stampDrawProcessed(roomId: string, number: number, nowIso: string): Promise<void> {
    const { error } = await this.db
      .from("draws")
      .update({ processed_at: nowIso })
      .eq("room_id", roomId)
      .eq("number", number)
      .is("processed_at", null);
    if (error) fail("stampDrawProcessed", error.message);
  }

  /** Single RPC: marks + results + job done + processed_at stamp. */
  async finalizeEngineDrawJob(args: {
    jobId: number;
    roomId: string;
    drawNumber: number;
    marks: { ticket_id: string; value: number }[];
    results: {
      room_id: string;
      user_id: string;
      ticket_id: string;
      win_type: string;
      draw_number: number;
    }[];
    setFirstLineDrawNumber: boolean;
  }): Promise<void> {
    const { error } = await this.db.rpc("rpc_finalize_engine_draw_job", {
      p_job_id: args.jobId,
      p_room_id: args.roomId,
      p_draw_number: args.drawNumber,
      p_marks: args.marks,
      p_results: args.results,
      p_set_first_line_draw_number: args.setFirstLineDrawNumber,
    });
    if (error) fail("rpc_finalize_engine_draw_job", error.message);
  }
}
