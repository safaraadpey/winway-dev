import {
  generateWindowTimeline,
  LEO_BEHAVIOR_PROFILES,
  LEO_STAKE_TIERS,
  LEO_TIME_BANDS,
  type LeoBehaviorProfile,
  type LeoStakeTier,
  type LeoTimeBand,
} from "@dingmoney/leo-behavior-core";
import { connectPgWithRetry } from "@/lib/db/pgConnect";
import { pgPool } from "@/lib/pg";
import {
  LEO_PROFILE_LABELS,
  LEO_TIME_BAND_LABELS,
  type LeoOverview,
  type LeoPreviewPayload,
  type LeoPreviewResult,
  type LeoConfigPreset,
  type LeoSaveUserConfigPayload,
  type LeoSettings,
  type LeoBandCap,
  type LeoBandStakeCap,
  type LeoBandStakeCapInput,
  type LeoTemplateOption,
  type LeoUserConfig,
  type LeoUserDetail,
  type LeoUserListRow,
  type LeoLiveStats,
} from "@/src/types/leo";

const LOG_PREFIX = "[Leo]";

const CONFLICT_MESSAGE_FA =
  "این کاربر در Dev Player فعال است. برای فعال‌سازی لئو ابتدا Dev Player را غیرفعال کنید.";

function mapSettings(row: {
  system_enabled: boolean;
  scheduler_enabled: boolean;
  scheduler_tick_seconds: number;
  processor_tick_seconds: number;
  timezone: string;
  max_leo_players_per_waiting_room?: number;
  max_leo_cards_per_join?: number;
  updated_at: string | null;
}): LeoSettings {
  return {
    systemEnabled: row.system_enabled,
    schedulerEnabled: row.scheduler_enabled,
    schedulerTickSeconds: row.scheduler_tick_seconds,
    processorTickSeconds: row.processor_tick_seconds,
    timezone: row.timezone,
    maxLeoPlayersPerWaitingRoom: Number(row.max_leo_players_per_waiting_room ?? 3),
    maxLeoCardsPerJoin: Number(row.max_leo_cards_per_join ?? 0),
    updatedAt: row.updated_at,
  };
}

const BAND_ORDER: LeoTimeBand[] = [
  "midnight",
  "dawn",
  "morning",
  "noon",
  "afternoon",
  "evening",
];

type BandCapRow = {
  time_band: string;
  light_max_active_players: number;
  light_shuffle_enabled: boolean;
  medium_max_active_players: number;
  medium_shuffle_enabled: boolean;
  heavy_max_active_players: number;
  heavy_shuffle_enabled: boolean;
};

function emptyStake(stakeTier: LeoStakeTier, readyCount = 0, busyCount = 0): LeoBandStakeCap {
  return {
    stakeTier,
    maxActivePlayers: 0,
    shuffleEnabled: false,
    readyCount,
    busyCount,
  };
}

function mapBandCaps(
  rows: BandCapRow[],
  stats?: Map<string, { readyCount: number; busyCount: number }>
): LeoBandCap[] {
  const byBand = new Map(rows.map((row) => [row.time_band, row]));
  return BAND_ORDER.map((timeBand) => {
    const row = byBand.get(timeBand);
    const stakes: LeoBandStakeCap[] = LEO_STAKE_TIERS.map((stakeTier) => {
      const stat = stats?.get(`${timeBand}:${stakeTier}`);
      if (!row) return emptyStake(stakeTier, stat?.readyCount ?? 0, stat?.busyCount ?? 0);
      const maxActivePlayers =
        stakeTier === "light"
          ? Number(row.light_max_active_players ?? 0)
          : stakeTier === "medium"
            ? Number(row.medium_max_active_players ?? 0)
            : Number(row.heavy_max_active_players ?? 0);
      const shuffleEnabled =
        stakeTier === "light"
          ? row.light_shuffle_enabled === true
          : stakeTier === "medium"
            ? row.medium_shuffle_enabled === true
            : row.heavy_shuffle_enabled === true;
      return {
        stakeTier,
        maxActivePlayers,
        shuffleEnabled,
        readyCount: stat?.readyCount ?? 0,
        busyCount: stat?.busyCount ?? 0,
      };
    });
    return {
      timeBand,
      stakes,
      readyCount: stakes.reduce((sum, stake) => sum + stake.readyCount, 0),
      busyCount: stakes.reduce((sum, stake) => sum + stake.busyCount, 0),
    };
  });
}

