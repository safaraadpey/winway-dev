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
  CardDefinitionMaskRow,
  CardNumberIndexRow,
  CardNumberRow,
  DrawRow,
  OwnerInsertOutcome,
  OwnerInsertResult,
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

/** PostgREST default max rows is 1000 — paginate global card tables fully. */
const GLOBAL_CARD_PAGE_SIZE = 1000;

export { DevPlayerRepo } from "./devPlayerRepo.js";

export class GameRepo {
  constructor(private readonly db: SupabaseAdmin) {}

  private async fetchAllRows<T>(
    op: string,
    table: string,
    select: string
  ): Promise<T[]> {
    const all: T[] = [];
    let from = 0;
    while (true) {
      const { data, error } = await this.db
        .from(table)
        .select(select)
        .range(from, from + GLOBAL_CARD_PAGE_SIZE - 1);
      if (error) fail(op, error.message);
      const page = (data ?? []) as T[];
      all.push(...page);
      if (page.length < GLOBAL_CARD_PAGE_SIZE) break;
      from += GLOBAL_CARD_PAGE_SIZE;
    }
    return all;
  }

  // ---- rooms -------------------------------------------------------------

  async getWaitingRoomsDue(limit: number, nowIso: string): Promise<RoomRow[]> {
    const { data, error } = await this.db
      .from("rooms")
      .select(
        "id,status,currency,room_seed,room_template_id,next_draw_at,starts_at,waiting_started_at,min_players,max_players,countdown_sec,first_line_draw_number,line_reward_percentage,full_reward_percentage,ding_per_number,meta"
      )
      .eq("status", "waiting")
      .not("starts_at", "is", null)
      .lte("starts_at", nowIso)
      .order("starts_at", { ascending: true })
      .limit(limit);
    if (error) fail("getWaitingRoomsDue", error.message);
    return (data ?? []) as RoomRow[];
  }

  async getWaitingRoomsAtMaxCapacity(limit: number): Promise<RoomRow[]> {
    const { data, error } = await this.db
      .from("rooms")
      .select(
        "id,status,currency,room_seed,room_template_id,next_draw_at,starts_at,waiting_started_at,min_players,max_players,countdown_sec,first_line_draw_number,line_reward_percentage,full_reward_percentage,ding_per_number,meta"
      )
      .eq("status", "waiting")
      .not("max_players", "is", null)
      .order("created_at", { ascending: true })
      .limit(limit);
    if (error) fail("getWaitingRoomsAtMaxCapacity", error.message);
    return (data ?? []) as RoomRow[];
  }

