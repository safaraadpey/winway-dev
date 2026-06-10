import type { SupabaseAdmin } from "../db/supabase-admin.js";
import { mapJoinsInWorkCycleByTemplate } from "../domain/dev-players/schedulerCycle.js";
import type {
  DevPlayerConfigSnapshot,
  DevPlayerJoinPresetSnapshot,
  DevPlayerSettingsSnapshot,
  DevPlayerSettingsWithRuntime,
  DevRoomScheduleJob,
  PlayWindow,
  RoomTemplateSnapshot,
  ScheduleInsertRow,
  TemplateLimitSnapshot,
} from "../domain/dev-players/types.js";

function fail(op: string, message: string): never {
  throw new Error(`devPlayerRepo ${op}: ${message}`);
}

function mapPlayWindows(raw: unknown): PlayWindow[] {
  if (!Array.isArray(raw)) return [];
  const windows: PlayWindow[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const start = String((item as PlayWindow).start ?? "").trim();
    const end = String((item as PlayWindow).end ?? "").trim();
    if (start && end) windows.push({ start, end });
  }
  return windows;
}

export class DevPlayerRepo {
  constructor(private readonly db: SupabaseAdmin) {}

  private mapSettingsRow(data: Record<string, unknown>): DevPlayerSettingsSnapshot {
    return {
      systemEnabled: Boolean(data.system_enabled),
      schedulerEnabled: Boolean(data.scheduler_enabled),
      schedulerTickIntervalSeconds: Number(data.scheduler_tick_interval_seconds ?? 60),
      processorTickIntervalSeconds: Number(data.processor_tick_interval_seconds ?? 60),
      schedulerPauseAfterSeconds:
        data.scheduler_pause_after_seconds === null ||
        data.scheduler_pause_after_seconds === undefined
          ? null
          : Number(data.scheduler_pause_after_seconds),
      schedulerPauseDurationSeconds:
        data.scheduler_pause_duration_seconds === null ||
        data.scheduler_pause_duration_seconds === undefined
          ? null
          : Number(data.scheduler_pause_duration_seconds),
      timezone: String(data.timezone || "Asia/Tehran"),
      activeJoinPresetId: data.active_join_preset_id
        ? String(data.active_join_preset_id)
        : null,
    };
  }

  private mapRuntimeRow(data: Record<string, unknown>) {
    const rawNextJoin = data.scheduler_next_join_at_by_template;
    const nextJoinAtByTemplate: Record<string, string> = {};
    if (rawNextJoin && typeof rawNextJoin === "object" && !Array.isArray(rawNextJoin)) {
      for (const [templateId, value] of Object.entries(rawNextJoin as Record<string, unknown>)) {
        if (typeof value === "string" && value.trim()) {
          nextJoinAtByTemplate[templateId] = value;
        }
      }
    }

    const phase = data.scheduler_cycle_phase === "pause" ? "pause" : "work";
    return {
      cyclePhase: phase as "work" | "pause",
      cyclePhaseEndsAt:
        data.scheduler_cycle_phase_ends_at === null ||
        data.scheduler_cycle_phase_ends_at === undefined
          ? null
          : String(data.scheduler_cycle_phase_ends_at),
      nextJoinAtByTemplate,
      joinsInWorkCycleByTemplate: mapJoinsInWorkCycleByTemplate(
        data.scheduler_joins_in_work_cycle_by_template
      ),
    };
  }

  async getSettings(): Promise<DevPlayerSettingsSnapshot | null> {
    const bundle = await this.getSettingsWithRuntime();
    return bundle?.settings ?? null;
  }

  async getSettingsWithRuntime(): Promise<DevPlayerSettingsWithRuntime | null> {
    const { data, error } = await this.db
      .from("dev_player_settings")
      .select(
        "system_enabled, scheduler_enabled, scheduler_tick_interval_seconds, processor_tick_interval_seconds, scheduler_pause_after_seconds, scheduler_pause_duration_seconds, timezone, active_join_preset_id, scheduler_cycle_phase, scheduler_cycle_phase_ends_at, scheduler_next_join_at_by_template, scheduler_joins_in_work_cycle_by_template"
      )
      .eq("id", true)
      .maybeSingle();
    if (error) fail("getSettingsWithRuntime", error.message);
    if (!data) return null;
    return {
      settings: this.mapSettingsRow(data as Record<string, unknown>),
      runtime: this.mapRuntimeRow(data as Record<string, unknown>),
    };
  }