function mapUserConfig(row: {
  user_id: string;
  is_enabled: boolean;
  active_time_bands: string[];
  behavior_profile: string;
  session_budget: string | number;
  hard_stop_loss: string | number;
  max_concurrent_tables?: string | number;
  preferred_template_ids: string[];
  random_template_ids: string[];
  applied_preset_name?: string | null;
  updated_at: string | null;
}): LeoUserConfig {
  return {
    userId: row.user_id,
    isEnabled: row.is_enabled,
    activeTimeBands: row.active_time_bands as LeoTimeBand[],
    behaviorProfile: row.behavior_profile as LeoBehaviorProfile,
    sessionBudget: Number(row.session_budget ?? 0),
    hardStopLoss: Number(row.hard_stop_loss ?? 0),
    maxConcurrentTables: Number(row.max_concurrent_tables ?? 0),
    preferredTemplateIds: row.preferred_template_ids ?? [],
    randomTemplateIds: row.random_template_ids ?? [],
    appliedPresetName: row.applied_preset_name?.trim() || null,
    updatedAt: row.updated_at,
  };
}

export async function checkDevPlayerConflict(
  client: Awaited<ReturnType<typeof connectPgWithRetry>>,
  userId: string
): Promise<boolean> {
  const { rows } = await client.query<{ active: boolean }>(
    `SELECT public.fn_user_has_active_dev_player($1::uuid) AS active`,
    [userId]
  );
  return rows[0]?.active === true;
}

export async function loadLeoOverview(): Promise<LeoOverview> {
  const client = await connectPgWithRetry(pgPool);

  try {
    const [settingsResult, enabledResult, pendingResult, bandCapResult, bandStatResult, liveStatsResult] =
      await Promise.all([
      client.query(
        `SELECT system_enabled, scheduler_enabled, scheduler_tick_seconds,
                processor_tick_seconds, timezone, max_leo_players_per_waiting_room,
                max_leo_cards_per_join, updated_at
           FROM public.leo_settings
          WHERE id = true`
      ),
      client.query<{ count: string }>(
        `SELECT COUNT(*)::text AS count FROM public.leo_user_configs WHERE is_enabled = true`
      ),
      client.query<{ count: string }>(
        `SELECT COUNT(*)::text AS count FROM public.leo_execution_queue WHERE status = 'pending'`
      ),
      client.query<BandCapRow>(
        `SELECT time_band,
                light_max_active_players, light_shuffle_enabled,
                medium_max_active_players, medium_shuffle_enabled,
                heavy_max_active_players, heavy_shuffle_enabled
           FROM public.leo_band_caps
          ORDER BY time_band`
      ),
      client.query<{
        time_band: string;
        stake_tier: string;
        ready_count: string;
        busy_count: string;
      }>(
        `WITH template_tier AS (
           SELECT id,
                  CASE
                    WHEN price < 50000 THEN 'light'
                    WHEN price < 200000 THEN 'medium'
                    ELSE 'heavy'
                  END AS stake_tier
             FROM public.room_templates
            WHERE status = 'active'
              AND COALESCE(room_type, 'normal') <> 'tournament'
         ),
         eligible AS (
           SELECT DISTINCT c.user_id, band.time_band, tt.stake_tier
             FROM public.leo_user_configs c
             CROSS JOIN LATERAL unnest(c.active_time_bands) AS band(time_band)
             CROSS JOIN LATERAL unnest(
               COALESCE(c.preferred_template_ids, '{}'::uuid[])
               || COALESCE(c.random_template_ids, '{}'::uuid[])
             ) AS tid(template_id)
             JOIN template_tier tt ON tt.id = tid.template_id
            WHERE c.is_enabled = true
              AND NOT EXISTS (
                SELECT 1
                  FROM public.dev_player_configs d
                 WHERE d.user_id = c.user_id
                   AND d.is_enabled = true
              )
              AND NOT EXISTS (
                SELECT 1
                  FROM public.dev_player_profile_members m
                  JOIN public.dev_player_profiles p ON p.id = m.profile_id
                 WHERE m.user_id = c.user_id
                   AND p.engine_enabled = true
              )
         ),
         busy_users AS (
           SELECT DISTINCT t.player_user_id AS user_id, tt.stake_tier
             FROM public.tickets t
             JOIN public.rooms r ON r.id = t.room_id
             JOIN template_tier tt ON tt.id = r.room_template_id
            WHERE t.reservation_status IN ('reserved', 'confirmed', 'consumed')
              AND r.status IN ('waiting', 'playing', 'live', 'settling')
         )
         SELECT
           b.time_band,
           s.stake_tier,
           COUNT(e.user_id) FILTER (WHERE bu.user_id IS NULL)::text AS ready_count,
           COUNT(e.user_id) FILTER (WHERE bu.user_id IS NOT NULL)::text AS busy_count
           FROM unnest(ARRAY['midnight','dawn','morning','noon','afternoon','evening']::text[]) AS b(time_band)
           CROSS JOIN unnest(ARRAY['light','medium','heavy']::text[]) AS s(stake_tier)
           LEFT JOIN eligible e ON e.time_band = b.time_band AND e.stake_tier = s.stake_tier
           LEFT JOIN busy_users bu ON bu.user_id = e.user_id AND bu.stake_tier = s.stake_tier
          GROUP BY b.time_band, s.stake_tier`
      ),
      client.query<{
        active_leo_players: string;
        leo_room_count: string;
        non_leo_players: string;
      }>(
        `WITH active_seats AS (
           SELECT DISTINCT t.room_id, t.player_user_id
             FROM public.tickets t
             JOIN public.rooms r ON r.id = t.room_id
            WHERE t.reservation_status IN ('reserved', 'confirmed', 'consumed')
              AND r.status IN ('waiting', 'playing', 'live', 'settling')
         ),
         leo_users AS (
           SELECT user_id FROM public.leo_user_configs WHERE is_enabled = true
         ),
         leo_seats AS (
           SELECT a.room_id, a.player_user_id
             FROM active_seats a
             JOIN leo_users l ON l.user_id = a.player_user_id
         ),
         leo_rooms AS (
           SELECT DISTINCT room_id FROM leo_seats
         )
         SELECT
           (SELECT COUNT(DISTINCT player_user_id)::text FROM leo_seats) AS active_leo_players,
           (SELECT COUNT(*)::text FROM leo_rooms) AS leo_room_count,
           (
             SELECT COUNT(DISTINCT a.player_user_id)::text
               FROM active_seats a
               JOIN leo_rooms lr ON lr.room_id = a.room_id
               LEFT JOIN leo_users l ON l.user_id = a.player_user_id
              WHERE l.user_id IS NULL
           ) AS non_leo_players`
      ),
    ]);

    const settingsRow = settingsResult.rows[0];
    if (!settingsRow) {
      throw new Error("leo settings not found");
    }

    const liveStatsRow = liveStatsResult.rows[0];
    const liveStats: LeoLiveStats = {
      activeLeoPlayers: Number(liveStatsRow?.active_leo_players ?? 0),
      leoRoomCount: Number(liveStatsRow?.leo_room_count ?? 0),
      nonLeoPlayersInLeoRooms: Number(liveStatsRow?.non_leo_players ?? 0),
    };

    return {
      settings: mapSettings(settingsRow),
      enabledUserCount: Number(enabledResult.rows[0]?.count ?? 0),
      pendingEventCount: Number(pendingResult.rows[0]?.count ?? 0),
      bandCaps: mapBandCaps(
        bandCapResult.rows,
        new Map(
          bandStatResult.rows.map((row) => [
            `${row.time_band}:${row.stake_tier}`,
            {
              readyCount: Number(row.ready_count ?? 0),
              busyCount: Number(row.busy_count ?? 0),
            },
          ])
        )
      ),
      liveStats,
    };
  } finally {
    client.release();
  }
}

