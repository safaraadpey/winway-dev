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
  RoomClaimResult,
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
      .order("created_at", { ascending: true })
      .limit(limit);
    if (error) fail("getWaitingRoomsAtMaxCapacity", error.message);
    return (data ?? []) as RoomRow[];
  }

  async getTemplateMaxPlayersMap(
    templateIds: string[]
  ): Promise<Map<string, number | null>> {
    const out = new Map<string, number | null>();
    if (templateIds.length === 0) return out;

    const { data, error } = await this.db
      .from("room_templates")
      .select("id, max_players")
      .in("id", templateIds);
    if (error) fail("getTemplateMaxPlayersMap", error.message);

    for (const row of (data ?? []) as { id: string; max_players: number | null }[]) {
      out.set(row.id, row.max_players ?? null);
    }
    return out;
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
        "id,status,currency,room_seed,room_template_id,next_draw_at,starts_at,waiting_started_at,min_players,max_players,countdown_sec,first_line_draw_number,line_reward_percentage,full_reward_percentage,ding_per_number,ding_settle_mode,gameplay_persist_mode,finalization_sha256,finalization_contract_version,ding_settled_at,ding_settlement_key,prize_paid_at,meta,engine_owner_id,engine_lease_until,engine_lease_epoch"
      )
      .eq("id", roomId)
      .maybeSingle();
    if (error) fail("getRoom", error.message);
    return (data as RoomRow) ?? null;
  }

  async setRoomPlaying(roomId: string, nextDrawAtIso: string, nowIso: string): Promise<boolean> {
    const { data, error } = await this.db.rpc("rpc_promote_waiting_room_to_playing", {
      p_room: roomId,
      p_next_draw_at: nextDrawAtIso,
      p_now: nowIso,
    });
    if (error) fail("setRoomPlaying", error.message);
    return data === true;
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
  ): Promise<RoomClaimResult> {
    const { data, error } = await this.db.rpc("rpc_claim_game_room", {
      p_room_id: roomId,
      p_owner_id: ownerId,
      p_lease_seconds: leaseSeconds,
    });
    if (error) fail("rpc_claim_game_room", error.message);
    if (data === true) {
      return { claimed: true, leaseEpoch: null };
    }
    if (data === false) {
      return { claimed: false, leaseEpoch: null };
    }
    const payload =
      typeof data === "string"
        ? (JSON.parse(data) as Record<string, unknown>)
        : (data as Record<string, unknown> | null);
    const claimed = payload?.claimed === true;
    const rawEpoch = payload?.lease_epoch;
    const leaseEpoch =
      rawEpoch == null
        ? null
        : typeof rawEpoch === "number"
          ? rawEpoch
          : Number(rawEpoch);
    return { claimed, leaseEpoch: Number.isFinite(leaseEpoch) ? leaseEpoch : null };
  }

  /** Renew an owned lease (heartbeat). Returns false if ownership was lost. */
  async renewLease(
    roomId: string,
    ownerId: string,
    leaseSeconds: number,
    leaseEpoch?: number | null
  ): Promise<boolean> {
    const { data, error } = await this.db.rpc("rpc_renew_game_room_lease", {
      p_room_id: roomId,
      p_owner_id: ownerId,
      p_lease_seconds: leaseSeconds,
      p_lease_epoch: leaseEpoch ?? null,
    });
    if (error) fail("rpc_renew_game_room_lease", error.message);
    return data === true;
  }

  /** Release an owned lease (graceful handoff). */
  async releaseRoom(
    roomId: string,
    ownerId: string,
    leaseEpoch?: number | null
  ): Promise<boolean> {
    const { data, error } = await this.db.rpc("rpc_release_game_room", {
      p_room_id: roomId,
      p_owner_id: ownerId,
      p_lease_epoch: leaseEpoch ?? null,
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
    nextDrawAtIso: string;
    ownerId: string;
    drawIntervalSec: number;
    actorDueAtIso?: string | null;
    leaseEpoch?: number | null;
    maxUnprocessed?: number;
  }): Promise<OwnerInsertResult> {
    if (!args.nowIso?.trim()) {
      fail("insertDrawIfReadyForOwner", "nowIso (drawnAtIso) is required");
    }
    if (!args.nextDrawAtIso?.trim()) {
      fail("insertDrawIfReadyForOwner", "nextDrawAtIso is required");
    }
    const { data, error } = await this.db.rpc(
      "rpc_insert_draw_if_ready_owner_guard",
      {
        p_room_id: args.roomId,
        p_number: args.number,
        p_now: args.nowIso,
        p_owner_id: args.ownerId,
        p_draw_interval_sec: args.drawIntervalSec,
        p_actor_due_at: args.actorDueAtIso ?? null,
        p_lease_epoch: args.leaseEpoch ?? null,
        p_next_draw_at: args.nextDrawAtIso,
        p_max_unprocessed: args.maxUnprocessed ?? 2,
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

  /** Count draws with processed_at IS NULL (persist backpressure gate). */
  async countUnprocessedDraws(roomId: string): Promise<number> {
    const { count, error } = await this.db
      .from("draws")
      .select("*", { count: "exact", head: true })
      .eq("room_id", roomId)
      .is("processed_at", null);
    if (error) fail("countUnprocessedDraws", error.message);
    return count ?? 0;
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
    ownerId?: string | null;
    leaseEpoch?: number | null;
    deferDing?: boolean;
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
      p_owner_id: args.ownerId ?? null,
      p_lease_epoch: args.leaseEpoch ?? null,
      p_defer_ding: args.deferDing === true,
    });
    if (error) fail("rpc_finalize_engine_draw_job", error.message);
    return typeof data === "number" ? data : Number(data ?? 0);
  }

  async pickDingApplyJobs(limit: number): Promise<
    {
      id: number;
      draw_id: string;
      room_id: string;
      draw_number: number;
      ding_per_card: number;
      credits: { user_id: string; amount: number; matched_cards?: number }[];
      status: string;
      attempts: number;
      created_at: string;
      updated_at: string;
    }[]
  > {
    const { data, error } = await this.db.rpc("rpc_pick_ding_apply_jobs", {
      p_limit: limit,
    });
    if (error) fail("rpc_pick_ding_apply_jobs", error.message);
    return (data ?? []) as {
      id: number;
      draw_id: string;
      room_id: string;
      draw_number: number;
      ding_per_card: number;
      credits: { user_id: string; amount: number; matched_cards?: number }[];
      status: string;
      attempts: number;
      created_at: string;
      updated_at: string;
    }[];
  }

  async completeDingApplyJob(args: {
    jobId: number;
    success: boolean;
    error?: string;
    maxAttempts?: number;
  }): Promise<void> {
    const { error } = await this.db.rpc("rpc_complete_ding_apply_job", {
      p_job_id: args.jobId,
      p_success: args.success,
      p_error: args.error ?? null,
      p_max_attempts: args.maxAttempts ?? 10,
    });
    if (error) fail("rpc_complete_ding_apply_job", error.message);
  }

  async reapStaleDingApplyJobs(
    staleSec: number
  ): Promise<{ requeued: number; completed: number }> {
    const { data, error } = await this.db.rpc("rpc_reap_stale_ding_apply_jobs", {
      p_stale_sec: staleSec,
    });
    if (error) fail("rpc_reap_stale_ding_apply_jobs", error.message);
    const row = (Array.isArray(data) ? data[0] : data) as
      | { requeued: number; completed: number }
      | undefined;
    return {
      requeued: Number(row?.requeued ?? 0),
      completed: Number(row?.completed ?? 0),
    };
  }

  /** Async Ding queue + processed/ding gap snapshot for production health logs. */
  async fetchDingApplyHealthSnapshot(args: {
    staleProcessingSec: number;
    staleQueuedSec: number;
  }): Promise<{
    queuedCount: number;
    processingCount: number;
    failedCount: number;
    oldestQueuedAgeMs: number;
    oldestProcessingAgeMs: number;
    staleQueuedCount: number;
    staleProcessingCount: number;
    processedDingGapCount: number;
    historicalGapCount: number;
  }> {
    const now = Date.now();
    const ageMs = (iso: string | null | undefined): number =>
      iso == null ? 0 : Math.max(0, now - Date.parse(iso));
    const staleIso = (sec: number): string =>
      new Date(now - sec * 1000).toISOString();

    const [
      queued,
      processing,
      failed,
      oldestQueued,
      oldestProcessing,
      staleQueued,
      staleProcessing,
      processedDingGap,
      historicalGap,
    ] = await Promise.all([
      this.db
        .from("ding_apply_jobs")
        .select("id", { count: "exact", head: true })
        .eq("status", "queued"),
      this.db
        .from("ding_apply_jobs")
        .select("id", { count: "exact", head: true })
        .eq("status", "processing"),
      this.db
        .from("ding_apply_jobs")
        .select("id", { count: "exact", head: true })
        .eq("status", "failed"),
      this.db
        .from("ding_apply_jobs")
        .select("created_at")
        .eq("status", "queued")
        .order("created_at", { ascending: true })
        .limit(1)
        .maybeSingle(),
      this.db
        .from("ding_apply_jobs")
        .select("updated_at")
        .eq("status", "processing")
        .order("updated_at", { ascending: true })
        .limit(1)
        .maybeSingle(),
      this.db
        .from("ding_apply_jobs")
        .select("id", { count: "exact", head: true })
        .eq("status", "queued")
        .lt("created_at", staleIso(args.staleQueuedSec)),
      this.db
        .from("ding_apply_jobs")
        .select("id", { count: "exact", head: true })
        .eq("status", "processing")
        .lt("updated_at", staleIso(args.staleProcessingSec)),
      this.db
        .from("draws")
        .select("id", { count: "exact", head: true })
        .not("processed_at", "is", null)
        .is("ding_aggregated_at", null),
      this.db
        .from("draws")
        .select("room_id,number")
        .not("processed_at", "is", null)
        .is("ding_aggregated_at", null)
        .limit(100),
    ]);

    if (queued.error) fail("fetchDingApplyHealthSnapshot:queued", queued.error.message);
    if (processing.error) {
      fail("fetchDingApplyHealthSnapshot:processing", processing.error.message);
    }
    if (failed.error) fail("fetchDingApplyHealthSnapshot:failed", failed.error.message);
    if (oldestQueued.error) {
      fail("fetchDingApplyHealthSnapshot:oldestQueued", oldestQueued.error.message);
    }
    if (oldestProcessing.error) {
      fail(
        "fetchDingApplyHealthSnapshot:oldestProcessing",
        oldestProcessing.error.message
      );
    }
    if (staleQueued.error) {
      fail("fetchDingApplyHealthSnapshot:staleQueued", staleQueued.error.message);
    }
    if (staleProcessing.error) {
      fail(
        "fetchDingApplyHealthSnapshot:staleProcessing",
        staleProcessing.error.message
      );
    }
    if (processedDingGap.error) {
      fail(
        "fetchDingApplyHealthSnapshot:processedDingGap",
        processedDingGap.error.message
      );
    }

    let historicalGapCount = 0;
    if (historicalGap.error) {
      fail(
        "fetchDingApplyHealthSnapshot:historicalGap",
        historicalGap.error.message
      );
    }
    for (const row of (historicalGap.data ?? []) as {
      room_id: string;
      number: number;
    }[]) {
      const { count, error: jobErr } = await this.db
        .from("ding_apply_jobs")
        .select("id", { count: "exact", head: true })
        .eq("room_id", row.room_id)
        .eq("draw_number", row.number);
      if (jobErr) {
        fail("fetchDingApplyHealthSnapshot:historicalGapJob", jobErr.message);
      }
      if ((count ?? 0) === 0) historicalGapCount += 1;
    }

    return {
      queuedCount: queued.count ?? 0,
      processingCount: processing.count ?? 0,
      failedCount: failed.count ?? 0,
      oldestQueuedAgeMs: ageMs(
        (oldestQueued.data as { created_at: string } | null)?.created_at
      ),
      oldestProcessingAgeMs: ageMs(
        (oldestProcessing.data as { updated_at: string } | null)?.updated_at
      ),
      staleQueuedCount: staleQueued.count ?? 0,
      staleProcessingCount: staleProcessing.count ?? 0,
      processedDingGapCount: processedDingGap.count ?? 0,
      historicalGapCount,
    };
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

  /** Sync cutover flag so SQL room create stamps room_level when enabled. */
  async syncDingRoomSettleRuntimeFlag(enabled: boolean): Promise<void> {
    const { error } = await this.db.from("app_runtime_flags").upsert({
      id: true,
      ding_room_settle_enabled: enabled,
      updated_at: new Date().toISOString(),
    });
    if (error) fail("syncDingRoomSettleRuntimeFlag", error.message);
  }

  /** Sync manifest_ram canary flag (default OFF — new rooms stay per_draw). */
  async syncGameplayManifestRamRuntimeFlag(enabled: boolean): Promise<void> {
    const { error } = await this.db.from("app_runtime_flags").upsert({
      id: true,
      gameplay_manifest_ram_enabled: enabled,
      updated_at: new Date().toISOString(),
    });
    if (error) fail("syncGameplayManifestRamRuntimeFlag", error.message);
  }

  /** Snapshot for R8B-2 legacy draw-processor config gate (fail-closed disable). */
  async fetchLegacyDrawProcessorGateSnapshot(): Promise<{
    activePerDrawRooms: number;
    drawJobsQueued: number;
    drawJobsProcessing: number;
    drawJobsFailed: number;
    terminalManifestRamDrawJobsPending: number;
  }> {
    const [activeRoomsRes, queuedRes, processingRes, failedRes] =
      await Promise.all([
        this.db
          .from("rooms")
          .select("id", { count: "exact", head: true })
          .eq("gameplay_persist_mode", "per_draw")
          .in("status", ["waiting", "playing", "settling"]),
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
          .select("id", { count: "exact", head: true })
          .eq("status", "failed"),
      ]);

    if (activeRoomsRes.error) {
      fail(
        "fetchLegacyDrawProcessorGateSnapshot:activeRooms",
        activeRoomsRes.error.message
      );
    }
    if (queuedRes.error) {
      fail(
        "fetchLegacyDrawProcessorGateSnapshot:queued",
        queuedRes.error.message
      );
    }
    if (processingRes.error) {
      fail(
        "fetchLegacyDrawProcessorGateSnapshot:processing",
        processingRes.error.message
      );
    }
    if (failedRes.error) {
      fail(
        "fetchLegacyDrawProcessorGateSnapshot:failed",
        failedRes.error.message
      );
    }

    return {
      activePerDrawRooms: activeRoomsRes.count ?? 0,
      drawJobsQueued: queuedRes.count ?? 0,
      drawJobsProcessing: processingRes.count ?? 0,
      drawJobsFailed: failedRes.count ?? 0,
      terminalManifestRamDrawJobsPending: 0,
    };
  }

  /** Snapshot for R8B-2 legacy ding-processor config gate (fail-closed disable). */
  async fetchLegacyDingProcessorGateSnapshot(): Promise<{
    activePerDrawDingRooms: number;
    dingJobsQueued: number;
    dingJobsProcessing: number;
    dingJobsFailed: number;
  }> {
    const [activeRoomsRes, queuedRes, processingRes, failedRes] =
      await Promise.all([
        this.db
          .from("rooms")
          .select("id", { count: "exact", head: true })
          .in("status", ["playing", "settling"])
          .eq("ding_settle_mode", "per_draw"),
        this.db
          .from("ding_apply_jobs")
          .select("id", { count: "exact", head: true })
          .eq("status", "queued"),
        this.db
          .from("ding_apply_jobs")
          .select("id", { count: "exact", head: true })
          .eq("status", "processing"),
        this.db
          .from("ding_apply_jobs")
          .select("id", { count: "exact", head: true })
          .eq("status", "failed"),
      ]);

    if (activeRoomsRes.error) {
      fail(
        "fetchLegacyDingProcessorGateSnapshot:activeRooms",
        activeRoomsRes.error.message
      );
    }
    if (queuedRes.error) {
      fail(
        "fetchLegacyDingProcessorGateSnapshot:queued",
        queuedRes.error.message
      );
    }
    if (processingRes.error) {
      fail(
        "fetchLegacyDingProcessorGateSnapshot:processing",
        processingRes.error.message
      );
    }
    if (failedRes.error) {
      fail(
        "fetchLegacyDingProcessorGateSnapshot:failed",
        failedRes.error.message
      );
    }

    return {
      activePerDrawDingRooms: activeRoomsRes.count ?? 0,
      dingJobsQueued: queuedRes.count ?? 0,
      dingJobsProcessing: processingRes.count ?? 0,
      dingJobsFailed: failedRes.count ?? 0,
    };
  }

  /** True while per_draw jobs or active per_draw rooms remain (ding-processor drain gate). */
  async needsPerDrawDingProcessor(): Promise<boolean> {
    const [queueRes, roomRes] = await Promise.all([
      this.db
        .from("ding_apply_jobs")
        .select("id")
        .in("status", ["queued", "processing"])
        .limit(1),
      this.db
        .from("rooms")
        .select("id")
        .in("status", ["playing", "settling"])
        .eq("ding_settle_mode", "per_draw")
        .limit(1),
    ]);
    if (queueRes.error) fail("needsPerDrawDingProcessor:queue", queueRes.error.message);
    if (roomRes.error) fail("needsPerDrawDingProcessor:rooms", roomRes.error.message);
    return (queueRes.data?.length ?? 0) > 0 || (roomRes.data?.length ?? 0) > 0;
  }

  /** room_level rooms stuck in settling without Engine finish — Engine janitor input. */
  async listUnsettledRoomLevelRooms(limit: number): Promise<string[]> {
    const { data, error } = await this.db
      .from("rooms")
      .select("id")
      .eq("ding_settle_mode", "room_level")
      .eq("status", "settling")
      .is("ding_settled_at", null)
      .limit(Math.max(1, limit));
    if (error) fail("listUnsettledRoomLevelRooms", error.message);
    return (data ?? []).map((r) => (r as { id: string }).id);
  }

  async getGameManifestRow(roomId: string): Promise<{
    room_id: string;
    manifest_version: number;
    rng_algorithm: string;
    rng_version: string;
    payload: unknown;
    payload_sha256: string;
    created_at: string;
  } | null> {
    const { data, error } = await this.db
      .from("game_manifests")
      .select("room_id,manifest_version,rng_algorithm,rng_version,payload,payload_sha256,created_at")
      .eq("room_id", roomId)
      .maybeSingle();
    if (error) fail("getGameManifestRow", error.message);
    return (data as {
      room_id: string;
      manifest_version: number;
      rng_algorithm: string;
      rng_version: string;
      payload: unknown;
      payload_sha256: string;
      created_at: string;
    } | null) ?? null;
  }

  async getTicketRosterAudit(roomId: string): Promise<
    {
      id: string;
      created_at: string;
      cancelled_at: string | null;
      reservation_status: string;
    }[]
  > {
    const { data, error } = await this.db
      .from("tickets")
      .select("id,created_at,cancelled_at,reservation_status")
      .eq("room_id", roomId);
    if (error) fail("getTicketRosterAudit", error.message);
    return (data ?? []) as {
      id: string;
      created_at: string;
      cancelled_at: string | null;
      reservation_status: string;
    }[];
  }

  async getProcessedDrawSequence(roomId: string): Promise<number[]> {
    const { data, error } = await this.db
      .from("draws")
      .select("number,processed_at,created_at,id")
      .eq("room_id", roomId)
      .not("processed_at", "is", null)
      .order("processed_at", { ascending: true })
      .order("created_at", { ascending: true })
      .order("id", { ascending: true });
    if (error) fail("getProcessedDrawSequence", error.message);
    return ((data ?? []) as { number: number }[]).map((d) => d.number);
  }

  /** manifest_ram bulk history — insertion order, not processed_at timing. */
  async getDrawSequenceByInsertOrder(roomId: string): Promise<number[]> {
    const { data, error } = await this.db
      .from("draws")
      .select("number,id")
      .eq("room_id", roomId)
      .order("id", { ascending: true });
    if (error) fail("getDrawSequenceByInsertOrder", error.message);
    return ((data ?? []) as { number: number }[]).map((d) => d.number);
  }

  /**
   * manifest_ram audit — gameplay rows created strictly before final settlement.
   * Bulk history written at prize_paid_at is not counted (created_at >= boundary).
   */
  async countUnexpectedPreFinalizationWrites(roomId: string): Promise<number> {
    const { data: room, error: roomErr } = await this.db
      .from("rooms")
      .select("prize_paid_at,updated_at,status")
      .eq("id", roomId)
      .maybeSingle();
    if (roomErr) fail("countUnexpectedPreFinalizationWrites.room", roomErr.message);
    if (!room) return 0;

    const row = room as { prize_paid_at: string | null; updated_at: string; status: string };
    const boundary =
      row.prize_paid_at ?? (row.status === "finished" ? row.updated_at : null);
    if (!boundary) return 0;

    const [draws, drawJobs, dingJobs, ticketIds] = await Promise.all([
      this.db
        .from("draws")
        .select("id", { count: "exact", head: true })
        .eq("room_id", roomId)
        .lt("created_at", boundary),
      this.db
        .from("draw_jobs")
        .select("id", { count: "exact", head: true })
        .eq("room_id", roomId)
        .lt("created_at", boundary),
      this.db
        .from("ding_apply_jobs")
        .select("id", { count: "exact", head: true })
        .eq("room_id", roomId)
        .lt("created_at", boundary),
      this.db.from("tickets").select("id").eq("room_id", roomId),
    ]);

    if (draws.error) fail("countUnexpectedPreFinalizationWrites.draws", draws.error.message);
    if (drawJobs.error) fail("countUnexpectedPreFinalizationWrites.drawJobs", drawJobs.error.message);
    if (dingJobs.error) fail("countUnexpectedPreFinalizationWrites.dingJobs", dingJobs.error.message);
    if (ticketIds.error) fail("countUnexpectedPreFinalizationWrites.tickets", ticketIds.error.message);

    let marksBefore = 0;
    const ids = ((ticketIds.data ?? []) as { id: string }[]).map((t) => t.id);
    if (ids.length > 0) {
      const { count, error: marksErr } = await this.db
        .from("marks")
        .select("ticket_id", { count: "exact", head: true })
        .in("ticket_id", ids)
        .lt("created_at", boundary);
      if (marksErr) fail("countUnexpectedPreFinalizationWrites.marks", marksErr.message);
      marksBefore = count ?? 0;
    }

    return (
      (draws.count ?? 0) +
      marksBefore +
      (drawJobs.count ?? 0) +
      (dingJobs.count ?? 0)
    );
  }

  async getCardNumbersForPoolCardIds(
    poolCardIds: string[]
  ): Promise<{ pool_card_id: string; value: number; row_no: number; col_no: number }[]> {
    const out: { pool_card_id: string; value: number; row_no: number; col_no: number }[] = [];
    const unique = [...new Set(poolCardIds.map(String))];
    const page = 200;
    for (let i = 0; i < unique.length; i += page) {
      const chunk = unique.slice(i, i + page);
      const { data, error } = await this.db
        .from("card_numbers")
        .select("pool_card_id,value,row_no,col_no")
        .in("pool_card_id", chunk);
      if (error) fail("getCardNumbersForPoolCardIds", error.message);
      for (const row of data ?? []) {
        out.push({
          pool_card_id: String((row as { pool_card_id: string | number }).pool_card_id),
          value: Number((row as { value: number }).value),
          row_no: Number((row as { row_no: number }).row_no),
          col_no: Number((row as { col_no: number }).col_no),
        });
      }
    }
    return out;
  }

  async getDingTotalsByUser(roomId: string): Promise<{ userId: string; amount: number }[]> {
    const { data, error } = await this.db
      .from("ding_transactions")
      .select("user_id,amount")
      .eq("room_id", roomId);
    if (error) fail("getDingTotalsByUser", error.message);
    const totals = new Map<string, number>();
    for (const row of (data ?? []) as { user_id: string; amount: number | string }[]) {
      totals.set(row.user_id, (totals.get(row.user_id) ?? 0) + Number(row.amount));
    }
    return [...totals.entries()].map(([userId, amount]) => ({ userId, amount }));
  }

  async enqueueMissingGameReplayJobs(limit: number): Promise<number> {
    const { data, error } = await this.db.rpc("rpc_enqueue_missing_game_replay_jobs", {
      p_limit: limit,
    });
    if (error) fail("rpc_enqueue_missing_game_replay_jobs", error.message);
    return Number(data ?? 0);
  }

  async reapStaleGameReplayJobs(staleSec: number): Promise<number> {
    const { data, error } = await this.db.rpc("rpc_reap_stale_game_replay_jobs", {
      p_stale_sec: staleSec,
    });
    if (error) fail("rpc_reap_stale_game_replay_jobs", error.message);
    return Number(data ?? 0);
  }

  async pickGameReplayJobs(limit: number): Promise<
    { id: number; room_id: string; status: string; attempts: number; created_at: string }[]
  > {
    const { data, error } = await this.db.rpc("rpc_pick_game_replay_jobs", {
      p_limit: limit,
    });
    if (error) fail("rpc_pick_game_replay_jobs", error.message);
    return (data ?? []) as {
      id: number;
      room_id: string;
      status: string;
      attempts: number;
      created_at: string;
    }[];
  }

  async completeGameReplayJob(
    jobId: number,
    outcome: "MATCH" | "MISMATCH" | "ERROR",
    errorText?: string | null
  ): Promise<void> {
    const { error } = await this.db.rpc("rpc_complete_game_replay_job", {
      p_job_id: jobId,
      p_outcome: outcome,
      p_error: errorText ?? null,
    });
    if (error) fail("rpc_complete_game_replay_job", error.message);
  }

  async failGameReplayJob(jobId: number, errorText: string, maxAttempts = 8): Promise<void> {
    const { error } = await this.db.rpc("rpc_fail_game_replay_job", {
      p_job_id: jobId,
      p_error: errorText,
      p_max_attempts: maxAttempts,
    });
    if (error) fail("rpc_fail_game_replay_job", error.message);
  }

  async insertGameReplayAudit(row: {
    room_id: string;
    job_id: number | null;
    manifest_version: number | null;
    rng_version: string | null;
    outcome: "MATCH" | "MISMATCH" | "ERROR";
    draw_diff_count: number;
    mark_diff_count: number;
    result_diff_count: number;
    ding_diff: number;
    winner_mismatch: boolean;
    prize_mismatch: boolean;
    roster_mismatch?: boolean;
    draw_count_mismatch?: boolean;
    post_manifest_ticket_count?: number;
    unexpected_per_draw_writes?: number;
    finalization_checksum_mismatch?: boolean;
    stopped_reason: string | null;
    error_code: string | null;
    replay_duration_ms: number | null;
    details?: Record<string, unknown>;
  }): Promise<void> {
    const { error } = await this.db.from("game_replay_audits").insert({
      ...row,
      details: row.details ?? {},
    });
    if (error) fail("insertGameReplayAudit", error.message);
  }
}