  async updateSchedulerRuntime(args: {
    cyclePhase?: "work" | "pause";
    cyclePhaseEndsAt?: string | null;
    nextJoinAtByTemplate?: Record<string, string>;
    joinsInWorkCycleByTemplate?: Record<string, number>;
  }): Promise<void> {
    const update: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (args.cyclePhase !== undefined) update.scheduler_cycle_phase = args.cyclePhase;
    if (args.cyclePhaseEndsAt !== undefined) {
      update.scheduler_cycle_phase_ends_at = args.cyclePhaseEndsAt;
    }
    if (args.nextJoinAtByTemplate !== undefined) {
      update.scheduler_next_join_at_by_template = args.nextJoinAtByTemplate;
    }
    if (args.joinsInWorkCycleByTemplate !== undefined) {
      update.scheduler_joins_in_work_cycle_by_template = args.joinsInWorkCycleByTemplate;
    }

    const { error } = await this.db
      .from("dev_player_settings")
      .update(update)
      .eq("id", true);
    if (error) fail("updateSchedulerRuntime", error.message);
  }

  async getOccupiedDevPlayerIds(devPlayerUserIds: string[]): Promise<Set<string>> {
    const occupied = new Set<string>();
    if (devPlayerUserIds.length === 0) return occupied;

    const { data: rooms, error: roomsError } = await this.db
      .from("rooms")
      .select("id")
      .in("status", ["waiting", "playing"]);
    if (roomsError) fail("getOccupiedDevPlayerIds", roomsError.message);

    const roomIds = (rooms ?? []).map((row) => String(row.id));
    if (roomIds.length === 0) return occupied;

    const { data: tickets, error: ticketsError } = await this.db
      .from("tickets")
      .select("player_user_id")
      .in("room_id", roomIds)
      .in("player_user_id", devPlayerUserIds)
      .in("reservation_status", ["reserved", "confirmed", "consumed"]);
    if (ticketsError) fail("getOccupiedDevPlayerIds", ticketsError.message);

    for (const ticket of tickets ?? []) {
      occupied.add(String(ticket.player_user_id));
    }
    return occupied;
  }

  async getJoinPreset(presetId: string): Promise<DevPlayerJoinPresetSnapshot | null> {
    const { data, error } = await this.db
      .from("dev_player_join_presets")
      .select(
        "id, name, play_windows, template_room_limit_enabled_ids, min_wallet_balance, exclude_vip, exclude_tournament, auto_approve_schedules"
      )
      .eq("id", presetId)
      .maybeSingle();
    if (error) fail("getJoinPreset", error.message);
    if (!data) return null;
    return {
      id: String(data.id),
      name: data.name || "",
      playWindows: mapPlayWindows(data.play_windows),
      templateRoomLimitEnabledIds: Array.isArray(data.template_room_limit_enabled_ids)
        ? data.template_room_limit_enabled_ids.map(String)
        : [],
      minWalletBalance: Number(data.min_wallet_balance ?? 0),
      excludeVip: Boolean(data.exclude_vip),
      excludeTournament: Boolean(data.exclude_tournament),
      autoApproveSchedules: Boolean(data.auto_approve_schedules),
    };
  }

  async getEnabledPlayerConfigs(): Promise<DevPlayerConfigSnapshot[]> {
    const { data, error } = await this.db
      .from("dev_player_configs")
      .select("user_id, play_windows, min_room_price, max_room_price, max_ticket_count")
      .eq("is_enabled", true);
    if (error) fail("getEnabledPlayerConfigs", error.message);
    return (data ?? []).map((row) => ({
      userId: String(row.user_id),
      playWindows: mapPlayWindows(row.play_windows),
      minRoomPrice:
        row.min_room_price === null || row.min_room_price === undefined
          ? null
          : Number(row.min_room_price),
      maxRoomPrice:
        row.max_room_price === null || row.max_room_price === undefined
          ? null
          : Number(row.max_room_price),
      maxTicketCount: Number(row.max_ticket_count ?? 1),
    }));
  }

  async getPresetTemplateLimits(presetId: string): Promise<TemplateLimitSnapshot[]> {
    const { data, error } = await this.db
      .from("dev_player_join_preset_template_limits")
      .select(
        "template_id, min_active_rooms, max_active_rooms, join_interval_seconds, max_joins_per_tick, min_normal_players_per_room, max_dev_players_per_room"
      )
      .eq("preset_id", presetId);
    if (error) fail("getPresetTemplateLimits", error.message);
    return (data ?? []).map((row) => ({
      templateId: String(row.template_id),
      minActiveRooms:
        row.min_active_rooms === null || row.min_active_rooms === undefined
          ? null
          : Number(row.min_active_rooms),
      maxActiveRooms:
        row.max_active_rooms === null || row.max_active_rooms === undefined
          ? null
          : Number(row.max_active_rooms),
      joinIntervalSeconds: Number(row.join_interval_seconds ?? 300),
      maxJoinsPerTick: Number(row.max_joins_per_tick ?? 10),
      minNormalPlayersPerRoom:
        row.min_normal_players_per_room === null ||
        row.min_normal_players_per_room === undefined
          ? null
          : Number(row.min_normal_players_per_room),
      maxDevPlayersPerRoom:
        row.max_dev_players_per_room === null || row.max_dev_players_per_room === undefined
          ? null
          : Number(row.max_dev_players_per_room),
    }));
  }