export async function patchLeoSettings(payload: {
  systemEnabled?: boolean;
  schedulerEnabled?: boolean;
}): Promise<LeoSettings> {
  const client = await connectPgWithRetry(pgPool);

  try {
    const { rows } = await client.query(
      `UPDATE public.leo_settings
          SET system_enabled = COALESCE($1, system_enabled),
              scheduler_enabled = COALESCE($2, scheduler_enabled),
              updated_at = now()
        WHERE id = true
        RETURNING system_enabled, scheduler_enabled, scheduler_tick_seconds,
                  processor_tick_seconds, timezone, max_leo_players_per_waiting_room,
                  max_leo_cards_per_join, updated_at`,
      [payload.systemEnabled ?? null, payload.schedulerEnabled ?? null]
    );
    return mapSettings(rows[0]);
  } finally {
    client.release();
  }
}

export async function saveLeoBandCaps(
  caps: Array<{ timeBand: LeoBandCap["timeBand"]; stakes: LeoBandStakeCapInput[] }>,
  maxLeoPlayersPerWaitingRoom: number,
  maxLeoCardsPerJoin: number
): Promise<{
  bandCaps: LeoBandCap[];
  maxLeoPlayersPerWaitingRoom: number;
  maxLeoCardsPerJoin: number;
}> {
  const client = await connectPgWithRetry(pgPool);
  let inTransaction = false;
  const perRoomCap = Math.max(0, Math.min(50, Math.floor(Number(maxLeoPlayersPerWaitingRoom) || 0)));
  const cardsCap = Math.max(0, Math.min(99, Math.floor(Number(maxLeoCardsPerJoin) || 0)));

  try {
    await client.query("BEGIN");
    inTransaction = true;
    await client.query(
      `UPDATE public.leo_settings
          SET max_leo_players_per_waiting_room = $1,
              max_leo_cards_per_join = $2,
              updated_at = now()
        WHERE id = true`,
      [perRoomCap, cardsCap]
    );
    for (const cap of caps) {
      if (!LEO_TIME_BANDS.includes(cap.timeBand)) {
        throw new Error("invalid time band");
      }
      const byTier = new Map(
        (cap.stakes ?? []).map((stake) => [stake.stakeTier, stake] as const)
      );
      const light = byTier.get("light");
      const medium = byTier.get("medium");
      const heavy = byTier.get("heavy");
      if (!light || !medium || !heavy) {
        throw new Error("stakes must include light, medium, and heavy");
      }
      const clampCap = (value: number) => Math.max(0, Math.min(500, Math.floor(Number(value) || 0)));
      const lightMax = clampCap(light.maxActivePlayers);
      const mediumMax = clampCap(medium.maxActivePlayers);
      const heavyMax = clampCap(heavy.maxActivePlayers);
      const anyShuffle = Boolean(light.shuffleEnabled || medium.shuffleEnabled || heavy.shuffleEnabled);
      const overallMax = Math.min(500, lightMax + mediumMax + heavyMax);
      await client.query(
        `INSERT INTO public.leo_band_caps (
           time_band,
           max_active_players, shuffle_enabled,
           light_max_active_players, light_shuffle_enabled,
           medium_max_active_players, medium_shuffle_enabled,
           heavy_max_active_players, heavy_shuffle_enabled,
           updated_at
         )
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, now())
         ON CONFLICT (time_band) DO UPDATE SET
           max_active_players = EXCLUDED.max_active_players,
           shuffle_enabled = EXCLUDED.shuffle_enabled,
           light_max_active_players = EXCLUDED.light_max_active_players,
           light_shuffle_enabled = EXCLUDED.light_shuffle_enabled,
           medium_max_active_players = EXCLUDED.medium_max_active_players,
           medium_shuffle_enabled = EXCLUDED.medium_shuffle_enabled,
           heavy_max_active_players = EXCLUDED.heavy_max_active_players,
           heavy_shuffle_enabled = EXCLUDED.heavy_shuffle_enabled,
           updated_at = now()`,
        [
          cap.timeBand,
          overallMax,
          anyShuffle,
          lightMax,
          Boolean(light.shuffleEnabled),
          mediumMax,
          Boolean(medium.shuffleEnabled),
          heavyMax,
          Boolean(heavy.shuffleEnabled),
        ]
      );
    }
    await client.query("COMMIT");
    inTransaction = false;
    console.log(
      `${LOG_PREFIX} saved band caps perRoomCap=${perRoomCap} cardsCap=${cardsCap} ${caps
        .map((cap) => {
          const parts = (cap.stakes ?? []).map(
            (stake) => `${stake.stakeTier}:${stake.maxActivePlayers}:${stake.shuffleEnabled ? "shuffle" : "static"}`
          );
          return `${cap.timeBand}[${parts.join("|")}]`;
        })
        .join(",")}`
    );

    const { rows } = await client.query<BandCapRow>(
      `SELECT time_band,
              light_max_active_players, light_shuffle_enabled,
              medium_max_active_players, medium_shuffle_enabled,
              heavy_max_active_players, heavy_shuffle_enabled
         FROM public.leo_band_caps
        ORDER BY time_band`
    );
    return {
      bandCaps: mapBandCaps(rows),
      maxLeoPlayersPerWaitingRoom: perRoomCap,
      maxLeoCardsPerJoin: cardsCap,
    };
  } catch (error) {
    if (inTransaction) {
      await client.query("ROLLBACK");
    }
    throw error;
  } finally {
    client.release();
  }
}

