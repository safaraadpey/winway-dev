import type { SupabaseAdmin } from "../db/supabase-admin.js";
import { parseSchedulerBehaviorState } from "../domain/dev-players/behaviorState.js";
import { unionAllowedPricesFromProfiles } from "../domain/dev-players/profileTemplateUnion.js";
import {
  DEFAULT_TEMPLATE_JOIN_DELAY_MAX_SECONDS,
  normalizeJoinDelayMaxSeconds,
} from "../domain/dev-players/joinDelay.js";
import type {
  DevPlayerConfigSnapshot,
  DevPlayerJoinPresetSnapshot,
  DevPlayerSettingsSnapshot,
  DevPlayerSettingsWithRuntime,
  DevRoomScheduleJob,
  PlayWindow,
  RoomTemplateSnapshot,
  ScheduleInsertRow,
  ScheduleOutcomeCounts,
  SchedulerBehaviorState,
  TemplateLimitSnapshot,
} from "../domain/dev-players/types.js";

export interface EngineEnabledProfileSnapshot {
  id: string;
  playWindows: PlayWindow[];
  allowedPrices: number[];
}

function mapRoomTemplateRow(row: Record<string, unknown>): RoomTemplateSnapshot {
  return {
    id: String(row.id),
    name: String(row.name || ""),
    price: Number(row.price ?? 0),
    vip: Boolean(row.vip),
    roomType: String(row.room_type || "normal"),
    status: String(row.status || "active"),
    maxCardsPerPlayer: Math.max(1, Number(row.max_cards_per_player ?? 1)),
    maxPlayers:
      row.max_players === null || row.max_players === undefined
        ? null
        : Number(row.max_players),
  };
}

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

  async getSettings(): Promise<DevPlayerSettingsSnapshot | null> {
    const bundle = await this.getSettingsWithRuntime();
    return bundle?.settings ?? null;
  }

  async getSettingsWithRuntime(): Promise<DevPlayerSettingsWithRuntime | null> {
    const { data, error } = await this.db
      .from("dev_player_settings")
      .select(
        "system_enabled, scheduler_enabled, scheduler_tick_interval_seconds, processor_tick_interval_seconds, scheduler_pause_after_seconds, scheduler_pause_duration_seconds, timezone, active_join_preset_id, scheduler_behavior_state"
      )
      .eq("id", true)
      .maybeSingle();
    if (error) fail("getSettingsWithRuntime", error.message);
    if (!data) return null;
    return {
      settings: this.mapSettingsRow(data as Record<string, unknown>),
      behaviorState: parseSchedulerBehaviorState(
        (data as Record<string, unknown>).scheduler_behavior_state
      ),
    };
  }

  async updateSchedulerBehaviorState(state: SchedulerBehaviorState): Promise<void> {
    const { error } = await this.db
      .from("dev_player_settings")
      .update({
        scheduler_behavior_state: state,
        updated_at: new Date().toISOString(),
      })
      .eq("id", true);
    if (error) fail("updateSchedulerBehaviorState", error.message);
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

  async getEngineEnabledProfiles(): Promise<EngineEnabledProfileSnapshot[]> {
    const { data, error } = await this.db
      .from("dev_player_profiles")
      .select("id, play_windows, allowed_prices")
      .eq("engine_enabled", true);
    if (error) fail("getEngineEnabledProfiles", error.message);

    return (data ?? []).map((row) => ({
      id: String(row.id),
      playWindows: mapPlayWindows(row.play_windows),
      allowedPrices: Array.isArray(row.allowed_prices)
        ? row.allowed_prices.map((price: unknown) => Number(price))
        : [],
    }));
  }

  async getEnabledPlayerConfigs(): Promise<DevPlayerConfigSnapshot[]> {
    const { data, error } = await this.db
      .from("dev_player_profile_members")
      .select(
        "user_id, dev_player_profiles!inner(play_windows, allowed_prices, engine_enabled)"
      )
      .eq("dev_player_profiles.engine_enabled", true);
    if (error) fail("getEnabledPlayerConfigs", error.message);

    const byUserId = new Map<string, DevPlayerConfigSnapshot>();

    for (const row of data ?? []) {
      const userId = String(row.user_id);
      const profileRowRaw = (row as { dev_player_profiles?: unknown }).dev_player_profiles;
      const profileRow = (
        Array.isArray(profileRowRaw) ? profileRowRaw[0] : profileRowRaw
      ) as Record<string, unknown> | undefined;
      if (!profileRow || !Boolean(profileRow.engine_enabled)) continue;

      const snapshot = byUserId.get(userId) ?? { userId, profiles: [] };
      snapshot.profiles.push({
        playWindows: mapPlayWindows(profileRow.play_windows),
        allowedPrices: Array.isArray(profileRow.allowed_prices)
          ? profileRow.allowed_prices.map((price: unknown) => Number(price))
          : [],
      });
      byUserId.set(userId, snapshot);
    }

    return Array.from(byUserId.values()).filter((player) => player.profiles.length > 0);
  }

  async getTemplatesForEnabledProfiles(): Promise<RoomTemplateSnapshot[]> {
    const profiles = await this.getEngineEnabledProfiles();
    const allowedPrices = unionAllowedPricesFromProfiles(profiles);
    if (allowedPrices.length === 0) return [];

    const { data, error } = await this.db
      .from("room_templates")
      .select("id, name, price, vip, room_type, status, max_cards_per_player, max_players")
      .in("status", ["active", "draining"])
      .in("price", allowedPrices);
    if (error) fail("getTemplatesForEnabledProfiles", error.message);

    return (data ?? []).map((row) => mapRoomTemplateRow(row as Record<string, unknown>));
  }

  async getTemplateJoinDelaySettings(): Promise<Map<string, number>> {
    const { data, error } = await this.db
      .from("dev_player_template_join_settings")
      .select("template_id, join_delay_max_seconds");
    if (error) fail("getTemplateJoinDelaySettings", error.message);

    const settings = new Map<string, number>();
    for (const row of data ?? []) {
      settings.set(
        String(row.template_id),
        normalizeJoinDelayMaxSeconds(row.join_delay_max_seconds)
      );
    }
    return settings;
  }

  async hasPendingScheduleForTemplate(templateId: string): Promise<boolean> {
    const { count, error } = await this.db
      .from("dev_room_schedules")
      .select("id", { count: "exact", head: true })
      .eq("room_template_id", templateId)
      .in("status", ["draft", "approved", "processing"]);
    if (error) fail("hasPendingScheduleForTemplate", error.message);
    return (count ?? 0) > 0;
  }

  getJoinDelayMaxSeconds(templateId: string, settings: Map<string, number>): number {
    return settings.get(templateId) ?? DEFAULT_TEMPLATE_JOIN_DELAY_MAX_SECONDS;
  }

  async getPresetTemplateLimits(presetId: string): Promise<TemplateLimitSnapshot[]> {
    const { data, error } = await this.db
      .from("dev_player_join_preset_template_limits")
      .select(
        "template_id, min_active_rooms, max_active_rooms, join_interval_seconds, max_joins_per_tick, min_normal_players_per_room, max_dev_players_per_room, quick_fill_enabled"
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
      quickFillEnabled: Boolean(row.quick_fill_enabled),
    }));
  }

  async getWaitingRoomCountsByTemplate(
    templateIds: string[]
  ): Promise<Map<string, number>> {
    const counts = new Map<string, number>();
    if (templateIds.length === 0) return counts;
    for (const id of templateIds) counts.set(id, 0);

    const { data, error } = await this.db
      .from("rooms")
      .select("room_template_id")
      .in("room_template_id", templateIds)
      .eq("status", "waiting");
    if (error) fail("getWaitingRoomCountsByTemplate", error.message);

    for (const row of data ?? []) {
      const templateId = String(row.room_template_id);
      counts.set(templateId, (counts.get(templateId) ?? 0) + 1);
    }
    return counts;
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
      .select("id, name, price, vip, room_type, status, max_cards_per_player, max_players")
      .in("id", templateIds);
    if (error) fail("getTemplatesByIds", error.message);
    return (data ?? []).map((row) => mapRoomTemplateRow(row as Record<string, unknown>));
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

  async getScheduledUserIdsSince(
    templateId: string,
    sinceIso: string
  ): Promise<Set<string>> {
    const { data, error } = await this.db
      .from("dev_room_schedules")
      .select("user_id")
      .eq("room_template_id", templateId)
      .gte("created_at", sinceIso);
    if (error) fail("getScheduledUserIdsSince", error.message);
    return new Set((data ?? []).map((row) => String(row.user_id)));
  }

  async getScheduleOutcomeCountsSince(
    templateId: string,
    sinceIso: string
  ): Promise<ScheduleOutcomeCounts> {
    const { data, error } = await this.db
      .from("dev_room_schedules")
      .select("status")
      .eq("room_template_id", templateId)
      .gte("created_at", sinceIso)
      .in("status", ["done", "failed"]);
    if (error) fail("getScheduleOutcomeCountsSince", error.message);

    let succeeded = 0;
    let failed = 0;
    for (const row of data ?? []) {
      if (row.status === "done") succeeded += 1;
      else if (row.status === "failed") failed += 1;
    }
    return { succeeded, failed };
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