  async getJoinTargetRoomPlayerCounts(
    templateIds: string[],
    devPlayerUserIds: string[]
  ): Promise<Map<string, { devPlayers: number; normalPlayers: number }>> {
    const counts = new Map<string, { devPlayers: number; normalPlayers: number }>();
    for (const templateId of templateIds) {
      counts.set(templateId, { devPlayers: 0, normalPlayers: 0 });
    }
    if (templateIds.length === 0) return counts;

    const { data: rooms, error } = await this.db
      .from("rooms")
      .select("id, room_template_id, created_at")
      .in("room_template_id", templateIds)
      .eq("status", "waiting")
      .order("created_at", { ascending: true });
    if (error) fail("getJoinTargetRoomPlayerCounts", error.message);

    const oldestRoomByTemplate = new Map<string, string>();
    for (const room of rooms ?? []) {
      const templateId = String(room.room_template_id);
      if (!oldestRoomByTemplate.has(templateId)) {
        oldestRoomByTemplate.set(templateId, String(room.id));
      }
    }

    const roomIds = [...oldestRoomByTemplate.values()];
    if (roomIds.length === 0) return counts;

    const { data: tickets, error: ticketsError } = await this.db
      .from("tickets")
      .select("room_id, player_user_id")
      .in("room_id", roomIds)
      .in("reservation_status", ["reserved", "confirmed", "consumed"]);
    if (ticketsError) fail("getJoinTargetRoomPlayerCounts", ticketsError.message);

    const devIdSet = new Set(devPlayerUserIds.map(String));
    const devPlayersByRoom = new Map<string, Set<string>>();
    const normalPlayersByRoom = new Map<string, Set<string>>();

    for (const ticket of tickets ?? []) {
      const roomId = String(ticket.room_id);
      const userId = String(ticket.player_user_id);
      const targetMap = devIdSet.has(userId) ? devPlayersByRoom : normalPlayersByRoom;
      const playersInRoom = targetMap.get(roomId) ?? new Set<string>();
      playersInRoom.add(userId);
      targetMap.set(roomId, playersInRoom);
    }

    for (const [templateId, roomId] of oldestRoomByTemplate) {
      counts.set(templateId, {
        devPlayers: devPlayersByRoom.get(roomId)?.size ?? 0,
        normalPlayers: normalPlayersByRoom.get(roomId)?.size ?? 0,
      });
    }

    return counts;
  }

  async getTemplatesByIds(templateIds: string[]): Promise<RoomTemplateSnapshot[]> {
    if (templateIds.length === 0) return [];
    const { data, error } = await this.db
      .from("room_templates")
      .select("id, name, price, vip, room_type, status, max_cards_per_player")
      .in("id", templateIds);
    if (error) fail("getTemplatesByIds", error.message);
    return (data ?? []).map((row) => ({
      id: String(row.id),
      name: row.name || "",
      price: Number(row.price ?? 0),
      vip: Boolean(row.vip),
      roomType: row.room_type || "normal",
      status: row.status || "active",
      maxCardsPerPlayer: Math.max(1, Number(row.max_cards_per_player ?? 1)),
    }));
  }

  async getActiveRoomCountsByTemplate(
    templateIds: string[]
  ): Promise<Map<string, number>> {
    const counts = new Map<string, number>();
    if (templateIds.length === 0) return counts;

    const { data, error } = await this.db
      .from("rooms")
      .select("room_template_id")
      .in("room_template_id", templateIds)
      .in("status", ["waiting", "playing"]);
    if (error) fail("getActiveRoomCountsByTemplate", error.message);

    for (const id of templateIds) counts.set(id, 0);
    for (const row of data ?? []) {
      const templateId = String(row.room_template_id);
      counts.set(templateId, (counts.get(templateId) ?? 0) + 1);
    }
    return counts;
  }