export async function loadLeoUsers(params?: {
  search?: string;
  operatorId?: string;
  limit?: number;
}): Promise<LeoUserListRow[]> {
  const client = await connectPgWithRetry(pgPool);
  const limit = Math.min(Math.max(params?.limit ?? 200, 1), 500);
  const search = params?.search?.trim().toLowerCase() ?? "";
  const operatorId = params?.operatorId?.trim() ?? "";

  try {
    const { rows } = await client.query<{
      user_id: string;
      username: string;
      display_name: string | null;
      role: string;
      leo_enabled: boolean;
      behavior_profile: string | null;
      applied_preset_name: string | null;
      dev_player_active: boolean;
    }>(
      `SELECT
         u.id AS user_id,
         u.username,
         COALESCE(p.nickname, u.username) AS display_name,
         u.role::text AS role,
         COALESCE(c.is_enabled, false) AS leo_enabled,
         c.behavior_profile,
         c.applied_preset_name,
         public.fn_user_has_active_dev_player(u.id) AS dev_player_active
       FROM public.users u
       LEFT JOIN public.user_profiles p ON p.user_id = u.id
       LEFT JOIN public.leo_user_configs c ON c.user_id = u.id
       WHERE u.role = 'player'
         AND u.status = 'active'
         AND ($1 = '' OR LOWER(u.username) LIKE '%' || $1 || '%')
         AND (
           $3 = ''
           OR u.id IN (
             SELECT pa.user_id
               FROM public.player_affiliation pa
              WHERE pa.super_id = $3::uuid OR pa.agent_id = $3::uuid
             UNION
             SELECT child.id
               FROM public.users child
              WHERE child.parent_id = $3::uuid
                AND child.role = 'player'
           )
         )
       ORDER BY COALESCE(c.is_enabled, false) DESC, u.username ASC
       LIMIT $2`,
      [search, limit, operatorId]
    );

    return rows.map((row) => ({
      userId: row.user_id,
      username: row.username,
      displayName: row.display_name ?? row.username,
      role: row.role,
      leoEnabled: row.leo_enabled,
      behaviorProfile: (row.behavior_profile as LeoBehaviorProfile | null) ?? null,
      appliedPresetName: row.applied_preset_name?.trim() || null,
      devPlayerActive: row.dev_player_active,
    }));
  } finally {
    client.release();
  }
}