  async getPlayingRoomsDue(limit: number, nowIso: string): Promise<RoomRow[]> {
    const { data, error } = await this.db
      .from("rooms")
      .select(
        "id,status,currency,room_seed,room_template_id,next_draw_at,starts_at,waiting_started_at,min_players,max_players,countdown_sec,first_line_draw_number,line_reward_percentage,full_reward_percentage,ding_per_number,meta"
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
        "id,status,currency,room_seed,room_template_id,next_draw_at,starts_at,waiting_started_at,min_players,max_players,countdown_sec,first_line_draw_number,line_reward_percentage,full_reward_percentage,ding_per_number,meta"
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

  async extendRoomCountdown(roomId: string, startsAtIso: string, nowIso: string): Promise<boolean> {
    const { data, error } = await this.db
      .from("rooms")
      .update({ starts_at: startsAtIso, updated_at: nowIso })
      .eq("id", roomId)
      .eq("status", "waiting")
      .select("id");
    if (error) fail("extendRoomCountdown", error.message);
    return (data?.length ?? 0) > 0;
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

  // ---- room-loop lease (Phase 3+) ----------------------------------------

  /** Claim/extend the engine loop lease for a playing room (single owner). */
  async claimRoom(
    roomId: string,
    ownerId: string,
    leaseSeconds: number
  ): Promise<boolean> {
    const { data, error } = await this.db.rpc("rpc_claim_game_room", {
      p_room_id: roomId,
      p_owner_id: ownerId,
      p_lease_seconds: leaseSeconds,
    });
    if (error) fail("rpc_claim_game_room", error.message);
    return data === true;
  }

  /** Renew an owned lease (heartbeat). Returns false if ownership was lost. */
  async renewLease(
    roomId: string,
    ownerId: string,
    leaseSeconds: number
  ): Promise<boolean> {
    const { data, error } = await this.db.rpc("rpc_renew_game_room_lease", {
      p_room_id: roomId,
      p_owner_id: ownerId,
      p_lease_seconds: leaseSeconds,
    });
    if (error) fail("rpc_renew_game_room_lease", error.message);
    return data === true;
  }

  /** Release an owned lease (graceful handoff). */
  async releaseRoom(roomId: string, ownerId: string): Promise<boolean> {
    const { data, error } = await this.db.rpc("rpc_release_game_room", {
      p_room_id: roomId,
      p_owner_id: ownerId,
    });
    if (error) fail("rpc_release_game_room", error.message);
    return data === true;
  }

  /** Playing rooms with a free/expired lease, ordered by due time. */
  async findClaimableRooms(limit = 100): Promise<
    {
      room_id: string;
      next_draw_at: string | null;
      engine_owner_id: string | null;
      engine_lease_until: string | null;
    }[]
  > {
    const { data, error } = await this.db.rpc(
      "rpc_find_claimable_playing_rooms",
      { p_limit: limit }
    );
    if (error) fail("rpc_find_claimable_playing_rooms", error.message);
    return (data ?? []) as {
      room_id: string;
      next_draw_at: string | null;
      engine_owner_id: string | null;
      engine_lease_until: string | null;
    }[];
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

  /** True when a draw inserted earlier (by timestamp) still lacks processed_at. */
  async hasEarlierUnprocessedDraws(
    roomId: string,
    drawNumber: number
  ): Promise<boolean> {
    const { data, error } = await this.db.rpc("rpc_has_earlier_unprocessed_draw", {
      p_room_id: roomId,
      p_draw_number: drawNumber,
    });
    if (error) fail("rpc_has_earlier_unprocessed_draw", error.message);
    return data === true;
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

  /**
   * Owner-guarded insert for the room-actor loop: only the lease owner may
   * insert, and actor_* timing + next_draw_at are stamped atomically.
   */
  async insertDrawIfReadyForOwner(args: {
    roomId: string;
    number: number;
    nowIso: string;
    ownerId: string;
    drawIntervalSec: number;
    actorDueAtIso?: string | null;
  }): Promise<OwnerInsertResult> {
    const { data, error } = await this.db.rpc(
      "rpc_insert_draw_if_ready_owner_guard",
      {
        p_room_id: args.roomId,
        p_number: args.number,
        p_now: args.nowIso,
        p_owner_id: args.ownerId,
        p_draw_interval_sec: args.drawIntervalSec,
        p_actor_due_at: args.actorDueAtIso ?? null,
      }
    );
    if (error) fail("rpc_insert_draw_if_ready_owner_guard", error.message);

    const payload =
      typeof data === "string"
        ? (JSON.parse(data) as Record<string, unknown>)
        : (data as Record<string, unknown> | null);

    const outcome = String(payload?.outcome ?? "");
    const validOutcomes = [
      "inserted",
      "backpressure",
      "duplicate",
      "not_owner",
      "not_playing",
      "exhausted",
    ] as const;
    if (!validOutcomes.includes(outcome as (typeof validOutcomes)[number])) {
      fail(
        "rpc_insert_draw_if_ready_owner_guard",
        `unexpected outcome: ${outcome}`
      );
    }

    const rawJobId = payload?.job_id;
    const jobId =
      rawJobId == null
        ? null
        : typeof rawJobId === "number"
          ? rawJobId
          : Number(rawJobId);

    const nextDrawAtIso =
      typeof payload?.next_draw_at === "string" ? payload.next_draw_at : null;

    return {
      outcome: outcome as OwnerInsertOutcome,
      jobId: Number.isFinite(jobId) ? jobId : null,
      nextDrawAtIso,
    };
  }

  /** Oldest unprocessed draw for a room (recovery: process in insert order). */
  async getOldestUnprocessedDraw(
    roomId: string
  ): Promise<{ number: number; created_at: string } | null> {
    const { data, error } = await this.db
      .from("draws")
      .select("number,created_at")
      .eq("room_id", roomId)
      .is("processed_at", null)
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();
    if (error) fail("getOldestUnprocessedDraw", error.message);
    const row = data as { number: number; created_at: string } | null;
    return row ?? null;
  }

  /** draw_jobs row id for a (room, draw_number), if the trigger created one. */
  async getDrawJobId(roomId: string, drawNumber: number): Promise<number | null> {
    const { data, error } = await this.db
      .from("draw_jobs")
      .select("id")
      .eq("room_id", roomId)
      .eq("draw_number", drawNumber)
      .order("id", { ascending: true })
      .limit(1)
      .maybeSingle();
    if (error) fail("getDrawJobId", error.message);
    return (data as { id: number } | null)?.id ?? null;
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

  /** Global precomputed win masks — loaded once into CardRegistry. */
  async getCardDefinitionMasks(): Promise<CardDefinitionMaskRow[]> {
    return this.fetchAllRows<CardDefinitionMaskRow>(
      "getCardDefinitionMasks",
      "card_definition_masks",
      "pool_card_id,line1_mask,line2_mask,line3_mask,full_mask,cell_count"
    );
  }

  /** Global reverse number index — loaded once into CardRegistry. */
  async getCardNumberIndex(): Promise<CardNumberIndexRow[]> {
    return this.fetchAllRows<CardNumberIndexRow>(
      "getCardNumberIndex",
      "card_number_index",
      "value,pool_card_id,bit_position"
    );
  }

  /** Fallback CardRegistry build when bitmask tables are not yet migrated. */
  async getAllCardNumbersForRegistry(): Promise<
    { pool_card_id: string; value: number; row_no: number; col_no: number }[]
  > {
    return this.fetchAllRows<{
      pool_card_id: string;
      value: number;
      row_no: number;
      col_no: number;
    }>(
      "getAllCardNumbersForRegistry",
      "card_numbers",
      "pool_card_id,value,row_no,col_no"
    );
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

  /** Draw numbers in this room that already have processed_at set. */
  async getProcessedDrawNumbers(
    roomId: string,
    numbers: number[]
  ): Promise<Set<number>> {
    if (numbers.length === 0) return new Set();
    const { data, error } = await this.db
      .from("draws")
      .select("number")
      .eq("room_id", roomId)
      .in("number", numbers)
      .not("processed_at", "is", null);
    if (error) fail("getProcessedDrawNumbers", error.message);
    return new Set(
      ((data ?? []) as { number: number }[]).map((row) => row.number)
    );
  }

  /** Mark draw_jobs done without re-running evaluate/finalize. */
  async completeDrawJobs(jobIds: number[]): Promise<void> {
    if (jobIds.length === 0) return;
    const nowIso = new Date().toISOString();
    const { error } = await this.db
      .from("draw_jobs")
      .update({ status: "done", updated_at: nowIso })
      .in("id", jobIds);
    if (error) fail("completeDrawJobs", error.message);
  }

  /** Return actor-deferred jobs to the queue (status must be processing). */
  async requeueDrawJobsById(jobIds: number[]): Promise<void> {
    if (jobIds.length === 0) return;
    const nowIso = new Date().toISOString();
    const { error } = await this.db
      .from("draw_jobs")
      .update({ status: "queued", updated_at: nowIso })
      .in("id", jobIds)
      .eq("status", "processing");
    if (error) fail("requeueDrawJobsById", error.message);
  }

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

  /** Single RPC: marks + results + job done + processed_at + ding. */
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
    dingPerCard?: number;
    dingCredits?: { user_id: string; amount: number; matched_cards: number }[];
    queueWaitMs?: number;
    processingMs?: number;
    drainStartedAt?: string | null;
    firstPickedAt?: string | null;
    handlerStartedAt?: string | null;
    actorEvaluateStartedAt?: string | null;
    actorFinalizeStartedAt?: string | null;
  }): Promise<number> {
    const { data, error } = await this.db.rpc("rpc_finalize_engine_draw_job", {
      p_job_id: args.jobId,
      p_room_id: args.roomId,
      p_draw_number: args.drawNumber,
      p_marks: args.marks,
      p_results: args.results,
      p_set_first_line_draw_number: args.setFirstLineDrawNumber,
      p_ding_per_card: args.dingPerCard ?? 0,
      p_credits: args.dingCredits ?? [],
      p_queue_wait_ms: args.queueWaitMs ?? null,
      p_processing_ms: args.processingMs ?? null,
      p_drain_started_at: args.drainStartedAt ?? null,
      p_first_picked_at: args.firstPickedAt ?? null,
      p_handler_started_at: args.handlerStartedAt ?? null,
      p_actor_evaluate_started_at: args.actorEvaluateStartedAt ?? null,
      p_actor_finalize_started_at: args.actorFinalizeStartedAt ?? null,
    });
    if (error) fail("rpc_finalize_engine_draw_job", error.message);
    return typeof data === "number" ? data : Number(data ?? 0);
  }

  /** Live draw_jobs + rooms snapshot for pick-path diagnostics. */
  async fetchPickDebugQueueState(): Promise<{
    queuedJobsCount: number;
    processingJobsCount: number;
    oldestQueuedAgeMs: number;
    oldestProcessingAgeMs: number;
    activeRoomsCount: number;
  }> {
    const activeRoomStatuses = ["playing", "live", "settling"] as const;
    const now = Date.now();
    const ageMs = (iso: string | null | undefined): number =>
      iso == null ? 0 : Math.max(0, now - Date.parse(iso));

    const [queued, processing, oldestQueued, oldestProcessing, activeRooms] =
      await Promise.all([
        this.db
          .from("draw_jobs")
          .select("id", { count: "exact", head: true })
          .eq("status", "queued"),
        this.db
          .from("draw_jobs")
          .select("id", { count: "exact", head: true })
          .eq("status", "processing"),
        this.db
          .from("draw_jobs")
          .select("created_at")
          .eq("status", "queued")
          .order("created_at", { ascending: true })
          .limit(1)
          .maybeSingle(),
        this.db
          .from("draw_jobs")
          .select("updated_at")
          .eq("status", "processing")
          .order("updated_at", { ascending: true })
          .limit(1)
          .maybeSingle(),
        this.db
          .from("rooms")
          .select("id", { count: "exact", head: true })
          .in("status", [...activeRoomStatuses]),
      ]);

    if (queued.error) fail("fetchPickDebugQueueState:queued", queued.error.message);
    if (processing.error) {
      fail("fetchPickDebugQueueState:processing", processing.error.message);
    }
    if (oldestQueued.error) {
      fail("fetchPickDebugQueueState:oldestQueued", oldestQueued.error.message);
    }
    if (oldestProcessing.error) {
      fail(
        "fetchPickDebugQueueState:oldestProcessing",
        oldestProcessing.error.message
      );
    }
    if (activeRooms.error) {
      fail("fetchPickDebugQueueState:activeRooms", activeRooms.error.message);
    }

    return {
      queuedJobsCount: queued.count ?? 0,
      processingJobsCount: processing.count ?? 0,
      oldestQueuedAgeMs: ageMs(
        (oldestQueued.data as { created_at: string } | null)?.created_at
      ),
      oldestProcessingAgeMs: ageMs(
        (oldestProcessing.data as { updated_at: string } | null)?.updated_at
      ),
      activeRoomsCount: activeRooms.count ?? 0,
    };
  }

  /** Stamp drain_ended_at + drain_duration_ms for draws finalized in one drain tick. */
  async patchDrainCycleTiming(
    drainStartedAt: string,
    drainEndedAt: string,
    drainDurationMs: number
  ): Promise<void> {
    const { error } = await this.db
      .from("draws")
      .update({
        drain_ended_at: drainEndedAt,
        drain_duration_ms: drainDurationMs,
      })
      .eq("drain_started_at", drainStartedAt);
    if (error) fail("patchDrainCycleTiming", error.message);
  }
}