  async getLastScheduleAtByTemplate(
    templateIds: string[]
  ): Promise<Map<string, string>> {
    const map = new Map<string, string>();
    if (templateIds.length === 0) return map;

    const { data, error } = await this.db
      .from("dev_room_schedules")
      .select("room_template_id, created_at")
      .in("room_template_id", templateIds)
      .order("created_at", { ascending: false });
    if (error) fail("getLastScheduleAtByTemplate", error.message);

    for (const row of data ?? []) {
      const templateId = String(row.room_template_id);
      if (!map.has(templateId)) {
        map.set(templateId, String(row.created_at));
      }
    }
    return map;
  }

  async getWalletBalance(userId: string): Promise<number> {
    const { data, error } = await this.db
      .from("wallets")
      .select("balance")
      .eq("user_id", userId)
      .maybeSingle();
    if (error) fail("getWalletBalance", error.message);
    return Number(data?.balance ?? 0);
  }

  async hasPendingSchedule(userId: string, templateId: string): Promise<boolean> {
    const { count, error } = await this.db
      .from("dev_room_schedules")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .eq("room_template_id", templateId)
      .in("status", ["draft", "approved", "processing"]);
    if (error) fail("hasPendingSchedule", error.message);
    return (count ?? 0) > 0;
  }

  async insertSchedules(rows: ScheduleInsertRow[]): Promise<number> {
    if (rows.length === 0) return 0;
    const nowIso = new Date().toISOString();
    const { data, error } = await this.db
      .from("dev_room_schedules")
      .insert(
        rows.map((row) => ({
          user_id: row.userId,
          room_template_id: row.roomTemplateId,
          ticket_count: row.ticketCount,
          scheduled_at: row.scheduledAt,
          status: row.status,
          created_by: row.createdBy,
          created_at: nowIso,
          updated_at: nowIso,
        }))
      )
      .select("id");
    if (error) fail("insertSchedules", error.message);
    return data?.length ?? 0;
  }

  async requeueStuckProcessingSchedules(
    stuckTimeoutSeconds: number,
    now: Date = new Date()
  ): Promise<number> {
    const cutoffIso = new Date(now.getTime() - stuckTimeoutSeconds * 1000).toISOString();
    const nowIso = now.toISOString();
    const { data, error } = await this.db
      .from("dev_room_schedules")
      .update({
        status: "approved",
        last_error: "requeued: processing timeout",
        updated_at: nowIso,
      })
      .eq("status", "processing")
      .lt("updated_at", cutoffIso)
      .select("id");
    if (error) fail("requeueStuckProcessingSchedules", error.message);
    return data?.length ?? 0;
  }

  async pickSchedules(limit: number): Promise<DevRoomScheduleJob[]> {
    const { data, error } = await this.db.rpc("fn_pick_dev_room_schedules", {
      p_limit: limit,
    });
    if (error) fail("pickSchedules", error.message);
    return (data ?? []).map((row: DevRoomScheduleJob) => ({
      id: String(row.id),
      user_id: String(row.user_id),
      room_template_id: String(row.room_template_id),
      ticket_count: Number(row.ticket_count),
    }));
  }

  async systemJoinOrCreateRoom(args: {
    userId: string;
    templateId: string;
    cardCount: number;
  }): Promise<{ roomId: string | null; ticketIds: string[] }> {
    const { data, error } = await this.db.rpc("fn_system_join_or_create_room", {
      p_user_id: args.userId,
      p_template_id: args.templateId,
      p_card_count: args.cardCount,
      p_password: null,
    });
    if (error) fail("systemJoinOrCreateRoom", error.message);
    const row = Array.isArray(data) ? data[0] : data;
    return {
      roomId: row?.room_id ? String(row.room_id) : null,
      ticketIds: Array.isArray(row?.ticket_ids)
        ? row.ticket_ids.map(String)
        : [],
    };
  }

  async markScheduleDone(args: {
    scheduleId: string;
    roomId: string | null;
    ticketIds: string[];
    processedAt: string;
  }): Promise<void> {
    const { error } = await this.db
      .from("dev_room_schedules")
      .update({
        status: "done",
        processed_at: args.processedAt,
        updated_at: args.processedAt,
        result_room_id: args.roomId,
        result_ticket_ids: args.ticketIds,
        last_error: null,
      })
      .eq("id", args.scheduleId);
    if (error) fail("markScheduleDone", error.message);
  }

  async markScheduleFailed(args: {
    scheduleId: string;
    error: string;
    processedAt: string;
  }): Promise<void> {
    const { error } = await this.db
      .from("dev_room_schedules")
      .update({
        status: "failed",
        processed_at: args.processedAt,
        updated_at: args.processedAt,
        last_error: args.error,
      })
      .eq("id", args.scheduleId);
    if (error) fail("markScheduleFailed", error.message);
  }
}