export async function loadLeoUserDetail(userId: string): Promise<LeoUserDetail | null> {
  const client = await connectPgWithRetry(pgPool);

  try {
    const { rows } = await client.query<{
      user_id: string;
      username: string;
      display_name: string | null;
      is_enabled: boolean;
      active_time_bands: string[];
      behavior_profile: string;
      session_budget: string;
      hard_stop_loss: string;
      max_concurrent_tables: string;
      preferred_template_ids: string[];
      random_template_ids: string[];
      applied_preset_name: string | null;
      updated_at: string | null;
      dev_player_active: boolean;
    }>(
      `SELECT
         u.id AS user_id,
         u.username,
         COALESCE(p.nickname, u.username) AS display_name,
         COALESCE(c.is_enabled, false) AS is_enabled,
         COALESCE(c.active_time_bands, '{}'::text[]) AS active_time_bands,
         COALESCE(c.behavior_profile, 'methodical') AS behavior_profile,
         COALESCE(c.session_budget, 0) AS session_budget,
         COALESCE(c.hard_stop_loss, 0) AS hard_stop_loss,
         COALESCE(c.max_concurrent_tables, 0) AS max_concurrent_tables,
         COALESCE(c.preferred_template_ids, '{}'::uuid[]) AS preferred_template_ids,
         COALESCE(c.random_template_ids, '{}'::uuid[]) AS random_template_ids,
         c.applied_preset_name,
         c.updated_at,
         public.fn_user_has_active_dev_player(u.id) AS dev_player_active
       FROM public.users u
       LEFT JOIN public.user_profiles p ON p.user_id = u.id
       LEFT JOIN public.leo_user_configs c ON c.user_id = u.id
       WHERE u.id = $1`,
      [userId]
    );

    const row = rows[0];
    if (!row) return null;

    const devPlayerActive = row.dev_player_active;
    const config = mapUserConfig({
      user_id: row.user_id,
      is_enabled: row.is_enabled,
      active_time_bands: row.active_time_bands,
      behavior_profile: row.behavior_profile,
      session_budget: row.session_budget,
      hard_stop_loss: row.hard_stop_loss,
      max_concurrent_tables: row.max_concurrent_tables,
      preferred_template_ids: row.preferred_template_ids,
      random_template_ids: row.random_template_ids,
      applied_preset_name: row.applied_preset_name,
      updated_at: row.updated_at,
    });

    return {
      ...config,
      username: row.username,
      displayName: row.display_name ?? row.username,
      devPlayerActive,
      canEnableLeo: !devPlayerActive,
      conflictMessage: devPlayerActive ? CONFLICT_MESSAGE_FA : null,
    };
  } finally {
    client.release();
  }
}

export async function saveLeoUserConfig(params: {
  userId: string;
  payload: LeoSaveUserConfigPayload;
  updatedBy: string;
}): Promise<LeoUserDetail> {
  const client = await connectPgWithRetry(pgPool);

  if (!LEO_BEHAVIOR_PROFILES.includes(params.payload.behaviorProfile)) {
    throw new Error("invalid behavior profile");
  }

  for (const band of params.payload.activeTimeBands) {
    if (!LEO_TIME_BANDS.includes(band)) {
      throw new Error("invalid time band");
    }
  }

  try {
    if (params.payload.isEnabled) {
      const conflict = await checkDevPlayerConflict(client, params.userId);
      if (conflict) {
        const err = new Error("conflict_dev_player_active");
        throw err;
      }
    }

    await client.query(
      `INSERT INTO public.leo_user_configs (
         user_id, is_enabled, active_time_bands, behavior_profile,
         session_budget, hard_stop_loss, max_concurrent_tables,
         preferred_template_ids, random_template_ids, applied_preset_name, updated_by
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
       ON CONFLICT (user_id) DO UPDATE SET
         is_enabled = EXCLUDED.is_enabled,
         active_time_bands = EXCLUDED.active_time_bands,
         behavior_profile = EXCLUDED.behavior_profile,
         session_budget = EXCLUDED.session_budget,
         hard_stop_loss = EXCLUDED.hard_stop_loss,
         max_concurrent_tables = EXCLUDED.max_concurrent_tables,
         preferred_template_ids = EXCLUDED.preferred_template_ids,
         random_template_ids = EXCLUDED.random_template_ids,
         applied_preset_name = COALESCE(EXCLUDED.applied_preset_name, public.leo_user_configs.applied_preset_name),
         updated_by = EXCLUDED.updated_by,
         updated_at = now()`,
      [
        params.userId,
        params.payload.isEnabled,
        params.payload.activeTimeBands,
        params.payload.behaviorProfile,
        params.payload.sessionBudget,
        params.payload.hardStopLoss,
        params.payload.maxConcurrentTables,
        params.payload.preferredTemplateIds,
        params.payload.randomTemplateIds,
        params.payload.appliedPresetName?.trim().slice(0, 80) || null,
        params.updatedBy,
      ]
    );

    console.log(
      `${LOG_PREFIX} saved user=${params.userId} enabled=${params.payload.isEnabled} profile=${params.payload.behaviorProfile} preset=${params.payload.appliedPresetName ?? "-"}`
    );

    const detail = await loadLeoUserDetail(params.userId);
    if (!detail) throw new Error("user not found after save");
    return detail;
  } finally {
    client.release();
  }
}

function mapPresetRow(row: {
  id: string;
  name: string;
  source_user_id: string | null;
  source_display_name: string | null;
  is_enabled: boolean;
  active_time_bands: string[];
  behavior_profile: string;
  session_budget: string | number;
  hard_stop_loss: string | number;
  max_concurrent_tables: string | number;
  preferred_template_ids: string[];
  random_template_ids: string[];
  created_at: string | null;
  updated_at: string | null;
}): LeoConfigPreset {
  return {
    id: row.id,
    name: row.name,
    sourceUserId: row.source_user_id,
    sourceDisplayName: row.source_display_name,
    isEnabled: row.is_enabled,
    activeTimeBands: row.active_time_bands as LeoTimeBand[],
    behaviorProfile: row.behavior_profile as LeoBehaviorProfile,
    sessionBudget: Number(row.session_budget ?? 0),
    hardStopLoss: Number(row.hard_stop_loss ?? 0),
    maxConcurrentTables: Number(row.max_concurrent_tables ?? 0),
    preferredTemplateIds: row.preferred_template_ids ?? [],
    randomTemplateIds: row.random_template_ids ?? [],
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function loadLeoPresets(): Promise<LeoConfigPreset[]> {
  const client = await connectPgWithRetry(pgPool);

  try {
    const { rows } = await client.query<{
      id: string;
      name: string;
      source_user_id: string | null;
      source_display_name: string | null;
      is_enabled: boolean;
      active_time_bands: string[];
      behavior_profile: string;
      session_budget: string;
      hard_stop_loss: string;
      max_concurrent_tables: string;
      preferred_template_ids: string[];
      random_template_ids: string[];
      created_at: string | null;
      updated_at: string | null;
    }>(
      `SELECT
         p.id,
         p.name,
         p.source_user_id,
         COALESCE(up.nickname, su.username) AS source_display_name,
         p.is_enabled,
         p.active_time_bands,
         p.behavior_profile,
         p.session_budget,
         p.hard_stop_loss,
         p.max_concurrent_tables,
         p.preferred_template_ids,
         p.random_template_ids,
         p.created_at,
         p.updated_at
       FROM public.leo_config_presets p
       LEFT JOIN public.users su ON su.id = p.source_user_id
       LEFT JOIN public.user_profiles up ON up.user_id = p.source_user_id
       ORDER BY p.name ASC`
    );

    return rows.map(mapPresetRow);
  } finally {
    client.release();
  }
}

export async function createLeoPreset(params: {
  name: string;
  payload: LeoSaveUserConfigPayload;
  sourceUserId?: string | null;
  createdBy: string;
}): Promise<LeoConfigPreset> {
  const client = await connectPgWithRetry(pgPool);
  const name = params.name.trim();

  if (!name) {
    throw new Error("preset name is required");
  }

  if (!LEO_BEHAVIOR_PROFILES.includes(params.payload.behaviorProfile)) {
    throw new Error("invalid behavior profile");
  }

  for (const band of params.payload.activeTimeBands) {
    if (!LEO_TIME_BANDS.includes(band)) {
      throw new Error("invalid time band");
    }
  }

  try {
    const { rows } = await client.query<{
      id: string;
      name: string;
      source_user_id: string | null;
      source_display_name: string | null;
      is_enabled: boolean;
      active_time_bands: string[];
      behavior_profile: string;
      session_budget: string;
      hard_stop_loss: string;
      max_concurrent_tables: string;
      preferred_template_ids: string[];
      random_template_ids: string[];
      created_at: string | null;
      updated_at: string | null;
    }>(
      `INSERT INTO public.leo_config_presets (
         name,
         source_user_id,
         is_enabled,
         active_time_bands,
         behavior_profile,
         session_budget,
         hard_stop_loss,
         max_concurrent_tables,
         preferred_template_ids,
         random_template_ids,
         created_by
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
       RETURNING
         id,
         name,
         source_user_id,
         NULL::text AS source_display_name,
         is_enabled,
         active_time_bands,
         behavior_profile,
         session_budget,
         hard_stop_loss,
         max_concurrent_tables,
         preferred_template_ids,
         random_template_ids,
         created_at,
         updated_at`,
      [
        name,
        params.sourceUserId ?? null,
        params.payload.isEnabled,
        params.payload.activeTimeBands,
        params.payload.behaviorProfile,
        params.payload.sessionBudget,
        params.payload.hardStopLoss,
        params.payload.maxConcurrentTables,
        params.payload.preferredTemplateIds,
        params.payload.randomTemplateIds,
        params.createdBy,
      ]
    );

    const preset = mapPresetRow(rows[0]);
    console.log(`${LOG_PREFIX} preset created id=${preset.id} name=${preset.name}`);
    return preset;
  } catch (error: unknown) {
    if (
      error &&
      typeof error === "object" &&
      "code" in error &&
      (error as { code?: string }).code === "23505"
    ) {
      throw new Error("preset name already exists");
    }
    throw error;
  } finally {
    client.release();
  }
}

export async function createLeoPresetFromUser(params: {
  name: string;
  sourceUserId: string;
  createdBy: string;
}): Promise<LeoConfigPreset> {
  const detail = await loadLeoUserDetail(params.sourceUserId);
  if (!detail) {
    throw new Error("user not found");
  }

  return createLeoPreset({
    name: params.name,
    sourceUserId: params.sourceUserId,
    createdBy: params.createdBy,
    payload: {
      isEnabled: detail.isEnabled,
      activeTimeBands: detail.activeTimeBands,
      behaviorProfile: detail.behaviorProfile,
      sessionBudget: detail.sessionBudget,
      hardStopLoss: detail.hardStopLoss,
      maxConcurrentTables: detail.maxConcurrentTables,
      preferredTemplateIds: detail.preferredTemplateIds,
      randomTemplateIds: detail.randomTemplateIds,
    },
  });
}

export async function renameLeoPreset(params: {
  presetId: string;
  name: string;
}): Promise<LeoConfigPreset> {
  const name = params.name.trim();
  if (!name) {
    throw new Error("preset name is required");
  }
  if (name.length > 80) {
    throw new Error("preset name too long");
  }

  const client = await connectPgWithRetry(pgPool);

  try {
    await client.query("BEGIN");

    const existing = await client.query<{ name: string }>(
      `SELECT name FROM public.leo_config_presets WHERE id = $1::uuid FOR UPDATE`,
      [params.presetId]
    );
    const oldName = existing.rows[0]?.name;
    if (!oldName) {
      throw new Error("preset not found");
    }

    await client.query(
      `UPDATE public.leo_config_presets
          SET name = $2,
              updated_at = now()
        WHERE id = $1::uuid`,
      [params.presetId, name]
    );

    if (oldName !== name) {
      const renamed = await client.query(
        `UPDATE public.leo_user_configs
            SET applied_preset_name = $2,
                updated_at = now()
          WHERE applied_preset_name = $1`,
        [oldName, name]
      );
      console.log(
        `${LOG_PREFIX} preset renamed id=${params.presetId} from=${oldName} to=${name} users=${renamed.rowCount ?? 0}`
      );
    }

    await client.query("COMMIT");
  } catch (error: unknown) {
    await client.query("ROLLBACK").catch(() => {});
    if (
      error &&
      typeof error === "object" &&
      "code" in error &&
      (error as { code?: string }).code === "23505"
    ) {
      throw new Error("preset name already exists");
    }
    throw error;
  } finally {
    client.release();
  }

  const presets = await loadLeoPresets();
  const renamed = presets.find((item) => item.id === params.presetId);
  if (!renamed) {
    throw new Error("preset not found");
  }
  return renamed;
}

export async function deleteLeoPreset(presetId: string): Promise<void> {
  const client = await connectPgWithRetry(pgPool);

  try {
    const { rowCount } = await client.query(
      `DELETE FROM public.leo_config_presets WHERE id = $1::uuid`,
      [presetId]
    );

    if (!rowCount) {
      throw new Error("preset not found");
    }

    console.log(`${LOG_PREFIX} preset deleted id=${presetId}`);
  } finally {
    client.release();
  }
}

export async function loadLeoTemplates(): Promise<LeoTemplateOption[]> {
  const client = await connectPgWithRetry(pgPool);

  try {
    const { rows } = await client.query<{
      id: string;
      name: string;
      price: string | number;
      status: string;
      room_type: string;
    }>(
      `SELECT id, name, price, status, room_type
         FROM public.room_templates
        WHERE status = 'active'
          AND COALESCE(room_type, 'normal') <> 'tournament'
        ORDER BY price ASC, name ASC`
    );

    return rows.map((row) => ({
      id: row.id,
      name: row.name,
      price: Number(row.price ?? 0),
      status: row.status,
      roomType: row.room_type,
    }));
  } finally {
    client.release();
  }
}

export async function previewLeoTimeline(payload: LeoPreviewPayload): Promise<LeoPreviewResult> {
  const windowDate =
    payload.windowDate ??
    new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Tehran",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date());

  const result = generateWindowTimeline({
    windowDate,
    timeBand: payload.timeBand,
    config: {
      behaviorProfile: payload.behaviorProfile,
      sessionBudget: payload.sessionBudget,
      hardStopLoss: payload.hardStopLoss,
      maxConcurrentTables: payload.maxConcurrentTables ?? 0,
      preferredTemplateIds: payload.preferredTemplateIds,
      randomTemplateIds: payload.randomTemplateIds,
    },
  });

  const templateIds = [
    ...new Set(result.events.map((e) => e.templateId).filter(Boolean) as string[]),
  ];
  const templateNameById = new Map<string, string>();
  if (templateIds.length > 0) {
    const client = await connectPgWithRetry(pgPool);
    try {
      const { rows } = await client.query<{ id: string; name: string }>(
        `SELECT id, name FROM public.room_templates WHERE id = ANY($1::uuid[])`,
        [templateIds]
      );
      for (const row of rows) {
        templateNameById.set(row.id, row.name);
      }
    } finally {
      client.release();
    }
  }

  console.log(
    `${LOG_PREFIX} preview profile=${payload.behaviorProfile} band=${payload.timeBand} events=${result.events.length}`
  );

  return {
    windowDate,
    timeBand: payload.timeBand,
    timeBandLabel: LEO_TIME_BAND_LABELS[payload.timeBand],
    events: result.events.map((event) => ({
      sequence: event.sequence,
      eventType: event.eventType,
      scheduledAt: event.scheduledAt.toISOString(),
      sessionIndex: event.sessionIndex,
      tablePoolSource: event.tablePoolSource,
      templateId: event.templateId,
      templateName: event.templateId ? templateNameById.get(event.templateId) : undefined,
      cardCount: event.cardCount,
      concurrentJoinIndex: event.concurrentJoinIndex,
      concurrentJoinTotal: event.concurrentJoinTotal,
      label: event.label,
    })),
  };
}

export { LEO_PROFILE_LABELS, LEO_TIME_BAND_LABELS };
